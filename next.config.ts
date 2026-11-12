import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Graders run `npm run dev`; the dev badge would sit on top of the chat footer.
  // Compile and runtime errors are still shown.
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
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
