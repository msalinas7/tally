import { useState } from 'react'

const TASK_BADGE_CLS = {
  'done':                      'bg-[#8CC63F]/10 text-[#8CC63F]',
  'qa approved':               'bg-[#8CC63F]/10 text-[#8CC63F]',
  'in progress':               'bg-[#29ABE0]/10 text-[#29ABE0]',
  'in code review':            'bg-indigo-100 text-indigo-700',
  'merged - ready for build':  'bg-cyan-100 text-cyan-700',
  'ready for qa':              'bg-purple-100 text-purple-700',
  'in qa review':              'bg-purple-100 text-purple-700',
  'qa rejected':               'bg-red-100 text-red-600',
  'blocked':                   'bg-orange-100 text-orange-700',
  'not started':               'bg-slate-100 text-slate-500',
}

function TaskStatusBadge({ status }) {
  const cls = TASK_BADGE_CLS[(status ?? '').toLowerCase()] ?? 'bg-slate-100 text-slate-500'
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {status ?? 'Not started'}
    </span>
  )
}

function TaskRow({ task }) {
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <span className="text-xs font-medium text-slate-800 leading-snug flex-1">{task.name}</span>
      <TaskStatusBadge status={task.status} />
    </li>
  )
}

const STATUS_ORDER = [
  'In progress',
  'In Code Review',
  'Merged - Ready for Build',
  'Ready For QA',
  'In QA Review',
  'QA Rejected',
  'Blocked',
  'Not started',
  'Done',
  'QA Approved',
]

function groupTasksByStatus(tasks) {
  const map = new Map()
  for (const status of STATUS_ORDER) map.set(status, [])
  for (const t of tasks) {
    const key = STATUS_ORDER.includes(t.status) ? t.status : 'Not started'
    map.get(key).push(t)
  }
  return [...map.entries()].filter(([, list]) => list.length > 0)
}

function groupTasksByEpic(tasks) {
  const map = new Map()
  for (const t of tasks) {
    const key = t.epic ?? '(No epic)'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(t)
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
}

export default function MilestoneTaskPanel({ milestone, onClose }) {
  const [groupBy, setGroupBy] = useState('status')

  if (!milestone) return null

  const { feature, pct, complete, total, tasks = [] } = milestone
  const grouped = groupBy === 'epic' ? groupTasksByEpic(tasks) : groupTasksByStatus(tasks)

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-base font-semibold text-slate-900">{feature}</p>
            <p className="mt-0.5 text-xs text-slate-400">{complete} of {total} tasks complete · {pct}%</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none mt-0.5">
            &times;
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 w-full bg-slate-100">
          <div
            className={`h-1 transition-all duration-500 ${pct === 100 ? 'bg-[#8CC63F]' : 'bg-[#00406C]'}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Group-by control */}
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-2.5 bg-slate-50/50">
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Group by</span>
          <div className="flex gap-1">
            {[
              { value: 'status', label: 'Status' },
              { value: 'epic',   label: 'Epic'   },
            ].map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setGroupBy(value)}
                className={`rounded px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                  groupBy === value
                    ? 'bg-[#00406C] text-white'
                    : 'bg-white border border-slate-200 text-slate-500 hover:border-[#00406C] hover:text-[#00406C]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tasks.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No tasks in this milestone.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {grouped.map(([groupLabel, groupTasks]) => (
                <div key={groupLabel} className="rounded-lg border border-slate-200 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-[#00406C]">
                    <span className="text-[11px] font-semibold text-white">{groupLabel}</span>
                    <span className="text-[11px] text-white/60">({groupTasks.length})</span>
                  </div>
                  <ul className="divide-y divide-slate-100 bg-white px-3">
                    {groupTasks.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
