import { useEffect, useRef, useState, useMemo } from 'react'
import { fetchReleases, fetchPeople } from '../lib/queries/budget'
import { fetchProjectSettings } from '../lib/queries/planning'
import { fetchGanttData } from '../lib/queries/gantt'

// ── Visual constants ───────────────────────────────────────────────────────────
const COL_W      = 24   // px per calendar day
const ROW_H      = 36
const HEADER_H   = 52   // date header height (month row + day row)
const SIDEBAR_W  = 300  // left tree panel width

const MS_PALETTE = [
  '#1E40AF','#6D28D9','#065F46','#B45309','#9F1239','#1F3864','#0369A1',
]

const TASK_STATUS_COLOR = {
  'Done':        '#059669',
  'QA Approved': '#3B82F6',
  'In Progress': '#F59E0B',
  'Blocked':     '#EF4444',
  'Not Started': '#94A3B8',
}

const MS_STATUS_CLS = {
  'Done':        'bg-emerald-100 text-emerald-700',
  'QA Approved': 'bg-blue-100 text-blue-700',
  'In Progress': 'bg-amber-100 text-amber-700',
  'Not Started': 'bg-slate-100 text-slate-500',
}

const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Date / working-day helpers ─────────────────────────────────────────────────
function dateStr(d) { return d.toISOString().slice(0, 10) }

/**
 * Normalize working_days to a Set of JS getDay() integers (0=Sun … 6=Sat).
 * PlanningConfig stores integers 1-7 (1=Mon … 7=Sun).
 * Legacy string format ('Mon','Tue'…) is also handled.
 */
function normalizeWorkingDays(wd) {
  if (!wd?.length) return new Set([1, 2, 3, 4, 5]) // Mon–Fri default
  if (typeof wd[0] === 'string') {
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    return new Set(wd.map((d) => map[d] ?? -1).filter((d) => d >= 0))
  }
  // Integer format from PlanningConfig: 1=Mon…6=Sat, 7=Sun → JS: 1-6, 0
  return new Set(wd.map((d) => (d === 7 ? 0 : Number(d))))
}

function isWorkingDay(date, wdSet, blocked) {
  if (!wdSet.has(date.getDay())) return false
  return !blocked.has(dateStr(date))
}

function nextWorkingDay(date, wdSet, blocked) {
  let d = new Date(date)
  for (let i = 0; i < 400; i++) {   // safety: max ~1 year
    if (isWorkingDay(d, wdSet, blocked)) return d
    d = new Date(d.getTime() + 86400000)
  }
  return new Date(date)              // fallback: return original
}

function addWorkingDays(startDate, days, wdSet, blocked) {
  if (days <= 0) return new Date(startDate)
  let d = new Date(startDate)
  let counted = 0
  for (let guard = 0; guard < days * 7 + 14 && counted < days; guard++) {
    d = new Date(d.getTime() + 86400000)
    if (isWorkingDay(d, wdSet, blocked)) counted++
  }
  return d
}

function calendarDayOffset(base, target) {
  return Math.round((target.getTime() - base.getTime()) / 86400000)
}

// ── SP → hours helper ──────────────────────────────────────────────────────────
function spToHours(sp, spRanges, mode) {
  if (!sp || sp === 0) return 0
  const range = spRanges?.[String(sp)]
  if (!range) return sp * 4  // legacy fallback: 4 hrs/point
  const [min, max] = range
  if (mode === 'optimistic')   return min
  if (mode === 'pessimistic')  return max
  return (min + max) / 2       // expected (default)
}

