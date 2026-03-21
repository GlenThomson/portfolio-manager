/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Type checking handled by IDE / CI — skipping in build to avoid OOM on Vercel
    ignoreBuildErrors: true,
  },
  eslint: {
    // Warnings are pre-existing — don't fail the build
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
