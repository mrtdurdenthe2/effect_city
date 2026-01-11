import { Schema } from "effect"

// Tax rates as percentages (0-100)
export class TaxRates extends Schema.Class<TaxRates>("TaxRates")({
  residential: Schema.Number.pipe(
    Schema.clamp(0, 20),
    Schema.annotations({ description: "Residential tax rate %" })
  ),
  commercial: Schema.Number.pipe(
    Schema.clamp(0, 20),
    Schema.annotations({ description: "Commercial tax rate %" })
  ),
  industrial: Schema.Number.pipe(
    Schema.clamp(0, 20),
    Schema.annotations({ description: "Industrial tax rate %" })
  )
}) {
  static default(): TaxRates {
    return new TaxRates({
      residential: 9,
      commercial: 9,
      industrial: 9
    })
  }
}

// Budget allocation for city services
export class Budget extends Schema.Class<Budget>("Budget")({
  police: Schema.Number.pipe(Schema.clamp(0, 100)),
  fire: Schema.Number.pipe(Schema.clamp(0, 100)),
  health: Schema.Number.pipe(Schema.clamp(0, 100)),
  education: Schema.Number.pipe(Schema.clamp(0, 100)),
  transportation: Schema.Number.pipe(Schema.clamp(0, 100))
}) {
  static default(): Budget {
    return new Budget({
      police: 100,
      fire: 100,
      health: 100,
      education: 100,
      transportation: 100
    })
  }

  // Calculate total monthly cost based on population
  totalMonthlyCost(population: number): number {
    const basePerCapita = 10 // Base cost per citizen per service
    const services = [this.police, this.fire, this.health, this.education, this.transportation]
    return services.reduce((total, funding) => {
      return total + (population * basePerCapita * (funding / 100))
    }, 0)
  }
}

// Income breakdown for a tick
export class IncomeReport extends Schema.Class<IncomeReport>("IncomeReport")({
  residentialTax: Schema.Number,
  commercialTax: Schema.Number,
  industrialTax: Schema.Number,
  total: Schema.Number
}) {
  static empty(): IncomeReport {
    return new IncomeReport({
      residentialTax: 0,
      commercialTax: 0,
      industrialTax: 0,
      total: 0
    })
  }
}

// Expense breakdown for a tick
export class ExpenseReport extends Schema.Class<ExpenseReport>("ExpenseReport")({
  police: Schema.Number,
  fire: Schema.Number,
  health: Schema.Number,
  education: Schema.Number,
  transportation: Schema.Number,
  utilities: Schema.Number,
  total: Schema.Number
}) {
  static empty(): ExpenseReport {
    return new ExpenseReport({
      police: 0,
      fire: 0,
      health: 0,
      education: 0,
      transportation: 0,
      utilities: 0,
      total: 0
    })
  }
}

// Complete treasury state
export class Treasury extends Schema.Class<Treasury>("Treasury")({
  balance: Schema.Number.pipe(
    Schema.annotations({ description: "Current money balance" })
  ),
  lastIncome: IncomeReport,
  lastExpenses: ExpenseReport,
  totalEarned: Schema.Number,
  totalSpent: Schema.Number
}) {
  static initial(startingBalance: number = 10000): Treasury {
    return new Treasury({
      balance: startingBalance,
      lastIncome: IncomeReport.empty(),
      lastExpenses: ExpenseReport.empty(),
      totalEarned: 0,
      totalSpent: 0
    })
  }

  get netIncome(): number {
    return this.lastIncome.total - this.lastExpenses.total
  }

  get isInDebt(): boolean {
    return this.balance < 0
  }
}

// Economic statistics
export class EconomyStats extends Schema.Class<EconomyStats>("EconomyStats")({
  treasury: Treasury,
  taxRates: TaxRates,
  budget: Budget,
  employmentRate: Schema.Number.pipe(Schema.clamp(0, 100)),
  ticksInDebt: Schema.Number.pipe(Schema.int(), Schema.nonNegative())
}) {}
