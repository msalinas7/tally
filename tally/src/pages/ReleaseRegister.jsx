import { useEffect, useState } from 'react'
import {
  fetchReleasesWithProject,
  fetchProjects,
  insertRelease,
  updateRelease,
  deleteRelease,
} from '../lib/queries/releases'

const fmt$ = (n) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')

const STATUS_COLORS = {
  Planning:    'bg-slate-100 text-slate-600',
  'In Progress': 'bg-blue-100 text-blue-700',
  Released:    'bg-emerald-100 text-emerald-700',
  'On Hold':   'bg-amber-100 text-amber-700',
  Cancelled:   'bg-red-100 text-red-600',
}

const STATUSES = ['Planning', 'In Progress', 'Released', 'On Hold', 'Cancelled']
const RELEASE_TYPES = ['Major', 'Minor', 'Patch', 'Hotfix']

const EMPTY = {
  project_id: '',
  version_name: '',
  release_type: '',
  status: 'Planning',
  start_date: '',
  planned_delivery_date: '',
  delivery_date: '',
  budgeted_cost: '',
  actual_cost: '',
  estimated_hours: '',
  dev_hours: '',
  change_requests_count: '',
  bugs_in_qa: '',
  escaped_defects: '',
  hotfixes_30d: '',
  rollback: false,
  team_size: '',
  contingency: '',
  notes: '',
}

function Badge({ status }) {
  const cls = STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600'
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{status ?? '—'}</span>
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, type = 'text', placeholder }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
    />
  )
}

function SelectInput({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
      ))}
    </select>
  )
}

