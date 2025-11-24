/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable static export if needed
  // output: 'export',

  // Configure asset prefix for CDN if needed
  // assetPrefix: '',

  // Configure base path if app is not at root
  // basePath: '',

  // Image optimization settings
  images: {
    unoptimized: true, // Set to false when using Vercel or proper image optimization
  },
};

module.exports = nextConfig;
