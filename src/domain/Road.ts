import { Schema, Array as Arr } from "effect"
import { GridPosition } from "./Grid.js"

// Road ID
export const RoadId = Schema.String.pipe(Schema.brand("RoadId"))
export type RoadId = typeof RoadId.Type

// Road types: affects appearance and traffic capacity
export const RoadType = Schema.Literal("street", "avenue", "highway")
export type RoadType = typeof RoadType.Type

// A road segment represents a connected network of road cells
export class RoadSegment extends Schema.Class<RoadSegment>("RoadSegment")({
  id: RoadId,
  type: RoadType,
  cells: Schema.Array(GridPosition)
}) {
  static create(id: RoadId, type: RoadType, initialCell: GridPosition): RoadSegment {
    return new RoadSegment({
      id,
      type,
      cells: [initialCell]
    })
  }

  addCell(position: GridPosition): RoadSegment {
    if (this.hasCell(position)) return this
    return new RoadSegment({
      ...this,
      cells: [...this.cells, position]
    })
  }

  removeCell(position: GridPosition): RoadSegment {
    return new RoadSegment({
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

  withType(type: RoadType): RoadSegment {
    return new RoadSegment({ ...this, type })
  }

  // Merge another road segment into this one
  merge(other: RoadSegment): RoadSegment {
    const newCells = [...this.cells]
    for (const cell of other.cells) {
      if (!this.hasCell(cell)) {
        newCells.push(cell)
      }
    }
    return new RoadSegment({
      ...this,
      cells: newCells
    })
  }
}

// Road network statistics
export class RoadStats extends Schema.Class<RoadStats>("RoadStats")({
  totalRoadCells: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  streetCells: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  avenueCells: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  highwayCells: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  networkCount: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  largestNetworkSize: Schema.Number.pipe(Schema.int(), Schema.nonNegative())
}) {
  static empty(): RoadStats {
    return new RoadStats({
      totalRoadCells: 0,
      streetCells: 0,
      avenueCells: 0,
      highwayCells: 0,
      networkCount: 0,
      largestNetworkSize: 0
    })
  }
}

// Road color mapping for rendering
export const ROAD_COLORS = {
  street: 0x555555, // Dark gray
  avenue: 0x666666, // Medium gray
  highway: 0x777777 // Light gray
} as const

// Road width multipliers for rendering
export const ROAD_WIDTHS = {
  street: 1.0,
  avenue: 1.2,
  highway: 1.5
} as const

// Traffic capacity per road type
export const ROAD_CAPACITY = {
  street: 100,
  avenue: 300,
  highway: 1000
} as const
