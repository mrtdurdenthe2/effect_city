import { Context, Effect, Layer, Ref, PubSub, Queue, Scope, Option } from "effect"
import { Clock, ClockLive, type ClockState, type GameSpeed } from "../core/Clock.js"
import { GameLoop, GameLoopLive } from "../core/GameLoop.js"
import { PopulationService, PopulationServiceLive } from "./PopulationService.js"
import { EconomyService, EconomyServiceLive, type BuildingCounts } from "./EconomyService.js"
import { BusinessService, BusinessServiceLive } from "./BusinessService.js"
import { GridServiceLive } from "./GridService.js"
import { ZoneServiceLive } from "./ZoneService.js"
import { type PopulationStats, type CitizenId, BuildingId } from "../domain/Citizen.js"
import { type Treasury, type IncomeReport, type ExpenseReport } from "../domain/Economy.js"

// Simulation configuration
export interface SimulationConfig {
  readonly residentialBuildingIds: ReadonlyArray<string>  // IDs of residential buildings for housing
  readonly citizensPerHome: number  // How many citizens per residential building
  readonly utilityCosts: number
}

// Events emitted by the simulation
export type SimulationEvent =
  | { readonly _tag: "TickStarted"; readonly tickCount: number }
  | { readonly _tag: "TickCompleted"; readonly tickCount: number; readonly stats: SimulationStats }
  | { readonly _tag: "CitizensArrived"; readonly count: number }
  | { readonly _tag: "CitizensLeft"; readonly count: number }
  | { readonly _tag: "TaxesCollected"; readonly income: IncomeReport }
  | { readonly _tag: "ExpensesPaid"; readonly expenses: ExpenseReport }

// Combined stats for a tick
export interface SimulationStats {
  readonly tickCount: number
  readonly population: PopulationStats
  readonly treasury: Treasury
  readonly newArrivals: number
  readonly departures: number
}

export class SimulationService extends Context.Tag("SimulationService")<
  SimulationService,
  {
    // Lifecycle
    readonly start: Effect.Effect<void>
    readonly stop: Effect.Effect<void>
    readonly isRunning: Effect.Effect<boolean>

    // Clock controls
    readonly pause: Effect.Effect<void>
    readonly resume: Effect.Effect<void>
    readonly togglePause: Effect.Effect<void>
    readonly setSpeed: (speed: GameSpeed) => Effect.Effect<void>
    readonly getClockState: Effect.Effect<ClockState>

    // Configuration
    readonly setConfig: (config: Partial<SimulationConfig>) => Effect.Effect<void>
    readonly getConfig: Effect.Effect<SimulationConfig>

    // Stats
    readonly getStats: Effect.Effect<SimulationStats>
    readonly getLastTickStats: Effect.Effect<SimulationStats | null>

    // Events
    readonly subscribe: Effect.Effect<Queue.Dequeue<SimulationEvent>, never, Scope.Scope>

    // Manual tick (for testing/demos)
    readonly runTick: Effect.Effect<SimulationStats>
  }
>() {}

