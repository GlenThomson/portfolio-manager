"use client"

import { useState, useCallback, useRef } from "react"
import type {
  Drawing,
  DrawingToolType,
  DrawingPoint,
  DragState,
  DragHandle,
  TrendlineDrawing,
  HorizontalDrawing,
  FibonacciDrawing,
  PositionDrawing,
  RectangleDrawing,
  MeasureDrawing,
} from "./types"
import { FIB_LEVELS, DEFAULT_COLORS } from "./types"

// ── localStorage helpers ────────────────────────────────

function storageKey(symbol: string) {
  return `chart-drawings-${symbol}`
}

function loadDrawings(symbol: string): Drawing[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(storageKey(symbol))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveDrawings(symbol: string, drawings: Drawing[]) {
  if (typeof window === "undefined") return
  const persistent = drawings.filter((d) => d.type !== "measure")
  localStorage.setItem(storageKey(symbol), JSON.stringify(persistent))
}

let idCounter = 0
function nextId() {
  return `drawing-${Date.now()}-${++idCounter}`
}

const MAX_UNDO = 30

// ── Hook ────────────────────────────────────────────────

export function useDrawings(symbol: string) {
  const [drawings, setDrawings] = useState<Drawing[]>(() => loadDrawings(symbol))
  const [activeTool, setActiveTool] = useState<DrawingToolType>("cursor")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingPoints, setPendingPoints] = useState<DrawingPoint[]>([])
  const [hoverPoint, setHoverPoint] = useState<DrawingPoint | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)

  const undoStackRef = useRef<Drawing[][]>([])

  const symbolRef = useRef(symbol)
  if (symbolRef.current !== symbol) {
    symbolRef.current = symbol
    setDrawings(loadDrawings(symbol))
    setPendingPoints([])
    setHoverPoint(null)
    setSelectedId(null)
    setDragState(null)
    undoStackRef.current = []
  }

  const updateDrawingsWithUndo = useCallback(
    (updater: (prev: Drawing[]) => Drawing[]) => {
      setDrawings((prev) => {
        undoStackRef.current = [...undoStackRef.current.slice(-MAX_UNDO + 1), prev]
        const next = updater(prev)
        saveDrawings(symbol, next)
        return next
      })
    },
    [symbol]
  )

  const undo = useCallback(() => {
    const stack = undoStackRef.current
    if (stack.length === 0) return
    const prev = stack[stack.length - 1]
    undoStackRef.current = stack.slice(0, -1)
    setDrawings(prev)
    saveDrawings(symbol, prev)
    setSelectedId(null)
  }, [symbol])

  const selectTool = useCallback((tool: DrawingToolType) => {
    setActiveTool(tool)
    setPendingPoints([])
    setHoverPoint(null)
    if (tool !== "cursor") setSelectedId(null)
  }, [])

  // ── Chart click handler ────────────────────────────────

  const handleChartClick = useCallback(
    (point: DrawingPoint) => {
      if (activeTool === "cursor") return

      const newPending = [...pendingPoints, point]
      const pointsNeeded: Record<DrawingToolType, number> = {
        cursor: 0, trendline: 2, horizontal: 1, fibonacci: 2,
        longposition: 1, shortposition: 1, rectangle: 2, measure: 2,
      }

      if (newPending.length < pointsNeeded[activeTool]) {
        setPendingPoints(newPending)
        return
      }

      const base = { id: nextId(), symbol, visible: true, locked: false }
      let drawing: Drawing | null = null

      switch (activeTool) {
        case "trendline":
          drawing = { ...base, type: "trendline", p1: newPending[0], p2: newPending[1], color: DEFAULT_COLORS.trendline, lineWidth: 2, extendRight: false } as TrendlineDrawing
          break
        case "horizontal":
          drawing = { ...base, type: "horizontal", price: point.price, color: DEFAULT_COLORS.horizontal, lineWidth: 1, lineStyle: "dashed" } as HorizontalDrawing
          break
        case "fibonacci":
          drawing = { ...base, type: "fibonacci", p1: newPending[0], p2: newPending[1], levels: FIB_LEVELS, color: DEFAULT_COLORS.fibonacci } as FibonacciDrawing
          break
        case "longposition":
          drawing = { ...base, type: "longposition", entry: point, takeProfit: Math.round(point.price * 1.05 * 100) / 100, stopLoss: Math.round(point.price * 0.97 * 100) / 100, quantity: 1 } as PositionDrawing
          break
        case "shortposition":
          drawing = { ...base, type: "shortposition", entry: point, takeProfit: Math.round(point.price * 0.95 * 100) / 100, stopLoss: Math.round(point.price * 1.03 * 100) / 100, quantity: 1 } as PositionDrawing
          break
        case "rectangle":
          drawing = { ...base, type: "rectangle", p1: newPending[0], p2: newPending[1], color: DEFAULT_COLORS.rectangle, fillOpacity: 0.1 } as RectangleDrawing
          break
        case "measure":
          drawing = { ...base, type: "measure", p1: newPending[0], p2: newPending[1] } as MeasureDrawing
          break
      }

      if (drawing) {
        updateDrawingsWithUndo((prev) => [...prev, drawing])
        setSelectedId(drawing.id)
      }
      setPendingPoints([])
      setHoverPoint(null)
      if (activeTool !== "measure") setActiveTool("cursor")
    },
    [activeTool, pendingPoints, symbol, updateDrawingsWithUndo]
  )

  const updateDrawing = useCallback(
    (id: string, partial: Partial<Drawing>) => {
      updateDrawingsWithUndo((prev) =>
        prev.map((d) => (d.id === id ? { ...d, ...partial } as Drawing : d))
      )
    },
    [updateDrawingsWithUndo]
  )

  // ── Drag operations (screen-space) ─────────────────────
  // During drag we only track pixel offsets. The drawing data is NOT modified.
  // The overlay renders the original drawing + pixel offset.
  // On endDrag the overlay converts final screen positions to chart coords.

  const startDrag = useCallback(
    (drawingId: string, handle: DragHandle, screenX: number, screenY: number) => {
      const drawing = drawings.find((d) => d.id === drawingId)
      if (!drawing || drawing.locked) return
      setDragState({
        drawingId,
        handle,
        startX: screenX,
        startY: screenY,
        offsetX: 0,
        offsetY: 0,
        originalDrawing: structuredClone(drawing),
      })
      setSelectedId(drawingId)
    },
    [drawings]
  )

  /** Update pixel offset during drag — no drawing mutation */
  const dragMove = useCallback(
    (screenX: number, screenY: number) => {
      if (!dragState) return
      setDragState((prev) =>
        prev ? { ...prev, offsetX: screenX - prev.startX, offsetY: screenY - prev.startY } : null
      )
    },
    [dragState]
  )

  /** Finalize drag — overlay calls this with the final converted drawing */
  const endDrag = useCallback(
    (finalDrawing: Drawing | null) => {
      if (!dragState) return
      if (finalDrawing) {
        setDrawings((current) => {
          // Push pre-drag state onto undo
          undoStackRef.current = [
            ...undoStackRef.current.slice(-MAX_UNDO + 1),
            current.map((d) => d.id === dragState.drawingId ? dragState.originalDrawing : d),
          ]
          const next = current.map((d) => d.id === dragState.drawingId ? finalDrawing : d)
          saveDrawings(symbol, next)
          return next
        })
      }
      setDragState(null)
    },
    [dragState, symbol]
  )

  const cancelDrag = useCallback(() => {
    setDragState(null)
  }, [])

  // ── Drawing management ─────────────────────────────────

  const removeDrawing = useCallback(
    (id: string) => {
      updateDrawingsWithUndo((prev) => prev.filter((d) => d.id !== id))
      if (selectedId === id) setSelectedId(null)
    },
    [updateDrawingsWithUndo, selectedId]
  )

  const clearAllDrawings = useCallback(() => {
    updateDrawingsWithUndo(() => [])
    setSelectedId(null)
  }, [updateDrawingsWithUndo])

  const selectDrawing = useCallback((id: string | null) => {
    setSelectedId(id)
    if (id) setActiveTool("cursor")
  }, [])

  const cancelDrawing = useCallback(() => {
    setPendingPoints([])
    setHoverPoint(null)
    setActiveTool("cursor")
  }, [])

  const duplicateDrawing = useCallback(
    (id: string) => {
      const drawing = drawings.find((d) => d.id === id)
      if (!drawing) return
      const clone = structuredClone(drawing)
      clone.id = nextId()
      if ("p1" in clone && "p2" in clone) {
        const offset = (clone.p2 as DrawingPoint).price * 0.01
        ;(clone.p1 as DrawingPoint).price += offset
        ;(clone.p2 as DrawingPoint).price += offset
      } else if ("price" in clone) {
        ;(clone as HorizontalDrawing).price *= 1.01
      } else if ("entry" in clone) {
        const pos = clone as PositionDrawing
        const offset = pos.entry.price * 0.01
        pos.entry.price += offset
        pos.takeProfit += offset
        pos.stopLoss += offset
      }
      updateDrawingsWithUndo((prev) => [...prev, clone])
      setSelectedId(clone.id)
    },
    [drawings, updateDrawingsWithUndo]
  )

  return {
    drawings,
    activeTool,
    selectedId,
    pendingPoints,
    hoverPoint,
    dragState,
    selectTool,
    handleChartClick,
    setHoverPoint,
    removeDrawing,
    clearAllDrawings,
    selectDrawing,
    cancelDrawing,
    updateDrawing,
    duplicateDrawing,
    startDrag,
    dragMove,
    endDrag,
    cancelDrag,
    undo,
    canUndo: undoStackRef.current.length > 0,
    isDrawing: activeTool !== "cursor",
    isDragging: dragState !== null,
  }
}
