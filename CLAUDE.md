# Effect City

This is an Effect TypeScript project using bun and @effect/platform for HTTP server/client functionality.

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

## Scripts

- `bun run typecheck` - Type check the project without emitting files
- `bun run prepare` - Patches TypeScript for Effect diagnostics (runs automatically on install)
