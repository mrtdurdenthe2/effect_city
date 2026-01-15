import { useEffect, useRef, useState, useCallback } from "react"
import { createRoot } from "react-dom/client"
import "./globals.css"
import { ResizableLayout } from "./components/resizable-layout"
import { ActivityPanel } from "./components/activity-panel"
import { Application } from "./Application.js"
import { StatsPanel } from "./ui/StatsPanel"
import { MetricsGraphPanel } from "./ui/MetricsGraphPanel"
import type { SerializedSimulationStats, ClockState, ServerMessage, MetricsSnapshot, ActivityItem } from "../shared/MessageProtocol.js"

// Max number of activity items to keep in the list
const MAX_ACTIVITY_ITEMS = 100

function ThreeCanvas({ onActivityEvent }: { onActivityEvent: (item: ActivityItem) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const appRef = useRef<Application | null>(null)
  const [stats, setStats] = useState<SerializedSimulationStats | null>(null)
  const [clock, setClock] = useState<ClockState | null>(null)
  const [showGraphs, setShowGraphs] = useState(false)
  const [metricsSnapshots, setMetricsSnapshots] = useState<MetricsSnapshot[]>([])
  const [metricNames, setMetricNames] = useState<string[]>([])
  const activityIdCounter = useRef(0)

  useEffect(() => {
    if (!canvasRef.current || appRef.current) return

    const app = Application.createWithCanvas(canvasRef.current)
    appRef.current = app

    // Subscribe to simulation updates
    const handleMessage = (event: { type: "server:message"; data: ServerMessage }) => {
      const message = event.data
      if (message.type === "initial_state") {
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
      } else if (message.type === "activity_event") {
        activityIdCounter.current++
        onActivityEvent({
          id: `activity-${activityIdCounter.current}`,
          event: message.event,
          meta: message.meta,
          tick: message.tick,
          timestamp: message.timestamp
        })
      }
    }

    const unsubscribe = app.eventEmitter.on("server:message", handleMessage)

    // Start the application
    app.start()
    console.log("Effect City visualization started")
    console.log("Connecting to server...")

    return () => {
      unsubscribe()
      app.dispose()
      appRef.current = null
    }
  }, [onActivityEvent])

  const handleTogglePause = () => {
    appRef.current?.simulation.togglePause()
  }

  const handleSetSpeed = (speed: 1 | 2 | 3) => {
    appRef.current?.simulation.setSpeed(speed)
  }

  const handleToggleGraphs = useCallback(() => {
    console.log("Toggle graphs clicked, showGraphs:", showGraphs)
    if (!showGraphs) {
      console.log("Requesting metrics history...")
      appRef.current?.simulation.requestMetricsHistory(200)
    }
    setShowGraphs(prev => !prev)
  }, [showGraphs])

  const handleCloseGraphs = useCallback(() => {
    setShowGraphs(false)
  }, [])

  return (
    <div className="relative w-full h-full bg-[#1a1a2e]">
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className="absolute top-0 left-0 pointer-events-none">
        <div className="pointer-events-auto">
          <StatsPanel
            stats={stats}
            clock={clock}
            onTogglePause={handleTogglePause}
            onSetSpeed={handleSetSpeed}
            onToggleGraphs={handleToggleGraphs}
          />
        </div>
      </div>
      {showGraphs && (
        <MetricsGraphPanel
          snapshots={metricsSnapshots}
          metricNames={metricNames}
          onClose={handleCloseGraphs}
        />
      )}
    </div>
  )
}

function App() {
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([])

  const handleActivityEvent = useCallback((item: ActivityItem) => {
    setActivityItems(prev => {
      const newItems = [item, ...prev]
      // Keep only the most recent items
      if (newItems.length > MAX_ACTIVITY_ITEMS) {
        return newItems.slice(0, MAX_ACTIVITY_ITEMS)
      }
      return newItems
    })
  }, [])

  return (
    <ResizableLayout
      leftPanel={<ThreeCanvas onActivityEvent={handleActivityEvent} />}
      rightPanel={<ActivityPanel items={activityItems} />}
      defaultLeftWidth={70}
      minLeftWidth={40}
      minRightWidth={20}
    />
  )
}

const rootElement = document.getElementById("root")
if (!rootElement) {
  throw new Error("Root element not found")
}

createRoot(rootElement).render(<App />)
