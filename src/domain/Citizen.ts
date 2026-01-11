import { Schema, Option } from "effect"

export const CitizenId = Schema.String.pipe(Schema.brand("CitizenId"))
export type CitizenId = typeof CitizenId.Type

export const BuildingId = Schema.String.pipe(Schema.brand("BuildingId"))
export type BuildingId = typeof BuildingId.Type

export const EmploymentStatus = Schema.Literal("unemployed", "employed", "retired")
export type EmploymentStatus = typeof EmploymentStatus.Type

export class Citizen extends Schema.Class<Citizen>("Citizen")({
  id: CitizenId,
  homeId: Schema.Option(BuildingId),
  workplaceId: Schema.Option(BuildingId),
  employment: EmploymentStatus,
  happiness: Schema.Number.pipe(
    Schema.clamp(0, 100),
    Schema.annotations({ description: "Happiness level from 0-100" })
  ),
  age: Schema.Number.pipe(Schema.int(), Schema.positive())
}) {
  static homeless(id: CitizenId, age: number, happiness: number = 50): Citizen {
    return new Citizen({
      id,
      homeId: Option.none(),
      workplaceId: Option.none(),
      employment: "unemployed",
      happiness,
      age
    })
  }
}

export class PopulationStats extends Schema.Class<PopulationStats>("PopulationStats")({
  total: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  employed: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  unemployed: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  homeless: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  averageHappiness: Schema.Number.pipe(Schema.clamp(0, 100))
}) {}
