import { NextRequest, NextResponse } from "next/server";
import { getExchangeRate } from "@/lib/market/currency";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const amountParam = searchParams.get("amount");

  if (!from || !to) {
    return NextResponse.json(
      { error: "Missing required query parameters: from, to" },
      { status: 400 }
    );
  }

  const amount = amountParam ? parseFloat(amountParam) : 1;

  if (isNaN(amount)) {
    return NextResponse.json(
      { error: "Invalid amount parameter" },
      { status: 400 }
    );
  }

  try {
    const rate = await getExchangeRate(from, to);
    const converted = amount * rate;

    return NextResponse.json({
      rate,
      converted,
      from: from.toUpperCase(),
      to: to.toUpperCase(),
    }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch exchange rate";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
