import React, { useEffect, useMemo, useRef } from "react"
import { Wallet } from "@phosphor-icons/react/dist/ssr/Wallet"
import { UsersThree } from "@phosphor-icons/react/dist/ssr/UsersThree"
import { SmileyMeh } from "@phosphor-icons/react/dist/ssr/SmileyMeh"
import { CaretUp } from "@phosphor-icons/react/dist/ssr/CaretUp"
import { CaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown"
import type { SerializedSimulationStats } from "../../shared/MessageProtocol.js"

interface StatsPanelProps {
  stats: SerializedSimulationStats | null
}

export const StatsPanel: React.FC<StatsPanelProps> = ({
  stats
}) => {
  const prevStats = useRef<SerializedSimulationStats | null>(null)

  const deltas = useMemo(() => {
    if (!stats) {
      return null
    }
    const prev = prevStats.current
    if (!prev) {
      return {
        treasury: 0,
        population: 0,
        happiness: 0
      }
    }
    return {
      treasury: stats.treasury.balance - prev.treasury.balance,
      population: stats.population.total - prev.population.total,
      happiness: stats.population.averageHappiness - prev.population.averageHappiness
    }
  }, [stats])

  useEffect(() => {
    if (stats) {
      prevStats.current = stats
    }
  }, [stats])

  if (!stats || !deltas) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Connecting...</div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.statGroup}>
        <StatColumn
          tone="green"
          icon={(color) => <Wallet size={21} weight="fill" color={color} />}
          value={formatCompactFixed(stats.treasury.balance)}
          delta={formatDelta(deltas.treasury)}
          deltaUp={deltas.treasury >= 0}
        />
        <StatColumn
          tone="green"
          icon={(color) => <UsersThree size={24} weight="fill" color={color} />}
          value={formatCompactFixed(stats.population.total)}
          delta={formatDelta(deltas.population)}
          deltaUp={deltas.population >= 0}
        />
        <StatColumn
          tone={getHappinessTone(stats.population.averageHappiness)}
          icon={(color) => <SmileyMeh size={24} weight="fill" color={color} />}
          value={`${Math.round(stats.population.averageHappiness)}%`}
          delta={formatDelta(deltas.happiness, true)}
          deltaUp={deltas.happiness >= 0}
        />
      </div>
      <div style={styles.demandGroup}>
        <DemandBar label="I" value={stats.zones.industrialDemand} color="#FDD123" />
        <DemandBar label="R" value={stats.zones.residentialDemand} color="#0ECC63" />
        <DemandBar label="C" value={stats.zones.commercialDemand} color="#15BDFF" />
      </div>
    </div>
  )
}

const getHappinessTone = (happiness: number): "green" | "yellow" | "red" => {
  if (happiness >= 70) return "green"
  if (happiness >= 40) return "yellow"
  return "red"
}

const toneColors = {
  green: { bg: "rgba(14, 204, 99, 0.22)", fg: "#057D3A" },
  yellow: { bg: "rgba(253, 209, 35, 0.13)", fg: "#FF6F00" },
  red: { bg: "rgba(255, 54, 54, 0.18)", fg: "#FF3636" }
} as const

const StatColumn: React.FC<{
  tone: "green" | "yellow" | "red"
  icon: (color: string) => React.ReactNode
  value: string
  delta: string
  deltaUp: boolean
}> = ({ tone, icon, value, delta, deltaUp }) => {
  const colors = deltaUp ? toneColors[tone] : toneColors.red
  return (
    <div style={styles.statColumn}>
      <div
        style={{
          ...styles.pill,
          background: colors.bg
        }}
      >
        <div style={styles.pillIcon}>{icon(colors.fg)}</div>
        <div style={{ ...styles.pillValue, color: colors.fg }}>{value}</div>
      </div>
      <div style={styles.deltaRow}>
        <CaretIcon up={deltaUp} color={deltaUp ? "#494949" : "#FF3636"} />
        <span style={{ ...styles.deltaText, color: deltaUp ? "#494949" : "#FF3636" }}>{delta}</span>
      </div>
    </div>
  )
}

const DemandBar: React.FC<{ label: string; value: number; color: string }> = ({
  label,
  value,
  color
}) => {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div style={styles.demandColumn}>
      <div style={styles.demandTrack}>
        <div style={{ ...styles.demandFill, height: `${clamped}%`, backgroundColor: color }} />
      </div>
      <div style={styles.demandLabel}>{label}</div>
    </div>
  )
}

const formatCompactFixed = (value: number): string => {
  const abs = Math.abs(value)
  const negative = value < 0

  const unit =
    abs >= 1_000_000_000 ? { divisor: 1_000_000_000, suffix: "B" }
      : abs >= 1_000_000 ? { divisor: 1_000_000, suffix: "M" }
        : abs >= 1_000 ? { divisor: 1_000, suffix: "K" }
          : null

  if (!unit) {
    const raw = `${Math.round(value)}`
    return raw.length > 4 ? raw.slice(0, 4) : raw
  }

  const num = abs / unit.divisor
  const maxDigits = 4 - (negative ? 1 : 0) - unit.suffix.length
  let formatted = (negative || num >= 10)
    ? Math.round(num).toString()
    : num.toFixed(1).replace(/\.0$/, "")

  if (formatted.length > maxDigits) {
    const cap = Math.max(1, Math.pow(10, maxDigits) - 1)
    formatted = Math.min(cap, Math.floor(num)).toString()
  }

  let result = `${formatted}${unit.suffix}`
  if (negative) {
    result = `-${result}`
  }

  return result.length > 4 ? result.slice(0, 4) : result
}

const formatDelta = (value: number, isPercent = false): string => {
  const formatted = formatCompactFixed(Math.abs(value))
  return isPercent ? `${formatted}%` : formatted
}

const CaretIcon: React.FC<{ up: boolean; color: string }> = ({ up, color }) => (
  up
    ? <CaretUp size={15} weight="fill" color={color} aria-hidden="true" />
    : <CaretDown size={15} weight="fill" color={color} aria-hidden="true" />
)

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 38,
    padding: 0,
    height: 46,
    width: 368,
    pointerEvents: "none"
  },
  loading: {
    fontSize: 12,
    fontFamily: "Inter, system-ui, sans-serif",
    color: "#666"
  },
  statGroup: {
    display: "flex",
    alignItems: "flex-start",
    gap: 20
  },
  statColumn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    gap: 3
  },
  pill: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "2px 10px 2px 4px",
    borderRadius: 34,
    width: 86,
    height: 28
  },
  pillIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  pillValue: {
    flex: 1,
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: 18,
    lineHeight: "22px",
    color: "#000",
    fontWeight: 400,
    textAlign: "right"
  },
  deltaRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    height: 15
  },
  deltaText: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 11,
    lineHeight: "14px",
    color: "#494949"
  },
  demandGroup: {
    display: "flex",
    alignItems: "flex-start",
    gap: 4,
    paddingLeft: 8
  },
  demandColumn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4
  },
  demandTrack: {
    width: 13,
    height: 28,
    background: "#EDEDED",
    borderRadius: 2,
    position: "relative",
    overflow: "hidden"
  },
  demandFill: {
    position: "absolute",
    left: 0,
    bottom: 0,
    width: "100%"
  },
  demandLabel: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 10,
    lineHeight: "13px",
    color: "#000"
  }
}
