import { Context, Effect, Layer, Ref, Array, Option, Random, Metric, MetricBoundaries } from "effect"
import { Citizen, CitizenId, BuildingId, PopulationStats } from "../domain/Citizen.js"

// Metrics for population tracking
const populationGauge = Metric.gauge("population.total", {
  description: "Total number of citizens in the city"
})

const employedGauge = Metric.gauge("population.employed", {
  description: "Number of employed citizens"
})

const unemployedGauge = Metric.gauge("population.unemployed", {
  description: "Number of unemployed citizens"
})

const homelessGauge = Metric.gauge("population.homeless", {
  description: "Number of homeless citizens"
})

const happinessGauge = Metric.gauge("population.happiness.average", {
  description: "Average happiness of all citizens (0-100)"
})

const citizensAddedCounter = Metric.counter("population.citizens.added", {
  description: "Total citizens that have moved into the city",
  incremental: true
})

const citizensLeftCounter = Metric.counter("population.citizens.left", {
  description: "Total citizens that have left the city",
  incremental: true
})

const happinessHistogram = Metric.histogram(
  "population.happiness.distribution",
  MetricBoundaries.linear({ start: 0, width: 10, count: 10 }),
  "Distribution of citizen happiness levels"
)

export class PopulationService extends Context.Tag("PopulationService")<
  PopulationService,
  {
    readonly getStats: Effect.Effect<PopulationStats>
    readonly getCitizens: Effect.Effect<ReadonlyArray<Citizen>>
    readonly getCitizen: (id: CitizenId) => Effect.Effect<Option.Option<Citizen>>
    readonly addCitizen: (citizen: Citizen) => Effect.Effect<void>
    readonly removeCitizen: (id: CitizenId) => Effect.Effect<void>
    readonly assignHome: (citizenId: CitizenId, buildingId: BuildingId) => Effect.Effect<void>
    readonly assignWorkplace: (citizenId: CitizenId, buildingId: BuildingId) => Effect.Effect<void>
    readonly simulateGrowth: (availableHomes: number, availableJobs: number) => Effect.Effect<number>
    readonly tick: Effect.Effect<void>
  }
>() {}

const generateCitizenId: Effect.Effect<CitizenId> = Effect.map(
  Random.next,
  (n) => `citizen-${Date.now()}-${Math.floor(n * 10000)}` as CitizenId
)

const createNewCitizen: Effect.Effect<Citizen> = Effect.gen(function* () {
  const id = yield* generateCitizenId
  const age = yield* Random.nextIntBetween(18, 65)
  return Citizen.homeless(id, age, 50)
})

const updateMetrics = (citizens: ReadonlyArray<Citizen>): Effect.Effect<void> =>
  Effect.gen(function* () {
    const total = citizens.length
    const employed = Array.filter(citizens, (c) => c.employment === "employed").length
    const unemployed = Array.filter(citizens, (c) => c.employment === "unemployed").length
    const homeless = Array.filter(citizens, (c) => Option.isNone(c.homeId)).length
    const avgHappiness =
      total > 0
        ? Array.reduce(citizens, 0, (acc, c) => acc + c.happiness) / total
        : 0

    yield* Metric.set(populationGauge, total)
    yield* Metric.set(employedGauge, employed)
    yield* Metric.set(unemployedGauge, unemployed)
    yield* Metric.set(homelessGauge, homeless)
    yield* Metric.set(happinessGauge, avgHappiness)

    // Record happiness distribution
    yield* Effect.forEach(citizens, (citizen) =>
      Metric.update(happinessHistogram, citizen.happiness)
    )
  })

