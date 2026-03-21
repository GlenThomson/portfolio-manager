"use client"

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "system-ui" }}>
          <div style={{ textAlign: "center", maxWidth: 400 }}>
            <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
            <p style={{ color: "#888", fontSize: 14, marginBottom: 16 }}>
              {error.message || "An unexpected error occurred."}
            </p>
            <button
              onClick={reset}
              style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #333", background: "transparent", cursor: "pointer", color: "inherit" }}
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
