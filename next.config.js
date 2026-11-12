/** @type {import('next').NextConfig} */

// Security headers for every response. The page may not be framed by other
// sites (clickjacking), the browser must not guess content types, and on
// HTTPS the browser keeps to HTTPS for a year.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
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
