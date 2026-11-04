import { useEffect, useState, useMemo } from 'react'
import { fetchReleases } from '../lib/queries/budget'
import {
  fetchDependencies,
  insertDependency,
  deleteDependency,
  fetchReleaseItems,
} from '../lib/queries/dependencies'

// ── Constants ─────────────────────────────────────────────────────────────────

const DEP_TYPES = [
  { value: 'FS', label: 'FS', hint: 'Finish → Start' },
  { value: 'FF', label: 'FF', hint: 'Finish → Finish' },
  { value: 'SS', label: 'SS', hint: 'Start → Start' },
  { value: 'SF', label: 'SF', hint: 'Start → Finish' },
]

const KIND_LABELS  = { task: 'Task', epic: 'Epic', milestone: 'Milestone' }
const KIND_FILTERS = ['all', 'task', 'epic', 'milestone']

const KIND_BADGE = {
  task:      'bg-blue-100 text-blue-700',
  epic:      'bg-purple-100 text-purple-700',
  milestone: 'bg-amber-100 text-amber-700',
}

const DEP_BADGE = {
  FS: 'bg-slate-100 text-slate-700',
  FF: 'bg-indigo-100 text-indigo-700',
  SS: 'bg-cyan-100 text-cyan-700',
  SF: 'bg-orange-100 text-orange-700',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Badge({ cls, children }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {children}
    </span>
  )
}

function getItemName(item) {
  return item.task_name ?? item.name ?? '—'
}

// Flatten items into a unified list with kind attached
function buildItemList(items) {
  return [
    ...items.milestones.map((m) => ({ ...m, kind: 'milestone', label: m.name })),
    ...items.epics.map((e)      => ({ ...e, kind: 'epic',      label: e.name })),
    ...items.tasks.map((t)      => ({ ...t, kind: 'task',      label: t.task_name })),
  ]
}

// BFS cycle check
function wouldCreateCycle(predKind, predId, succKind, succId, existingDeps) {
  const visited = new Set()
  const queue = [{ kind: succKind, id: String(succId) }]
  while (queue.length) {
    const { kind, id } = queue.shift()
    const key = `${kind}:${id}`
    if (visited.has(key)) continue
    visited.add(key)
    if (kind === predKind && id === String(predId)) return true
    for (const d of existingDeps) {
      if (d.predecessor_kind === kind && String(d.predecessor_id) === id) {
        queue.push({ kind: d.successor_kind, id: String(d.successor_id) })
      }
    }
  }
  return false
}

// ── Item column ───────────────────────────────────────────────────────────────

