import React, { useState, useEffect, useCallback } from "react"
import { createRoot, type Root } from "react-dom/client"
import { StatsPanel } from "./StatsPanel.js"
import { MetricsGraphPanel } from "./MetricsGraphPanel.js"
import type { EventEmitter } from "../EventEmitter.js"
import type { SimulationRunner } from "../SimulationRunner.js"
import type { SerializedSimulationStats, ServerMessage, MetricsSnapshot } from "../../shared/MessageProtocol.js"

interface OverlayProps {
  eventEmitter: EventEmitter
  simulation: SimulationRunner
}

const Overlay: React.FC<OverlayProps> = ({ eventEmitter, simulation }) => {
  const [stats, setStats] = useState<SerializedSimulationStats | null>(null)
  const [showGraphs, setShowGraphs] = useState(false)
  const [metricsSnapshots, setMetricsSnapshots] = useState<MetricsSnapshot[]>([])
  const [metricNames, setMetricNames] = useState<string[]>([])

  useEffect(() => {
    console.log("OverlayUI subscribing to events...")

    const handleMessage = (event: { type: "server:message"; data: ServerMessage }) => {
      const message = event.data
      console.log("OverlayUI received message:", message.type)

      if (message.type === "initial_state") {
        console.log("Setting initial stats")
        setStats(message.stats)
      } else if (message.type === "simulation_tick") {
        setStats(message.stats)
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

  const handleCloseGraphs = useCallback(() => {
    setShowGraphs(false)
  }, [])

  return (
    <>
      <StatsPanel stats={stats} />
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
