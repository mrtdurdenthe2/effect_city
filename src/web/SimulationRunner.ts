import { Effect, Layer, Stream, Option } from "effect"
import { GridPosition } from "../domain/Grid.js"
import { GridService } from "../services/GridService.js"
import { ZoneService } from "../services/ZoneService.js"
import { RoadService } from "../services/RoadService.js"
import { SimulationService, SimulationLayer } from "../services/SimulationService.js"
import { MetricsService, MetricsServiceLive } from "../services/MetricsService.js"
import { BusinessService } from "../services/BusinessService.js"
import { EconomyService } from "../services/EconomyService.js"
import { ChaosService } from "../services/ChaosService.js"
import { Clock, ClockLive } from "../core/Clock.js"
import type { EventEmitter } from "./EventEmitter.js"
import type { Zone } from "../domain/Zone.js"
import type {
  SerializedCell,
  SerializedZone,
  SerializedSimulationStats,
  ClockState,
  MetricsSnapshot,
  ActivityEvent
} from "../shared/MessageProtocol.js"

// Combined layer for all services
// SimulationLayer includes Grid, Zone, Business, Population, Economy, Road, Chaos services
const BaseLayer = SimulationLayer

// Add Metrics service on top
const AppLayer = Layer.mergeAll(
  BaseLayer,
  MetricsServiceLive,
  ClockLive
)

// Store reference to metrics service for external access
type MetricsServiceApi = {
  getSerializedHistory: (count: number) => Effect.Effect<{
    snapshots: ReadonlyArray<{ tick: number; timestamp: number; metrics: ReadonlyArray<{ name: string; value: number; tags: ReadonlyArray<{ key: string; value: string }> }> }>
    metricNames: ReadonlyArray<string>
  }>
}

let metricsServiceRef: MetricsServiceApi | null = null

// Helper to emit activity events
const emitActivityEvent = (
  emitter: EventEmitter,
  event: ActivityEvent,
  tick: number,
  meta: { services: string[]; trace: string[] }
): void => {
  emitter.emit({
    type: "server:message",
    data: {
      type: "activity_event",
      event,
      meta,
      tick,
      timestamp: Date.now()
    }
  })
}

export class SimulationRunner {
  constructor(private readonly eventEmitter: EventEmitter) {}

