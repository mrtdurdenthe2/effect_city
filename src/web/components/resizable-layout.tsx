"use client"

import type React from "react"
import { useState, useRef, useCallback } from "react"

interface ResizableLayoutProps {
  leftPanel: React.ReactNode
  rightPanel: React.ReactNode
  defaultLeftWidth?: number
  minLeftWidth?: number
  minRightWidth?: number
}

export function ResizableLayout({
  leftPanel,
  rightPanel,
  defaultLeftWidth = 60,
  minLeftWidth = 20,
  minRightWidth = 20,
}: ResizableLayoutProps) {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const handleMouseDown = useCallback(() => {
    isDragging.current = true
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }, [])

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100

      if (newLeftWidth >= minLeftWidth && newLeftWidth <= 100 - minRightWidth) {
        setLeftWidth(newLeftWidth)
      }
    },
    [minLeftWidth, minRightWidth],
  )

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
  }, [])

  // Attach global mouse events
  const attachListeners = useCallback(() => {
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
  }, [handleMouseMove, handleMouseUp])

  const detachListeners = useCallback(() => {
    document.removeEventListener("mousemove", handleMouseMove)
    document.removeEventListener("mouseup", handleMouseUp)
  }, [handleMouseMove, handleMouseUp])

  const onDragStart = useCallback(() => {
    handleMouseDown()
    attachListeners()
    const cleanup = () => {
      detachListeners()
      document.removeEventListener("mouseup", cleanup)
    }
    document.addEventListener("mouseup", cleanup)
  }, [handleMouseDown, attachListeners, detachListeners])

  return (
    <div ref={containerRef} className="flex h-screen w-full">
      {/* Left Panel */}
      <div className="h-full overflow-auto" style={{ width: `${leftWidth}%` }}>
        {leftPanel}
      </div>

      {/* Resizer Handle */}
      <div
        className="w-1 bg-border hover:bg-primary/50 cursor-col-resize flex-shrink-0 transition-colors"
        onMouseDown={onDragStart}
      />

      {/* Right Panel */}
      <div className="h-full overflow-auto" style={{ width: `${100 - leftWidth}%` }}>
        {rightPanel}
      </div>
    </div>
  )
}
