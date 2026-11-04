import { supabase } from '../supabase'

/**
 * Fetch all data needed to render the Gantt chart for a release.
 * Epics are pre-filtered to only those belonging to milestones in this release.
 */
export async function fetchGanttData(releaseId, versionName) {
  const [
    { data: milestones },
    { data: epicRows },
    { data: taskRows },
    { data: deps },
    { data: holidays },
  ] = await Promise.all([
    supabase
      .from('milestones')
      .select('id, name, status')
      .eq('release_id', releaseId)
      .order('name'),
    supabase
      .from('epics')
      .select('id, name, milestone_id')
      .order('name'),
    supabase
      .from('tasks')
      .select('id, task_name, epic_id, estimate_sp, qa_review_sp, assigned_to_id, status, product_version')
      .eq('product_version', versionName)
      .order('task_name'),
    supabase
      .from('task_dependencies')
      .select('id, predecessor_kind, predecessor_id, successor_kind, successor_id, dependency_type, lag_days'),
    supabase
      .from('holidays_pto')
      .select('id, date, kind, people_id, release_id'),
  ])

  const milestoneIds = new Set((milestones ?? []).map((m) => m.id))
  const filteredEpics = (epicRows ?? []).filter((e) => milestoneIds.has(e.milestone_id))
  // Only keep holidays that are global or belong to this release (or have no release)
  const filteredHolidays = (holidays ?? []).filter(
    (h) => !h.release_id || h.release_id === releaseId,
  )

  return {
    milestones: milestones ?? [],
    epics: filteredEpics,
    tasks: taskRows ?? [],
    deps: deps ?? [],
    holidays: filteredHolidays,
  }
}