  start(): void {
    const emitter = this.eventEmitter
    console.log("SimulationRunner starting...")

    const program = Effect.gen(function* () {
      console.log("Effect program starting...")
      const grid = yield* GridService
      const zone = yield* ZoneService
      const road = yield* RoadService
      const simulation = yield* SimulationService
      const clock = yield* Clock
      const metricsService = yield* MetricsService
      const businessService = yield* BusinessService
      const economyService = yield* EconomyService
      const chaosService = yield* ChaosService

      // Store reference for external access
      metricsServiceRef = metricsService

      // Build initial city layout
      console.log("Building initial city layout...")

      // Main roads - grid pattern for 128x128 city
      // Horizontal avenues (main roads)
      yield* road.placeRoadLine(GridPosition.create(20, 32), GridPosition.create(108, 32), "avenue")
      yield* road.placeRoadLine(GridPosition.create(20, 52), GridPosition.create(108, 52), "avenue")
      yield* road.placeRoadLine(GridPosition.create(20, 72), GridPosition.create(108, 72), "avenue")
      yield* road.placeRoadLine(GridPosition.create(20, 92), GridPosition.create(108, 92), "avenue")

      // Vertical avenues (main roads)
      yield* road.placeRoadLine(GridPosition.create(32, 20), GridPosition.create(32, 108), "avenue")
      yield* road.placeRoadLine(GridPosition.create(52, 20), GridPosition.create(52, 108), "avenue")
      yield* road.placeRoadLine(GridPosition.create(72, 20), GridPosition.create(72, 108), "avenue")
      yield* road.placeRoadLine(GridPosition.create(92, 20), GridPosition.create(92, 108), "avenue")

      // Secondary streets (between avenues)
      yield* road.placeRoadLine(GridPosition.create(20, 42), GridPosition.create(108, 42), "street")
      yield* road.placeRoadLine(GridPosition.create(20, 62), GridPosition.create(108, 62), "street")
      yield* road.placeRoadLine(GridPosition.create(20, 82), GridPosition.create(108, 82), "street")
      yield* road.placeRoadLine(GridPosition.create(42, 20), GridPosition.create(42, 108), "street")
      yield* road.placeRoadLine(GridPosition.create(62, 20), GridPosition.create(62, 108), "street")
      yield* road.placeRoadLine(GridPosition.create(82, 20), GridPosition.create(82, 108), "street")

      // Residential zones (green) - northwest quadrant and west side
      yield* zone.paintZoneArea(GridPosition.create(33, 33), GridPosition.create(41, 41), "residential")
      yield* zone.paintZoneArea(GridPosition.create(33, 43), GridPosition.create(41, 51), "residential")
      yield* zone.paintZoneArea(GridPosition.create(43, 33), GridPosition.create(51, 41), "residential")
      yield* zone.paintZoneArea(GridPosition.create(43, 43), GridPosition.create(51, 51), "residential")
      yield* zone.paintZoneArea(GridPosition.create(33, 53), GridPosition.create(41, 61), "residential")
      yield* zone.paintZoneArea(GridPosition.create(43, 53), GridPosition.create(51, 61), "residential")
      yield* zone.paintZoneArea(GridPosition.create(33, 63), GridPosition.create(41, 71), "residential")
      yield* zone.paintZoneArea(GridPosition.create(43, 63), GridPosition.create(51, 71), "residential")
      // More residential in southwest
      yield* zone.paintZoneArea(GridPosition.create(33, 73), GridPosition.create(41, 81), "residential")
      yield* zone.paintZoneArea(GridPosition.create(43, 73), GridPosition.create(51, 81), "residential")
      yield* zone.paintZoneArea(GridPosition.create(33, 83), GridPosition.create(41, 91), "residential")
      yield* zone.paintZoneArea(GridPosition.create(43, 83), GridPosition.create(51, 91), "residential")

      // Commercial zones (blue) - center area
      yield* zone.paintZoneArea(GridPosition.create(53, 33), GridPosition.create(61, 41), "commercial")
      yield* zone.paintZoneArea(GridPosition.create(63, 33), GridPosition.create(71, 41), "commercial")
      yield* zone.paintZoneArea(GridPosition.create(53, 43), GridPosition.create(61, 51), "commercial")
      yield* zone.paintZoneArea(GridPosition.create(63, 43), GridPosition.create(71, 51), "commercial")
      yield* zone.paintZoneArea(GridPosition.create(53, 53), GridPosition.create(61, 61), "commercial")
      yield* zone.paintZoneArea(GridPosition.create(63, 53), GridPosition.create(71, 61), "commercial")
      yield* zone.paintZoneArea(GridPosition.create(53, 63), GridPosition.create(61, 71), "commercial")
      yield* zone.paintZoneArea(GridPosition.create(63, 63), GridPosition.create(71, 71), "commercial")

      // Industrial zones (yellow) - east side and southeast
      yield* zone.paintZoneArea(GridPosition.create(73, 33), GridPosition.create(81, 41), "industrial")
      yield* zone.paintZoneArea(GridPosition.create(83, 33), GridPosition.create(91, 41), "industrial")
      yield* zone.paintZoneArea(GridPosition.create(73, 43), GridPosition.create(81, 51), "industrial")
      yield* zone.paintZoneArea(GridPosition.create(83, 43), GridPosition.create(91, 51), "industrial")
      yield* zone.paintZoneArea(GridPosition.create(73, 53), GridPosition.create(81, 61), "industrial")
      yield* zone.paintZoneArea(GridPosition.create(83, 53), GridPosition.create(91, 61), "industrial")
      yield* zone.paintZoneArea(GridPosition.create(73, 63), GridPosition.create(81, 71), "industrial")
      yield* zone.paintZoneArea(GridPosition.create(83, 63), GridPosition.create(91, 71), "industrial")
      // More industrial in southeast
      yield* zone.paintZoneArea(GridPosition.create(73, 73), GridPosition.create(81, 81), "industrial")
      yield* zone.paintZoneArea(GridPosition.create(83, 73), GridPosition.create(91, 81), "industrial")
      yield* zone.paintZoneArea(GridPosition.create(73, 83), GridPosition.create(81, 91), "industrial")
      yield* zone.paintZoneArea(GridPosition.create(83, 83), GridPosition.create(91, 91), "industrial")

      // Place residential buildings (4x the original amount)
      // Zone 1 (33-41, 33-41)
      yield* grid.placeBuilding(GridPosition.create(34, 34), "bldg-r1")
      yield* grid.placeBuilding(GridPosition.create(36, 34), "bldg-r2")
      yield* grid.placeBuilding(GridPosition.create(38, 34), "bldg-r3")
      yield* grid.placeBuilding(GridPosition.create(40, 34), "bldg-r4")
      yield* grid.placeBuilding(GridPosition.create(35, 36), "bldg-r5")
      yield* grid.placeBuilding(GridPosition.create(37, 36), "bldg-r6")
      yield* grid.placeBuilding(GridPosition.create(39, 36), "bldg-r7")
      yield* grid.placeBuilding(GridPosition.create(34, 38), "bldg-r8")
      yield* grid.placeBuilding(GridPosition.create(36, 38), "bldg-r9")
      yield* grid.placeBuilding(GridPosition.create(38, 38), "bldg-r10")
      yield* grid.placeBuilding(GridPosition.create(40, 38), "bldg-r11")
      yield* grid.placeBuilding(GridPosition.create(35, 40), "bldg-r12")
      yield* grid.placeBuilding(GridPosition.create(37, 40), "bldg-r13")
      yield* grid.placeBuilding(GridPosition.create(39, 40), "bldg-r14")

      // Zone 2 (43-51, 33-41)
      yield* grid.placeBuilding(GridPosition.create(44, 34), "bldg-r15")
      yield* grid.placeBuilding(GridPosition.create(46, 34), "bldg-r16")
      yield* grid.placeBuilding(GridPosition.create(48, 34), "bldg-r17")
      yield* grid.placeBuilding(GridPosition.create(50, 34), "bldg-r18")
      yield* grid.placeBuilding(GridPosition.create(45, 36), "bldg-r19")
      yield* grid.placeBuilding(GridPosition.create(47, 36), "bldg-r20")
      yield* grid.placeBuilding(GridPosition.create(49, 36), "bldg-r21")
      yield* grid.placeBuilding(GridPosition.create(44, 38), "bldg-r22")
      yield* grid.placeBuilding(GridPosition.create(46, 38), "bldg-r23")
      yield* grid.placeBuilding(GridPosition.create(48, 38), "bldg-r24")
      yield* grid.placeBuilding(GridPosition.create(50, 38), "bldg-r25")
      yield* grid.placeBuilding(GridPosition.create(45, 40), "bldg-r26")
      yield* grid.placeBuilding(GridPosition.create(47, 40), "bldg-r27")
      yield* grid.placeBuilding(GridPosition.create(49, 40), "bldg-r28")

      // Zone 3 (33-41, 43-51)
      yield* grid.placeBuilding(GridPosition.create(34, 44), "bldg-r29")
      yield* grid.placeBuilding(GridPosition.create(36, 44), "bldg-r30")
      yield* grid.placeBuilding(GridPosition.create(38, 44), "bldg-r31")
      yield* grid.placeBuilding(GridPosition.create(40, 44), "bldg-r32")
      yield* grid.placeBuilding(GridPosition.create(35, 46), "bldg-r33")
      yield* grid.placeBuilding(GridPosition.create(37, 46), "bldg-r34")
      yield* grid.placeBuilding(GridPosition.create(39, 46), "bldg-r35")
      yield* grid.placeBuilding(GridPosition.create(34, 48), "bldg-r36")
      yield* grid.placeBuilding(GridPosition.create(36, 48), "bldg-r37")
      yield* grid.placeBuilding(GridPosition.create(38, 48), "bldg-r38")
      yield* grid.placeBuilding(GridPosition.create(40, 48), "bldg-r39")
      yield* grid.placeBuilding(GridPosition.create(35, 50), "bldg-r40")
      yield* grid.placeBuilding(GridPosition.create(37, 50), "bldg-r41")
      yield* grid.placeBuilding(GridPosition.create(39, 50), "bldg-r42")

      // Zone 4 (43-51, 43-51)
      yield* grid.placeBuilding(GridPosition.create(44, 44), "bldg-r43")
      yield* grid.placeBuilding(GridPosition.create(46, 44), "bldg-r44")
      yield* grid.placeBuilding(GridPosition.create(48, 44), "bldg-r45")
      yield* grid.placeBuilding(GridPosition.create(50, 44), "bldg-r46")
      yield* grid.placeBuilding(GridPosition.create(45, 46), "bldg-r47")
      yield* grid.placeBuilding(GridPosition.create(47, 46), "bldg-r48")
      yield* grid.placeBuilding(GridPosition.create(49, 46), "bldg-r49")
      yield* grid.placeBuilding(GridPosition.create(44, 48), "bldg-r50")
      yield* grid.placeBuilding(GridPosition.create(46, 48), "bldg-r51")
      yield* grid.placeBuilding(GridPosition.create(48, 48), "bldg-r52")
      yield* grid.placeBuilding(GridPosition.create(50, 48), "bldg-r53")
      yield* grid.placeBuilding(GridPosition.create(45, 50), "bldg-r54")
      yield* grid.placeBuilding(GridPosition.create(47, 50), "bldg-r55")
      yield* grid.placeBuilding(GridPosition.create(49, 50), "bldg-r56")

      // Zone 5 (33-41, 53-61)
      yield* grid.placeBuilding(GridPosition.create(34, 54), "bldg-r57")
      yield* grid.placeBuilding(GridPosition.create(36, 54), "bldg-r58")
      yield* grid.placeBuilding(GridPosition.create(38, 54), "bldg-r59")
      yield* grid.placeBuilding(GridPosition.create(40, 54), "bldg-r60")
      yield* grid.placeBuilding(GridPosition.create(35, 56), "bldg-r61")
      yield* grid.placeBuilding(GridPosition.create(37, 56), "bldg-r62")
      yield* grid.placeBuilding(GridPosition.create(39, 56), "bldg-r63")
      yield* grid.placeBuilding(GridPosition.create(34, 58), "bldg-r64")
      yield* grid.placeBuilding(GridPosition.create(36, 58), "bldg-r65")
      yield* grid.placeBuilding(GridPosition.create(38, 58), "bldg-r66")
      yield* grid.placeBuilding(GridPosition.create(40, 58), "bldg-r67")
      yield* grid.placeBuilding(GridPosition.create(35, 60), "bldg-r68")
      yield* grid.placeBuilding(GridPosition.create(37, 60), "bldg-r69")
      yield* grid.placeBuilding(GridPosition.create(39, 60), "bldg-r70")

      // Zone 6 (43-51, 53-61)
      yield* grid.placeBuilding(GridPosition.create(44, 54), "bldg-r71")
      yield* grid.placeBuilding(GridPosition.create(46, 54), "bldg-r72")
      yield* grid.placeBuilding(GridPosition.create(48, 54), "bldg-r73")
      yield* grid.placeBuilding(GridPosition.create(50, 54), "bldg-r74")
      yield* grid.placeBuilding(GridPosition.create(45, 56), "bldg-r75")
      yield* grid.placeBuilding(GridPosition.create(47, 56), "bldg-r76")
      yield* grid.placeBuilding(GridPosition.create(49, 56), "bldg-r77")
      yield* grid.placeBuilding(GridPosition.create(44, 58), "bldg-r78")
      yield* grid.placeBuilding(GridPosition.create(46, 58), "bldg-r79")
      yield* grid.placeBuilding(GridPosition.create(48, 58), "bldg-r80")

      // Zone 7 (33-41, 63-71)
      yield* grid.placeBuilding(GridPosition.create(34, 64), "bldg-r81")
      yield* grid.placeBuilding(GridPosition.create(36, 64), "bldg-r82")
      yield* grid.placeBuilding(GridPosition.create(38, 64), "bldg-r83")
      yield* grid.placeBuilding(GridPosition.create(40, 64), "bldg-r84")
      yield* grid.placeBuilding(GridPosition.create(35, 66), "bldg-r85")
      yield* grid.placeBuilding(GridPosition.create(37, 66), "bldg-r86")
      yield* grid.placeBuilding(GridPosition.create(39, 66), "bldg-r87")
      yield* grid.placeBuilding(GridPosition.create(34, 68), "bldg-r88")
      yield* grid.placeBuilding(GridPosition.create(36, 68), "bldg-r89")
      yield* grid.placeBuilding(GridPosition.create(38, 68), "bldg-r90")

      // Zone 8 (43-51, 63-71)
      yield* grid.placeBuilding(GridPosition.create(44, 64), "bldg-r91")
      yield* grid.placeBuilding(GridPosition.create(46, 64), "bldg-r92")
      yield* grid.placeBuilding(GridPosition.create(48, 64), "bldg-r93")
      yield* grid.placeBuilding(GridPosition.create(50, 64), "bldg-r94")
      yield* grid.placeBuilding(GridPosition.create(45, 66), "bldg-r95")
      yield* grid.placeBuilding(GridPosition.create(47, 66), "bldg-r96")
      yield* grid.placeBuilding(GridPosition.create(49, 66), "bldg-r97")
      yield* grid.placeBuilding(GridPosition.create(44, 68), "bldg-r98")
      yield* grid.placeBuilding(GridPosition.create(46, 68), "bldg-r99")
      yield* grid.placeBuilding(GridPosition.create(48, 68), "bldg-r100")

      // More residential in southwest zones (33-51, 73-91)
      yield* grid.placeBuilding(GridPosition.create(34, 74), "bldg-r101")
      yield* grid.placeBuilding(GridPosition.create(36, 74), "bldg-r102")
      yield* grid.placeBuilding(GridPosition.create(38, 74), "bldg-r103")
      yield* grid.placeBuilding(GridPosition.create(40, 74), "bldg-r104")
      yield* grid.placeBuilding(GridPosition.create(44, 74), "bldg-r105")
      yield* grid.placeBuilding(GridPosition.create(46, 74), "bldg-r106")
      yield* grid.placeBuilding(GridPosition.create(48, 74), "bldg-r107")
      yield* grid.placeBuilding(GridPosition.create(50, 74), "bldg-r108")
      yield* grid.placeBuilding(GridPosition.create(35, 76), "bldg-r109")
      yield* grid.placeBuilding(GridPosition.create(37, 76), "bldg-r110")
      yield* grid.placeBuilding(GridPosition.create(45, 76), "bldg-r111")
      yield* grid.placeBuilding(GridPosition.create(47, 76), "bldg-r112")
      yield* grid.placeBuilding(GridPosition.create(34, 78), "bldg-r113")
      yield* grid.placeBuilding(GridPosition.create(36, 78), "bldg-r114")
      yield* grid.placeBuilding(GridPosition.create(44, 78), "bldg-r115")
      yield* grid.placeBuilding(GridPosition.create(46, 78), "bldg-r116")
      yield* grid.placeBuilding(GridPosition.create(34, 84), "bldg-r117")
      yield* grid.placeBuilding(GridPosition.create(36, 84), "bldg-r118")
      yield* grid.placeBuilding(GridPosition.create(38, 84), "bldg-r119")
      yield* grid.placeBuilding(GridPosition.create(44, 84), "bldg-r120")
      yield* grid.placeBuilding(GridPosition.create(46, 84), "bldg-r121")
      yield* grid.placeBuilding(GridPosition.create(48, 84), "bldg-r122")
      yield* grid.placeBuilding(GridPosition.create(35, 86), "bldg-r123")
      yield* grid.placeBuilding(GridPosition.create(37, 86), "bldg-r124")
      yield* grid.placeBuilding(GridPosition.create(45, 86), "bldg-r125")
      yield* grid.placeBuilding(GridPosition.create(47, 86), "bldg-r126")
      yield* grid.placeBuilding(GridPosition.create(34, 88), "bldg-r127")
      yield* grid.placeBuilding(GridPosition.create(36, 88), "bldg-r128")
      yield* grid.placeBuilding(GridPosition.create(44, 88), "bldg-r129")
      yield* grid.placeBuilding(GridPosition.create(46, 88), "bldg-r130")

      // Commercial buildings (scaled up)
      yield* grid.placeBuilding(GridPosition.create(54, 34), "bldg-c1")
      yield* grid.placeBuilding(GridPosition.create(56, 34), "bldg-c2")
      yield* grid.placeBuilding(GridPosition.create(58, 34), "bldg-c3")
      yield* grid.placeBuilding(GridPosition.create(60, 34), "bldg-c4")
      yield* grid.placeBuilding(GridPosition.create(64, 34), "bldg-c5")
      yield* grid.placeBuilding(GridPosition.create(66, 34), "bldg-c6")
      yield* grid.placeBuilding(GridPosition.create(68, 34), "bldg-c7")
      yield* grid.placeBuilding(GridPosition.create(70, 34), "bldg-c8")
      yield* grid.placeBuilding(GridPosition.create(55, 36), "bldg-c9")
      yield* grid.placeBuilding(GridPosition.create(57, 36), "bldg-c10")
      yield* grid.placeBuilding(GridPosition.create(65, 36), "bldg-c11")
      yield* grid.placeBuilding(GridPosition.create(67, 36), "bldg-c12")
      yield* grid.placeBuilding(GridPosition.create(54, 38), "bldg-c13")
      yield* grid.placeBuilding(GridPosition.create(56, 38), "bldg-c14")
      yield* grid.placeBuilding(GridPosition.create(64, 38), "bldg-c15")
      yield* grid.placeBuilding(GridPosition.create(66, 38), "bldg-c16")
      yield* grid.placeBuilding(GridPosition.create(54, 44), "bldg-c17")
      yield* grid.placeBuilding(GridPosition.create(56, 44), "bldg-c18")
      yield* grid.placeBuilding(GridPosition.create(58, 44), "bldg-c19")
      yield* grid.placeBuilding(GridPosition.create(64, 44), "bldg-c20")
      yield* grid.placeBuilding(GridPosition.create(66, 44), "bldg-c21")
      yield* grid.placeBuilding(GridPosition.create(68, 44), "bldg-c22")
      yield* grid.placeBuilding(GridPosition.create(55, 46), "bldg-c23")
      yield* grid.placeBuilding(GridPosition.create(57, 46), "bldg-c24")
      yield* grid.placeBuilding(GridPosition.create(65, 46), "bldg-c25")
      yield* grid.placeBuilding(GridPosition.create(67, 46), "bldg-c26")
      yield* grid.placeBuilding(GridPosition.create(54, 54), "bldg-c27")
      yield* grid.placeBuilding(GridPosition.create(56, 54), "bldg-c28")
      yield* grid.placeBuilding(GridPosition.create(64, 54), "bldg-c29")
      yield* grid.placeBuilding(GridPosition.create(66, 54), "bldg-c30")
      yield* grid.placeBuilding(GridPosition.create(55, 56), "bldg-c31")
      yield* grid.placeBuilding(GridPosition.create(65, 56), "bldg-c32")
      yield* grid.placeBuilding(GridPosition.create(54, 64), "bldg-c33")
      yield* grid.placeBuilding(GridPosition.create(56, 64), "bldg-c34")
      yield* grid.placeBuilding(GridPosition.create(64, 64), "bldg-c35")
      yield* grid.placeBuilding(GridPosition.create(66, 64), "bldg-c36")

      // Industrial buildings (scaled up)
      yield* grid.placeBuilding(GridPosition.create(74, 34), "bldg-i1")
      yield* grid.placeBuilding(GridPosition.create(76, 34), "bldg-i2")
      yield* grid.placeBuilding(GridPosition.create(78, 34), "bldg-i3")
      yield* grid.placeBuilding(GridPosition.create(80, 34), "bldg-i4")
      yield* grid.placeBuilding(GridPosition.create(84, 34), "bldg-i5")
      yield* grid.placeBuilding(GridPosition.create(86, 34), "bldg-i6")
      yield* grid.placeBuilding(GridPosition.create(88, 34), "bldg-i7")
      yield* grid.placeBuilding(GridPosition.create(90, 34), "bldg-i8")
      yield* grid.placeBuilding(GridPosition.create(75, 36), "bldg-i9")
      yield* grid.placeBuilding(GridPosition.create(77, 36), "bldg-i10")
      yield* grid.placeBuilding(GridPosition.create(85, 36), "bldg-i11")
      yield* grid.placeBuilding(GridPosition.create(87, 36), "bldg-i12")
      yield* grid.placeBuilding(GridPosition.create(74, 44), "bldg-i13")
      yield* grid.placeBuilding(GridPosition.create(76, 44), "bldg-i14")
      yield* grid.placeBuilding(GridPosition.create(84, 44), "bldg-i15")
      yield* grid.placeBuilding(GridPosition.create(86, 44), "bldg-i16")
      yield* grid.placeBuilding(GridPosition.create(75, 46), "bldg-i17")
      yield* grid.placeBuilding(GridPosition.create(85, 46), "bldg-i18")
      yield* grid.placeBuilding(GridPosition.create(74, 54), "bldg-i19")
      yield* grid.placeBuilding(GridPosition.create(76, 54), "bldg-i20")
      yield* grid.placeBuilding(GridPosition.create(84, 54), "bldg-i21")
      yield* grid.placeBuilding(GridPosition.create(86, 54), "bldg-i22")
      yield* grid.placeBuilding(GridPosition.create(74, 64), "bldg-i23")
      yield* grid.placeBuilding(GridPosition.create(84, 64), "bldg-i24")
      yield* grid.placeBuilding(GridPosition.create(74, 74), "bldg-i25")
      yield* grid.placeBuilding(GridPosition.create(76, 74), "bldg-i26")
      yield* grid.placeBuilding(GridPosition.create(84, 74), "bldg-i27")
      yield* grid.placeBuilding(GridPosition.create(86, 74), "bldg-i28")
      yield* grid.placeBuilding(GridPosition.create(75, 76), "bldg-i29")
      yield* grid.placeBuilding(GridPosition.create(85, 76), "bldg-i30")
      yield* grid.placeBuilding(GridPosition.create(74, 84), "bldg-i31")
      yield* grid.placeBuilding(GridPosition.create(76, 84), "bldg-i32")
      yield* grid.placeBuilding(GridPosition.create(84, 84), "bldg-i33")
      yield* grid.placeBuilding(GridPosition.create(86, 84), "bldg-i34")

      console.log("Initial city layout complete!")

      // Collect residential building IDs for housing assignments (130 buildings)
      const residentialBuildingIds = Array.from({ length: 130 }, (_, i) => `bldg-r${i + 1}`)

      // Update simulation config with residential buildings
      yield* simulation.setConfig({
        residentialBuildingIds,
        citizensPerHome: 4,  // 4 citizens per residential building = 520 max population
        utilityCosts: 50     // Scaled up for larger city
      })

      // Start simulation
      yield* simulation.start

      // Send initial state
      const cells = yield* grid.getCells
      const zones = yield* zone.getZones
      const stats = yield* simulation.getStats
      const clockState = yield* clock.getState
      const zoneStats = yield* zone.getStats
      const gridStats = yield* grid.getStats

      // Build zone lookup
      const zoneMap = new Map<string, Zone>()
      for (const z of zones) {
        zoneMap.set(z.id, z)
      }

      const serializedCells: SerializedCell[] = []
      for (const cell of cells.values()) {
        let zoneType: "residential" | "commercial" | "industrial" | undefined
        if (Option.isSome(cell.zoneId)) {
          const z = zoneMap.get(cell.zoneId.value)
          if (z) zoneType = z.type
        }
        // Only fetch road type if this cell is a road
        const roadType = cell.hasRoad
          ? yield* road.getRoadType(cell.position)
          : Option.none<"street" | "avenue" | "highway">()
        serializedCells.push({
          x: cell.position.x,
          y: cell.position.y,
          contentType: cell.contentType,
          zoneId: cell.zoneId,
          zoneType: zoneType ? Option.some(zoneType) : Option.none(),
          buildingId: cell.buildingId,
          roadType
        })
      }

      const serializedZones: SerializedZone[] = zones.map((z) => ({
        id: z.id,
        type: z.type,
        density: z.density,
        cells: z.cells.map((c) => ({ x: c.x, y: c.y })),
        demand: z.demand,
        buildingCount: z.buildingCount
      }))

      const serializedStats: SerializedSimulationStats = {
        tickCount: stats.tickCount,
        population: {
          total: stats.population.total,
          employed: stats.population.employed,
          unemployed: stats.population.unemployed,
          homeless: stats.population.homeless,
          averageHappiness: stats.population.averageHappiness
        },
        treasury: {
          balance: stats.treasury.balance,
          lastIncome: stats.treasury.lastIncome.total,
          lastExpenses: stats.treasury.lastExpenses.total
        },
        zones: {
          residentialCells: zoneStats.residentialCells,
          commercialCells: zoneStats.commercialCells,
          industrialCells: zoneStats.industrialCells,
          residentialDemand: zoneStats.residentialDemand,
          commercialDemand: zoneStats.commercialDemand,
          industrialDemand: zoneStats.industrialDemand
        },
        grid: {
          totalCells: gridStats.totalCells,
          roadCells: gridStats.roadCells,
          buildingCells: gridStats.buildingCells
        }
      }

      const serializedClock: ClockState = {
        isPaused: clockState.isPaused,
        speed: clockState.speed,
        tickCount: clockState.tickCount
      }

      // Delay initial state emission to allow React to mount and subscribe
      yield* Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 50)))

