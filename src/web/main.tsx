import { useEffect, useRef, useState, useCallback } from "react"
import { createRoot } from "react-dom/client"
import "./globals.css"
import { ResizableLayout } from "./components/resizable-layout"
import { ActivityPanel } from "./components/activity-panel"
import { ChaosOverlay } from "./components/chaos-overlay"
import { Application } from "./Application.js"
import { StatsPanel } from "./ui/StatsPanel"
import { MetricsGraphPanel } from "./ui/MetricsGraphPanel"
import type { SerializedSimulationStats, ServerMessage, MetricsSnapshot, ActivityItem } from "../shared/MessageProtocol.js"

// Max number of activity items to keep in the list
const MAX_ACTIVITY_ITEMS = 100

function ThreeCanvas({ onActivityEvent }: { onActivityEvent: (item: ActivityItem) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const appRef = useRef<Application | null>(null)
  const [app, setApp] = useState<Application | null>(null)
  const [stats, setStats] = useState<SerializedSimulationStats | null>(null)
  const [showGraphs, setShowGraphs] = useState(false)
  const [metricsSnapshots, setMetricsSnapshots] = useState<MetricsSnapshot[]>([])
  const [metricNames, setMetricNames] = useState<string[]>([])
  const activityIdCounter = useRef(0)

  useEffect(() => {
    if (!canvasRef.current || appRef.current) return

    const newApp = Application.createWithCanvas(canvasRef.current)
    appRef.current = newApp
    setApp(newApp)

    // Subscribe to simulation updates
    const handleMessage = (event: { type: "server:message"; data: ServerMessage }) => {
      const message = event.data
      if (message.type === "initial_state") {
        setStats(message.stats)
      } else if (message.type === "simulation_tick") {
        setStats(message.stats)
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

    const unsubscribe = newApp.eventEmitter.on("server:message", handleMessage)

    // Start the application
    newApp.start()
    console.log("Effect City visualization started")
    console.log("Connecting to server...")

    return () => {
      unsubscribe()
      newApp.dispose()
      appRef.current = null
      setApp(null)
    }
  }, [onActivityEvent])

  const handleCloseGraphs = useCallback(() => {
    setShowGraphs(false)
  }, [])

  return (
    <div className="relative w-full h-full bg-white">
      <canvas ref={canvasRef} className="w-full h-full" />
      <ChaosOverlay app={app} />
      <div className="absolute top-0 left-0 right-0 pointer-events-none">
        <div className="bg-white border-b border-black/[0.08] px-4 py-2 flex justify-end">
          <StatsPanel stats={stats} />
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
