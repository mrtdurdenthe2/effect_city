import { useEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import "./globals.css"
import { ResizableLayout } from "./components/resizable-layout"
import { ActivityPanel } from "./components/activity-panel"
import { Application } from "./Application.js"
import { StatsPanel } from "./ui/StatsPanel"
import type { SerializedSimulationStats, ClockState, ServerMessage } from "../shared/MessageProtocol.js"

function ThreeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const appRef = useRef<Application | null>(null)
  const [stats, setStats] = useState<SerializedSimulationStats | null>(null)
  const [clock, setClock] = useState<ClockState | null>(null)

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
  }, [])

  const handleTogglePause = () => {
    appRef.current?.simulation.togglePause()
  }

  const handleSetSpeed = (speed: 1 | 2 | 3) => {
    appRef.current?.simulation.setSpeed(speed)
  }

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
          />
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <ResizableLayout
      leftPanel={<ThreeCanvas />}
      rightPanel={<ActivityPanel />}
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
