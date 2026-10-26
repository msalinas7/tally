import { supabase } from '../supabase'

export async function bulkAssignEpicToTasks(taskIds, epicId) {
  return supabase.from('tasks').update({ epic_id: epicId }).in('id', taskIds)
}

/**
 * Returns all distinct product versions present in the tasks table, sorted.
 * @returns {Promise<string[]>}
 */
export async function getProductVersionList() {
  // Use neq instead of .not(...'is', null) — more reliable across PostgREST versions
  const { data, error } = await supabase
    .from('tasks')
    .select('product_version')
    .neq('product_version', null)

  if (error) {
    console.error('[v2status] getProductVersionList:', error.message)
    return []
  }

  const versions = [
    ...new Set((data ?? []).map((r) => r.product_version).filter(Boolean)),
  ]
  return versions.sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
  )
}

/**
 * All Notion statuses the app recognises, in their canonical casing.
 */
export const KNOWN_STATUSES = new Set([
  'Not started',
  'In progress',
  'In Code Review',
  'Merged - Ready for Build',
  'Ready For QA',
  'In QA Review',
  'Blocked',
  'QA Rejected',
  'QA Approved',
  'Done',
])

/**
 * Normalises a raw status string to its canonical form.
 * Returns { status, unknown: true } if the value isn't in KNOWN_STATUSES.
 */
function normalizeStatus(raw) {
  if (!raw) return { status: 'Not started', unknown: false }
  const trimmed = raw.trim()
  for (const s of KNOWN_STATUSES) {
    if (s.toLowerCase() === trimmed.toLowerCase()) return { status: s, unknown: false }
  }
  console.warn('[v2status] Unrecognised status:', trimmed)
  return { status: trimmed, unknown: true }
}

/**
 * @typedef {Object} Task
 * @property {number}   id
 * @property {string}   name
 * @property {string}   status           — canonical Notion status
 * @property {boolean}  unknownStatus    — true when status was not in KNOWN_STATUSES
 * @property {string|null} epic          — epic name, or null if unassigned
 * @property {string[]} assignees        — people assigned to this task
 * @property {string|null} productVersion
 * @property {string|null} updatedAt     — ISO timestamp of the latest task_event
 */

/**
 * Fetches and normalises all tasks for `productVersion`.
 * Applies `excludeAssignees` filter in-memory (assignee data not yet in schema).
 *
 * @param {{ productVersion?: string, excludeAssignees?: string[] }} [options]
 * @returns {Promise<Task[]>}
 */
export async function getBacklogTasks({ productVersion = 'V2', excludeAssignees = [] } = {}) {
  // ── 1. Tasks + epic + assignee joins ──────────────────────────────────────
  const { data: rawTasks, error: te } = await supabase
    .from('tasks')
    .select('id, task_name, product_version, epic_id, assigned_to_id, epics(id, name, milestones(id, name)), people(id, name)')
    .eq('product_version', productVersion)

  if (te) throw te

  const tasks = rawTasks ?? []
  if (tasks.length === 0) return []

  // ── 2. Latest task_event per task ─────────────────────────────────────────
  const taskIds = tasks.map((t) => t.id)
  const { data: events, error: ee } = await supabase
    .from('task_events')
    .select('task_id, status, received_at')
    .in('task_id', taskIds)
    .order('received_at', { ascending: true })

  if (ee) throw ee

  const latestEvent = {}
  for (const ev of events ?? []) {
    latestEvent[ev.task_id] = ev
  }

  // ── 3. Normalise + assemble ───────────────────────────────────────────────
  const normalised = tasks.map((t) => {
    const ev = latestEvent[t.id] ?? null
    const { status, unknown } = normalizeStatus(ev?.status)
    // people is a single object when joined via assigned_to_id FK
    const engineerName = t.people?.name ?? null
    const engineerFirst = engineerName ? engineerName.split(' ')[0] : null
    return {
      id: t.id,
      name: t.task_name ?? 'Untitled',
      status,
      unknownStatus: unknown,
      epic: t.epics?.name ?? null,
      milestone: t.epics?.milestones?.name ?? null,
      engineer: engineerName,        // full name e.g. "Renan Santiago"
      engineerFirst,                 // first name e.g. "Renan" — used for filter matching
      assignees: engineerName ? [engineerName] : [],
      productVersion: t.product_version,
      updatedAt: ev?.received_at ?? null,
    }
  })

  // ── 4. Apply excludeAssignees ─────────────────────────────────────────────
  if (excludeAssignees.length === 0) return normalised
  return normalised.filter(
    (t) => !t.assignees.some((a) => excludeAssignees.includes(a)),
  )
}
