import { Effect, Layer, Stream, Option } from "effect"
import { GridPosition } from "../domain/Grid.js"
import { GridService } from "../services/GridService.js"
import { ZoneService } from "../services/ZoneService.js"
import { RoadService, RoadServiceLive } from "../services/RoadService.js"
import { SimulationService, SimulationLayer } from "../services/SimulationService.js"
import { MetricsService, MetricsServiceLive } from "../services/MetricsService.js"
import { BusinessService } from "../services/BusinessService.js"
import { EconomyService } from "../services/EconomyService.js"
import { Clock, ClockLive } from "../core/Clock.js"
import type { EventEmitter } from "./EventEmitter.js"
import type { Zone } from "../domain/Zone.js"
import type {
  SerializedCell,
  SerializedZone,
  SerializedSimulationStats,
  ClockState,
  MetricsSnapshot,
  ActivityEvent
} from "../shared/MessageProtocol.js"

// Combined layer for all services
// SimulationLayer includes Grid, Zone, Business, Population, Economy services
const BaseLayer = SimulationLayer

// Add Road service and Metrics service on top (depends on GridService from SimulationLayer)
const AppLayer = Layer.mergeAll(
  BaseLayer,
  RoadServiceLive.pipe(Layer.provide(BaseLayer)),
  MetricsServiceLive,
  ClockLive
)

// Store reference to metrics service for external access
type MetricsServiceApi = {
  getSerializedHistory: (count: number) => Effect.Effect<{
    snapshots: ReadonlyArray<{ tick: number; timestamp: number; metrics: ReadonlyArray<{ name: string; value: number; tags: ReadonlyArray<{ key: string; value: string }> }> }>
    metricNames: ReadonlyArray<string>
  }>
}

let metricsServiceRef: MetricsServiceApi | null = null

