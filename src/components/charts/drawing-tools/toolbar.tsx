"use client"

import { cn } from "@/lib/utils"
import type { DrawingToolType } from "./types"

interface DrawingToolbarProps {
  activeTool: DrawingToolType
  onSelectTool: (tool: DrawingToolType) => void
  onClearAll: () => void
  onUndo: () => void
  canUndo: boolean
  drawingCount: number
}

interface ToolButton {
  id: DrawingToolType
  label: string
  icon: string
  shortcut?: string
}

const TOOL_GROUPS: ToolButton[][] = [
  [{ id: "cursor", label: "Cursor", icon: "↖", shortcut: "V" }],
  [
    { id: "trendline", label: "Trend Line", icon: "╲", shortcut: "T" },
    { id: "horizontal", label: "Horizontal Line", icon: "─", shortcut: "H" },
  ],
  [
    { id: "fibonacci", label: "Fib Retracement", icon: "⌇", shortcut: "F" },
  ],
  [
    { id: "longposition", label: "Long Position", icon: "▲", shortcut: "L" },
    { id: "shortposition", label: "Short Position", icon: "▼", shortcut: "S" },
  ],
  [
    { id: "rectangle", label: "Rectangle", icon: "▭", shortcut: "R" },
  ],
  [
    { id: "measure", label: "Measure", icon: "↔", shortcut: "M" },
  ],
]

export function DrawingToolbar({ activeTool, onSelectTool, onClearAll, onUndo, canUndo, drawingCount }: DrawingToolbarProps) {
  return (
    <div
      className="absolute left-0 top-0 bottom-0 z-30 flex flex-col items-center py-2 gap-0.5"
      style={{
        width: 36,
        background: "#1e222d",
        borderRight: "1px solid #2a2e39",
      }}
    >
      {TOOL_GROUPS.map((group, gi) => (
        <div key={gi}>
          {gi > 0 && (
            <div className="w-5 mx-auto my-1" style={{ height: 1, background: "#2a2e39" }} />
          )}
          {group.map((tool) => (
            <button
              key={tool.id}
              onClick={() => onSelectTool(tool.id)}
              title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ""}`}
              className={cn(
                "w-8 h-8 flex items-center justify-center rounded text-sm transition-colors cursor-pointer",
                activeTool === tool.id
                  ? "bg-[#2962ff] text-white"
                  : "text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]"
              )}
            >
              {tool.icon}
            </button>
          ))}
        </div>
      ))}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Undo */}
      {canUndo && (
        <button
          onClick={onUndo}
          title="Undo (Ctrl+Z)"
          className="w-8 h-8 flex items-center justify-center rounded text-sm text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39] transition-colors cursor-pointer"
        >
          ↩
        </button>
      )}

      {/* Clear all */}
      {drawingCount > 0 && (
        <button
          onClick={onClearAll}
          title={`Clear all drawings (${drawingCount})`}
          className="w-8 h-8 flex items-center justify-center rounded text-sm text-[#787b86] hover:text-[#ef5350] hover:bg-[#2a2e39] transition-colors cursor-pointer"
        >
          🗑
        </button>
      )}
    </div>
  )
}
