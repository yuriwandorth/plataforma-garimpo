/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // No GitHub Pages o site fica em /plataforma-garimpo/ (definido no workflow de publicação)
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  trailingSlash: true,
  images: { unoptimized: true },
};
export default nextConfig;
