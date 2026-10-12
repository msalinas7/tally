import { supabase } from '../supabase'

export async function fetchReleasesWithProject() {
  return supabase
    .from('releases')
    .select(`
      id, version_name, release_type, status,
      start_date, planned_delivery_date, delivery_date,
      budgeted_cost, actual_cost, estimated_hours, dev_hours,
      change_requests_count, bugs_in_qa, escaped_defects,
      hotfixes_30d, rollback, team_size, contingency, notes,
      projects(name)
    `)
    .order('id', { ascending: false })
}

export async function fetchProjects() {
  return supabase.from('projects').select('id, name').order('name')
}

export async function insertRelease(row) {
  return supabase.from('releases').insert([row]).select().single()
}

export async function updateRelease(id, row) {
  return supabase.from('releases').update(row).eq('id', id).select().single()
}

export async function deleteRelease(id) {
  return supabase.from('releases').delete().eq('id', id)
}
