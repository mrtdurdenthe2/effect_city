import { AmbientLight, DirectionalLight, PlaneGeometry, MeshStandardMaterial, Mesh } from "three"
import type { Application } from "../Application.js"
import { GridRenderer } from "./GridRenderer.js"
import type { ServerMessage, SerializedCell, ActivityEvent } from "../../shared/MessageProtocol.js"

// Chaos event types that have positions
const CHAOS_EVENT_TYPES = ["CarCrash", "Fire", "PowerOutage", "WaterMainBreak", "CitizenAccident"] as const

export class World {
  private readonly app: Application
  private readonly gridRenderer: GridRenderer
  private initialized = false

  constructor(app: Application) {
    this.app = app

    // Add basic lighting (for optional future use with materials)
    const ambientLight = new AmbientLight(0xffffff, 0.9)
    this.app.scene.add(ambientLight)

    const directionalLight = new DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(50, 100, 50)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = 2048
    directionalLight.shadow.mapSize.height = 2048
    directionalLight.shadow.camera.left = -80
    directionalLight.shadow.camera.right = 80
    directionalLight.shadow.camera.top = 80
    directionalLight.shadow.camera.bottom = -80
    directionalLight.shadow.camera.near = 10
    directionalLight.shadow.camera.far = 200
    this.app.scene.add(directionalLight)

    // Add infinite ground plane
    const groundGeometry = new PlaneGeometry(2000, 2000)
    groundGeometry.rotateX(-Math.PI / 2)
    const groundMaterial = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.8
    })
    const ground = new Mesh(groundGeometry, groundMaterial)
    ground.position.set(64, -0.01, 64)
    ground.receiveShadow = true
    this.app.scene.add(ground)

    // Create grid renderer
    this.gridRenderer = new GridRenderer(this.app.scene)

    // Listen for server messages
    this.app.eventEmitter.on("server:message", (event) => {
      this.handleServerMessage(event.data)
    })
  }

  private handleServerMessage(message: ServerMessage): void {
    switch (message.type) {
      case "initial_state":
        console.log(`Received initial state: ${message.grid.length} cells, ${message.zones.length} zones`)
        this.initializeFromState(message.grid)
        this.initialized = true
        break

      case "cell_updated":
        if (this.initialized) {
          this.gridRenderer.updateCell(
            message.x,
            message.y,
            message.contentType,
            // Extract zone type from Option
            message.zoneType && "value" in message.zoneType ? message.zoneType.value : undefined,
            // Extract road type from Option
            message.roadType && "value" in message.roadType ? message.roadType.value : undefined
          )
        }
        break

      case "simulation_tick":
        // Stats are handled by UI overlay
        break

      case "clock_state":
        // Clock state is handled by UI overlay
        break

      case "activity_event":
        this.handleActivityEvent(message.event)
        break
    }
  }

  private handleActivityEvent(event: ActivityEvent): void {
    // Handle chaos events with positions
    if (CHAOS_EVENT_TYPES.includes(event._tag as typeof CHAOS_EVENT_TYPES[number])) {
      const chaosEvent = event as { _tag: string; eventId: string; severity: "minor" | "moderate" | "major"; position: { x: number; y: number } }
      this.gridRenderer.addChaosMarker(
        chaosEvent.eventId,
        chaosEvent.position.x,
        chaosEvent.position.y,
        chaosEvent.severity
      )
    }

    // Handle resolved events
    if (event._tag === "ChaosResolved") {
      this.gridRenderer.removeChaosMarker(event.eventId)
    }
  }

  private initializeFromState(cells: readonly SerializedCell[]): void {
    for (const cell of cells) {
      // Extract zone type from Option structure
      let zoneType: "residential" | "commercial" | "industrial" | undefined
      if (cell.zoneType && typeof cell.zoneType === "object" && "_tag" in cell.zoneType) {
        if (cell.zoneType._tag === "Some" && "value" in cell.zoneType) {
          zoneType = cell.zoneType.value as "residential" | "commercial" | "industrial"
        }
      }

      // Extract road type from Option structure
      let roadType: "street" | "avenue" | "highway" | undefined
      if (cell.roadType && typeof cell.roadType === "object" && "_tag" in cell.roadType) {
        if (cell.roadType._tag === "Some" && "value" in cell.roadType) {
          roadType = cell.roadType.value as "street" | "avenue" | "highway"
        }
      }

      this.gridRenderer.updateCell(cell.x, cell.y, cell.contentType, zoneType, roadType)
    }
  }

  update(): void {
    // Animate chaos markers
    this.gridRenderer.updateChaosMarkers()
  }

  dispose(): void {
    this.gridRenderer.dispose()
  }
}
