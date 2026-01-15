import React, { useState, useEffect, useCallback } from "react"
import { createRoot, type Root } from "react-dom/client"
import { StatsPanel } from "./StatsPanel.js"
import { MetricsGraphPanel } from "./MetricsGraphPanel.js"
import type { EventEmitter } from "../EventEmitter.js"
import type { SimulationRunner } from "../SimulationRunner.js"
import type { SerializedSimulationStats, ClockState, ServerMessage, MetricsSnapshot } from "../../shared/MessageProtocol.js"

interface OverlayProps {
  eventEmitter: EventEmitter
  simulation: SimulationRunner
}

const Overlay: React.FC<OverlayProps> = ({ eventEmitter, simulation }) => {
  const [stats, setStats] = useState<SerializedSimulationStats | null>(null)
  const [clock, setClock] = useState<ClockState | null>(null)
  const [showGraphs, setShowGraphs] = useState(false)
  const [metricsSnapshots, setMetricsSnapshots] = useState<MetricsSnapshot[]>([])
  const [metricNames, setMetricNames] = useState<string[]>([])

  useEffect(() => {
    console.log("OverlayUI subscribing to events...")

    const handleMessage = (event: { type: "server:message"; data: ServerMessage }) => {
      const message = event.data
      console.log("OverlayUI received message:", message.type)

      if (message.type === "initial_state") {
        console.log("Setting initial stats and clock")
        setStats(message.stats)
        setClock(message.clock)
      } else if (message.type === "simulation_tick") {
        setStats(message.stats)
      } else if (message.type === "clock_state") {
        setClock(message.clock)
      } else if (message.type === "metrics_history") {
        console.log("Received metrics history:", message.snapshots.length, "snapshots")
        setMetricsSnapshots([...message.snapshots])
        setMetricNames([...message.metricNames])
      }
    }

    const unsubscribe = eventEmitter.on("server:message", handleMessage)
    console.log("OverlayUI subscribed")

    return () => {
      unsubscribe()
    }
  }, [eventEmitter])

  const handleTogglePause = () => {
    simulation.togglePause()
  }

  const handleSetSpeed = (speed: 1 | 2 | 3) => {
    simulation.setSpeed(speed)
  }

  const handleToggleGraphs = useCallback(() => {
    console.log("Toggle graphs clicked, showGraphs:", showGraphs)
    if (!showGraphs) {
      // Request metrics history when opening the panel
      console.log("Requesting metrics history...")
      simulation.requestMetricsHistory(200)
    }
    setShowGraphs(prev => !prev)
  }, [showGraphs, simulation])

  const handleCloseGraphs = useCallback(() => {
    setShowGraphs(false)
  }, [])

  return (
    <>
      <StatsPanel
        stats={stats}
        clock={clock}
        onTogglePause={handleTogglePause}
        onSetSpeed={handleSetSpeed}
        onToggleGraphs={handleToggleGraphs}
      />
      {showGraphs && (
        <MetricsGraphPanel
          snapshots={metricsSnapshots}
          metricNames={metricNames}
          onClose={handleCloseGraphs}
        />
      )}
    </>
  )
}

export class OverlayUI {
  private root: Root

  constructor(
    container: HTMLElement,
    eventEmitter: EventEmitter,
    simulation: SimulationRunner
  ) {
    this.root = createRoot(container)
    this.root.render(
      <Overlay eventEmitter={eventEmitter} simulation={simulation} />
    )
  }

  dispose(): void {
    this.root.unmount()
  }
}
