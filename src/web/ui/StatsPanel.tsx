import React from "react"
import type { SerializedSimulationStats, ClockState } from "../../shared/MessageProtocol.js"

interface StatsPanelProps {
  stats: SerializedSimulationStats | null
  clock: ClockState | null
  onTogglePause: () => void
  onSetSpeed: (speed: 1 | 2 | 3) => void
  onToggleGraphs: () => void
}

export const StatsPanel: React.FC<StatsPanelProps> = ({
  stats,
  clock,
  onTogglePause,
  onSetSpeed,
  onToggleGraphs
}) => {
  if (!stats || !clock) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Connecting...</div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      {/* Title */}
      <div style={styles.title}>Effect City</div>

      {/* Clock Controls */}
      <div style={styles.section}>
        <div style={styles.row}>
          <button
            style={styles.button}
            onClick={onTogglePause}
          >
            {clock.isPaused ? "▶ Play" : "⏸ Pause"}
          </button>
          <div style={styles.speedButtons}>
            {([1, 2, 3] as const).map((speed) => (
              <button
                key={speed}
                style={{
                  ...styles.speedButton,
                  ...(clock.speed === speed ? styles.speedButtonActive : {})
                }}
                onClick={() => onSetSpeed(speed)}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
        <div style={styles.label}>Tick: {clock.tickCount}</div>
      </div>

      {/* Population */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Population</div>
        <div style={styles.stat}>
          <span>Total</span>
          <span style={styles.value}>{stats.population.total}</span>
        </div>
        <div style={styles.stat}>
          <span>Employed</span>
          <span style={styles.value}>{stats.population.employed}</span>
        </div>
        <div style={styles.stat}>
          <span>Happiness</span>
          <span style={styles.value}>{stats.population.averageHappiness.toFixed(0)}%</span>
        </div>
        <div style={styles.progressBar}>
          <div
            style={{
              ...styles.progressFill,
              width: `${stats.population.averageHappiness}%`,
              backgroundColor: getHappinessColor(stats.population.averageHappiness)
            }}
          />
        </div>
      </div>

      {/* Treasury */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Treasury</div>
        <div style={styles.stat}>
          <span>Balance</span>
          <span style={{
            ...styles.value,
            color: stats.treasury.balance < 0 ? "#ef5350" : "#4caf50"
          }}>
            ${stats.treasury.balance.toLocaleString()}
          </span>
        </div>
        <div style={styles.stat}>
          <span>Income</span>
          <span style={{ ...styles.value, color: "#4caf50" }}>
            +${stats.treasury.lastIncome.toLocaleString()}
          </span>
        </div>
        <div style={styles.stat}>
          <span>Expenses</span>
          <span style={{ ...styles.value, color: "#ef5350" }}>
            -${stats.treasury.lastExpenses.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Zone Demand */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Demand</div>
        <DemandBar label="R" value={stats.zones.residentialDemand} color="#4caf50" />
        <DemandBar label="C" value={stats.zones.commercialDemand} color="#2196f3" />
        <DemandBar label="I" value={stats.zones.industrialDemand} color="#ffc107" />
      </div>

      {/* Grid Stats */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Grid</div>
        <div style={styles.stat}>
          <span>Roads</span>
          <span style={styles.value}>{stats.grid.roadCells}</span>
        </div>
        <div style={styles.stat}>
          <span>Buildings</span>
          <span style={styles.value}>{stats.grid.buildingCells}</span>
        </div>
      </div>

      {/* Metrics Graph Button */}
      <button
        style={styles.graphButton}
        onClick={() => {
          console.log("Button clicked!")
          onToggleGraphs()
        }}
      >
        View Metrics Graphs
      </button>
    </div>
  )
}

const DemandBar: React.FC<{ label: string; value: number; color: string }> = ({
  label,
  value,
  color
}) => (
  <div style={styles.demandRow}>
    <span style={{ ...styles.demandLabel, color }}>{label}</span>
    <div style={styles.demandBar}>
      <div
        style={{
          ...styles.demandFill,
          width: `${value}%`,
          backgroundColor: color
        }}
      />
    </div>
    <span style={styles.demandValue}>{value.toFixed(0)}</span>
  </div>
)

const getHappinessColor = (happiness: number): string => {
  if (happiness >= 70) return "#4caf50"
  if (happiness >= 40) return "#ffc107"
  return "#ef5350"
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "fixed",
    top: 16,
    left: 16,
    width: 220,
    padding: 16,
    backgroundColor: "rgba(26, 26, 46, 0.9)",
    borderRadius: 8,
    color: "#fff",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: 13
  },
  loading: {
    textAlign: "center",
    color: "#888"
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
    color: "#fff"
  },
  section: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottom: "1px solid rgba(255,255,255,0.1)"
  },
  sectionTitle: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#888",
    marginBottom: 8
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  button: {
    padding: "6px 12px",
    backgroundColor: "#333",
    border: "none",
    borderRadius: 4,
    color: "#fff",
    cursor: "pointer",
    fontSize: 12
  },
  speedButtons: {
    display: "flex",
    gap: 4
  },
  speedButton: {
    padding: "4px 8px",
    backgroundColor: "#333",
    border: "none",
    borderRadius: 4,
    color: "#888",
    cursor: "pointer",
    fontSize: 11
  },
  speedButtonActive: {
    backgroundColor: "#4caf50",
    color: "#fff"
  },
  label: {
    fontSize: 11,
    color: "#888"
  },
  stat: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 4
  },
  value: {
    fontWeight: "bold",
    fontVariantNumeric: "tabular-nums"
  },
  progressBar: {
    height: 4,
    backgroundColor: "#333",
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 4
  },
  progressFill: {
    height: "100%",
    transition: "width 0.3s ease"
  },
  demandRow: {
    display: "flex",
    alignItems: "center",
    marginBottom: 4
  },
  demandLabel: {
    width: 16,
    fontWeight: "bold"
  },
  demandBar: {
    flex: 1,
    height: 8,
    backgroundColor: "#333",
    borderRadius: 2,
    overflow: "hidden",
    marginLeft: 8,
    marginRight: 8
  },
  demandFill: {
    height: "100%",
    transition: "width 0.3s ease"
  },
  demandValue: {
    width: 24,
    textAlign: "right",
    fontSize: 11,
    color: "#888"
  },
  graphButton: {
    width: "100%",
    padding: "10px 12px",
    backgroundColor: "#2196f3",
    border: "none",
    borderRadius: 6,
    color: "#fff",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: "bold",
    marginTop: 4,
    transition: "background-color 0.2s"
  }
}
