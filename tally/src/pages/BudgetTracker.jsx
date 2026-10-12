import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import {
  fetchReleases,
  fetchBudgetBaseline,
  fetchWrikeHoursByRelease,
  insertBaselineRow,
  updateBaselineRow,
  deleteBaselineRow,
} from '../lib/queries/budget'

const fmt = (n) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const fmtHrs = (n) => (n == null ? '—' : `${Number(n).toFixed(1)} h`)
const burnPct = (actual, budget) => (budget ? Math.round((actual / budget) * 100) : 0)

export default function BudgetTracker() {
  const [tab, setTab] = useState('overview')
  const [releases, setReleases] = useState([])
  const [selectedRelease, setSelectedRelease] = useState(null)
  const [baseline, setBaseline] = useState([])
  const [wrike, setWrike] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchReleases().then(({ data, error: e }) => {
      if (e) { setError(e.message); return }
      setReleases(data ?? [])
      if (data?.length > 0) setSelectedRelease(data[data.length - 1].id)
    })
  }, [])

  const loadData = (releaseId) => {
    if (!releaseId) return
    setLoading(true)
    Promise.all([fetchBudgetBaseline(releaseId), fetchWrikeHoursByRelease()]).then(
      ([{ data: b, error: be }, { data: w, error: we }]) => {
        if (be || we) { setError((be ?? we).message); setLoading(false); return }
        setBaseline(b ?? [])
        setWrike(w ?? [])
        setLoading(false)
      }
    )
  }

  useEffect(() => { loadData(selectedRelease) }, [selectedRelease])

  const merged = baseline.map((row) => {
    const actuals = wrike.filter((w) => w.resource === row.resource)
    const actualHours = actuals.reduce((s, w) => s + Number(w.hours_logged ?? 0), 0)
    const actualCost = actuals.reduce((s, w) => s + Number(w.actual_cost ?? 0), 0)
    return {
      ...row,
      actualHours,
      actualCost,
      variance: Number(row.budgeted_cost) - actualCost,
      burn: burnPct(actualCost, row.budgeted_cost),
    }
  })

  const totalBudget = merged.reduce((s, r) => s + Number(r.budgeted_cost ?? 0), 0)
  const totalActual = merged.reduce((s, r) => s + r.actualCost, 0)
  const totalVariance = totalBudget - totalActual
  const totalBurn = burnPct(totalActual, totalBudget)

  const chartData = merged.map((r) => ({
    name: r.resource.split(' ')[0],
    Budgeted: Number(r.budgeted_cost),
    Actual: r.actualCost,
  }))

  const currentReleaseName = releases.find((r) => r.id === selectedRelease)?.version_name ?? ''

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Budget Tracker</h1>
          <p className="text-sm text-slate-500 mt-1">SOW baseline vs. actual Wrike hours</p>
        </div>
        <select
          className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
          value={selectedRelease ?? ''}
          onChange={(e) => setSelectedRelease(Number(e.target.value))}
        >
          {releases.map((r) => (
            <option key={r.id} value={r.id}>{r.version_name}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'baseline', label: 'Baseline Maintenance' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-[#1F3864] text-[#1F3864]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : tab === 'overview' ? (
        <Overview
          merged={merged}
          chartData={chartData}
          totalBudget={totalBudget}
          totalActual={totalActual}
          totalVariance={totalVariance}
          totalBurn={totalBurn}
          releaseName={currentReleaseName}
        />
      ) : (
        <BaselineMaintenance
          baseline={baseline}
          selectedRelease={selectedRelease}
          onRefresh={() => loadData(selectedRelease)}
        />
      )}
    </div>
  )
}