      console.log("Emitting initial state...", { cellCount: serializedCells.length })
      emitter.emit({
        type: "server:message",
        data: {
          type: "initial_state",
          grid: serializedCells,
          zones: serializedZones,
          stats: serializedStats,
          clock: serializedClock
        }
      })
      console.log("Initial state emitted")

      // Subscribe to events and emit them
      return yield* Effect.scoped(
        Effect.gen(function* () {
          const gridEvents = yield* grid.subscribe
          const simEvents = yield* simulation.subscribe
          const clockEvents = yield* clock.subscribe
          const businessEvents = yield* businessService.subscribe
          const economyEvents = yield* economyService.subscribe
          const chaosEvents = yield* chaosService.subscribe

          // Grid events
          yield* Effect.fork(
            Stream.fromQueue(gridEvents).pipe(
              Stream.runForEach((event) =>
                Effect.gen(function* () {
                  if (event._tag === "CellUpdated") {
                    const zoneOpt = yield* zone.getZoneAt(event.position)
                    const zt = Option.isSome(zoneOpt) ? zoneOpt.value.type : undefined
                    // Only fetch road type if this cell is a road
                    const rt = event.cell.hasRoad
                      ? yield* road.getRoadType(event.position)
                      : Option.none<"street" | "avenue" | "highway">()

                    emitter.emit({
                      type: "server:message",
                      data: {
                        type: "cell_updated",
                        x: event.position.x,
                        y: event.position.y,
                        contentType: event.cell.contentType,
                        zoneType: zt ? Option.some(zt) : Option.none(),
                        zoneId: event.cell.zoneId,
                        buildingId: event.cell.buildingId,
                        roadType: rt
                      }
                    })
                  }
                })
              )
            )
          )

          // Simulation tick events
          yield* Effect.fork(
            Stream.fromQueue(simEvents).pipe(
              Stream.runForEach((event) =>
                Effect.gen(function* () {
                  if (event._tag === "TickCompleted") {
                    const zs = yield* zone.getStats
                    const gs = yield* grid.getStats

                    // Take a metrics snapshot using Effect's observability
                    yield* metricsService.takeSnapshot(event.stats.tickCount)

                    const tickStats: SerializedSimulationStats = {
                      tickCount: event.stats.tickCount,
                      population: {
                        total: event.stats.population.total,
                        employed: event.stats.population.employed,
                        unemployed: event.stats.population.unemployed,
                        homeless: event.stats.population.homeless,
                        averageHappiness: event.stats.population.averageHappiness
                      },
                      treasury: {
                        balance: event.stats.treasury.balance,
                        lastIncome: event.stats.treasury.lastIncome.total,
                        lastExpenses: event.stats.treasury.lastExpenses.total
                      },
                      zones: {
                        residentialCells: zs.residentialCells,
                        commercialCells: zs.commercialCells,
                        industrialCells: zs.industrialCells,
                        residentialDemand: zs.residentialDemand,
                        commercialDemand: zs.commercialDemand,
                        industrialDemand: zs.industrialDemand
                      },
                      grid: {
                        totalCells: gs.totalCells,
                        roadCells: gs.roadCells,
                        buildingCells: gs.buildingCells
                      }
                    }

                    emitter.emit({
                      type: "server:message",
                      data: {
                        type: "simulation_tick",
                        stats: tickStats
                      }
                    })
                  } else if (event._tag === "CitizensArrived") {
                    emitActivityEvent(
                      emitter,
                      {
                        _tag: "CitizensArrived",
                        count: event.count,
                        totalPopulation: event.totalPopulation
                      },
                      event.tickCount,
                      event.trace
                    )
                  } else if (event._tag === "CitizensLeft") {
                    emitActivityEvent(
                      emitter,
                      {
                        _tag: "CitizensLeft",
                        count: event.count,
                        totalPopulation: event.totalPopulation,
                        reason: event.reason
                      },
                      event.tickCount,
                      event.trace
                    )
                  }
                })
              )
            )
          )

          // Clock events
          yield* Effect.fork(
            Stream.fromQueue(clockEvents).pipe(
              Stream.runForEach(() =>
                Effect.gen(function* () {
                  const state = yield* clock.getState
                  emitter.emit({
                    type: "server:message",
                    data: {
                      type: "clock_state",
                      clock: {
                        isPaused: state.isPaused,
                        speed: state.speed,
                        tickCount: state.tickCount
                      }
                    }
                  })
                })
              )
            )
          )

          // Business events -> Activity events
          yield* Effect.fork(
            Stream.fromQueue(businessEvents).pipe(
              Stream.runForEach((event) =>
                Effect.gen(function* () {
                  const clockState = yield* clock.getState
                  const tick = clockState.tickCount

                  if (event._tag === "BusinessCreated") {
                    emitActivityEvent(
                      emitter,
                      {
                        _tag: "BusinessCreated",
                        businessId: event.business.id,
                        businessName: event.business.name,
                        businessType: event.business.type,
                        size: event.business.size,
                        position: { x: event.business.position.x, y: event.business.position.y }
                      },
                      tick,
                      event.trace
                    )
                  } else if (event._tag === "BusinessClosed") {
                    const business = yield* businessService.getBusiness(event.businessId)
                    emitActivityEvent(
                      emitter,
                      {
                        _tag: "BusinessClosed",
                        businessId: event.businessId,
                        businessName: Option.isSome(business) ? business.value.name : "Unknown"
                      },
                      tick,
                      event.trace
                    )
                  }
                })
              )
            )
          )

          // Economy events -> Activity events
          yield* Effect.fork(
            Stream.fromQueue(economyEvents).pipe(
              Stream.runForEach((event) =>
                Effect.gen(function* () {
                  const clockState = yield* clock.getState
                  const tick = clockState.tickCount
                  const treasury = yield* economyService.getTreasury

                  if (event._tag === "EnteredDebt") {
                    emitActivityEvent(
                      emitter,
                      {
                        _tag: "EnteredDebt",
                        balance: treasury.balance
                      },
                      tick,
                      event.trace
                    )
                  } else if (event._tag === "ExitedDebt") {
                    emitActivityEvent(
                      emitter,
                      {
                        _tag: "ExitedDebt",
                        balance: treasury.balance
                      },
                      tick,
                      event.trace
                    )
                  } else if (event._tag === "Bankrupt") {
                    emitActivityEvent(
                      emitter,
                      {
                        _tag: "Bankrupt"
                      },
                      tick,
                      event.trace
                    )
                  }
                })
              )
            )
          )

          // Chaos events -> Activity events
          yield* Effect.fork(
            Stream.fromQueue(chaosEvents).pipe(
              Stream.runForEach((event) =>
                Effect.gen(function* () {
                  const clockState = yield* clock.getState
                  const tick = clockState.tickCount

                  if (event._tag === "CarCrash") {
                    const affectedCitizens = event.event.affectedCitizenDetails.map((c) => ({
                      id: c.id,
                      firstName: c.firstName,
                      lastName: c.lastName,
                      age: c.age,
                      wasEmployed: c.wasEmployed,
                      hadHome: c.hadHome
                    }))
                    emitActivityEvent(
                      emitter,
                      {
                        _tag: "CarCrash",
                        eventId: event.event.id,
                        severity: event.event.severity,
                        position: { x: event.event.position.x, y: event.event.position.y },
                        roadType: event.event.roadType,
                        affectedCitizens
                      },
                      tick,
                      event.trace
                    )
                  } else if (event._tag === "CitizenAccident") {
                    const affectedCitizens = event.event.affectedCitizenDetails.map((c) => ({
                      id: c.id,
                      firstName: c.firstName,
                      lastName: c.lastName,
                      age: c.age,
                      wasEmployed: c.wasEmployed,
                      hadHome: c.hadHome
                    }))
                    emitActivityEvent(
                      emitter,
                      {
                        _tag: "CitizenAccident",
                        eventId: event.event.id,
                        severity: event.event.severity,
                        position: { x: event.event.position.x, y: event.event.position.y },
                        affectedCitizens
                      },
                      tick,
                      event.trace
                    )
                  } else if (event._tag === "CitizenIllness") {
                    const affectedCitizens = event.event.affectedCitizenDetails.map((c) => ({
                      id: c.id,
                      firstName: c.firstName,
                      lastName: c.lastName,
                      age: c.age,
                      wasEmployed: c.wasEmployed,
                      hadHome: c.hadHome
                    }))
                    emitActivityEvent(
                      emitter,
                      {
                        _tag: "CitizenIllness",
                        eventId: event.event.id,
                        severity: event.event.severity,
                        affectedCitizens
                      },
                      tick,
                      event.trace
                    )
                  } else if (event._tag === "PowerOutage") {
                    const affectedCitizens = event.event.affectedCitizenDetails.map((c) => ({
                      id: c.id,
                      firstName: c.firstName,
                      lastName: c.lastName,
                      age: c.age,
                      wasEmployed: c.wasEmployed,
                      hadHome: c.hadHome
                    }))
                    emitActivityEvent(
                      emitter,
                      {
                        _tag: "PowerOutage",
                        eventId: event.event.id,
                        severity: event.event.severity,
                        position: { x: event.event.position.x, y: event.event.position.y },
                        affectedCitizens
                      },
                      tick,
                      event.trace
                    )
                  } else if (event._tag === "WaterMainBreak") {
                    const affectedCitizens = event.event.affectedCitizenDetails.map((c) => ({
                      id: c.id,
                      firstName: c.firstName,
                      lastName: c.lastName,
                      age: c.age,
                      wasEmployed: c.wasEmployed,
                      hadHome: c.hadHome
                    }))
                    emitActivityEvent(
                      emitter,
                      {
                        _tag: "WaterMainBreak",
                        eventId: event.event.id,
                        severity: event.event.severity,
                        position: { x: event.event.position.x, y: event.event.position.y },
                        affectedCitizens
                      },
                      tick,
                      event.trace
                    )
                  } else if (event._tag === "Fire") {
                    const affectedCitizens = event.event.affectedCitizenDetails.map((c) => ({
                      id: c.id,
                      firstName: c.firstName,
                      lastName: c.lastName,
                      age: c.age,
                      wasEmployed: c.wasEmployed,
                      hadHome: c.hadHome
                    }))
                    emitActivityEvent(
                      emitter,
                      {
                        _tag: "Fire",
                        eventId: event.event.id,
                        severity: event.event.severity,
                        position: { x: event.event.position.x, y: event.event.position.y },
                        affectedCitizens
                      },
                      tick,
                      event.trace
                    )
                  } else if (event._tag === "ChaosResolved") {
                    emitActivityEvent(
                      emitter,
                      {
                        _tag: "ChaosResolved",
                        eventId: event.eventId,
                        eventType: event.eventType
                      },
                      tick,
                      event.trace
                    )
                  }
                })
              )
            )
          )

          return yield* Effect.never
        })
      )
    }).pipe(
      Effect.provide(AppLayer),
      Effect.catchAll((error) => {
        console.error("SimulationRunner error:", error)
        return Effect.void
      })
    )

    Effect.runFork(program)
  }

  togglePause(): void {
    Effect.runPromise(
      Effect.gen(function* () {
        const sim = yield* SimulationService
        yield* sim.togglePause
      }).pipe(Effect.provide(AppLayer))
    )
  }

  setSpeed(speed: 1 | 2 | 3): void {
    Effect.runPromise(
      Effect.gen(function* () {
        const sim = yield* SimulationService
        yield* sim.setSpeed(speed)
      }).pipe(Effect.provide(AppLayer))
    )
  }

  requestMetricsHistory(count: number = 100): void {
    const emitter = this.eventEmitter
    console.log("requestMetricsHistory called, count:", count)

    if (!metricsServiceRef) {
      console.warn("MetricsService not initialized yet")
      return
    }

    Effect.runPromise(
      Effect.gen(function* () {
        console.log("Fetching metrics history...")
        const history = yield* metricsServiceRef!.getSerializedHistory(count)
        console.log("Got history:", history.snapshots.length, "snapshots,", history.metricNames.length, "metric names")

        emitter.emit({
          type: "server:message",
          data: {
            type: "metrics_history",
            snapshots: history.snapshots as MetricsSnapshot[],
            metricNames: history.metricNames as string[]
          }
        })
        console.log("Emitted metrics_history message")
      })
    ).catch(err => console.error("Error fetching metrics history:", err))
  }

  stop(): void {
    // The fiber will be interrupted when the page unloads
  }
}
