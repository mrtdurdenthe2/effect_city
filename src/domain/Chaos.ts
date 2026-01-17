import { Schema } from "effect"
import { CitizenId } from "./Citizen.js"

export const ChaosEventId = Schema.String.pipe(Schema.brand("ChaosEventId"))
export type ChaosEventId = typeof ChaosEventId.Type

// Types of chaos events that can occur
export const ChaosEventType = Schema.Literal(
  "car_crash",
  "citizen_accident",
  "citizen_illness",
  "power_outage",
  "water_main_break",
  "fire"
)
export type ChaosEventType = typeof ChaosEventType.Type

// Severity levels for chaos events
export const ChaosSeverity = Schema.Literal("minor", "moderate", "major")
export type ChaosSeverity = typeof ChaosSeverity.Type

// Information about an affected citizen
export class AffectedCitizen extends Schema.Class<AffectedCitizen>("AffectedCitizen")({
  id: CitizenId,
  firstName: Schema.String,
  lastName: Schema.String,
  age: Schema.Number.pipe(Schema.int(), Schema.positive()),
  wasEmployed: Schema.Boolean,
  hadHome: Schema.Boolean
}) {
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`
  }
}

// A chaos event affecting the city
export class ChaosEvent extends Schema.Class<ChaosEvent>("ChaosEvent")({
  id: ChaosEventId,
  type: ChaosEventType,
  severity: ChaosSeverity,
  position: Schema.Struct({ x: Schema.Number, y: Schema.Number }),
  affectedCitizenIds: Schema.Array(CitizenId),
  affectedCitizenDetails: Schema.Array(AffectedCitizen),
  happinessImpact: Schema.Number.pipe(Schema.int()), // negative for bad events
  resolved: Schema.Boolean,
  tickOccurred: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  // For car crashes - the road type where it occurred
  roadType: Schema.OptionFromNullOr(Schema.Literal("street", "avenue", "highway"))
}) {
  get affectedCount(): number {
    return this.affectedCitizenIds.length
  }
}

// Configuration for chaos simulation
export interface ChaosConfig {
  readonly enabled: boolean
  readonly carCrashChance: number      // 0-1 probability per tick
  readonly citizenAccidentChance: number
  readonly citizenIllnessChance: number
  readonly powerOutageChance: number
  readonly waterMainBreakChance: number
  readonly fireChance: number
}

export const defaultChaosConfig: ChaosConfig = {
  enabled: true,
  carCrashChance: 0.02,        // 2% per tick
  citizenAccidentChance: 0.01, // 1% per tick
  citizenIllnessChance: 0.015, // 1.5% per tick
  powerOutageChance: 0.005,    // 0.5% per tick
  waterMainBreakChance: 0.005, // 0.5% per tick
  fireChance: 0.008            // 0.8% per tick
}

// Stats about chaos events
export interface ChaosStats {
  readonly totalEvents: number
  readonly activeEvents: number
  readonly resolvedEvents: number
  readonly eventsByType: Record<ChaosEventType, number>
  readonly totalHappinessImpact: number
}
