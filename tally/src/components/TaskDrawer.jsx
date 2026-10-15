import { useEffect, useRef, useState } from 'react'
import { fetchTasksWithHierarchy } from '../lib/queries/delivery'

const UNASSIGNED = '__unassigned__'

const STATUS_STYLES = {
  'In progress':              { bg: 'bg-blue-100',   text: 'text-blue-700' },
  'In Code Review':           { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  'Merged - Ready for Build': { bg: 'bg-cyan-100',   text: 'text-cyan-700' },
  'Ready For QA':             { bg: 'bg-violet-100', text: 'text-violet-700' },
  'In QA Review':             { bg: 'bg-purple-100', text: 'text-purple-700' },
  'QA Approved':              { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  'QA Rejected':              { bg: 'bg-red-100',    text: 'text-red-700' },
  'Blocked':                  { bg: 'bg-orange-100', text: 'text-orange-700' },
  'Not Started':                  { bg: 'bg-gray-100', text: 'text-gray-700' },
}

function elapsedLabel(since) {
  if (!since) return null
  const ms = Date.now() - new Date(since).getTime()
  const hours = ms / (1000 * 60 * 60)
  if (hours < 24) return `${Math.round(hours)}h`
  return `${Math.round(hours / 24)}d`
}

function StatusBadge({ status, since }) {
  const style = STATUS_STYLES[status]
  if (!style) return null
  const elapsed = elapsedLabel(since)
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}>
      {status}
      {elapsed && <span className="opacity-70">· {elapsed}</span>}
    </span>
  )
}

/**
 * Slide-over drawer that shows an epic → task breakdown.
 *
 * Props:
 *   open       boolean
 *   onClose    () => void
 *   title      string
 *   taskIds    number[]
 *   accent     string  Tailwind text color class for the count badge
 */
export default function TaskDrawer({ open, onClose, title, taskIds, accent = 'text-slate-900' }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open || taskIds.length === 0) {
      setTasks([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchTasksWithHierarchy(taskIds)
      .then((data) => { if (!cancelled) setTasks(data) })
      .catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [open, taskIds])

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const grouped = buildByEpic(tasks)

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/30 z-40 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />

      {/* Panel */}
      <aside
        className={`fixed top-0 right-0 h-full w-full max-w-lg bg-white shadow-xl z-50 flex flex-col transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <span className={`text-sm font-semibold ${accent}`}>{taskIds.length}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {loading && (
            <p className="text-sm text-slate-400 text-center py-10">Loading…</p>
          )}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-md px-4 py-3">{error}</p>
          )}
          {!loading && !error && grouped.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-10">No tasks found.</p>
          )}

          {!loading && !error && grouped.map(({ epic, milestone, tasks: epicTasks }) => (
            <div key={epic}>
              {/* Epic heading */}
              <div className="mb-2">
                <p className="text-xs font-semibold text-[#1F3864] uppercase tracking-wide">
                  {epic === UNASSIGNED ? 'No epic' : epic}
                </p>
                {milestone && milestone !== UNASSIGNED && (
                  <p className="text-[10px] text-slate-400 mt-0.5">{milestone}</p>
                )}
              </div>

              {/* Task list */}
              <div className="rounded-lg border border-slate-100 bg-slate-50 divide-y divide-slate-100">
                {epicTasks.map((t) => (
                  <div key={t.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5" />
                      <p className="text-sm text-slate-700 leading-snug">{t.task_name ?? 'Untitled'}</p>
                    </div>
                    <div className="shrink-0">
                      <StatusBadge status={t.latestStatus} since={t.latestStatusAt} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </>
  )
}

/* ── Helpers ── */

function buildByEpic(tasks) {
  // epic label → { milestone, tasks[] }
  const epicMap = new Map()

  for (const task of tasks) {
    const epic = task.epics?.name ?? UNASSIGNED
    const milestone = task.epics?.milestones?.name ?? UNASSIGNED

    if (!epicMap.has(epic)) epicMap.set(epic, { milestone, tasks: [] })
    epicMap.get(epic).tasks.push(task)
  }

  return [...epicMap.entries()]
    .sort(([a], [b]) => {
      if (a === UNASSIGNED) return 1
      if (b === UNASSIGNED) return -1
      return a.localeCompare(b)
    })
    .map(([epic, { milestone, tasks }]) => ({ epic, milestone, tasks }))
}
