import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

function getConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const password = encodeURIComponent(process.env.DATABASE_PASSWORD ?? "")
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  const projectRef = supabaseUrl.replace("https://", "").replace(".supabase.co", "")
  return `postgresql://postgres.${projectRef}:${password}@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres`
}

const client = postgres(getConnectionString(), { prepare: false })

export const db = drizzle(client, { schema })
