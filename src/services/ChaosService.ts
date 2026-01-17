import { Context, Effect, Layer, Ref, Array, Random, PubSub, Queue, Scope, Metric, Option as O } from "effect"
import {
  ChaosEvent,
  ChaosEventId,
  AffectedCitizen,
  type ChaosEventType,
  type ChaosSeverity,
  type ChaosConfig,
  type ChaosStats,
  defaultChaosConfig
} from "../domain/Chaos.js"
import type { Citizen } from "../domain/Citizen.js"
import { withServiceSpan, captureActivityTrace, type ServiceTraceMeta } from "./ServiceTrace.js"
import { PopulationService } from "./PopulationService.js"
import { RoadService } from "./RoadService.js"

// Metrics for chaos tracking
const chaosEventsCounter = Metric.counter("chaos.events.total", {
  description: "Total number of chaos events that have occurred",
  incremental: true
})

const activeChaosGauge = Metric.gauge("chaos.events.active", {
  description: "Number of currently active (unresolved) chaos events"
})

const happinessImpactGauge = Metric.gauge("chaos.happiness.impact", {
  description: "Total happiness impact from chaos events"
})

// Events emitted by the chaos service
export type ChaosServiceEvent =
  | { readonly _tag: "CarCrash"; readonly event: ChaosEvent; readonly trace: ServiceTraceMeta }
  | { readonly _tag: "CitizenAccident"; readonly event: ChaosEvent; readonly trace: ServiceTraceMeta }
  | { readonly _tag: "CitizenIllness"; readonly event: ChaosEvent; readonly trace: ServiceTraceMeta }
  | { readonly _tag: "PowerOutage"; readonly event: ChaosEvent; readonly trace: ServiceTraceMeta }
  | { readonly _tag: "WaterMainBreak"; readonly event: ChaosEvent; readonly trace: ServiceTraceMeta }
  | { readonly _tag: "Fire"; readonly event: ChaosEvent; readonly trace: ServiceTraceMeta }
  | { readonly _tag: "ChaosResolved"; readonly eventId: ChaosEventId; readonly eventType: ChaosEventType; readonly trace: ServiceTraceMeta }

export class ChaosService extends Context.Tag("ChaosService")<
  ChaosService,
  {
    // Configuration
    readonly getConfig: Effect.Effect<ChaosConfig>
    readonly setConfig: (config: Partial<ChaosConfig>) => Effect.Effect<void>
    readonly enable: Effect.Effect<void>
    readonly disable: Effect.Effect<void>

    // Stats
    readonly getStats: Effect.Effect<ChaosStats>
    readonly getActiveEvents: Effect.Effect<ReadonlyArray<ChaosEvent>>

    // Simulation tick
    readonly tick: (tickCount: number) => Effect.Effect<ReadonlyArray<ChaosEvent>>

    // Manual triggers (for testing/demos)
    readonly triggerCarCrash: Effect.Effect<ChaosEvent>
    readonly triggerCitizenAccident: Effect.Effect<ChaosEvent>
    readonly triggerRandomEvent: Effect.Effect<ChaosEvent>

    // Event resolution
    readonly resolveEvent: (eventId: ChaosEventId) => Effect.Effect<void>

    // Event subscription
    readonly subscribe: Effect.Effect<Queue.Dequeue<ChaosServiceEvent>, never, Scope.Scope>
  }
>() {}

// Helper to generate chaos event IDs
const generateEventId: Effect.Effect<ChaosEventId> = Effect.map(
  Random.next,
  (n) => `chaos-${Date.now()}-${Math.floor(n * 10000)}` as ChaosEventId
)

// Severity probabilities - minor is most common, major is rare
const rollSeverity: Effect.Effect<ChaosSeverity> = Effect.gen(function* () {
  const roll = yield* Random.next
  if (roll < 0.6) return "minor"
  if (roll < 0.9) return "moderate"
  return "major"
})

// Impact calculations based on severity
const getHappinessImpact = (severity: ChaosSeverity): number => {
  switch (severity) {
    case "minor": return -2
    case "moderate": return -5
    case "major": return -10
  }
}

const getAffectedCount = (severity: ChaosSeverity, population: number): Effect.Effect<number> =>
  Effect.gen(function* () {
    const basePercent = severity === "minor" ? 0.01 : severity === "moderate" ? 0.03 : 0.08
    const variance = yield* Random.nextIntBetween(80, 120)
    return Math.max(1, Math.floor(population * basePercent * (variance / 100)))
  })

