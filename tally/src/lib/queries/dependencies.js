import { supabase } from '../supabase'

export async function fetchDependencies() {
  return supabase
    .from('task_dependencies')
    .select('id, predecessor_kind, predecessor_id, successor_kind, successor_id, dependency_type, lag_days')
    .order('id', { ascending: true })
}

export async function insertDependency(row) {
  return supabase
    .from('task_dependencies')
    .insert([row])
    .select()
    .single()
}

export async function deleteDependency(id) {
  return supabase.from('task_dependencies').delete().eq('id', id)
}

// Fetch all items for a release to populate pickers
export async function fetchReleaseItems(releaseId, versionName) {
  const [
    { data: milestones },
    { data: epics },
    { data: tasks },
  ] = await Promise.all([
    supabase
      .from('milestones')
      .select('id, name')
      .eq('release_id', releaseId)
      .order('name'),
    supabase
      .from('epics')
      .select('id, name, milestone_id, milestones(release_id)')
      .order('name'),
    supabase
      .from('tasks')
      .select('id, task_name, epic_id')
      .eq('product_version', versionName)
      .order('task_name'),
  ])

  const milestoneIds = new Set((milestones ?? []).map((m) => m.id))

  return {
    milestones: milestones ?? [],
    epics: (epics ?? []).filter((e) => milestoneIds.has(e.milestone_id)),
    tasks: tasks ?? [],
  }
}
