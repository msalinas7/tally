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
