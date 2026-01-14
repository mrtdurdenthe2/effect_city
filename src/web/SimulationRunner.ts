import { Effect, Layer, Stream, Option } from "effect"
import { GridService, GridServiceLive } from "../services/GridService.js"
import { ZoneService, ZoneServiceLive } from "../services/ZoneService.js"
import { RoadService, RoadServiceLive } from "../services/RoadService.js"
import { SimulationService, SimulationLayer } from "../services/SimulationService.js"
import { Clock, ClockLive } from "../core/Clock.js"
import type { EventEmitter } from "./EventEmitter.js"
import type { Zone } from "../domain/Zone.js"
import type {
  SerializedCell,
  SerializedZone,
  SerializedSimulationStats,
  ClockState
} from "../shared/MessageProtocol.js"

// Combined layer for all services
const AppLayer = Layer.mergeAll(
  GridServiceLive,
  ZoneServiceLive.pipe(Layer.provide(GridServiceLive)),
  RoadServiceLive.pipe(Layer.provide(GridServiceLive)),
  SimulationLayer,
  ClockLive
)

export class SimulationRunner {
  constructor(private readonly eventEmitter: EventEmitter) {}

  start(): void {
    const emitter = this.eventEmitter
    console.log("SimulationRunner starting...")

    const program = Effect.gen(function* () {
      console.log("Effect program starting...")
      const grid = yield* GridService
      const zone = yield* ZoneService
      const road = yield* RoadService
      const simulation = yield* SimulationService
      const clock = yield* Clock

      // Start simulation
      yield* simulation.start

      // Send initial state
      const cells = yield* grid.getCells
      const zones = yield* zone.getZones
      const stats = yield* simulation.getStats
      const clockState = yield* clock.getState
      const zoneStats = yield* zone.getStats
      const gridStats = yield* grid.getStats

      // Build zone lookup
      const zoneMap = new Map<string, Zone>()
      for (const z of zones) {
        zoneMap.set(z.id, z)
      }

      const serializedCells: SerializedCell[] = []
      for (const cell of cells.values()) {
        let zoneType: "residential" | "commercial" | "industrial" | undefined
        if (Option.isSome(cell.zoneId)) {
          const z = zoneMap.get(cell.zoneId.value)
          if (z) zoneType = z.type
        }
        const roadType = yield* road.getRoadType(cell.position)
        serializedCells.push({
          x: cell.position.x,
          y: cell.position.y,
          contentType: cell.contentType,
          zoneId: cell.zoneId,
          zoneType: zoneType ? Option.some(zoneType) : Option.none(),
          buildingId: cell.buildingId,
          roadType
        })
      }

      const serializedZones: SerializedZone[] = zones.map((z) => ({
        id: z.id,
        type: z.type,
        density: z.density,
        cells: z.cells.map((c) => ({ x: c.x, y: c.y })),
        demand: z.demand,
        buildingCount: z.buildingCount
      }))

      const serializedStats: SerializedSimulationStats = {
        tickCount: stats.tickCount,
        population: {
          total: stats.population.total,
          employed: stats.population.employed,
          unemployed: stats.population.unemployed,
          homeless: stats.population.homeless,
          averageHappiness: stats.population.averageHappiness
        },
        treasury: {
          balance: stats.treasury.balance,
          lastIncome: stats.treasury.lastIncome.total,
          lastExpenses: stats.treasury.lastExpenses.total
        },
        zones: {
          residentialCells: zoneStats.residentialCells,
          commercialCells: zoneStats.commercialCells,
          industrialCells: zoneStats.industrialCells,
          residentialDemand: zoneStats.residentialDemand,
          commercialDemand: zoneStats.commercialDemand,
          industrialDemand: zoneStats.industrialDemand
        },
        grid: {
          totalCells: gridStats.totalCells,
          roadCells: gridStats.roadCells,
          buildingCells: gridStats.buildingCells
        }
      }

      const serializedClock: ClockState = {
        isPaused: clockState.isPaused,
        speed: clockState.speed,
        tickCount: clockState.tickCount
      }

      // Delay initial state emission to allow React to mount and subscribe
      yield* Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 50)))

