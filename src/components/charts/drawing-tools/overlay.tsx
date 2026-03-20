"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { IChartApi, ISeriesApi } from "lightweight-charts"
import type {
  Drawing,
  DrawingPoint,
  DrawingToolType,
  DragHandle,
  DragState,
  TrendlineDrawing,
  HorizontalDrawing,
  FibonacciDrawing,
  PositionDrawing,
  RectangleDrawing,
  MeasureDrawing,
  ScreenPoint,
} from "./types"
import { FIB_LEVELS, FIB_COLORS, DEFAULT_COLORS } from "./types"
import { PropertiesPopup } from "./properties-popup"

// ── Coordinate conversion ───────────────────────────────

function toScreen(
  point: DrawingPoint,
  chart: IChartApi,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  series: ISeriesApi<any>
): ScreenPoint | null {
  const x = chart.timeScale().timeToCoordinate(point.time as never)
  const y = series.priceToCoordinate(point.price)
  if (x == null || y == null) return null
  return { x: Number(x), y: Number(y) }
}

function priceToY(
  price: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  series: ISeriesApi<any>
): number | null {
  const y = series.priceToCoordinate(price)
  return y != null ? Number(y) : null
}

function screenToChart(
  sx: number, sy: number,
  chart: IChartApi,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  series: ISeriesApi<any>
): DrawingPoint | null {
  const time = chart.timeScale().coordinateToTime(sx)
  const price = series.coordinateToPrice(sy)
  if (time == null || price == null) return null
  return { time: Number(time), price: Number(price) }
}

function yToPrice(
  y: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  series: ISeriesApi<any>
): number | null {
  const price = series.coordinateToPrice(y)
  return price != null ? Number(price) : null
}

// ── Formatting helpers ──────────────────────────────────

function formatPrice(p: number) { return p.toFixed(2) }

function formatPct(change: number, base: number) {
  if (base === 0) return "0.00%"
  return `${((change / base) * 100).toFixed(2)}%`
}

function formatBars(t1: number, t2: number) {
  const diffSec = Math.abs(t2 - t1)
  const days = Math.round(diffSec / 86400)
  if (days > 365) return `${(days / 365).toFixed(1)}y`
  if (days > 30) return `${Math.round(days / 30)}mo`
  return `${days}d`
}

function pointToLineDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

// ── Constants ───────────────────────────────────────────

const HANDLE_R = 5
const HANDLE_HIT_R = 12
const LINE_HIT_WIDTH = 12

// ── Pixel offset helpers for drag rendering ─────────────
// These compute the screen-space offset that should be applied to each
// anchor point based on which handle is being dragged.

interface Offsets {
  /** Offset to apply to p1 / entry screen position */
  dx1: number; dy1: number
  /** Offset to apply to p2 screen position */
  dx2: number; dy2: number
}

function getOffsets(handle: DragHandle, ox: number, oy: number): Offsets {
  switch (handle.type) {
    case "p1":    return { dx1: ox, dy1: oy, dx2: 0,  dy2: 0 }
    case "p2":    return { dx1: 0,  dy1: 0,  dx2: ox, dy2: oy }
    case "body":
    case "entry": return { dx1: ox, dy1: oy, dx2: ox, dy2: oy }
    case "tp":    return { dx1: 0,  dy1: 0,  dx2: 0,  dy2: oy } // only price axis
    case "sl":    return { dx1: 0,  dy1: 0,  dx2: 0,  dy2: oy }
    default:      return { dx1: 0,  dy1: 0,  dx2: 0,  dy2: 0 }
  }
}

// ── Props ───────────────────────────────────────────────

interface DrawingOverlayProps {
  chart: IChartApi | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  candleSeries: ISeriesApi<any> | null
  drawings: Drawing[]
  activeTool: DrawingToolType
  pendingPoints: DrawingPoint[]
  hoverPoint: DrawingPoint | null
  selectedId: string | null
  dragState: DragState | null
  onChartClick: (point: DrawingPoint) => void
  onHoverPoint: (point: DrawingPoint | null) => void
  onSelectDrawing: (id: string | null) => void
  onRemoveDrawing: (id: string) => void
  onUpdateDrawing: (id: string, partial: Partial<Drawing>) => void
  onDuplicateDrawing: (id: string) => void
  onStartDrag: (drawingId: string, handle: DragHandle, screenX: number, screenY: number) => void
  onDragMove: (screenX: number, screenY: number) => void
  onEndDrag: (finalDrawing: Drawing | null) => void
  width: number
  height: number
}

