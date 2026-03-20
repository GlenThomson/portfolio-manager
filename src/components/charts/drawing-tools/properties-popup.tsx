"use client"

import { useEffect, useRef } from "react"
import type { Drawing, PositionDrawing } from "./types"
import { COLOR_PALETTE, LINE_WIDTHS } from "./types"

interface PropertiesPopupProps {
  drawing: Drawing
  /** Screen position to anchor the popup near */
  anchorX: number
  anchorY: number
  containerWidth: number
  onUpdate: (id: string, partial: Partial<Drawing>) => void
  onRemove: (id: string) => void
  onDuplicate: (id: string) => void
  onClose: () => void
}

export function PropertiesPopup({
  drawing,
  anchorX,
  anchorY,
  containerWidth,
  onUpdate,
  onRemove,
  onDuplicate,
  onClose,
}: PropertiesPopupProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay to avoid catching the triggering click
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick)
    }, 50)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("mousedown", handleClick)
    }
  }, [onClose])

  // Position: keep popup within container
  const popupWidth = 200
  const left = Math.min(Math.max(anchorX - popupWidth / 2, 8), containerWidth - popupWidth - 8)
  const top = Math.max(anchorY + 16, 8)

  const hasColor = "color" in drawing
  const hasLineWidth = "lineWidth" in drawing
  const hasLineStyle = drawing.type === "horizontal"
  const hasExtend = drawing.type === "trendline"
  const isPosition = drawing.type === "longposition" || drawing.type === "shortposition"

  return (
    <div
      ref={ref}
      className="absolute z-50 rounded-lg shadow-xl py-2 min-w-[200px]"
      style={{
        left,
        top,
        background: "#1e222d",
        border: "1px solid #2a2e39",
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 pb-1.5 mb-1" style={{ borderBottom: "1px solid #2a2e39" }}>
        <span className="text-[11px] font-medium" style={{ color: "#d1d4dc" }}>
          {drawing.type === "trendline" && "Trend Line"}
          {drawing.type === "horizontal" && "Horizontal Line"}
          {drawing.type === "fibonacci" && "Fib Retracement"}
          {drawing.type === "longposition" && "Long Position"}
          {drawing.type === "shortposition" && "Short Position"}
          {drawing.type === "rectangle" && "Rectangle"}
          {drawing.type === "measure" && "Measure"}
        </span>
        <button
          onClick={onClose}
          className="text-[#787b86] hover:text-[#d1d4dc] text-xs cursor-pointer"
        >
          ✕
        </button>
      </div>

      {/* Color palette */}
      {hasColor && (
        <div className="px-3 py-1.5">
          <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: "#787b86" }}>Color</div>
          <div className="flex flex-wrap gap-1">
            {COLOR_PALETTE.map((color) => (
              <button
                key={color}
                onClick={() => onUpdate(drawing.id, { color } as Partial<Drawing>)}
                className="w-5 h-5 rounded-sm cursor-pointer transition-transform hover:scale-110"
                style={{
                  background: color,
                  border: (drawing as { color?: string }).color === color
                    ? "2px solid #fff"
                    : "1px solid #2a2e39",
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Line width */}
      {hasLineWidth && (
        <div className="px-3 py-1.5">
          <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: "#787b86" }}>Width</div>
          <div className="flex gap-1">
            {LINE_WIDTHS.map((w) => (
              <button
                key={w}
                onClick={() => onUpdate(drawing.id, { lineWidth: w } as Partial<Drawing>)}
                className="flex items-center justify-center w-8 h-6 rounded text-[10px] cursor-pointer transition-colors"
                style={{
                  background: (drawing as { lineWidth?: number }).lineWidth === w ? "#2962ff" : "#2a2e39",
                  color: (drawing as { lineWidth?: number }).lineWidth === w ? "#fff" : "#787b86",
                }}
              >
                {w}px
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Line style (horizontal only) */}
      {hasLineStyle && (
        <div className="px-3 py-1.5">
          <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: "#787b86" }}>Style</div>
          <div className="flex gap-1">
            {(["solid", "dashed", "dotted"] as const).map((style) => (
              <button
                key={style}
                onClick={() => onUpdate(drawing.id, { lineStyle: style } as Partial<Drawing>)}
                className="px-2 py-1 rounded text-[10px] cursor-pointer transition-colors capitalize"
                style={{
                  background: (drawing as { lineStyle?: string }).lineStyle === style ? "#2962ff" : "#2a2e39",
                  color: (drawing as { lineStyle?: string }).lineStyle === style ? "#fff" : "#787b86",
                }}
              >
                {style}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Extend right toggle (trendline only) */}
      {hasExtend && (
        <div className="px-3 py-1.5">
          <button
            onClick={() => onUpdate(drawing.id, { extendRight: !(drawing as { extendRight: boolean }).extendRight } as Partial<Drawing>)}
            className="flex items-center gap-2 text-[11px] cursor-pointer"
            style={{ color: "#d1d4dc" }}
          >
            <span
              className="w-3.5 h-3.5 rounded-sm border flex items-center justify-center text-[8px]"
              style={{
                background: (drawing as { extendRight: boolean }).extendRight ? "#2962ff" : "transparent",
                borderColor: (drawing as { extendRight: boolean }).extendRight ? "#2962ff" : "#555",
              }}
            >
              {(drawing as { extendRight: boolean }).extendRight && "✓"}
            </span>
            Extend right
          </button>
        </div>
      )}

      {/* Position info (read-only summary) */}
      {isPosition && (
        <div className="px-3 py-1.5">
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "#787b86" }}>
            Drag TP/SL lines to adjust
          </div>
          <div className="text-[10px] space-y-0.5" style={{ color: "#d1d4dc", fontFamily: "monospace" }}>
            <div>Entry: ${(drawing as PositionDrawing).entry.price.toFixed(2)}</div>
            <div style={{ color: "#26a69a" }}>TP: ${(drawing as PositionDrawing).takeProfit.toFixed(2)}</div>
            <div style={{ color: "#ef5350" }}>SL: ${(drawing as PositionDrawing).stopLoss.toFixed(2)}</div>
          </div>
        </div>
      )}

      {/* Lock toggle */}
      <div className="px-3 py-1.5">
        <button
          onClick={() => onUpdate(drawing.id, { locked: !drawing.locked } as Partial<Drawing>)}
          className="flex items-center gap-2 text-[11px] cursor-pointer"
          style={{ color: "#d1d4dc" }}
        >
          <span
            className="w-3.5 h-3.5 rounded-sm border flex items-center justify-center text-[8px]"
            style={{
              background: drawing.locked ? "#2962ff" : "transparent",
              borderColor: drawing.locked ? "#2962ff" : "#555",
            }}
          >
            {drawing.locked && "✓"}
          </span>
          Lock drawing
        </button>
      </div>

      {/* Visibility toggle */}
      <div className="px-3 py-1">
        <button
          onClick={() => onUpdate(drawing.id, { visible: !drawing.visible } as Partial<Drawing>)}
          className="flex items-center gap-2 text-[11px] cursor-pointer"
          style={{ color: "#d1d4dc" }}
        >
          <span
            className="w-3.5 h-3.5 rounded-sm border flex items-center justify-center text-[8px]"
            style={{
              background: drawing.visible ? "#2962ff" : "transparent",
              borderColor: drawing.visible ? "#2962ff" : "#555",
            }}
          >
            {drawing.visible && "✓"}
          </span>
          Visible
        </button>
      </div>

      {/* Divider */}
      <div className="my-1" style={{ height: 1, background: "#2a2e39" }} />

      {/* Actions */}
      <button
        onClick={() => onDuplicate(drawing.id)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] hover:bg-[#2a2e39] transition-colors text-left cursor-pointer"
        style={{ color: "#d1d4dc" }}
      >
        Duplicate
      </button>
      <button
        onClick={() => { onRemove(drawing.id); onClose() }}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] hover:bg-[#2a2e39] transition-colors text-left cursor-pointer"
        style={{ color: "#ef5350" }}
      >
        Delete
      </button>
    </div>
  )
}