// Helper to shuffle and pick random citizens
const selectRandomCitizens = (
  citizens: ReadonlyArray<Citizen>,
  count: number
): Effect.Effect<ReadonlyArray<Citizen>> =>
  Effect.gen(function* () {
    if (citizens.length === 0) return []
    const actualCount = Math.min(count, citizens.length)
    const shuffled = [...citizens]
    // Fisher-Yates shuffle for first actualCount elements
    for (let i = 0; i < actualCount; i++) {
      const j = yield* Random.nextIntBetween(i, shuffled.length)
      const temp = shuffled[i]
      shuffled[i] = shuffled[j]
      shuffled[j] = temp
    }
    return shuffled.slice(0, actualCount)
  })

export const ChaosServiceLive = Layer.effect(
  ChaosService,
  Effect.gen(function* () {
    const populationService = yield* PopulationService
    const roadService = yield* RoadService

    const configRef = yield* Ref.make<ChaosConfig>(defaultChaosConfig)
    const eventsRef = yield* Ref.make<ReadonlyArray<ChaosEvent>>([])
    const eventBus = yield* PubSub.unbounded<ChaosServiceEvent>()

    // Helper to get a random road position for car crashes (includes road type)
    const getRandomRoadPosition = Effect.gen(function* () {
      const networks = yield* roadService.getAllNetworks
      // Collect all road cells from all networks
      const allRoadCells = networks.flatMap((network) => network.cells)
      if (allRoadCells.length === 0) {
        // Fallback to random position
        const x = yield* Random.nextIntBetween(10, 54)
        const y = yield* Random.nextIntBetween(10, 54)
        return { position: { x, y }, roadType: O.none<"street" | "avenue" | "highway">() }
      }
      const idx = yield* Random.nextIntBetween(0, allRoadCells.length)
      const road = allRoadCells[idx]
      const roadType = yield* roadService.getRoadType(road)
      return { position: { x: road.x, y: road.y }, roadType }
    })

    // Helper to get a random city position
    const getRandomCityPosition = Effect.gen(function* () {
      const x = yield* Random.nextIntBetween(20, 50)
      const y = yield* Random.nextIntBetween(20, 50)
      return { x, y }
    })

    // Core event creation logic
    const createChaosEvent = (
      type: ChaosEventType,
      tickCount: number
    ): Effect.Effect<ChaosEvent> =>
      withServiceSpan(
        "ChaosService",
        `ChaosService.create${type}`,
        Effect.gen(function* () {
          const id = yield* generateEventId
          const severity = yield* rollSeverity
          const stats = yield* populationService.getStats
          const affectedCount = yield* getAffectedCount(severity, stats.total)
          const happinessImpact = getHappinessImpact(severity)

          // Get all citizens and select random ones to be affected
          const allCitizens = yield* populationService.getCitizens
          const selectedCitizens = yield* selectRandomCitizens(allCitizens, affectedCount)

          // Build affected citizen details
          const affectedCitizenIds = selectedCitizens.map((c) => c.id)
          const affectedCitizenDetails = selectedCitizens.map(
            (c) =>
              new AffectedCitizen({
                id: c.id,
                firstName: c.firstName,
                lastName: c.lastName,
                age: c.age,
                wasEmployed: c.employment === "employed",
                hadHome: O.isSome(c.homeId)
              })
          )

          // Get position and road type based on event type
          let position: { x: number; y: number }
          let roadType: O.Option<"street" | "avenue" | "highway"> = O.none()

          if (type === "car_crash") {
            const roadData = yield* getRandomRoadPosition
            position = roadData.position
            roadType = roadData.roadType
          } else {
            position = yield* getRandomCityPosition
          }

          return new ChaosEvent({
            id,
            type,
            severity,
            position,
            affectedCitizenIds,
            affectedCitizenDetails,
            happinessImpact,
            resolved: false,
            tickOccurred: tickCount,
            roadType
          })
        })
      )

    // Add event and emit
    const addEventAndEmit = (event: ChaosEvent): Effect.Effect<void> =>
      Effect.gen(function* () {
        yield* Ref.update(eventsRef, (events) => [...events, event])
        yield* Metric.increment(chaosEventsCounter)
        const events = yield* Ref.get(eventsRef)
        const activeCount = Array.filter(events, (e) => !e.resolved).length
        yield* Metric.set(activeChaosGauge, activeCount)

        const trace = yield* captureActivityTrace(`chaos.${event.type}`)

        // Map event type to service event tag
        const serviceEvent: ChaosServiceEvent = (() => {
          switch (event.type) {
            case "car_crash":
              return { _tag: "CarCrash" as const, event, trace }
            case "citizen_accident":
              return { _tag: "CitizenAccident" as const, event, trace }
            case "citizen_illness":
              return { _tag: "CitizenIllness" as const, event, trace }
            case "power_outage":
              return { _tag: "PowerOutage" as const, event, trace }
            case "water_main_break":
              return { _tag: "WaterMainBreak" as const, event, trace }
            case "fire":
              return { _tag: "Fire" as const, event, trace }
          }
        })()

        yield* PubSub.publish(eventBus, serviceEvent)
      })

    // Try to trigger an event based on chance
    const maybeCreateEvent = (
      type: ChaosEventType,
      chance: number,
      tickCount: number
    ): Effect.Effect<ChaosEvent | null> =>
      Effect.gen(function* () {
        const roll = yield* Random.next
        if (roll < chance) {
          const event = yield* createChaosEvent(type, tickCount)
          yield* addEventAndEmit(event)
          return event
        }
        return null
      })

    // Update metrics
    const updateMetrics = Effect.gen(function* () {
      const events = yield* Ref.get(eventsRef)
      const activeCount = Array.filter(events, (e) => !e.resolved).length
      const totalImpact = Array.reduce(events, 0, (acc, e) => acc + e.happinessImpact)
      yield* Metric.set(activeChaosGauge, activeCount)
      yield* Metric.set(happinessImpactGauge, totalImpact)
    })

    // Public API
    const getConfig: Effect.Effect<ChaosConfig> = withServiceSpan(
      "ChaosService",
      "ChaosService.getConfig",
      Ref.get(configRef)
    )

    const setConfig = (config: Partial<ChaosConfig>): Effect.Effect<void> =>
      withServiceSpan(
        "ChaosService",
        "ChaosService.setConfig",
        Ref.update(configRef, (current) => ({ ...current, ...config }))
      )

    const enable: Effect.Effect<void> = withServiceSpan(
      "ChaosService",
      "ChaosService.enable",
      Ref.update(configRef, (c) => ({ ...c, enabled: true }))
    )

    const disable: Effect.Effect<void> = withServiceSpan(
      "ChaosService",
      "ChaosService.disable",
      Ref.update(configRef, (c) => ({ ...c, enabled: false }))
    )

    const getStats: Effect.Effect<ChaosStats> = withServiceSpan(
      "ChaosService",
      "ChaosService.getStats",
      Effect.gen(function* () {
        const events = yield* Ref.get(eventsRef)
        const activeEvents = Array.filter(events, (e) => !e.resolved)
        const resolvedEvents = Array.filter(events, (e) => e.resolved)

        const eventsByType: Record<ChaosEventType, number> = {
          car_crash: 0,
          citizen_accident: 0,
          citizen_illness: 0,
          power_outage: 0,
          water_main_break: 0,
          fire: 0
        }

        for (const event of events) {
          eventsByType[event.type]++
        }

        const totalHappinessImpact = Array.reduce(events, 0, (acc, e) => acc + e.happinessImpact)

        return {
          totalEvents: events.length,
          activeEvents: activeEvents.length,
          resolvedEvents: resolvedEvents.length,
          eventsByType,
          totalHappinessImpact
        }
      })
    )

    const getActiveEvents: Effect.Effect<ReadonlyArray<ChaosEvent>> = withServiceSpan(
      "ChaosService",
      "ChaosService.getActiveEvents",
      Effect.map(Ref.get(eventsRef), (events) => Array.filter(events, (e) => !e.resolved))
    )

    const tick = (tickCount: number): Effect.Effect<ReadonlyArray<ChaosEvent>> =>
      withServiceSpan(
        "ChaosService",
        "ChaosService.tick",
        Effect.gen(function* () {
          const config = yield* Ref.get(configRef)
          if (!config.enabled) return []

          const newEvents: ChaosEvent[] = []

          // Try each type of chaos event
          const carCrash = yield* maybeCreateEvent("car_crash", config.carCrashChance, tickCount)
          if (carCrash) newEvents.push(carCrash)

          const citizenAccident = yield* maybeCreateEvent("citizen_accident", config.citizenAccidentChance, tickCount)
          if (citizenAccident) newEvents.push(citizenAccident)

          const citizenIllness = yield* maybeCreateEvent("citizen_illness", config.citizenIllnessChance, tickCount)
          if (citizenIllness) newEvents.push(citizenIllness)

          const powerOutage = yield* maybeCreateEvent("power_outage", config.powerOutageChance, tickCount)
          if (powerOutage) newEvents.push(powerOutage)

          const waterMainBreak = yield* maybeCreateEvent("water_main_break", config.waterMainBreakChance, tickCount)
          if (waterMainBreak) newEvents.push(waterMainBreak)

          const fire = yield* maybeCreateEvent("fire", config.fireChance, tickCount)
          if (fire) newEvents.push(fire)

          // Auto-resolve old minor events (after 5 ticks)
          const events = yield* Ref.get(eventsRef)
          for (const event of events) {
            if (!event.resolved && event.severity === "minor" && tickCount - event.tickOccurred >= 5) {
              yield* Ref.update(eventsRef, (es) =>
                Array.map(es, (e) => e.id === event.id ? new ChaosEvent({ ...e, resolved: true }) : e)
              )
              const trace = yield* captureActivityTrace("chaos.resolved")
              yield* PubSub.publish(eventBus, { _tag: "ChaosResolved", eventId: event.id, eventType: event.type, trace })
            }
          }

          // Auto-resolve moderate events (after 10 ticks)
          for (const event of events) {
            if (!event.resolved && event.severity === "moderate" && tickCount - event.tickOccurred >= 10) {
              yield* Ref.update(eventsRef, (es) =>
                Array.map(es, (e) => e.id === event.id ? new ChaosEvent({ ...e, resolved: true }) : e)
              )
              const trace = yield* captureActivityTrace("chaos.resolved")
              yield* PubSub.publish(eventBus, { _tag: "ChaosResolved", eventId: event.id, eventType: event.type, trace })
            }
          }

          yield* updateMetrics

          return newEvents
        })
      )

    const triggerCarCrash: Effect.Effect<ChaosEvent> = withServiceSpan(
      "ChaosService",
      "ChaosService.triggerCarCrash",
      Effect.gen(function* () {
        const event = yield* createChaosEvent("car_crash", 0)
        yield* addEventAndEmit(event)
        return event
      })
    )

    const triggerCitizenAccident: Effect.Effect<ChaosEvent> = withServiceSpan(
      "ChaosService",
      "ChaosService.triggerCitizenAccident",
      Effect.gen(function* () {
        const event = yield* createChaosEvent("citizen_accident", 0)
        yield* addEventAndEmit(event)
        return event
      })
    )

    const triggerRandomEvent: Effect.Effect<ChaosEvent> = withServiceSpan(
      "ChaosService",
      "ChaosService.triggerRandomEvent",
      Effect.gen(function* () {
        const types: ChaosEventType[] = [
          "car_crash",
          "citizen_accident",
          "citizen_illness",
          "power_outage",
          "water_main_break",
          "fire"
        ]
        const idx = yield* Random.nextIntBetween(0, types.length)
        const event = yield* createChaosEvent(types[idx], 0)
        yield* addEventAndEmit(event)
        return event
      })
    )

    const resolveEvent = (eventId: ChaosEventId): Effect.Effect<void> =>
      withServiceSpan(
        "ChaosService",
        "ChaosService.resolveEvent",
        Effect.gen(function* () {
          const events = yield* Ref.get(eventsRef)
          const event = Array.findFirst(events, (e) => e.id === eventId)
          if (event._tag === "Some" && !event.value.resolved) {
            yield* Ref.update(eventsRef, (es) =>
              Array.map(es, (e) => e.id === eventId ? new ChaosEvent({ ...e, resolved: true }) : e)
            )
            const trace = yield* captureActivityTrace("chaos.resolved")
            yield* PubSub.publish(eventBus, { _tag: "ChaosResolved", eventId, eventType: event.value.type, trace })
            yield* updateMetrics
          }
        })
      )

    const subscribe = PubSub.subscribe(eventBus)

    return {
      getConfig,
      setConfig,
      enable,
      disable,
      getStats,
      getActiveEvents,
      tick,
      triggerCarCrash,
      triggerCitizenAccident,
      triggerRandomEvent,
      resolveEvent,
      subscribe
    } as const
  })
)