// ── Scheduler ──────────────────────────────────────────────────────────────────
function buildSchedule({ settings, tasks, deps, holidays, epics, milestones, estMode = 'expected' }) {
  if (!settings?.start_date) return null

  const spRanges    = settings.sp_ranges ?? null
  const hoursPerDay = Number(settings.hours_per_day) || 8
  const wdSet       = normalizeWorkingDays(settings.working_days)
  const projectStart = new Date(settings.start_date + 'T00:00:00')

  // Build blocked-date sets
  const globalBlocked = new Set()
  const personBlocked = {}
  for (const h of holidays) {
    if (h.kind === 'holiday') globalBlocked.add(h.date)
    else if (h.kind === 'pto' && h.people_id) {
      if (!personBlocked[h.people_id]) personBlocked[h.people_id] = new Set()
      personBlocked[h.people_id].add(h.date)
    }
  }
  const getBlocked = (pid) => {
    if (!pid || !personBlocked[pid]) return globalBlocked
    const s = new Set(globalBlocked)
    personBlocked[pid].forEach((d) => s.add(d))
    return s
  }

  // Task dependency graph: successorId → [{ predId, type, lag }]
  const taskPreds = {}
  for (const d of deps) {
    if (d.predecessor_kind === 'task' && d.successor_kind === 'task') {
      if (!taskPreds[d.successor_id]) taskPreds[d.successor_id] = []
      taskPreds[d.successor_id].push({ predId: d.predecessor_id, type: d.dependency_type, lag: d.lag_days ?? 0 })
    }
  }

  const taskMap  = Object.fromEntries(tasks.map((t) => [t.id, t]))
  const computed = {}

  function computeTask(id, stack = new Set()) {
    if (computed[id]) return computed[id]
    if (stack.has(id)) return null
    stack = new Set(stack); stack.add(id)

    const task = taskMap[id]
    if (!task) return null

    const devHours = spToHours(task.estimate_sp ?? 0, spRanges, estMode)
    const qaHours  = spToHours(task.qa_review_sp ?? 0, spRanges, estMode)
    const durDays  = Math.max(1, Math.ceil((devHours + qaHours) / hoursPerDay))
    const blocked  = getBlocked(task.assigned_to_id)

    let earliest = new Date(projectStart)

    for (const { predId, type, lag } of (taskPreds[id] ?? [])) {
      const pred = computeTask(predId, stack)
      if (!pred) continue
      let candidate
      if (type === 'FS')      candidate = addWorkingDays(pred.end, (lag || 0) + 1, wdSet, blocked)
      else if (type === 'SS') candidate = addWorkingDays(pred.start, lag || 0, wdSet, blocked)
      else                    candidate = addWorkingDays(pred.end, (lag || 0) + 1, wdSet, blocked)
      if (candidate > earliest) earliest = candidate
    }

    const start = nextWorkingDay(earliest, wdSet, blocked)
    const end   = addWorkingDays(start, durDays - 1, wdSet, blocked)
    computed[id] = { start, end, durationDays: durDays }
    return computed[id]
  }

  for (const t of tasks) computeTask(t.id)

  // Roll up to epics
  const epicComputed = {}
  for (const epic of epics) {
    const pts = tasks.filter((t) => t.epic_id === epic.id).map((t) => computed[t.id]).filter(Boolean)
    if (!pts.length) continue
    epicComputed[epic.id] = {
      start: new Date(Math.min(...pts.map((t) => t.start))),
      end:   new Date(Math.max(...pts.map((t) => t.end))),
    }
  }

  // Roll up to milestones
  const msComputed = {}
  for (const ms of milestones) {
    const pts = epics.filter((e) => e.milestone_id === ms.id).map((e) => epicComputed[e.id]).filter(Boolean)
    if (!pts.length) continue
    msComputed[ms.id] = {
      start: new Date(Math.min(...pts.map((e) => e.start))),
      end:   new Date(Math.max(...pts.map((e) => e.end))),
    }
  }

  return { computed, epicComputed, msComputed, projectStart, wdSet, globalBlocked }
}

