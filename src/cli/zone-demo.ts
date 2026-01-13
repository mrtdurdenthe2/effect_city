import { Effect, Console, Duration, Layer, Option } from "effect"
import { GridPosition, GridStats } from "../domain/Grid.js"
import { ZoneStats, ZoneType } from "../domain/Zone.js"
import { GridService, GridServiceLive } from "../services/GridService.js"
import { ZoneService, ZoneServiceLive } from "../services/ZoneService.js"

// ANSI color codes
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  white: "\x1b[37m",
  bgBlue: "\x1b[44m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgRed: "\x1b[41m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
}

// Zone type to color mapping for display
const zoneColor = (type: ZoneType): string => {
  switch (type) {
    case "residential": return c.green
    case "commercial": return c.blue
    case "industrial": return c.yellow
  }
}

const zoneLabel = (type: ZoneType): string => {
  switch (type) {
    case "residential": return "R"
    case "commercial": return "C"
    case "industrial": return "I"
  }
}

const formatGridStats = (stats: GridStats): string => {
  return `
${c.bold}Grid Stats:${c.reset}
  Size: ${c.cyan}${stats.width}x${stats.height}${c.reset} (${stats.totalCells} cells)
  Empty Cells:    ${c.dim}${stats.emptyCells}${c.reset}
  Road Cells:     ${c.white}${stats.roadCells}${c.reset}
  Zoned Cells:    ${c.cyan}${stats.zonedCells}${c.reset}
  Building Cells: ${c.magenta}${stats.buildingCells}${c.reset}`
}

const formatZoneStats = (stats: ZoneStats): string => {
  return `
${c.bold}Zone Stats:${c.reset}
  ${c.bold}Zones:${c.reset}
    Residential: ${c.green}${stats.residentialZones}${c.reset} zones (${stats.residentialCells} cells)
    Commercial:  ${c.blue}${stats.commercialZones}${c.reset} zones (${stats.commercialCells} cells)
    Industrial:  ${c.yellow}${stats.industrialZones}${c.reset} zones (${stats.industrialCells} cells)
    Total:       ${c.cyan}${stats.totalZonedCells}${c.reset} zoned cells

  ${c.bold}Demand:${c.reset}
    Residential: ${formatDemandBar(stats.residentialDemand, c.green)}
    Commercial:  ${formatDemandBar(stats.commercialDemand, c.blue)}
    Industrial:  ${formatDemandBar(stats.industrialDemand, c.yellow)}`
}

const formatDemandBar = (demand: number, color: string): string => {
  const filled = Math.round(demand / 5)
  const empty = 20 - filled
  return `${color}${"█".repeat(filled)}${c.dim}${"░".repeat(empty)}${c.reset} ${demand}%`
}

// Render a portion of the grid as ASCII art
const renderGrid = (
  grid: GridService["Type"],
  zone: ZoneService["Type"],
  startX: number,
  startY: number,
  width: number,
  height: number
) =>
  Effect.gen(function* () {
    let output = `\n${c.dim}   `
    // Column headers
    for (let x = startX; x < startX + width; x++) {
      output += (x % 5 === 0) ? `${x % 10}` : " "
    }
    output += `${c.reset}\n`

    for (let y = startY; y < startY + height; y++) {
      // Row header
      output += `${c.dim}${String(y).padStart(2)} ${c.reset}`

      for (let x = startX; x < startX + width; x++) {
        const pos = GridPosition.create(x, y)
        const cell = yield* grid.getCell(pos)
        const zoneOpt = yield* zone.getZoneAt(pos)

        if (cell.hasRoad) {
          output += `${c.white}#${c.reset}`
        } else if (cell.hasBuilding()) {
          output += `${c.magenta}▄${c.reset}`
        } else if (Option.isSome(zoneOpt)) {
          const z = zoneOpt.value
          output += `${zoneColor(z.type)}${zoneLabel(z.type)}${c.reset}`
        } else {
          output += `${c.dim}.${c.reset}`
        }
      }
      output += "\n"
    }
    return output
  })

