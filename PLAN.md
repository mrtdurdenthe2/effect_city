# Effect City - Low-Poly City Simulator Plan

A browser-based city simulator (Cities: Skylines style) using Three.js for rendering and Effect TypeScript for all game logic.

## Tech Stack
- **Renderer**: Three.js with low-poly aesthetic (flat shading)
- **Game Logic**: Effect TypeScript (services, layers, streams)
- **Build Tool**: Vite (fast HMR, great TypeScript support)
- **Package Manager**: bun

## Project Structure

```
src/
├── main.ts                     # Entry point
├── core/                       # Game infrastructure
│   ├── GameLoop.ts             # Effect Stream-based tick system
│   ├── Clock.ts                # Time/speed controls
│   └── EventBus.ts             # PubSub for service communication
├── domain/                     # Pure data models (Schema.Class)
│   ├── Grid.ts, Building.ts, Zone.ts, Road.ts, Citizen.ts
├── services/                   # Effect services (all game logic)
│   ├── GridService.ts          # Cell management
│   ├── ZoneService.ts          # R/C/I zones
│   ├── RoadService.ts          # Roads & connectivity
│   ├── BuildingService.ts      # Building lifecycle
│   ├── PopulationService.ts    # Citizens & growth
│   ├── EconomyService.ts       # Money, taxes, budgets
│   ├── UtilityService.ts       # Power & water networks
│   └── SimulationService.ts    # Orchestrates tick updates
├── renderer/                   # Three.js layer
│   ├── SceneManager.ts         # Scene, camera, renderer
│   ├── CameraController.ts     # Orbit/pan/zoom
│   ├── GridRenderer.ts         # Terrain visualization
│   ├── BuildingRenderer.ts     # Building meshes
│   └── materials/              # Low-poly materials
├── input/                      # User interaction
│   ├── InputService.ts         # Mouse/keyboard
│   ├── ToolService.ts          # Current tool state
│   └── RaycastService.ts       # 3D picking
├── ui/                         # HTML overlay
│   ├── Toolbar.ts, InfoPanel.ts, BudgetPanel.ts
└── layers/                     # Layer composition
    ├── MainLayer.ts            # Full app layer
    └── SimulationLayer.ts      # All simulation services
```

## Dependencies to Add

```bash
bun add three @effect/platform-browser
bun add -d @types/three vite
```

---

## Development Phases

### Phase 1: Foundation
**Goal**: Basic scene rendering, grid display, camera controls

1. Set up Vite (`vite.config.ts`, `index.html`)
2. Create `SceneManager` - Three.js scene/camera/renderer
3. Create `GridService` - 64x64 grid state with `Ref`
4. Create `GridRenderer` - flat green plane grid
5. Add orbit camera controls

**Verify**: See 64x64 green grid, can orbit/pan/zoom

### Phase 2: Interaction
**Goal**: Mouse picking, tool selection, road & zone placement

1. Create `InputService` - mouse position tracking
2. Create `RaycastService` - grid cell picking
3. Create `ToolService` - current tool state
4. Create `RoadService` - place/remove roads
5. Create `ZoneService` - paint R/C/I zones
6. HTML toolbar for tool selection
7. Update renderers for roads/zones

**Verify**: Hover highlights cells, can place roads, paint zones

### Phase 3: Buildings
**Goal**: Buildings spawn in zones, require road access

1. Create `BuildingService` - spawn logic, lifecycle
2. Road-access check in `RoadService.hasRoadAccess()`
3. Create `BuildingRenderer` - low-poly cube meshes
4. Building geometry with height variation
5. Auto-spawn buildings on simulation tick

**Verify**: Zone area near road → buildings spawn over time

### Phase 4: Simulation Core
**Goal**: Population, economy, game clock

1. Create `PopulationService` - citizen tracking, growth
2. Create `EconomyService` - money, taxes, expenses
3. Create `GameClock` with pause/speed controls
4. Create info panel showing population, money
5. Wire simulation tick order in `SimulationService`

**Verify**: Population grows, money accumulates, can pause/speed up

### Phase 5: Utilities
**Goal**: Power/water networks affect building growth

1. Create `UtilityService` - power/water state
2. Network connectivity algorithm
3. Power plant & water tower building types
4. Visual indicators for unpowered buildings
5. Utility costs in economy

**Verify**: Buildings need power to grow, costs deducted

### Phase 6: Polish
**Goal**: Save/load, visuals, performance

1. Save/load using `BrowserKeyValueStore`
2. Shadows, fog, better lighting
3. Instanced meshes for performance
4. Sound effects (optional)

---

## Key Effect Patterns

| Pattern | Use | API |
|---------|-----|-----|
| Services | Game systems | `Context.GenericTag`, `Layer.effect` |
| State | Money, population | `Ref.make`, `Ref.update` |
| Events | Service communication | `PubSub.unbounded` |
| Errors | Domain failures | `Data.TaggedError` |
| Models | Buildings, citizens | `Schema.Class` |
| Game loop | Tick stream | `Stream.unfoldEffect` |

---

## Verification

After each phase:
1. `bun run dev` - start Vite dev server
2. Open browser to `http://localhost:5173`
3. Check console for errors
4. Test the specific phase goals listed above
5. `bun run typecheck` - ensure no type errors

---

## First Steps (Phase 1 Implementation)

1. Create `vite.config.ts`
2. Create `index.html` with canvas container
3. Create `src/main.ts` entry point
4. Create `src/renderer/SceneManager.ts`
5. Create `src/services/GridService.ts`
6. Create `src/renderer/GridRenderer.ts`
7. Create `src/layers/MainLayer.ts`
