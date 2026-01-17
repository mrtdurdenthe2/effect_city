"use client"

import { useState, useEffect, useRef } from "react"
import { Vector3 } from "three"
import type { Application } from "../Application.js"
import type { ActivityEvent } from "../../shared/MessageProtocol.js"

interface ChaosMarkerUI {
  eventId: string
  severity: "minor" | "moderate" | "major"
  position: { x: number; y: number }
  createdAt: number
}

interface ChaosOverlayProps {
  app: Application | null
}

// Chaos event types with positions
const CHAOS_EVENT_TYPES = ["CarCrash", "Fire", "PowerOutage", "WaterMainBreak", "CitizenAccident"] as const

export function ChaosOverlay({ app }: ChaosOverlayProps) {
  const [markers, setMarkers] = useState<Map<string, ChaosMarkerUI>>(new Map())
  const [screenPositions, setScreenPositions] = useState<Map<string, { x: number; y: number }>>(new Map())
  const containerRef = useRef<HTMLDivElement>(null)
  const animationFrameRef = useRef<number | null>(null)

  // Listen for chaos events
  useEffect(() => {
    if (!app) return

    const handleMessage = (event: { type: "server:message"; data: { type: string; event?: ActivityEvent } }) => {
      if (event.data.type !== "activity_event" || !event.data.event) return

      const activityEvent = event.data.event

      // Handle new chaos events
      if (CHAOS_EVENT_TYPES.includes(activityEvent._tag as typeof CHAOS_EVENT_TYPES[number])) {
        const chaosEvent = activityEvent as {
          _tag: string
          eventId: string
          severity: "minor" | "moderate" | "major"
          position: { x: number; y: number }
        }

        setMarkers(prev => {
          const next = new Map(prev)
          next.set(chaosEvent.eventId, {
            eventId: chaosEvent.eventId,
            severity: chaosEvent.severity,
            position: chaosEvent.position,
            createdAt: Date.now()
          })
          return next
        })
      }

      // Handle resolved events
      if (activityEvent._tag === "ChaosResolved") {
        const resolvedEvent = activityEvent as { eventId: string }
        setMarkers(prev => {
          const next = new Map(prev)
          next.delete(resolvedEvent.eventId)
          return next
        })
      }
    }

    const unsubscribe = app.eventEmitter.on("server:message", handleMessage)
    return () => unsubscribe()
  }, [app])

  // Update screen positions on animation frame
  useEffect(() => {
    if (!app || markers.size === 0) {
      setScreenPositions(new Map())
      return
    }

    const updatePositions = () => {
      if (!containerRef.current) return

      const camera = app.camera.instance
      const rect = containerRef.current.getBoundingClientRect()
      const newPositions = new Map<string, { x: number; y: number }>()

      for (const [id, marker] of markers) {
        // Create 3D position (elevated slightly above grid)
        const worldPos = new Vector3(
          marker.position.x + 0.5,
          1,
          marker.position.y + 0.5
        )

        // Project to screen space
        const screenPos = worldPos.clone().project(camera)

        // Convert to pixel coordinates
        const x = (screenPos.x * 0.5 + 0.5) * rect.width
        const y = (-screenPos.y * 0.5 + 0.5) * rect.height

        // Only show if in front of camera
        if (screenPos.z < 1) {
          newPositions.set(id, { x, y })
        }
      }

      setScreenPositions(newPositions)
      animationFrameRef.current = requestAnimationFrame(updatePositions)
    }

    animationFrameRef.current = requestAnimationFrame(updatePositions)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [app, markers])

  if (!app || markers.size === 0) return null

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none overflow-hidden"
    >
      {Array.from(markers.entries()).map(([id, marker]) => {
        const pos = screenPositions.get(id)
        if (!pos) return null

        const color = marker.severity === "major"
          ? "rgba(244, 67, 54, 0.8)"
          : marker.severity === "moderate"
            ? "rgba(255, 87, 34, 0.8)"
            : "rgba(255, 152, 0, 0.8)"

        const ringColor = marker.severity === "major"
          ? "rgba(244, 67, 54, 0.4)"
          : marker.severity === "moderate"
            ? "rgba(255, 87, 34, 0.4)"
            : "rgba(255, 152, 0, 0.4)"

        return (
          <div
            key={id}
            className="absolute"
            style={{
              left: pos.x,
              top: pos.y,
              transform: "translate(-50%, -50%)"
            }}
          >
            {/* Pulsing outer ring */}
            <div
              className="absolute rounded-full animate-ping"
              style={{
                width: 40,
                height: 40,
                left: -20,
                top: -20,
                backgroundColor: ringColor
              }}
            />
            {/* Inner dot */}
            <div
              className="absolute rounded-full animate-pulse"
              style={{
                width: 12,
                height: 12,
                left: -6,
                top: -6,
                backgroundColor: color,
                boxShadow: `0 0 10px ${color}`
              }}
            />
          </div>
        )
      })}
    </div>
  )
}
