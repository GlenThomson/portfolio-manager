// ── Drawing tool types ──────────────────────────────────

export type DrawingToolType =
  | "cursor"       // default — no drawing
  | "trendline"    // diagonal line between two points
  | "horizontal"   // horizontal price level
  | "fibonacci"    // fibonacci retracement (two points)
  | "longposition" // long position: entry + TP + SL
  | "shortposition"// short position: entry + TP + SL
  | "rectangle"    // price/time zone highlight
  | "measure"      // measure distance between two points

export interface DrawingPoint {
  time: number   // unix timestamp
  price: number
}

// ── Individual drawing shapes ───────────────────────────

interface BaseDrawing {
  id: string
  type: DrawingToolType
  symbol: string
  visible: boolean
  locked: boolean
}

export interface TrendlineDrawing extends BaseDrawing {
  type: "trendline"
  p1: DrawingPoint
  p2: DrawingPoint
  color: string
  lineWidth: number
  extendRight: boolean
}

export interface HorizontalDrawing extends BaseDrawing {
  type: "horizontal"
  price: number
  color: string
  lineWidth: number
  lineStyle: "solid" | "dashed" | "dotted"
}

export interface FibonacciDrawing extends BaseDrawing {
  type: "fibonacci"
  p1: DrawingPoint // swing high/low start
  p2: DrawingPoint // swing high/low end
  levels: number[] // e.g. [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
  color: string
}

export interface PositionDrawing extends BaseDrawing {
  type: "longposition" | "shortposition"
  entry: DrawingPoint
  takeProfit: number  // price
  stopLoss: number    // price
  quantity: number
}

export interface RectangleDrawing extends BaseDrawing {
  type: "rectangle"
  p1: DrawingPoint
  p2: DrawingPoint
  color: string
  fillOpacity: number
}

export interface MeasureDrawing extends BaseDrawing {
  type: "measure"
  p1: DrawingPoint
  p2: DrawingPoint
}

export type Drawing =
  | TrendlineDrawing
  | HorizontalDrawing
  | FibonacciDrawing
  | PositionDrawing
  | RectangleDrawing
  | MeasureDrawing

// ── Coordinate-converted versions (for rendering) ───────

export interface ScreenPoint {
  x: number
  y: number
}

// ── Drag handle identifiers ─────────────────────────────

/** Identifies which part of a drawing is being dragged */
export type DragHandle =
  | { type: "p1" }            // first anchor point
  | { type: "p2" }            // second anchor point
  | { type: "body" }          // whole drawing move
  | { type: "tp" }            // take profit line (position)
  | { type: "sl" }            // stop loss line (position)
  | { type: "entry" }         // entry line (position)

/**
 * Drag state works in SCREEN PIXELS to avoid lossy chart coordinate roundtrips.
 * The drawing's data is never modified during drag — only a pixel offset is tracked.
 * On mouseup the overlay converts the final screen positions back to chart space.
 */
export interface DragState {
  drawingId: string
  handle: DragHandle
  /** Mouse position when drag started (SVG-relative pixels) */
  startX: number
  startY: number
  /** Current pixel offset from start */
  offsetX: number
  offsetY: number
  /** Snapshot of the drawing before drag started */
  originalDrawing: Drawing
}

// ── Drawing state ───────────────────────────────────────

export interface DrawingState {
  activeTool: DrawingToolType
  drawings: Drawing[]
  selectedDrawingId: string | null
  pendingPoints: DrawingPoint[]
  hoverPoint: DrawingPoint | null
}

// ── Constants ───────────────────────────────────────────

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]

export const FIB_COLORS: Record<number, string> = {
  0: "#787b86",
  0.236: "#f44336",
  0.382: "#ff9800",
  0.5: "#4caf50",
  0.618: "#2196f3",
  0.786: "#9c27b0",
  1: "#787b86",
}

export const DEFAULT_COLORS = {
  trendline: "#2962ff",
  horizontal: "#ff9800",
  fibonacci: "#9c27b0",
  longposition: "#26a69a",
  shortposition: "#ef5350",
  rectangle: "#2962ff",
  measure: "#787b86",
} as const

export const COLOR_PALETTE = [
  "#2962ff", "#ff9800", "#e040fb", "#00bcd4",
  "#26a69a", "#ef5350", "#ffeb3b", "#4caf50",
  "#f44336", "#9c27b0", "#2196f3", "#ff5722",
  "#787b86", "#d1d4dc", "#ffffff", "#131722",
]

export const LINE_WIDTHS = [1, 2, 3, 4]
