import type { EventEmitter } from "../EventEmitter.js"

export class Sizes {
  width: number
  height: number
  pixelRatio: number

  constructor(private readonly eventEmitter: EventEmitter) {
    this.width = window.innerWidth
    this.height = window.innerHeight
    this.pixelRatio = Math.min(window.devicePixelRatio, 2)

    window.addEventListener("resize", this.handleResize)
  }

  private handleResize = (): void => {
    this.width = window.innerWidth
    this.height = window.innerHeight
    this.pixelRatio = Math.min(window.devicePixelRatio, 2)

    this.eventEmitter.emit({
      type: "resize",
      width: this.width,
      height: this.height
    })
  }

  get aspect(): number {
    return this.width / this.height
  }

  dispose(): void {
    window.removeEventListener("resize", this.handleResize)
  }
}
