"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function AssetsRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/portfolio?tab=assets")
  }, [router])
  return null
}
