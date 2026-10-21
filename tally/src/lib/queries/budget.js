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
    .select('id, release_id, resource, role, hourly_rate, allocated_hours, budgeted_cost, notes, people_id')
    .eq('release_id', releaseId)
    .order('resource', { ascending: true })
}

export async function fetchPeople() {
  return supabase
    .from('people')
    .select('id, name, role')
    .not('name', 'is', null)
    .order('name', { ascending: true })
}

// Derived dev hours from task_events (In Progress → Ready for QA spans)
// Filtered by product_version which matches release version_name
export async function fetchDevHours(productVersion) {
  const q = supabase
    .from('dev_hours_by_epic')
    .select('assigned_to_id, resource, epic_name, milestone_name, product_version, task_id, task_name, hours_logged, in_progress_at, ready_for_qa_at')
  if (productVersion) q.eq('product_version', productVersion)
  return q
}

// PM/QA standard hours
export async function fetchPmHours(releaseId) {
  return supabase
    .from('pm_hours')
    .select('*')
    .eq('release_id', releaseId)
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
    people_id: row.people_id || null,
  }])
}

export async function updateBaselineRow(id, row) {
  return supabase.from('budget_baseline').update({
    resource: row.resource,
    role: row.role || null,
    hourly_rate: Number(row.hourly_rate),
    allocated_hours: Number(row.allocated_hours),
    notes: row.notes || null,
    people_id: row.people_id || null,
  }).eq('id', id)
}

export async function deleteBaselineRow(id) {
  return supabase.from('budget_baseline').delete().eq('id', id)
}

// ── Engineer ↔ role assignments ───────────────────────────────────────────────

export async function fetchEngineerRoles(baselineIds) {
  if (!baselineIds?.length) return { data: [], error: null }
  return supabase
    .from('budget_engineer_roles')
    .select('id, baseline_id, people_id, people(id, name)')
    .in('baseline_id', baselineIds)
}

export async function insertEngineerRole(baselineId, peopleId) {
  return supabase
    .from('budget_engineer_roles')
    .insert([{ baseline_id: baselineId, people_id: peopleId }])
}

export async function deleteEngineerRole(id) {
  return supabase.from('budget_engineer_roles').delete().eq('id', id)
}
