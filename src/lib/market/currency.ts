import YahooFinance from "yahoo-finance2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yahooFinance = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });

interface CachedRate {
  rate: number;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const rateCache = new Map<string, CachedRate>();

export async function getExchangeRate(
  from: string,
  to: string
): Promise<number> {
  const fromUpper = from.toUpperCase();
  const toUpper = to.toUpperCase();

  if (fromUpper === toUpper) {
    return 1.0;
  }

  const cacheKey = `${fromUpper}${toUpper}`;
  const cached = rateCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.rate;
  }

  const symbol = `${fromUpper}${toUpper}=X`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await yahooFinance.quote(symbol);
  const rate = result?.regularMarketPrice as number | undefined;

  if (rate == null) {
    throw new Error(
      `Unable to fetch exchange rate for ${fromUpper} to ${toUpper}`
    );
  }

  rateCache.set(cacheKey, { rate, timestamp: Date.now() });

  return rate;
}

export async function convertCurrency(
  amount: number,
  from: string,
  to: string
): Promise<number> {
  const rate = await getExchangeRate(from, to);
  return amount * rate;
}
