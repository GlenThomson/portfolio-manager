import { NextRequest, NextResponse } from "next/server"
import { getFilings, getFilingDocument } from "@/lib/market/edgar"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get("symbol")
  const accession = searchParams.get("accession")
  const document = searchParams.get("document")

  // Mode 1: Fetch filing content by accession number
  if (accession && document) {
    try {
      const content = await getFilingDocument(accession, document, symbol ?? undefined)
      // Truncate to 50k chars for API responses
      const truncated = content.length > 50000 ? content.slice(0, 50000) + "\n\n[Truncated — full filing is longer]" : content
      return NextResponse.json({ content: truncated, length: content.length })
    } catch (error) {
      console.error("Filing document fetch error:", error)
      return NextResponse.json({ error: "Failed to fetch filing document" }, { status: 500 })
    }
  }

  // Mode 2: List recent filings for a symbol
  if (!symbol) {
    return NextResponse.json(
      { error: "symbol parameter required (or accession + document for filing content)" },
      { status: 400 }
    )
  }

  try {
    const filingType = searchParams.get("type") ?? undefined
    const count = parseInt(searchParams.get("count") ?? "15", 10)
    const filings = await getFilings(symbol.trim().toUpperCase(), filingType, count)
    return NextResponse.json(filings)
  } catch (error) {
    console.error("Filings fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch filings" }, { status: 500 })
  }
}
