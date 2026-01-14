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

export const ServerMessage = Schema.Union(
  InitialStateMessage,
  CellUpdatedMessage,
  SimulationTickMessage,
  ClockStateMessage
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

export const ClientMessage = Schema.Union(SetSpeedMessage, TogglePauseMessage)
export type ClientMessage = typeof ClientMessage.Type
