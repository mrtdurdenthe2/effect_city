import { Context, Effect, Layer, Ref, PubSub, Queue, Scope, Random, Array as Arr, Option } from "effect"
import { GridPosition } from "../domain/Grid.js"
import {
  Business,
  BusinessId,
  BusinessType,
  BusinessSize,
  BusinessStats,
  BUSINESS_NAMES,
  ZONE_TO_BUSINESS_TYPE
} from "../domain/Business.js"
import { ZoneService } from "./ZoneService.js"
import { GridService } from "./GridService.js"
import { captureActivityTrace, withServiceSpan } from "./ServiceTrace.js"
import type { ServiceTraceMeta } from "./ServiceTrace.js"

// Events emitted by the business service
export type BusinessEvent =
  | { readonly _tag: "BusinessCreated"; readonly business: Business; readonly trace: ServiceTraceMeta }
  | { readonly _tag: "BusinessClosed"; readonly businessId: BusinessId; readonly trace: ServiceTraceMeta }
  | { readonly _tag: "EmployeeHired"; readonly businessId: BusinessId; readonly trace: ServiceTraceMeta }
  | { readonly _tag: "EmployeeLeft"; readonly businessId: BusinessId; readonly trace: ServiceTraceMeta }

export class BusinessService extends Context.Tag("BusinessService")<
  BusinessService,
  {
    // Business management
    readonly createBusiness: (
      position: GridPosition,
      zoneId: string,
      zoneType: "commercial" | "industrial"
    ) => Effect.Effect<Business>
    readonly closeBusiness: (id: BusinessId) => Effect.Effect<void>
    readonly getBusiness: (id: BusinessId) => Effect.Effect<Option.Option<Business>>
    readonly getBusinesses: Effect.Effect<ReadonlyArray<Business>>
    readonly getBusinessAt: (position: GridPosition) => Effect.Effect<Option.Option<Business>>

    // Employment
    readonly hireAt: (businessId: BusinessId) => Effect.Effect<boolean>
    readonly removeEmployeeAt: (businessId: BusinessId) => Effect.Effect<boolean>
    readonly getAvailableJobs: Effect.Effect<number>
    readonly getBusinessesWithJobs: Effect.Effect<ReadonlyArray<Business>>

    // Growth simulation - spawns businesses in available zones
    readonly simulateGrowth: Effect.Effect<number>

    // Stats
    readonly getStats: Effect.Effect<BusinessStats>

    // Events
    readonly subscribe: Effect.Effect<Queue.Dequeue<BusinessEvent>, never, Scope.Scope>
  }
>() {}

// Generate unique business IDs
let businessIdCounter = 0
const generateBusinessId = (): BusinessId => {
  businessIdCounter++
  return `biz-${businessIdCounter}` as BusinessId
}

