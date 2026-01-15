import { Schema } from "effect"
import { GridPosition } from "./Grid.js"

// Business ID
export const BusinessId = Schema.String.pipe(Schema.brand("BusinessId"))
export type BusinessId = typeof BusinessId.Type

// Business types based on zone
export const BusinessType = Schema.Literal("retail", "office", "factory", "warehouse")
export type BusinessType = typeof BusinessType.Type

// Business size affects job capacity
export const BusinessSize = Schema.Literal("small", "medium", "large")
export type BusinessSize = typeof BusinessSize.Type

// A business provides jobs and generates economic activity
export class Business extends Schema.Class<Business>("Business")({
  id: BusinessId,
  name: Schema.String,
  type: BusinessType,
  size: BusinessSize,
  position: GridPosition,
  zoneId: Schema.String,
  jobCapacity: Schema.Number.pipe(Schema.int(), Schema.positive()),
  employeeCount: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  revenue: Schema.Number.pipe(Schema.nonNegative())
}) {
  static create(
    id: BusinessId,
    name: string,
    type: BusinessType,
    size: BusinessSize,
    position: GridPosition,
    zoneId: string
  ): Business {
    const jobCapacity = getJobCapacity(size)
    return new Business({
      id,
      name,
      type,
      size,
      position,
      zoneId,
      jobCapacity,
      employeeCount: 0,
      revenue: 0
    })
  }

  get availableJobs(): number {
    return this.jobCapacity - this.employeeCount
  }

  get isFull(): boolean {
    return this.employeeCount >= this.jobCapacity
  }

  hire(): Business {
    if (this.isFull) return this
    return new Business({
      ...this,
      employeeCount: this.employeeCount + 1
    })
  }

  removeEmployee(): Business {
    if (this.employeeCount <= 0) return this
    return new Business({
      ...this,
      employeeCount: this.employeeCount - 1
    })
  }

  withRevenue(revenue: number): Business {
    return new Business({ ...this, revenue })
  }
}

// Job capacity by business size
function getJobCapacity(size: BusinessSize): number {
  switch (size) {
    case "small":
      return 5
    case "medium":
      return 15
    case "large":
      return 40
  }
}

// Business statistics
export class BusinessStats extends Schema.Class<BusinessStats>("BusinessStats")({
  totalBusinesses: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  retailCount: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  officeCount: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  factoryCount: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  warehouseCount: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  totalJobCapacity: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  totalEmployees: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  availableJobs: Schema.Number.pipe(Schema.int(), Schema.nonNegative())
}) {
  static empty(): BusinessStats {
    return new BusinessStats({
      totalBusinesses: 0,
      retailCount: 0,
      officeCount: 0,
      factoryCount: 0,
      warehouseCount: 0,
      totalJobCapacity: 0,
      totalEmployees: 0,
      availableJobs: 0
    })
  }
}

// Business name generators by type
export const BUSINESS_NAMES = {
  retail: [
    "Corner Store", "Quick Mart", "City Market", "Fresh Foods",
    "Daily Goods", "Town Shop", "Main Street Market", "Local Grocery"
  ],
  office: [
    "Tech Solutions", "City Services", "Metro Office", "Business Center",
    "Professional Group", "Consulting Co", "Downtown Partners", "Corporate Hub"
  ],
  factory: [
    "Metro Manufacturing", "City Works", "Industrial Co", "Production Plus",
    "Assembly Line Inc", "Factory Direct", "Manufacturing Hub", "Build Corp"
  ],
  warehouse: [
    "City Storage", "Metro Logistics", "Distribution Center", "Freight Hub",
    "Storage Solutions", "Warehouse Direct", "Shipping Co", "Logistics Plus"
  ]
} as const

// Map zone types to business types
export const ZONE_TO_BUSINESS_TYPE = {
  commercial: ["retail", "office"] as const,
  industrial: ["factory", "warehouse"] as const
} as const
