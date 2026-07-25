/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Local dev only: `next dev` cannot serve the Python function, so proxy
  // /api/* to uvicorn. On Vercel the function is same-origin and no rewrite
  // exists, which is why the client always fetches a relative path.
  async rewrites() {
    return process.env.NODE_ENV === "development"
      ? [{ source: "/api/:path*", destination: "http://127.0.0.1:8000/api/:path*" }]
      : [];
  },
};

module.exports = nextConfig;
