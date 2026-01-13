import { Schema, Option } from "effect"

// Grid coordinates
export const GridX = Schema.Number.pipe(
  Schema.int(),
  Schema.nonNegative(),
  Schema.brand("GridX")
)
export type GridX = typeof GridX.Type

export const GridY = Schema.Number.pipe(
  Schema.int(),
  Schema.nonNegative(),
  Schema.brand("GridY")
)
export type GridY = typeof GridY.Type

export class GridPosition extends Schema.Class<GridPosition>("GridPosition")({
  x: GridX,
  y: GridY
}) {
  static create(x: number, y: number): GridPosition {
    return new GridPosition({ x: x as GridX, y: y as GridY })
  }

  toKey(): string {
    return `${this.x},${this.y}`
  }

  static fromKey(key: string): Option.Option<GridPosition> {
    const parts = key.split(",")
    if (parts.length !== 2) return Option.none()
    const x = parseInt(parts[0], 10)
    const y = parseInt(parts[1], 10)
    if (isNaN(x) || isNaN(y)) return Option.none()
    return Option.some(GridPosition.create(x, y))
  }

  isEqual(other: GridPosition): boolean {
    return this.x === other.x && this.y === other.y
  }

  neighbors(): ReadonlyArray<GridPosition> {
    const positions: GridPosition[] = []
    // Cardinal directions only (no diagonals for city grid)
    if (this.x > 0) positions.push(GridPosition.create(this.x - 1, this.y))
    if (this.y > 0) positions.push(GridPosition.create(this.x, this.y - 1))
    positions.push(GridPosition.create(this.x + 1, this.y))
    positions.push(GridPosition.create(this.x, this.y + 1))
    return positions
  }
}

// Cell content types
export const CellContentType = Schema.Literal("empty", "road", "zone", "building")
export type CellContentType = typeof CellContentType.Type

// A cell in the grid
export class GridCell extends Schema.Class<GridCell>("GridCell")({
  position: GridPosition,
  contentType: CellContentType,
  zoneId: Schema.Option(Schema.String),
  buildingId: Schema.Option(Schema.String),
  hasRoad: Schema.Boolean
}) {
  static empty(position: GridPosition): GridCell {
    return new GridCell({
      position,
      contentType: "empty",
      zoneId: Option.none(),
      buildingId: Option.none(),
      hasRoad: false
    })
  }

  withRoad(): GridCell {
    return new GridCell({
      ...this,
      contentType: "road",
      hasRoad: true,
      zoneId: Option.none() // Roads clear zones
    })
  }

  withZone(zoneId: string): GridCell {
    return new GridCell({
      ...this,
      contentType: "zone",
      zoneId: Option.some(zoneId),
      hasRoad: false // Zones clear roads
    })
  }

  withBuilding(buildingId: string): GridCell {
    return new GridCell({
      ...this,
      contentType: "building",
      buildingId: Option.some(buildingId)
      // Building keeps existing zone
    })
  }

  clear(): GridCell {
    return GridCell.empty(this.position)
  }

  isRoad(): boolean {
    return this.hasRoad
  }

  isZoned(): boolean {
    return Option.isSome(this.zoneId)
  }

  hasBuilding(): boolean {
    return Option.isSome(this.buildingId)
  }

  isEmpty(): boolean {
    return this.contentType === "empty"
  }
}

// Grid dimensions
export const DEFAULT_GRID_WIDTH = 64
export const DEFAULT_GRID_HEIGHT = 64

// Grid statistics
export class GridStats extends Schema.Class<GridStats>("GridStats")({
  width: Schema.Number.pipe(Schema.int(), Schema.positive()),
  height: Schema.Number.pipe(Schema.int(), Schema.positive()),
  totalCells: Schema.Number.pipe(Schema.int(), Schema.positive()),
  emptyCells: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  roadCells: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  zonedCells: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  buildingCells: Schema.Number.pipe(Schema.int(), Schema.nonNegative())
}) {}
