import {
  Scene,
  InstancedMesh,
  PlaneGeometry,
  BoxGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  Matrix4,
  Color,
  Vector3
} from "three"

// Zone colors from backend
const ZONE_COLORS = {
  residential: 0x4caf50, // Green
  commercial: 0x2196f3,  // Blue
  industrial: 0xffc107   // Yellow/Orange
} as const

const CELL_COLORS = {
  empty: 0xffffff,
  road: 0xcccccc,
  building: 0x888888
} as const

// Road type colors
const ROAD_COLORS = {
  street: 0xcccccc,  // Light gray
  avenue: 0xd0d0d0,  // Light gray (slightly brighter)
  highway: 0xd6d6d6  // Light gray (brightest)
} as const

type RoadType = "street" | "avenue" | "highway"

type ZoneType = "residential" | "commercial" | "industrial"
type CellContentType = "empty" | "road" | "zone" | "building"

// Chaos marker colors by severity
const CHAOS_COLORS = {
  minor: 0xff9800,    // Orange
  moderate: 0xff5722, // Deep orange
  major: 0xf44336    // Red
} as const

type ChaosSeverity = "minor" | "moderate" | "major"

interface ChaosMarker {
  eventId: string
  x: number
  y: number
  severity: ChaosSeverity
  index: number
  createdAt: number
}

const MAX_CHAOS_MARKERS = 50

const GRID_SIZE = 128
const CELL_SIZE = 1
const CELL_GAP = 0.02

export class GridRenderer {
  private readonly scene: Scene

  // Instanced meshes for each cell type
  private readonly basePlane: InstancedMesh
  private readonly buildings: InstancedMesh
  private readonly chaosMarkers: InstancedMesh

  // Cell state tracking
  private readonly cellStates: Map<string, { type: CellContentType; zoneType: ZoneType | undefined; roadType: RoadType | undefined }>

  // Chaos marker tracking
  private readonly activeMarkers: Map<string, ChaosMarker> = new Map()
  private markerIndexPool: number[] = []

  // Helper matrices
  private readonly tempMatrix = new Matrix4()
  private readonly tempColor = new Color()

  // Dedicated matrix for chaos marker animation (to avoid corrupting tempMatrix)
  private readonly chaosMatrix = new Matrix4()
  private readonly chaosScale = new Vector3()