export const PopulationServiceLive = Layer.effect(
  PopulationService,
  Effect.gen(function* () {
    const citizensRef = yield* Ref.make<ReadonlyArray<Citizen>>([])

    const getStats: Effect.Effect<PopulationStats> = Effect.gen(function* () {
      const citizens = yield* Ref.get(citizensRef)
      const total = citizens.length
      const employed = Array.filter(citizens, (c) => c.employment === "employed").length
      const unemployed = Array.filter(citizens, (c) => c.employment === "unemployed").length
      const homeless = Array.filter(citizens, (c) => Option.isNone(c.homeId)).length
      const avgHappiness =
        total > 0
          ? Array.reduce(citizens, 0, (acc, c) => acc + c.happiness) / total
          : 0

      return new PopulationStats({
        total,
        employed,
        unemployed,
        homeless,
        averageHappiness: avgHappiness
      })
    })

    const getCitizens: Effect.Effect<ReadonlyArray<Citizen>> = Ref.get(citizensRef)

    const getCitizen = (id: CitizenId): Effect.Effect<Option.Option<Citizen>> =>
      Effect.map(Ref.get(citizensRef), (citizens) =>
        Array.findFirst(citizens, (c) => c.id === id)
      )

    const addCitizen = (citizen: Citizen): Effect.Effect<void> =>
      Effect.gen(function* () {
        yield* Ref.update(citizensRef, (citizens) => [...citizens, citizen])
        yield* Metric.increment(citizensAddedCounter)
        const citizens = yield* Ref.get(citizensRef)
        yield* updateMetrics(citizens)
      })

    const removeCitizen = (id: CitizenId): Effect.Effect<void> =>
      Effect.gen(function* () {
        yield* Ref.update(citizensRef, (citizens) =>
          Array.filter(citizens, (c) => c.id !== id)
        )
        yield* Metric.increment(citizensLeftCounter)
        const citizens = yield* Ref.get(citizensRef)
        yield* updateMetrics(citizens)
      })

    const updateCitizen = (id: CitizenId, update: (c: Citizen) => Citizen): Effect.Effect<void> =>
      Effect.gen(function* () {
        yield* Ref.update(citizensRef, (citizens) =>
          Array.map(citizens, (c) => (c.id === id ? update(c) : c))
        )
        const citizens = yield* Ref.get(citizensRef)
        yield* updateMetrics(citizens)
      })

    const assignHome = (citizenId: CitizenId, buildingId: BuildingId): Effect.Effect<void> =>
      updateCitizen(citizenId, (c) =>
        new Citizen({ ...c, homeId: Option.some(buildingId) })
      )

    const assignWorkplace = (citizenId: CitizenId, buildingId: BuildingId): Effect.Effect<void> =>
      updateCitizen(citizenId, (c) =>
        new Citizen({ ...c, workplaceId: Option.some(buildingId), employment: "employed" })
      )

    const simulateGrowth = (availableHomes: number, availableJobs: number): Effect.Effect<number> =>
      Effect.gen(function* () {
        const citizens = yield* Ref.get(citizensRef)
        const stats = yield* getStats

        // Growth rate based on city attractiveness
        const hasHousing = availableHomes > 0
        const hasJobs = availableJobs > 0
        const isHappy = stats.averageHappiness > 40

        // Calculate how many new citizens want to move in
        let growthPotential = 0
        if (hasHousing && hasJobs && isHappy) {
          growthPotential = Math.min(availableHomes, Math.ceil(citizens.length * 0.05) + 1)
        } else if (hasHousing && hasJobs) {
          growthPotential = Math.min(availableHomes, Math.ceil(citizens.length * 0.02) + 1)
        } else if (hasHousing) {
          growthPotential = 1
        }

        // Add new citizens
        let added = 0
        for (let i = 0; i < growthPotential; i++) {
          const newCitizen = yield* createNewCitizen
          yield* Ref.update(citizensRef, (cs) => [...cs, newCitizen])
          yield* Metric.increment(citizensAddedCounter)
          added++
        }

        // Update metrics after all additions
        if (added > 0) {
          const updatedCitizens = yield* Ref.get(citizensRef)
          yield* updateMetrics(updatedCitizens)
        }

        return added
      })

    const tick: Effect.Effect<void> = Effect.gen(function* () {
      const beforeCount = (yield* Ref.get(citizensRef)).length

      // Update happiness based on employment and housing
      yield* Ref.update(citizensRef, (cs) =>
        Array.map(cs, (c) => {
          let happinessDelta = 0

          // Employed citizens are happier
          if (c.employment === "employed") {
            happinessDelta += 1
          } else {
            happinessDelta -= 2
          }

          // Housed citizens are happier
          if (Option.isSome(c.homeId)) {
            happinessDelta += 1
          } else {
            happinessDelta -= 5
          }

          const newHappiness = Math.max(0, Math.min(100, c.happiness + happinessDelta))
          return new Citizen({ ...c, happiness: newHappiness })
        })
      )

      // Very unhappy citizens may leave
      yield* Ref.update(citizensRef, (cs) =>
        Array.filter(cs, (c) => c.happiness > 10)
      )

      const afterCitizens = yield* Ref.get(citizensRef)
      const leftCount = beforeCount - afterCitizens.length

      // Track citizens who left due to unhappiness
      if (leftCount > 0) {
        yield* Metric.incrementBy(citizensLeftCounter, leftCount)
      }

      yield* updateMetrics(afterCitizens)
    })

    return {
      getStats,
      getCitizens,
      getCitizen,
      addCitizen,
      removeCitizen,
      assignHome,
      assignWorkplace,
      simulateGrowth,
      tick
    } as const
  })
)
