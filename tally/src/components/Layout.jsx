import { NavLink, Outlet } from 'react-router-dom'
import { signOut } from '../lib/auth'
import { useAuth } from './AuthGuard'

const ADMIN_EMAIL = 'maria.salinas@puzzle.tech'

const navItems = [
  { to: '/release-status', label: 'Release Status' },
  { to: '/backlog', label: 'Backlog' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/delivery', label: 'Timeline' },
  { to: '/budget', label: 'Budget Tracker' },
  { to: '/releases', label: 'Release Register' },
  { to: '/milestones', label: 'Milestones' },
  { to: '/epics', label: 'Epics' },
  { to: '/planning',      label: 'Planning Config',    adminOnly: true },
  { to: '/dependencies',  label: 'Dependencies',       adminOnly: true },
]

export default function Layout() {
  const { user } = useAuth()
  const email = user?.email ?? ''
  const avatarUrl = user?.user_metadata?.avatar_url
  const isAdmin = email.toLowerCase() === ADMIN_EMAIL

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FCFCFC' }}>
      <aside className="fixed left-0 top-0 flex h-screen w-[240px] flex-col bg-[#00406C] text-white">
        {/* Brand wordmark */}
        <div className="px-6 py-6 border-b border-white/10">
          <p className="text-base font-semibold tracking-widest uppercase text-white">Tally</p>
          <p className="mt-0.5 text-[10px] font-medium tracking-wide text-[#29ABE0]">by Puzzle</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3 pt-3">
          {navItems.filter((item) => !item.adminOnly || isAdmin).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-[#29ABE0]/20 text-white border-l-2 border-[#29ABE0]'
                    : 'text-white/70 hover:bg-white/8 hover:text-white border-l-2 border-transparent',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        {/* Admin badge at bottom */}
        {isAdmin && (
          <div className="px-6 pb-5 pt-2">
            <span className="text-[9px] font-semibold uppercase tracking-widest text-[#29ABE0]/60">Admin</span>
          </div>
        )}
      </aside>

      <div className="ml-[240px] flex min-h-screen flex-col">
        <header className="flex h-14 items-center justify-end gap-3 border-b border-slate-200/60 bg-white px-6">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#00406C] text-xs font-medium text-white">
              {email.charAt(0).toUpperCase() || '?'}
            </div>
          )}
          <span className="text-sm text-slate-600">{email}</span>
          <button
            type="button"
            onClick={signOut}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Sign Out
          </button>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
