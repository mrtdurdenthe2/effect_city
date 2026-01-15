import type { ServerMessage, SerializedSimulationStats, ClockState } from "../shared/MessageProtocol.js"

// Application events
export type ApplicationEvent =
  | { type: "resize"; width: number; height: number }
  | { type: "tick"; delta: number; elapsed: number }
  | { type: "server:connected" }
  | { type: "server:disconnected" }
  | { type: "server:message"; data: ServerMessage }
  | { type: "simulation:tick"; stats: SerializedSimulationStats }
  | { type: "clock:state"; clock: ClockState }

type EventHandler<T extends ApplicationEvent["type"]> = (
  event: Extract<ApplicationEvent, { type: T }>
) => void

export class EventEmitter {
  private listeners = new Map<string, Set<EventHandler<any>>>()

  on<T extends ApplicationEvent["type"]>(
    type: T,
    handler: EventHandler<T>
  ): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type)!.add(handler)

    // Return unsubscribe function
    return () => this.off(type, handler)
  }

  off<T extends ApplicationEvent["type"]>(
    type: T,
    handler: EventHandler<T>
  ): void {
    this.listeners.get(type)?.delete(handler)
  }

  emit(event: ApplicationEvent): void {
    const handlers = this.listeners.get(event.type)
    if (handlers) {
      for (const handler of handlers) {
        handler(event)
      }
    }
  }
}
