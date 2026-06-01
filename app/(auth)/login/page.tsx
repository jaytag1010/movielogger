import { LoginForm } from '@/components/auth/LoginForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-cinema-darker flex flex-col items-center justify-center px-4">
      {/* Ambient blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-72 h-72 bg-blue-600/15 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-20 w-72 h-72 bg-purple-600/15 rounded-full blur-3xl" />
      </div>
      <div className="relative z-10 w-full">
        <LoginForm />
      </div>
    </div>
  )
}
