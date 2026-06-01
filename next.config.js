/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            // Firebase signInWithPopup polls window.closed on the OAuth popup.
            // Next.js 14 dev server emits COOP: same-origin which blocks that access.
            // same-origin-allow-popups retains cross-origin isolation while allowing
            // the opener to keep a reference to popups it opened.
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
        pathname: '/t/p/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['xlsx'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Force Firebase to resolve its browser-compatible build instead of the
      // Node.js (node-esm) build which depends on undici using ES2022 private class
      // fields syntax that Next.js 14 webpack cannot parse.
      config.resolve.conditionNames = ['browser', 'import', 'require', 'default']
    }
    return config
  },
}

module.exports = nextConfig
