"use client"

import { useState } from "react"
import type { ActivityItem, ActivityEvent } from "../../shared/MessageProtocol.js"

// ============================================================================
// EVENT RENDERERS - Add new event type renderers here
// Each renderer takes an ActivityEvent and returns the display config
// ============================================================================

interface EventDisplay {
  type: "info" | "alert" | "success" | "warning"
  icon: string
  title: string
  subtitle?: string
  color: string
}

// Map event types to their display configuration
// This is the main extension point - add new cases here for new event types
function getEventDisplay(event: ActivityEvent): EventDisplay {
  switch (event._tag) {
    // Business events
    case "BusinessCreated":
      return {
        type: "success",
        icon: "🏢",
        title: `${event.businessName} opened!`,
        subtitle: `New ${event.size} ${event.businessType} at (${event.position.x}, ${event.position.y})`,
        color: "#4caf50"
      }
    case "BusinessClosed":
      return {
        type: "warning",
        icon: "🚫",
        title: `${event.businessName} closed`,
        subtitle: "Business has shut down",
        color: "#ff9800"
      }

    // Economy events
    case "EnteredDebt":
      return {
        type: "alert",
        icon: "💸",
        title: "City entered debt!",
        subtitle: `Treasury balance: $${event.balance.toLocaleString()}`,
        color: "#f44336"
      }
    case "ExitedDebt":
      return {
        type: "success",
        icon: "💰",
        title: "City out of debt!",
        subtitle: `Treasury balance: $${event.balance.toLocaleString()}`,
        color: "#4caf50"
      }
    case "Bankrupt":
      return {
        type: "alert",
        icon: "💀",
        title: "CITY BANKRUPT!",
        subtitle: "The city has gone bankrupt",
        color: "#d32f2f"
      }

    // Population events
    case "CitizensArrived":
      return {
        type: "info",
        icon: "👋",
        title: `${event.count} citizen${event.count > 1 ? "s" : ""} moved in`,
        subtitle: `Population: ${event.totalPopulation}`,
        color: "#2196f3"
      }
    case "CitizensLeft":
      return {
        type: "warning",
        icon: "👎",
        title: `${event.count} citizen${event.count > 1 ? "s" : ""} left`,
        subtitle: `Reason: ${event.reason} | Population: ${event.totalPopulation}`,
        color: "#ff9800"
      }
  }
}

// Format timestamp for display
function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  })
}

// ============================================================================
// ACTIVITY CARD COMPONENT
// Renders individual activity items with appropriate styling based on type
// ============================================================================

function ActivityCard({ item }: { item: ActivityItem }) {
  const display = getEventDisplay(item.event)
  const time = formatTime(item.timestamp)
  const [isExpanded, setIsExpanded] = useState(false)

  // Get border color based on event type
  const getBorderColor = () => {
    switch (display.type) {
      case "alert":
        return "#f44336"
      case "success":
        return "#4caf50"
      case "warning":
        return "#ff9800"
      default:
        return "#2196f3"
    }
  }

  // Get background based on event type
  const getBackground = () => {
    switch (display.type) {
      case "alert":
        return `repeating-linear-gradient(
          -45deg,
          transparent,
          transparent 8px,
          rgba(255, 0, 0, 0.05) 8px,
          rgba(255, 0, 0, 0.05) 16px
        )`
      default:
        return "white"
    }
  }

  return (
    <div
      className="relative bg-white border border-black/[0.09] rounded-md shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden"
      style={{ background: getBackground() }}
    >
      {/* Left indicator */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-md"
        style={{ backgroundColor: getBorderColor() }}
      />

      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full text-left bg-transparent border-0"
        aria-expanded={isExpanded}
      >
        <div className="px-4 py-3 pl-5">
          {/* Header row */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-lg">{display.icon}</span>
              <span className="text-[#161616] font-medium text-sm">{display.title}</span>
            </div>
            <span className="text-[#888] text-xs font-mono">Tick {item.tick}</span>
          </div>

          {/* Subtitle */}
          {display.subtitle && (
            <p className="text-[#686868] text-xs pl-7">{display.subtitle}</p>
          )}

          {/* Timestamp */}
          <div className="flex items-center justify-between pl-7 mt-1">
            <p className="text-[#aaa] text-[10px]">{time}</p>
            <span className="text-[#999] text-[10px]">
              {isExpanded ? "Hide details" : "Show details"}
            </span>
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-3 pl-5 border-t border-black/[0.06] bg-[#fcfcfc]">
          <div className="pt-2 text-[11px] text-[#555]">
            <div className="uppercase tracking-wide text-[10px] text-[#888]">Services</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {item.meta.services.length === 0 ? (
                <span className="text-[#aaa]">None recorded</span>
              ) : (
                item.meta.services.map((service) => (
                  <span
                    key={service}
                    className="px-2 py-[2px] rounded-full bg-white border border-black/[0.08] text-[#444]"
                  >
                    {service}
                  </span>
                ))
              )}
            </div>

            <div className="mt-2 uppercase tracking-wide text-[10px] text-[#888]">Trace</div>
            <div className="mt-1 font-mono text-[11px] text-[#666] space-y-0.5">
              {item.meta.trace.length === 0 ? (
                <div className="text-[#aaa]">No trace available</div>
              ) : (
                item.meta.trace.map((line, index) => (
                  <div key={`${index}-${line}`}>{line}</div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN ACTIVITY PANEL COMPONENT
// ============================================================================

interface ActivityPanelProps {
  items: ActivityItem[]
}

export function ActivityPanel({ items }: ActivityPanelProps) {
  return (
    <div className="w-full h-full bg-white border-l border-black/[0.08] flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 flex-shrink-0">
        <h2 className="text-2xl font-medium tracking-tight text-black">Activity</h2>
        <p className="text-xs text-[#888] mt-1">
          {items.length === 0 ? "Waiting for events..." : `${items.length} events`}
        </p>
      </div>

      {/* Content area with gray background - scrollable */}
      <div className="bg-[#FAFAFA] border-t border-black/[0.08] flex-1 overflow-y-auto">
        <div className="p-4 space-y-3">
          {items.length === 0 ? (
            <div className="text-center py-8 text-[#888] text-sm">
              <p>No activity yet</p>
              <p className="text-xs mt-1">Events will appear here as the city evolves</p>
            </div>
          ) : (
            items.map((item) => (
              <ActivityCard key={item.id} item={item} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
