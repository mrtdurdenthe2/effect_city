import type { EventEmitter } from "../EventEmitter.js"

export class Time {
  private start: number
  private current: number
  private elapsed: number = 0
  private delta: number = 0
  private animationFrameId: number | null = null

  constructor(private readonly eventEmitter: EventEmitter) {
    this.start = Date.now()
    this.current = this.start
  }

  startLoop(): void {
    if (this.animationFrameId !== null) return

    const tick = (): void => {
      const now = Date.now()
      this.delta = now - this.current
      this.current = now
      this.elapsed = now - this.start

      this.eventEmitter.emit({
        type: "tick",
        delta: this.delta,
        elapsed: this.elapsed
      })

      this.animationFrameId = requestAnimationFrame(tick)
    }

    this.animationFrameId = requestAnimationFrame(tick)
  }

  stopLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }

  getDelta(): number {
    return this.delta
  }

  getElapsed(): number {
    return this.elapsed
  }
}
