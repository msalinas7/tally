import { useState, useRef } from 'react'
import { BUCKET_COLORS } from '../../lib/v2status/aggregations'
import { supabase } from '../../lib/supabase'

// ── Epic status badge ─────────────────────────────────────────────────────────

const BADGE_CLS = {
  'Ready for release': 'bg-emerald-100 text-emerald-700',
  'In progress':       'bg-blue-100 text-blue-700',
  'Blocked':           'bg-red-100 text-red-600',
  'Not started':       'bg-slate-100 text-slate-500',
}

function EpicStatusBadge({ status }) {
  const cls = BADGE_CLS[status] ?? BADGE_CLS['Not started']
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {status}
    </span>
  )
}

// ── Task status badge ─────────────────────────────────────────────────────────

const TASK_BADGE_CLS = {
  'done':                      'bg-emerald-100 text-emerald-700',
  'qa approved':               'bg-emerald-100 text-emerald-700',
  'in progress':               'bg-blue-100 text-blue-700',
  'in code review':            'bg-indigo-100 text-indigo-700',
  'merged - ready for build':  'bg-cyan-100 text-cyan-700',
  'ready for qa':              'bg-purple-100 text-purple-700',
  'in qa review':              'bg-purple-100 text-purple-700',
  'qa rejected':               'bg-red-100 text-red-600',
  'blocked':                   'bg-orange-100 text-orange-700',
  'not started':               'bg-slate-100 text-slate-500',
}

function TaskStatusBadge({ status }) {
  const key = (status ?? 'not started').toLowerCase()
  const cls = TASK_BADGE_CLS[key] ?? 'bg-slate-100 text-slate-500'
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {status ?? 'Not started'}
    </span>
  )
}

// ── Mini stacked bar ──────────────────────────────────────────────────────────

const BUCKET_ORDER = ['Complete', 'In QA', 'In development', 'Needs attention', 'Not started']

