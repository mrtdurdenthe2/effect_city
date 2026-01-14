"use client"

import { CaretUp } from "@phosphor-icons/react/dist/csr/CaretUp"
import { ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight"

interface ActivityItem {
  id: string
  type: "info" | "alert"
  title: string
  subtitle?: string
  expanded?: boolean
  timestamp?: string
  logs?: string[]
}

const activityItems: ActivityItem[] = [
  {
    id: "1",
    type: "info",
    title: "A new business has been incorporated!",
  },
  {
    id: "2",
    type: "alert",
    title: "Kai Wilson's car just crashed at 32 Effect Ave.",
    subtitle: "Paramedics are on their way to 32 Effect Ave",
    expanded: true,
    timestamp: "15:03",
    logs: [
      "[INFO] BLEH BLEH BLEH BLEH",
      "[INFO] BLEH BLEH BLEH BLEH",
      "[INFO] BLEH BLEH BLEH BLEH",
      "[INFO] BLEH BLEH BLEH BLEH",
    ],
  },
]

function InfoCard({ title }: { title: string }) {
  return (
    <div className="relative flex items-center bg-white border border-black/[0.09] rounded-md shadow-[0_2px_10px_rgba(0,0,0,0.01)] px-3 py-[7px]">
      {/* Blue left indicator */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-[19px] bg-[#15BDFF] rounded-r-sm" />
      <span className="text-[#161616] text-base pl-1">{title}</span>
    </div>
  )
}

function AlertCard({
  title,
  subtitle,
  timestamp,
  logs,
}: {
  title: string
  subtitle?: string | undefined
  timestamp?: string | undefined
  logs?: string[] | undefined
}) {
  return (
    <div className="space-y-2">
      {/* Context line with arrow icon */}
      <div className="flex items-center gap-2 text-[#686868] text-xs">
        <ArrowUpRight className="w-[13px] h-[13px]" />
        <span>{title}</span>
      </div>

      {/* Subtitle */}
      {subtitle && <p className="text-[#161616] text-base">{subtitle}</p>}

      {/* Expanded alert card */}
      <div className="relative bg-white border border-black/[0.09] rounded-md shadow-[0_2px_10px_rgba(0,0,0,0.01)] overflow-hidden">
        {/* Red diagonal stripe pattern header */}
        <div
          className="relative px-[11px] py-1 border-black"
          style={{
            background: `repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 8px,
              rgba(255, 0, 0, 0.07) 8px,
              rgba(255, 0, 0, 0.07) 16px
            ), linear-gradient(0deg, rgba(255, 0, 0, 0.07) 0%, rgba(255, 255, 255, 0.07) 68.57%)`,
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              {/* Red left indicator */}
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-[19px] bg-[#FF3636] rounded-r-sm" />
              <span className="text-[#560000] text-base pl-1">
                {"Kai Wilson's car just crashed at "}
                <span className="underline font-mono font-medium tracking-tighter">32 Effect Ave.</span>
              </span>
            </div>
            <CaretUp className="w-4 h-4 text-[#7D7D7D]" />
          </div>
        </div>

        {/* Content below stripes */}
        <div className="px-4 py-3">
          {/* Timestamp */}
          {timestamp && <p className="text-[#272727] text-[13px]">{timestamp}</p>}

          {/* Logs with fade effect */}
          {logs && logs.length > 0 && (
            <div className="relative mt-3">
              <div className="space-y-0.5">
                {logs.map((log, index) => (
                  <p key={index} className="text-[#686868] text-[13px]">
                    {log}
                  </p>
                ))}
              </div>
              {/* Fade gradient overlay */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.3) 20%, rgba(255, 255, 255, 0.7) 60%, rgba(255, 255, 255, 1) 100%)",
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ActivityPanel() {
  return (
    <div className="w-full h-full bg-white border-l border-black/[0.08]">
      {/* Header */}
      <div className="px-6 py-4">
        <h2 className="text-2xl font-medium tracking-tight text-black">Activity</h2>
      </div>

      {/* Content area with gray background */}
      <div className="bg-[#FAFAFA] border-t border-black/[0.08] p-6 space-y-4 py-0">
        {activityItems.map((item) =>
          item.type === "info" ? (
            <InfoCard key={item.id} title={item.title} />
          ) : (
            <AlertCard
              key={item.id}
              title={item.title}
              subtitle={item.subtitle}
              timestamp={item.timestamp}
              logs={item.logs}
            />
          ),
        )}
      </div>
    </div>
  )
}
