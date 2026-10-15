import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { setSelectedReleaseId } from '../store/filtersSlice'
import { fetchTaskEvents, fetchTasksByVersion, computeCompletedTasks, averageDays } from '../lib/queries/delivery'
import { fetchReleasesWithProject } from '../lib/queries/releases'
import { fetchBudgetBaseline, fetchDevHours } from '../lib/queries/budget'
import InfoTooltip from '../components/InfoTooltip'
import TaskDrawer from '../components/TaskDrawer'

const fmt$ = (n) =>
  n == null
    ? '—'
    : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10)

/* ── Stat card ── */
function StatCard({ label, value, sub, accent, warn, tooltip, onClick }) {
  const interactive = !!onClick
  return (
    <div
      className={[
        'rounded-lg border p-5 bg-white transition-all',
        warn ? 'border-amber-300' : 'border-slate-200',
        interactive
          ? 'cursor-pointer hover:border-[#1F3864] hover:shadow-md hover:bg-slate-50 active:scale-[0.98]'
          : '',
      ].join(' ')}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1">
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </p>
      <p className={`text-3xl font-bold mt-2 ${accent ?? 'text-slate-900'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      {interactive && (
        <p className="mt-3 text-xs font-medium text-[#1F3864] flex items-center gap-1">
          View tasks <span className="text-sm">→</span>
        </p>
      )}
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
  const dispatch = useDispatch()
  const selectedReleaseId = useSelector((state) => state.filters.selectedReleaseId)

  const [loading, setLoading] = useState(true)
  const [budgetLoading, setBudgetLoading] = useState(false)
  const [error, setError] = useState(null)

  // Data
  const [releases, setReleases] = useState([])
  const [completedTasks, setCompletedTasks] = useState([])
  const [allEvents, setAllEvents] = useState([])
  const [allVersionTasks, setAllVersionTasks] = useState([])
  const [baseline, setBaseline] = useState([])
  const [devHours, setDevHours] = useState([])

  // Drawer
  const [drawer, setDrawer] = useState({ open: false, title: '', taskIds: [], accent: '' })

  // Load releases + delivery events on mount
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

        // Default to most recent release only if no preference is saved
        if (relList.length > 0 && !selectedReleaseId) {
          dispatch(setSelectedReleaseId(relList[0].id))
        }
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Re-fetch budget data whenever selected release changes
  useEffect(() => {
    if (!selectedReleaseId) return
    const selected = releases.find((r) => r.id === selectedReleaseId)
    if (!selected) return

    async function loadBudget() {
      setBudgetLoading(true)
      try {
        const [{ data: b }, { data: w }, versionTasks] = await Promise.all([
          fetchBudgetBaseline(selected.id),
          fetchDevHours(selected.version_name ?? null),
          fetchTasksByVersion(selected.version_name ?? null),
        ])
        setBaseline(b ?? [])
        setDevHours(w ?? [])
        setAllVersionTasks(versionTasks)
      } catch (e) {
        setError(e.message)
      } finally {
        setBudgetLoading(false)
      }
    }
    loadBudget()
  }, [selectedReleaseId, releases])

  /* ── Derived metrics ── */
  const selectedRelease = releases.find((r) => r.id === selectedReleaseId) ?? releases[0]
  const selectedVersion = selectedRelease?.version_name ?? null

  // Delivery metrics — scoped to selected release version
  const filteredCompleted = selectedVersion
    ? completedTasks.filter((t) => t.productVersion === selectedVersion)
    : completedTasks

  const avgLeadTime = round1(averageDays(filteredCompleted.map((t) => t.leadTimeDays)))
  const avgCycleTime = round1(averageDays(filteredCompleted.map((t) => t.cycleTimeDays)))

  // Build latest-status map per task from allEvents (sorted asc, so last wins)
  const latestStatusByTaskId = {}
  for (const e of allEvents) {
    if (!selectedVersion || e.tasks?.product_version === selectedVersion) {
      latestStatusByTaskId[e.task_id] = (e.status ?? '').trim().toLowerCase()
    }
  }

  const NOT_STARTED_STATUS = 'not started'
  const DONE_STATUS = 'done'

  const completedIdsInVersion = new Set(filteredCompleted.map((t) => t.id))

  // In Flight — has events, latest status is not "not started" and not "done"
  const inFlightIds = Object.entries(latestStatusByTaskId)
    .filter(([, status]) => status !== NOT_STARTED_STATUS && status !== DONE_STATUS)
    .map(([id]) => Number(id))

  const inFlight = inFlightIds.length
  const deliveredIds = filteredCompleted.map((t) => t.id)

  // Not Started — no events OR latest event status is "not started"
  const tasksWithNotStartedEvent = new Set(
    Object.entries(latestStatusByTaskId)
      .filter(([, status]) => status === NOT_STARTED_STATUS)
      .map(([id]) => Number(id))
  )
  const allTaskIdsWithEvents = new Set(Object.keys(latestStatusByTaskId).map(Number))
  const notStartedIds = allVersionTasks
    .filter((t) => !allTaskIdsWithEvents.has(t.id) || tasksWithNotStartedEvent.has(t.id))
    .map((t) => t.id)

  // Budget burn for selected release — actual hours from dev_hours_by_epic view
  const releaseBudget = baseline.reduce((s, r) => s + Number(r.budgeted_cost ?? 0), 0)
  const releaseActual = baseline.reduce((acc, row) => {
    const devRows = devHours.filter((w) => w.resource === row.resource)
    const actualHours = devRows.reduce((s, w) => s + Number(w.hours_logged ?? 0), 0)
    return acc + actualHours * Number(row.hourly_rate ?? 0)
  }, 0)
  const burnPct = releaseBudget > 0 ? Math.round((releaseActual / releaseBudget) * 100) : null

  // Release on-time check (for selected release card)
  const isLate =
    selectedRelease?.planned_delivery_date &&
    !selectedRelease?.delivery_date &&
    new Date(selectedRelease.planned_delivery_date) < new Date()

  return (
    <div>
      {/* ── Page header with release filter ── */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Program overview across delivery, budget, and releases</p>
        </div>

        {/* Release version filter */}
        {releases.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <label htmlFor="release-filter" className="text-sm font-medium text-slate-600 whitespace-nowrap">
              Release Version
            </label>
            <select
              id="release-filter"
              value={selectedReleaseId ?? ''}
              onChange={(e) => dispatch(setSelectedReleaseId(Number(e.target.value)))}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {releases.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.version_name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="py-20 text-center text-sm text-slate-400">Loading…</div>
      ) : (
        <>
          {/* ── Delivery KPIs — scoped to selected release ── */}
          <SectionHeading title={`Delivery — ${selectedRelease?.version_name ?? '—'}`} />

          {/* Metrics row */}
          <div className="grid grid-cols-2 gap-4 mb-3">
            <StatCard
              label="Avg Lead Time"
              value={avgLeadTime != null ? `${avgLeadTime}d` : '—'}
              sub="task created → done"
              tooltip="Lead Time measures the total elapsed time from when a task is created to when it reaches Done. Includes any time the task spent waiting before work began."
            />
            <StatCard
              label="Avg Cycle Time"
              value={avgCycleTime != null ? `${avgCycleTime}d` : '—'}
              sub="in progress → done"
              tooltip="Cycle Time measures only the active work period — from when a task moves to In Progress until it reaches Done. A proxy for team execution speed."
            />
          </div>

          {/* Task-state pipeline row — all three clickable */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <StatCard
              label="Not Started"
              value={notStartedIds.length}
              sub="no activity yet"
              accent="text-slate-500"
              onClick={() => setDrawer({ open: true, title: 'Not Started', taskIds: notStartedIds, accent: 'text-slate-600' })}
            />
            <StatCard
              label="In Flight"
              value={inFlight}
              sub="started, not yet done"
              accent="text-blue-600"
              onClick={() => setDrawer({ open: true, title: 'In Flight', taskIds: inFlightIds, accent: 'text-blue-600' })}
            />
            <StatCard
              label="Delivered"
              value={filteredCompleted.length}
              sub="reached Done status"
              accent="text-emerald-600"
              onClick={() => setDrawer({ open: true, title: 'Delivered', taskIds: deliveredIds, accent: 'text-emerald-600' })}
            />
          </div>

          {/* ── Budget KPIs — scoped to selected release ── */}
          <SectionHeading title={`Budget — ${selectedRelease?.version_name ?? '—'}`} />
          {budgetLoading ? (
            <div className="mb-8 py-8 text-center text-sm text-slate-400">Loading budget…</div>
          ) : (
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
          )}

          {/* ── Selected release card ── */}
          {selectedRelease && (
            <>
              <SectionHeading title={`Release — ${selectedRelease.version_name}`} />
              <div className="bg-white rounded-lg border border-slate-200 p-5 mb-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-lg font-semibold text-slate-900">{selectedRelease.version_name}</span>
                      <Badge status={selectedRelease.status} />
                      {isLate && (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700">
                          Overdue
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500">{selectedRelease.projects?.name ?? '—'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-slate-400">Planned delivery</p>
                    <p className={`text-sm font-medium ${isLate ? 'text-red-600' : 'text-slate-700'}`}>
                      {fmtDate(selectedRelease.planned_delivery_date)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-400">Start date</p>
                    <p className="text-slate-700 font-medium">{fmtDate(selectedRelease.start_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Team size</p>
                    <p className="text-slate-700 font-medium">{selectedRelease.team_size ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Change requests</p>
                    <p className="text-slate-700 font-medium">{selectedRelease.change_requests_count ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Bugs in QA</p>
                    <p className="text-slate-700 font-medium">{selectedRelease.bugs_in_qa ?? '—'}</p>
                  </div>
                </div>

                {releaseBudget > 0 && !budgetLoading && (
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
                        <tr
                          key={r.id}
                          className={`hover:bg-slate-50 cursor-pointer ${r.id === selectedReleaseId ? 'bg-blue-50' : ''}`}
                          onClick={() => dispatch(setSelectedReleaseId(r.id))}
                        >
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

      <TaskDrawer
        open={drawer.open}
        onClose={() => setDrawer((d) => ({ ...d, open: false }))}
        title={drawer.title}
        taskIds={drawer.taskIds}
        accent={drawer.accent}
      />
    </div>
  )
}
