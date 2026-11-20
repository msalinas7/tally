import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { signInWithGoogle, signOut } from '../lib/auth'

const ALLOWED_EMAIL_DOMAIN = '@puzzle.tech'

const AuthContext = createContext(null)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthGuard')
  }
  return context
}

const isPuzzleEmail = (email) =>
  typeof email === 'string' && email.toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN)

export default function AuthGuard({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [restricted, setRestricted] = useState(false)

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const email = nextSession?.user?.email

      if (nextSession && email && !isPuzzleEmail(email)) {
        setRestricted(true)
        setSession(null)
        signOut()
        setLoading(false)
        return
      }

      if (nextSession) {
        setRestricted(false)
      }

      setSession(nextSession)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Checking session…</p>
      </div>
    )
  }

  if (restricted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-center text-lg font-medium text-slate-800">
          Access restricted to Puzzle Tech accounts
        </p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: '#FCFCFC' }}>
        <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#29ABE0] mb-1">Puzzle</p>
          <h1 className="text-2xl font-semibold text-[#001828]">Tally</h1>
          <p className="mt-2 text-sm text-slate-500">
            Delivery, budget &amp; release dashboard
          </p>
          <button
            type="button"
            onClick={signInWithGoogle}
            className="mt-6 w-full rounded-md bg-[#00406C] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#003358] transition-colors"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ session, user: session.user }}>
      {children}
    </AuthContext.Provider>
  )
}