export function DrawingOverlay({
  chart, candleSeries, drawings, activeTool, pendingPoints, hoverPoint,
  selectedId, dragState,
  onChartClick, onHoverPoint, onSelectDrawing, onRemoveDrawing,
  onUpdateDrawing, onDuplicateDrawing,
  onStartDrag, onDragMove, onEndDrag,
  width, height,
}: DrawingOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDrawing = activeTool !== "cursor"
  const isDragging = dragState !== null
  const [hoveredHandle, setHoveredHandle] = useState<{ drawingId: string; handle: DragHandle } | null>(null)
  const [showProperties, setShowProperties] = useState<{ x: number; y: number } | null>(null)

  const prevSelectedRef = useRef(selectedId)
  if (prevSelectedRef.current !== selectedId) {
    prevSelectedRef.current = selectedId
    setShowProperties(null)
  }

  // ── Mouse → screen coords (relative to SVG) ───────────

  const svgXY = useCallback((e: React.MouseEvent | MouseEvent): { x: number; y: number } | null => {
    if (!svgRef.current) return null
    const rect = svgRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }, [])

  const pointFromEvent = useCallback(
    (e: React.MouseEvent | MouseEvent): DrawingPoint | null => {
      if (!chart || !candleSeries) return null
      const pos = svgXY(e)
      if (!pos) return null
      return screenToChart(pos.x, pos.y, chart, candleSeries)
    },
    [chart, candleSeries, svgXY]
  )

  // ── Mouse handlers ─────────────────────────────────────

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) {
        const pos = svgXY(e)
        if (pos) onDragMove(pos.x, pos.y)
        return
      }
      if (isDrawing && pendingPoints.length > 0) {
        onHoverPoint(pointFromEvent(e))
        return
      }
      if (!isDrawing && chart && candleSeries && svgRef.current) {
        const pos = svgXY(e)
        if (pos) {
          const hit = hitTestHandles(pos.x, pos.y, drawings, selectedId, chart, candleSeries, width)
          setHoveredHandle(hit)
        }
      }
    },
    [isDragging, isDrawing, pendingPoints.length, svgXY, onDragMove, onHoverPoint, pointFromEvent, chart, candleSeries, drawings, selectedId, width]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      if (isDrawing) {
        const pt = pointFromEvent(e)
        if (pt) onChartClick(pt)
        return
      }
      const pos = svgXY(e)
      if (!pos || !chart || !candleSeries) return

      // Check handles first (selected drawing)
      const handleHit = hitTestHandles(pos.x, pos.y, drawings, selectedId, chart, candleSeries, width)
      if (handleHit) {
        e.preventDefault(); e.stopPropagation()
        onStartDrag(handleHit.drawingId, handleHit.handle, pos.x, pos.y)
        return
      }
      // Then body of any drawing
      const bodyHit = hitTestBody(pos.x, pos.y, drawings, chart, candleSeries, width)
      if (bodyHit) {
        e.preventDefault(); e.stopPropagation()
        onSelectDrawing(bodyHit.drawingId)
        const d = drawings.find((d) => d.id === bodyHit.drawingId)
        if (d && !d.locked) onStartDrag(bodyHit.drawingId, { type: "body" }, pos.x, pos.y)
        return
      }
      onSelectDrawing(null)
      setShowProperties(null)
    },
    [isDrawing, pointFromEvent, svgXY, chart, candleSeries, drawings, selectedId, onChartClick, onStartDrag, onSelectDrawing, width]
  )

  // ── Finalize drag: convert pixel offset back to chart space ──

  const finalizeDrag = useCallback(() => {
    if (!dragState || !chart || !candleSeries) { onEndDrag(null); return }

    const { handle, offsetX, offsetY, originalDrawing: orig } = dragState
    const offsets = getOffsets(handle, offsetX, offsetY)

    // Convert a screen point (from original drawing + offset) back to chart coords
    const convertPoint = (origPoint: DrawingPoint, dx: number, dy: number): DrawingPoint | null => {
      const s = toScreen(origPoint, chart, candleSeries)
      if (!s) return origPoint // fallback: keep original if can't convert
      return screenToChart(s.x + dx, s.y + dy, chart, candleSeries) ?? origPoint
    }

    const convertPrice = (origPrice: number, dy: number): number => {
      const y = priceToY(origPrice, candleSeries)
      if (y == null) return origPrice
      return yToPrice(y + dy, candleSeries) ?? origPrice
    }

    let finalDrawing: Drawing

    switch (orig.type) {
      case "trendline": {
        const p1 = convertPoint(orig.p1, offsets.dx1, offsets.dy1) ?? orig.p1
        const p2 = convertPoint(orig.p2, offsets.dx2, offsets.dy2) ?? orig.p2
        finalDrawing = { ...orig, p1, p2 }
        break
      }
      case "horizontal": {
        finalDrawing = { ...orig, price: convertPrice(orig.price, offsets.dy1) }
        break
      }
      case "fibonacci": {
        const p1 = convertPoint(orig.p1, offsets.dx1, offsets.dy1) ?? orig.p1
        const p2 = convertPoint(orig.p2, offsets.dx2, offsets.dy2) ?? orig.p2
        finalDrawing = { ...orig, p1, p2 }
        break
      }
      case "longposition":
      case "shortposition": {
        if (handle.type === "tp") {
          finalDrawing = { ...orig, takeProfit: convertPrice(orig.takeProfit, offsets.dy2) }
        } else if (handle.type === "sl") {
          finalDrawing = { ...orig, stopLoss: convertPrice(orig.stopLoss, offsets.dy2) }
        } else {
          // body/entry: move everything by same price delta
          const newEntryPrice = convertPrice(orig.entry.price, offsets.dy1)
          const priceDelta = newEntryPrice - orig.entry.price
          const entry = convertPoint(orig.entry, offsets.dx1, offsets.dy1) ?? orig.entry
          finalDrawing = {
            ...orig,
            entry,
            takeProfit: orig.takeProfit + priceDelta,
            stopLoss: orig.stopLoss + priceDelta,
          }
        }
        break
      }
      case "rectangle": {
        const p1 = convertPoint(orig.p1, offsets.dx1, offsets.dy1) ?? orig.p1
        const p2 = convertPoint(orig.p2, offsets.dx2, offsets.dy2) ?? orig.p2
        finalDrawing = { ...orig, p1, p2 }
        break
      }
      case "measure": {
        const p1 = convertPoint(orig.p1, offsets.dx1, offsets.dy1) ?? orig.p1
        const p2 = convertPoint(orig.p2, offsets.dx2, offsets.dy2) ?? orig.p2
        finalDrawing = { ...orig, p1, p2 }
        break
      }
      default:
        finalDrawing = orig
    }

    onEndDrag(finalDrawing)
  }, [dragState, chart, candleSeries, onEndDrag])

  const handleMouseUp = useCallback(() => {
    if (isDragging) finalizeDrag()
  }, [isDragging, finalizeDrag])

  // Global mouse handlers for drag (mouse can leave SVG)
  useEffect(() => {
    if (!isDragging) return
    function handleGlobalMove(e: MouseEvent) {
      if (!svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      onDragMove(e.clientX - rect.left, e.clientY - rect.top)
    }
    function handleGlobalUp() { finalizeDrag() }
    window.addEventListener("mousemove", handleGlobalMove)
    window.addEventListener("mouseup", handleGlobalUp)
    return () => {
      window.removeEventListener("mousemove", handleGlobalMove)
      window.removeEventListener("mouseup", handleGlobalUp)
    }
  }, [isDragging, onDragMove, finalizeDrag])

  // Double-click → properties
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isDrawing || isDragging || !chart || !candleSeries) return
      const pos = svgXY(e)
      if (!pos) return
      const bodyHit = hitTestBody(pos.x, pos.y, drawings, chart, candleSeries, width)
      if (bodyHit) {
        e.preventDefault(); e.stopPropagation()
        onSelectDrawing(bodyHit.drawingId)
        setShowProperties({ x: pos.x, y: pos.y })
      }
    },
    [isDrawing, isDragging, chart, candleSeries, svgXY, drawings, onSelectDrawing, width]
  )

  // Keyboard: Delete
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault()
        onRemoveDrawing(selectedId)
        setShowProperties(null)
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [selectedId, onRemoveDrawing])

  // ── Render ─────────────────────────────────────────────

  if (!chart || !candleSeries) return null

  let cursor = "default"
  if (isDrawing) cursor = "crosshair"
  else if (isDragging) cursor = "grabbing"
  else if (hoveredHandle) cursor = hoveredHandle.handle.type === "body" ? "grab" : "pointer"

  // During drag, get the drawing being dragged and the pixel offsets
  const dragId = dragState?.drawingId ?? null
  const dragHandle = dragState?.handle ?? null
  const dragOX = dragState?.offsetX ?? 0
  const dragOY = dragState?.offsetY ?? 0
  const dragOriginal = dragState?.originalDrawing ?? null

  // ── Handle renderer ────────────────────────────────────

  const renderHandle = (x: number, y: number, color: string, drawingId: string, handle: DragHandle) => {
    const isHovered = hoveredHandle?.drawingId === drawingId && hoveredHandle?.handle.type === handle.type
    return (
      <g key={`handle-${drawingId}-${handle.type}`}>
        <circle cx={x} cy={y} r={HANDLE_HIT_R} fill="transparent" />
        <circle cx={x} cy={y} r={isHovered ? HANDLE_R + 1.5 : HANDLE_R} fill={color} stroke="#fff" strokeWidth={1.5} opacity={isHovered ? 1 : 0.85} />
      </g>
    )
  }

  // ── Drawing renderers ─────────────────────────────────
  // Each renderer takes the drawing + optional pixel offsets.
  // During drag, the ORIGINAL drawing is rendered with offsets applied.

  const renderTrendline = (d: TrendlineDrawing, isSelected: boolean, off?: Offsets) => {
    const s1 = toScreen(d.p1, chart, candleSeries)
    const s2 = toScreen(d.p2, chart, candleSeries)
    if (!s1 || !s2) return null
    const x1 = s1.x + (off?.dx1 ?? 0), y1 = s1.y + (off?.dy1 ?? 0)
    const x2 = s2.x + (off?.dx2 ?? 0), y2 = s2.y + (off?.dy2 ?? 0)

    let x2F = x2, y2F = y2
    if (d.extendRight && x2 !== x1) {
      const slope = (y2 - y1) / (x2 - x1)
      x2F = width; y2F = y1 + slope * (x2F - x1)
    }

    return (
      <g key={d.id}>
        <line x1={x1} y1={y1} x2={x2F} y2={y2F} stroke="transparent" strokeWidth={LINE_HIT_WIDTH} />
        <line x1={x1} y1={y1} x2={x2F} y2={y2F} stroke={d.color} strokeWidth={d.lineWidth} opacity={isSelected ? 1 : 0.8} />
        {isSelected && <line x1={x1} y1={y1} x2={x2F} y2={y2F} stroke={d.color} strokeWidth={d.lineWidth + 4} opacity={0.15} />}
        {isSelected && !d.locked && !off && (
          <>
            {renderHandle(x1, y1, d.color, d.id, { type: "p1" })}
            {renderHandle(x2, y2, d.color, d.id, { type: "p2" })}
          </>
        )}
      </g>
    )
  }

  const renderHorizontal = (d: HorizontalDrawing, isSelected: boolean, off?: Offsets) => {
    const origY = priceToY(d.price, candleSeries)
    if (origY == null) return null
    const y = origY + (off?.dy1 ?? 0)
    const dashArray = d.lineStyle === "dashed" ? "6,3" : d.lineStyle === "dotted" ? "2,2" : "none"

    return (
      <g key={d.id}>
        <line x1={0} y1={y} x2={width} y2={y} stroke="transparent" strokeWidth={LINE_HIT_WIDTH} />
        <line x1={0} y1={y} x2={width} y2={y} stroke={d.color} strokeWidth={d.lineWidth} strokeDasharray={dashArray} opacity={isSelected ? 1 : 0.8} />
        {isSelected && <line x1={0} y1={y} x2={width} y2={y} stroke={d.color} strokeWidth={d.lineWidth + 4} opacity={0.15} />}
        <rect x={width - 70} y={y - 10} width={65} height={20} rx={3} fill={d.color} opacity={0.9} />
        <text x={width - 38} y={y + 4} textAnchor="middle" fill="#fff" fontSize={10} fontFamily="monospace">
          ${off ? formatPrice(yToPrice(y, candleSeries) ?? d.price) : formatPrice(d.price)}
        </text>
        {isSelected && !d.locked && !off && (
          <>
            {renderHandle(60, y, d.color, d.id, { type: "body" })}
            {renderHandle(width / 2, y, d.color, d.id, { type: "body" })}
          </>
        )}
      </g>
    )
  }

  const renderFibonacci = (d: FibonacciDrawing, isSelected: boolean, off?: Offsets) => {
    const s1 = toScreen(d.p1, chart, candleSeries)
    const s2 = toScreen(d.p2, chart, candleSeries)
    if (!s1 || !s2) return null
    const x1 = s1.x + (off?.dx1 ?? 0), y1 = s1.y + (off?.dy1 ?? 0)
    const x2 = s2.x + (off?.dx2 ?? 0), y2 = s2.y + (off?.dy2 ?? 0)

    const xLeft = Math.min(x1, x2)
    const xRight = Math.max(x1, x2, width * 0.6)
    // Compute fib levels in screen space by interpolating between y1 and y2
    const yRange = y2 - y1

    return (
      <g key={d.id}>
        {d.levels.slice(0, -1).map((level, i) => {
          const nextLevel = d.levels[i + 1]
          const ly1 = y1 + yRange * level
          const ly2 = y1 + yRange * nextLevel
          const color = FIB_COLORS[nextLevel] ?? "#787b86"
          return <rect key={`fill-${level}`} x={xLeft} y={Math.min(ly1, ly2)} width={xRight - xLeft} height={Math.abs(ly2 - ly1)} fill={color} opacity={isSelected ? 0.07 : 0.04} />
        })}
        {d.levels.map((level) => {
          const ly = y1 + yRange * level
          const color = FIB_COLORS[level] ?? "#787b86"
          const price = off
            ? yToPrice(ly, candleSeries) ?? (d.p1.price + (d.p2.price - d.p1.price) * level)
            : d.p1.price + (d.p2.price - d.p1.price) * level
          return (
            <g key={level}>
              <line x1={xLeft} y1={ly} x2={xRight} y2={ly} stroke={color} strokeWidth={1} strokeDasharray="4,2" opacity={isSelected ? 0.9 : 0.6} />
              <text x={xRight + 5} y={ly + 4} fill={color} fontSize={10} fontFamily="monospace">
                {level.toFixed(3)} (${formatPrice(price)})
              </text>
            </g>
          )
        })}
        {isSelected && !d.locked && !off && (
          <>
            {renderHandle(x1, y1, d.color, d.id, { type: "p1" })}
            {renderHandle(x2, y2, d.color, d.id, { type: "p2" })}
          </>
        )}
      </g>
    )
  }

  const renderPosition = (d: PositionDrawing, isSelected: boolean, off?: Offsets) => {
    const origEntryY = priceToY(d.entry.price, candleSeries)
    const origTpY = priceToY(d.takeProfit, candleSeries)
    const origSlY = priceToY(d.stopLoss, candleSeries)
    if (origEntryY == null || origTpY == null || origSlY == null) return null

    const entryScreen = toScreen(d.entry, chart, candleSeries)
    const anchorX = entryScreen ? entryScreen.x + (off?.dx1 ?? 0) : width * 0.5

    // For body/entry drag: all three lines move by dy1
    // For tp drag: only tp moves by dy2
    // For sl drag: only sl moves by dy2
    let entryY = origEntryY, tpY = origTpY, slY = origSlY
    if (off && dragHandle) {
      if (dragHandle.type === "tp") {
        tpY = origTpY + off.dy2
      } else if (dragHandle.type === "sl") {
        slY = origSlY + off.dy2
      } else {
        // body/entry: move all
        entryY = origEntryY + off.dy1
        tpY = origTpY + off.dy1
        slY = origSlY + off.dy1
      }
    }

    const isLong = d.type === "longposition"
    const profitColor = "#26a69a", lossColor = "#ef5350"
    const xLeft = Math.max(anchorX - 20, 40)
    const xRight = Math.min(anchorX + 200, width - 5)

    const entryPrice = off ? (yToPrice(entryY, candleSeries) ?? d.entry.price) : d.entry.price
    const tpPrice = off ? (yToPrice(tpY, candleSeries) ?? d.takeProfit) : d.takeProfit
    const slPrice = off ? (yToPrice(slY, candleSeries) ?? d.stopLoss) : d.stopLoss

    const profitAmount = Math.abs(tpPrice - entryPrice) * d.quantity
    const lossAmount = Math.abs(entryPrice - slPrice) * d.quantity
    const rr = lossAmount > 0 ? (profitAmount / lossAmount).toFixed(2) : "∞"

    return (
      <g key={d.id}>
        <rect x={xLeft} y={Math.min(entryY, tpY)} width={xRight - xLeft} height={Math.abs(tpY - entryY)} fill={profitColor} opacity={isSelected ? 0.18 : 0.12} />
        <rect x={xLeft} y={Math.min(entryY, slY)} width={xRight - xLeft} height={Math.abs(slY - entryY)} fill={lossColor} opacity={isSelected ? 0.18 : 0.12} />
        <line x1={xLeft} y1={entryY} x2={xRight} y2={entryY} stroke="#787b86" strokeWidth={1.5} />
        <line x1={xLeft} y1={tpY} x2={xRight} y2={tpY} stroke={profitColor} strokeWidth={1} strokeDasharray="4,2" />
        <line x1={xLeft} y1={slY} x2={xRight} y2={slY} stroke={lossColor} strokeWidth={1} strokeDasharray="4,2" />
        <text x={xRight + 4} y={entryY + 4} fill="#d1d4dc" fontSize={10} fontFamily="monospace">Entry ${formatPrice(entryPrice)}</text>
        <text x={xRight + 4} y={tpY + 4} fill={profitColor} fontSize={10} fontFamily="monospace">TP ${formatPrice(tpPrice)} (+${formatPrice(profitAmount)})</text>
        <text x={xRight + 4} y={slY + 4} fill={lossColor} fontSize={10} fontFamily="monospace">SL ${formatPrice(slPrice)} (-${formatPrice(lossAmount)})</text>
        <rect x={xLeft + 4} y={Math.min(tpY, slY) + 4} width={54} height={18} rx={3} fill="#1e222d" stroke="#2a2e39" />
        <text x={xLeft + 31} y={Math.min(tpY, slY) + 17} textAnchor="middle" fill="#d1d4dc" fontSize={10} fontFamily="monospace">R:R {rr}</text>
        <text x={xLeft + 4} y={entryY - 6} fill={isLong ? profitColor : lossColor} fontSize={14}>{isLong ? "▲ Long" : "▼ Short"}</text>
        <line x1={xLeft} y1={tpY} x2={xRight} y2={tpY} stroke="transparent" strokeWidth={LINE_HIT_WIDTH} />
        <line x1={xLeft} y1={slY} x2={xRight} y2={slY} stroke="transparent" strokeWidth={LINE_HIT_WIDTH} />
        {isSelected && !d.locked && !off && (
          <>
            {renderHandle(anchorX, entryY, "#787b86", d.id, { type: "entry" })}
            {renderHandle((xLeft + xRight) / 2, tpY, profitColor, d.id, { type: "tp" })}
            {renderHandle((xLeft + xRight) / 2, slY, lossColor, d.id, { type: "sl" })}
          </>
        )}
      </g>
    )
  }

  const renderRectangle = (d: RectangleDrawing, isSelected: boolean, off?: Offsets) => {
    const s1 = toScreen(d.p1, chart, candleSeries)
    const s2 = toScreen(d.p2, chart, candleSeries)
    if (!s1 || !s2) return null
    const x1 = s1.x + (off?.dx1 ?? 0), y1 = s1.y + (off?.dy1 ?? 0)
    const x2 = s2.x + (off?.dx2 ?? 0), y2 = s2.y + (off?.dy2 ?? 0)
    const rx = Math.min(x1, x2), ry = Math.min(y1, y2)
    const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1)

    return (
      <g key={d.id}>
        <rect x={rx} y={ry} width={rw} height={rh} fill={d.color} opacity={isSelected ? d.fillOpacity * 1.5 : d.fillOpacity} />
        <rect x={rx} y={ry} width={rw} height={rh} fill="none" stroke={d.color} strokeWidth={isSelected ? 2 : 1} opacity={0.6} />
        {isSelected && <rect x={rx - 2} y={ry - 2} width={rw + 4} height={rh + 4} fill="none" stroke={d.color} strokeWidth={1} opacity={0.2} strokeDasharray="4,2" />}
        {isSelected && !d.locked && !off && (
          <>
            {renderHandle(x1, y1, d.color, d.id, { type: "p1" })}
            {renderHandle(x2, y2, d.color, d.id, { type: "p2" })}
          </>
        )}
      </g>
    )
  }

  const renderMeasure = (d: MeasureDrawing, isSelected: boolean, off?: Offsets) => {
    const s1 = toScreen(d.p1, chart, candleSeries)
    const s2 = toScreen(d.p2, chart, candleSeries)
    if (!s1 || !s2) return null
    const x1 = s1.x + (off?.dx1 ?? 0), y1 = s1.y + (off?.dy1 ?? 0)
    const x2 = s2.x + (off?.dx2 ?? 0), y2 = s2.y + (off?.dy2 ?? 0)

    const p1Price = off ? (yToPrice(y1, candleSeries) ?? d.p1.price) : d.p1.price
    const p2Price = off ? (yToPrice(y2, candleSeries) ?? d.p2.price) : d.p2.price
    const priceDiff = p2Price - p1Price
    const isPositive = priceDiff >= 0
    const color = isPositive ? "#26a69a" : "#ef5350"
    const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2

    return (
      <g key={d.id}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1} strokeDasharray="4,3" />
        <line x1={x1} y1={y1} x2={x2} y2={y1} stroke="#787b86" strokeWidth={0.5} strokeDasharray="2,2" />
        <line x1={x2} y1={y1} x2={x2} y2={y2} stroke="#787b86" strokeWidth={0.5} strokeDasharray="2,2" />
        <circle cx={x1} cy={y1} r={3} fill={color} />
        <circle cx={x2} cy={y2} r={3} fill={color} />
        <rect x={midX - 60} y={midY - 28} width={120} height={36} rx={4} fill="#1e222d" stroke="#2a2e39" opacity={0.95} />
        <text x={midX} y={midY - 13} textAnchor="middle" fill={color} fontSize={11} fontWeight="bold" fontFamily="monospace">
          {isPositive ? "+" : ""}{formatPrice(priceDiff)} ({formatPct(priceDiff, p1Price)})
        </text>
        <text x={midX} y={midY + 2} textAnchor="middle" fill="#787b86" fontSize={10} fontFamily="monospace">
          {formatBars(d.p1.time, d.p2.time)}
        </text>
        {isSelected && !off && (
          <>
            {renderHandle(x1, y1, color, d.id, { type: "p1" })}
            {renderHandle(x2, y2, color, d.id, { type: "p2" })}
          </>
        )}
      </g>
    )
  }

  // ── Render preview ─────────────────────────────────────

  const renderPreview = () => {
    if (pendingPoints.length === 0 || !hoverPoint) return null
    const p1 = pendingPoints[0]
    const s1 = toScreen(p1, chart, candleSeries)
    const s2 = toScreen(hoverPoint, chart, candleSeries)
    if (!s1 || !s2) return null
    const previewColor = DEFAULT_COLORS[activeTool as keyof typeof DEFAULT_COLORS] ?? "#787b86"

    switch (activeTool) {
      case "trendline":
        return (
          <g>
            <line x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y} stroke={previewColor} strokeWidth={2} opacity={0.6} strokeDasharray="6,3" />
            <circle cx={s1.x} cy={s1.y} r={3} fill={previewColor} opacity={0.8} />
            <circle cx={s2.x} cy={s2.y} r={3} fill={previewColor} opacity={0.5} />
          </g>
        )
      case "fibonacci": {
        const priceDiff = hoverPoint.price - p1.price
        const xLeft = Math.min(s1.x, s2.x), xRight = Math.max(s1.x, s2.x, width * 0.4)
        return (
          <g opacity={0.5}>
            {FIB_LEVELS.map((level) => {
              const price = p1.price + priceDiff * level
              const y = priceToY(price, candleSeries)
              if (y == null) return null
              return <line key={level} x1={xLeft} y1={y} x2={xRight} y2={y} stroke={FIB_COLORS[level] ?? "#787b86"} strokeWidth={1} strokeDasharray="4,2" />
            })}
          </g>
        )
      }
      case "rectangle":
        return <rect x={Math.min(s1.x, s2.x)} y={Math.min(s1.y, s2.y)} width={Math.abs(s2.x - s1.x)} height={Math.abs(s2.y - s1.y)} fill={previewColor} opacity={0.08} stroke={previewColor} strokeWidth={1} strokeDasharray="4,2" />
      case "measure": {
        const priceDiff = hoverPoint.price - p1.price
        const isPos = priceDiff >= 0
        const col = isPos ? "#26a69a" : "#ef5350"
        const midX = (s1.x + s2.x) / 2, midY = (s1.y + s2.y) / 2
        return (
          <g opacity={0.7}>
            <line x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y} stroke={col} strokeWidth={1} strokeDasharray="4,3" />
            <circle cx={s1.x} cy={s1.y} r={3} fill={col} />
            <circle cx={s2.x} cy={s2.y} r={3} fill={col} />
            <rect x={midX - 55} y={midY - 12} width={110} height={20} rx={3} fill="#1e222d" stroke="#2a2e39" opacity={0.9} />
            <text x={midX} y={midY + 2} textAnchor="middle" fill={col} fontSize={10} fontFamily="monospace">
              {isPos ? "+" : ""}{formatPrice(priceDiff)} ({formatPct(priceDiff, p1.price)})
            </text>
          </g>
        )
      }
      default: return null
    }
  }

  // ── Render each drawing ────────────────────────────────

  const renderDrawing = (d: Drawing) => {
    if (!d.visible) return null

    // If this drawing is being dragged, render the ORIGINAL with pixel offsets
    if (d.id === dragId && dragOriginal && dragHandle) {
      const off = getOffsets(dragHandle, dragOX, dragOY)
      const isSelected = d.id === selectedId
      switch (dragOriginal.type) {
        case "trendline": return renderTrendline(dragOriginal as TrendlineDrawing, isSelected, off)
        case "horizontal": return renderHorizontal(dragOriginal as HorizontalDrawing, isSelected, off)
        case "fibonacci": return renderFibonacci(dragOriginal as FibonacciDrawing, isSelected, off)
        case "longposition":
        case "shortposition": return renderPosition(dragOriginal as PositionDrawing, isSelected, off)
        case "rectangle": return renderRectangle(dragOriginal as RectangleDrawing, isSelected, off)
        case "measure": return renderMeasure(dragOriginal as MeasureDrawing, isSelected, off)
        default: return null
      }
    }

    const isSelected = d.id === selectedId
    switch (d.type) {
      case "trendline": return renderTrendline(d, isSelected)
      case "horizontal": return renderHorizontal(d, isSelected)
      case "fibonacci": return renderFibonacci(d, isSelected)
      case "longposition":
      case "shortposition": return renderPosition(d, isSelected)
      case "rectangle": return renderRectangle(d, isSelected)
      case "measure": return renderMeasure(d, isSelected)
      default: return null
    }
  }

  const needsPointerEvents = isDrawing || isDragging || hoveredHandle !== null
  const selectedDrawing = selectedId ? drawings.find((d) => d.id === selectedId) : null

  return (
    <>
      <svg
        ref={svgRef}
        className="absolute inset-0 z-20"
        width={width}
        height={height}
        style={{ pointerEvents: needsPointerEvents ? "auto" : "none", cursor }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      >
        <g style={{ pointerEvents: "auto" }}>
          {drawings.map(renderDrawing)}
        </g>
        {renderPreview()}
      </svg>

      {showProperties && selectedDrawing && (
        <PropertiesPopup
          drawing={selectedDrawing}
          anchorX={showProperties.x}
          anchorY={showProperties.y}
          containerWidth={width}
          onUpdate={onUpdateDrawing}
          onRemove={onRemoveDrawing}
          onDuplicate={onDuplicateDrawing}
          onClose={() => setShowProperties(null)}
        />
      )}
    </>
  )
}

