import { Context, Effect, Layer, Ref, Metric, Array as EffectArray } from "effect"

// A single metric snapshot entry
export interface MetricEntry {
  readonly name: string
  readonly value: number
  readonly tags: ReadonlyArray<{ key: string; value: string }>
}

// A complete snapshot at a point in time
export interface MetricsSnapshot {
  readonly tick: number
  readonly timestamp: number
  readonly metrics: ReadonlyArray<MetricEntry>
}

// Serialized format for sending to client
export interface SerializedMetricsHistory {
  readonly snapshots: ReadonlyArray<MetricsSnapshot>
  readonly metricNames: ReadonlyArray<string>
}

export class MetricsService extends Context.Tag("MetricsService")<
  MetricsService,
  {
    // Take a snapshot of all current metrics
    readonly takeSnapshot: (tick: number) => Effect.Effect<MetricsSnapshot>

    // Get recent history (last N snapshots)
    readonly getHistory: (count: number) => Effect.Effect<ReadonlyArray<MetricsSnapshot>>

    // Get all available metric names
    readonly getMetricNames: Effect.Effect<ReadonlyArray<string>>

    // Get serialized history for client
    readonly getSerializedHistory: (count: number) => Effect.Effect<SerializedMetricsHistory>

    // Clear history
    readonly clearHistory: Effect.Effect<void>
  }
>() {}

const MAX_HISTORY_SIZE = 500

export const MetricsServiceLive = Layer.effect(
  MetricsService,
  Effect.gen(function* () {
    const historyRef = yield* Ref.make<ReadonlyArray<MetricsSnapshot>>([])
    const metricNamesRef = yield* Ref.make<Set<string>>(new Set())

    const takeSnapshot = (tick: number): Effect.Effect<MetricsSnapshot> =>
      Effect.gen(function* () {
        // Use Effect's built-in metric snapshot functionality
        const rawSnapshot = yield* Metric.snapshot

        const entries: MetricEntry[] = []
        const names = new Set<string>()

        for (const pair of rawSnapshot) {
          const name = pair.metricKey.name
          names.add(name)

          // Extract tags
          const tags: { key: string; value: string }[] = []
          for (const tag of pair.metricKey.tags) {
            tags.push({ key: tag.key, value: tag.value })
          }

          // Extract numeric value based on metric state type
          const state = pair.metricState
          let value = 0

          // Check the metric state type and extract value accordingly
          if ("count" in state && typeof state.count === "number") {
            // Counter
            value = state.count
          } else if ("value" in state && typeof state.value === "number") {
            // Gauge
            value = state.value
          } else if ("count" in state && "sum" in state) {
            // Histogram or Summary - use mean
            const count = typeof state.count === "number" ? state.count : Number(state.count)
            const sum = typeof state.sum === "number" ? state.sum : Number(state.sum)
            value = count > 0 ? sum / count : 0
          } else if ("occurrences" in state && state.occurrences instanceof Map) {
            // Frequency - sum all occurrences
            let total = 0
            for (const count of state.occurrences.values()) {
              total += typeof count === "number" ? count : Number(count)
            }
            value = total
          }

          entries.push({ name, value, tags })
        }

        // Update known metric names
        yield* Ref.update(metricNamesRef, (existing) => {
          const combined = new Set(existing)
          for (const n of names) {
            combined.add(n)
          }
          return combined
        })

        const snapshot: MetricsSnapshot = {
          tick,
          timestamp: Date.now(),
          metrics: entries
        }

        // Add to history, keeping only last MAX_HISTORY_SIZE entries
        yield* Ref.update(historyRef, (history) => {
          const newHistory = [...history, snapshot]
          if (newHistory.length > MAX_HISTORY_SIZE) {
            return newHistory.slice(-MAX_HISTORY_SIZE)
          }
          return newHistory
        })

        return snapshot
      })

    const getHistory = (count: number): Effect.Effect<ReadonlyArray<MetricsSnapshot>> =>
      Effect.map(Ref.get(historyRef), (history) =>
        history.slice(-Math.min(count, history.length))
      )

    const getMetricNames: Effect.Effect<ReadonlyArray<string>> =
      Effect.map(Ref.get(metricNamesRef), (names) =>
        EffectArray.fromIterable(names).sort()
      )

    const getSerializedHistory = (count: number): Effect.Effect<SerializedMetricsHistory> =>
      Effect.gen(function* () {
        const snapshots = yield* getHistory(count)
        const metricNames = yield* getMetricNames

        return {
          snapshots,
          metricNames
        }
      })

    const clearHistory: Effect.Effect<void> =
      Ref.set(historyRef, [])

    return {
      takeSnapshot,
      getHistory,
      getMetricNames,
      getSerializedHistory,
      clearHistory
    } as const
  })
)  
