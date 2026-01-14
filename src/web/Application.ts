import { WebGLRenderer, Scene } from "three"
import { EventEmitter } from "./EventEmitter.js"
import { Time } from "./services/Time.js"
import { Sizes } from "./services/Sizes.js"
import { Camera } from "./services/Camera.js"
import { SimulationRunner } from "./SimulationRunner.js"
import { World } from "./world/World.js"

export class Application {
  private static instance: Application | null = null

  // Services
  readonly eventEmitter: EventEmitter
  readonly time: Time
  readonly sizes: Sizes
  readonly camera: Camera
  readonly simulation: SimulationRunner

  // Three.js
  readonly renderer: WebGLRenderer
  readonly scene: Scene
  readonly world: World

  private constructor(canvas: HTMLCanvasElement) {
    // Initialize services
    this.eventEmitter = new EventEmitter()
    this.sizes = new Sizes(this.eventEmitter, canvas.parentElement ?? undefined)
    this.time = new Time(this.eventEmitter)
    this.simulation = new SimulationRunner(this.eventEmitter)

    // Initialize Three.js
    this.scene = new Scene()

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false
    })
    this.renderer.setSize(this.sizes.width, this.sizes.height)
    this.renderer.setPixelRatio(this.sizes.pixelRatio)
    this.renderer.setClearColor(0x1a1a2e)

    // Initialize camera after renderer
    this.camera = new Camera(this.eventEmitter, this.sizes, canvas)

    // Initialize world
    this.world = new World(this)

    // Bind events
    this.bindEvents()
  }

  static getInstance(canvas?: HTMLCanvasElement): Application {
    if (!Application.instance) {
      if (!canvas) {
        throw new Error("Canvas element required for first initialization")
      }
      Application.instance = new Application(canvas)
    }
    return Application.instance
  }

  static createWithCanvas(canvas: HTMLCanvasElement): Application {
    return new Application(canvas)
  }

  private bindEvents(): void {
    // Handle resize
    this.eventEmitter.on("resize", () => {
      this.renderer.setSize(this.sizes.width, this.sizes.height)
      this.renderer.setPixelRatio(this.sizes.pixelRatio)
    })

    // Handle animation loop
    this.eventEmitter.on("tick", () => {
      this.update()
    })
  }

  private update(): void {
    // Update camera controls
    this.camera.update()

    // Update world
    this.world.update()

    // Render
    this.renderer.render(this.scene, this.camera.instance)
  }

  start(): void {
    // Start simulation
    this.simulation.start()

    // Start animation loop
    this.time.startLoop()
  }

  dispose(): void {
    this.time.stopLoop()
    this.simulation.stop()
    this.camera.dispose()
    this.sizes.dispose()
    this.world.dispose()
    this.renderer.dispose()
  }
}
