import { Context, Effect, Layer, Ref, Array as Arr, PubSub, Queue, Scope, Metric, Option } from "effect"
import {
  GridPosition,
  GridCell,
  GridStats,
  DEFAULT_GRID_WIDTH,
  DEFAULT_GRID_HEIGHT
} from "../domain/Grid.js"

// Metrics for grid tracking
const totalCellsGauge = Metric.gauge("grid.cells.total", {
  description: "Total number of cells in the grid"
})

const roadCellsGauge = Metric.gauge("grid.cells.road", {
  description: "Number of road cells"
})

const zonedCellsGauge = Metric.gauge("grid.cells.zoned", {
  description: "Number of zoned cells"
})

const buildingCellsGauge = Metric.gauge("grid.cells.building", {
  description: "Number of cells with buildings"
})

// Events emitted by the grid service
export type GridEvent =
  | { readonly _tag: "CellUpdated"; readonly position: GridPosition; readonly cell: GridCell }
  | { readonly _tag: "RoadPlaced"; readonly position: GridPosition }
  | { readonly _tag: "RoadRemoved"; readonly position: GridPosition }
  | { readonly _tag: "ZonePainted"; readonly position: GridPosition; readonly zoneId: string }
  | { readonly _tag: "ZoneCleared"; readonly position: GridPosition }
  | { readonly _tag: "BuildingPlaced"; readonly position: GridPosition; readonly buildingId: string }
  | { readonly _tag: "BuildingRemoved"; readonly position: GridPosition }
  | { readonly _tag: "CellCleared"; readonly position: GridPosition }

export class GridService extends Context.Tag("GridService")<
  GridService,
  {
    // Grid dimensions
    readonly getWidth: Effect.Effect<number>
    readonly getHeight: Effect.Effect<number>

    // Cell access
    readonly getCell: (position: GridPosition) => Effect.Effect<GridCell>
    readonly getCells: Effect.Effect<ReadonlyMap<string, GridCell>>
    readonly getCellsInArea: (
      topLeft: GridPosition,
      bottomRight: GridPosition
    ) => Effect.Effect<ReadonlyArray<GridCell>>

    // Cell modification
    readonly placeRoad: (position: GridPosition) => Effect.Effect<void>
    readonly removeRoad: (position: GridPosition) => Effect.Effect<void>
    readonly paintZone: (position: GridPosition, zoneId: string) => Effect.Effect<void>
    readonly clearZone: (position: GridPosition) => Effect.Effect<void>
    readonly placeBuilding: (position: GridPosition, buildingId: string) => Effect.Effect<void>
    readonly removeBuilding: (position: GridPosition) => Effect.Effect<void>
    readonly clearCell: (position: GridPosition) => Effect.Effect<void>

    // Queries
    readonly isValidPosition: (position: GridPosition) => Effect.Effect<boolean>
    readonly getNeighbors: (position: GridPosition) => Effect.Effect<ReadonlyArray<GridCell>>
    readonly getRoadNeighbors: (position: GridPosition) => Effect.Effect<ReadonlyArray<GridCell>>
    readonly hasRoadAccess: (position: GridPosition) => Effect.Effect<boolean>
    readonly getStats: Effect.Effect<GridStats>

    // Bulk operations
    readonly placeRoadLine: (
      start: GridPosition,
      end: GridPosition
    ) => Effect.Effect<ReadonlyArray<GridPosition>>
    readonly paintZoneArea: (
      topLeft: GridPosition,
      bottomRight: GridPosition,
      zoneId: string
    ) => Effect.Effect<ReadonlyArray<GridPosition>>

    // Events
    readonly subscribe: Effect.Effect<Queue.Dequeue<GridEvent>, never, Scope.Scope>
  }
>() {}

// Helper to iterate positions in a rectangular area
function* iterateArea(
  topLeft: GridPosition,
  bottomRight: GridPosition,
  width: number,
  height: number
): Generator<GridPosition> {
  const minX = Math.max(0, Math.min(topLeft.x, bottomRight.x))
  const maxX = Math.min(width - 1, Math.max(topLeft.x, bottomRight.x))
  const minY = Math.max(0, Math.min(topLeft.y, bottomRight.y))
  const maxY = Math.min(height - 1, Math.max(topLeft.y, bottomRight.y))

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      yield GridPosition.create(x, y)
    }
  }
}

