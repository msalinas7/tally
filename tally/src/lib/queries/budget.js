import { supabase } from '../supabase'

export async function fetchReleases() {
  return supabase
    .from('releases')
    .select('id, version_name')
    .order('id', { ascending: true })
}

export async function fetchBudgetBaseline(releaseId) {
  return supabase
    .from('budget_baseline')
    .select('id, release_id, resource, role, hourly_rate, allocated_hours, budgeted_cost, notes')
    .eq('release_id', releaseId)
    .order('resource', { ascending: true })
}

export async function fetchWrikeHoursByRelease() {
  return supabase
    .from('wrike_hours')
    .select('resource, hours_logged, actual_cost, week_ending')
    .order('week_ending', { ascending: true })
}

export async function insertBaselineRow(row) {
  return supabase.from('budget_baseline').insert([{
    release_id: row.release_id,
    resource: row.resource,
    role: row.role || null,
    hourly_rate: Number(row.hourly_rate),
    allocated_hours: Number(row.allocated_hours),
    notes: row.notes || null,
  }])
}

export async function updateBaselineRow(id, row) {
  return supabase.from('budget_baseline').update({
    resource: row.resource,
    role: row.role || null,
    hourly_rate: Number(row.hourly_rate),
    allocated_hours: Number(row.allocated_hours),
    notes: row.notes || null,
  }).eq('id', id)
}

export async function deleteBaselineRow(id) {
  return supabase.from('budget_baseline').delete().eq('id', id)
}