function MiniStackedBar({ buckets, total }) {
  if (total === 0) return null
  const segments = BUCKET_ORDER
    .map((b) => ({ bucket: b, count: buckets[b] ?? 0 }))
    .filter((s) => s.count > 0)

  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full">
      {segments.map(({ bucket, count }) => (
        <div
          key={bucket}
          title={`${bucket}: ${count}`}
          style={{
            width: `${(count / total) * 100}%`,
            background: BUCKET_COLORS[bucket],
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────────

const LEGEND = [
  { label: 'Complete',        color: BUCKET_COLORS.Complete },
  { label: 'In QA',          color: BUCKET_COLORS['In QA'] },
  { label: 'In development',  color: BUCKET_COLORS['In development'] },
  { label: 'Needs attention', color: BUCKET_COLORS['Needs attention'] },
  { label: 'Not started',    color: BUCKET_COLORS['Not started'], border: '#cbd5e1' },
]

function BarLegend() {
  return (
    <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5">
      {LEGEND.map(({ label, color, border }) => (
        <span key={label} className="flex items-center gap-1.5 text-xs text-slate-500">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ background: color, border: border ? `1px solid ${border}` : 'none' }}
          />
          {label}
        </span>
      ))}
    </div>
  )
}


// ── Single task row ───────────────────────────────────────────────────────────

function TaskRow({ task: t, isAdmin, isNoEpic, epics, onBulkAssign, deleting, onDelete }) {
  const [epicId, setEpicId] = useState('')
  const [assigning, setAssigning] = useState(false)

  const handleAssign = async () => {
    if (!epicId) return
    setAssigning(true)
    await onBulkAssign([t.id], Number(epicId))
    setAssigning(false)
  }

  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <span className="min-w-0 flex-1 truncate text-xs text-slate-700 pt-0.5" title={t.name}>
        {t.name}
      </span>
      <div className="flex shrink-0 items-center gap-2">
        {isAdmin && epics?.length > 0 && (
          <>
            <select
              value={epicId}
              onChange={(e) => setEpicId(e.target.value)}
              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
            >
              <option value="">Assign epic…</option>
              {epics.map((ep) => (
                <option key={ep.id} value={ep.id}>{ep.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAssign}
              disabled={!epicId || assigning}
              className="rounded bg-[#1F3864] px-2 py-0.5 text-[10px] font-medium text-white hover:bg-[#162a4e] disabled:opacity-40"
            >
              {assigning ? '…' : '✓'}
            </button>
          </>
        )}
        <TaskStatusBadge status={t.status} />
        {isAdmin && (
          <button
            type="button"
            onClick={() => onDelete(t.id, t.name)}
            disabled={deleting === t.id}
            className="text-[10px] text-slate-300 hover:text-red-500 disabled:opacity-40 transition-colors"
            title="Delete task"
          >
            {deleting === t.id ? '…' : '✕'}
          </button>
        )}
      </div>
    </li>
  )
}

// ── Task accordion panel ──────────────────────────────────────────────────────

function TaskList({ tasks, isAdmin, onTaskDeleted, epics, onBulkAssign, isNoEpic }) {
  const [deleting, setDeleting] = useState(null)

  const handleDelete = async (taskId, taskName) => {
    if (!window.confirm(`Delete "${taskName}"? This cannot be undone.`)) return
    setDeleting(taskId)
    await supabase.from('task_events').delete().eq('task_id', taskId)
    await supabase.from('tasks').delete().eq('id', taskId)
    setDeleting(null)
    onTaskDeleted?.()
  }

  return (
    <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2">
      {tasks.length === 0 ? (
        <p className="py-2 text-xs text-slate-400">No tasks in this epic.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              isAdmin={isAdmin}
              isNoEpic={isNoEpic}
              epics={epics}
              onBulkAssign={onBulkAssign}
              deleting={deleting}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EpicStatusList({ rows, isAdmin = false, onTaskDeleted, epics = [], onBulkAssign }) {
  const [openEpic, setOpenEpic] = useState(null)

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">No epics found.</p>
  }

  return (
    <>
      <BarLegend />
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {/* Column header */}
        <div className="grid grid-cols-[1fr_150px_70px_130px] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
          {['Epic', 'Status', 'Done', 'Distribution'].map((h) => (
            <span key={h} className="text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</span>
          ))}
        </div>

        {/* Rows */}
        {rows.map(({ epic, epicStatus, complete, total, buckets, tasks }, i) => {
          const isOpen = openEpic === epic
          return (
            <div key={epic}>
              {/* Epic row — clickable */}
              <button
                type="button"
                onClick={() => setOpenEpic(isOpen ? null : epic)}
                className={[
                  'grid w-full grid-cols-[1fr_150px_70px_130px] items-center gap-3 px-4 py-3 text-left',
                  i > 0 ? 'border-t border-slate-100' : '',
                  isOpen ? 'bg-slate-50' : 'hover:bg-slate-50/70',
                ].join(' ')}
              >
                {/* Name + chevron */}
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`shrink-0 text-slate-400 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
                    aria-hidden
                  >
                    ›
                  </span>
                  <p
                    className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-slate-800"
                    title={epic}
                  >
                    {epic}
                  </p>
                </div>

                {/* Badge */}
                <div><EpicStatusBadge status={epicStatus} /></div>

                {/* Count */}
                <span className="tabular-nums text-sm text-slate-600">{complete}/{total}</span>

                {/* Bar */}
                <MiniStackedBar buckets={buckets} total={total} />
              </button>

              {/* Accordion panel */}
              {isOpen && (
                <TaskList
                  tasks={tasks ?? []}
                  isAdmin={isAdmin}
                  onTaskDeleted={onTaskDeleted}
                  epics={epics}
                  onBulkAssign={onBulkAssign}
                  isNoEpic={epic === '(No epic)'}
                />
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
