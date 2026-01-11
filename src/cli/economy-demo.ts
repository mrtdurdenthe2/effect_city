import { Effect, Console, Duration } from "effect"
import { Citizen, CitizenId, BuildingId } from "../domain/Citizen.js"
import { PopulationService } from "../services/PopulationService.js"
import { EconomyService } from "../services/EconomyService.js"
import { SimulationService, SimulationLayer, type SimulationStats } from "../services/SimulationService.js"

// ANSI color codes
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
  bgRed: "\x1b[41m",
}

const formatMoney = (amount: number): string => {
  const prefix = amount >= 0 ? "" : "-"
  const abs = Math.abs(amount)
  if (abs >= 1000000) {
    return `${prefix}$${(abs / 1000000).toFixed(2)}M`
  }
  if (abs >= 1000) {
    return `${prefix}$${(abs / 1000).toFixed(1)}K`
  }
  return `${prefix}$${abs.toFixed(0)}`
}


const formatStats = (stats: SimulationStats): string => {
  const { population: pop, treasury } = stats
  const netIncome = treasury.lastIncome.total - treasury.lastExpenses.total
  const netColor = netIncome >= 0 ? c.green : c.red
  const netSign = netIncome >= 0 ? "+" : ""
  const balanceColor = treasury.balance >= 0 ? c.green : c.red

  return `
${c.bgBlue}${c.white}${c.bold}  TICK ${String(stats.tickCount).padStart(3)}  ${c.reset} ${treasury.balance >= 0 ? c.bgGreen : c.bgRed}${c.bold} ${formatMoney(treasury.balance)} ${c.reset}
${"═".repeat(62)}

${c.bold}POPULATION${c.reset}
  Citizens: ${c.cyan}${pop.total}${c.reset}  (${c.green}+${stats.newArrivals}${c.reset} / ${c.red}-${stats.departures}${c.reset})
  Employed: ${pop.employed}/${pop.total} (${pop.total > 0 ? ((pop.employed / pop.total) * 100).toFixed(0) : 0}%)

${c.bold}TREASURY${c.reset}
  Balance:     ${balanceColor}${formatMoney(treasury.balance)}${c.reset}
  Net Income:  ${netColor}${netSign}${formatMoney(netIncome)}${c.reset}/tick

${c.bold}INCOME${c.reset} ${c.green}+${formatMoney(treasury.lastIncome.total)}${c.reset}
  Residential: ${c.green}+${formatMoney(treasury.lastIncome.residentialTax)}${c.reset}
  Commercial:  ${c.green}+${formatMoney(treasury.lastIncome.commercialTax)}${c.reset}
  Industrial:  ${c.green}+${formatMoney(treasury.lastIncome.industrialTax)}${c.reset}

${c.bold}EXPENSES${c.reset} ${c.red}-${formatMoney(treasury.lastExpenses.total)}${c.reset}
  Police:         ${c.red}-${formatMoney(treasury.lastExpenses.police)}${c.reset}
  Fire:           ${c.red}-${formatMoney(treasury.lastExpenses.fire)}${c.reset}
  Health:         ${c.red}-${formatMoney(treasury.lastExpenses.health)}${c.reset}
  Education:      ${c.red}-${formatMoney(treasury.lastExpenses.education)}${c.reset}
  Transportation: ${c.red}-${formatMoney(treasury.lastExpenses.transportation)}${c.reset}
  Utilities:      ${c.red}-${formatMoney(treasury.lastExpenses.utilities)}${c.reset}
${"─".repeat(62)}`
}

