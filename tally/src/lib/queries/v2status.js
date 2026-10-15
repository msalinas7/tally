import { supabase } from '../supabase'

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
  // ── 1. Tasks + epic join ──────────────────────────────────────────────────
  const { data: rawTasks, error: te } = await supabase
    .from('tasks')
    .select('id, task_name, product_version, epic_id, epics(id, name)')
    .eq('product_version', productVersion)

  if (te) throw te

  const tasks = rawTasks ?? []
  if (tasks.length === 0) return []

  // ── 2. Latest task_event per task ─────────────────────────────────────────
  // Fetch ascending so the last write for each task_id wins when we iterate.
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
    return {
      id: t.id,
      name: t.task_name ?? 'Untitled',
      status,
      unknownStatus: unknown,
      epic: t.epics?.name ?? null,
      // assignees live in the `people` table, linked via a tasks_people join table
      // that doesn't exist in the schema yet.  Return an empty array for now so
      // excludeAssignees works transparently once the data is available.
      assignees: [],
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
