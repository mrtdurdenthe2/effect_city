# Effect City

This is an Effect TypeScript project using Effect. 
Ignore the CLI functionality for now
<!-- effect-solutions:start -->
## Effect Best Practices


**Effect Source Reference:** `~/.local/share/effect-solutions/effect`
Search here for real implementations when docs aren't enough.

Topics include: services and layers, data modeling, error handling, configuration, testing, HTTP clients, CLIs, observability, and project structure.

**Before implementing Effect features**, run `effect-solutions list` and read the relevant guide.

<!-- effect-solutions:end -->

## Project Setup

- **Package Manager:** bun
- **Runtime:** Bun/Node.js
- **Dependencies:**
  - `effect` - Core Effect library
  - `@effect/platform` - HTTP server/client functionality
  - `@effect/language-service` - Editor diagnostics and compile-time type checking


  ## Activity Event System

  The activity panel shows live city events. Events are defined in `src/shared/MessageProtocol.ts` using a modular tagged union pattern.

  ### Adding New Activity Events

  1. **Define the event schema** in `src/shared/MessageProtocol.ts`:
     ```typescript
     export const MyNewEvent = Schema.TaggedStruct("MyNewEvent", {
       someField: Schema.String,
       anotherField: Schema.Number
     })

  2. Add to the ActivityEvent union in the same file:
  export const ActivityEvent = Schema.Union(
    // ... existing events
    MyNewEvent
  )
  3. Add display config in src/web/components/activity-panel.tsx in the getEventDisplay() switch:
  case "MyNewEvent":
    return {
      type: "info", // "info" | "alert" | "success" | "warning"
      icon: "🎉",
      title: `Something happened: ${event.someField}`,
      subtitle: `Details: ${event.anotherField}`,
      color: "#2196f3"
    }
  4. Emit the event from src/web/SimulationRunner.ts using:
  emitActivityEvent(emitter, {
    _tag: "MyNewEvent",
    someField: "value",
    anotherField: 42
  }, tick)

  For service-based events, subscribe to the service's PubSub in the Effect.scoped block and emit activity events in the stream handler.

  
## Scripts

- `bun run typecheck` - Type check the project without emitting files
- `bun run prepare` - Patches TypeScript for Effect diagnostics (runs automatically on install)
