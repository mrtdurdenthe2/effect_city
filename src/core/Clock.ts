import { Context, Effect, Layer, Ref, PubSub, Queue, Scope } from "effect"

export type GameSpeed = 1 | 2 | 3

export interface ClockState {
  readonly isPaused: boolean
  readonly speed: GameSpeed
  readonly tickCount: number
  readonly elapsedMs: number
}

export type ClockEvent =
  | { readonly _tag: "Paused" }
  | { readonly _tag: "Resumed" }
  | { readonly _tag: "SpeedChanged"; readonly speed: GameSpeed }
  | { readonly _tag: "Tick"; readonly tickCount: number }

export class Clock extends Context.Tag("Clock")<
  Clock,
  {
    readonly getState: Effect.Effect<ClockState>
    readonly isPaused: Effect.Effect<boolean>
    readonly getSpeed: Effect.Effect<GameSpeed>
    readonly getTickCount: Effect.Effect<number>
    readonly pause: Effect.Effect<void>
    readonly resume: Effect.Effect<void>
    readonly togglePause: Effect.Effect<void>
    readonly setSpeed: (speed: GameSpeed) => Effect.Effect<void>
    readonly tick: Effect.Effect<number>
    readonly subscribe: Effect.Effect<Queue.Dequeue<ClockEvent>, never, Scope.Scope>
  }
>() {}

export const ClockLive = Layer.effect(
  Clock,
  Effect.gen(function* () {
    const stateRef = yield* Ref.make<ClockState>({
      isPaused: true,
      speed: 1,
      tickCount: 0,
      elapsedMs: 0
    })

    const eventBus = yield* PubSub.unbounded<ClockEvent>()

    const getState = Ref.get(stateRef)

    const isPaused = Effect.map(getState, (s) => s.isPaused)

    const getSpeed = Effect.map(getState, (s) => s.speed)

    const getTickCount = Effect.map(getState, (s) => s.tickCount)

    const pause = Effect.gen(function* () {
      yield* Ref.update(stateRef, (s) => ({ ...s, isPaused: true }))
      yield* PubSub.publish(eventBus, { _tag: "Paused" })
    })

    const resume = Effect.gen(function* () {
      yield* Ref.update(stateRef, (s) => ({ ...s, isPaused: false }))
      yield* PubSub.publish(eventBus, { _tag: "Resumed" })
    })

    const togglePause = Effect.gen(function* () {
      const state = yield* Ref.get(stateRef)
      if (state.isPaused) {
        yield* resume
      } else {
        yield* pause
      }
    })

    const setSpeed = (speed: GameSpeed) =>
      Effect.gen(function* () {
        yield* Ref.update(stateRef, (s) => ({ ...s, speed }))
        yield* PubSub.publish(eventBus, { _tag: "SpeedChanged", speed })
      })

    const tick = Effect.gen(function* () {
      const newCount = yield* Ref.updateAndGet(stateRef, (s) => ({
        ...s,
        tickCount: s.tickCount + 1
      }))
      yield* PubSub.publish(eventBus, { _tag: "Tick", tickCount: newCount.tickCount })
      return newCount.tickCount
    })

    const subscribe = PubSub.subscribe(eventBus)

    return {
      getState,
      isPaused,
      getSpeed,
      getTickCount,
      pause,
      resume,
      togglePause,
      setSpeed,
      tick,
      subscribe
    } as const
  })
)
