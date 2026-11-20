import { useEffect, useState, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { setProductVersion } from '../store/filtersSlice'
import { getBacklogTasks, getProductVersionList, updateTaskSP, bulkAssignEpicToTasks } from '../lib/queries/v2status'
import { supabase } from '../lib/supabase'
import { useAuth } from '../components/AuthGuard'

const ADMIN_EMAIL = 'maria.salinas@puzzle.tech'

const FIBONACCI = [0, 1, 2, 3, 5, 8, 13, 21]

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

function StatusBadge({ status }) {
  const cls = TASK_BADGE_CLS[(status ?? '').toLowerCase()] ?? 'bg-slate-100 text-slate-500'
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {status ?? 'Not started'}
    </span>
  )
}

function SPCell({ taskId, field, value, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [localVal, setLocalVal] = useState(value ?? '')
  const [saving, setSaving] = useState(false)

  // Sync if prop changes (after refresh)
  useEffect(() => { setLocalVal(value ?? '') }, [value])

  const handleSave = async (newVal) => {
    setSaving(true)
    const payload = field === 'estimateSp'
      ? { estimateSp: newVal === '' ? null : Number(newVal), qaReviewSp: undefined }
      : { qaReviewSp: newVal === '' ? 0 : Number(newVal), estimateSp: undefined }
    await updateTaskSP(taskId, payload)
    setSaving(false)
    setEditing(false)
    onSaved?.()
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="min-w-[2.5rem] rounded px-1.5 py-0.5 text-xs text-slate-700 hover:bg-slate-100 transition-colors text-center"
        title="Click to edit"
      >
        {localVal !== '' ? `${localVal} SP` : <span className="text-slate-300">—</span>}
      </button>
    )
  }

  return (
    <select
      autoFocus
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={() => { if (!saving) handleSave(localVal) }}
      disabled={saving}
      className="rounded border border-[#00406C] bg-white px-1 py-0.5 text-xs text-slate-700 focus:outline-none"
    >
      <option value="">— SP</option>
      {FIBONACCI.map((n) => (
        <option key={n} value={n}>{n} SP</option>
      ))}
    </select>
  )
}

function DeleteCell({ taskId, taskName, isAdmin, onDeleted }) {
  const [deleting, setDeleting] = useState(false)

  if (!isAdmin) return null

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${taskName}"? This cannot be undone.`)) return
    setDeleting(true)
    await supabase.from('task_events').delete().eq('task_id', taskId)
    await supabase.from('tasks').delete().eq('id', taskId)
    setDeleting(false)
    onDeleted?.()
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="text-slate-300 hover:text-red-500 disabled:opacity-40 transition-colors text-xs"
      title="Delete task"
    >
      {deleting ? '…' : '✕'}
    </button>
  )
}

function EpicCell({ taskId, currentEpic, epics, onSaved }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleChange = async (e) => {
    const val = e.target.value
    if (!val) return
    setSaving(true)
    await bulkAssignEpicToTasks([taskId], Number(val))
    setSaving(false)
    setOpen(false)
    onSaved?.()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="max-w-[160px] truncate rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 transition-colors text-left"
        title={currentEpic ?? 'Assign epic'}
      >
        {currentEpic ?? <span className="text-slate-300">—</span>}
      </button>
    )
  }

  return (
    <select
      autoFocus
      defaultValue=""
      onChange={handleChange}
      onBlur={() => setOpen(false)}
      disabled={saving}
      className="rounded border border-[#00406C] bg-white px-1 py-0.5 text-xs text-slate-700 focus:outline-none max-w-[200px]"
    >
      <option value="">Move to epic…</option>
      {epics.map((ep) => (
        <option key={ep.id} value={ep.id}>
          {ep.name}{ep.milestone ? ` · ${ep.milestone}` : ''}
        </option>
      ))}
    </select>
  )
}

// ── Group helpers ──────────────────────────────────────────────────────────────

