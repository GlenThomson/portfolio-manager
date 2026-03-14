import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/login", "/signup", "/api/auth"]

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh the auth token
  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route))
  const isApiRoute = pathname.startsWith("/api/")

  // Redirect unauthenticated users to login (except public routes and market API)
  if (!user && !isPublicRoute) {
    // Allow market/chart API routes without auth (they don't expose user data)
    if (isApiRoute && (pathname.startsWith("/api/market") || pathname.startsWith("/api/auth"))) {
      return supabaseResponse
    }

    // Redirect to login for dashboard pages
    if (!isApiRoute) {
      const url = request.nextUrl.clone()
      url.pathname = "/login"
      url.searchParams.set("redirectTo", pathname)
      return NextResponse.redirect(url)
    }

    // Return 401 for protected API routes
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Redirect authenticated users away from login/signup
  if (user && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
