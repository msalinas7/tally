import { NavLink, Outlet } from 'react-router-dom'
import { signOut } from '../lib/auth'
import { useAuth } from './AuthGuard'

const navItems = [
  { to: '/release-status', label: 'Release Status' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/delivery', label: 'Delivery Metrics' },
  { to: '/budget', label: 'Budget Tracker' },
  { to: '/releases', label: 'Release Register' },
  { to: '/milestones', label: 'Milestones' },
  { to: '/epics', label: 'Epics' },
]

export default function Layout() {
  const { user } = useAuth()
  const email = user?.email ?? ''
  const avatarUrl = user?.user_metadata?.avatar_url

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed left-0 top-0 flex h-screen w-[240px] flex-col bg-[#1F3864] text-white">
        <div className="px-6 py-6">
          <p className="text-lg font-semibold tracking-wide">Tally</p>
          <p className="mt-1 text-xs text-white/60">Puzzle Tech</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  'rounded-md px-3 py-2 text-sm font-medium',
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/75 hover:bg-white/10 hover:text-white',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="ml-[240px] flex min-h-screen flex-col">
        <header className="flex h-16 items-center justify-end gap-3 border-b border-slate-200 bg-white px-6">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1F3864] text-xs font-medium text-white">
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
