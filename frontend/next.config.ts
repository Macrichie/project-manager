import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.NODE_ENV === "development" ? {
    rewrites: async () => [{ source: "/api/:path*", destination: "http://127.0.0.1:8000/api/:path*" }],
  } : { output: "export" }),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
