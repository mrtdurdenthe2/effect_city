"use client"

import { useState } from "react"
import { Option } from "effect"
import { CaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown"
import type { ActivityItem, ActivityEvent, AffectedCitizenInfo } from "../../shared/MessageProtocol.js"

// Helper to format road type for display
function formatRoadType(roadType: Option.Option<"street" | "avenue" | "highway">): string {
  return Option.match(roadType, {
    onNone: () => "road",
    onSome: (type) => type
  })
}

// Helper to summarize affected citizens
function summarizeCitizens(citizens: readonly AffectedCitizenInfo[]): string {
  if (citizens.length === 0) return "No one affected"
  if (citizens.length === 1) {
    const c = citizens[0]
    return `${c.firstName} ${c.lastName} (age ${c.age})`
  }
  if (citizens.length <= 3) {
    return citizens.map((c) => `${c.firstName} ${c.lastName.charAt(0)}.`).join(", ")
  }
  const employed = citizens.filter((c) => c.wasEmployed).length
  const avgAge = Math.round(citizens.reduce((sum, c) => sum + c.age, 0) / citizens.length)
  return `${citizens.length} citizens (avg age ${avgAge}, ${employed} employed)`
}

// ============================================================================
// EVENT RENDERERS - Add new event type renderers here
// Each renderer takes an ActivityEvent and returns the display config
// ============================================================================

interface EventDisplay {
  type: "info" | "alert" | "success" | "warning"
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
        title: `${event.businessName} opened!`,
        subtitle: `New ${event.size} ${event.businessType} at (${event.position.x}, ${event.position.y})`,
        color: "#4caf50"
      }
    case "BusinessClosed":
      return {
        type: "warning",
        title: `${event.businessName} closed`,
        subtitle: "Business has shut down",
        color: "#ff9800"
      }

    // Economy events
    case "EnteredDebt":
      return {
        type: "alert",
        title: "City entered debt!",
        subtitle: `Treasury balance: $${event.balance.toLocaleString()}`,
        color: "#f44336"
      }
    case "ExitedDebt":
      return {
        type: "success",
        title: "City out of debt!",
        subtitle: `Treasury balance: $${event.balance.toLocaleString()}`,
        color: "#4caf50"
      }
    case "Bankrupt":
      return {
        type: "alert",
        title: "CITY BANKRUPT!",
        subtitle: "The city has gone bankrupt",
        color: "#d32f2f"
      }

    // Population events
    case "CitizensArrived":
      return {
        type: "info",
        title: `${event.count} citizen${event.count > 1 ? "s" : ""} moved in`,
        subtitle: `Population: ${event.totalPopulation}`,
        color: "#2196f3"
      }
    case "CitizensLeft":
      return {
        type: "warning",
        title: `${event.count} citizen${event.count > 1 ? "s" : ""} left`,
        subtitle: `Reason: ${event.reason} | Population: ${event.totalPopulation}`,
        color: "#ff9800"
      }

    // Chaos events
    case "CarCrash":
      return {
        type: event.severity === "major" ? "alert" : "warning",
        title: `Car crash on ${formatRoadType(event.roadType)}! (${event.severity})`,
        subtitle: `${summarizeCitizens(event.affectedCitizens)} at (${event.position.x}, ${event.position.y})`,
        color: event.severity === "major" ? "#d32f2f" : "#ff9800"
      }
    case "CitizenAccident":
      return {
        type: event.severity === "major" ? "alert" : "warning",
        title: `Citizen accident (${event.severity})`,
        subtitle: `${summarizeCitizens(event.affectedCitizens)} at (${event.position.x}, ${event.position.y})`,
        color: event.severity === "major" ? "#d32f2f" : "#ff9800"
      }
    case "CitizenIllness":
      return {
        type: event.severity === "major" ? "alert" : "info",
        title: `Illness outbreak (${event.severity})`,
        subtitle: summarizeCitizens(event.affectedCitizens),
        color: event.severity === "major" ? "#d32f2f" : "#2196f3"
      }
    case "PowerOutage":
      return {
        type: event.severity === "major" ? "alert" : "warning",
        title: `Power outage! (${event.severity})`,
        subtitle: `${summarizeCitizens(event.affectedCitizens)} at (${event.position.x}, ${event.position.y})`,
        color: event.severity === "major" ? "#d32f2f" : "#ff9800"
      }
    case "WaterMainBreak":
      return {
        type: event.severity === "major" ? "alert" : "warning",
        title: `Water main break! (${event.severity})`,
        subtitle: `${summarizeCitizens(event.affectedCitizens)} at (${event.position.x}, ${event.position.y})`,
        color: event.severity === "major" ? "#d32f2f" : "#ff9800"
      }
    case "Fire":
      return {
        type: event.severity === "major" ? "alert" : "warning",
        title: `Fire! (${event.severity})`,
        subtitle: `${summarizeCitizens(event.affectedCitizens)} at (${event.position.x}, ${event.position.y})`,
        color: event.severity === "major" ? "#d32f2f" : "#ff9800"
      }
    case "ChaosResolved":
      return {
        type: "success",
        title: `${event.eventType.replace(/_/g, " ")} resolved`,
        subtitle: "Emergency services handled the situation",
        color: "#4caf50"
      }
  }
}

