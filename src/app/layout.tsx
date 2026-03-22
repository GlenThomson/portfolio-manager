import type { Metadata } from "next"
import localFont from "next/font/local"
import { QueryProvider } from "@/providers/query-provider"
import { CurrencyProvider } from "@/providers/currency-provider"
import "./globals.css"

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
})
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
})

export const metadata: Metadata = {
  title: "PortfolioAI",
  description: "AI-powered portfolio manager and investment assistant",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="light")document.documentElement.classList.remove("dark");else if(t==="system"){if(!window.matchMedia("(prefers-color-scheme: dark)").matches)document.documentElement.classList.remove("dark")};}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <QueryProvider>
          <CurrencyProvider>{children}</CurrencyProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