// ── Hit testing ─────────────────────────────────────────

function hitTestHandles(
  mx: number, my: number, drawings: Drawing[], selectedId: string | null,
  chart: IChartApi,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  series: ISeriesApi<any>, containerWidth: number,
): { drawingId: string; handle: DragHandle } | null {
  if (!selectedId) return null
  const d = drawings.find((d) => d.id === selectedId)
  if (!d || d.locked) return null

  const check = (sx: number, sy: number, handle: DragHandle) =>
    Math.hypot(mx - sx, my - sy) < HANDLE_HIT_R ? { drawingId: d.id, handle } : null

  switch (d.type) {
    case "trendline": {
      const s1 = toScreen(d.p1, chart, series), s2 = toScreen(d.p2, chart, series)
      if (s1) { const r = check(s1.x, s1.y, { type: "p1" }); if (r) return r }
      if (s2) { const r = check(s2.x, s2.y, { type: "p2" }); if (r) return r }
      break
    }
    case "horizontal": {
      const y = priceToY(d.price, series)
      if (y != null) {
        const r1 = check(60, y, { type: "body" }); if (r1) return r1
        const r2 = check(containerWidth / 2, y, { type: "body" }); if (r2) return r2
      }
      break
    }
    case "fibonacci": {
      const s1 = toScreen(d.p1, chart, series), s2 = toScreen(d.p2, chart, series)
      if (s1) { const r = check(s1.x, s1.y, { type: "p1" }); if (r) return r }
      if (s2) { const r = check(s2.x, s2.y, { type: "p2" }); if (r) return r }
      break
    }
    case "longposition":
    case "shortposition": {
      const es = toScreen(d.entry, chart, series)
      const ax = es ? es.x : containerWidth * 0.5
      const ey = priceToY(d.entry.price, series), tpY = priceToY(d.takeProfit, series), slY = priceToY(d.stopLoss, series)
      const xL = Math.max(ax - 20, 40), xR = Math.min(ax + 200, containerWidth - 5), midX = (xL + xR) / 2
      if (ey != null) { const r = check(ax, ey, { type: "entry" }); if (r) return r }
      if (tpY != null) { const r = check(midX, tpY, { type: "tp" }); if (r) return r }
      if (slY != null) { const r = check(midX, slY, { type: "sl" }); if (r) return r }
      break
    }
    case "rectangle": {
      const s1 = toScreen(d.p1, chart, series), s2 = toScreen(d.p2, chart, series)
      if (s1) { const r = check(s1.x, s1.y, { type: "p1" }); if (r) return r }
      if (s2) { const r = check(s2.x, s2.y, { type: "p2" }); if (r) return r }
      break
    }
    case "measure": {
      const s1 = toScreen(d.p1, chart, series), s2 = toScreen(d.p2, chart, series)
      if (s1) { const r = check(s1.x, s1.y, { type: "p1" }); if (r) return r }
      if (s2) { const r = check(s2.x, s2.y, { type: "p2" }); if (r) return r }
      break
    }
  }
  return null
}

