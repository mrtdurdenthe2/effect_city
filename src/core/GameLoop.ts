import { Context, Effect, Layer, Stream, Duration, Ref, Fiber } from "effect"
import { Clock, type GameSpeed } from "./Clock.js"

// Base tick interval in milliseconds (at 1x speed)
const BASE_TICK_MS = 1000

const getTickInterval = (speed: GameSpeed): Duration.Duration =>
  Duration.millis(BASE_TICK_MS / speed)

export class GameLoop extends Context.Tag("GameLoop")<
  GameLoop,
  {
    readonly start: Effect.Effect<void>
    readonly stop: Effect.Effect<void>
    readonly isRunning: Effect.Effect<boolean>
    readonly onTick: (handler: (tickCount: number) => Effect.Effect<void>) => Effect.Effect<void>
  }
>() {}

export const GameLoopLive = Layer.effect(
  GameLoop,
  Effect.gen(function* () {
    const clock = yield* Clock

    const loopFiberRef = yield* Ref.make<Fiber.Fiber<void> | null>(null)
    const tickHandlersRef = yield* Ref.make<Array<(tickCount: number) => Effect.Effect<void>>>([])

    const runTickHandlers = (tickCount: number): Effect.Effect<void> =>
      Effect.gen(function* () {
        const handlers = yield* Ref.get(tickHandlersRef)
        yield* Effect.forEach(handlers, (handler) => handler(tickCount), { discard: true })
      })

    // Use Stream.repeatEffect for an infinite loop instead of unfoldEffect
    const loopStream = Stream.repeatEffect(
      Effect.gen(function* () {
        const isPaused = yield* clock.isPaused
        const speed = yield* clock.getSpeed

        if (isPaused) {
          // When paused, check every 100ms if we should resume
          yield* Effect.sleep(Duration.millis(100))
          return
        }

        // Execute a tick
        const tickCount = yield* clock.tick
        yield* runTickHandlers(tickCount)

        // Wait for next tick based on speed
        yield* Effect.sleep(getTickInterval(speed))
      })
    )

    const start = Effect.gen(function* () {
      const currentFiber = yield* Ref.get(loopFiberRef)
      if (currentFiber !== null) {
        return // Already running
      }

      yield* clock.resume
      const fiber = yield* Stream.runDrain(loopStream).pipe(Effect.fork)
      yield* Ref.set(loopFiberRef, fiber)
    })

    const stop = Effect.gen(function* () {
      yield* clock.pause
      const fiber = yield* Ref.get(loopFiberRef)
      if (fiber !== null) {
        yield* Fiber.interrupt(fiber)
        yield* Ref.set(loopFiberRef, null)
      }
    })

    const isRunning = Effect.map(
      Ref.get(loopFiberRef),
      (fiber) => fiber !== null
    )

    const onTick = (handler: (tickCount: number) => Effect.Effect<void>) =>
      Ref.update(tickHandlersRef, (handlers) => [...handlers, handler])

    return {
      start,
      stop,
      isRunning,
      onTick
    } as const
  })
)
