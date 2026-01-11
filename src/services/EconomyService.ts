import { Context, Effect, Layer, Ref, PubSub, Queue, Scope, Metric } from "effect"
import {
  TaxRates,
  Budget,
  Treasury,
  IncomeReport,
  ExpenseReport,
  EconomyStats
} from "../domain/Economy.js"

// Metrics for economy tracking
const balanceGauge = Metric.gauge("economy.balance", {
  description: "Current treasury balance"
})

const incomeGauge = Metric.gauge("economy.income", {
  description: "Last tick income"
})

const expensesGauge = Metric.gauge("economy.expenses", {
  description: "Last tick expenses"
})

const debtTicksCounter = Metric.counter("economy.debt_ticks", {
  description: "Number of ticks spent in debt",
  incremental: true
})

// Events emitted by the economy service
export type EconomyEvent =
  | { readonly _tag: "TaxesCollected"; readonly income: IncomeReport }
  | { readonly _tag: "ExpensesPaid"; readonly expenses: ExpenseReport }
  | { readonly _tag: "BalanceChanged"; readonly oldBalance: number; readonly newBalance: number }
  | { readonly _tag: "EnteredDebt" }
  | { readonly _tag: "ExitedDebt" }
  | { readonly _tag: "Bankrupt" }

// Building counts for tax calculation
export interface BuildingCounts {
  readonly residential: number
  readonly commercial: number
  readonly industrial: number
}

export class EconomyService extends Context.Tag("EconomyService")<
  EconomyService,
  {
    // Treasury
    readonly getBalance: Effect.Effect<number>
    readonly getTreasury: Effect.Effect<Treasury>
    readonly addFunds: (amount: number, reason?: string) => Effect.Effect<void>
    readonly deductFunds: (amount: number, reason?: string) => Effect.Effect<boolean>

    // Tax management
    readonly getTaxRates: Effect.Effect<TaxRates>
    readonly setTaxRates: (rates: Partial<{ residential: number; commercial: number; industrial: number }>) => Effect.Effect<void>
    readonly collectTaxes: (population: number, buildings: BuildingCounts) => Effect.Effect<IncomeReport>

    // Budget management
    readonly getBudget: Effect.Effect<Budget>
    readonly setBudget: (budget: Partial<{ police: number; fire: number; health: number; education: number; transportation: number }>) => Effect.Effect<void>
    readonly payExpenses: (population: number, utilityCosts: number) => Effect.Effect<ExpenseReport>

    // Stats
    readonly getStats: (employmentRate: number) => Effect.Effect<EconomyStats>

    // Simulation tick
    readonly tick: (population: number, buildings: BuildingCounts, utilityCosts: number) => Effect.Effect<{ income: IncomeReport; expenses: ExpenseReport }>

    // Events
    readonly subscribe: Effect.Effect<Queue.Dequeue<EconomyEvent>, never, Scope.Scope>
  }
>() {}

// Tax revenue per building type per tick (base amount before tax rate applied)
const BASE_TAX_PER_RESIDENTIAL = 50  // Per residential building
const BASE_TAX_PER_COMMERCIAL = 100  // Per commercial building
const BASE_TAX_PER_INDUSTRIAL = 150  // Per industrial building

// Per-capita income tax
const BASE_INCOME_TAX_PER_CITIZEN = 10