export const SimulationServiceLive = Layer.effect(
  SimulationService,
  Effect.gen(function* () {
    const clock = yield* Clock
    const gameLoop = yield* GameLoop
    const population = yield* PopulationService
    const economy = yield* EconomyService
    const business = yield* BusinessService

    const configRef = yield* Ref.make<SimulationConfig>({
      residentialBuildingIds: [],
      citizensPerHome: 4,
      utilityCosts: 20
    })

    // Track which citizens live in which buildings
    const homeAssignmentsRef = yield* Ref.make<ReadonlyMap<string, number>>(new Map()) // buildingId -> citizen count

    const lastStatsRef = yield* Ref.make<SimulationStats | null>(null)
    const eventBus = yield* PubSub.unbounded<SimulationEvent>()

    // Helper to find available home
    const findAvailableHome = Effect.gen(function* () {
      const config = yield* Ref.get(configRef)
      const assignments = yield* Ref.get(homeAssignmentsRef)

      for (const buildingId of config.residentialBuildingIds) {
        const count = assignments.get(buildingId) ?? 0
        if (count < config.citizensPerHome) {
          return Option.some(buildingId)
        }
      }
      return Option.none()
    })

    // Helper to assign citizen to home
    const assignCitizenToHome = (citizenId: CitizenId) =>
      Effect.gen(function* () {
        const homeOpt = yield* findAvailableHome
        if (Option.isNone(homeOpt)) return false

        const buildingId = homeOpt.value as BuildingId
        yield* population.assignHome(citizenId, buildingId)

        yield* Ref.update(homeAssignmentsRef, (map) => {
          const mutable = new Map(map)
          const count = mutable.get(buildingId) ?? 0
          mutable.set(buildingId, count + 1)
          return mutable
        })
        return true
      })

    // Helper to assign citizen to job
    const assignCitizenToJob = (citizenId: CitizenId) =>
      Effect.gen(function* () {
        const businessesWithJobs = yield* business.getBusinessesWithJobs
        if (businessesWithJobs.length === 0) return false

        // Pick first available business
        const biz = businessesWithJobs[0]
        yield* business.hireAt(biz.id)
        yield* population.assignWorkplace(citizenId, biz.id as unknown as BuildingId)
        return true
      })

    // Core simulation tick logic
    const executeTick = Effect.gen(function* () {
      const tickCount = yield* clock.getTickCount
      const config = yield* Ref.get(configRef)

      // Emit tick started
      yield* PubSub.publish(eventBus, { _tag: "TickStarted", tickCount })

      // Get population before tick
      const beforeStats = yield* population.getStats

      // 1. Run population happiness/attrition tick
      yield* population.tick

      // Get stats after tick to see departures
      const afterTickStats = yield* population.getStats
      const departures = beforeStats.total - afterTickStats.total

      if (departures > 0) {
        yield* PubSub.publish(eventBus, { _tag: "CitizensLeft", count: departures })
      }

      // 2. Simulate business growth (spawn new businesses)
      yield* business.simulateGrowth

      // 3. Calculate available homes and jobs
      const assignments = yield* Ref.get(homeAssignmentsRef)
      let availableHomes = 0
      for (const buildingId of config.residentialBuildingIds) {
        const count = assignments.get(buildingId) ?? 0
        availableHomes += Math.max(0, config.citizensPerHome - count)
      }
      const availableJobs = yield* business.getAvailableJobs

      // 4. Simulate population growth
      const newArrivals = yield* population.simulateGrowth(availableHomes, availableJobs)

      if (newArrivals > 0) {
        yield* PubSub.publish(eventBus, { _tag: "CitizensArrived", count: newArrivals })
      }

      // 5. Assign homes and jobs to homeless/unemployed citizens
      const citizens = yield* population.getCitizens
      for (const citizen of citizens) {
        // Assign home if homeless
        if (Option.isNone(citizen.homeId)) {
          yield* assignCitizenToHome(citizen.id)
        }
        // Assign job if unemployed
        if (citizen.employment === "unemployed") {
          yield* assignCitizenToJob(citizen.id)
        }
      }

      // 6. Run economy tick (collect taxes, pay expenses)
      const businessStats = yield* business.getStats
      const populationStats = yield* population.getStats

      // Calculate building counts from zones and businesses
      const buildingCounts: BuildingCounts = {
        residential: config.residentialBuildingIds.length,
        commercial: businessStats.retailCount + businessStats.officeCount,
        industrial: businessStats.factoryCount + businessStats.warehouseCount
      }

      const { income, expenses } = yield* economy.tick(
        populationStats.total,
        buildingCounts,
        config.utilityCosts
      )

      yield* PubSub.publish(eventBus, { _tag: "TaxesCollected", income })
      yield* PubSub.publish(eventBus, { _tag: "ExpensesPaid", expenses })

      // 7. Get final stats
      const finalPopStats = yield* population.getStats
      const treasury = yield* economy.getTreasury

      const stats: SimulationStats = {
        tickCount,
        population: finalPopStats,
        treasury,
        newArrivals,
        departures
      }

      yield* Ref.set(lastStatsRef, stats)
      yield* PubSub.publish(eventBus, { _tag: "TickCompleted", tickCount, stats })

      return stats
    })

    // Register tick handler with game loop
    yield* gameLoop.onTick(() => executeTick.pipe(Effect.asVoid))

    // Public API
    const start = gameLoop.start
    const stop = gameLoop.stop
    const isRunning = gameLoop.isRunning

    const pause = clock.pause
    const resume = clock.resume
    const togglePause = clock.togglePause
    const setSpeed = clock.setSpeed
    const getClockState = clock.getState

    const setConfig = (config: Partial<SimulationConfig>) =>
      Ref.update(configRef, (current) => ({
        ...current,
        ...config,
        residentialBuildingIds: config.residentialBuildingIds ?? current.residentialBuildingIds
      }))

    const getConfig = Ref.get(configRef)

    const getStats = Effect.gen(function* () {
      const tickCount = yield* clock.getTickCount
      const populationStats = yield* population.getStats
      const treasury = yield* economy.getTreasury
      const last = yield* Ref.get(lastStatsRef)

      return {
        tickCount,
        population: populationStats,
        treasury,
        newArrivals: last?.newArrivals ?? 0,
        departures: last?.departures ?? 0
      }
    })

    const getLastTickStats = Ref.get(lastStatsRef)

    const subscribe = PubSub.subscribe(eventBus)

    const runTick = executeTick

    return {
      start,
      stop,
      isRunning,
      pause,
      resume,
      togglePause,
      setSpeed,
      getClockState,
      setConfig,
      getConfig,
      getStats,
      getLastTickStats,
      subscribe,
      runTick
    } as const
  })
)

// Base services layer (Grid and Zone)
const BaseServicesLayer = Layer.mergeAll(
  GridServiceLive,
  ZoneServiceLive.pipe(Layer.provide(GridServiceLive))
)

// Business layer depends on base services
const BusinessLayer = BusinessServiceLive.pipe(
  Layer.provide(BaseServicesLayer)
)

// Internal layer for SimulationService dependencies
const SimulationDeps = Layer.mergeAll(
  GameLoopLive.pipe(Layer.provide(ClockLive)),
  ClockLive,
  PopulationServiceLive,
  EconomyServiceLive,
  BusinessLayer,
  BaseServicesLayer
)

// Combined layer that provides all simulation services
export const SimulationLayer = Layer.mergeAll(
  SimulationServiceLive.pipe(Layer.provide(SimulationDeps)),
  PopulationServiceLive,
  EconomyServiceLive,
  BusinessLayer,
  BaseServicesLayer
)
