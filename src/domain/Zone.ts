import { Schema, Array as Arr } from "effect"
import { GridPosition } from "./Grid.js"

// Zone ID
export const ZoneId = Schema.String.pipe(Schema.brand("ZoneId"))
export type ZoneId = typeof ZoneId.Type

// Zone types: Residential, Commercial, Industrial
export const ZoneType = Schema.Literal("residential", "commercial", "industrial")
export type ZoneType = typeof ZoneType.Type

// Zone density affects building size/capacity
export const ZoneDensity = Schema.Literal("low", "medium", "high")
export type ZoneDensity = typeof ZoneDensity.Type

// A zone represents a painted area on the grid
export class Zone extends Schema.Class<Zone>("Zone")({
  id: ZoneId,
  type: ZoneType,
  density: ZoneDensity,
  cells: Schema.Array(GridPosition),
  demand: Schema.Number.pipe(Schema.clamp(0, 100)),
  buildingCount: Schema.Number.pipe(Schema.int(), Schema.nonNegative())
}) {
  static create(id: ZoneId, type: ZoneType, initialCell: GridPosition): Zone {
    return new Zone({
      id,
      type,
      density: "low",
      cells: [initialCell],
      demand: 50,
      buildingCount: 0
    })
  }

  addCell(position: GridPosition): Zone {
    if (this.hasCell(position)) return this
    return new Zone({
      ...this,
      cells: [...this.cells, position]
    })
  }

  removeCell(position: GridPosition): Zone {
    return new Zone({
      ...this,
      cells: Arr.filter(this.cells, (c) => !c.isEqual(position))
    })
  }

  hasCell(position: GridPosition): boolean {
    return Arr.some(this.cells, (c) => c.isEqual(position))
  }

  isEmpty(): boolean {
    return this.cells.length === 0
  }

  size(): number {
    return this.cells.length
  }

  withDensity(density: ZoneDensity): Zone {
    return new Zone({ ...this, density })
  }

  withDemand(demand: number): Zone {
    return new Zone({ ...this, demand })
  }

  incrementBuildingCount(): Zone {
    return new Zone({ ...this, buildingCount: this.buildingCount + 1 })
  }

  decrementBuildingCount(): Zone {
    return new Zone({
      ...this,
      buildingCount: Math.max(0, this.buildingCount - 1)
    })
  }

  // Get available cells (those without buildings)
  getAvailableCells(occupiedCells: ReadonlyArray<GridPosition>): ReadonlyArray<GridPosition> {
    return Arr.filter(this.cells, (cell) =>
      !Arr.some(occupiedCells, (occupied) => cell.isEqual(occupied))
    )
  }
}

// Zone statistics
export class ZoneStats extends Schema.Class<ZoneStats>("ZoneStats")({
  residentialZones: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  commercialZones: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  industrialZones: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  totalZonedCells: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  residentialCells: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  commercialCells: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  industrialCells: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  residentialDemand: Schema.Number.pipe(Schema.clamp(0, 100)),
  commercialDemand: Schema.Number.pipe(Schema.clamp(0, 100)),
  industrialDemand: Schema.Number.pipe(Schema.clamp(0, 100))
}) {
  static empty(): ZoneStats {
    return new ZoneStats({
      residentialZones: 0,
      commercialZones: 0,
      industrialZones: 0,
      totalZonedCells: 0,
      residentialCells: 0,
      commercialCells: 0,
      industrialCells: 0,
      residentialDemand: 50,
      commercialDemand: 50,
      industrialDemand: 50
    })
  }
}

// Zone color mapping for rendering
export const ZONE_COLORS = {
  residential: 0x4caf50, // Green
  commercial: 0x2196f3, // Blue
  industrial: 0xffc107 // Yellow/Orange
} as const

// Zone short codes for display
export const ZONE_SHORT_CODES = {
  residential: "R",
  commercial: "C",
  industrial: "I"
} as const
