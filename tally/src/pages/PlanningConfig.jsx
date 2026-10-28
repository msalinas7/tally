import { useEffect, useState } from 'react'
import { fetchReleases } from '../lib/queries/budget'
import { fetchPeople } from '../lib/queries/budget'
import {
  fetchProjectSettings,
  upsertProjectSettings,
  fetchHolidaysPTO,
  insertHolidayPTO,
  deleteHolidayPTO,
} from '../lib/queries/planning'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 7]
const DEFAULT_SETTINGS = {
  start_date:      '',
  hours_per_point: 4,
  hours_per_day:   6,
  working_days:    [1, 2, 3, 4, 5],
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[10px] text-slate-400">{hint}</p>}
    </div>
  )
}

function SectionHeading({ children }) {
  return (
    <h2 className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-2 mb-4">
      {children}
    </h2>
  )
}

// ── Project Settings form ─────────────────────────────────────────────────────

function ProjectSettingsForm({ releaseId }) {
  const [form, setForm] = useState(DEFAULT_SETTINGS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!releaseId) return
    setLoading(true)
    fetchProjectSettings(releaseId).then(({ data }) => {
      if (data) {
        setForm({
          start_date:      data.start_date ?? '',
          hours_per_point: data.hours_per_point ?? 4,
          hours_per_day:   data.hours_per_day ?? 6,
          working_days:    data.working_days ?? [1, 2, 3, 4, 5],
        })
      } else {
        setForm(DEFAULT_SETTINGS)
      }
      setLoading(false)
    })
  }, [releaseId])

  const toggleDay = (day) => {
    setForm((f) => ({
      ...f,
      working_days: f.working_days.includes(day)
        ? f.working_days.filter((d) => d !== day)
        : [...f.working_days, day].sort(),
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    const { error } = await upsertProjectSettings(releaseId, {
      start_date:      form.start_date || null,
      hours_per_point: Number(form.hours_per_point),
      hours_per_day:   Number(form.hours_per_day),
      working_days:    form.working_days,
    })
    setSaving(false)
    if (error) { alert(error.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>

  return (
    <div className="space-y-5">
      <Field label="Version Start Date" hint="First working day of this release cycle">
        <input
          type="date"
          value={form.start_date}
          onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
          className="rounded-md border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
        />
      </Field>

      <Field label="Hours per Story Point" hint="1 SP = N working hours (used to compute task durations)">
        <input
          type="number"
          min={0.5}
          max={16}
          step={0.5}
          value={form.hours_per_point}
          onChange={(e) => setForm((f) => ({ ...f, hours_per_point: e.target.value }))}
          className="w-24 rounded-md border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
        />
      </Field>

      <Field label="Effective Hours per Day" hint="Average productive hours per engineer per working day">
        <input
          type="number"
          min={1}
          max={12}
          step={0.5}
          value={form.hours_per_day}
          onChange={(e) => setForm((f) => ({ ...f, hours_per_day: e.target.value }))}
          className="w-24 rounded-md border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
        />
      </Field>

      <Field label="Working Days">
        <div className="flex gap-2 mt-1">
          {DAY_VALUES.map((d, i) => {
            const active = form.working_days.includes(d)
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={`w-10 h-10 rounded-md text-xs font-medium transition-colors ${
                  active
                    ? 'bg-[#1F3864] text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {DAY_LABELS[i]}
              </button>
            )
          })}
        </div>
      </Field>

      <div className="pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-[#1F3864] px-4 py-2 text-sm font-medium text-white hover:bg-[#162a4e] disabled:opacity-50"
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}

// ── Holidays / PTO table ─────────────────────────────────────────────────────

const EMPTY_ENTRY = { date: '', kind: 'holiday', name: '', people_id: '', notes: '' }

function HolidaysPTOSection({ releaseId, people }) {
  const [entries, setEntries] = useState([])
  const [form, setForm] = useState(EMPTY_ENTRY)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const { data } = await fetchHolidaysPTO(releaseId)
    setEntries(data ?? [])
  }

  useEffect(() => { load() }, [releaseId])

  const handleAdd = async () => {
    if (!form.date || !form.name) { alert('Date and name are required.'); return }
    setSaving(true)
    const payload = {
      date:       form.date,
      kind:       form.kind,
      name:       form.name,
      notes:      form.notes || null,
      people_id:  form.kind === 'pto' && form.people_id ? Number(form.people_id) : null,
      release_id: releaseId ? Number(releaseId) : null,
    }
    const { error } = await insertHolidayPTO(payload)
    setSaving(false)
    if (error) { alert(error.message); return }
    setForm(EMPTY_ENTRY)
    setAdding(false)
    await load()
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this entry?')) return
    await deleteHolidayPTO(id)
    await load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <SectionHeading>Holidays &amp; PTO</SectionHeading>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="text-xs text-[#1F3864] hover:underline"
        >
          {adding ? 'Cancel' : '+ Add entry'}
        </button>
      </div>

      {adding && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
              />
            </Field>
            <Field label="Type">
              <select
                value={form.kind}
                onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value, people_id: '' }))}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
              >
                <option value="holiday">Holiday (company-wide)</option>
                <option value="pto">PTO (individual)</option>
              </select>
            </Field>
          </div>

          <Field label="Name">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Christmas Day, Elkerton PTO"
              className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
            />
          </Field>

          {form.kind === 'pto' && (
            <Field label="Engineer">
              <select
                value={form.people_id}
                onChange={(e) => setForm((f) => ({ ...f, people_id: e.target.value }))}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
              >
                <option value="">Select engineer…</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Notes (optional)">
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
            />
          </Field>

          <button
            type="button"
            onClick={handleAdd}
            disabled={saving}
            className="rounded-md bg-[#1F3864] px-4 py-2 text-sm font-medium text-white hover:bg-[#162a4e] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add Entry'}
          </button>
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">No holidays or PTO entries.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Date', 'Type', 'Name', 'Engineer', 'Notes', ''].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 tabular-nums text-slate-700">{e.date}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      e.kind === 'holiday' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {e.kind === 'holiday' ? 'Holiday' : 'PTO'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-800 font-medium">{e.name}</td>
                  <td className="px-4 py-2.5 text-slate-500">{e.people?.name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-400 text-xs">{e.notes ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(e.id)}
                      className="text-xs text-red-400 hover:text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PlanningConfig() {
  const [releases, setReleases] = useState([])
  const [selectedRelease, setSelectedRelease] = useState('')
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      const [{ data: rel }, { data: ppl }] = await Promise.all([
        fetchReleases(),
        fetchPeople(),
      ])
      const relList = rel ?? []
      setReleases(relList)
      setPeople(ppl ?? [])
      const latest = relList[relList.length - 1]?.id ?? ''
      setSelectedRelease(String(latest))
      setLoading(false)
    }
    init()
  }, [])

  if (loading) {
    return <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Planning Config</h1>
          <p className="mt-1 text-sm text-slate-500">Configure timeline settings per release version</p>
        </div>
        <select
          value={selectedRelease}
          onChange={(e) => setSelectedRelease(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
        >
          {releases.map((r) => (
            <option key={r.id} value={r.id}>{r.version_name}</option>
          ))}
        </select>
      </div>

      {selectedRelease && (
        <>
          {/* Version settings */}
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <SectionHeading>Version Settings</SectionHeading>
            <ProjectSettingsForm releaseId={Number(selectedRelease)} />
          </div>

          {/* Holidays / PTO */}
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <HolidaysPTOSection releaseId={Number(selectedRelease)} people={people} />
          </div>
        </>
      )}
    </div>
  )
}