function ItemColumn({ title, items, selectedId, selectedKind, onSelect, dragRole, onDragStart, onDrop, dropHighlight }) {
  const [kindFilter, setKindFilter] = useState('all')
  const [search, setSearch]         = useState('')

  const filtered = items.filter((item) => {
    const matchKind   = kindFilter === 'all' || item.kind === kindFilter
    const matchSearch = !search || item.label.toLowerCase().includes(search.toLowerCase())
    return matchKind && matchSearch
  })

  return (
    <div className="flex flex-col rounded-lg border border-slate-200 bg-white overflow-hidden" style={{ minWidth: 0 }}>
      {/* Column header */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{title}</p>
        {/* Kind filter tabs */}
        <div className="flex gap-1 mb-2">
          {KIND_FILTERS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKindFilter(k)}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                kindFilter === k
                  ? 'bg-[#1F3864] text-white'
                  : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
              }`}
            >
              {k === 'all' ? 'All' : KIND_LABELS[k]}
            </button>
          ))}
        </div>
        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="w-full rounded border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
        />
      </div>

      {/* Item list */}
      <div
        className={`flex-1 overflow-y-auto p-2 space-y-1 transition-colors ${
          dropHighlight ? 'bg-blue-50' : ''
        }`}
        style={{ maxHeight: 380 }}
        onDragOver={(e) => { e.preventDefault() }}
        onDrop={onDrop}
      >
        {filtered.length === 0 && (
          <p className="py-6 text-center text-xs text-slate-400">No items match</p>
        )}
        {filtered.map((item) => {
          const isSelected = selectedKind === item.kind && String(selectedId) === String(item.id)
          return (
            <div
              key={`${item.kind}:${item.id}`}
              draggable
              onDragStart={() => onDragStart({ kind: item.kind, id: item.id, label: item.label })}
              onClick={() => onSelect({ kind: item.kind, id: item.id, label: item.label })}
              className={`flex items-center gap-2 rounded-md px-3 py-2 cursor-grab select-none transition-colors ${
                isSelected
                  ? 'bg-[#1F3864] text-white'
                  : 'hover:bg-slate-100 text-slate-800'
              }`}
            >
              <span className={`shrink-0 ${isSelected ? '' : ''}`}>
                <Badge cls={isSelected ? 'bg-white/20 text-white' : KIND_BADGE[item.kind]}>
                  {KIND_LABELS[item.kind]}
                </Badge>
              </span>
              <span className="truncate text-xs font-medium">{item.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Dependency builder (center panel) ─────────────────────────────────────────

function DepTypeSelector({ value, onChange }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-2">
      <div className="h-8 w-px bg-slate-200" />
      <div className="flex flex-col gap-1.5">
        {DEP_TYPES.map((d) => (
          <button
            key={d.value}
            type="button"
            onClick={() => onChange(d.value)}
            title={d.hint}
            className={`w-12 rounded-md py-1.5 text-xs font-semibold transition-colors ${
              value === d.value
                ? 'bg-[#1F3864] text-white shadow'
                : `${DEP_BADGE[d.value]} hover:opacity-80`
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>
      <div className="text-[9px] text-slate-400 text-center leading-tight">
        {DEP_TYPES.find((d) => d.value === value)?.hint}
      </div>
      <div className="h-8 w-px bg-slate-200" />
    </div>
  )
}

// ── Dependency row ────────────────────────────────────────────────────────────

function DepRow({ dep, getName, onDelete }) {
  return (
    <tr className="hover:bg-slate-50/70">
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <Badge cls={KIND_BADGE[dep.predecessor_kind]}>{KIND_LABELS[dep.predecessor_kind]}</Badge>
          <span className="text-xs font-medium text-slate-800">
            {getName(dep.predecessor_kind, dep.predecessor_id)}
          </span>
        </div>
      </td>
      <td className="px-2 text-slate-300 text-lg">→</td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <Badge cls={KIND_BADGE[dep.successor_kind]}>{KIND_LABELS[dep.successor_kind]}</Badge>
          <span className="text-xs font-medium text-slate-800">
            {getName(dep.successor_kind, dep.successor_id)}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge cls={DEP_BADGE[dep.dependency_type]}>{dep.dependency_type}</Badge>
        <p className="mt-0.5 text-[10px] text-slate-400">
          {DEP_TYPES.find((t) => t.value === dep.dependency_type)?.hint}
        </p>
      </td>
      <td className="px-4 py-3 tabular-nums text-xs text-slate-500">
        {dep.lag_days > 0 ? `+${dep.lag_days}d` : dep.lag_days < 0 ? `${dep.lag_days}d` : '—'}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={() => onDelete(dep.id)}
          className="text-xs text-red-400 hover:text-red-600 hover:underline"
        >
          Remove
        </button>
      </td>
    </tr>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DependencyManager() {
  const [releases,        setReleases]        = useState([])
  const [selectedRelease, setSelectedRelease] = useState(null)
  const [items,           setItems]           = useState({ milestones: [], epics: [], tasks: [] })
  const [deps,            setDeps]            = useState([])
  const [loading,         setLoading]         = useState(true)

  // Builder state
  const [predecessor,  setPredecessor]  = useState(null)   // { kind, id, label }
  const [successor,    setSuccessor]    = useState(null)
  const [depType,      setDepType]      = useState('FS')
  const [lagDays,      setLagDays]      = useState(0)
  const [dragging,     setDragging]     = useState(null)   // item being dragged
  const [dropTarget,   setDropTarget]   = useState(null)   // 'left' | 'right'
  const [saving,       setSaving]       = useState(false)
  const [flashError,   setFlashError]   = useState('')

  const allItems = useMemo(() => buildItemList(items), [items])

  const nameMap = useMemo(() => {
    const m = {}
    allItems.forEach((i) => { m[`${i.kind}:${i.id}`] = i.label })
    return m
  }, [allItems])

  const getName = (kind, id) => nameMap[`${kind}:${id}`] ?? `${KIND_LABELS[kind]} #${id}`

  const loadDeps = async () => {
    const { data } = await fetchDependencies()
    setDeps(data ?? [])
  }

  useEffect(() => {
    fetchReleases().then(({ data }) => {
      const list = data ?? []
      setReleases(list)
      if (list.length) setSelectedRelease(list[list.length - 1])
    })
  }, [])

  useEffect(() => {
    if (!selectedRelease) return
    setLoading(true)
    Promise.all([
      fetchReleaseItems(selectedRelease.id, selectedRelease.version_name),
      fetchDependencies(),
    ]).then(([releaseItems, { data: depData }]) => {
      setItems(releaseItems)
      setDeps(depData ?? [])
      setPredecessor(null)
      setSuccessor(null)
      setLoading(false)
    })
  }, [selectedRelease])

  // Deps scoped to this release
  const releaseItemKeys = useMemo(() => {
    const keys = new Set()
    allItems.forEach((i) => keys.add(`${i.kind}:${i.id}`))
    return keys
  }, [allItems])

  const visibleDeps = useMemo(() =>
    deps.filter((d) =>
      releaseItemKeys.has(`${d.predecessor_kind}:${d.predecessor_id}`) ||
      releaseItemKeys.has(`${d.successor_kind}:${d.successor_id}`)
    ),
  [deps, releaseItemKeys])

  // Drag handlers
  const handleDragStart = (item) => setDragging(item)

  const handleDropOnRight = () => {
    if (dragging) { setSuccessor(dragging); setDragging(null); setDropTarget(null) }
  }
  const handleDropOnLeft = () => {
    if (dragging) { setPredecessor(dragging); setDragging(null); setDropTarget(null) }
  }

  // Create dependency
  const handleCreate = async () => {
    if (!predecessor || !successor) {
      setFlashError('Select or drag a predecessor and a successor.')
      setTimeout(() => setFlashError(''), 3000)
      return
    }
    if (predecessor.kind === successor.kind && String(predecessor.id) === String(successor.id)) {
      setFlashError('An item cannot depend on itself.')
      setTimeout(() => setFlashError(''), 3000)
      return
    }
    if (wouldCreateCycle(predecessor.kind, predecessor.id, successor.kind, successor.id, deps)) {
      setFlashError('This would create a circular dependency.')
      setTimeout(() => setFlashError(''), 3000)
      return
    }
    setSaving(true)
    const { error } = await insertDependency({
      predecessor_kind: predecessor.kind,
      predecessor_id:   Number(predecessor.id),
      successor_kind:   successor.kind,
      successor_id:     Number(successor.id),
      dependency_type:  depType,
      lag_days:         Number(lagDays) || 0,
    })
    setSaving(false)
    if (error) { setFlashError(error.message); return }
    setPredecessor(null)
    setSuccessor(null)
    setLagDays(0)
    await loadDeps()
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this dependency?')) return
    await deleteDependency(id)
    await loadDeps()
  }

  const canCreate = predecessor && successor

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dependency Manager</h1>
          <p className="mt-1 text-sm text-slate-500">
            Drag items between columns or click to select, then define the relationship type.
          </p>
        </div>
        <select
          value={selectedRelease?.id ?? ''}
          onChange={(e) => setSelectedRelease(releases.find((r) => String(r.id) === e.target.value))}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
        >
          {releases.map((r) => <option key={r.id} value={r.id}>{r.version_name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : (
        <>
          {/* ── Builder ── */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">

            {/* Selection summary */}
            <div className="flex items-center gap-3 mb-4 min-h-[32px]">
              <div className={`flex-1 rounded-md border px-3 py-1.5 text-xs ${predecessor ? 'border-[#1F3864] bg-white text-slate-800 font-medium' : 'border-dashed border-slate-300 text-slate-400'}`}>
                {predecessor ? (
                  <span className="flex items-center gap-2">
                    <Badge cls={KIND_BADGE[predecessor.kind]}>{KIND_LABELS[predecessor.kind]}</Badge>
                    {predecessor.label}
                  </span>
                ) : 'No predecessor selected'}
              </div>
              <span className="text-slate-300 font-mono text-sm shrink-0">
                —[{depType}]→
              </span>
              <div className={`flex-1 rounded-md border px-3 py-1.5 text-xs ${successor ? 'border-[#1F3864] bg-white text-slate-800 font-medium' : 'border-dashed border-slate-300 text-slate-400'}`}>
                {successor ? (
                  <span className="flex items-center gap-2">
                    <Badge cls={KIND_BADGE[successor.kind]}>{KIND_LABELS[successor.kind]}</Badge>
                    {successor.label}
                  </span>
                ) : 'No successor selected'}
              </div>
            </div>

            {/* Three-column layout: left | middle | right */}
            <div className="grid gap-3" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
              {/* Left — Predecessor */}
              <ItemColumn
                title="Predecessor · runs first"
                items={allItems}
                selectedId={predecessor?.id}
                selectedKind={predecessor?.kind}
                onSelect={setPredecessor}
                onDragStart={handleDragStart}
                onDrop={handleDropOnLeft}
                dropHighlight={dropTarget === 'left' && !!dragging}
              />

              {/* Middle — dep type + lag */}
              <div className="flex flex-col items-center justify-center gap-3">
                <DepTypeSelector value={depType} onChange={setDepType} />
                <div className="flex flex-col items-center gap-1">
                  <label className="text-[10px] text-slate-400">Lag (days)</label>
                  <input
                    type="number"
                    value={lagDays}
                    onChange={(e) => setLagDays(e.target.value)}
                    className="w-14 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
                  />
                </div>
              </div>

              {/* Right — Successor */}
              <ItemColumn
                title="Successor · depends on predecessor"
                items={allItems}
                selectedId={successor?.id}
                selectedKind={successor?.kind}
                onSelect={setSuccessor}
                onDragStart={handleDragStart}
                onDrop={handleDropOnRight}
                dropHighlight={dropTarget === 'right' && !!dragging}
              />
            </div>

            {/* Create row */}
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={handleCreate}
                disabled={!canCreate || saving}
                className="rounded-md bg-[#1F3864] px-5 py-2 text-sm font-medium text-white hover:bg-[#162a4e] disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Create Dependency'}
              </button>
              {(predecessor || successor) && (
                <button
                  type="button"
                  onClick={() => { setPredecessor(null); setSuccessor(null); setLagDays(0) }}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Clear selection
                </button>
              )}
              {flashError && (
                <p className="text-xs text-red-500">{flashError}</p>
              )}
            </div>
          </div>

          {/* ── Existing dependencies table ── */}
          {visibleDeps.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-white py-12 text-center">
              <p className="text-sm font-medium text-slate-600">No dependencies yet for {selectedRelease?.version_name}</p>
              <p className="mt-1 text-xs text-slate-400">Use the builder above to create the first one.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Predecessor', '', 'Successor', 'Type', 'Lag', ''].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-xs font-medium text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleDeps.map((d) => (
                    <DepRow key={d.id} dep={d} getName={getName} onDelete={handleDelete} />
                  ))}
                </tbody>
              </table>
              <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
                {visibleDeps.length} dependenc{visibleDeps.length === 1 ? 'y' : 'ies'} · {selectedRelease?.version_name}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