// ── Build visible row list ─────────────────────────────────────────────────────
function buildRows({ milestones, epics, tasks, schedule, expandedMs, expandedEpics, filterPid, peopleMap }) {
  if (!schedule) return []
  const { computed, epicComputed, msComputed } = schedule
  const rows = []

  // Track which epics have been placed (some may not belong to any release milestone)
  const placedEpicIds = new Set()

  const addEpicRows = (epic, msColor) => {
    placedEpicIds.add(epic.id)
    const epicDates = epicComputed[epic.id]
    rows.push({ type: 'epic', id: epic.id, item: epic, dates: epicDates, color: msColor, depth: 1 })

    if (!expandedEpics.has(epic.id)) return

    const epicTasks = tasks
      .filter((t) => t.epic_id === epic.id)
      .filter((t) => !filterPid || t.assigned_to_id === filterPid)
      .sort((a, b) => {
        const sa = computed[a.id]?.start ?? new Date(0)
        const sb = computed[b.id]?.start ?? new Date(0)
        return sa - sb
      })

    epicTasks.forEach((task) => {
      const taskDates = computed[task.id]
      const assignee  = task.assigned_to_id ? peopleMap[task.assigned_to_id] : null
      rows.push({ type: 'task', id: task.id, item: task, dates: taskDates, color: msColor, depth: 2, assignee })
    })
  }

  // ── Milestones (sorted by computed start) ──
  const milestoneIds = new Set(milestones.map((m) => m.id))
  const sortedMs = [...milestones].sort((a, b) => {
    const sa = msComputed[a.id]?.start ?? new Date(0)
    const sb = msComputed[b.id]?.start ?? new Date(0)
    return sa - sb
  })

  sortedMs.forEach((ms, msIdx) => {
    const msDates = msComputed[ms.id]
    const msColor = MS_PALETTE[msIdx % MS_PALETTE.length]
    rows.push({ type: 'milestone', id: ms.id, item: ms, dates: msDates, color: msColor, depth: 0 })

    if (!expandedMs.has(ms.id)) return

    const msEpics = epics
      .filter((e) => e.milestone_id === ms.id)
      .sort((a, b) => {
        const sa = epicComputed[a.id]?.start ?? new Date(0)
        const sb = epicComputed[b.id]?.start ?? new Date(0)
        return sa - sb
      })

    msEpics.forEach((epic) => addEpicRows(epic, msColor))
  })

  // ── Epics not linked to any release milestone (orphan epics) ──
  const orphanEpics = epics
    .filter((e) => !placedEpicIds.has(e.id))
    .sort((a, b) => {
      const sa = epicComputed[a.id]?.start ?? new Date(0)
      const sb = epicComputed[b.id]?.start ?? new Date(0)
      return sa - sb
    })

  if (orphanEpics.length > 0) {
    const orphanColor = '#64748B'
    const fakeMs = { id: 'orphan', name: 'Other', status: '' }
    const orphanDates = {
      start: new Date(Math.min(...orphanEpics.map((e) => epicComputed[e.id]?.start ?? new Date()).filter(Boolean))),
      end:   new Date(Math.max(...orphanEpics.map((e) => epicComputed[e.id]?.end   ?? new Date()).filter(Boolean))),
    }
    rows.push({ type: 'milestone', id: 'orphan', item: fakeMs, dates: orphanDates, color: orphanColor, depth: 0 })

    if (expandedMs.has('orphan')) {
      orphanEpics.forEach((epic) => addEpicRows(epic, orphanColor))
    }
  }

  return rows
}

