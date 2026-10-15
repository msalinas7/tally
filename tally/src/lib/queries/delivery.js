import { supabase } from '../supabase'

const PAGE_SIZE = 1000
const MS_PER_DAY = 1000 * 60 * 60 * 24

function normalizeStatus(status) {
  return typeof status === 'string' ? status.trim().toLowerCase() : ''
}

export function daysBetween(start, end) {
  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    return null
  }
  return (endMs - startMs) / MS_PER_DAY
}

export async function fetchTaskEvents() {
  const rows = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('task_events')
      .select(
        'status, received_at, task_id, tasks(id, task_name, created_at, product_version)'
      )
      .order('received_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error

    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

export function computeCompletedTasks(events) {
  const byTask = new Map()

  for (const event of events) {
    const task = event.tasks
    if (!event.task_id || !task) continue

    if (!byTask.has(event.task_id)) {
      byTask.set(event.task_id, {
        id: task.id ?? event.task_id,
        taskName: task.task_name ?? 'Untitled',
        productVersion: task.product_version || 'Unspecified',
        createdAt: task.created_at,
        inProgressAt: null,
        doneAt: null,
      })
    }

    const record = byTask.get(event.task_id)
    const status = normalizeStatus(event.status)

    if (status === 'in progress' && !record.inProgressAt) {
      record.inProgressAt = event.received_at
    }
    if (status === 'done') {
      record.doneAt = event.received_at
    }
  }

  return [...byTask.values()]
    .filter((task) => task.doneAt)
    .map((task) => ({
      ...task,
      leadTimeDays: daysBetween(task.createdAt, task.doneAt),
      cycleTimeDays: task.inProgressAt
        ? daysBetween(task.inProgressAt, task.doneAt)
        : null,
    }))
}

export function getProductVersions(tasks) {
  return [...new Set(tasks.map((task) => task.productVersion).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  )
}

export function averageDays(values) {
  const nums = values.filter((value) => value != null && !Number.isNaN(value))
  if (!nums.length) return null
  return nums.reduce((sum, value) => sum + value, 0) / nums.length
}

/**
 * Fetch all tasks for a given product_version.
 * Used to identify "Not Started" tasks (those with no events yet).
 */
export async function fetchTasksByVersion(productVersion) {
  const q = supabase
    .from('tasks')
    .select('id, task_name, product_version, epic_id')
  if (productVersion) q.eq('product_version', productVersion)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

/**
 * Fetch tasks by ID with their epic and milestone hierarchy.
 * Uses three flat queries joined client-side to avoid relying on
 * PostgREST FK auto-detection.
 */
export async function fetchTasksWithHierarchy(taskIds) {
  if (!taskIds || taskIds.length === 0) return []

  // 1. Tasks
  const { data: tasks, error: te } = await supabase
    .from('tasks')
    .select('id, task_name, product_version, epic_id')
    .in('id', taskIds)
  if (te) throw te

  // 2. Epics referenced by those tasks
  const epicIds = [...new Set((tasks ?? []).map((t) => t.epic_id).filter(Boolean))]
  let epicsById = {}
  let milestonesById = {}

  if (epicIds.length > 0) {
    const { data: epics, error: ee } = await supabase
      .from('epics')
      .select('id, name, milestone_id')
      .in('id', epicIds)
    if (ee) throw ee

    epicsById = Object.fromEntries((epics ?? []).map((e) => [e.id, e]))

    // 3. Milestones referenced by those epics
    const milestoneIds = [...new Set((epics ?? []).map((e) => e.milestone_id).filter(Boolean))]
    if (milestoneIds.length > 0) {
      const { data: milestones, error: me } = await supabase
        .from('milestones')
        .select('id, name')
        .in('id', milestoneIds)
      if (me) throw me
      milestonesById = Object.fromEntries((milestones ?? []).map((m) => [m.id, m]))
    }
  }

  // 4. Latest status event per task
  const { data: events, error: evErr } = await supabase
    .from('task_events')
    .select('task_id, status, received_at')
    .in('task_id', taskIds)
    .order('received_at', { ascending: false })
  if (evErr) throw evErr

  const latestEventByTask = {}
  for (const ev of events ?? []) {
    if (!latestEventByTask[ev.task_id]) latestEventByTask[ev.task_id] = ev
  }

  // 5. Assemble
  return (tasks ?? []).map((task) => {
    const epic = task.epic_id ? epicsById[task.epic_id] ?? null : null
    const milestone = epic?.milestone_id ? milestonesById[epic.milestone_id] ?? null : null
    const latestEvent = latestEventByTask[task.id] ?? null
    return {
      ...task,
      epics: epic ? { ...epic, milestones: milestone } : null,
      latestStatus: latestEvent?.status ?? null,
      latestStatusAt: latestEvent?.received_at ?? null,
    }
  })
}

export function averageCycleTimeByVersion(tasks) {
  const grouped = new Map()

  for (const task of tasks) {
    if (task.cycleTimeDays == null) continue
    const key = task.productVersion
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(task.cycleTimeDays)
  }

  return [...grouped.entries()]
    .map(([version, values]) => ({
      version,
      avgCycleTime: averageDays(values),
    }))
    .sort((a, b) =>
      a.version.localeCompare(b.version, undefined, { numeric: true, sensitivity: 'base' })
    )
}