/* ── Release form (add / edit) ── */
function ReleaseModal({ form, setForm, projects, onSave, onClose, saving, isEdit }) {
  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }))

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-16 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">{isEdit ? 'Edit Release' : 'New Release'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-5 grid grid-cols-2 gap-4">
          {/* Core */}
          <Field label="Project">
            <SelectInput
              value={form.project_id}
              onChange={set('project_id')}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              placeholder="Select project…"
            />
          </Field>
          <Field label="Version Name">
            <TextInput value={form.version_name} onChange={set('version_name')} placeholder="e.g. V3" />
          </Field>
          <Field label="Release Type">
            <SelectInput value={form.release_type} onChange={set('release_type')} options={RELEASE_TYPES} placeholder="Select…" />
          </Field>
          <Field label="Status">
            <SelectInput value={form.status} onChange={set('status')} options={STATUSES} />
          </Field>

          {/* Dates */}
          <Field label="Start Date">
            <TextInput type="date" value={form.start_date} onChange={set('start_date')} />
          </Field>
          <Field label="Planned Delivery">
            <TextInput type="date" value={form.planned_delivery_date} onChange={set('planned_delivery_date')} />
          </Field>
          <Field label="Actual Delivery">
            <TextInput type="date" value={form.delivery_date} onChange={set('delivery_date')} />
          </Field>
          <Field label="Team Size">
            <TextInput type="number" value={form.team_size} onChange={set('team_size')} placeholder="0" />
          </Field>

          {/* Budget */}
          <Field label="Budgeted Cost ($)">
            <TextInput type="number" value={form.budgeted_cost} onChange={set('budgeted_cost')} placeholder="0.00" />
          </Field>
          <Field label="Actual Cost ($)">
            <TextInput type="number" value={form.actual_cost} onChange={set('actual_cost')} placeholder="0.00" />
          </Field>
          <Field label="Estimated Hours">
            <TextInput type="number" value={form.estimated_hours} onChange={set('estimated_hours')} placeholder="0" />
          </Field>
          <Field label="Dev Hours">
            <TextInput type="number" value={form.dev_hours} onChange={set('dev_hours')} placeholder="0" />
          </Field>
          <Field label="Contingency ($)">
            <TextInput type="number" value={form.contingency} onChange={set('contingency')} placeholder="0.00" />
          </Field>

          {/* QA / Quality */}
          <Field label="Change Requests">
            <TextInput type="number" value={form.change_requests_count} onChange={set('change_requests_count')} placeholder="0" />
          </Field>
          <Field label="Bugs in QA">
            <TextInput type="number" value={form.bugs_in_qa} onChange={set('bugs_in_qa')} placeholder="0" />
          </Field>
          <Field label="Escaped Defects">
            <TextInput type="number" value={form.escaped_defects} onChange={set('escaped_defects')} placeholder="0" />
          </Field>
          <Field label="Hotfixes (30d post-release)">
            <TextInput type="number" value={form.hotfixes_30d} onChange={set('hotfixes_30d')} placeholder="0" />
          </Field>

          {/* Flags */}
          <Field label="Rollback?">
            <label className="flex items-center gap-2 mt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={form.rollback ?? false}
                onChange={(e) => setForm((f) => ({ ...f, rollback: e.target.checked }))}
                className="rounded border-slate-300 text-[#1F3864] focus:ring-[#1F3864]"
              />
              <span className="text-sm text-slate-600">Release was rolled back</span>
            </label>
          </Field>

          {/* Notes — full width */}
          <div className="col-span-2">
            <Field label="Notes">
              <textarea
                value={form.notes ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                placeholder="Any additional context…"
                className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
              />
            </Field>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded-md bg-[#1F3864] px-4 py-2 text-sm font-medium text-white hover:bg-[#162a4e] disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Release'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Main page ── */
export default function ReleaseRegister() {
  const [releases, setReleases] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null) // null | { mode: 'add' | 'edit', data: {} }
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  const load = async () => {
    setLoading(true)
    const [{ data: r, error: re }, { data: p, error: pe }] = await Promise.all([
      fetchReleasesWithProject(),
      fetchProjects(),
    ])
    if (re || pe) { setError((re ?? pe).message); setLoading(false); return }
    setReleases(r ?? [])
    setProjects(p ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setForm({ ...EMPTY, project_id: projects[0]?.id ?? '' })
    setModal({ mode: 'add' })
  }

  const openEdit = (release) => {
    setForm({
      project_id: release.projects?.id ?? '',
      version_name: release.version_name ?? '',
      release_type: release.release_type ?? '',
      status: release.status ?? 'Planning',
      start_date: release.start_date ?? '',
      planned_delivery_date: release.planned_delivery_date ?? '',
      delivery_date: release.delivery_date ?? '',
      budgeted_cost: release.budgeted_cost ?? '',
      actual_cost: release.actual_cost ?? '',
      estimated_hours: release.estimated_hours ?? '',
      dev_hours: release.dev_hours ?? '',
      change_requests_count: release.change_requests_count ?? '',
      bugs_in_qa: release.bugs_in_qa ?? '',
      escaped_defects: release.escaped_defects ?? '',
      hotfixes_30d: release.hotfixes_30d ?? '',
      rollback: release.rollback ?? false,
      team_size: release.team_size ?? '',
      contingency: release.contingency ?? '',
      notes: release.notes ?? '',
    })
    setModal({ mode: 'edit', id: release.id })
  }

  const cleanForm = () => {
    const out = { ...form }
    const nums = ['budgeted_cost', 'actual_cost', 'estimated_hours', 'dev_hours',
      'change_requests_count', 'bugs_in_qa', 'escaped_defects', 'hotfixes_30d',
      'team_size', 'contingency']
    nums.forEach((k) => { out[k] = out[k] === '' ? null : Number(out[k]) })
    const dates = ['start_date', 'planned_delivery_date', 'delivery_date']
    dates.forEach((k) => { out[k] = out[k] === '' ? null : out[k] })
    if (!out.project_id) delete out.project_id
    else out.project_id = Number(out.project_id)
    if (!out.release_type) out.release_type = null
    return out
  }

  const handleSave = async () => {
    if (!form.version_name) { alert('Version name is required.'); return }
    setSaving(true)
    const payload = cleanForm()
    const { error: e } =
      modal.mode === 'add'
        ? await insertRelease(payload)
        : await updateRelease(modal.id, payload)
    setSaving(false)
    if (e) { alert(e.message); return }
    setModal(null)
    load()
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this release? This cannot be undone.')) return
    const { error: e } = await deleteRelease(id)
    if (e) { alert(e.message); return }
    load()
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Release Register</h1>
          <p className="text-sm text-slate-500 mt-1">All project versions and their delivery metrics</p>
        </div>
        <button
          onClick={openAdd}
          className="rounded-md bg-[#1F3864] px-4 py-2 text-sm font-medium text-white hover:bg-[#162a4e]"
        >
          + New Release
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : releases.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400">No releases yet. Create the first one.</div>
      ) : (
        <div className="space-y-3">
          {releases.map((r) => {
            const isExpanded = expandedId === r.id
            const isLate =
              r.planned_delivery_date &&
              !r.delivery_date &&
              new Date(r.planned_delivery_date) < new Date()

            return (
              <div key={r.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                {/* Row header */}
                <div
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50"
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-slate-900">{r.version_name}</span>
                      <Badge status={r.status} />
                      {r.rollback && (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700">
                          Rolled Back
                        </span>
                      )}
                      {isLate && (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700">
                          Overdue
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {r.projects?.name ?? '—'} · {r.release_type ?? 'Release'} · {fmtDate(r.start_date)} → {fmtDate(r.planned_delivery_date)}
                    </p>
                  </div>

                  {/* Quick stats */}
                  <div className="hidden md:flex items-center gap-6 text-sm text-slate-600 shrink-0">
                    <div className="text-center">
                      <p className="text-xs text-slate-400">Budget</p>
                      <p className="font-medium">{fmt$(r.budgeted_cost)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-400">Actual</p>
                      <p className="font-medium">{fmt$(r.actual_cost)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-400">Team</p>
                      <p className="font-medium">{r.team_size ?? '—'}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-400">Escaped</p>
                      <p className="font-medium">{r.escaped_defects ?? '—'}</p>
                    </div>
                  </div>

                  <svg
                    className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-slate-100 px-5 py-4">
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-x-6 gap-y-4 text-sm mb-4">
                      <Stat label="Start Date" value={fmtDate(r.start_date)} />
                      <Stat label="Planned Delivery" value={fmtDate(r.planned_delivery_date)} />
                      <Stat label="Actual Delivery" value={fmtDate(r.delivery_date)} />
                      <Stat label="Est. Hours" value={r.estimated_hours ?? '—'} />
                      <Stat label="Dev Hours" value={r.dev_hours ?? '—'} />
                      <Stat label="Budgeted Cost" value={fmt$(r.budgeted_cost)} />
                      <Stat label="Actual Cost" value={fmt$(r.actual_cost)} />
                      <Stat label="Contingency" value={fmt$(r.contingency)} />
                      <Stat label="Team Size" value={r.team_size ?? '—'} />
                      <Stat label="Change Requests" value={r.change_requests_count ?? '—'} />
                      <Stat label="Bugs in QA" value={r.bugs_in_qa ?? '—'} />
                      <Stat label="Escaped Defects" value={r.escaped_defects ?? '—'} />
                      <Stat label="Hotfixes (30d)" value={r.hotfixes_30d ?? '—'} />
                      <Stat label="Rollback" value={r.rollback ? 'Yes' : 'No'} warn={r.rollback} />
                    </div>

                    {r.notes && (
                      <p className="text-xs text-slate-500 bg-slate-50 rounded-md px-3 py-2 mb-4">{r.notes}</p>
                    )}

                    <div className="flex gap-3 justify-end">
                      <button
                        onClick={() => openEdit(r)}
                        className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <ReleaseModal
          form={form}
          setForm={setForm}
          projects={projects}
          onSave={handleSave}
          onClose={() => setModal(null)}
          saving={saving}
          isEdit={modal.mode === 'edit'}
        />
      )}
    </div>
  )
}

function Stat({ label, value, warn }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`font-medium mt-0.5 ${warn ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}