const simulation = Effect.gen(function* () {
  const sim = yield* SimulationService
  const pop = yield* PopulationService
  const econ = yield* EconomyService

  yield* Console.log(`
${c.bold}${c.cyan}╔════════════════════════════════════════════════════════════════╗
║           EFFECT CITY - Economy Service Demo                   ║
╚════════════════════════════════════════════════════════════════╝${c.reset}

This demo shows the EconomyService managing:
  ${c.cyan}•${c.reset} Treasury - city funds, income, expenses
  ${c.cyan}•${c.reset} Taxes - residential, commercial, industrial rates
  ${c.cyan}•${c.reset} Budget - police, fire, health, education, transportation
  ${c.cyan}•${c.reset} Utilities - power/water costs

${c.dim}Watch the economy grow (or collapse!) based on city conditions.${c.reset}
`)

  yield* Effect.sleep(Duration.seconds(2))

  // Setup initial city
  yield* Console.log(`${c.bold}Setting up city...${c.reset}\n`)

  // Add employed citizens (they pay taxes!)
  const citizens = [
    { id: "citizen-001" as CitizenId, age: 28, home: true, job: true },
    { id: "citizen-002" as CitizenId, age: 35, home: true, job: true },
    { id: "citizen-003" as CitizenId, age: 42, home: true, job: true },
    { id: "citizen-004" as CitizenId, age: 24, home: true, job: true },
    { id: "citizen-005" as CitizenId, age: 55, home: true, job: true },
    { id: "citizen-006" as CitizenId, age: 31, home: true, job: true },
    { id: "citizen-007" as CitizenId, age: 45, home: true, job: true },
    { id: "citizen-008" as CitizenId, age: 29, home: true, job: true },
  ]

  for (const citizen of citizens) {
    yield* pop.addCitizen(Citizen.homeless(citizen.id, citizen.age, 60))
    if (citizen.home) {
      yield* pop.assignHome(citizen.id, `home-${citizen.id}` as BuildingId)
    }
    if (citizen.job) {
      yield* pop.assignWorkplace(citizen.id, `work-${citizen.id}` as BuildingId)
    }
  }

  // Configure simulation with more buildings
  yield* sim.setConfig({
    availableHomes: 15,
    availableJobs: 12,
    buildings: { residential: 10, commercial: 5, industrial: 3 },
    utilityCosts: 100
  })

  // Show initial state
  const taxRates = yield* econ.getTaxRates
  const budget = yield* econ.getBudget
  const initialBalance = yield* econ.getBalance

  yield* Console.log(`${c.bold}Initial Configuration:${c.reset}`)
  yield* Console.log(`  Starting Balance: ${c.green}${formatMoney(initialBalance)}${c.reset}`)
  yield* Console.log(``)
  yield* Console.log(`  ${c.bold}Tax Rates:${c.reset}`)
  yield* Console.log(`    Residential: ${c.cyan}${taxRates.residential}%${c.reset}`)
  yield* Console.log(`    Commercial:  ${c.cyan}${taxRates.commercial}%${c.reset}`)
  yield* Console.log(`    Industrial:  ${c.cyan}${taxRates.industrial}%${c.reset}`)
  yield* Console.log(``)
  yield* Console.log(`  ${c.bold}Budget Funding:${c.reset}`)
  yield* Console.log(`    Police:         ${c.cyan}${budget.police}%${c.reset}`)
  yield* Console.log(`    Fire:           ${c.cyan}${budget.fire}%${c.reset}`)
  yield* Console.log(`    Health:         ${c.cyan}${budget.health}%${c.reset}`)
  yield* Console.log(`    Education:      ${c.cyan}${budget.education}%${c.reset}`)
  yield* Console.log(`    Transportation: ${c.cyan}${budget.transportation}%${c.reset}`)

  yield* Effect.sleep(Duration.seconds(2))

  // Run simulation
  yield* Console.log(`\n${c.bold}Running economy simulation (15 ticks)...${c.reset}\n`)

  for (let i = 0; i < 15; i++) {
    const stats = yield* sim.runTick
    yield* Console.log(formatStats(stats))
    yield* Effect.sleep(Duration.millis(400))
  }

  // Now demonstrate tax adjustment
  yield* Console.log(`\n${c.bold}Raising taxes to boost revenue...${c.reset}`)
  yield* econ.setTaxRates({ residential: 12, commercial: 15, industrial: 18 })

  const newRates = yield* econ.getTaxRates
  yield* Console.log(`  New Residential Rate: ${c.yellow}${newRates.residential}%${c.reset}`)
  yield* Console.log(`  New Commercial Rate:  ${c.yellow}${newRates.commercial}%${c.reset}`)
  yield* Console.log(`  New Industrial Rate:  ${c.yellow}${newRates.industrial}%${c.reset}`)

  yield* Effect.sleep(Duration.seconds(1))

  yield* Console.log(`\n${c.bold}Running with higher taxes (10 ticks)...${c.reset}\n`)

  for (let i = 0; i < 10; i++) {
    const stats = yield* sim.runTick
    yield* Console.log(formatStats(stats))
    yield* Effect.sleep(Duration.millis(400))
  }

  // Demonstrate budget cuts
  yield* Console.log(`\n${c.bold}Cutting budget to reduce expenses...${c.reset}`)
  yield* econ.setBudget({
    police: 50,
    fire: 50,
    health: 75,
    education: 60,
    transportation: 40
  })

  const newBudget = yield* econ.getBudget
  yield* Console.log(`  Police:         ${c.yellow}${newBudget.police}%${c.reset} (was 100%)`)
  yield* Console.log(`  Fire:           ${c.yellow}${newBudget.fire}%${c.reset} (was 100%)`)
  yield* Console.log(`  Health:         ${c.yellow}${newBudget.health}%${c.reset} (was 100%)`)
  yield* Console.log(`  Education:      ${c.yellow}${newBudget.education}%${c.reset} (was 100%)`)
  yield* Console.log(`  Transportation: ${c.yellow}${newBudget.transportation}%${c.reset} (was 100%)`)

  yield* Effect.sleep(Duration.seconds(1))

  yield* Console.log(`\n${c.bold}Running with reduced budget (10 ticks)...${c.reset}\n`)

  for (let i = 0; i < 10; i++) {
    const stats = yield* sim.runTick
    yield* Console.log(formatStats(stats))
    yield* Effect.sleep(Duration.millis(400))
  }

  // Final summary
  const finalTreasury = yield* econ.getTreasury

  yield* Console.log(`
${c.bold}${c.cyan}╔════════════════════════════════════════════════════════════════╗
║                    Economy Demo Complete!                      ║
╚════════════════════════════════════════════════════════════════╝${c.reset}

${c.bold}Final Treasury:${c.reset}
  Balance:      ${finalTreasury.balance >= 0 ? c.green : c.red}${formatMoney(finalTreasury.balance)}${c.reset}
  Total Earned: ${c.green}${formatMoney(finalTreasury.totalEarned)}${c.reset}
  Total Spent:  ${c.red}${formatMoney(finalTreasury.totalSpent)}${c.reset}
  Net Profit:   ${finalTreasury.totalEarned - finalTreasury.totalSpent >= 0 ? c.green : c.red}${formatMoney(finalTreasury.totalEarned - finalTreasury.totalSpent)}${c.reset}

${c.bold}EconomyService Features:${c.reset}
  ${c.green}✓${c.reset} Treasury management (balance, income, expenses)
  ${c.green}✓${c.reset} Tax collection from citizens and buildings
  ${c.green}✓${c.reset} Adjustable tax rates (residential/commercial/industrial)
  ${c.green}✓${c.reset} Budget allocation for city services
  ${c.green}✓${c.reset} Utility cost tracking
  ${c.green}✓${c.reset} Debt detection and tracking
  ${c.green}✓${c.reset} Economic event pub/sub

${c.dim}Run with: bun run demo:economy${c.reset}
`)
})

const program = simulation.pipe(
  Effect.provide(SimulationLayer),
  Effect.scoped
)

Effect.runPromise(program).catch(console.error)
