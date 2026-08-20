/** @type {import('next').NextConfig} */
const nextConfig = {
  // HAPUS output: 'export' — kita butuh API routes untuk AI EdgeOne
  images: {
    unoptimized: true
  }
}

module.exports = nextConfig
