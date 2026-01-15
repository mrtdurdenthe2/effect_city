import { OrthographicCamera, Vector3 } from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import type { EventEmitter } from "../EventEmitter.js"
import type { Sizes } from "./Sizes.js"

// Grid dimensions from backend
const GRID_SIZE = 64
const GRID_CENTER = new Vector3(GRID_SIZE / 2, 0, GRID_SIZE / 2)

export class Camera {
  readonly instance: OrthographicCamera
  readonly controls: OrbitControls

  private frustumSize = 50

  constructor(
    private readonly eventEmitter: EventEmitter,
    private readonly sizes: Sizes,
    canvas: HTMLCanvasElement
  ) {
    // Create orthographic camera for isometric view
    const aspect = this.sizes.aspect
    this.instance = new OrthographicCamera(
      (-this.frustumSize * aspect) / 2,
      (this.frustumSize * aspect) / 2,
      this.frustumSize / 2,
      -this.frustumSize / 2,
      0.1,
      1000
    )

    // Position camera for isometric view
    const distance = 80
    this.instance.position.set(
      GRID_CENTER.x + distance,
      distance * 0.8,
      GRID_CENTER.z + distance
    )
    this.instance.lookAt(GRID_CENTER)

    // Set up orbit controls
    this.controls = new OrbitControls(this.instance, canvas)
    this.controls.target.copy(GRID_CENTER)
    this.controls.enableRotate = true
    this.controls.enableZoom = true
    this.controls.enablePan = true
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05

    // Constrain rotation to keep isometric feel
    this.controls.minPolarAngle = Math.PI / 6
    this.controls.maxPolarAngle = Math.PI / 2.5

    // Zoom limits
    this.controls.minZoom = 0.5
    this.controls.maxZoom = 3

    // Listen for resize
    this.eventEmitter.on("resize", () => this.handleResize())
  }

  private handleResize(): void {
    const aspect = this.sizes.aspect
    this.instance.left = (-this.frustumSize * aspect) / 2
    this.instance.right = (this.frustumSize * aspect) / 2
    this.instance.top = this.frustumSize / 2
    this.instance.bottom = -this.frustumSize / 2
    this.instance.updateProjectionMatrix()
  }

  update(): void {
    this.controls.update()
  }

  dispose(): void {
    this.controls.dispose()
  }
}