// ============================================================================
// ACTIVITY CARD COMPONENT
// Renders individual activity items with appropriate styling based on type
// ============================================================================

function ActivityCard({ item }: { item: ActivityItem }) {
  const display = getEventDisplay(item.event)
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
      className="relative bg-white border border-black/[0.09] rounded-[6px] shadow-[0_2px_10px_rgba(0,0,0,0.01)] overflow-hidden"
      style={{ background: getBackground() }}
    >
      <div
        className="absolute left-0 top-[20%] bottom-[20%] w-[2px] rounded-r-[2px]"
        style={{ backgroundColor: getBorderColor() }}
      />
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full text-left bg-transparent border-0"
        aria-expanded={isExpanded}
      >
        <div className="px-4 py-2.5 pl-5">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[#161616] font-normal text-[16px] leading-[19px]">
                {display.title}
              </span>
            </div>
            <CaretDown
              size={16}
              weight="thin"
              className={`text-[#111] transition-transform ${isExpanded ? "rotate-180" : "rotate-0"}`}
              aria-hidden="true"
            />
          </div>
        </div>
      </button>


      {isExpanded && (
        <div className="px-4 pb-3 pl-5 border-t border-black/[0.06] bg-[#fcfcfc]">
          <div className="pt-2 text-[11px] text-[#555]">
            {/* Affected Citizens - only for chaos events */}
            {"affectedCitizens" in item.event && Array.isArray(item.event.affectedCitizens) && item.event.affectedCitizens.length > 0 && (
              <>
                <div className="uppercase tracking-wide text-[10px] text-[#888]">Affected Citizens</div>
                <div className="mt-1 space-y-1">
                  {item.event.affectedCitizens.map((citizen: AffectedCitizenInfo) => (
                    <div
                      key={citizen.id}
                      className="flex items-center gap-2 px-2 py-1 rounded bg-white border border-black/[0.08]"
                    >
                      <span className="font-medium text-[#333]">{citizen.firstName} {citizen.lastName}</span>
                      <span className="text-[#666]">Age {citizen.age}</span>
                      <span className={citizen.wasEmployed ? "text-green-600" : "text-orange-500"}>
                        {citizen.wasEmployed ? "Employed" : "Unemployed"}
                      </span>
                      <span className={citizen.hadHome ? "text-blue-600" : "text-red-500"}>
                        {citizen.hadHome ? "Housed" : "Homeless"}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-2" />
              </>
            )}

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
    <div className="relative w-full h-full bg-white border border-black/[0.08] rounded-lg flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-3 flex-shrink-0 bg-white border-b border-black/[0.09]">
        <h2 className="text-2xl font-medium tracking-tight text-black">Activity</h2>
        <p className="text-xs text-[#888] mt-1">
          {items.length === 0 ? "Waiting for events..." : `${items.length} events`}
        </p>
      </div>

      {/* Content area with gray background - scrollable */}
      <div className="bg-[#FAFAFA] border-t border-black/[0.08] flex-1 overflow-y-auto">
        <div className="px-[11px] pt-6 pb-10 space-y-3">
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