// Helper to emit activity events
const emitActivityEvent = (
  emitter: EventEmitter,
  event: ActivityEvent,
  tick: number,
  meta: { services: string[]; trace: string[] }
): void => {
  emitter.emit({
    type: "server:message",
    data: {
      type: "activity_event",
      event,
      meta,
      tick,
      timestamp: Date.now()
    }
  })
}

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
      const metricsService = yield* MetricsService
      const businessService = yield* BusinessService
      const economyService = yield* EconomyService

      // Store reference for external access
      metricsServiceRef = metricsService

      // Build initial city layout
      console.log("Building initial city layout...")

      // Main roads - grid pattern
      // Horizontal roads
      yield* road.placeRoadLine(GridPosition.create(10, 20), GridPosition.create(54, 20), "avenue")
      yield* road.placeRoadLine(GridPosition.create(10, 32), GridPosition.create(54, 32), "avenue")
      yield* road.placeRoadLine(GridPosition.create(10, 44), GridPosition.create(54, 44), "avenue")

      // Vertical roads
      yield* road.placeRoadLine(GridPosition.create(20, 10), GridPosition.create(20, 54), "avenue")
      yield* road.placeRoadLine(GridPosition.create(32, 10), GridPosition.create(32, 54), "avenue")
      yield* road.placeRoadLine(GridPosition.create(44, 10), GridPosition.create(44, 54), "avenue")

      // Secondary streets
      yield* road.placeRoadLine(GridPosition.create(10, 26), GridPosition.create(54, 26), "street")
      yield* road.placeRoadLine(GridPosition.create(10, 38), GridPosition.create(54, 38), "street")
      yield* road.placeRoadLine(GridPosition.create(26, 10), GridPosition.create(26, 54), "street")
      yield* road.placeRoadLine(GridPosition.create(38, 10), GridPosition.create(38, 54), "street")

      // Residential zones (green) - northwest and southwest quadrants
      yield* zone.paintZoneArea(GridPosition.create(21, 21), GridPosition.create(25, 25), "residential")
      yield* zone.paintZoneArea(GridPosition.create(21, 27), GridPosition.create(25, 31), "residential")
      yield* zone.paintZoneArea(GridPosition.create(27, 21), GridPosition.create(31, 25), "residential")
      yield* zone.paintZoneArea(GridPosition.create(21, 33), GridPosition.create(25, 37), "residential")
      yield* zone.paintZoneArea(GridPosition.create(27, 33), GridPosition.create(31, 37), "residential")
      yield* zone.paintZoneArea(GridPosition.create(21, 39), GridPosition.create(25, 43), "residential")

      // Commercial zones (blue) - center and east
      yield* zone.paintZoneArea(GridPosition.create(33, 21), GridPosition.create(37, 25), "commercial")
      yield* zone.paintZoneArea(GridPosition.create(33, 27), GridPosition.create(37, 31), "commercial")
      yield* zone.paintZoneArea(GridPosition.create(39, 21), GridPosition.create(43, 25), "commercial")
      yield* zone.paintZoneArea(GridPosition.create(33, 33), GridPosition.create(37, 37), "commercial")

      // Industrial zones (yellow) - southeast
      yield* zone.paintZoneArea(GridPosition.create(39, 33), GridPosition.create(43, 37), "industrial")
      yield* zone.paintZoneArea(GridPosition.create(45, 33), GridPosition.create(53, 37), "industrial")
      yield* zone.paintZoneArea(GridPosition.create(39, 39), GridPosition.create(43, 43), "industrial")
      yield* zone.paintZoneArea(GridPosition.create(45, 39), GridPosition.create(53, 43), "industrial")

      // Place some buildings in zoned areas (buildings spawn on zones with road access)
      // Residential buildings - Zone 1 (21-25, 21-25)
      yield* grid.placeBuilding(GridPosition.create(22, 22), "bldg-r1")
      yield* grid.placeBuilding(GridPosition.create(24, 22), "bldg-r2")
      yield* grid.placeBuilding(GridPosition.create(21, 23), "bldg-r3")
      yield* grid.placeBuilding(GridPosition.create(23, 23), "bldg-r4")
      yield* grid.placeBuilding(GridPosition.create(25, 23), "bldg-r5")
      yield* grid.placeBuilding(GridPosition.create(22, 24), "bldg-r6")
      yield* grid.placeBuilding(GridPosition.create(24, 24), "bldg-r7")
      yield* grid.placeBuilding(GridPosition.create(21, 25), "bldg-r8")
      yield* grid.placeBuilding(GridPosition.create(23, 25), "bldg-r9")

      // Residential buildings - Zone 2 (27-31, 21-25)
      yield* grid.placeBuilding(GridPosition.create(28, 22), "bldg-r10")
      yield* grid.placeBuilding(GridPosition.create(30, 22), "bldg-r11")
      yield* grid.placeBuilding(GridPosition.create(27, 23), "bldg-r12")
      yield* grid.placeBuilding(GridPosition.create(29, 23), "bldg-r13")
      yield* grid.placeBuilding(GridPosition.create(31, 23), "bldg-r14")
      yield* grid.placeBuilding(GridPosition.create(28, 24), "bldg-r15")
      yield* grid.placeBuilding(GridPosition.create(30, 24), "bldg-r16")

      // Residential buildings - Zone 3 (21-25, 27-31)
      yield* grid.placeBuilding(GridPosition.create(22, 28), "bldg-r17")
      yield* grid.placeBuilding(GridPosition.create(24, 28), "bldg-r18")
      yield* grid.placeBuilding(GridPosition.create(21, 29), "bldg-r19")
      yield* grid.placeBuilding(GridPosition.create(23, 29), "bldg-r20")
      yield* grid.placeBuilding(GridPosition.create(25, 29), "bldg-r21")
      yield* grid.placeBuilding(GridPosition.create(22, 30), "bldg-r22")
      yield* grid.placeBuilding(GridPosition.create(24, 30), "bldg-r23")

      // Residential buildings - Zone 4 (21-25, 33-37)
      yield* grid.placeBuilding(GridPosition.create(22, 34), "bldg-r24")
      yield* grid.placeBuilding(GridPosition.create(24, 34), "bldg-r25")
      yield* grid.placeBuilding(GridPosition.create(21, 35), "bldg-r26")
      yield* grid.placeBuilding(GridPosition.create(23, 35), "bldg-r27")
      yield* grid.placeBuilding(GridPosition.create(25, 35), "bldg-r28")
      yield* grid.placeBuilding(GridPosition.create(22, 36), "bldg-r29")
      yield* grid.placeBuilding(GridPosition.create(24, 36), "bldg-r30")

      // Residential buildings - Zone 5 (27-31, 33-37)
      yield* grid.placeBuilding(GridPosition.create(28, 34), "bldg-r31")
      yield* grid.placeBuilding(GridPosition.create(30, 34), "bldg-r32")
      yield* grid.placeBuilding(GridPosition.create(27, 35), "bldg-r33")
      yield* grid.placeBuilding(GridPosition.create(29, 35), "bldg-r34")
      yield* grid.placeBuilding(GridPosition.create(31, 35), "bldg-r35")

      // Residential buildings - Zone 6 (21-25, 39-43)
      yield* grid.placeBuilding(GridPosition.create(22, 40), "bldg-r36")
      yield* grid.placeBuilding(GridPosition.create(24, 40), "bldg-r37")
      yield* grid.placeBuilding(GridPosition.create(21, 41), "bldg-r38")
      yield* grid.placeBuilding(GridPosition.create(23, 41), "bldg-r39")
      yield* grid.placeBuilding(GridPosition.create(25, 41), "bldg-r40")

      // Commercial buildings
      yield* grid.placeBuilding(GridPosition.create(34, 22), "bldg-c1")
      yield* grid.placeBuilding(GridPosition.create(36, 23), "bldg-c2")
      yield* grid.placeBuilding(GridPosition.create(35, 24), "bldg-c3")
      yield* grid.placeBuilding(GridPosition.create(40, 22), "bldg-c4")
      yield* grid.placeBuilding(GridPosition.create(34, 28), "bldg-c5")
      yield* grid.placeBuilding(GridPosition.create(36, 29), "bldg-c6")
      yield* grid.placeBuilding(GridPosition.create(34, 34), "bldg-c7")

      // Industrial buildings
      yield* grid.placeBuilding(GridPosition.create(40, 34), "bldg-i1")
      yield* grid.placeBuilding(GridPosition.create(42, 35), "bldg-i2")
      yield* grid.placeBuilding(GridPosition.create(46, 34), "bldg-i3")
      yield* grid.placeBuilding(GridPosition.create(50, 35), "bldg-i4")
      yield* grid.placeBuilding(GridPosition.create(40, 40), "bldg-i5")
      yield* grid.placeBuilding(GridPosition.create(48, 41), "bldg-i6")

      console.log("Initial city layout complete!")

      // Collect residential building IDs for housing assignments
      const residentialBuildingIds = [
        "bldg-r1", "bldg-r2", "bldg-r3", "bldg-r4", "bldg-r5", "bldg-r6", "bldg-r7", "bldg-r8", "bldg-r9", "bldg-r10",
        "bldg-r11", "bldg-r12", "bldg-r13", "bldg-r14", "bldg-r15", "bldg-r16", "bldg-r17", "bldg-r18", "bldg-r19", "bldg-r20",
        "bldg-r21", "bldg-r22", "bldg-r23", "bldg-r24", "bldg-r25", "bldg-r26", "bldg-r27", "bldg-r28", "bldg-r29", "bldg-r30",
        "bldg-r31", "bldg-r32", "bldg-r33", "bldg-r34", "bldg-r35", "bldg-r36", "bldg-r37", "bldg-r38", "bldg-r39", "bldg-r40"
      ]

      // Update simulation config with residential buildings
      yield* simulation.setConfig({
        residentialBuildingIds,
        citizensPerHome: 4,  // 4 citizens per residential building = 160 max population
        utilityCosts: 20
      })

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
        // Only fetch road type if this cell is a road
        const roadType = cell.hasRoad
          ? yield* road.getRoadType(cell.position)
          : Option.none<"street" | "avenue" | "highway">()
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
          const businessEvents = yield* businessService.subscribe
          const economyEvents = yield* economyService.subscribe

          // Grid events
          yield* Effect.fork(
            Stream.fromQueue(gridEvents).pipe(
              Stream.runForEach((event) =>
                Effect.gen(function* () {
                  if (event._tag === "CellUpdated") {
                    const zoneOpt = yield* zone.getZoneAt(event.position)
                    const zt = Option.isSome(zoneOpt) ? zoneOpt.value.type : undefined
                    // Only fetch road type if this cell is a road
                    const rt = event.cell.hasRoad
                      ? yield* road.getRoadType(event.position)
                      : Option.none<"street" | "avenue" | "highway">()

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

                    // Take a metrics snapshot using Effect's observability
                    yield* metricsService.takeSnapshot(event.stats.tickCount)

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
                  } else if (event._tag === "CitizensArrived") {
                    emitActivityEvent(
                      emitter,
                      {
                        _tag: "CitizensArrived",
                        count: event.count,
                        totalPopulation: event.totalPopulation
                      },
                      event.tickCount,
                      event.trace
                    )
                  } else if (event._tag === "CitizensLeft") {
                    emitActivityEvent(
                      emitter,
                      {
                        _tag: "CitizensLeft",
                        count: event.count,
                        totalPopulation: event.totalPopulation,
                        reason: event.reason
                      },
                      event.tickCount,
                      event.trace
                    )
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

          // Business events -> Activity events
          yield* Effect.fork(
            Stream.fromQueue(businessEvents).pipe(
              Stream.runForEach((event) =>
                Effect.gen(function* () {
                  const clockState = yield* clock.getState
                  const tick = clockState.tickCount

                  if (event._tag === "BusinessCreated") {
                    emitActivityEvent(
                      emitter,
                      {
                        _tag: "BusinessCreated",
                        businessId: event.business.id,
                        businessName: event.business.name,
                        businessType: event.business.type,
                        size: event.business.size,
                        position: { x: event.business.position.x, y: event.business.position.y }
                      },
                      tick,
                      event.trace
                    )
                  } else if (event._tag === "BusinessClosed") {
                    const business = yield* businessService.getBusiness(event.businessId)
                    emitActivityEvent(
                      emitter,
                      {
                        _tag: "BusinessClosed",
                        businessId: event.businessId,
                        businessName: Option.isSome(business) ? business.value.name : "Unknown"
                      },
                      tick,
                      event.trace
                    )
                  }
                })
              )
            )
          )

          // Economy events -> Activity events
          yield* Effect.fork(
            Stream.fromQueue(economyEvents).pipe(
              Stream.runForEach((event) =>
                Effect.gen(function* () {
                  const clockState = yield* clock.getState
                  const tick = clockState.tickCount
                  const treasury = yield* economyService.getTreasury

                  if (event._tag === "EnteredDebt") {
                    emitActivityEvent(
                      emitter,
                      {
                        _tag: "EnteredDebt",
                        balance: treasury.balance
                      },
                      tick,
                      event.trace
                    )
                  } else if (event._tag === "ExitedDebt") {
                    emitActivityEvent(
                      emitter,
                      {
                        _tag: "ExitedDebt",
                        balance: treasury.balance
                      },
                      tick,
                      event.trace
                    )
                  } else if (event._tag === "Bankrupt") {
                    emitActivityEvent(
                      emitter,
                      {
                        _tag: "Bankrupt"
                      },
                      tick,
                      event.trace
                    )
                  }
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

  requestMetricsHistory(count: number = 100): void {
    const emitter = this.eventEmitter
    console.log("requestMetricsHistory called, count:", count)

    if (!metricsServiceRef) {
      console.warn("MetricsService not initialized yet")
      return
    }

    Effect.runPromise(
      Effect.gen(function* () {
        console.log("Fetching metrics history...")
        const history = yield* metricsServiceRef!.getSerializedHistory(count)
        console.log("Got history:", history.snapshots.length, "snapshots,", history.metricNames.length, "metric names")

        emitter.emit({
          type: "server:message",
          data: {
            type: "metrics_history",
            snapshots: history.snapshots as MetricsSnapshot[],
            metricNames: history.metricNames as string[]
          }
        })
        console.log("Emitted metrics_history message")
      })
    ).catch(err => console.error("Error fetching metrics history:", err))
  }

  stop(): void {
    // The fiber will be interrupted when the page unloads
  }
}
