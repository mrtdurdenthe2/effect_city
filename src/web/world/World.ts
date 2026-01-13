import { GridHelper, AmbientLight, DirectionalLight } from "three"
import type { Application } from "../Application.js"
import { GridRenderer } from "./GridRenderer.js"
import type { ServerMessage, SerializedCell } from "../../shared/MessageProtocol.js"

export class World {
  private readonly app: Application
  private readonly gridRenderer: GridRenderer
  private initialized = false

  constructor(app: Application) {
    this.app = app

    // Add basic lighting (for optional future use with materials)
    const ambientLight = new AmbientLight(0xffffff, 0.6)
    this.app.scene.add(ambientLight)

    const directionalLight = new DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(50, 100, 50)
    this.app.scene.add(directionalLight)

    // Add grid helper for debugging
    const gridHelper = new GridHelper(64, 64, 0x444444, 0x333333)
    gridHelper.position.set(32, 0.01, 32)
    this.app.scene.add(gridHelper)

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
            message.zoneType && "value" in message.zoneType ? message.zoneType.value : undefined
          )
        }
        break

      case "simulation_tick":
        // Stats are handled by UI overlay
        break

      case "clock_state":
        // Clock state is handled by UI overlay
        break
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

      this.gridRenderer.updateCell(cell.x, cell.y, cell.contentType, zoneType)
    }
  }

  update(): void {
    // Future: animate buildings, effects, etc.
  }

  dispose(): void {
    this.gridRenderer.dispose()
  }
}
