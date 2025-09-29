/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@refinedev/antd"],
  output: "standalone",
  images: {
    remotePatterns: [
      // Shopify-CDN (aus deinem Fehler)
      {
        protocol: "https",
        hostname: "cdn.shopify.com",
        pathname: "/s/**",
      },
    ],
  },
};

export default nextConfig;
