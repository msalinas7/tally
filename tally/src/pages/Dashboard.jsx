import { useEffect, useState } from 'react'
import { fetchTaskEvents, computeCompletedTasks, averageDays } from '../lib/queries/delivery'
import { fetchReleasesWithProject } from '../lib/queries/releases'
import { fetchBudgetBaseline, fetchDevHours } from '../lib/queries/budget'

const fmt$ = (n) =>
  n == null
    ? '—'
    : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10)

/* ── Stat card ── */
function StatCard({ label, value, sub, accent, warn }) {
  return (
    <div className={`rounded-lg border p-5 bg-white ${warn ? 'border-amber-300' : 'border-slate-200'}`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold mt-2 ${accent ?? 'text-slate-900'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

/* ── Section heading ── */
function SectionHeading({ title }) {
  return <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">{title}</h2>
}

/* ── Badge ── */
const STATUS_COLORS = {
  Planning:      'bg-slate-100 text-slate-600',
  'In Progress': 'bg-blue-100 text-blue-700',
  Released:      'bg-emerald-100 text-emerald-700',
  'On Hold':     'bg-amber-100 text-amber-700',
  Cancelled:     'bg-red-100 text-red-600',
}
function Badge({ status }) {
  const cls = STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status ?? '—'}
    </span>
  )
}

/* ── Burn bar ── */
function BurnBar({ pct }) {
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-emerald-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs text-slate-500 w-8 text-right">{pct}%</span>
    </div>
  )
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Data
  const [releases, setReleases] = useState([])
  const [completedTasks, setCompletedTasks] = useState([])
  const [allEvents, setAllEvents] = useState([])
  const [baseline, setBaseline] = useState([])
  const [wrike, setWrike] = useState([])

  useEffect(() => {
    async function load() {
      try {
        const [{ data: rel, error: re }, events] = await Promise.all([
          fetchReleasesWithProject(),
          fetchTaskEvents(),
        ])
        if (re) throw new Error(re.message)

        const relList = rel ?? []
        setReleases(relList)
        setAllEvents(events)
        setCompletedTasks(computeCompletedTasks(events))

        // Load budget for the most recent release
        const latest = relList[0] // already ordered desc by id
        if (latest) {
          const [{ data: b }, { data: w }] = await Promise.all([
            fetchBudgetBaseline(latest.id),
            fetchDevHours(latest?.version_name ?? null),
          ])
          setBaseline(b ?? [])
          setWrike(w ?? []) // dev hours rows from task_events
        }
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  /* ── Derived metrics ── */
  const activeRelease = releases.find((r) => r.status === 'In Progress') ?? releases[0]

  // Budget burn for active release — actual hours from dev_hours_by_epic view
  const releaseBudget = baseline.reduce((s, r) => s + Number(r.budgeted_cost ?? 0), 0)
  const releaseActual = baseline.reduce((acc, row) => {
    const devRows = wrike.filter((w) => w.resource === row.resource)
    const actualHours = devRows.reduce((s, w) => s + Number(w.hours_logged ?? 0), 0)
    return acc + actualHours * Number(row.hourly_rate ?? 0)
  }, 0)
  const burnPct = releaseBudget > 0 ? Math.round((releaseActual / releaseBudget) * 100) : null

  // Delivery metrics — all time
  const avgLeadTime = round1(averageDays(completedTasks.map((t) => t.leadTimeDays)))
  const avgCycleTime = round1(averageDays(completedTasks.map((t) => t.cycleTimeDays)))

  // Tasks in flight (have events but no Done)
  const taskIdsWithDone = new Set(completedTasks.map((t) => t.id))
  const allTaskIds = new Set(allEvents.map((e) => e.task_id))
  const inFlight = [...allTaskIds].filter((id) => !taskIdsWithDone.has(id)).length

  // Release on-time check
  const isLate =
    activeRelease?.planned_delivery_date &&
    !activeRelease?.delivery_date &&
    new Date(activeRelease.planned_delivery_date) < new Date()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Program overview across delivery, budget, and releases</p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="py-20 text-center text-sm text-slate-400">Loading…</div>
      ) : (
        <>
          {/* ── Delivery KPIs ── */}
          <SectionHeading title="Delivery" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Avg Lead Time"
              value={avgLeadTime != null ? `${avgLeadTime}d` : '—'}
              sub="task created → done"
            />
            <StatCard
              label="Avg Cycle Time"
              value={avgCycleTime != null ? `${avgCycleTime}d` : '—'}
              sub="in progress → done"
            />
            <StatCard
              label="Tasks Delivered"
              value={completedTasks.length}
              sub="reached Done status"
              accent="text-emerald-600"
            />
            <StatCard
              label="In Flight"
              value={inFlight}
              sub="started, not yet done"
              accent={inFlight > 0 ? 'text-blue-600' : 'text-slate-900'}
            />
          </div>

          {/* ── Budget KPIs ── */}
          <SectionHeading title={`Budget — ${activeRelease?.version_name ?? 'Latest Release'}`} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard label="Total Budgeted" value={fmt$(releaseBudget || null)} />
            <StatCard label="Total Actual" value={fmt$(releaseActual || null)} />
            <StatCard
              label="Remaining"
              value={releaseBudget ? fmt$(releaseBudget - releaseActual) : '—'}
              warn={releaseBudget > 0 && releaseActual > releaseBudget}
            />
            <StatCard
              label="Burn %"
              value={burnPct != null ? `${burnPct}%` : '—'}
              sub="of baseline budget"
              warn={burnPct != null && burnPct >= 90}
            />
          </div>

          {/* ── Active release card ── */}
          {activeRelease && (
            <>
              <SectionHeading title="Active Release" />
              <div className="bg-white rounded-lg border border-slate-200 p-5 mb-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-lg font-semibold text-slate-900">{activeRelease.version_name}</span>
                      <Badge status={activeRelease.status} />
                      {isLate && (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700">
                          Overdue
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500">{activeRelease.projects?.name ?? '—'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-slate-400">Planned delivery</p>
                    <p className={`text-sm font-medium ${isLate ? 'text-red-600' : 'text-slate-700'}`}>
                      {fmtDate(activeRelease.planned_delivery_date)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-400">Start date</p>
                    <p className="text-slate-700 font-medium">{fmtDate(activeRelease.start_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Team size</p>
                    <p className="text-slate-700 font-medium">{activeRelease.team_size ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Change requests</p>
                    <p className="text-slate-700 font-medium">{activeRelease.change_requests_count ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Bugs in QA</p>
                    <p className="text-slate-700 font-medium">{activeRelease.bugs_in_qa ?? '—'}</p>
                  </div>
                </div>

                {releaseBudget > 0 && (
                  <div className="mt-4">
                    <p className="text-xs text-slate-400 mb-1">Budget burn</p>
                    <BurnBar pct={burnPct ?? 0} />
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Release history summary ── */}
          {releases.length > 0 && (
            <>
              <SectionHeading title="All Releases" />
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['Version', 'Project', 'Status', 'Planned Delivery', 'Actual Delivery', 'Budget', 'Actual', 'Escaped'].map(
                        (h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {releases.map((r) => {
                      const late =
                        r.planned_delivery_date &&
                        !r.delivery_date &&
                        new Date(r.planned_delivery_date) < new Date()
                      return (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-900">{r.version_name}</td>
                          <td className="px-4 py-3 text-slate-500">{r.projects?.name ?? '—'}</td>
                          <td className="px-4 py-3"><Badge status={r.status} /></td>
                          <td className={`px-4 py-3 ${late ? 'text-red-600 font-medium' : 'text-slate-600'}`}>
                            {fmtDate(r.planned_delivery_date)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{fmtDate(r.delivery_date)}</td>
                          <td className="px-4 py-3 text-slate-600">{fmt$(r.budgeted_cost)}</td>
                          <td className="px-4 py-3 text-slate-600">{fmt$(r.actual_cost)}</td>
                          <td className="px-4 py-3 text-slate-600">{r.escaped_defects ?? '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
