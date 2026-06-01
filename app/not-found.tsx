import Link from 'next/link'
import { Film } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-cinema-darker flex items-center justify-center px-4 text-center">
      <div>
        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
          <Film className="w-8 h-8 text-white/20" />
        </div>
        <h1 className="text-4xl font-bold text-white mb-2">404</h1>
        <p className="text-white/50 mb-6">Page not found</p>
        <Link
          href="/dashboard"
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  )
}
