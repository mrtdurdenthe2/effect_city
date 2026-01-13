import {
  Scene,
  InstancedMesh,
  PlaneGeometry,
  BoxGeometry,
  MeshBasicMaterial,
  Matrix4,
  Color
} from "three"

// Zone colors from backend
const ZONE_COLORS = {
  residential: 0x4caf50, // Green
  commercial: 0x2196f3,  // Blue
  industrial: 0xffc107   // Yellow/Orange
} as const

const CELL_COLORS = {
  empty: 0x2a2a3e,
  road: 0x555555,
  building: 0x888888
} as const

type ZoneType = "residential" | "commercial" | "industrial"
type CellContentType = "empty" | "road" | "zone" | "building"

const GRID_SIZE = 64
const CELL_SIZE = 1
const CELL_GAP = 0.02

export class GridRenderer {
  private readonly scene: Scene

  // Instanced meshes for each cell type
  private readonly basePlane: InstancedMesh
  private readonly buildings: InstancedMesh

  // Cell state tracking
  private readonly cellStates: Map<string, { type: CellContentType; zoneType: ZoneType | undefined }>

  // Helper matrices
  private readonly tempMatrix = new Matrix4()
  private readonly tempColor = new Color()

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
    const planeMaterial = new MeshBasicMaterial({ color: CELL_COLORS.empty })
    this.basePlane = new InstancedMesh(planeGeometry, planeMaterial, GRID_SIZE * GRID_SIZE)
    this.basePlane.name = "GridCells"

    // Create building geometry
    const buildingGeometry = new BoxGeometry(
      CELL_SIZE - CELL_GAP * 2,
      1,
      CELL_SIZE - CELL_GAP * 2
    )
    buildingGeometry.translate(0, 0.5, 0) // Move origin to bottom

    // Create instanced mesh for buildings
    const buildingMaterial = new MeshBasicMaterial({ color: 0x888888 })
    this.buildings = new InstancedMesh(buildingGeometry, buildingMaterial, GRID_SIZE * GRID_SIZE)
    this.buildings.name = "Buildings"
    this.buildings.count = 0 // Start with no buildings visible

    // Initialize grid
    this.initializeGrid()

    // Add to scene
    this.scene.add(this.basePlane)
    this.scene.add(this.buildings)
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
        this.cellStates.set(key, { type: "empty", zoneType: undefined })

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
    zoneType?: ZoneType
  ): void {
    const key = `${x},${y}`
    const index = y * GRID_SIZE + x

    if (index < 0 || index >= GRID_SIZE * GRID_SIZE) {
      console.warn(`Invalid cell position: ${x}, ${y}`)
      return
    }

    // Update cell state
    this.cellStates.set(key, { type: contentType, zoneType })

    // Determine cell color
    let color: number
    switch (contentType) {
      case "road":
        color = CELL_COLORS.road
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

  dispose(): void {
    this.basePlane.geometry.dispose()
    ;(this.basePlane.material as MeshBasicMaterial).dispose()
    this.scene.remove(this.basePlane)

    this.buildings.geometry.dispose()
    ;(this.buildings.material as MeshBasicMaterial).dispose()
    this.scene.remove(this.buildings)
  }
}
