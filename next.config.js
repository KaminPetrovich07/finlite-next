/** @type {import('next').NextConfig} */

// Security headers for every response. The page may not be framed by other
// sites (clickjacking), the browser must not guess content types, and on
// HTTPS the browser keeps to HTTPS for a year.
// Content-Security-Policy: scripts, styles and requests only from our own site.
// Inline scripts are needed by Next.js itself and by the theme script; eval only in dev (hot reload).
// Images may come from any https site: news covers are hot-linked from the sources.
const dev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  // 'wasm-unsafe-eval' — распознавание чеков (tesseract.js) компилирует WebAssembly в браузере; это не разрешает eval()
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https:${dev ? " http:" : ""}`,
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "media-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: csp },
  ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

const nextConfig = {
  // PDF/Excel libraries read data files from their own folders at runtime
  // (fontkit tries, AFM metrics); bundling breaks those paths, so Node loads
  // them from node_modules instead.
  serverExternalPackages: ["pdfmake", "exceljs", "pdfjs-dist", "mammoth"],
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};
module.exports = nextConfig;
