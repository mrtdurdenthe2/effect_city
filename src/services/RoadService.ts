import { Context, Effect, Layer, Ref, PubSub, Queue, Scope, Option } from "effect"
import { GridPosition } from "../domain/Grid.js"
import { RoadId, RoadType, RoadSegment, RoadStats, ROAD_CAPACITY } from "../domain/Road.js"
import { GridService } from "./GridService.js"

// Events emitted by the road service
export type RoadEvent =
  | { readonly _tag: "RoadPlaced"; readonly position: GridPosition; readonly roadType: RoadType }
  | { readonly _tag: "RoadRemoved"; readonly position: GridPosition }
  | { readonly _tag: "RoadTypeChanged"; readonly position: GridPosition; readonly roadType: RoadType }
  | { readonly _tag: "NetworkMerged"; readonly networkId: RoadId; readonly mergedIds: ReadonlyArray<RoadId> }
  | { readonly _tag: "NetworkSplit"; readonly originalId: RoadId; readonly newIds: ReadonlyArray<RoadId> }

// Road placement result
export type RoadPlacementResult =
  | { readonly _tag: "Success"; readonly position: GridPosition }
  | { readonly _tag: "AlreadyRoad"; readonly position: GridPosition }
  | { readonly _tag: "InvalidPosition"; readonly position: GridPosition }

export class RoadService extends Context.Tag("RoadService")<
  RoadService,
  {
    // Road placement
    readonly placeRoad: (position: GridPosition, roadType?: RoadType) => Effect.Effect<RoadPlacementResult>
    readonly removeRoad: (position: GridPosition) => Effect.Effect<boolean>
    readonly placeRoadLine: (
      start: GridPosition,
      end: GridPosition,
      roadType?: RoadType
    ) => Effect.Effect<ReadonlyArray<GridPosition>>

    // Road queries
    readonly isRoad: (position: GridPosition) => Effect.Effect<boolean>
    readonly getRoadType: (position: GridPosition) => Effect.Effect<Option.Option<RoadType>>
    readonly setRoadType: (position: GridPosition, roadType: RoadType) => Effect.Effect<boolean>

    // Connectivity
    readonly hasRoadAccess: (position: GridPosition) => Effect.Effect<boolean>
    readonly getConnectedRoads: (position: GridPosition) => Effect.Effect<ReadonlyArray<GridPosition>>
    readonly getNetworkId: (position: GridPosition) => Effect.Effect<Option.Option<RoadId>>
    readonly getNetwork: (networkId: RoadId) => Effect.Effect<Option.Option<RoadSegment>>
    readonly getAllNetworks: Effect.Effect<ReadonlyArray<RoadSegment>>

    // Traffic/capacity
    readonly getRoadCapacity: (position: GridPosition) => Effect.Effect<number>
    readonly getTotalNetworkCapacity: (networkId: RoadId) => Effect.Effect<number>

    // Statistics
    readonly getStats: Effect.Effect<RoadStats>

    // Events
    readonly subscribe: Effect.Effect<Queue.Dequeue<RoadEvent>, never, Scope.Scope>
  }
>() {}

// Generate unique road IDs
let roadIdCounter = 0
const generateRoadId = (): RoadId => {
  roadIdCounter++
  return `road-${roadIdCounter}` as RoadId
}

