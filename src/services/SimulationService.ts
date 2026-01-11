import { Context, Effect, Layer, Ref, PubSub, Queue, Scope } from "effect"
import { Clock, ClockLive, type ClockState, type GameSpeed } from "../core/Clock.js"
import { GameLoop, GameLoopLive } from "../core/GameLoop.js"
import { PopulationService, PopulationServiceLive } from "./PopulationService.js"
import { EconomyService, EconomyServiceLive, type BuildingCounts } from "./EconomyService.js"
import { type PopulationStats } from "../domain/Citizen.js"
import { type Treasury, type IncomeReport, type ExpenseReport } from "../domain/Economy.js"

// Simulation configuration
export interface SimulationConfig {
  readonly availableHomes: number
  readonly availableJobs: number
  readonly buildings: BuildingCounts
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

    const configRef = yield* Ref.make<SimulationConfig>({
      availableHomes: 10,
      availableJobs: 5,
      buildings: { residential: 5, commercial: 2, industrial: 1 },
      utilityCosts: 50
    })

    const lastStatsRef = yield* Ref.make<SimulationStats | null>(null)
    const eventBus = yield* PubSub.unbounded<SimulationEvent>()

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

      // 2. Simulate population growth
      const newArrivals = yield* population.simulateGrowth(config.availableHomes, config.availableJobs)

      if (newArrivals > 0) {
        yield* PubSub.publish(eventBus, { _tag: "CitizensArrived", count: newArrivals })
      }

      // 3. Run economy tick (collect taxes, pay expenses)
      const populationStats = yield* population.getStats
      const { income, expenses } = yield* economy.tick(
        populationStats.total,
        config.buildings,
        config.utilityCosts
      )

      yield* PubSub.publish(eventBus, { _tag: "TaxesCollected", income })
      yield* PubSub.publish(eventBus, { _tag: "ExpensesPaid", expenses })

      // 4. Get final stats
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
        buildings: config.buildings ?? current.buildings
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

// Internal layer for SimulationService dependencies
const SimulationDeps = Layer.mergeAll(
  GameLoopLive.pipe(Layer.provide(ClockLive)),
  ClockLive,
  PopulationServiceLive,
  EconomyServiceLive
)

// Combined layer that provides SimulationService, PopulationService, and EconomyService
export const SimulationLayer = Layer.mergeAll(
  SimulationServiceLive.pipe(Layer.provide(SimulationDeps)),
  PopulationServiceLive,
  EconomyServiceLive
)