// ── Date header component ──────────────────────────────────────────────────────
function DateHeader({ projectStart, totalDays }) {
  // Build month spans
  const months = []
  let cur = new Date(projectStart)
  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(projectStart.getTime() + i * 86400000)
    if (!months.length || d.getMonth() !== months[months.length - 1].month) {
      months.push({ month: d.getMonth(), year: d.getFullYear(), startOffset: i, days: 1 })
    } else {
      months[months.length - 1].days++
    }
  }

  return (
    <div className="sticky top-0 z-10 bg-white border-b border-slate-200 select-none" style={{ height: HEADER_H }}>
      {/* Month row */}
      <div className="relative border-b border-slate-100" style={{ height: 24 }}>
        {months.map((m, i) => (
          <div
            key={i}
            className="absolute top-0 overflow-hidden text-[10px] font-semibold text-slate-500 px-1 flex items-center"
            style={{ left: m.startOffset * COL_W, width: m.days * COL_W, height: 24 }}
          >
            {MONTH_NAMES[m.month]} {m.year}
          </div>
        ))}
      </div>
      {/* Day row */}
      <div className="relative" style={{ height: 28 }}>
        {Array.from({ length: totalDays + 1 }, (_, i) => {
          const d = new Date(projectStart.getTime() + i * 86400000)
          const isWeekend = d.getDay() === 0 || d.getDay() === 6
          return (
            <div
              key={i}
              className={`absolute top-0 flex items-center justify-center text-[9px] ${isWeekend ? 'text-slate-300' : 'text-slate-400'}`}
              style={{ left: i * COL_W, width: COL_W, height: 28 }}
            >
              {d.getDate()}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Grid background (weekend shading + today line) ─────────────────────────────
function GridBg({ projectStart, totalDays, totalRows }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayOffset = calendarDayOffset(projectStart, today)
  const totalH = totalRows * ROW_H

  return (
    <svg
      className="absolute top-0 left-0 pointer-events-none"
      width={(totalDays + 1) * COL_W}
      height={totalH}
      style={{ overflow: 'visible' }}
    >
      {Array.from({ length: totalDays + 1 }, (_, i) => {
        const d = new Date(projectStart.getTime() + i * 86400000)
        const isWeekend = d.getDay() === 0 || d.getDay() === 6
        if (!isWeekend) return null
        return (
          <rect key={i} x={i * COL_W} y={0} width={COL_W} height={totalH} fill="#f1f5f9" opacity={0.6} />
        )
      })}
      {/* Today line */}
      {todayOffset >= 0 && todayOffset <= totalDays && (
        <line
          x1={todayOffset * COL_W + COL_W / 2}
          y1={0}
          x2={todayOffset * COL_W + COL_W / 2}
          y2={totalH}
          stroke="#EF4444"
          strokeWidth={1.5}
          strokeDasharray="4 2"
          opacity={0.7}
        />
      )}
    </svg>
  )
}

// ── Dependency arrows (SVG overlay) ───────────────────────────────────────────
function DepArrows({ rows, deps, schedule, projectStart }) {
  if (!schedule) return null

  // Build rowIndex maps for tasks and epics
  const taskRowIdx  = {}
  const epicRowIdx  = {}
  rows.forEach((r, i) => {
    if (r.type === 'task')  taskRowIdx[r.id]  = i
    if (r.type === 'epic')  epicRowIdx[r.id]  = i
  })

  const { computed, epicComputed } = schedule
  const arrows = []

  for (const dep of deps) {
    const pk = dep.predecessor_kind
    const sk = dep.successor_kind

    // Resolve dates + row indices for supported dep kinds
    let predDates, succDates, pi, si

    if (pk === 'task' && sk === 'task') {
      pi = taskRowIdx[dep.predecessor_id]; si = taskRowIdx[dep.successor_id]
      predDates = computed[dep.predecessor_id]; succDates = computed[dep.successor_id]
    } else if (pk === 'epic' && sk === 'epic') {
      pi = epicRowIdx[dep.predecessor_id]; si = epicRowIdx[dep.successor_id]
      predDates = epicComputed[dep.predecessor_id]; succDates = epicComputed[dep.successor_id]
    } else if (pk === 'task' && sk === 'epic') {
      pi = taskRowIdx[dep.predecessor_id]; si = epicRowIdx[dep.successor_id]
      predDates = computed[dep.predecessor_id]; succDates = epicComputed[dep.successor_id]
    } else if (pk === 'epic' && sk === 'task') {
      pi = epicRowIdx[dep.predecessor_id]; si = taskRowIdx[dep.successor_id]
      predDates = epicComputed[dep.predecessor_id]; succDates = computed[dep.successor_id]
    } else {
      continue
    }

    if (pi === undefined || si === undefined || !predDates || !succDates) continue

    const x1 = (calendarDayOffset(projectStart, predDates.end) + 1) * COL_W
    const y1 = pi * ROW_H + ROW_H / 2
    const x2 = calendarDayOffset(projectStart, succDates.start) * COL_W
    const y2 = si * ROW_H + ROW_H / 2

    const midX = x1 + 10
    let path
    if (x2 > x1 + 10) {
      path = `M${x1},${y1} L${midX},${y1} L${midX},${y2} L${x2},${y2}`
    } else {
      const elbowY = Math.min(y1, y2) - 10
      path = `M${x1},${y1} L${midX},${y1} L${midX},${elbowY} L${x2 - 10},${elbowY} L${x2 - 10},${y2} L${x2},${y2}`
    }

    const isEpicDep = pk === 'epic' || sk === 'epic'
    arrows.push(
      <g key={`${dep.predecessor_kind}-${dep.predecessor_id}-${dep.successor_kind}-${dep.successor_id}`}>
        <path
          d={path}
          fill="none"
          stroke={isEpicDep ? '#6366F1' : '#94A3B8'}
          strokeWidth={isEpicDep ? 2 : 1.5}
          strokeDasharray={isEpicDep ? '6 3' : undefined}
          markerEnd={isEpicDep ? 'url(#arrowhead-epic)' : 'url(#arrowhead)'}
        />
      </g>
    )
  }

  if (!arrows.length) return null

  return (
    <svg
      className="absolute top-0 left-0 pointer-events-none"
      width="100%"
      height={rows.length * ROW_H}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#94A3B8" />
        </marker>
        <marker id="arrowhead-epic" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#6366F1" />
        </marker>
      </defs>
      {arrows}
    </svg>
  )
}

// ── Single Gantt row ───────────────────────────────────────────────────────────
function GanttBarRow({ row, projectStart, totalDays }) {
  const { type, dates, color, item } = row
  if (!dates) {
    return <div style={{ height: ROW_H }} className="border-b border-slate-100" />
  }

  const left  = Math.max(0, calendarDayOffset(projectStart, dates.start)) * COL_W
  const right = Math.max(0, calendarDayOffset(projectStart, dates.end) + 1) * COL_W
  const width = Math.max(COL_W, right - left)

  if (type === 'milestone') {
    return (
      <div className="relative border-b border-slate-100" style={{ height: ROW_H }}>
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded flex items-center px-2 text-white text-[10px] font-semibold shadow-sm"
          style={{ left, width, background: color, height: 20 }}
          title={item.name}
        >
          <span className="truncate">{item.name}</span>
        </div>
      </div>
    )
  }

  if (type === 'epic') {
    return (
      <div className="relative border-b border-slate-100" style={{ height: ROW_H }}>
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded text-[9px] font-medium flex items-center px-2 opacity-80"
          style={{ left, width, background: color + '33', border: `1.5px solid ${color}99`, height: 16, color }}
          title={item.name}
        >
          <span className="truncate">{item.name}</span>
        </div>
      </div>
    )
  }

  // task
  const statusColor = TASK_STATUS_COLOR[item.status] ?? '#94A3B8'
  const totalSP = (item.estimate_sp ?? 0) + (item.qa_review_sp ?? 0)

  return (
    <div className="relative border-b border-slate-100" style={{ height: ROW_H }}>
      <div
        className="absolute top-1/2 -translate-y-1/2 rounded text-[9px] text-white flex items-center px-1.5 gap-1"
        style={{ left, width: Math.max(8, width), background: statusColor, height: 14 }}
        title={`${item.task_name}${totalSP ? ` · ${totalSP} SP` : ''}`}
      />
    </div>
  )
}

// ── Sidebar tree row ───────────────────────────────────────────────────────────
function SidebarRow({ row, expandedMs, expandedEpics, onToggleMs, onToggleEpic, peopleMap }) {
  const { type, id, item, color, depth, assignee } = row

  if (type === 'milestone') {
    const expanded = expandedMs.has(id)
    return (
      <div
        className="flex items-center gap-1.5 border-b border-slate-100 px-3 cursor-pointer hover:bg-slate-50 select-none"
        style={{ height: ROW_H }}
        onClick={() => onToggleMs(id)}
      >
        <span className="text-slate-400 text-[10px] w-3 shrink-0">{expanded ? '▼' : '▶'}</span>
        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
        <span className="text-xs font-semibold text-slate-800 truncate flex-1">{item.name}</span>
        <span className={`text-[9px] rounded-full px-1.5 py-0.5 shrink-0 ${MS_STATUS_CLS[item.status] ?? 'bg-slate-100 text-slate-500'}`}>
          {item.status}
        </span>
      </div>
    )
  }

  if (type === 'epic') {
    const expanded = expandedEpics.has(id)
    return (
      <div
        className="flex items-center gap-1.5 border-b border-slate-100 px-3 cursor-pointer hover:bg-slate-50 select-none"
        style={{ height: ROW_H, paddingLeft: 20 }}
        onClick={() => onToggleEpic(id)}
      >
        <span className="text-slate-400 text-[10px] w-3 shrink-0">{expanded ? '▼' : '▶'}</span>
        <span className="text-xs text-slate-600 truncate flex-1">{item.name}</span>
      </div>
    )
  }

  // task
  const totalSP = (item.estimate_sp ?? 0) + (item.qa_review_sp ?? 0)
  return (
    <div
      className="flex items-center gap-1.5 border-b border-slate-100"
      style={{ height: ROW_H, paddingLeft: 36 }}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: TASK_STATUS_COLOR[item.status] ?? '#94A3B8' }}
      />
      <span className="text-[11px] text-slate-600 truncate flex-1" title={item.task_name}>
        {item.task_name}
      </span>
      <div className="flex items-center gap-1 shrink-0 pr-2">
        {assignee && (
          <span className="text-[9px] text-slate-400 truncate max-w-[60px]">{assignee.name?.split(' ')[0]}</span>
        )}
        {totalSP > 0 && (
          <span className="text-[9px] text-slate-400">{totalSP}sp</span>
        )}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function DeliveryMetrics() {
  const [releases,        setReleases]        = useState([])
  const [selectedRelease, setSelectedRelease] = useState(null)
  const [settings,        setSettings]        = useState(null)
  const [ganttData,       setGanttData]       = useState(null)
  const [peopleList,      setPeopleList]      = useState([])
  const [loading,         setLoading]         = useState(true)

  const [expandedMs,     setExpandedMs]     = useState(new Set())
  const [expandedEpics,  setExpandedEpics]  = useState(new Set())
  const [filterPid,      setFilterPid]      = useState(null)
  const [estMode,        setEstMode]        = useState('expected') // 'optimistic'|'expected'|'pessimistic'

  const barsScrollRef = useRef(null)
  const sidebarRef    = useRef(null)

  // Load releases + people once
  useEffect(() => {
    Promise.all([fetchReleases(), fetchPeople()]).then(([{ data: rel }, { data: ppl }]) => {
      setReleases(rel ?? [])
      setPeopleList(ppl ?? [])
      if (rel?.length) setSelectedRelease(rel[rel.length - 1])
    })
  }, [])

  // Load release data when release changes
  useEffect(() => {
    if (!selectedRelease) return
    setLoading(true)
    Promise.all([
      fetchProjectSettings(selectedRelease.id),
      fetchGanttData(selectedRelease.id, selectedRelease.version_name),
    ]).then(([{ data: s }, gd]) => {
      setSettings(s)
      setGanttData(gd)
      // Auto-expand all milestones (including virtual 'orphan' group) and epics
      const msIds = [...(gd.milestones ?? []).map((m) => m.id), 'orphan']
      setExpandedMs(new Set(msIds))
      setExpandedEpics(new Set((gd.epics ?? []).map((e) => e.id)))
      setLoading(false)
    })
  }, [selectedRelease])

  // Sync vertical scroll between sidebar and bars panel
  const handleBarsScroll = () => {
    if (sidebarRef.current && barsScrollRef.current)
      sidebarRef.current.scrollTop = barsScrollRef.current.scrollTop
  }
  const handleSidebarScroll = () => {
    if (barsScrollRef.current && sidebarRef.current)
      barsScrollRef.current.scrollTop = sidebarRef.current.scrollTop
  }

  const peopleMap = useMemo(
    () => Object.fromEntries(peopleList.map((p) => [p.id, p])),
    [peopleList],
  )

  const schedule = useMemo(() => {
    if (!settings || !ganttData) return null
    return buildSchedule({ settings, ...ganttData, estMode })
  }, [settings, ganttData, estMode])

  const rows = useMemo(() => {
    if (!ganttData || !schedule) return []
    return buildRows({
      milestones:    ganttData.milestones,
      epics:         ganttData.epics,
      tasks:         ganttData.tasks,
      schedule,
      expandedMs,
      expandedEpics,
      filterPid,
      peopleMap,
    })
  }, [ganttData, schedule, expandedMs, expandedEpics, filterPid, peopleMap])

  // Compute chart date range from schedule
  const { projectStart, totalDays } = useMemo(() => {
    if (!schedule) return { projectStart: new Date(), totalDays: 60 }
    const { msComputed, projectStart } = schedule
    let maxEnd = new Date(projectStart)
    Object.values(msComputed).forEach((v) => { if (v.end > maxEnd) maxEnd = v.end })
    Object.values(schedule.epicComputed).forEach((v) => { if (v.end > maxEnd) maxEnd = v.end })
    Object.values(schedule.computed).forEach((v) => { if (v.end > maxEnd) maxEnd = v.end })
    const totalDays = Math.max(30, calendarDayOffset(projectStart, maxEnd) + 7)
    return { projectStart, totalDays }
  }, [schedule])

  const toggleMs = (id) =>
    setExpandedMs((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const toggleEpic = (id) =>
    setExpandedEpics((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const noSettings = !loading && !settings?.start_date

  // Developers who have tasks in this release
  const activePeople = useMemo(() => {
    if (!ganttData) return []
    const ids = new Set(ganttData.tasks.map((t) => t.assigned_to_id).filter(Boolean))
    return peopleList.filter((p) => ids.has(p.id))
  }, [ganttData, peopleList])

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* ── Top bar ── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-slate-900">Delivery Metrics</h1>
          <p className="mt-0.5 text-sm text-slate-500">Gantt chart · scheduled from task story points &amp; dependencies</p>
        </div>

        {/* Release selector */}
        <select
          value={selectedRelease?.id ?? ''}
          onChange={(e) => setSelectedRelease(releases.find((r) => String(r.id) === e.target.value))}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
        >
          {releases.map((r) => <option key={r.id} value={r.id}>{r.version_name}</option>)}
        </select>

        {/* Developer filter */}
        {activePeople.length > 0 && (
          <select
            value={filterPid ?? ''}
            onChange={(e) => setFilterPid(e.target.value ? Number(e.target.value) : null)}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
          >
            <option value="">All developers</option>
            {activePeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}

        {/* Estimation mode */}
        <div className="flex rounded-md border border-slate-200 overflow-hidden text-xs font-medium">
          {[['optimistic','Optimistic'],['expected','Expected'],['pessimistic','Pessimistic']].map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setEstMode(val)}
              className={`px-3 py-1.5 transition-colors ${
                estMode === val
                  ? 'bg-[#1F3864] text-white'
                  : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Expand/collapse all epics */}
        {!loading && ganttData && (
          <button
            type="button"
            onClick={() => {
              const allEpicIds = ganttData.epics.map((e) => e.id)
              const allExpanded = allEpicIds.every((id) => expandedEpics.has(id))
              setExpandedEpics(allExpanded ? new Set() : new Set(allEpicIds))
            }}
            className="text-xs text-slate-500 hover:text-slate-800 underline whitespace-nowrap"
          >
            {ganttData.epics.every((e) => expandedEpics.has(e.id)) ? 'Collapse tasks' : 'Expand tasks'}
          </button>
        )}
      </div>

      {/* ── No settings warning ── */}
      {noSettings && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No project settings found for this release. Configure a start date in{' '}
          <a href="/planning" className="underline font-medium">Planning Config</a>.
        </div>
      )}

      {/* ── Legend ── */}
      {!loading && (
        <div className="flex flex-wrap items-center gap-4 mb-3 text-[10px] text-slate-500">
          {Object.entries(TASK_STATUS_COLOR).map(([s, c]) => (
            <span key={s} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
              {s}
            </span>
          ))}
          <span className="flex items-center gap-1 ml-2">
            <svg width={20} height={10}><line x1={0} y1={5} x2={20} y2={5} stroke="#EF4444" strokeWidth={1.5} strokeDasharray="4 2" /></svg>
            Today
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-400">Loading…</div>
      ) : !schedule ? (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
          Configure project settings to generate the Gantt chart.
        </div>
      ) : (
        /* ── Gantt layout ── */
        <div className="flex flex-1 rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm" style={{ minHeight: 0 }}>

          {/* Left sidebar */}
          <div
            ref={sidebarRef}
            onScroll={handleSidebarScroll}
            className="shrink-0 border-r border-slate-200 overflow-y-auto"
            style={{ width: SIDEBAR_W }}
          >
            {/* Sidebar header */}
            <div className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 px-3 flex items-center text-[10px] font-semibold uppercase tracking-wide text-slate-500" style={{ height: HEADER_H }}>
              Work item
            </div>
            {rows.map((row, i) => (
              <SidebarRow
                key={`${row.type}-${row.id}`}
                row={row}
                expandedMs={expandedMs}
                expandedEpics={expandedEpics}
                onToggleMs={toggleMs}
                onToggleEpic={toggleEpic}
                peopleMap={peopleMap}
              />
            ))}
          </div>

          {/* Right bars panel */}
          <div
            ref={barsScrollRef}
            onScroll={handleBarsScroll}
            className="flex-1 overflow-auto"
          >
            <div style={{ width: (totalDays + 2) * COL_W, minWidth: '100%' }}>
              {/* Date header */}
              <DateHeader projectStart={projectStart} totalDays={totalDays} />

              {/* Bars area */}
              <div className="relative" style={{ height: rows.length * ROW_H }}>
                <GridBg projectStart={projectStart} totalDays={totalDays} totalRows={rows.length} />

                {rows.map((row, rowI) => (
                  <div
                    key={`bar-${row.type}-${row.id}`}
                    className="absolute w-full"
                    style={{ top: rowI * ROW_H, height: ROW_H }}
                  >
                    <GanttBarRow row={row} projectStart={projectStart} totalDays={totalDays} />
                  </div>
                ))}

                {/* Dependency arrows (task level only) */}
                <DepArrows
                  rows={rows}
                  deps={ganttData.deps}
                  schedule={schedule}
                  projectStart={projectStart}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
