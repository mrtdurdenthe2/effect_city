import type { EventEmitter } from "../EventEmitter.js"

export class Sizes {
  width: number
  height: number
  pixelRatio: number
  private resizeObserver: ResizeObserver | null = null

  constructor(
    private readonly eventEmitter: EventEmitter,
    container?: HTMLElement
  ) {
    if (container) {
      this.width = container.clientWidth
      this.height = container.clientHeight
    } else {
      this.width = window.innerWidth
      this.height = window.innerHeight
    }
    this.pixelRatio = Math.min(window.devicePixelRatio, 2)

    if (container) {
      this.resizeObserver = new ResizeObserver(this.handleContainerResize)
      this.resizeObserver.observe(container)
    } else {
      window.addEventListener("resize", this.handleResize)
    }
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

  private handleContainerResize = (entries: ResizeObserverEntry[]): void => {
    const entry = entries[0]
    if (entry) {
      this.width = entry.contentRect.width
      this.height = entry.contentRect.height
      this.pixelRatio = Math.min(window.devicePixelRatio, 2)

      this.eventEmitter.emit({
        type: "resize",
        width: this.width,
        height: this.height
      })
    }
  }

  get aspect(): number {
    return this.width / this.height
  }

  dispose(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
    } else {
      window.removeEventListener("resize", this.handleResize)
    }
  }
}
