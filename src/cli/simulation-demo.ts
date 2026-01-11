import { Effect, Console, Duration, Option } from "effect"
import { Citizen, CitizenId, BuildingId } from "../domain/Citizen.js"
import { PopulationService } from "../services/PopulationService.js"
import { SimulationService, SimulationLayer, type SimulationStats } from "../services/SimulationService.js"

// ANSI color codes for terminal output
const c = {
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
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
}

// Helper to create a progress bar
const progressBar = (value: number, max: number, width: number = 20): string => {
  const filled = Math.round((value / max) * width)
  const empty = width - filled
  return "█".repeat(filled) + "░".repeat(empty)
}

// Helper to colorize happiness
const happinessColor = (happiness: number): string => {
  if (happiness >= 70) return c.green
  if (happiness >= 40) return c.yellow
  return c.red
}

// Format simulation stats
const formatStats = (stats: SimulationStats): string => {
  const pop = stats.population
  const happyColor = happinessColor(pop.averageHappiness)

  return `
${c.bgBlue}${c.white}${c.bold}  TICK ${String(stats.tickCount).padStart(3)}  ${c.reset} ${c.bgGreen}${c.bold} POP: ${pop.total} ${c.reset} ${c.bgYellow}${c.bold} +${stats.newArrivals} / -${stats.departures} ${c.reset}
${"─".repeat(62)}
  ${c.green}Employed:${c.reset}      ${String(pop.employed).padStart(3)} (${(pop.total > 0 ? (pop.employed / pop.total) * 100 : 0).toFixed(0).padStart(3)}%)  ${progressBar(pop.employed, Math.max(pop.total, 1), 15)}
  ${c.yellow}Unemployed:${c.reset}    ${String(pop.unemployed).padStart(3)} (${(pop.total > 0 ? (pop.unemployed / pop.total) * 100 : 0).toFixed(0).padStart(3)}%)  ${progressBar(pop.unemployed, Math.max(pop.total, 1), 15)}
  ${c.red}Homeless:${c.reset}      ${String(pop.homeless).padStart(3)} (${(pop.total > 0 ? (pop.homeless / pop.total) * 100 : 0).toFixed(0).padStart(3)}%)  ${progressBar(pop.homeless, Math.max(pop.total, 1), 15)}
  ${c.magenta}Happiness:${c.reset}     ${happyColor}${pop.averageHappiness.toFixed(1).padStart(5)}%${c.reset}  ${happyColor}${progressBar(pop.averageHappiness, 100, 15)}${c.reset}
`
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


// Main simulation program
const simulation = Effect.gen(function* () {
  const sim = yield* SimulationService
  const pop = yield* PopulationService

  yield* Console.log(`
${c.bold}${c.cyan}╔════════════════════════════════════════════════════════════════╗
║        EFFECT CITY - SimulationService Demo                    ║
╚════════════════════════════════════════════════════════════════╝${c.reset}

This demo shows the SimulationService orchestrating:
  ${c.cyan}•${c.reset} Clock - controls pause/resume and simulation speed
  ${c.cyan}•${c.reset} GameLoop - stream-based tick system
  ${c.cyan}•${c.reset} PopulationService - citizen happiness and growth

${c.dim}The simulation runs automatically with configurable tick rate.${c.reset}
`)

  yield* Effect.sleep(Duration.seconds(2))

  // Seed initial population with some housed/employed citizens
  yield* Console.log(`${c.bold}Setting up initial city state...${c.reset}\n`)

  // Add 5 citizens with varying states
  const citizens = [
    { id: "citizen-001" as CitizenId, age: 28, home: true, job: true },
    { id: "citizen-002" as CitizenId, age: 35, home: true, job: true },
    { id: "citizen-003" as CitizenId, age: 42, home: true, job: false },
    { id: "citizen-004" as CitizenId, age: 24, home: false, job: false },
    { id: "citizen-005" as CitizenId, age: 55, home: true, job: true },
  ]

  for (const c of citizens) {
    yield* pop.addCitizen(Citizen.homeless(c.id, c.age, 50))
    if (c.home) {
      yield* pop.assignHome(c.id, `home-${c.id}` as BuildingId)
    }
    if (c.job) {
      yield* pop.assignWorkplace(c.id, `work-${c.id}` as BuildingId)
    }
  }

  // Configure simulation
  yield* sim.setConfig({ availableHomes: 8, availableJobs: 5 })
  const config = yield* sim.getConfig

  yield* Console.log(`${c.bold}Simulation Config:${c.reset}`)
  yield* Console.log(`  Available Homes: ${c.green}${config.availableHomes}${c.reset}`)
  yield* Console.log(`  Available Jobs:  ${c.green}${config.availableJobs}${c.reset}\n`)

  // Show initial state
  const initialStats = yield* sim.getStats
  yield* Console.log(`${c.bold}Initial City State:${c.reset}`)
  yield* Console.log(formatStats({ ...initialStats, tickCount: 0, newArrivals: 0, departures: 0 }))

  const initialCitizens = yield* pop.getCitizens
  yield* Console.log(`  ${c.dim}Citizens:${c.reset}`)
  for (let i = 0; i < initialCitizens.length; i++) {
    yield* Console.log(formatCitizen(initialCitizens[i], i))
  }

  yield* Effect.sleep(Duration.seconds(2))

  // Run manual ticks to show the simulation in action
  yield* Console.log(`\n${c.bold}Running simulation (10 ticks)...${c.reset}\n`)

  for (let i = 0; i < 10; i++) {
    const stats = yield* sim.runTick

    yield* Console.log(formatStats(stats))

    // Show citizen list every 3 ticks
    if (i % 3 === 2 || i === 9) {
      const currentCitizens = yield* pop.getCitizens
      yield* Console.log(`  ${c.dim}Citizens (${currentCitizens.length}):${c.reset}`)
      for (let j = 0; j < Math.min(currentCitizens.length, 8); j++) {
        yield* Console.log(formatCitizen(currentCitizens[j], j))
      }
      if (currentCitizens.length > 8) {
        yield* Console.log(`  ${c.dim}... and ${currentCitizens.length - 8} more${c.reset}`)
      }
    }

    yield* Effect.sleep(Duration.millis(500))
  }

  // Show speed controls demo
  yield* Console.log(`\n${c.bold}Speed Control Demo:${c.reset}`)
  yield* Console.log(`${c.dim}The Clock supports 1x, 2x, and 3x speed modes.${c.reset}\n`)

  yield* sim.setSpeed(2)
  const clockState = yield* sim.getClockState
  yield* Console.log(`  Current Speed: ${c.cyan}${clockState.speed}x${c.reset}`)
  yield* Console.log(`  Is Paused: ${clockState.isPaused ? c.yellow + "Yes" : c.green + "No"}${c.reset}`)
  yield* Console.log(`  Total Ticks: ${c.cyan}${clockState.tickCount}${c.reset}`)

  // Final stats
  const finalStats = yield* sim.getStats

  yield* Console.log(`
${c.bold}${c.cyan}╔════════════════════════════════════════════════════════════════╗
║                    Simulation Complete!                        ║
╚════════════════════════════════════════════════════════════════╝${c.reset}

${c.bold}Final Statistics:${c.reset}
  Starting Population: 5
  Final Population:    ${finalStats.population.total}
  Total Ticks:         ${finalStats.tickCount}

${c.bold}SimulationService Features:${c.reset}
  ${c.green}✓${c.reset} Orchestrates all simulation services in correct order
  ${c.green}✓${c.reset} Provides pause/resume/speed controls via Clock
  ${c.green}✓${c.reset} Emits events for UI updates (TickStarted, TickCompleted, etc.)
  ${c.green}✓${c.reset} Configurable growth parameters
  ${c.green}✓${c.reset} Manual tick mode for testing/demos

${c.dim}Run with: bun run demo:simulation${c.reset}
`)
})

// Run the program
const program = simulation.pipe(
  Effect.provide(SimulationLayer),
  Effect.scoped
)

Effect.runPromise(program).catch(console.error)
