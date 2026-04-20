/**
 * Generic news search — fetches headlines matching arbitrary keyword queries.
 * Uses Google News RSS (free, no API key, supports any query).
 */

export interface NewsHeadline {
  title: string
  url: string
  source: string
  publishedAt: string // ISO
}

function stripCdata(s: string | undefined): string {
  if (!s) return ""
  return s.replace(/^<!\[CDATA\[|\]\]>$/g, "").trim()
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
}

/**
 * Search Google News for a free-text query. Returns up to `limit` items
 * from the last ~N days (Google News typically returns recent items by default).
 */
export async function searchGoogleNews(
  query: string,
  opts: { limit?: number; lookbackDays?: number } = {},
): Promise<NewsHeadline[]> {
  const limit = opts.limit ?? 25
  const encoded = encodeURIComponent(query)
  const url = `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (PortfolioAI risk monitor)" },
    // Keep it short — we're running inside a cron, don't want to hang.
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) return []

  const xml = await res.text()
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]

  const cutoff = opts.lookbackDays
    ? Date.now() - opts.lookbackDays * 86400_000
    : 0

  const headlines: NewsHeadline[] = []
  for (const m of items) {
    const block = m[1]
    const title = decodeEntities(stripCdata(block.match(/<title>([\s\S]*?)<\/title>/)?.[1]))
    const link = stripCdata(block.match(/<link>([\s\S]*?)<\/link>/)?.[1])
    const pub = stripCdata(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1])
    const source = decodeEntities(stripCdata(block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]))

    if (!title || !link) continue

    const publishedAt = pub ? new Date(pub) : new Date()
    if (cutoff && publishedAt.getTime() < cutoff) continue

    headlines.push({
      title,
      url: link,
      source: source || "Google News",
      publishedAt: publishedAt.toISOString(),
    })

    if (headlines.length >= limit) break
  }

  return headlines
}

/**
 * Search across multiple queries (e.g. multiple keywords for a risk monitor),
 * deduplicating by URL.
 */
export async function searchMultipleQueries(
  queries: string[],
  opts: { limitPerQuery?: number; lookbackDays?: number } = {},
): Promise<NewsHeadline[]> {
  const limitPerQuery = opts.limitPerQuery ?? 10
  const results = await Promise.all(
    queries.map((q) => searchGoogleNews(q, { limit: limitPerQuery, lookbackDays: opts.lookbackDays }).catch(() => [])),
  )

  const byUrl = new Map<string, NewsHeadline>()
  for (const list of results) {
    for (const h of list) {
      if (!byUrl.has(h.url)) byUrl.set(h.url, h)
    }
  }

  return Array.from(byUrl.values()).sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
}
