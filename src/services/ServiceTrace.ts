import { Effect, FiberId, Option, Tracer } from "effect"

export type ServiceTraceMeta = {
  services: string[]
  trace: string[]
}

const SERVICE_ATTRIBUTE = "effect.services"

export const emptyServiceTrace: ServiceTraceMeta = {
  services: [],
  trace: []
}

const readServices = (attributes: ReadonlyMap<string, unknown>): string[] => {
  const raw = attributes.get(SERVICE_ATTRIBUTE)
  if (Array.isArray(raw)) {
    return raw.filter((value): value is string => typeof value === "string")
  }
  if (typeof raw === "string") {
    return [raw]
  }
  return []
}

const setServicesOnCurrentSpan = (services: string[]): Effect.Effect<void> =>
  Effect.option(Effect.currentSpan).pipe(
    Effect.flatMap((spanOption) =>
      Option.isNone(spanOption)
        ? Effect.void
        : Effect.sync(() => {
            spanOption.value.attribute(SERVICE_ATTRIBUTE, services)
          })
    )
  )

export const annotateServiceCall = (service: string): Effect.Effect<void> =>
  Effect.option(Effect.currentSpan).pipe(
    Effect.flatMap((spanOption) =>
      Option.isNone(spanOption)
        ? Effect.void
        : Effect.sync(() => {
            const span = spanOption.value
            const current = readServices(span.attributes)
            const next = Array.from(new Set([...current, service]))
            span.attribute(SERVICE_ATTRIBUTE, next)
          })
    )
  )

const appendParentTrace = (
  lines: string[],
  parent: Tracer.AnySpan,
  depth: number
): void => {
  lines.push(`parent${depth}.spanId=${parent.spanId}`)
  if (parent._tag === "Span") {
    lines.push(`parent${depth}.spanName=${parent.name}`)
    if (Option.isSome(parent.parent)) {
      appendParentTrace(lines, parent.parent.value, depth + 1)
    }
  } else {
    lines.push(`parent${depth}.spanType=ExternalSpan`)
  }
}

const buildTraceLines = (span: Tracer.Span, fiberId: FiberId.FiberId): string[] => {
  const lines = [
    `traceId=${span.traceId}`,
    `spanId=${span.spanId}`,
    `spanName=${span.name}`,
    `spanKind=${span.kind}`,
    `fiber=${FiberId.threadName(fiberId)}`
  ]

  if (Option.isSome(span.parent)) {
    appendParentTrace(lines, span.parent.value, 1)
  }

  return lines
}

export const captureServiceTrace = Effect.option(Effect.currentSpan).pipe(
  Effect.flatMap((spanOption) =>
    Option.isNone(spanOption)
      ? Effect.succeed(emptyServiceTrace)
      : Effect.gen(function* () {
          const span = spanOption.value
          const fiberId = yield* Effect.fiberId
          return {
            services: readServices(span.attributes),
            trace: buildTraceLines(span, fiberId)
          }
        })
  )
)

export const captureActivityTrace = (activityName: string): Effect.Effect<ServiceTraceMeta> =>
  Effect.option(Effect.currentSpan).pipe(
    Effect.flatMap((parentOption) =>
      Effect.withSpan(
        Effect.gen(function* () {
          if (Option.isSome(parentOption)) {
            const parentServices = readServices(parentOption.value.attributes)
            if (parentServices.length > 0) {
              yield* setServicesOnCurrentSpan(parentServices)
            }
          }
          return yield* captureServiceTrace
        }),
        activityName
      )
    )
  )

export const withServiceSpan = <A, E, R>(
  service: string,
  spanName: string,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  Effect.option(Effect.currentSpan).pipe(
    Effect.flatMap((spanOption) =>
      Option.isNone(spanOption)
        ? Effect.withSpan(
            Effect.flatMap(annotateServiceCall(service), () => effect),
            spanName
          )
        : Effect.flatMap(annotateServiceCall(service), () => effect)
    )
  )
