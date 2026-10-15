import { useEffect, useRef, useState } from 'react'
import { fetchTasksWithHierarchy } from '../lib/queries/delivery'

const UNASSIGNED = '__unassigned__'

/**
 * Slide-over drawer that shows a milestone → epic → task breakdown.
 *
 * Props:
 *   open       boolean
 *   onClose    () => void
 *   title      string  e.g. "In Flight" or "Delivered"
 *   taskIds    number[]  IDs to display
 *   accent     string  Tailwind text color class for the count badge
 */
export default function TaskDrawer({ open, onClose, title, taskIds, accent = 'text-slate-900' }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const overlayRef = useRef(null)

  // Fetch hierarchy whenever the drawer opens with a new set of IDs
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

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Group tasks by milestone → epic
  const grouped = buildHierarchy(tasks)

  return (
    <>
      {/* Backdrop */}
      <div
        ref={overlayRef}
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
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {loading && (
            <p className="text-sm text-slate-400 text-center py-10">Loading…</p>
          )}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-md px-4 py-3">{error}</p>
          )}
          {!loading && !error && grouped.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-10">No tasks found.</p>
          )}
          {!loading && !error && grouped.map(({ milestone, epics }) => (
            <div key={milestone}>
              {/* Milestone heading */}
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                {milestone === UNASSIGNED ? 'No milestone' : milestone}
              </h3>

              <div className="space-y-3">
                {epics.map(({ epic, tasks: epicTasks }) => (
                  <div key={epic} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    {/* Epic heading */}
                    <p className="text-xs font-semibold text-[#1F3864] mb-2">
                      {epic === UNASSIGNED ? 'No epic' : epic}
                    </p>

                    {/* Task list */}
                    <ul className="space-y-1">
                      {epicTasks.map((t) => (
                        <li key={t.id} className="text-sm text-slate-700 flex items-start gap-2">
                          <span className="mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5" />
                          {t.task_name ?? 'Untitled'}
                        </li>
                      ))}
                    </ul>
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

function buildHierarchy(tasks) {
  // milestone label → epic label → tasks[]
  const tree = new Map()

  for (const task of tasks) {
    const milestone = task.epics?.milestones?.name ?? UNASSIGNED
    const epic = task.epics?.name ?? UNASSIGNED

    if (!tree.has(milestone)) tree.set(milestone, new Map())
    const epicMap = tree.get(milestone)

    if (!epicMap.has(epic)) epicMap.set(epic, [])
    epicMap.get(epic).push(task)
  }

  // Sort: named milestones first, unassigned last
  return [...tree.entries()]
    .sort(([a], [b]) => {
      if (a === UNASSIGNED) return 1
      if (b === UNASSIGNED) return -1
      return a.localeCompare(b)
    })
    .map(([milestone, epicMap]) => ({
      milestone,
      epics: [...epicMap.entries()]
        .sort(([a], [b]) => {
          if (a === UNASSIGNED) return 1
          if (b === UNASSIGNED) return -1
          return a.localeCompare(b)
        })
        .map(([epic, tasks]) => ({ epic, tasks })),
    }))
}
