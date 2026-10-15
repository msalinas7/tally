/**
 * Pure aggregation helpers for the V2 Status page.
 * No Supabase / React imports — fully unit-testable.
 */

// ── Status sets ───────────────────────────────────────────────────────────────

export const COMPLETE_STATUSES = new Set(['Done', 'QA Approved'])

export const IN_FLIGHT_STATUSES = new Set([
  'In progress',
  'In Code Review',
  'Merged - Ready for Build',
  'Ready For QA',
  'In QA Review',
  'QA Rejected',
])

// ── Feature group config ──────────────────────────────────────────────────────
// Keys are the display names shown in FeatureProgressCards.
// Values are epic names matched case-insensitively.

export const FEATURE_GROUPS = {
  'OTP Authentication': [
    'otp authentication',
  ],
  'Notifications Hub': [
    'notifications hub screen',
    'notifications icon in home screen',
    'read notifications',
    'update notifications',
  ],
  'Shipping Calendar': [
    'create shipment',
    'edit shipment',
    'delete shipment',
    'shipment details',
    'shipment status tags',
    'filter shipment',
    'search shipment',
    'send shipment information',
    'add loads of a shipment',
    'add or remove photos',
    'calendar visualization',
  ],
  'Content Admin': [
    'content admin features',
  ],
}

// ── Status bucket classification (for mini charts) ───────────────────────────

/**
 * Maps a canonical status to one of five chart buckets.
 * @param {string} status
 * @returns {'Complete'|'In QA'|'In development'|'Needs attention'|'Not started'}
 */
export function getStatusBucket(status) {
  if (COMPLETE_STATUSES.has(status)) return 'Complete'
  if (status === 'Ready For QA' || status === 'In QA Review') return 'In QA'
  if (
    status === 'In progress' ||
    status === 'In Code Review' ||
    status === 'Merged - Ready for Build'
  ) return 'In development'
  if (status === 'QA Rejected' || status === 'Blocked') return 'Needs attention'
  return 'Not started'
}

export const BUCKET_COLORS = {
  Complete: '#95C53F',
  'In QA': '#05AAE0',
  'In development': '#03446D',
  'Needs attention': '#E05C5C',
  'Not started': '#E1EAF0',
}

// ── Core aggregations ─────────────────────────────────────────────────────────

/**
 * Computes overall progress for an array of tasks.
 * @param {import('../queries/v2status').Task[]} tasks
 * @returns {{ pct: number, complete: number, total: number }}
 */
export function computeProgress(tasks) {
  const total = tasks.length
  if (total === 0) return { pct: 0, complete: 0, total: 0 }
  const complete = tasks.filter((t) => COMPLETE_STATUSES.has(t.status)).length
  return { pct: Math.round((complete / total) * 100), complete, total }
}

/**
 * Groups tasks into features and computes progress for each.
 * Tasks whose epic doesn't match any feature are placed in an 'Other' bucket.
 *
 * @param {import('../queries/v2status').Task[]} tasks
 * @param {string[]} [excludeAssignees]
 * @returns {Array<{ feature: string, pct: number, complete: number, total: number, tasks: Task[] }>}
 */
export function groupByFeature(tasks, excludeAssignees = []) {
  const filtered = excludeAssignees.length
    ? tasks.filter((t) => !t.assignees.some((a) => excludeAssignees.includes(a)))
    : tasks

  return Object.entries(FEATURE_GROUPS).map(([feature, epicNames]) => {
    const epicSet = new Set(epicNames) // already lowercased in config
    const featureTasks = filtered.filter(
      (t) => t.epic != null && epicSet.has(t.epic.toLowerCase()),
    )
    return { feature, ...computeProgress(featureTasks), tasks: featureTasks }
  })
}

/**
 * Derives an epic-level status from its tasks.
 * Priority: Ready for release > In progress > Blocked > Not started
 *
 * @param {import('../queries/v2status').Task[]} epicTasks
 * @returns {'Ready for release'|'In progress'|'Blocked'|'Not started'}
 */
export function computeEpicStatus(epicTasks) {
  if (epicTasks.length === 0) return 'Not started'
  if (epicTasks.every((t) => COMPLETE_STATUSES.has(t.status))) return 'Ready for release'
  if (epicTasks.some((t) => IN_FLIGHT_STATUSES.has(t.status))) return 'In progress'
  if (epicTasks.some((t) => t.status === 'Blocked')) return 'Blocked'
  return 'Not started'
}

/**
 * Groups tasks by epic name and returns one entry per epic, sorted by:
 *   1. Status priority (In progress, Ready for release, Blocked, Not started)
 *   2. Percent complete descending
 *
 * @param {import('../queries/v2status').Task[]} tasks
 * @param {string[]} [excludeAssignees]
 * @returns {Array<{ epic: string, epicStatus: string, pct: number, complete: number, total: number, buckets: Object, tasks: Task[] }>}
 */
export function buildEpicRows(tasks, excludeAssignees = []) {
  const filtered = excludeAssignees.length
    ? tasks.filter((t) => !t.assignees.some((a) => excludeAssignees.includes(a)))
    : tasks

  const epicMap = new Map()
  for (const t of filtered) {
    const key = t.epic ?? '(No epic)'
    if (!epicMap.has(key)) epicMap.set(key, [])
    epicMap.get(key).push(t)
  }

  const STATUS_ORDER = { 'In progress': 0, 'Ready for release': 1, Blocked: 2, 'Not started': 3 }

  return [...epicMap.entries()]
    .map(([epic, epicTasks]) => {
      const { pct, complete, total } = computeProgress(epicTasks)
      const epicStatus = computeEpicStatus(epicTasks)
      const buckets = {}
      for (const t of epicTasks) {
        const b = getStatusBucket(t.status)
        buckets[b] = (buckets[b] ?? 0) + 1
      }
      return { epic, epicStatus, pct, complete, total, buckets, tasks: epicTasks }
    })
    .sort((a, b) => {
      const so = (STATUS_ORDER[a.epicStatus] ?? 99) - (STATUS_ORDER[b.epicStatus] ?? 99)
      if (so !== 0) return so
      return b.pct - a.pct
    })
}