function groupTasks(tasks, groupBy) {
  if (groupBy === 'none') return [['All tasks', tasks]]

  const map = new Map()
  for (const t of tasks) {
    const key = groupBy === 'epic'
      ? (t.epic ?? '(No epic)')
      : (t.milestone ?? '(No milestone)')
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(t)
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Backlog() {
  const dispatch  = useDispatch()
  const activeVersion = useSelector((s) => s.filters.productVersion)
  const { user } = useAuth()
  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL

  const [tasks, setTasks]       = useState([])
  const [versions, setVersions] = useState([])
  const [epics, setEpics]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  // Filter + group controls
  const [filterMilestone, setFilterMilestone] = useState('')
  const [filterEpic, setFilterEpic]           = useState('')
  const [groupBy, setGroupBy]                 = useState('epic')   // 'none' | 'epic' | 'milestone'

  const load = async (version) => {
    if (!version) return
    setLoading(true)
    setError(null)
    try {
      const data = await getBacklogTasks({ productVersion: version })
      setTasks(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    getProductVersionList().then((list) => {
      setVersions(list)
      if (!activeVersion && list.length > 0) {
        dispatch(setProductVersion(list[list.length - 1]))
      }
    })
    // Load all epics for the epic mover
    supabase
      .from('epics')
      .select('id, name, milestones(name)')
      .order('name')
      .then(({ data }) => {
        setEpics((data ?? []).map((ep) => ({
          id: ep.id,
          name: ep.name,
          milestone: ep.milestones?.name ?? null,
        })))
      })
  }, [])

  useEffect(() => {
    load(activeVersion)
    setFilterMilestone('')
    setFilterEpic('')
  }, [activeVersion])

  // ── Derived filter options ─────────────────────────────────────────────────
  const allMilestones = useMemo(
    () => [...new Set(tasks.map((t) => t.milestone).filter(Boolean))].sort(),
    [tasks],
  )
  const allEpics = useMemo(() => {
    const src = filterMilestone
      ? tasks.filter((t) => t.milestone === filterMilestone)
      : tasks
    return [...new Set(src.map((t) => t.epic).filter(Boolean))].sort()
  }, [tasks, filterMilestone])

  // ── Filtered + grouped tasks ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filterMilestone && t.milestone !== filterMilestone) return false
      if (filterEpic      && t.epic      !== filterEpic)      return false
      return true
    })
  }, [tasks, filterMilestone, filterEpic])

  const grouped = useMemo(() => groupTasks(filtered, groupBy), [filtered, groupBy])

  const totalSP    = filtered.reduce((s, t) => s + (t.estimateSp ?? 0), 0)
  const totalQaSP  = filtered.reduce((s, t) => s + (t.qaReviewSp ?? 0), 0)

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#001828]">Backlog</h1>
          <p className="text-sm text-slate-500 mt-1">Story points &amp; task assignments per release</p>
        </div>
        <select
          value={activeVersion ?? ''}
          onChange={(e) => dispatch(setProductVersion(e.target.value))}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#00406C]"
        >
          {versions.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      {/* ── Filter + group bar ── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Milestone filter */}
        <select
          value={filterMilestone}
          onChange={(e) => { setFilterMilestone(e.target.value); setFilterEpic('') }}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#00406C]"
        >
          <option value="">All milestones</option>
          {allMilestones.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>

        {/* Epic filter */}
        <select
          value={filterEpic}
          onChange={(e) => setFilterEpic(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#00406C]"
        >
          <option value="">All epics</option>
          {allEpics.map((ep) => <option key={ep} value={ep}>{ep}</option>)}
        </select>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Group by */}
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Group by</span>
        <div className="flex gap-1">
          {[
            { value: 'none',      label: 'None'      },
            { value: 'epic',      label: 'Epic'      },
            { value: 'milestone', label: 'Milestone' },
          ].map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setGroupBy(value)}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
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

      {/* ── Summary strip ── */}
      {!loading && filtered.length > 0 && (
        <div className="flex gap-4 mb-4 text-xs text-slate-500">
          <span><span className="font-semibold text-slate-700">{filtered.length}</span> tasks</span>
          <span><span className="font-semibold text-slate-700">{totalSP}</span> dev SP</span>
          <span><span className="font-semibold text-slate-700">{totalQaSP}</span> QA SP</span>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="py-16 text-center text-sm text-slate-400">Loading {activeVersion ?? ''}…</div>
      )}

      {/* ── Empty ── */}
      {!loading && filtered.length === 0 && !error && (
        <div className="py-16 text-center text-sm text-slate-400">No tasks found for the selected filters.</div>
      )}

      {/* ── Tables ── */}
      {!loading && filtered.length > 0 && (
        <div className="flex flex-col gap-6">
          {grouped.map(([groupLabel, groupRows]) => (
            <div key={groupLabel} className="rounded-lg border border-slate-200 overflow-hidden">
              {/* Group label header */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-[#00406C]">
                <span className="text-xs font-semibold text-white">{groupLabel}</span>
                <span className="text-xs text-white/60">({groupRows.length})</span>
                <span className="ml-auto text-xs text-white/60">
                  {groupRows.reduce((s, t) => s + (t.estimateSp ?? 0), 0)} dev SP ·{' '}
                  {groupRows.reduce((s, t) => s + (t.qaReviewSp ?? 0), 0)} QA SP
                </span>
              </div>

              {/* Per-group table with its own header */}
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-slate-400 uppercase tracking-wide w-[35%]">Task</th>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-slate-400 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-slate-400 uppercase tracking-wide">Engineer</th>
                    {groupBy !== 'milestone' && (
                      <th className="px-4 py-2 text-left text-[11px] font-medium text-slate-400 uppercase tracking-wide">Milestone</th>
                    )}
                    {groupBy !== 'epic' && (
                      <th className="px-4 py-2 text-left text-[11px] font-medium text-slate-400 uppercase tracking-wide">Epic</th>
                    )}
                    <th className="px-4 py-2 text-center text-[11px] font-medium text-slate-400 uppercase tracking-wide">Dev SP</th>
                    <th className="px-4 py-2 text-center text-[11px] font-medium text-slate-400 uppercase tracking-wide">QA SP</th>
                    {isAdmin && <th className="px-4 py-2 w-8" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {groupRows.map((task) => (
                    <tr key={task.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-2.5 text-xs font-medium text-[#001828] leading-snug">{task.name}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={task.status} />
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{task.engineerFirst ?? '—'}</td>
                      {groupBy !== 'milestone' && (
                        <td className="px-4 py-2.5 text-xs text-slate-500">{task.milestone ?? '—'}</td>
                      )}
                      {groupBy !== 'epic' && (
                        <td className="px-4 py-2.5">
                          <EpicCell
                            taskId={task.id}
                            currentEpic={task.epic}
                            epics={epics}
                            onSaved={() => load(activeVersion)}
                          />
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-center">
                        <SPCell
                          taskId={task.id}
                          field="estimateSp"
                          value={task.estimateSp}
                          onSaved={() => load(activeVersion)}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <SPCell
                          taskId={task.id}
                          field="qaReviewSp"
                          value={task.qaReviewSp}
                          onSaved={() => load(activeVersion)}
                        />
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-2.5 text-center">
                          <DeleteCell
                            taskId={task.id}
                            taskName={task.name}
                            isAdmin={isAdmin}
                            onDeleted={() => load(activeVersion)}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
