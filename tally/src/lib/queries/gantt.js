import { supabase } from '../supabase'

/**
 * Fetch all data needed to render the Gantt chart for a release.
 *
 * Two-pass strategy:
 *  Pass 1 (reliable baseline): milestones → epic_ids → tasks by epic_id.
 *  Pass 2 (catch-all):         tasks by product_version → any additional epic_ids
 *                               not found in pass 1 are fetched and merged in.
 *
 * This means epics show up whether they're linked to a milestone or not,
 * as long as they have tasks assigned to this release's product_version.
 */
export async function fetchGanttData(releaseId, versionName) {
  // ── Pass 1: milestone-anchored epics ──────────────────────────────────────
  const [
    { data: milestones },
    { data: epicRows },
    { data: deps },
    { data: holidays },
  ] = await Promise.all([
    supabase.from('milestones').select('id, name, status').eq('release_id', releaseId).order('name'),
    supabase.from('epics').select('id, name, milestone_id').order('name'),
    supabase.from('task_dependencies').select('id, predecessor_kind, predecessor_id, successor_kind, successor_id, dependency_type, lag_days'),
    supabase.from('holidays_pto').select('id, date, kind, people_id, release_id'),
  ])

  const milestoneIds  = new Set((milestones ?? []).map((m) => m.id))
  const msEpics       = (epicRows ?? []).filter((e) => milestoneIds.has(e.milestone_id))
  const msEpicIdSet   = new Set(msEpics.map((e) => e.id))

  // Fetch tasks for milestone-linked epics
  let tasks = []
  if (msEpicIdSet.size > 0) {
    const { data } = await supabase
      .from('tasks')
      .select('id, task_name, epic_id, estimate_sp, qa_review_sp, assigned_to_id, status, product_version')
      .in('epic_id', [...msEpicIdSet])
      .order('task_name')
    tasks = data ?? []
  }

  // ── Pass 2: product_version sweep to catch missed epics ──────────────────
  let extraEpics = []
  if (versionName) {
    const { data: versionTasks } = await supabase
      .from('tasks')
      .select('id, task_name, epic_id, estimate_sp, qa_review_sp, assigned_to_id, status, product_version')
      .eq('product_version', versionName)
      .order('task_name')

    if (versionTasks?.length) {
      // Merge with pass-1 tasks (deduplicate by id)
      const taskMap = Object.fromEntries(tasks.map((t) => [t.id, t]))
      versionTasks.forEach((t) => { taskMap[t.id] = t })
      tasks = Object.values(taskMap)

      // Find epic_ids in version tasks that weren't in the milestone-linked set
      const newEpicIds = [
        ...new Set(
          versionTasks
            .map((t) => t.epic_id)
            .filter((id) => id && !msEpicIdSet.has(id)),
        ),
      ]

      if (newEpicIds.length > 0) {
        const { data: extraEpicRows } = await supabase
          .from('epics')
          .select('id, name, milestone_id')
          .in('id', newEpicIds)
          .order('name')
        extraEpics = extraEpicRows ?? []
      }
    }
  }

  const filteredHolidays = (holidays ?? []).filter(
    (h) => !h.release_id || h.release_id === releaseId,
  )

  return {
    milestones: milestones ?? [],
    epics:      [...msEpics, ...extraEpics],
    tasks,
    deps:       deps ?? [],
    holidays:   filteredHolidays,
  }
}
