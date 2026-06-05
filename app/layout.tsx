import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/components/auth/AuthProvider'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'MovieLogger — Cinematic Dashboard',
  description: 'Track movies and series with analytics, TMDB integration, and watch-time projections.',
  keywords: ['movies', 'series', 'tracking', 'letterboxd', 'analytics'],
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/logo.png', type: 'image/png' },
    ],
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#050508',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <AuthProvider>
          {children}
        </AuthProvider>
        <Toaster
          position="top-center"
          richColors
          toastOptions={{
            style: {
              background: '#0D0D1A',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.9)',
            },
          }}
        />
      </body>
    </html>
  )
}