export const RoadServiceLive = Layer.effect(
  RoadService,
  Effect.gen(function* () {
    const gridService = yield* GridService

    // Road type for each road cell
    const roadTypesRef = yield* Ref.make<ReadonlyMap<string, RoadType>>(new Map())

    // Road networks (connected components)
    const networksRef = yield* Ref.make<ReadonlyMap<string, RoadSegment>>(new Map())

    // Position to network mapping
    const positionToNetworkRef = yield* Ref.make<ReadonlyMap<string, RoadId>>(new Map())

    const eventBus = yield* PubSub.unbounded<RoadEvent>()

    // Find all cells in a connected component using BFS
    const findConnectedComponent = (startPosition: GridPosition) =>
      Effect.gen(function* () {
        const roadTypes = yield* Ref.get(roadTypesRef)
        if (!roadTypes.has(startPosition.toKey())) {
          return []
        }

        const visited = new Set<string>()
        const component: GridPosition[] = []
        const queue: GridPosition[] = [startPosition]

        while (queue.length > 0) {
          const current = queue.shift()!
          const key = current.toKey()

          if (visited.has(key)) continue
          if (!roadTypes.has(key)) continue

          visited.add(key)
          component.push(current)

          const neighbors = current.neighbors()
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor.toKey()) && roadTypes.has(neighbor.toKey())) {
              queue.push(neighbor)
            }
          }
        }

        return component
      })

    // Rebuild networks after road changes
    const rebuildNetworks = Effect.gen(function* () {
      const roadTypes = yield* Ref.get(roadTypesRef)
      const visited = new Set<string>()
      const newNetworks = new Map<string, RoadSegment>()
      const newPositionToNetwork = new Map<string, RoadId>()

      for (const [key] of roadTypes) {
        if (visited.has(key)) continue

        const position = Option.getOrThrow(GridPosition.fromKey(key))
        const component = yield* findConnectedComponent(position)

        if (component.length > 0) {
          const networkId = generateRoadId()
          const network = new RoadSegment({
            id: networkId,
            type: "street", // Default type
            cells: component
          })

          newNetworks.set(networkId, network)

          for (const cell of component) {
            visited.add(cell.toKey())
            newPositionToNetwork.set(cell.toKey(), networkId)
          }
        }
      }

      yield* Ref.set(networksRef, newNetworks)
      yield* Ref.set(positionToNetworkRef, newPositionToNetwork)
    })

    const placeRoad = (position: GridPosition, roadType: RoadType = "street") =>
      Effect.gen(function* () {
        const valid = yield* gridService.isValidPosition(position)
        if (!valid) {
          return { _tag: "InvalidPosition", position } as RoadPlacementResult
        }

        const roadTypes = yield* Ref.get(roadTypesRef)
        if (roadTypes.has(position.toKey())) {
          return { _tag: "AlreadyRoad", position } as RoadPlacementResult
        }

        // Place road in grid service
        yield* gridService.placeRoad(position)

        // Track road type
        yield* Ref.update(roadTypesRef, (types) => {
          const mutable = new Map(types)
          mutable.set(position.toKey(), roadType)
          return mutable
        })

        // Rebuild networks
        yield* rebuildNetworks

        // Emit event
        yield* PubSub.publish(eventBus, { _tag: "RoadPlaced", position, roadType })

        return { _tag: "Success", position } as RoadPlacementResult
      })

    const removeRoad = (position: GridPosition) =>
      Effect.gen(function* () {
        const roadTypes = yield* Ref.get(roadTypesRef)
        if (!roadTypes.has(position.toKey())) {
          return false
        }

        // Remove from grid service
        yield* gridService.removeRoad(position)

        // Remove road type
        yield* Ref.update(roadTypesRef, (types) => {
          const mutable = new Map(types)
          mutable.delete(position.toKey())
          return mutable
        })

        // Rebuild networks
        yield* rebuildNetworks

        // Emit event
        yield* PubSub.publish(eventBus, { _tag: "RoadRemoved", position })

        return true
      })

    const placeRoadLine = (start: GridPosition, end: GridPosition, roadType: RoadType = "street") =>
      Effect.gen(function* () {
        const positions = yield* gridService.placeRoadLine(start, end)

        // Track road types for all positions
        yield* Ref.update(roadTypesRef, (types) => {
          const mutable = new Map(types)
          for (const pos of positions) {
            mutable.set(pos.toKey(), roadType)
          }
          return mutable
        })

        // Rebuild networks
        yield* rebuildNetworks

        // Emit events for each road
        yield* Effect.forEach(
          positions,
          (position) => PubSub.publish(eventBus, { _tag: "RoadPlaced", position, roadType }),
          { discard: true }
        )

        return positions
      })

    const isRoad = (position: GridPosition) =>
      Effect.gen(function* () {
        const roadTypes = yield* Ref.get(roadTypesRef)
        return roadTypes.has(position.toKey())
      })

    const getRoadType = (position: GridPosition) =>
      Effect.gen(function* () {
        const roadTypes = yield* Ref.get(roadTypesRef)
        const type = roadTypes.get(position.toKey())
        return type ? Option.some(type) : Option.none()
      })

    const setRoadType = (position: GridPosition, roadType: RoadType) =>
      Effect.gen(function* () {
        const roadTypes = yield* Ref.get(roadTypesRef)
        if (!roadTypes.has(position.toKey())) {
          return false
        }

        yield* Ref.update(roadTypesRef, (types) => {
          const mutable = new Map(types)
          mutable.set(position.toKey(), roadType)
          return mutable
        })

        yield* PubSub.publish(eventBus, { _tag: "RoadTypeChanged", position, roadType })

        return true
      })

    const hasRoadAccess = (position: GridPosition) =>
      Effect.gen(function* () {
        const neighbors = position.neighbors()
        const roadTypes = yield* Ref.get(roadTypesRef)
        return neighbors.some((pos) => roadTypes.has(pos.toKey()))
      })

    const getConnectedRoads = (position: GridPosition) =>
      Effect.gen(function* () {
        const roadTypes = yield* Ref.get(roadTypesRef)
        if (!roadTypes.has(position.toKey())) {
          return []
        }
        return yield* findConnectedComponent(position)
      })

    const getNetworkId = (position: GridPosition) =>
      Effect.gen(function* () {
        const positionToNetwork = yield* Ref.get(positionToNetworkRef)
        const networkId = positionToNetwork.get(position.toKey())
        return networkId ? Option.some(networkId) : Option.none()
      })

    const getNetwork = (networkId: RoadId) =>
      Effect.gen(function* () {
        const networks = yield* Ref.get(networksRef)
        const network = networks.get(networkId)
        return network ? Option.some(network) : Option.none()
      })

    const getAllNetworks = Effect.gen(function* () {
      const networks = yield* Ref.get(networksRef)
      return Array.from(networks.values())
    })

    const getRoadCapacity = (position: GridPosition) =>
      Effect.gen(function* () {
        const roadType = yield* getRoadType(position)
        return Option.match(roadType, {
          onNone: () => 0,
          onSome: (type) => ROAD_CAPACITY[type]
        })
      })

    const getTotalNetworkCapacity = (networkId: RoadId) =>
      Effect.gen(function* () {
        const networks = yield* Ref.get(networksRef)
        const roadTypes = yield* Ref.get(roadTypesRef)
        const network = networks.get(networkId)

        if (!network) return 0

        let totalCapacity = 0
        for (const cell of network.cells) {
          const roadType = roadTypes.get(cell.toKey()) ?? "street"
          totalCapacity += ROAD_CAPACITY[roadType]
        }
        return totalCapacity
      })

    const getStats = Effect.gen(function* () {
      const roadTypes = yield* Ref.get(roadTypesRef)
      const networks = yield* Ref.get(networksRef)

      let streetCells = 0
      let avenueCells = 0
      let highwayCells = 0

      for (const type of roadTypes.values()) {
        switch (type) {
          case "street":
            streetCells++
            break
          case "avenue":
            avenueCells++
            break
          case "highway":
            highwayCells++
            break
        }
      }

      const networkArray = Array.from(networks.values())
      const largestNetworkSize =
        networkArray.length > 0 ? Math.max(...networkArray.map((n) => n.size())) : 0

      return new RoadStats({
        totalRoadCells: roadTypes.size,
        streetCells,
        avenueCells,
        highwayCells,
        networkCount: networks.size,
        largestNetworkSize
      })
    })

    const subscribe = PubSub.subscribe(eventBus)

    return {
      placeRoad,
      removeRoad,
      placeRoadLine,
      isRoad,
      getRoadType,
      setRoadType,
      hasRoadAccess,
      getConnectedRoads,
      getNetworkId,
      getNetwork,
      getAllNetworks,
      getRoadCapacity,
      getTotalNetworkCapacity,
      getStats,
      subscribe
    } as const
  })
)