  constructor(scene: Scene) {
    this.scene = scene
    this.cellStates = new Map()

    // Create base plane geometry for cells
    const planeGeometry = new PlaneGeometry(
      CELL_SIZE - CELL_GAP,
      CELL_SIZE - CELL_GAP
    )
    planeGeometry.rotateX(-Math.PI / 2) // Lay flat

    // Create instanced mesh for base cells
    const planeMaterial = new MeshStandardMaterial({ color: CELL_COLORS.empty })
    this.basePlane = new InstancedMesh(planeGeometry, planeMaterial, GRID_SIZE * GRID_SIZE)
    this.basePlane.name = "GridCells"
    this.basePlane.receiveShadow = true

    // Create building geometry
    const buildingGeometry = new BoxGeometry(
      CELL_SIZE - CELL_GAP * 2,
      1,
      CELL_SIZE - CELL_GAP * 2
    )
    buildingGeometry.translate(0, 0.5, 0) // Move origin to bottom

    // Create instanced mesh for buildings
    const buildingMaterial = new MeshStandardMaterial({ color: 0x888888 })
    this.buildings = new InstancedMesh(buildingGeometry, buildingMaterial, GRID_SIZE * GRID_SIZE)
    this.buildings.name = "Buildings"
    this.buildings.count = 0 // Start with no buildings visible
    this.buildings.castShadow = true
    this.buildings.receiveShadow = true

    // Disable frustum culling to prevent buildings disappearing at certain angles
    this.basePlane.frustumCulled = false
    this.buildings.frustumCulled = false

    // Create chaos marker geometry (small cube)
    const chaosGeometry = new BoxGeometry(0.4, 0.4, 0.4)
    const chaosMaterial = new MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.9
    })
    this.chaosMarkers = new InstancedMesh(chaosGeometry, chaosMaterial, MAX_CHAOS_MARKERS)
    this.chaosMarkers.name = "ChaosMarkers"
    this.chaosMarkers.count = 0
    this.chaosMarkers.frustumCulled = false

    // Initialize marker index pool
    for (let i = 0; i < MAX_CHAOS_MARKERS; i++) {
      this.markerIndexPool.push(i)
    }

    // Initialize grid
    this.initializeGrid()

    // Add to scene
    this.scene.add(this.basePlane)
    this.scene.add(this.buildings)
    this.scene.add(this.chaosMarkers)
  }

  private initializeGrid(): void {
    let index = 0
    for (let z = 0; z < GRID_SIZE; z++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        // Position each cell
        this.tempMatrix.setPosition(
          x + CELL_SIZE / 2,
          0,
          z + CELL_SIZE / 2
        )
        this.basePlane.setMatrixAt(index, this.tempMatrix)

        // Set initial color
        this.tempColor.setHex(CELL_COLORS.empty)
        this.basePlane.setColorAt(index, this.tempColor)

        // Initialize cell state
        const key = `${x},${z}`
        this.cellStates.set(key, { type: "empty", zoneType: undefined, roadType: undefined })

        index++
      }
    }

    this.basePlane.instanceMatrix.needsUpdate = true
    if (this.basePlane.instanceColor) {
      this.basePlane.instanceColor.needsUpdate = true
    }
  }

  updateCell(
    x: number,
    y: number, // Note: y in grid coordinates = z in Three.js
    contentType: CellContentType,
    zoneType?: ZoneType,
    roadType?: RoadType
  ): void {
    const key = `${x},${y}`
    const index = y * GRID_SIZE + x

    if (index < 0 || index >= GRID_SIZE * GRID_SIZE) {
      console.warn(`Invalid cell position: ${x}, ${y}`)
      return
    }

    // Update cell state
    this.cellStates.set(key, { type: contentType, zoneType, roadType })

    // Determine cell color
    let color: number
    switch (contentType) {
      case "road":
        color = roadType ? ROAD_COLORS[roadType] : CELL_COLORS.road
        break
      case "zone":
        color = zoneType ? ZONE_COLORS[zoneType] : CELL_COLORS.empty
        break
      case "building":
        // Buildings show as darker version of zone color
        if (zoneType) {
          this.tempColor.setHex(ZONE_COLORS[zoneType])
          this.tempColor.multiplyScalar(0.7) // Darken
          color = this.tempColor.getHex()
        } else {
          color = CELL_COLORS.building
        }
        break
      case "empty":
      default:
        color = CELL_COLORS.empty
        break
    }

    // Update base plane color
    this.tempColor.setHex(color)
    this.basePlane.setColorAt(index, this.tempColor)
    if (this.basePlane.instanceColor) {
      this.basePlane.instanceColor.needsUpdate = true
    }

    // Handle building visibility
    this.updateBuildings()
  }

  private updateBuildings(): void {
    // Rebuild buildings from cell states
    let buildingIndex = 0

    for (const [key, state] of this.cellStates) {
      if (state.type === "building") {
        const [x, z] = key.split(",").map(Number)

        // Position building
        this.tempMatrix.setPosition(
          x + CELL_SIZE / 2,
          0,
          z + CELL_SIZE / 2
        )
        this.buildings.setMatrixAt(buildingIndex, this.tempMatrix)

        // Set building color based on zone type
        if (state.zoneType) {
          this.tempColor.setHex(ZONE_COLORS[state.zoneType])
          this.tempColor.multiplyScalar(0.8)
        } else {
          this.tempColor.setHex(CELL_COLORS.building)
        }
        this.buildings.setColorAt(buildingIndex, this.tempColor)

        buildingIndex++
      }
    }

    this.buildings.count = buildingIndex
    this.buildings.instanceMatrix.needsUpdate = true
    if (this.buildings.instanceColor) {
      this.buildings.instanceColor.needsUpdate = true
    }
  }

  // Chaos marker methods
  addChaosMarker(eventId: string, x: number, y: number, severity: ChaosSeverity): void {
    // Don't add if already exists
    if (this.activeMarkers.has(eventId)) return

    // Get an available index
    if (this.markerIndexPool.length === 0) {
      console.warn("Max chaos markers reached")
      return
    }

    const index = this.markerIndexPool.pop()!
    const marker: ChaosMarker = {
      eventId,
      x,
      y,
      severity,
      index,
      createdAt: performance.now()
    }

    this.activeMarkers.set(eventId, marker)

    // Position the marker (elevated above grid) - use dedicated chaosMatrix
    this.chaosMatrix.identity()
    this.chaosMatrix.setPosition(
      x + CELL_SIZE / 2,
      0.5,
      y + CELL_SIZE / 2
    )
    this.chaosMarkers.setMatrixAt(index, this.chaosMatrix)

    // Set color based on severity
    this.tempColor.setHex(CHAOS_COLORS[severity])
    this.chaosMarkers.setColorAt(index, this.tempColor)

    // Update instance count and matrices
    this.chaosMarkers.count = Math.max(this.chaosMarkers.count, index + 1)
    this.chaosMarkers.instanceMatrix.needsUpdate = true
    if (this.chaosMarkers.instanceColor) {
      this.chaosMarkers.instanceColor.needsUpdate = true
    }
  }

  removeChaosMarker(eventId: string): void {
    const marker = this.activeMarkers.get(eventId)
    if (!marker) return

    // Return index to pool
    this.markerIndexPool.push(marker.index)
    this.activeMarkers.delete(eventId)

    // Hide the marker by scaling to 0 (use dedicated chaosMatrix to avoid corrupting tempMatrix)
    this.chaosMatrix.makeScale(0, 0, 0)
    this.chaosMarkers.setMatrixAt(marker.index, this.chaosMatrix)
    this.chaosMarkers.instanceMatrix.needsUpdate = true
  }

  // Animate chaos markers (pulsing effect)
  updateChaosMarkers(): void {
    const now = performance.now()

    for (const marker of this.activeMarkers.values()) {
      // Pulsing animation based on time
      const elapsed = (now - marker.createdAt) / 1000
      const pulse = 0.8 + Math.sin(elapsed * 4) * 0.2 // Pulse between 0.6 and 1.0
      const bounce = Math.abs(Math.sin(elapsed * 2)) * 0.3 // Bounce up and down

      // Update matrix with scale and position (using dedicated chaos matrices)
      this.chaosMatrix.identity()
      this.chaosScale.set(pulse, pulse, pulse)
      this.chaosMatrix.scale(this.chaosScale)
      this.chaosMatrix.setPosition(
        marker.x + CELL_SIZE / 2,
        0.5 + bounce,
        marker.y + CELL_SIZE / 2
      )
      this.chaosMarkers.setMatrixAt(marker.index, this.chaosMatrix)
    }

    if (this.activeMarkers.size > 0) {
      this.chaosMarkers.instanceMatrix.needsUpdate = true
    }
  }

  getActiveMarkers(): Map<string, ChaosMarker> {
    return this.activeMarkers
  }

  dispose(): void {
    this.basePlane.geometry.dispose()
    ;(this.basePlane.material as MeshStandardMaterial).dispose()
    this.scene.remove(this.basePlane)

    this.buildings.geometry.dispose()
    ;(this.buildings.material as MeshStandardMaterial).dispose()
    this.scene.remove(this.buildings)

    this.chaosMarkers.geometry.dispose()
    ;(this.chaosMarkers.material as MeshBasicMaterial).dispose()
    this.scene.remove(this.chaosMarkers)
  }
}