      console.log("Emitting initial state...", { cellCount: serializedCells.length })
      emitter.emit({
        type: "server:message",
        data: {
          type: "initial_state",
          grid: serializedCells,
          zones: serializedZones,
          stats: serializedStats,
          clock: serializedClock
        }
      })
      console.log("Initial state emitted")

      // Subscribe to events and emit them
      return yield* Effect.scoped(
        Effect.gen(function* () {
          const gridEvents = yield* grid.subscribe
          const simEvents = yield* simulation.subscribe
          const clockEvents = yield* clock.subscribe

          // Grid events
          yield* Effect.fork(
            Stream.fromQueue(gridEvents).pipe(
              Stream.runForEach((event) =>
                Effect.gen(function* () {
                  if (event._tag === "CellUpdated") {
                    const zoneOpt = yield* zone.getZoneAt(event.position)
                    const zt = Option.isSome(zoneOpt) ? zoneOpt.value.type : undefined
                    const rt = yield* road.getRoadType(event.position)

                    emitter.emit({
                      type: "server:message",
                      data: {
                        type: "cell_updated",
                        x: event.position.x,
                        y: event.position.y,
                        contentType: event.cell.contentType,
                        zoneType: zt ? Option.some(zt) : Option.none(),
                        zoneId: event.cell.zoneId,
                        buildingId: event.cell.buildingId,
                        roadType: rt
                      }
                    })
                  }
                })
              )
            )
          )

          // Simulation tick events
          yield* Effect.fork(
            Stream.fromQueue(simEvents).pipe(
              Stream.runForEach((event) =>
                Effect.gen(function* () {
                  if (event._tag === "TickCompleted") {
                    const zs = yield* zone.getStats
                    const gs = yield* grid.getStats

                    const tickStats: SerializedSimulationStats = {
                      tickCount: event.stats.tickCount,
                      population: {
                        total: event.stats.population.total,
                        employed: event.stats.population.employed,
                        unemployed: event.stats.population.unemployed,
                        homeless: event.stats.population.homeless,
                        averageHappiness: event.stats.population.averageHappiness
                      },
                      treasury: {
                        balance: event.stats.treasury.balance,
                        lastIncome: event.stats.treasury.lastIncome.total,
                        lastExpenses: event.stats.treasury.lastExpenses.total
                      },
                      zones: {
                        residentialCells: zs.residentialCells,
                        commercialCells: zs.commercialCells,
                        industrialCells: zs.industrialCells,
                        residentialDemand: zs.residentialDemand,
                        commercialDemand: zs.commercialDemand,
                        industrialDemand: zs.industrialDemand
                      },
                      grid: {
                        totalCells: gs.totalCells,
                        roadCells: gs.roadCells,
                        buildingCells: gs.buildingCells
                      }
                    }

                    emitter.emit({
                      type: "server:message",
                      data: {
                        type: "simulation_tick",
                        stats: tickStats
                      }
                    })
                  }
                })
              )
            )
          )

          // Clock events
          yield* Effect.fork(
            Stream.fromQueue(clockEvents).pipe(
              Stream.runForEach(() =>
                Effect.gen(function* () {
                  const state = yield* clock.getState
                  emitter.emit({
                    type: "server:message",
                    data: {
                      type: "clock_state",
                      clock: {
                        isPaused: state.isPaused,
                        speed: state.speed,
                        tickCount: state.tickCount
                      }
                    }
                  })
                })
              )
            )
          )

          return yield* Effect.never
        })
      )
    }).pipe(
      Effect.provide(AppLayer),
      Effect.catchAll((error) => {
        console.error("SimulationRunner error:", error)
        return Effect.void
      })
    )

    Effect.runFork(program)
  }

  togglePause(): void {
    Effect.runPromise(
      Effect.gen(function* () {
        const sim = yield* SimulationService
        yield* sim.togglePause
      }).pipe(Effect.provide(AppLayer))
    )
  }

  setSpeed(speed: 1 | 2 | 3): void {
    Effect.runPromise(
      Effect.gen(function* () {
        const sim = yield* SimulationService
        yield* sim.setSpeed(speed)
      }).pipe(Effect.provide(AppLayer))
    )
  }

  stop(): void {
    // The fiber will be interrupted when the page unloads
  }
}
