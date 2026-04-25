import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  devIndicators: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "artfold.xyz" }],
        destination: "https://www.artfold.xyz/:path*",
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.metmuseum.org",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "whitneymedia.org",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "iiif.micr.io",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "media.getty.edu",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/mplustms/**",
      },
      {
        protocol: "https",
        hostname: "d10skojqnzmy36.cloudfront.net",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "collectionsearch.nma.gov.au",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "ciim-static-media.s3.us-east-1.amazonaws.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