/* ── Summary card ── */
function SummaryCard({ label, value, sub, warn }) {
  return (
    <div className={`rounded-lg border p-4 ${warn ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold text-slate-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

/* ── Burn bar ── */
function BurnBar({ pct }) {
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-emerald-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs text-slate-600 w-8 text-right">{pct}%</span>
    </div>
  )
}

/* ── Overview tab ── */
function Overview({ merged, chartData, totalBudget, totalActual, totalVariance, totalBurn, releaseName }) {
  return (
    <>
      <div className="grid grid-cols-4 gap-4 mb-8">
        <SummaryCard label="Total Budgeted" value={fmt(totalBudget)} sub={releaseName} />
        <SummaryCard label="Total Actual" value={fmt(totalActual)} />
        <SummaryCard label="Remaining" value={fmt(totalVariance)} warn={totalVariance < 0} />
        <SummaryCard label="Burn %" value={`${totalBurn}%`} sub="of total budget" warn={totalBurn >= 90} />
      </div>

      {chartData.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
          <p className="text-sm font-medium text-slate-700 mb-4">Budget vs. Actual by Resource</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Legend />
              <Bar dataKey="Budgeted" fill="#1F3864" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Actual" fill="#60a5fa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Resource', 'Role', 'Alloc. Hrs', 'Actual Hrs', 'Budgeted', 'Actual', 'Variance', 'Burn'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {merged.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  No baseline data for this release. Add resources in Baseline Maintenance.
                </td>
              </tr>
            ) : (
              merged.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.resource}</td>
                  <td className="px-4 py-3 text-slate-500">{row.role ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{fmtHrs(row.allocated_hours)}</td>
                  <td className="px-4 py-3 text-slate-700">{fmtHrs(row.actualHours)}</td>
                  <td className="px-4 py-3 text-slate-700">{fmt(row.budgeted_cost)}</td>
                  <td className="px-4 py-3 text-slate-700">{fmt(row.actualCost)}</td>
                  <td className={`px-4 py-3 font-medium ${row.variance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {fmt(row.variance)}
                  </td>
                  <td className="px-4 py-3 w-32">
                    <BurnBar pct={row.burn} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ── Baseline Maintenance tab ── */
function BaselineMaintenance({ baseline, selectedRelease, onRefresh }) {
  const empty = { resource: '', role: '', hourly_rate: '', allocated_hours: '', notes: '' }
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)

  const handleAdd = async () => {
    if (!form.resource || !form.hourly_rate || !form.allocated_hours) {
      alert('Resource, rate, and hours are required.')
      return
    }
    setSaving(true)
    const { error } = await insertBaselineRow({ ...form, release_id: selectedRelease })
    setSaving(false)
    if (error) { alert(error.message); return }
    setAdding(false)
    setForm(empty)
    onRefresh()
  }

  const handleUpdate = async (id) => {
    setSaving(true)
    const { error } = await updateBaselineRow(id, editForm)
    setSaving(false)
    if (error) { alert(error.message); return }
    setEditId(null)
    onRefresh()
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this resource from the baseline?')) return
    const { error } = await deleteBaselineRow(id)
    if (error) { alert(error.message); return }
    onRefresh()
  }

  const Input = ({ value, onChange, type = 'text', placeholder }) => (
    <input
      type={type}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
    />
  )

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <p className="text-sm font-medium text-slate-700">Resource allocation for this release</p>
        <button
          onClick={() => { setAdding(true); setForm(empty) }}
          className="rounded-md bg-[#1F3864] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#162a4e]"
        >
          + Add Resource
        </button>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            {['Resource', 'Role', 'Rate ($/hr)', 'Allocated Hrs', 'Budgeted Cost', 'Notes', ''].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {adding && (
            <tr className="bg-blue-50">
              <td className="px-3 py-2">
                <Input value={form.resource} onChange={(v) => setForm((f) => ({ ...f, resource: v }))} placeholder="Full name" />
              </td>
              <td className="px-3 py-2">
                <Input value={form.role} onChange={(v) => setForm((f) => ({ ...f, role: v }))} placeholder="e.g. Developer" />
              </td>
              <td className="px-3 py-2">
                <Input type="number" value={form.hourly_rate} onChange={(v) => setForm((f) => ({ ...f, hourly_rate: v }))} placeholder="0.00" />
              </td>
              <td className="px-3 py-2">
                <Input type="number" value={form.allocated_hours} onChange={(v) => setForm((f) => ({ ...f, allocated_hours: v }))} placeholder="0" />
              </td>
              <td className="px-3 py-2 text-xs text-slate-400 italic">Auto-calculated</td>
              <td className="px-3 py-2">
                <Input value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} placeholder="Optional" />
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-3">
                  <button onClick={handleAdd} disabled={saving} className="text-xs font-medium text-emerald-600 hover:underline">
                    Save
                  </button>
                  <button onClick={() => setAdding(false)} className="text-xs text-slate-400 hover:underline">
                    Cancel
                  </button>
                </div>
              </td>
            </tr>
          )}

          {baseline.length === 0 && !adding ? (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                No resources yet. Click "+ Add Resource" to start.
              </td>
            </tr>
          ) : (
            baseline.map((row) =>
              editId === row.id ? (
                <tr key={row.id} className="bg-amber-50">
                  <td className="px-3 py-2">
                    <Input value={editForm.resource} onChange={(v) => setEditForm((f) => ({ ...f, resource: v }))} />
                  </td>
                  <td className="px-3 py-2">
                    <Input value={editForm.role} onChange={(v) => setEditForm((f) => ({ ...f, role: v }))} />
                  </td>
                  <td className="px-3 py-2">
                    <Input type="number" value={editForm.hourly_rate} onChange={(v) => setEditForm((f) => ({ ...f, hourly_rate: v }))} />
                  </td>
                  <td className="px-3 py-2">
                    <Input type="number" value={editForm.allocated_hours} onChange={(v) => setEditForm((f) => ({ ...f, allocated_hours: v }))} />
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400 italic">Auto-calculated</td>
                  <td className="px-3 py-2">
                    <Input value={editForm.notes} onChange={(v) => setEditForm((f) => ({ ...f, notes: v }))} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-3">
                      <button onClick={() => handleUpdate(row.id)} disabled={saving} className="text-xs font-medium text-emerald-600 hover:underline">
                        Save
                      </button>
                      <button onClick={() => setEditId(null)} className="text-xs text-slate-400 hover:underline">
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.resource}</td>
                  <td className="px-4 py-3 text-slate-500">{row.role ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-700">${Number(row.hourly_rate).toFixed(2)}</td>
                  <td className="px-4 py-3 text-slate-700">{fmtHrs(row.allocated_hours)}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{fmt(row.budgeted_cost)}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{row.notes ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setEditId(row.id); setEditForm({ ...row }) }}
                        className="text-xs text-[#1F3864] hover:underline"
                      >
                        Edit
                      </button>
                      <button onClick={() => handleDelete(row.id)} className="text-xs text-red-500 hover:underline">
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )
          )}
        </tbody>
      </table>
    </div>
  )
}
