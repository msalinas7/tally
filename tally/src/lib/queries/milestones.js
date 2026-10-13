import { supabase } from '../supabase'

// ── Milestones ──────────────────────────────────────────────

export async function fetchMilestones(releaseId) {
  const q = supabase
    .from('milestones')
    .select('id, release_id, name, description, releases(version_name)')
    .order('id', { ascending: true })
  if (releaseId) q.eq('release_id', releaseId)
  return q
}

export async function insertMilestone(row) {
  return supabase.from('milestones').insert([row]).select().single()
}

export async function updateMilestone(id, row) {
  return supabase.from('milestones').update(row).eq('id', id).select().single()
}

export async function deleteMilestone(id) {
  return supabase.from('milestones').delete().eq('id', id)
}

// ── Epics (for assigning to milestones) ─────────────────────

export async function fetchEpics(projectId) {
  const q = supabase
    .from('epics')
    .select('id, name, area, milestone_id, project_id, projects(name), milestones(name)')
    .order('name')
  if (projectId) q.eq('project_id', projectId)
  return q
}

export async function insertEpic(row) {
  return supabase.from('epics').insert([row]).select().single()
}

export async function updateEpic(id, row) {
  return supabase.from('epics').update(row).eq('id', id).select().single()
}

export async function deleteEpic(id) {
  return supabase.from('epics').delete().eq('id', id)
}

export async function assignEpicToMilestone(epicId, milestoneId) {
  return supabase
    .from('epics')
    .update({ milestone_id: milestoneId })
    .eq('id', epicId)
}

// ── PM hours ────────────────────────────────────────────────

export async function fetchPmHours(releaseId) {
  return supabase
    .from('pm_hours')
    .select('*')
    .eq('release_id', releaseId)
    .order('week_ending', { ascending: true })
}

export async function upsertPmHours(rows) {
  return supabase
    .from('pm_hours')
    .upsert(rows, { onConflict: 'release_id,week_ending,resource' })
}

export async function deletePmHoursRow(id) {
  return supabase.from('pm_hours').delete().eq('id', id)
}

// ── Dev hours view ───────────────────────────────────────────

export async function fetchDevHoursByEpic(productVersion) {
  const q = supabase
    .from('dev_hours_by_epic')
    .select('*')
  if (productVersion) q.eq('product_version', productVersion)
  return q
}
