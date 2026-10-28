import { supabase } from '../supabase'

// ── Project Settings ─────────────────────────────────────────────────────────

export async function fetchProjectSettings(releaseId) {
  return supabase
    .from('project_settings')
    .select('*')
    .eq('release_id', releaseId)
    .maybeSingle()
}

export async function upsertProjectSettings(releaseId, values) {
  return supabase
    .from('project_settings')
    .upsert({ release_id: releaseId, ...values }, { onConflict: 'release_id' })
    .select()
    .single()
}

// ── Holidays / PTO ───────────────────────────────────────────────────────────

export async function fetchHolidaysPTO(releaseId) {
  const q = supabase
    .from('holidays_pto')
    .select('id, date, kind, name, notes, people_id, release_id, people(id, name)')
    .order('date', { ascending: true })
  if (releaseId) q.or(`release_id.eq.${releaseId},release_id.is.null`)
  return q
}

export async function insertHolidayPTO(row) {
  return supabase.from('holidays_pto').insert([row]).select().single()
}

export async function deleteHolidayPTO(id) {
  return supabase.from('holidays_pto').delete().eq('id', id)
}
