import { defineConfig } from "drizzle-kit"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

// Build URL with properly encoded password
const password = encodeURIComponent(process.env.DATABASE_PASSWORD ?? "")
const url = process.env.DATABASE_URL ||
  `postgresql://postgres.rbyjtqcdbifmqchsvgkl:${password}@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres`

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
})