// Helper to get positions on a line (Bresenham's algorithm)
function getLinePositions(
  start: GridPosition,
  end: GridPosition,
  width: number,
  height: number
): ReadonlyArray<GridPosition> {
  const positions: GridPosition[] = []

  // Convert to plain numbers for algorithm
  let x0: number = start.x
  let y0: number = start.y
  const x1: number = end.x
  const y1: number = end.y

  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy

  while (true) {
    if (x0 >= 0 && x0 < width && y0 >= 0 && y0 < height) {
      positions.push(GridPosition.create(x0, y0))
    }

    if (x0 === x1 && y0 === y1) break

    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x0 += sx
    }
    if (e2 < dx) {
      err += dx
      y0 += sy
    }
  }

  return positions
}

export const GridServiceLive = Layer.effect(
  GridService,
  Effect.gen(function* () {
    const width = DEFAULT_GRID_WIDTH
    const height = DEFAULT_GRID_HEIGHT

    // Initialize grid with empty cells
    const initialCells = new Map<string, GridCell>()
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pos = GridPosition.create(x, y)
        initialCells.set(pos.toKey(), GridCell.empty(pos))
      }
    }

    const cellsRef = yield* Ref.make<ReadonlyMap<string, GridCell>>(initialCells)
    const eventBus = yield* PubSub.unbounded<GridEvent>()

    const updateMetrics = Effect.gen(function* () {
      const cells = yield* Ref.get(cellsRef)
      let roads = 0
      let zoned = 0
      let buildings = 0

      for (const cell of cells.values()) {
        if (cell.hasRoad) roads++
        if (cell.isZoned()) zoned++
        if (cell.hasBuilding()) buildings++
      }

      yield* Metric.set(totalCellsGauge, cells.size)
      yield* Metric.set(roadCellsGauge, roads)
      yield* Metric.set(zonedCellsGauge, zoned)
      yield* Metric.set(buildingCellsGauge, buildings)
    })

    const getWidth = Effect.succeed(width)
    const getHeight = Effect.succeed(height)

    const getCell = (position: GridPosition) =>
      Effect.gen(function* () {
        const cells = yield* Ref.get(cellsRef)
        const cell = cells.get(position.toKey())
        return cell ?? GridCell.empty(position)
      })

    const getCells = Ref.get(cellsRef)

    const getCellsInArea = (topLeft: GridPosition, bottomRight: GridPosition) =>
      Effect.gen(function* () {
        const cells = yield* Ref.get(cellsRef)
        const result: GridCell[] = []

        for (const pos of iterateArea(topLeft, bottomRight, width, height)) {
          const cell = cells.get(pos.toKey())
          if (cell) result.push(cell)
        }

        return result
      })

    const isValidPosition = (position: GridPosition) =>
      Effect.succeed(
        position.x >= 0 && position.x < width && position.y >= 0 && position.y < height
      )

    const updateCell = (position: GridPosition, update: (cell: GridCell) => GridCell) =>
      Effect.gen(function* () {
        const valid = yield* isValidPosition(position)
        if (!valid) return

        yield* Ref.update(cellsRef, (cells) => {
          const mutable = new Map(cells)
          const existing = mutable.get(position.toKey()) ?? GridCell.empty(position)
          mutable.set(position.toKey(), update(existing))
          return mutable
        })

        const cells = yield* Ref.get(cellsRef)
        const cell = cells.get(position.toKey())!
        yield* PubSub.publish(eventBus, { _tag: "CellUpdated", position, cell })
        yield* updateMetrics
      })

    const placeRoad = (position: GridPosition) =>
      Effect.gen(function* () {
        yield* updateCell(position, (cell) => cell.withRoad())
        yield* PubSub.publish(eventBus, { _tag: "RoadPlaced", position })
      })

    const removeRoad = (position: GridPosition) =>
      Effect.gen(function* () {
        const cell = yield* getCell(position)
        if (cell.hasRoad) {
          yield* updateCell(position, (c) =>
            new GridCell({
              ...c,
              contentType: c.isZoned() ? "zone" : "empty",
              hasRoad: false
            })
          )
          yield* PubSub.publish(eventBus, { _tag: "RoadRemoved", position })
        }
      })

    const paintZone = (position: GridPosition, zoneId: string) =>
      Effect.gen(function* () {
        const cell = yield* getCell(position)
        if (!cell.hasRoad) {
          yield* updateCell(position, (c) => c.withZone(zoneId))
          yield* PubSub.publish(eventBus, { _tag: "ZonePainted", position, zoneId })
        }
      })

    const clearZone = (position: GridPosition) =>
      Effect.gen(function* () {
        const cell = yield* getCell(position)
        if (cell.isZoned() && !cell.hasBuilding()) {
          yield* updateCell(position, (c) =>
            new GridCell({
              ...c,
              contentType: "empty",
              zoneId: Option.none()
            })
          )
          yield* PubSub.publish(eventBus, { _tag: "ZoneCleared", position })
        }
      })

    const placeBuilding = (position: GridPosition, buildingId: string) =>
      Effect.gen(function* () {
        const cell = yield* getCell(position)
        if (cell.isZoned() && !cell.hasBuilding()) {
          yield* updateCell(position, (c) => c.withBuilding(buildingId))
          yield* PubSub.publish(eventBus, { _tag: "BuildingPlaced", position, buildingId })
        }
      })

    const removeBuilding = (position: GridPosition) =>
      Effect.gen(function* () {
        const cell = yield* getCell(position)
        if (cell.hasBuilding()) {
          yield* updateCell(position, (c) =>
            new GridCell({
              ...c,
              contentType: c.isZoned() ? "zone" : "empty",
              buildingId: Option.none()
            })
          )
          yield* PubSub.publish(eventBus, { _tag: "BuildingRemoved", position })
        }
      })

    const clearCell = (position: GridPosition) =>
      Effect.gen(function* () {
        yield* updateCell(position, (c) => c.clear())
        yield* PubSub.publish(eventBus, { _tag: "CellCleared", position })
      })

    const getNeighbors = (position: GridPosition): Effect.Effect<ReadonlyArray<GridCell>> =>
      Effect.gen(function* () {
        const neighborPositions = position.neighbors()
        const cells = yield* Ref.get(cellsRef)
        return Arr.filterMap(neighborPositions, (pos) => {
          if (pos.x < 0 || pos.x >= width || pos.y < 0 || pos.y >= height) {
            return Option.none()
          }
          const cell = cells.get(pos.toKey())
          return cell ? Option.some(cell) : Option.none()
        })
      })

    const getRoadNeighbors = (position: GridPosition) =>
      Effect.gen(function* () {
        const neighbors = yield* getNeighbors(position)
        return Arr.filter(neighbors, (cell) => cell.hasRoad)
      })

    const hasRoadAccess = (position: GridPosition) =>
      Effect.gen(function* () {
        const roadNeighbors = yield* getRoadNeighbors(position)
        return roadNeighbors.length > 0
      })

    const getStats = Effect.gen(function* () {
      const cells = yield* Ref.get(cellsRef)
      let emptyCells = 0
      let roadCells = 0
      let zonedCells = 0
      let buildingCells = 0

      for (const cell of cells.values()) {
        if (cell.isEmpty()) emptyCells++
        if (cell.hasRoad) roadCells++
        if (cell.isZoned()) zonedCells++
        if (cell.hasBuilding()) buildingCells++
      }

      return new GridStats({
        width,
        height,
        totalCells: width * height,
        emptyCells,
        roadCells,
        zonedCells,
        buildingCells
      })
    })

    const placeRoadLine = (start: GridPosition, end: GridPosition) =>
      Effect.gen(function* () {
        const positions = getLinePositions(start, end, width, height)
        yield* Effect.forEach(positions, placeRoad, { discard: true })
        return positions
      })

    const paintZoneArea = (topLeft: GridPosition, bottomRight: GridPosition, zoneId: string) =>
      Effect.gen(function* () {
        const painted: GridPosition[] = []

        for (const pos of iterateArea(topLeft, bottomRight, width, height)) {
          const cell = yield* getCell(pos)
          if (!cell.hasRoad) {
            yield* paintZone(pos, zoneId)
            painted.push(pos)
          }
        }

        return painted
      })

    const subscribe = PubSub.subscribe(eventBus)

    // Initial metrics update
    yield* updateMetrics

    return {
      getWidth,
      getHeight,
      getCell,
      getCells,
      getCellsInArea,
      placeRoad,
      removeRoad,
      paintZone,
      clearZone,
      placeBuilding,
      removeBuilding,
      clearCell,
      isValidPosition,
      getNeighbors,
      getRoadNeighbors,
      hasRoadAccess,
      getStats,
      placeRoadLine,
      paintZoneArea,
      subscribe
    } as const
  })
)
