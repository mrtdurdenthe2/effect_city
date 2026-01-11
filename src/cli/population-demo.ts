import { Effect, Console, Duration, Option } from "effect"
import { Citizen, CitizenId, BuildingId, PopulationStats } from "../domain/Citizen.js"
import { PopulationService, PopulationServiceLive } from "../services/PopulationService.js"

// ANSI color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  white: "\x1b[37m",
  bgBlue: "\x1b[44m",
}

const c = colors

// Helper to create a progress bar
const progressBar = (value: number, max: number, width: number = 20): string => {
  const filled = Math.round((value / max) * width)
  const empty = width - filled
  const bar = "█".repeat(filled) + "░".repeat(empty)
  return bar
}

// Helper to colorize happiness
const happinessColor = (happiness: number): string => {
  if (happiness >= 70) return c.green
  if (happiness >= 40) return c.yellow
  return c.red
}

// Format a single citizen for display
const formatCitizen = (citizen: Citizen, index: number): string => {
  const homeStatus = Option.isSome(citizen.homeId) ? `${c.green}🏠${c.reset}` : `${c.red}🚫${c.reset}`
  const jobStatus = citizen.employment === "employed"
    ? `${c.green}💼${c.reset}`
    : `${c.yellow}📭${c.reset}`
  const happyColor = happinessColor(citizen.happiness)

  return `  ${c.dim}${String(index + 1).padStart(2)}${c.reset} │ Age ${String(citizen.age).padStart(2)} │ ${homeStatus} │ ${jobStatus} │ ${happyColor}${progressBar(citizen.happiness, 100, 10)} ${citizen.happiness.toFixed(0).padStart(3)}%${c.reset}`
}

// Format stats display
const formatStats = (stats: PopulationStats): string => {
  const happyColor = happinessColor(stats.averageHappiness)

  return `
${c.bgBlue}${c.white}${c.bold}                    CITY POPULATION STATS                    ${c.reset}
${"─".repeat(62)}
  ${c.cyan}Total Population:${c.reset}  ${c.bold}${stats.total}${c.reset} citizens
  ${c.green}Employed:${c.reset}          ${stats.employed} (${stats.total > 0 ? ((stats.employed / stats.total) * 100).toFixed(1) : 0}%)
  ${c.yellow}Unemployed:${c.reset}        ${stats.unemployed} (${stats.total > 0 ? ((stats.unemployed / stats.total) * 100).toFixed(1) : 0}%)
  ${c.red}Homeless:${c.reset}          ${stats.homeless} (${stats.total > 0 ? ((stats.homeless / stats.total) * 100).toFixed(1) : 0}%)
  ${c.magenta}Avg Happiness:${c.reset}     ${happyColor}${progressBar(stats.averageHappiness, 100, 20)} ${stats.averageHappiness.toFixed(1)}%${c.reset}
${"─".repeat(62)}`
}

// Format growth explanation
const formatGrowthExplanation = (availableHomes: number, availableJobs: number, stats: PopulationStats): string => {
  const hasHousing = availableHomes > 0
  const hasJobs = availableJobs > 0
  const isHappy = stats.averageHappiness > 40

  let growthStatus: string
  let growthRate: string

  if (hasHousing && hasJobs && isHappy) {
    growthStatus = `${c.green}OPTIMAL GROWTH${c.reset}`
    growthRate = "5% + 1 per tick"
  } else if (hasHousing && hasJobs) {
    growthStatus = `${c.yellow}MODERATE GROWTH${c.reset}`
    growthRate = "2% + 1 per tick"
  } else if (hasHousing) {
    growthStatus = `${c.yellow}MINIMAL GROWTH${c.reset}`
    growthRate = "1 per tick"
  } else {
    growthStatus = `${c.red}NO GROWTH${c.reset}`
    growthRate = "0 per tick"
  }

  return `
${c.bold}GROWTH CONDITIONS:${c.reset}
  Housing Available: ${hasHousing ? `${c.green}YES${c.reset} (${availableHomes})` : `${c.red}NO${c.reset}`}
  Jobs Available:    ${hasJobs ? `${c.green}YES${c.reset} (${availableJobs})` : `${c.red}NO${c.reset}`}
  Citizens Happy:    ${isHappy ? `${c.green}YES${c.reset} (>${40}%)` : `${c.red}NO${c.reset} (<=${40}%)`}

  ${c.bold}Status:${c.reset} ${growthStatus}
  ${c.bold}Growth Rate:${c.reset} ${growthRate}
`
}

// Format tick explanation
const formatTickExplanation = (): string => {
  return `
${c.bold}HAPPINESS MECHANICS (per tick):${c.reset}
  ${c.green}+1${c.reset} Employed    ${c.red}-2${c.reset} Unemployed
  ${c.green}+1${c.reset} Housed      ${c.red}-5${c.reset} Homeless

  ${c.dim}Citizens with happiness < 10 will leave the city${c.reset}
`
}