const simulation = Effect.gen(function* () {
  const grid = yield* GridService
  const zone = yield* ZoneService

  yield* Console.log(`
${c.bold}${c.cyan}╔════════════════════════════════════════════════════════════════╗
║           EFFECT CITY - Zone & Grid Service Demo               ║
╚════════════════════════════════════════════════════════════════╝${c.reset}

This demo shows the GridService and ZoneService managing:
  ${c.cyan}•${c.reset} Grid - 64x64 cell management
  ${c.cyan}•${c.reset} Roads - placing roads on the grid
  ${c.cyan}•${c.reset} Zones - R/C/I zone painting and management
  ${c.cyan}•${c.reset} Road Access - checking if zones have road access

${c.dim}Watch as we build a small city section!${c.reset}
`)

  yield* Effect.sleep(Duration.seconds(2))

  // Show initial grid stats
  const initialGridStats = yield* grid.getStats
  yield* Console.log(formatGridStats(initialGridStats))

  yield* Effect.sleep(Duration.seconds(1))

  // Step 1: Place some roads
  yield* Console.log(`\n${c.bold}Step 1: Building roads...${c.reset}`)

  // Main horizontal road
  yield* Console.log(`  Placing main road from (5,10) to (25,10)...`)
  yield* grid.placeRoadLine(GridPosition.create(5, 10), GridPosition.create(25, 10))

  // Vertical road
  yield* Console.log(`  Placing cross road from (15,5) to (15,20)...`)
  yield* grid.placeRoadLine(GridPosition.create(15, 5), GridPosition.create(15, 20))

  // Secondary horizontal
  yield* Console.log(`  Placing secondary road from (5,15) to (25,15)...`)
  yield* grid.placeRoadLine(GridPosition.create(5, 15), GridPosition.create(25, 15))

  const afterRoadsStats = yield* grid.getStats
  yield* Console.log(`\n${c.green}Roads placed!${c.reset}`)
  yield* Console.log(`  Road cells: ${c.white}${afterRoadsStats.roadCells}${c.reset}`)

  // Render grid
  const gridView1 = yield* renderGrid(grid, zone, 0, 0, 30, 25)
  yield* Console.log(gridView1)

  yield* Effect.sleep(Duration.seconds(2))

  // Step 2: Paint residential zones
  yield* Console.log(`\n${c.bold}Step 2: Painting residential zones (green R)...${c.reset}`)

  yield* Console.log(`  Zoning area (6,6) to (14,9) as residential...`)
  yield* zone.paintZoneArea(
    GridPosition.create(6, 6),
    GridPosition.create(14, 9),
    "residential"
  )

  yield* Console.log(`  Zoning area (16,6) to (24,9) as residential...`)
  yield* zone.paintZoneArea(
    GridPosition.create(16, 6),
    GridPosition.create(24, 9),
    "residential"
  )

  const afterResidentialStats = yield* zone.getStats
  yield* Console.log(`\n${c.green}Residential zones created!${c.reset}`)
  yield* Console.log(`  Residential cells: ${c.green}${afterResidentialStats.residentialCells}${c.reset}`)

  const gridView2 = yield* renderGrid(grid, zone, 0, 0, 30, 25)
  yield* Console.log(gridView2)

  yield* Effect.sleep(Duration.seconds(2))

  // Step 3: Paint commercial zones
  yield* Console.log(`\n${c.bold}Step 3: Painting commercial zones (blue C)...${c.reset}`)

  yield* Console.log(`  Zoning area (6,11) to (14,14) as commercial...`)
  yield* zone.paintZoneArea(
    GridPosition.create(6, 11),
    GridPosition.create(14, 14),
    "commercial"
  )

  yield* Console.log(`  Zoning area (16,11) to (24,14) as commercial...`)
  yield* zone.paintZoneArea(
    GridPosition.create(16, 11),
    GridPosition.create(24, 14),
    "commercial"
  )

  const afterCommercialStats = yield* zone.getStats
  yield* Console.log(`\n${c.blue}Commercial zones created!${c.reset}`)
  yield* Console.log(`  Commercial cells: ${c.blue}${afterCommercialStats.commercialCells}${c.reset}`)

  const gridView3 = yield* renderGrid(grid, zone, 0, 0, 30, 25)
  yield* Console.log(gridView3)

  yield* Effect.sleep(Duration.seconds(2))

  // Step 4: Paint industrial zones
  yield* Console.log(`\n${c.bold}Step 4: Painting industrial zones (yellow I)...${c.reset}`)

  yield* Console.log(`  Zoning area (6,16) to (14,19) as industrial...`)
  yield* zone.paintZoneArea(
    GridPosition.create(6, 16),
    GridPosition.create(14, 19),
    "industrial"
  )

  yield* Console.log(`  Zoning area (16,16) to (24,19) as industrial...`)
  yield* zone.paintZoneArea(
    GridPosition.create(16, 16),
    GridPosition.create(24, 19),
    "industrial"
  )

  const afterIndustrialStats = yield* zone.getStats
  yield* Console.log(`\n${c.yellow}Industrial zones created!${c.reset}`)
  yield* Console.log(`  Industrial cells: ${c.yellow}${afterIndustrialStats.industrialCells}${c.reset}`)

  const gridView4 = yield* renderGrid(grid, zone, 0, 0, 30, 25)
  yield* Console.log(gridView4)

  yield* Effect.sleep(Duration.seconds(2))

  // Step 5: Check road access
  yield* Console.log(`\n${c.bold}Step 5: Checking road access...${c.reset}`)

  const testPositions = [
    GridPosition.create(8, 8),   // Should have access
    GridPosition.create(20, 7),  // Should have access
    GridPosition.create(0, 0),   // No access
    GridPosition.create(12, 11), // Adjacent to road - should have access
  ]

  for (const pos of testPositions) {
    const hasAccess = yield* grid.hasRoadAccess(pos)
    const zoneOpt = yield* zone.getZoneAt(pos)
    const zoneStr = Option.isSome(zoneOpt) ? zoneOpt.value.type : "none"
    yield* Console.log(
      `  Position (${pos.x},${pos.y}) - Zone: ${zoneStr}, Road Access: ${hasAccess ? c.green + "Yes" : c.red + "No"}${c.reset}`
    )
  }

  yield* Effect.sleep(Duration.seconds(2))

  // Step 6: Simulate demand changes
  yield* Console.log(`\n${c.bold}Step 6: Simulating demand changes...${c.reset}`)

  for (let i = 0; i < 5; i++) {
    yield* zone.tick
    const stats = yield* zone.getStats
    yield* Console.log(`\n  Tick ${i + 1}:`)
    yield* Console.log(`    Residential Demand: ${formatDemandBar(stats.residentialDemand, c.green)}`)
    yield* Console.log(`    Commercial Demand:  ${formatDemandBar(stats.commercialDemand, c.blue)}`)
    yield* Console.log(`    Industrial Demand:  ${formatDemandBar(stats.industrialDemand, c.yellow)}`)
    yield* Effect.sleep(Duration.millis(500))
  }

  yield* Effect.sleep(Duration.seconds(1))

  // Final stats
  const finalGridStats = yield* grid.getStats
  const finalZoneStats = yield* zone.getStats

  yield* Console.log(`
${c.bold}${c.cyan}╔════════════════════════════════════════════════════════════════╗
║                  Zone & Grid Demo Complete!                    ║
╚════════════════════════════════════════════════════════════════╝${c.reset}
${formatGridStats(finalGridStats)}
${formatZoneStats(finalZoneStats)}

${c.bold}Legend:${c.reset}
  ${c.dim}.${c.reset} = Empty cell
  ${c.white}#${c.reset} = Road
  ${c.green}R${c.reset} = Residential zone
  ${c.blue}C${c.reset} = Commercial zone
  ${c.yellow}I${c.reset} = Industrial zone
  ${c.magenta}▄${c.reset} = Building

${c.bold}GridService Features:${c.reset}
  ${c.green}✓${c.reset} 64x64 cell grid management
  ${c.green}✓${c.reset} Road placement (single cell and line)
  ${c.green}✓${c.reset} Zone painting
  ${c.green}✓${c.reset} Road access checking
  ${c.green}✓${c.reset} Neighbor queries
  ${c.green}✓${c.reset} Grid statistics

${c.bold}ZoneService Features:${c.reset}
  ${c.green}✓${c.reset} R/C/I zone painting
  ${c.green}✓${c.reset} Area zone painting
  ${c.green}✓${c.reset} Zone merging (adjacent same-type zones)
  ${c.green}✓${c.reset} Demand tracking
  ${c.green}✓${c.reset} Available cell queries
  ${c.green}✓${c.reset} Zone statistics

${c.dim}Run with: bun run demo:zone${c.reset}
`)
})

// Create layer that provides both services
const ZoneGridLayer = Layer.mergeAll(
  GridServiceLive,
  ZoneServiceLive.pipe(Layer.provide(GridServiceLive))
)

const program = simulation.pipe(
  Effect.provide(ZoneGridLayer),
  Effect.scoped
)

Effect.runPromise(program).catch(console.error)