export const BusinessServiceLive = Layer.effect(
  BusinessService,
  Effect.gen(function* () {
    const zoneService = yield* ZoneService
    const gridService = yield* GridService

    const businessesRef = yield* Ref.make<ReadonlyMap<string, Business>>(new Map())
    const positionToBusinessRef = yield* Ref.make<ReadonlyMap<string, BusinessId>>(new Map())
    const eventBus = yield* PubSub.unbounded<BusinessEvent>()

    const createBusiness = (
      position: GridPosition,
      zoneId: string,
      zoneType: "commercial" | "industrial"
    ) =>
      withServiceSpan(
        "BusinessService",
        "BusinessService.createBusiness",
        Effect.gen(function* () {
        // Pick a random business type for this zone
        const possibleTypes = ZONE_TO_BUSINESS_TYPE[zoneType]
        const typeIndex = yield* Random.nextIntBetween(0, possibleTypes.length)
        const businessType = possibleTypes[typeIndex] as BusinessType

        // Pick a random size (weighted towards small)
        const sizeRoll = yield* Random.next
        const size: BusinessSize = sizeRoll < 0.6 ? "small" : sizeRoll < 0.9 ? "medium" : "large"

        // Pick a random name
        const names = BUSINESS_NAMES[businessType]
        const nameIndex = yield* Random.nextIntBetween(0, names.length)
        const name = names[nameIndex]

        const id = generateBusinessId()
        const business = Business.create(id, name, businessType, size, position, zoneId)

        // Store business
        yield* Ref.update(businessesRef, (map) => {
          const mutable = new Map(map)
          mutable.set(id, business)
          return mutable
        })

        yield* Ref.update(positionToBusinessRef, (map) => {
          const mutable = new Map(map)
          mutable.set(position.toKey(), id)
          return mutable
        })

        // Place building on grid
        yield* gridService.placeBuilding(position, id)

        const trace = yield* captureActivityTrace("activity.BusinessCreated")
        yield* PubSub.publish(eventBus, { _tag: "BusinessCreated", business, trace })

        return business
      })
      )

    const closeBusiness = (id: BusinessId) =>
      withServiceSpan(
        "BusinessService",
        "BusinessService.closeBusiness",
        Effect.gen(function* () {
        const businesses = yield* Ref.get(businessesRef)
        const business = businesses.get(id)
        if (!business) return

        // Remove from grid
        yield* gridService.removeBuilding(business.position)

        // Remove from maps
        yield* Ref.update(businessesRef, (map) => {
          const mutable = new Map(map)
          mutable.delete(id)
          return mutable
        })

        yield* Ref.update(positionToBusinessRef, (map) => {
          const mutable = new Map(map)
          mutable.delete(business.position.toKey())
          return mutable
        })

        const trace = yield* captureActivityTrace("activity.BusinessClosed")
        yield* PubSub.publish(eventBus, { _tag: "BusinessClosed", businessId: id, trace })
      })
      )

    const getBusiness = (id: BusinessId) =>
      withServiceSpan(
        "BusinessService",
        "BusinessService.getBusiness",
        Effect.gen(function* () {
        const businesses = yield* Ref.get(businessesRef)
        const business = businesses.get(id)
        return business ? Option.some(business) : Option.none()
      })
      )

    const getBusinesses = withServiceSpan(
      "BusinessService",
      "BusinessService.getBusinesses",
      Effect.gen(function* () {
      const businesses = yield* Ref.get(businessesRef)
      return Array.from(businesses.values())
    })
    )

    const getBusinessAt = (position: GridPosition) =>
      withServiceSpan(
        "BusinessService",
        "BusinessService.getBusinessAt",
        Effect.gen(function* () {
        const positionToBusiness = yield* Ref.get(positionToBusinessRef)
        const businessId = positionToBusiness.get(position.toKey())
        if (!businessId) return Option.none()
        return yield* getBusiness(businessId)
      })
      )

    const hireAt = (businessId: BusinessId) =>
      withServiceSpan(
        "BusinessService",
        "BusinessService.hireAt",
        Effect.gen(function* () {
        const businesses = yield* Ref.get(businessesRef)
        const business = businesses.get(businessId)
        if (!business || business.isFull) return false

        yield* Ref.update(businessesRef, (map) => {
          const mutable = new Map(map)
          mutable.set(businessId, business.hire())
          return mutable
        })

        const trace = yield* captureActivityTrace("activity.EmployeeHired")
        yield* PubSub.publish(eventBus, { _tag: "EmployeeHired", businessId, trace })
        return true
      })
      )

    const removeEmployeeAt = (businessId: BusinessId) =>
      withServiceSpan(
        "BusinessService",
        "BusinessService.removeEmployeeAt",
        Effect.gen(function* () {
        const businesses = yield* Ref.get(businessesRef)
        const business = businesses.get(businessId)
        if (!business || business.employeeCount <= 0) return false

        yield* Ref.update(businessesRef, (map) => {
          const mutable = new Map(map)
          mutable.set(businessId, business.removeEmployee())
          return mutable
        })

        const trace = yield* captureActivityTrace("activity.EmployeeLeft")
        yield* PubSub.publish(eventBus, { _tag: "EmployeeLeft", businessId, trace })
        return true
      })
      )

    const getAvailableJobs = withServiceSpan(
      "BusinessService",
      "BusinessService.getAvailableJobs",
      Effect.gen(function* () {
      const businesses = yield* Ref.get(businessesRef)
      let total = 0
      for (const business of businesses.values()) {
        total += business.availableJobs
      }
      return total
    })
    )

    const getBusinessesWithJobs = withServiceSpan(
      "BusinessService",
      "BusinessService.getBusinessesWithJobs",
      Effect.gen(function* () {
      const businesses = yield* Ref.get(businessesRef)
      return Arr.filter(Array.from(businesses.values()), (b) => b.availableJobs > 0)
    })
    )

    const simulateGrowth = withServiceSpan(
      "BusinessService",
      "BusinessService.simulateGrowth",
      Effect.gen(function* () {
      // Get all zones that could have businesses
      const commercialZones = yield* zoneService.getZonesByType("commercial")
      const industrialZones = yield* zoneService.getZonesByType("industrial")

      const positionToBusiness = yield* Ref.get(positionToBusinessRef)
      let created = 0

      // Try to spawn businesses in commercial zones
      for (const zone of commercialZones) {
        // 20% chance to try spawning per zone per tick
        const shouldTry = yield* Random.next
        if (shouldTry > 0.2) continue

        // Find an available cell in this zone (no building yet)
        for (const cell of zone.cells) {
          if (!positionToBusiness.has(cell.toKey())) {
            // Check if grid cell doesn't have a building
            const gridCell = yield* gridService.getCell(cell)
            if (!gridCell.hasBuilding() && gridCell.isZoned()) {
              yield* createBusiness(cell, zone.id, "commercial")
              created++
              break // Only one business per zone per tick
            }
          }
        }
      }

      // Try to spawn businesses in industrial zones
      for (const zone of industrialZones) {
        const shouldTry = yield* Random.next
        if (shouldTry > 0.15) continue // 15% chance for industrial

        for (const cell of zone.cells) {
          if (!positionToBusiness.has(cell.toKey())) {
            const gridCell = yield* gridService.getCell(cell)
            if (!gridCell.hasBuilding() && gridCell.isZoned()) {
              yield* createBusiness(cell, zone.id, "industrial")
              created++
              break
            }
          }
        }
      }

      return created
    })
    )

    const getStats = withServiceSpan(
      "BusinessService",
      "BusinessService.getStats",
      Effect.gen(function* () {
      const businesses = yield* Ref.get(businessesRef)

      let retailCount = 0
      let officeCount = 0
      let factoryCount = 0
      let warehouseCount = 0
      let totalJobCapacity = 0
      let totalEmployees = 0

      for (const business of businesses.values()) {
        switch (business.type) {
          case "retail":
            retailCount++
            break
          case "office":
            officeCount++
            break
          case "factory":
            factoryCount++
            break
          case "warehouse":
            warehouseCount++
            break
        }
        totalJobCapacity += business.jobCapacity
        totalEmployees += business.employeeCount
      }

      return new BusinessStats({
        totalBusinesses: businesses.size,
        retailCount,
        officeCount,
        factoryCount,
        warehouseCount,
        totalJobCapacity,
        totalEmployees,
        availableJobs: totalJobCapacity - totalEmployees
      })
    })
    )

    const subscribe = PubSub.subscribe(eventBus)

    return {
      createBusiness,
      closeBusiness,
      getBusiness,
      getBusinesses,
      getBusinessAt,
      hireAt,
      removeEmployeeAt,
      getAvailableJobs,
      getBusinessesWithJobs,
      simulateGrowth,
      getStats,
      subscribe
    } as const
  })
)