// Main simulation program
const simulation = Effect.gen(function* () {
  const pop = yield* PopulationService

  yield* Console.log(`
${c.bold}${c.cyan}╔════════════════════════════════════════════════════════════════╗
║           EFFECT CITY - Population Simulation Demo             ║
╚════════════════════════════════════════════════════════════════╝${c.reset}
`)

  yield* Console.log(formatTickExplanation())
  yield* Console.log(`${c.dim}Starting simulation in 2 seconds...${c.reset}\n`)
  yield* Effect.sleep(Duration.seconds(2))

  // Seed initial population
  yield* Console.log(`${c.bold}Phase 1: Seeding initial population...${c.reset}\n`)

  const initialCitizens = [
    Citizen.homeless("citizen-001" as CitizenId, 25, 50),
    Citizen.homeless("citizen-002" as CitizenId, 32, 50),
    Citizen.homeless("citizen-003" as CitizenId, 45, 50),
  ]

  for (const citizen of initialCitizens) {
    yield* pop.addCitizen(citizen)
    yield* Console.log(`  ${c.green}+${c.reset} Added citizen (age ${citizen.age})`)
  }

  yield* Effect.sleep(Duration.seconds(1))

  // Show initial stats
  const initialStats = yield* pop.getStats
  yield* Console.log(formatStats(initialStats))
  yield* Effect.sleep(Duration.seconds(2))

  // Phase 2: Assign homes to some citizens
  yield* Console.log(`\n${c.bold}Phase 2: Building homes and assigning residents...${c.reset}\n`)

  yield* pop.assignHome("citizen-001" as CitizenId, "home-001" as BuildingId)
  yield* Console.log(`  ${c.blue}🏠${c.reset} citizen-001 moved into home-001`)

  yield* pop.assignHome("citizen-002" as CitizenId, "home-002" as BuildingId)
  yield* Console.log(`  ${c.blue}🏠${c.reset} citizen-002 moved into home-002`)

  yield* Effect.sleep(Duration.seconds(1))

  const afterHousingStats = yield* pop.getStats
  yield* Console.log(formatStats(afterHousingStats))
  yield* Effect.sleep(Duration.seconds(2))

  // Phase 3: Assign jobs
  yield* Console.log(`\n${c.bold}Phase 3: Creating jobs and employing citizens...${c.reset}\n`)

  yield* pop.assignWorkplace("citizen-001" as CitizenId, "factory-001" as BuildingId)
  yield* Console.log(`  ${c.blue}💼${c.reset} citizen-001 employed at factory-001`)

  yield* Effect.sleep(Duration.seconds(1))

  const afterJobsStats = yield* pop.getStats
  yield* Console.log(formatStats(afterJobsStats))
  yield* Effect.sleep(Duration.seconds(2))

  // Phase 4: Run simulation ticks
  yield* Console.log(`\n${c.bold}Phase 4: Running simulation ticks...${c.reset}\n`)

  for (let tick = 1; tick <= 5; tick++) {
    yield* Console.log(`${c.cyan}━━━ Tick ${tick} ━━━${c.reset}`)

    const beforeStats = yield* pop.getStats
    yield* pop.getCitizens

    yield* pop.tick

    const afterStats = yield* pop.getStats
    const afterCitizens = yield* pop.getCitizens

    // Show what changed
    const happinessDelta = afterStats.averageHappiness - beforeStats.averageHappiness
    const populationDelta = afterStats.total - beforeStats.total

    yield* Console.log(`  Happiness: ${beforeStats.averageHappiness.toFixed(1)}% → ${afterStats.averageHappiness.toFixed(1)}% (${happinessDelta >= 0 ? c.green + "+" : c.red}${happinessDelta.toFixed(1)}${c.reset})`)

    if (populationDelta < 0) {
      yield* Console.log(`  ${c.red}${Math.abs(populationDelta)} citizen(s) left due to low happiness${c.reset}`)
    }

    // Show citizen list
    yield* Console.log(`\n  ${c.dim}Citizens:${c.reset}`)
    for (let i = 0; i < afterCitizens.length; i++) {
      yield* Console.log(formatCitizen(afterCitizens[i], i))
    }

    yield* Console.log("")
    yield* Effect.sleep(Duration.seconds(1))
  }

  // Phase 5: Simulate growth
  yield* Console.log(`\n${c.bold}Phase 5: Simulating population growth...${c.reset}\n`)

  const preGrowthStats = yield* pop.getStats
  const availableHomes = 5
  const availableJobs = 3

  yield* Console.log(formatGrowthExplanation(availableHomes, availableJobs, preGrowthStats))

  yield* Effect.sleep(Duration.seconds(2))

  const newCitizens = yield* pop.simulateGrowth(availableHomes, availableJobs)
  yield* Console.log(`  ${c.green}+${newCitizens} new citizens moved to the city!${c.reset}\n`)

  const finalStats = yield* pop.getStats
  const finalCitizens = yield* pop.getCitizens

  yield* Console.log(formatStats(finalStats))

  yield* Console.log(`\n  ${c.dim}All Citizens:${c.reset}`)
  for (let i = 0; i < finalCitizens.length; i++) {
    yield* Console.log(formatCitizen(finalCitizens[i], i))
  }

  yield* Console.log(`
${c.bold}${c.cyan}╔════════════════════════════════════════════════════════════════╗
║                    Simulation Complete!                        ║
╚════════════════════════════════════════════════════════════════╝${c.reset}

${c.bold}Summary:${c.reset}
  Started with: 3 citizens
  Ended with:   ${finalStats.total} citizens

${c.dim}This demo showed how citizens gain/lose happiness based on
housing and employment, and how growth is affected by city conditions.${c.reset}
`)
})

// Run the program
const program = simulation.pipe(
  Effect.provide(PopulationServiceLive)
)

Effect.runPromise(program).catch(console.error)
