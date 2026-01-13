import React, { useState, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { StatsPanel } from "./StatsPanel.js"
import type { EventEmitter } from "../EventEmitter.js"
import type { SimulationRunner } from "../SimulationRunner.js"
import type { SerializedSimulationStats, ClockState, ServerMessage } from "../../shared/MessageProtocol.js"

interface OverlayProps {
  eventEmitter: EventEmitter
  simulation: SimulationRunner
}

const Overlay: React.FC<OverlayProps> = ({ eventEmitter, simulation }) => {
  const [stats, setStats] = useState<SerializedSimulationStats | null>(null)
  const [clock, setClock] = useState<ClockState | null>(null)

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

  return (
    <StatsPanel
      stats={stats}
      clock={clock}
      onTogglePause={handleTogglePause}
      onSetSpeed={handleSetSpeed}
    />
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
