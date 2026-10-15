/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";

// Browser-enforced protections. 'unsafe-inline' for scripts is required by Next's inline bootstrap
// (upgrade path: nonce-based CSP via middleware once every page is dynamically rendered).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone", // small Docker image
  experimental: { serverComponentsExternalPackages: ["pg", "@aws-sdk/client-s3"] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      { source: "/repairmen", destination: "/jobs", permanent: true },
      { source: "/admin", destination: "/", permanent: false },
    ];
  },
  images: {
    // The default hero images ship as SVG illustrations served from /public (not user uploads).
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

module.exports = nextConfig;
