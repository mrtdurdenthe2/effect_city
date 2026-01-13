import { Context, Effect, Layer, Ref, PubSub, Queue, Scope, Metric, Option } from "effect"
import { GridPosition } from "../domain/Grid.js"
import { Zone, ZoneId, ZoneType, ZoneDensity, ZoneStats } from "../domain/Zone.js"
import { GridService, GridServiceLive } from "./GridService.js"

// Metrics for zone tracking
const totalZonesGauge = Metric.gauge("zones.total", {
  description: "Total number of zones"
})

const residentialCellsGauge = Metric.gauge("zones.residential.cells", {
  description: "Number of residential zone cells"
})

const commercialCellsGauge = Metric.gauge("zones.commercial.cells", {
  description: "Number of commercial zone cells"
})

const industrialCellsGauge = Metric.gauge("zones.industrial.cells", {
  description: "Number of industrial zone cells"
})

const residentialDemandGauge = Metric.gauge("zones.residential.demand", {
  description: "Residential zone demand (0-100)"
})

const commercialDemandGauge = Metric.gauge("zones.commercial.demand", {
  description: "Commercial zone demand (0-100)"
})

const industrialDemandGauge = Metric.gauge("zones.industrial.demand", {
  description: "Industrial zone demand (0-100)"
})

// Events emitted by the zone service
export type ZoneEvent =
  | { readonly _tag: "ZoneCreated"; readonly zone: Zone }
  | { readonly _tag: "ZoneExpanded"; readonly zoneId: ZoneId; readonly position: GridPosition }
  | { readonly _tag: "ZoneShrunk"; readonly zoneId: ZoneId; readonly position: GridPosition }
  | { readonly _tag: "ZoneRemoved"; readonly zoneId: ZoneId }
  | { readonly _tag: "ZoneDensityChanged"; readonly zoneId: ZoneId; readonly density: ZoneDensity }
  | { readonly _tag: "DemandChanged"; readonly zoneType: ZoneType; readonly demand: number }

export class ZoneService extends Context.Tag("ZoneService")<
  ZoneService,
  {
    // Zone management
    readonly getZone: (id: ZoneId) => Effect.Effect<Option.Option<Zone>>
    readonly getZones: Effect.Effect<ReadonlyArray<Zone>>
    readonly getZonesByType: (type: ZoneType) => Effect.Effect<ReadonlyArray<Zone>>
    readonly getZoneAt: (position: GridPosition) => Effect.Effect<Option.Option<Zone>>

    // Zone painting
    readonly paintZone: (position: GridPosition, type: ZoneType) => Effect.Effect<Zone>
    readonly paintZoneArea: (
      topLeft: GridPosition,
      bottomRight: GridPosition,
      type: ZoneType
    ) => Effect.Effect<ReadonlyArray<Zone>>
    readonly clearZone: (position: GridPosition) => Effect.Effect<void>
    readonly clearZoneArea: (
      topLeft: GridPosition,
      bottomRight: GridPosition
    ) => Effect.Effect<void>

    // Zone properties
    readonly setDensity: (zoneId: ZoneId, density: ZoneDensity) => Effect.Effect<void>
    readonly getDemand: (type: ZoneType) => Effect.Effect<number>
    readonly setDemand: (type: ZoneType, demand: number) => Effect.Effect<void>

    // Queries
    readonly hasZone: (position: GridPosition) => Effect.Effect<boolean>
    readonly getZoneType: (position: GridPosition) => Effect.Effect<Option.Option<ZoneType>>
    readonly canBuildAt: (position: GridPosition) => Effect.Effect<boolean>
    readonly getAvailableCells: (zoneId: ZoneId) => Effect.Effect<ReadonlyArray<GridPosition>>

    // Statistics
    readonly getStats: Effect.Effect<ZoneStats>
    readonly getCellCountByType: (type: ZoneType) => Effect.Effect<number>

    // Simulation
    readonly tick: Effect.Effect<void>

    // Events
    readonly subscribe: Effect.Effect<Queue.Dequeue<ZoneEvent>, never, Scope.Scope>
  }
>() {}

// Generate unique zone ID
let zoneIdCounter = 0
const generateZoneId = (): ZoneId => {
  zoneIdCounter++
  return `zone-${Date.now()}-${zoneIdCounter}` as ZoneId
}

