import { useState } from 'react'
import { bulkAssignEpicToTasks } from '../../lib/queries/v2status'
import { supabase } from '../../lib/supabase'

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
  const cls = TASK_BADGE_CLS[(status ?? '').toLowerCase()] ?? 'bg-slate-100 text-slate-500'
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {status ?? 'Not started'}
    </span>
  )
}

function TaskRow({ task, epics, isAdmin, onAssigned, onDeleted }) {
  const [epicId, setEpicId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleAssign = async () => {
    if (!epicId) return
    setAssigning(true)
    await bulkAssignEpicToTasks([task.id], Number(epicId))
    setAssigning(false)
    setEpicId('')
    onAssigned?.()
  }

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${task.name}"? This cannot be undone.`)) return
    setDeleting(true)
    await supabase.from('task_events').delete().eq('task_id', task.id)
    await supabase.from('tasks').delete().eq('id', task.id)
    setDeleting(false)
    onDeleted?.()
  }

  return (
    <li className="flex flex-col gap-2 py-3 border-b border-slate-100 last:border-0">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-slate-800 leading-snug flex-1">{task.name}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <TaskStatusBadge status={task.status} />
          {isAdmin && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="text-[10px] text-slate-300 hover:text-red-500 disabled:opacity-40 transition-colors"
              title="Delete task"
            >
              {deleting ? '…' : '✕'}
            </button>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="flex items-center gap-2">
          <select
            value={epicId}
            onChange={(e) => setEpicId(e.target.value)}
            className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
          >
            <option value="">Move to epic…</option>
            {epics.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.name}{ep.milestones?.releases?.version_name ? ` · ${ep.milestones.releases.version_name}` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAssign}
            disabled={!epicId || assigning}
            className="rounded bg-[#1F3864] px-2.5 py-1 text-[10px] font-medium text-white hover:bg-[#162a4e] disabled:opacity-40"
          >
            {assigning ? '…' : 'Move'}
          </button>
        </div>
      )}
    </li>
  )
}

export default function MilestoneTaskPanel({ milestone, epics, isAdmin, onClose, onRefresh }) {
  if (!milestone) return null

  const { feature, pct, complete, total, tasks = [] } = milestone

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-base font-semibold text-slate-900">{feature}</p>
            <p className="mt-0.5 text-xs text-slate-400">{complete} of {total} tasks complete · {pct}%</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none mt-0.5"
          >
            &times;
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 w-full bg-slate-100">
          <div
            className={`h-1 transition-all duration-500 ${pct === 100 ? 'bg-emerald-500' : 'bg-[#1F3864]'}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {tasks.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No tasks in this milestone.</p>
          ) : (
            <ul>
              {tasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  epics={epics}
                  isAdmin={isAdmin}
                  onAssigned={onRefresh}
                  onDeleted={onRefresh}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
