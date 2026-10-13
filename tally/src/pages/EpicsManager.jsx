import { useEffect, useState } from 'react'
import {
  fetchEpics,
  fetchMilestones,
  insertEpic,
  updateEpic,
  deleteEpic,
} from '../lib/queries/milestones'
import { fetchProjects } from '../lib/queries/releases'

const EMPTY = { project_id: '', name: '', area: '', milestone_id: '' }

/* ── Helpers ── */
function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder }) {
  return (
    <input
      type="text"
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
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

/* ── Modal ── */
function EpicModal({ form, setForm, projects, milestones, onSave, onClose, saving, isEdit }) {
  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }))

  const filteredMilestones = milestones.filter(
    (m) => !form.project_id || String(m.release?.project_id) === String(form.project_id) || true
  )

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            {isEdit ? 'Edit Epic' : 'New Epic'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <Field label="Project">
            <SelectInput
              value={form.project_id}
              onChange={set('project_id')}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              placeholder="Select project…"
            />
          </Field>
          <Field label="Epic Name">
            <TextInput value={form.name} onChange={set('name')} placeholder="e.g. Authentication" />
          </Field>
          <Field label="Area / Category">
            <TextInput value={form.area} onChange={set('area')} placeholder="e.g. Backend, Mobile, UI" />
          </Field>
          <Field label="Milestone (optional)">
            <SelectInput
              value={form.milestone_id}
              onChange={set('milestone_id')}
              options={milestones.map((m) => ({ value: m.id, label: `${m.name} — ${m.releases?.version_name ?? ''}` }))}
              placeholder="Assign to milestone…"
            />
          </Field>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded-md bg-[#1F3864] px-4 py-2 text-sm font-medium text-white hover:bg-[#162a4e] disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Epic'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Main page ── */
export default function EpicsManager() {
  const [epics, setEpics] = useState([])
  const [projects, setProjects] = useState([])
  const [milestones, setMilestones] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterProject, setFilterProject] = useState('')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const loadAll = async () => {
    const [{ data: e, error: ee }, { data: p, error: pe }, { data: m, error: me }] =
      await Promise.all([fetchEpics(), fetchProjects(), fetchMilestones()])
    if (ee || pe || me) { setError((ee ?? pe ?? me).message); return }
    setEpics(e ?? [])
    setProjects(p ?? [])
    setMilestones(m ?? [])
  }

  useEffect(() => {
    async function init() {
      setLoading(true)
      await loadAll()
      setLoading(false)
    }
    init()
  }, [])

  const openAdd = () => {
    setForm({ ...EMPTY, project_id: projects[0]?.id ?? '' })
    setModal({ mode: 'add' })
  }

  const openEdit = (epic) => {
    setForm({
      project_id: epic.project_id ?? '',
      name: epic.name ?? '',
      area: epic.area ?? '',
      milestone_id: epic.milestone_id ?? '',
    })
    setModal({ mode: 'edit', id: epic.id })
  }

  const handleSave = async () => {
    if (!form.name) { alert('Epic name is required.'); return }
    setSaving(true)
    const payload = {
      project_id: form.project_id ? Number(form.project_id) : null,
      name: form.name,
      area: form.area || null,
      milestone_id: form.milestone_id ? Number(form.milestone_id) : null,
    }
    const { error: e } =
      modal.mode === 'add'
        ? await insertEpic(payload)
        : await updateEpic(modal.id, payload)
    setSaving(false)
    if (e) { alert(e.message); return }
    setModal(null)
    await loadAll()
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this epic? Tasks linked to it will lose their epic association.')) return
    const { error: e } = await deleteEpic(id)
    if (e) { alert(e.message); return }
    await loadAll()
  }

  // Filtered list
  const filtered = epics.filter((ep) => {
    const matchProject = !filterProject || String(ep.project_id) === String(filterProject)
    const matchSearch =
      !search ||
      ep.name?.toLowerCase().includes(search.toLowerCase()) ||
      ep.area?.toLowerCase().includes(search.toLowerCase())
    return matchProject && matchSearch
  })

  // Group by milestone for display
  const grouped = filtered.reduce((acc, ep) => {
    const key = ep.milestone_id ? String(ep.milestone_id) : '__none__'
    if (!acc[key]) acc[key] = { milestone: ep.milestones, epics: [] }
    acc[key].epics.push(ep)
    return acc
  }, {})

  const sortedGroups = [
    ...Object.entries(grouped).filter(([k]) => k !== '__none__'),
    ...Object.entries(grouped).filter(([k]) => k === '__none__'),
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Epics</h1>
          <p className="text-sm text-slate-500 mt-1">Manage epics and assign them to milestones</p>
        </div>
        <button
          onClick={openAdd}
          className="rounded-md bg-[#1F3864] px-4 py-2 text-sm font-medium text-white hover:bg-[#162a4e]"
        >
          + New Epic
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search epics…"
          className="rounded-md border border-slate-200 px-3 py-2 text-sm w-56 focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
        />
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="rounded-md border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <span className="ml-auto text-sm text-slate-400 self-center">{filtered.length} epic{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400">
          No epics yet. Create the first one or adjust your filters.
        </div>
      ) : (
        <div className="space-y-6">
          {sortedGroups.map(([key, group]) => (
            <div key={key}>
              {/* Group heading */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {key === '__none__' ? 'No milestone assigned' : group.milestone?.name ?? 'Milestone'}
                </span>
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400">{group.epics.length}</span>
              </div>

              {/* Epic table */}
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['Epic Name', 'Area', 'Project', 'Milestone', ''].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {group.epics.map((ep) => (
                      <tr key={ep.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{ep.name}</td>
                        <td className="px-4 py-3">
                          {ep.area ? (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                              {ep.area}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{ep.projects?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-500">
                          {ep.milestones?.name ?? (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-3 justify-end">
                            <button
                              onClick={() => openEdit(ep)}
                              className="text-xs text-[#1F3864] hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(ep.id)}
                              className="text-xs text-red-500 hover:underline"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <EpicModal
          form={form}
          setForm={setForm}
          projects={projects}
          milestones={milestones}
          onSave={handleSave}
          onClose={() => setModal(null)}
          saving={saving}
          isEdit={modal.mode === 'edit'}
        />
      )}
    </div>
  )
}