export const ZoneServiceLive = Layer.effect(
  ZoneService,
  Effect.gen(function* () {
    const grid = yield* GridService

    // Zone storage - map of zone ID to zone
    const zonesRef = yield* Ref.make<ReadonlyMap<string, Zone>>(new Map())

    // Position to zone ID mapping for quick lookups
    const positionToZoneRef = yield* Ref.make<ReadonlyMap<string, ZoneId>>(new Map())

    // Demand levels for each zone type
    const demandRef = yield* Ref.make<{ residential: number; commercial: number; industrial: number }>({
      residential: 50,
      commercial: 50,
      industrial: 50
    })

    const eventBus = yield* PubSub.unbounded<ZoneEvent>()

    // Update metrics
    const updateMetrics = Effect.gen(function* () {
      const zones = yield* Ref.get(zonesRef)
      const demand = yield* Ref.get(demandRef)

      let residentialCells = 0
      let commercialCells = 0
      let industrialCells = 0

      for (const zone of zones.values()) {
        switch (zone.type) {
          case "residential":
            residentialCells += zone.cells.length
            break
          case "commercial":
            commercialCells += zone.cells.length
            break
          case "industrial":
            industrialCells += zone.cells.length
            break
        }
      }

      yield* Metric.set(totalZonesGauge, zones.size)
      yield* Metric.set(residentialCellsGauge, residentialCells)
      yield* Metric.set(commercialCellsGauge, commercialCells)
      yield* Metric.set(industrialCellsGauge, industrialCells)
      yield* Metric.set(residentialDemandGauge, demand.residential)
      yield* Metric.set(commercialDemandGauge, demand.commercial)
      yield* Metric.set(industrialDemandGauge, demand.industrial)
    })

    // Find adjacent zone of same type
    const findAdjacentZone = (position: GridPosition, type: ZoneType) =>
      Effect.gen(function* () {
        const neighbors = position.neighbors()
        const positionToZone = yield* Ref.get(positionToZoneRef)
        const zones = yield* Ref.get(zonesRef)

        for (const neighbor of neighbors) {
          const zoneId = positionToZone.get(neighbor.toKey())
          if (zoneId) {
            const zone = zones.get(zoneId)
            if (zone && zone.type === type) {
              return Option.some(zone)
            }
          }
        }
        return Option.none()
      })

    // Get zone
    const getZone = (id: ZoneId) =>
      Effect.map(Ref.get(zonesRef), (zones) => Option.fromNullable(zones.get(id)))

    const getZones = Effect.map(Ref.get(zonesRef), (zones) => Array.from(zones.values()))

    const getZonesByType = (type: ZoneType) =>
      Effect.map(Ref.get(zonesRef), (zones) =>
        Array.from(zones.values()).filter((z) => z.type === type)
      )

    const getZoneAt = (position: GridPosition) =>
      Effect.gen(function* () {
        const positionToZone = yield* Ref.get(positionToZoneRef)
        const zoneId = positionToZone.get(position.toKey())
        if (!zoneId) return Option.none()
        return yield* getZone(zoneId)
      })

    // Paint a single cell as a zone
    const paintZone = (position: GridPosition, type: ZoneType) =>
      Effect.gen(function* () {
        // Check if position already has a zone
        const existing = yield* getZoneAt(position)
        if (Option.isSome(existing)) {
          return existing.value
        }

        // Check if cell can be zoned (not a road)
        const cell = yield* grid.getCell(position)
        if (cell.hasRoad) {
          // Return a dummy zone for roads (will be filtered)
          return Zone.create(generateZoneId(), type, position)
        }

        // Check for adjacent zone of same type to merge into
        const adjacentZone = yield* findAdjacentZone(position, type)

        let zone: Zone
        if (Option.isSome(adjacentZone)) {
          // Expand existing zone
          zone = adjacentZone.value.addCell(position)
          yield* Ref.update(zonesRef, (zones) => {
            const mutable = new Map(zones)
            mutable.set(zone.id, zone)
            return mutable
          })
          yield* PubSub.publish(eventBus, { _tag: "ZoneExpanded", zoneId: zone.id, position })
        } else {
          // Create new zone
          const id = generateZoneId()
          zone = Zone.create(id, type, position)
          yield* Ref.update(zonesRef, (zones) => {
            const mutable = new Map(zones)
            mutable.set(id, zone)
            return mutable
          })
          yield* PubSub.publish(eventBus, { _tag: "ZoneCreated", zone })
        }

        // Update position mapping
        yield* Ref.update(positionToZoneRef, (map) => {
          const mutable = new Map(map)
          mutable.set(position.toKey(), zone.id)
          return mutable
        })

        // Update grid cell
        yield* grid.paintZone(position, zone.id)

        yield* updateMetrics
        return zone
      })

    // Paint an area with zones
    const paintZoneArea = (topLeft: GridPosition, bottomRight: GridPosition, type: ZoneType) =>
      Effect.gen(function* () {
        const gridWidth = yield* grid.getWidth
        const gridHeight = yield* grid.getHeight

        const minX = Math.max(0, Math.min(topLeft.x, bottomRight.x))
        const maxX = Math.min(gridWidth - 1, Math.max(topLeft.x, bottomRight.x))
        const minY = Math.max(0, Math.min(topLeft.y, bottomRight.y))
        const maxY = Math.min(gridHeight - 1, Math.max(topLeft.y, bottomRight.y))

        const zones: Zone[] = []
        const seenZoneIds = new Set<string>()

        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const pos = GridPosition.create(x, y)
            const zone = yield* paintZone(pos, type)
            if (!seenZoneIds.has(zone.id)) {
              seenZoneIds.add(zone.id)
              zones.push(zone)
            }
          }
        }

        return zones
      })

    // Clear zone at position
    const clearZone = (position: GridPosition) =>
      Effect.gen(function* () {
        const positionToZone = yield* Ref.get(positionToZoneRef)
        const zoneId = positionToZone.get(position.toKey())

        if (!zoneId) return

        const zones = yield* Ref.get(zonesRef)
        const zone = zones.get(zoneId)

        if (!zone) return

        // Remove cell from zone
        const updatedZone = zone.removeCell(position)

        if (updatedZone.isEmpty()) {
          // Remove entire zone
          yield* Ref.update(zonesRef, (zones) => {
            const mutable = new Map(zones)
            mutable.delete(zoneId)
            return mutable
          })
          yield* PubSub.publish(eventBus, { _tag: "ZoneRemoved", zoneId })
        } else {
          // Update zone with removed cell
          yield* Ref.update(zonesRef, (zones) => {
            const mutable = new Map(zones)
            mutable.set(zoneId, updatedZone)
            return mutable
          })
          yield* PubSub.publish(eventBus, { _tag: "ZoneShrunk", zoneId, position })
        }

        // Remove position mapping
        yield* Ref.update(positionToZoneRef, (map) => {
          const mutable = new Map(map)
          mutable.delete(position.toKey())
          return mutable
        })

        // Clear grid cell
        yield* grid.clearZone(position)

        yield* updateMetrics
      })

    // Clear zone area
    const clearZoneArea = (topLeft: GridPosition, bottomRight: GridPosition) =>
      Effect.gen(function* () {
        const gridWidth = yield* grid.getWidth
        const gridHeight = yield* grid.getHeight

        const minX = Math.max(0, Math.min(topLeft.x, bottomRight.x))
        const maxX = Math.min(gridWidth - 1, Math.max(topLeft.x, bottomRight.x))
        const minY = Math.max(0, Math.min(topLeft.y, bottomRight.y))
        const maxY = Math.min(gridHeight - 1, Math.max(topLeft.y, bottomRight.y))

        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            yield* clearZone(GridPosition.create(x, y))
          }
        }
      })

    // Set zone density
    const setDensity = (zoneId: ZoneId, density: ZoneDensity) =>
      Effect.gen(function* () {
        yield* Ref.update(zonesRef, (zones) => {
          const zone = zones.get(zoneId)
          if (!zone) return zones
          const mutable = new Map(zones)
          mutable.set(zoneId, zone.withDensity(density))
          return mutable
        })
        yield* PubSub.publish(eventBus, { _tag: "ZoneDensityChanged", zoneId, density })
      })

    // Demand management
    const getDemand = (type: ZoneType) =>
      Effect.map(Ref.get(demandRef), (demand) => demand[type])

    const setDemand = (type: ZoneType, newDemand: number) =>
      Effect.gen(function* () {
        const clampedDemand = Math.max(0, Math.min(100, newDemand))
        yield* Ref.update(demandRef, (demand) => ({
          ...demand,
          [type]: clampedDemand
        }))
        yield* PubSub.publish(eventBus, { _tag: "DemandChanged", zoneType: type, demand: clampedDemand })
        yield* updateMetrics
      })

    // Queries
    const hasZone = (position: GridPosition) =>
      Effect.map(Ref.get(positionToZoneRef), (map) => map.has(position.toKey()))

    const getZoneType = (position: GridPosition) =>
      Effect.gen(function* () {
        const zone = yield* getZoneAt(position)
        return Option.map(zone, (z) => z.type)
      })

    const canBuildAt = (position: GridPosition) =>
      Effect.gen(function* () {
        const zone = yield* getZoneAt(position)
        if (Option.isNone(zone)) return false

        const cell = yield* grid.getCell(position)
        if (cell.hasBuilding()) return false

        const hasRoad = yield* grid.hasRoadAccess(position)
        return hasRoad
      })

    const getAvailableCells = (zoneId: ZoneId) =>
      Effect.gen(function* () {
        const zones = yield* Ref.get(zonesRef)
        const zone = zones.get(zoneId)
        if (!zone) return []

        const available: GridPosition[] = []
        for (const cellPos of zone.cells) {
          const cell = yield* grid.getCell(cellPos)
          if (!cell.hasBuilding()) {
            const hasRoad = yield* grid.hasRoadAccess(cellPos)
            if (hasRoad) {
              available.push(cellPos)
            }
          }
        }
        return available
      })

    // Statistics
    const getStats = Effect.gen(function* () {
      const zones = yield* Ref.get(zonesRef)
      const demand = yield* Ref.get(demandRef)

      let residentialZones = 0
      let commercialZones = 0
      let industrialZones = 0
      let residentialCells = 0
      let commercialCells = 0
      let industrialCells = 0

      for (const zone of zones.values()) {
        switch (zone.type) {
          case "residential":
            residentialZones++
            residentialCells += zone.cells.length
            break
          case "commercial":
            commercialZones++
            commercialCells += zone.cells.length
            break
          case "industrial":
            industrialZones++
            industrialCells += zone.cells.length
            break
        }
      }

      return new ZoneStats({
        residentialZones,
        commercialZones,
        industrialZones,
        totalZonedCells: residentialCells + commercialCells + industrialCells,
        residentialCells,
        commercialCells,
        industrialCells,
        residentialDemand: demand.residential,
        commercialDemand: demand.commercial,
        industrialDemand: demand.industrial
      })
    })

    const getCellCountByType = (type: ZoneType) =>
      Effect.gen(function* () {
        const zones = yield* Ref.get(zonesRef)
        let count = 0
        for (const zone of zones.values()) {
          if (zone.type === type) {
            count += zone.cells.length
          }
        }
        return count
      })

    // Simulation tick - adjust demand based on conditions
    const tick = Effect.gen(function* () {
      const stats = yield* getStats

      // Simple demand calculation:
      // - Residential demand increases if there are jobs (commercial + industrial)
      // - Commercial demand increases if there is population (residential)
      // - Industrial demand increases if there is commercial activity

      const residentialRatio = stats.residentialCells / Math.max(1, stats.totalZonedCells)
      const commercialRatio = stats.commercialCells / Math.max(1, stats.totalZonedCells)
      const industrialRatio = stats.industrialCells / Math.max(1, stats.totalZonedCells)

      // Target ratios: 60% residential, 25% commercial, 15% industrial
      const targetResidential = 0.6
      const targetCommercial = 0.25
      const targetIndustrial = 0.15

      const demand = yield* Ref.get(demandRef)

      // Adjust demand towards balance
      let newResidential = demand.residential
      let newCommercial = demand.commercial
      let newIndustrial = demand.industrial

      if (residentialRatio < targetResidential) {
        newResidential = Math.min(100, demand.residential + 2)
      } else if (residentialRatio > targetResidential + 0.1) {
        newResidential = Math.max(0, demand.residential - 1)
      }

      if (commercialRatio < targetCommercial && stats.residentialCells > 0) {
        newCommercial = Math.min(100, demand.commercial + 2)
      } else if (commercialRatio > targetCommercial + 0.1) {
        newCommercial = Math.max(0, demand.commercial - 1)
      }

      if (industrialRatio < targetIndustrial && commercialRatio > 0.1) {
        newIndustrial = Math.min(100, demand.industrial + 2)
      } else if (industrialRatio > targetIndustrial + 0.1) {
        newIndustrial = Math.max(0, demand.industrial - 1)
      }

      yield* Ref.set(demandRef, {
        residential: newResidential,
        commercial: newCommercial,
        industrial: newIndustrial
      })

      yield* updateMetrics
    })

    const subscribe = PubSub.subscribe(eventBus)

    // Initial metrics update
    yield* updateMetrics

    return {
      getZone,
      getZones,
      getZonesByType,
      getZoneAt,
      paintZone,
      paintZoneArea,
      clearZone,
      clearZoneArea,
      setDensity,
      getDemand,
      setDemand,
      hasZone,
      getZoneType,
      canBuildAt,
      getAvailableCells,
      getStats,
      getCellCountByType,
      tick,
      subscribe
    } as const
  })
)

// Layer that provides ZoneService with GridService dependency
export const ZoneServiceLayer = Layer.provide(ZoneServiceLive, GridServiceLive)
