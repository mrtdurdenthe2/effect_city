import { Schema } from "effect"

// Serialized cell for wire transfer
export const SerializedCell = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  contentType: Schema.Literal("empty", "road", "zone", "building"),
  zoneId: Schema.OptionFromNullOr(Schema.String),
  zoneType: Schema.OptionFromNullOr(Schema.Literal("residential", "commercial", "industrial")),
  buildingId: Schema.OptionFromNullOr(Schema.String),
  roadType: Schema.OptionFromNullOr(Schema.Literal("street", "avenue", "highway"))
})
export type SerializedCell = typeof SerializedCell.Type

// Serialized zone for wire transfer
export const SerializedZone = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("residential", "commercial", "industrial"),
  density: Schema.Literal("low", "medium", "high"),
  cells: Schema.Array(Schema.Struct({ x: Schema.Number, y: Schema.Number })),
  demand: Schema.Number,
  buildingCount: Schema.Number
})
export type SerializedZone = typeof SerializedZone.Type

// Simulation stats for UI
export const SerializedSimulationStats = Schema.Struct({
  tickCount: Schema.Number,
  population: Schema.Struct({
    total: Schema.Number,
    employed: Schema.Number,
    unemployed: Schema.Number,
    homeless: Schema.Number,
    averageHappiness: Schema.Number
  }),
  treasury: Schema.Struct({
    balance: Schema.Number,
    lastIncome: Schema.Number,
    lastExpenses: Schema.Number
  }),
  zones: Schema.Struct({
    residentialCells: Schema.Number,
    commercialCells: Schema.Number,
    industrialCells: Schema.Number,
    residentialDemand: Schema.Number,
    commercialDemand: Schema.Number,
    industrialDemand: Schema.Number
  }),
  grid: Schema.Struct({
    totalCells: Schema.Number,
    roadCells: Schema.Number,
    buildingCells: Schema.Number
  })
})
export type SerializedSimulationStats = typeof SerializedSimulationStats.Type

// Clock state
export const ClockState = Schema.Struct({
  isPaused: Schema.Boolean,
  speed: Schema.Literal(1, 2, 3),
  tickCount: Schema.Number
})
export type ClockState = typeof ClockState.Type

// Server -> Client messages
export const InitialStateMessage = Schema.Struct({
  type: Schema.Literal("initial_state"),
  grid: Schema.Array(SerializedCell),
  zones: Schema.Array(SerializedZone),
  stats: SerializedSimulationStats,
  clock: ClockState
})

export const CellUpdatedMessage = Schema.Struct({
  type: Schema.Literal("cell_updated"),
  x: Schema.Number,
  y: Schema.Number,
  contentType: Schema.Literal("empty", "road", "zone", "building"),
  zoneType: Schema.OptionFromNullOr(Schema.Literal("residential", "commercial", "industrial")),
  zoneId: Schema.OptionFromNullOr(Schema.String),
  buildingId: Schema.OptionFromNullOr(Schema.String),
  roadType: Schema.OptionFromNullOr(Schema.Literal("street", "avenue", "highway"))
})

export const SimulationTickMessage = Schema.Struct({
  type: Schema.Literal("simulation_tick"),
  stats: SerializedSimulationStats
})

export const ClockStateMessage = Schema.Struct({
  type: Schema.Literal("clock_state"),
  clock: ClockState
})

// Metrics snapshot for graphs
export const MetricEntry = Schema.Struct({
  name: Schema.String,
  value: Schema.Number,
  tags: Schema.Array(Schema.Struct({ key: Schema.String, value: Schema.String }))
})
export type MetricEntry = typeof MetricEntry.Type

export const MetricsSnapshot = Schema.Struct({
  tick: Schema.Number,
  timestamp: Schema.Number,
  metrics: Schema.Array(MetricEntry)
})
export type MetricsSnapshot = typeof MetricsSnapshot.Type

export const MetricsHistoryMessage = Schema.Struct({
  type: Schema.Literal("metrics_history"),
  snapshots: Schema.Array(MetricsSnapshot),
  metricNames: Schema.Array(Schema.String)
})

// Activity Events - Modular event system for city activity feed
// Each event type is a tagged union member that can be extended

// Business events
export const BusinessCreatedEvent = Schema.TaggedStruct("BusinessCreated", {
  businessId: Schema.String,
  businessName: Schema.String,
  businessType: Schema.Literal("retail", "office", "factory", "warehouse"),
  size: Schema.Literal("small", "medium", "large"),
  position: Schema.Struct({ x: Schema.Number, y: Schema.Number })
})

export const BusinessClosedEvent = Schema.TaggedStruct("BusinessClosed", {
  businessId: Schema.String,
  businessName: Schema.String
})

// Economy events
export const EnteredDebtEvent = Schema.TaggedStruct("EnteredDebt", {
  balance: Schema.Number
})

export const ExitedDebtEvent = Schema.TaggedStruct("ExitedDebt", {
  balance: Schema.Number
})

export const BankruptEvent = Schema.TaggedStruct("Bankrupt", {})

// Population events
export const CitizensArrivedEvent = Schema.TaggedStruct("CitizensArrived", {
  count: Schema.Number,
  totalPopulation: Schema.Number
})

export const CitizensLeftEvent = Schema.TaggedStruct("CitizensLeft", {
  count: Schema.Number,
  totalPopulation: Schema.Number,
  reason: Schema.Literal("unhappy", "homeless", "unemployed")
})

// Combined ActivityEvent union - add new event types here
export const ActivityEvent = Schema.Union(
  BusinessCreatedEvent,
  BusinessClosedEvent,
  EnteredDebtEvent,
  ExitedDebtEvent,
  BankruptEvent,
  CitizensArrivedEvent,
  CitizensLeftEvent
)
export type ActivityEvent = typeof ActivityEvent.Type

// Activity event message - sent from server to client
export const ActivityEventMessage = Schema.Struct({
  type: Schema.Literal("activity_event"),
  event: ActivityEvent,
  meta: Schema.Struct({
    services: Schema.Array(Schema.String),
    trace: Schema.Array(Schema.String)
  }),
  tick: Schema.Number,
  timestamp: Schema.Number
})

// Activity item for UI display - includes ID for React keys
export interface ActivityItem {
  id: string
  event: ActivityEvent
  meta: {
    services: string[]
    trace: string[]
  }
  tick: number
  timestamp: number
}

export const ServerMessage = Schema.Union(
  InitialStateMessage,
  CellUpdatedMessage,
  SimulationTickMessage,
  ClockStateMessage,
  MetricsHistoryMessage,
  ActivityEventMessage
)
export type ServerMessage = typeof ServerMessage.Type

// Client -> Server messages (minimal - only view controls)
export const SetSpeedMessage = Schema.Struct({
  type: Schema.Literal("set_speed"),
  speed: Schema.Literal(1, 2, 3)
})

export const TogglePauseMessage = Schema.Struct({
  type: Schema.Literal("toggle_pause")
})

export const RequestMetricsMessage = Schema.Struct({
  type: Schema.Literal("request_metrics"),
  count: Schema.Number
})

export const ClientMessage = Schema.Union(SetSpeedMessage, TogglePauseMessage, RequestMetricsMessage)
export type ClientMessage = typeof ClientMessage.Type
