import { useEffect, useState } from 'react'
import {
  fetchMilestones,
  insertMilestone,
  updateMilestone,
  deleteMilestone,
  fetchEpics,
  assignEpicToMilestone,
  cascadeMilestoneDone,
} from '../lib/queries/milestones'
import { fetchReleases } from '../lib/queries/budget'

const MILESTONE_STATUSES = ['Not Started', 'In Progress', 'QA Approved', 'Done']

const STATUS_CLS = {
  'Not Started':  'bg-slate-100 text-slate-500',
  'In Progress':  'bg-blue-100 text-blue-700',
  'QA Approved':  'bg-purple-100 text-purple-700',
  'Done':         'bg-emerald-100 text-emerald-700',
}

const EMPTY_MILESTONE = { release_id: '', name: '', description: '', status: 'Not Started' }

/* ── Small helpers ── */
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

/* ── Milestone form modal ── */
function MilestoneModal({ form, setForm, releases, onSave, onClose, saving, isEdit }) {
  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }))
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            {isEdit ? 'Edit Milestone' : 'New Milestone'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <Field label="Release">
            <SelectInput
              value={form.release_id}
              onChange={set('release_id')}
              options={releases.map((r) => ({ value: r.id, label: r.version_name }))}
              placeholder="Select release…"
            />
          </Field>
          <Field label="Milestone Name">
            <TextInput value={form.name} onChange={set('name')} placeholder="e.g. Backend API" />
          </Field>
          <Field label="Description">
            <textarea
              value={form.description ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              placeholder="Optional"
              className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
            />
          </Field>
          <Field label="Status">
            <SelectInput
              value={form.status}
              onChange={set('status')}
              options={MILESTONE_STATUSES.map((s) => ({ value: s, label: s }))}
            />
          </Field>
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
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Milestone'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Epic assignment panel ── */
function EpicPanel({ milestone, epics, onAssign, onClose }) {
  const assigned = epics.filter((e) => e.milestone_id === milestone.id)
  const unassigned = epics.filter((e) => !e.milestone_id || e.milestone_id === milestone.id)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-16 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Assign Epics</h2>
            <p className="text-xs text-slate-400 mt-0.5">{milestone.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4">
          {epics.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              No epics found. Epics are synced from Notion via n8n.
            </p>
          ) : (
            <div className="space-y-2">
              {epics.map((epic) => {
                const isAssignedHere = epic.milestone_id === milestone.id
                const isAssignedElsewhere = epic.milestone_id && epic.milestone_id !== milestone.id
                return (
                  <div
                    key={epic.id}
                    className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                      isAssignedHere
                        ? 'border-[#1F3864] bg-blue-50'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{epic.name}</p>
                      {epic.area && <p className="text-xs text-slate-400">{epic.area}</p>}
                      {isAssignedElsewhere && (
                        <p className="text-xs text-amber-600 mt-0.5">Assigned to another milestone</p>
                      )}
                    </div>
                    <button
                      onClick={() => onAssign(epic.id, isAssignedHere ? null : milestone.id)}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                        isAssignedHere
                          ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          : 'bg-[#1F3864] text-white hover:bg-[#162a4e]'
                      }`}
                    >
                      {isAssignedHere ? 'Remove' : 'Assign'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 shrink-0 flex justify-end">
          <button onClick={onClose} className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Main page ── */
export default function MilestoneRegister() {
  const [releases, setReleases] = useState([])
  const [selectedRelease, setSelectedRelease] = useState('')
  const [milestones, setMilestones] = useState([])
  const [epics, setEpics] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null) // null | { mode: 'add'|'edit', id? }
  const [form, setForm] = useState(EMPTY_MILESTONE)
  const [saving, setSaving] = useState(false)
  const [epicPanel, setEpicPanel] = useState(null) // milestone object

  const loadMilestones = async (releaseId) => {
    const { data, error: e } = await fetchMilestones(releaseId || null)
    if (e) { setError(e.message); return }
    setMilestones(data ?? [])
  }

  const loadEpics = async () => {
    const { data, error: e } = await fetchEpics()
    if (e) { setError(e.message); return }
    setEpics(data ?? [])
  }

  useEffect(() => {
    async function init() {
      setLoading(true)
      const { data: rel, error: re } = await fetchReleases()
      if (re) { setError(re.message); setLoading(false); return }
      const relList = rel ?? []
      setReleases(relList)
      const latest = relList[relList.length - 1]?.id ?? ''
      setSelectedRelease(latest)
      await Promise.all([loadMilestones(latest), loadEpics()])
      setLoading(false)
    }
    init()
  }, [])

  const handleReleaseChange = async (id) => {
    setSelectedRelease(id)
    await loadMilestones(id)
  }

  const openAdd = () => {
    setForm({ ...EMPTY_MILESTONE, release_id: selectedRelease })
    setModal({ mode: 'add' })
  }

  const openEdit = (m) => {
    setForm({ release_id: m.release_id, name: m.name, description: m.description ?? '', status: m.status ?? 'Not Started' })
    setModal({ mode: 'edit', id: m.id })
  }

  const handleSave = async () => {
    if (!form.name) { alert('Milestone name is required.'); return }
    if (!form.release_id) { alert('Please select a release.'); return }
    setSaving(true)
    const payload = {
      release_id: Number(form.release_id),
      name: form.name,
      description: form.description || null,
      status: form.status || 'Not Started',
    }
    const { data: saved, error: e } =
      modal.mode === 'add'
        ? await insertMilestone(payload)
        : await updateMilestone(modal.id, payload)
    if (e) { setSaving(false); alert(e.message); return }

    // Cascade: mark all tasks in this milestone's epics as Done
    if (payload.status === 'Done') {
      const milestoneId = modal.mode === 'edit' ? modal.id : saved?.id
      if (milestoneId) {
        const { error: ce } = await cascadeMilestoneDone(milestoneId)
        if (ce) alert(`Milestone saved, but failed to cascade Done to tasks: ${ce.message}`)
      }
    }

    setSaving(false)
    setModal(null)
    await loadMilestones(selectedRelease)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this milestone? Epics assigned to it will be unlinked.')) return
    const { error: e } = await deleteMilestone(id)
    if (e) { alert(e.message); return }
    await loadMilestones(selectedRelease)
  }

  const handleAssignEpic = async (epicId, milestoneId) => {
    const { error: e } = await assignEpicToMilestone(epicId, milestoneId)
    if (e) { alert(e.message); return }
    await loadEpics()
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Milestone Register</h1>
          <p className="text-sm text-slate-500 mt-1">Group epics into milestones per release</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
            value={selectedRelease}
            onChange={(e) => handleReleaseChange(e.target.value)}
          >
            <option value="">All releases</option>
            {releases.map((r) => (
              <option key={r.id} value={r.id}>{r.version_name}</option>
            ))}
          </select>
          <button
            onClick={openAdd}
            className="rounded-md bg-[#1F3864] px-4 py-2 text-sm font-medium text-white hover:bg-[#162a4e]"
          >
            + New Milestone
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : milestones.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400">
          No milestones yet for this release. Create the first one.
        </div>
      ) : (
        <div className="space-y-4">
          {milestones.map((m) => {
            const epicList = epics.filter((e) => e.milestone_id === m.id)
            return (
              <div key={m.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                {/* Milestone header */}
                <div className="flex items-start justify-between px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-slate-900">{m.name}</span>
                      <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
                        {m.releases?.version_name ?? '—'}
                      </span>
                      <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_CLS[m.status] ?? STATUS_CLS['Not Started']}`}>
                        {m.status ?? 'Not Started'}
                      </span>
                    </div>
                    {m.description && (
                      <p className="text-sm text-slate-500 mt-1">{m.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <button
                      onClick={() => setEpicPanel(m)}
                      className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                    >
                      Assign Epics
                    </button>
                    <button
                      onClick={() => openEdit(m)}
                      className="text-sm text-[#1F3864] hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="text-sm text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Epics assigned */}
                {epicList.length > 0 ? (
                  <div className="border-t border-slate-100 px-5 py-3">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
                      Epics ({epicList.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {epicList.map((epic) => (
                        <span
                          key={epic.id}
                          className="inline-flex items-center rounded-full bg-blue-50 border border-blue-100 px-3 py-1 text-xs text-blue-700"
                        >
                          {epic.name}
                          {epic.area && <span className="ml-1 text-blue-400">· {epic.area}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-slate-100 px-5 py-3">
                    <p className="text-xs text-slate-400">No epics assigned yet — click "Assign Epics" to link them.</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <MilestoneModal
          form={form}
          setForm={setForm}
          releases={releases}
          onSave={handleSave}
          onClose={() => setModal(null)}
          saving={saving}
          isEdit={modal.mode === 'edit'}
        />
      )}

      {epicPanel && (
        <EpicPanel
          milestone={epicPanel}
          epics={epics}
          onAssign={handleAssignEpic}
          onClose={() => setEpicPanel(null)}
        />
      )}
    </div>
  )
}