export const EconomyServiceLive = Layer.effect(
  EconomyService,
  Effect.gen(function* () {
    const treasuryRef = yield* Ref.make<Treasury>(Treasury.initial(10000))
    const taxRatesRef = yield* Ref.make<TaxRates>(TaxRates.default())
    const budgetRef = yield* Ref.make<Budget>(Budget.default())
    const ticksInDebtRef = yield* Ref.make<number>(0)
    const wasInDebtRef = yield* Ref.make<boolean>(false)

    const eventBus = yield* PubSub.unbounded<EconomyEvent>()

    const updateMetrics = Effect.gen(function* () {
      const treasury = yield* Ref.get(treasuryRef)
      yield* Metric.set(balanceGauge, treasury.balance)
      yield* Metric.set(incomeGauge, treasury.lastIncome.total)
      yield* Metric.set(expensesGauge, treasury.lastExpenses.total)
    })

    const getBalance = Effect.map(Ref.get(treasuryRef), (t) => t.balance)

    const getTreasury = Ref.get(treasuryRef)

    const addFunds = (amount: number, _reason?: string) =>
      Effect.gen(function* () {
        const oldTreasury = yield* Ref.get(treasuryRef)
        const oldBalance = oldTreasury.balance
        const newBalance = oldBalance + amount

        yield* Ref.update(treasuryRef, (t) =>
          new Treasury({
            ...t,
            balance: newBalance,
            totalEarned: t.totalEarned + amount
          })
        )

        yield* PubSub.publish(eventBus, {
          _tag: "BalanceChanged",
          oldBalance,
          newBalance
        })

        // Check if we exited debt
        const wasInDebt = yield* Ref.get(wasInDebtRef)
        if (wasInDebt && newBalance >= 0) {
          yield* Ref.set(wasInDebtRef, false)
          yield* PubSub.publish(eventBus, { _tag: "ExitedDebt" })
        }

        yield* updateMetrics
      })

    const deductFunds = (amount: number, _reason?: string) =>
      Effect.gen(function* () {
        const oldTreasury = yield* Ref.get(treasuryRef)
        const oldBalance = oldTreasury.balance
        const newBalance = oldBalance - amount

        yield* Ref.update(treasuryRef, (t) =>
          new Treasury({
            ...t,
            balance: newBalance,
            totalSpent: t.totalSpent + amount
          })
        )

        yield* PubSub.publish(eventBus, {
          _tag: "BalanceChanged",
          oldBalance,
          newBalance
        })

        // Check if we entered debt
        const wasInDebt = yield* Ref.get(wasInDebtRef)
        if (!wasInDebt && newBalance < 0) {
          yield* Ref.set(wasInDebtRef, true)
          yield* PubSub.publish(eventBus, { _tag: "EnteredDebt" })
        }

        // Track debt ticks
        if (newBalance < 0) {
          yield* Ref.update(ticksInDebtRef, (n) => n + 1)
          yield* Metric.increment(debtTicksCounter)

          // Bankrupt after 100 ticks in debt
          const ticksInDebt = yield* Ref.get(ticksInDebtRef)
          if (ticksInDebt >= 100) {
            yield* PubSub.publish(eventBus, { _tag: "Bankrupt" })
          }
        } else {
          yield* Ref.set(ticksInDebtRef, 0)
        }

        yield* updateMetrics
        return true // Always allow deduction (can go into debt)
      })

    const getTaxRates = Ref.get(taxRatesRef)

    const setTaxRates = (rates: Partial<{ residential: number; commercial: number; industrial: number }>) =>
      Ref.update(taxRatesRef, (current) =>
        new TaxRates({
          residential: rates.residential ?? current.residential,
          commercial: rates.commercial ?? current.commercial,
          industrial: rates.industrial ?? current.industrial
        })
      )

    const collectTaxes = (population: number, buildings: BuildingCounts) =>
      Effect.gen(function* () {
        const rates = yield* Ref.get(taxRatesRef)

        // Calculate tax from each source
        const residentialTax = Math.floor(
          (population * BASE_INCOME_TAX_PER_CITIZEN * (rates.residential / 100)) +
          (buildings.residential * BASE_TAX_PER_RESIDENTIAL * (rates.residential / 100))
        )

        const commercialTax = Math.floor(
          buildings.commercial * BASE_TAX_PER_COMMERCIAL * (rates.commercial / 100)
        )

        const industrialTax = Math.floor(
          buildings.industrial * BASE_TAX_PER_INDUSTRIAL * (rates.industrial / 100)
        )

        const total = residentialTax + commercialTax + industrialTax

        const income = new IncomeReport({
          residentialTax,
          commercialTax,
          industrialTax,
          total
        })

        if (total > 0) {
          yield* addFunds(total, "tax_collection")
        }

        yield* Ref.update(treasuryRef, (t) =>
          new Treasury({ ...t, lastIncome: income })
        )

        yield* PubSub.publish(eventBus, { _tag: "TaxesCollected", income })

        return income
      })

    const getBudget = Ref.get(budgetRef)

    const setBudget = (budget: Partial<{ police: number; fire: number; health: number; education: number; transportation: number }>) =>
      Ref.update(budgetRef, (current) =>
        new Budget({
          police: budget.police ?? current.police,
          fire: budget.fire ?? current.fire,
          health: budget.health ?? current.health,
          education: budget.education ?? current.education,
          transportation: budget.transportation ?? current.transportation
        })
      )

    const payExpenses = (population: number, utilityCosts: number) =>
      Effect.gen(function* () {
        const budget = yield* Ref.get(budgetRef)

        // Calculate service costs based on population and funding level
        const basePerCapita = 2 // Cost per citizen per service per tick
        const police = Math.floor(population * basePerCapita * (budget.police / 100))
        const fire = Math.floor(population * basePerCapita * (budget.fire / 100))
        const health = Math.floor(population * basePerCapita * (budget.health / 100))
        const education = Math.floor(population * basePerCapita * (budget.education / 100))
        const transportation = Math.floor(population * basePerCapita * (budget.transportation / 100))

        const total = police + fire + health + education + transportation + utilityCosts

        const expenses = new ExpenseReport({
          police,
          fire,
          health,
          education,
          transportation,
          utilities: utilityCosts,
          total
        })

        if (total > 0) {
          yield* deductFunds(total, "expenses")
        }

        yield* Ref.update(treasuryRef, (t) =>
          new Treasury({ ...t, lastExpenses: expenses })
        )

        yield* PubSub.publish(eventBus, { _tag: "ExpensesPaid", expenses })

        return expenses
      })

    const getStats = (employmentRate: number) =>
      Effect.gen(function* () {
        const treasury = yield* Ref.get(treasuryRef)
        const taxRates = yield* Ref.get(taxRatesRef)
        const budget = yield* Ref.get(budgetRef)
        const ticksInDebt = yield* Ref.get(ticksInDebtRef)

        return new EconomyStats({
          treasury,
          taxRates,
          budget,
          employmentRate,
          ticksInDebt
        })
      })

    const tick = (population: number, buildings: BuildingCounts, utilityCosts: number) =>
      Effect.gen(function* () {
        // 1. Collect taxes
        const income = yield* collectTaxes(population, buildings)

        // 2. Pay expenses
        const expenses = yield* payExpenses(population, utilityCosts)

        return { income, expenses }
      })

    const subscribe = PubSub.subscribe(eventBus)

    return {
      getBalance,
      getTreasury,
      addFunds,
      deductFunds,
      getTaxRates,
      setTaxRates,
      collectTaxes,
      getBudget,
      setBudget,
      payExpenses,
      getStats,
      tick,
      subscribe
    } as const
  })
)