function hitTestBody(
  mx: number, my: number, drawings: Drawing[],
  chart: IChartApi,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  series: ISeriesApi<any>, containerWidth: number,
): { drawingId: string; handle: DragHandle } | null {
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i]
    if (!d.visible) continue
    switch (d.type) {
      case "trendline": {
        const s1 = toScreen(d.p1, chart, series), s2 = toScreen(d.p2, chart, series)
        if (s1 && s2 && pointToLineDist(mx, my, s1.x, s1.y, s2.x, s2.y) < LINE_HIT_WIDTH / 2)
          return { drawingId: d.id, handle: { type: "body" } }
        break
      }
      case "horizontal": {
        const y = priceToY(d.price, series)
        if (y != null && Math.abs(my - y) < LINE_HIT_WIDTH / 2)
          return { drawingId: d.id, handle: { type: "body" } }
        break
      }
      case "fibonacci": {
        const s1 = toScreen(d.p1, chart, series), s2 = toScreen(d.p2, chart, series)
        if (s1 && s2) {
          const yT = Math.min(s1.y, s2.y), yB = Math.max(s1.y, s2.y)
          const xL = Math.min(s1.x, s2.x), xR = Math.max(s1.x, s2.x, containerWidth * 0.6)
          if (mx >= xL && mx <= xR && my >= yT - 5 && my <= yB + 5)
            return { drawingId: d.id, handle: { type: "body" } }
        }
        break
      }
      case "longposition":
      case "shortposition": {
        const es = toScreen(d.entry, chart, series)
        const ax = es ? es.x : containerWidth * 0.5
        const tpY = priceToY(d.takeProfit, series), slY = priceToY(d.stopLoss, series)
        if (tpY != null && slY != null) {
          const xL = Math.max(ax - 20, 40), xR = Math.min(ax + 200, containerWidth - 5)
          if (mx >= xL && mx <= xR && my >= Math.min(tpY, slY) && my <= Math.max(tpY, slY))
            return { drawingId: d.id, handle: { type: "body" } }
        }
        break
      }
      case "rectangle": {
        const s1 = toScreen(d.p1, chart, series), s2 = toScreen(d.p2, chart, series)
        if (s1 && s2) {
          const x = Math.min(s1.x, s2.x), y = Math.min(s1.y, s2.y)
          if (mx >= x && mx <= x + Math.abs(s2.x - s1.x) && my >= y && my <= y + Math.abs(s2.y - s1.y))
            return { drawingId: d.id, handle: { type: "body" } }
        }
        break
      }
      case "measure": {
        const s1 = toScreen(d.p1, chart, series), s2 = toScreen(d.p2, chart, series)
        if (s1 && s2 && pointToLineDist(mx, my, s1.x, s1.y, s2.x, s2.y) < LINE_HIT_WIDTH / 2)
          return { drawingId: d.id, handle: { type: "body" } }
        break
      }
    }
  }
  return null
}
