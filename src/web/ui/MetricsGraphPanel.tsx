import React, { useRef, useEffect, useState, useMemo } from "react"
import type { MetricsSnapshot } from "../../shared/MessageProtocol.js"

interface MetricsGraphPanelProps {
  snapshots: MetricsSnapshot[]
  metricNames: string[]
  onClose: () => void
}

interface GraphConfig {
  name: string
  label: string
  color: string
  format?: (value: number) => string
}

// Define which metrics to display and how
const METRIC_CONFIGS: GraphConfig[] = [
  { name: "population.total", label: "Population", color: "#4caf50" },
  { name: "population.employed", label: "Employed", color: "#2196f3" },
  { name: "population.unemployed", label: "Unemployed", color: "#ff9800" },
  { name: "population.homeless", label: "Homeless", color: "#f44336" },
  { name: "population.happiness.average", label: "Happiness", color: "#9c27b0", format: (v) => `${v.toFixed(1)}%` },
  { name: "economy.balance", label: "Treasury", color: "#4caf50", format: (v) => `$${v.toLocaleString()}` },
  { name: "economy.income", label: "Income", color: "#8bc34a", format: (v) => `+$${v.toLocaleString()}` },
  { name: "economy.expenses", label: "Expenses", color: "#ef5350", format: (v) => `-$${v.toLocaleString()}` },
  { name: "economy.debt_ticks", label: "Debt Ticks", color: "#ff5722" },
  { name: "population.citizens.added", label: "Citizens Arrived", color: "#00bcd4" },
  { name: "population.citizens.left", label: "Citizens Left", color: "#e91e63" }
]

const LineGraph: React.FC<{
  snapshots: MetricsSnapshot[]
  config: GraphConfig
  width: number
  height: number
}> = ({ snapshots, config, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Extract values for this metric from snapshots
  const values = useMemo(() => {
    return snapshots.map(snapshot => {
      const metric = snapshot.metrics.find(m => m.name === config.name)
      return metric?.value ?? 0
    })
  }, [snapshots, config.name])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || values.length === 0) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, width, height)

    // Calculate min/max for scaling
    const minVal = Math.min(...values)
    const maxVal = Math.max(...values)
    const range = maxVal - minVal || 1

    // Draw background grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * height
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }

    // Draw zero line if applicable
    if (minVal < 0 && maxVal > 0) {
      const zeroY = height - ((0 - minVal) / range) * height
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)"
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(0, zeroY)
      ctx.lineTo(width, zeroY)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Draw line
    ctx.strokeStyle = config.color
    ctx.lineWidth = 2
    ctx.beginPath()

    const padding = 4
    const graphWidth = width - padding * 2
    const graphHeight = height - padding * 2

    values.forEach((val, i) => {
      const x = padding + (i / Math.max(values.length - 1, 1)) * graphWidth
      const y = padding + graphHeight - ((val - minVal) / range) * graphHeight

      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })

    ctx.stroke()

    // Draw current value dot
    if (values.length > 0) {
      const lastVal = values[values.length - 1]
      const lastX = padding + graphWidth
      const lastY = padding + graphHeight - ((lastVal - minVal) / range) * graphHeight
      ctx.fillStyle = config.color
      ctx.beginPath()
      ctx.arc(lastX, lastY, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [values, config, width, height])

  const currentValue = values.length > 0 ? values[values.length - 1] : 0
  const formattedValue = config.format
    ? config.format(currentValue)
    : currentValue.toLocaleString()

  return (
    <div style={graphStyles.container}>
      <div style={graphStyles.header}>
        <span style={{ ...graphStyles.label, color: config.color }}>{config.label}</span>
        <span style={graphStyles.value}>{formattedValue}</span>
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={graphStyles.canvas}
      />
      {values.length === 0 && (
        <div style={graphStyles.noData}>No data</div>
      )}
    </div>
  )
}

export const MetricsGraphPanel: React.FC<MetricsGraphPanelProps> = ({
  snapshots,
  metricNames,
  onClose
}) => {
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(
    new Set(METRIC_CONFIGS.map(c => c.name))
  )

  // Filter configs to only show metrics that exist in the data
  const availableConfigs = useMemo(() => {
    const existingMetrics = new Set(metricNames)
    return METRIC_CONFIGS.filter(config => existingMetrics.has(config.name))
  }, [metricNames])

  // Additional metrics not in our predefined list
  const otherMetrics = useMemo(() => {
    const knownNames = new Set(METRIC_CONFIGS.map(c => c.name))
    return metricNames.filter(name => !knownNames.has(name))
  }, [metricNames])

  const toggleMetric = (name: string) => {
    setSelectedMetrics(prev => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.title}>Metrics History</span>
          <button style={styles.closeButton} onClick={onClose}>
            X
          </button>
        </div>
        <div style={styles.info}>
          Showing {snapshots.length} snapshots from Effect metrics
        </div>

        {/* Metric filters */}
        <div style={styles.filters}>
          {availableConfigs.map(config => (
            <button
              key={config.name}
              style={{
                ...styles.filterButton,
                backgroundColor: selectedMetrics.has(config.name) ? config.color : "#333",
                opacity: selectedMetrics.has(config.name) ? 1 : 0.5
              }}
              onClick={() => toggleMetric(config.name)}
            >
              {config.label}
            </button>
          ))}
        </div>

        {/* Graphs */}
        <div style={styles.graphGrid}>
          {availableConfigs
            .filter(config => selectedMetrics.has(config.name))
            .map((config) => (
              <LineGraph
                key={config.name}
                snapshots={snapshots}
                config={config}
                width={220}
                height={100}
              />
            ))}
        </div>

        {/* Other metrics discovered */}
        {otherMetrics.length > 0 && (
          <div style={styles.otherSection}>
            <div style={styles.sectionTitle}>Other Discovered Metrics</div>
            <div style={styles.otherMetrics}>
              {otherMetrics.map(name => (
                <span key={name} style={styles.otherMetric}>{name}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const graphStyles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: 6,
    padding: 8,
    display: "flex",
    flexDirection: "column",
    position: "relative"
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4
  },
  label: {
    fontSize: 11,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  value: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#fff",
    fontVariantNumeric: "tabular-nums"
  },
  canvas: {
    borderRadius: 4,
    backgroundColor: "rgba(0, 0, 0, 0.2)"
  },
  noData: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    color: "#666",
    fontSize: 11
  }
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000
  },
  panel: {
    backgroundColor: "rgba(26, 26, 46, 0.98)",
    borderRadius: 12,
    padding: 20,
    maxWidth: "95vw",
    maxHeight: "90vh",
    overflow: "auto",
    color: "#fff",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    minWidth: 700
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  title: {
    fontSize: 20,
    fontWeight: "bold"
  },
  closeButton: {
    background: "rgba(255,255,255,0.1)",
    border: "none",
    color: "#fff",
    fontSize: 14,
    cursor: "pointer",
    padding: "6px 12px",
    borderRadius: 4,
    lineHeight: 1
  },
  info: {
    fontSize: 12,
    color: "#888",
    marginBottom: 16
  },
  filters: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16
  },
  filterButton: {
    padding: "4px 10px",
    border: "none",
    borderRadius: 4,
    color: "#fff",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: "bold",
    textTransform: "uppercase",
    transition: "all 0.2s"
  },
  graphGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 12
  },
  otherSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTop: "1px solid rgba(255,255,255,0.1)"
  },
  sectionTitle: {
    fontSize: 12,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8
  },
  otherMetrics: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8
  },
  otherMetric: {
    padding: "4px 8px",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 4,
    fontSize: 11,
    color: "#aaa"
  }
}
