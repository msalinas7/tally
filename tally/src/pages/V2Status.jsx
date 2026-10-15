import { useCallback, useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { setProductVersion } from '../store/filtersSlice'
import { getBacklogTasks, getProductVersionList } from '../lib/queries/v2status'
import { buildEpicRows, groupByFeature, computeProgress } from '../lib/v2status/aggregations'
import OverallProgressCard from '../components/v2status/OverallProgressCard'
import FeatureProgressCards from '../components/v2status/FeatureProgressCards'
import EpicStatusList from '../components/v2status/EpicStatusList'

const REFRESH_INTERVAL_MS = 60_000
const EXCLUDE_ASSIGNEES = []

function fmtTime(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export default function ReleaseStatus() {
  const dispatch = useDispatch()
  const storedVersion = useSelector((state) => state.filters.productVersion)

  const [versions, setVersions] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastSynced, setLastSynced] = useState(null)
  const intervalRef = useRef(null)

  const activeVersion = storedVersion || versions[0] || null

  // Fallback: even if versions list fails, always show a selector with activeVersion
  const selectorVersions = versions.length > 0
    ? versions
    : activeVersion ? [activeVersion] : []

  // ── Load version list once ────────────────────────────────────────────────
  useEffect(() => {
    getProductVersionList().then((list) => {
      setVersions(list)
      if (!storedVersion && list.length > 0) {
        dispatch(setProductVersion(list[list.length - 1]))
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load tasks when active version changes ────────────────────────────────
  const load = useCallback(async () => {
    if (!activeVersion) return
    setError(null)
    try {
      const data = await getBacklogTasks({
        productVersion: activeVersion,
        excludeAssignees: EXCLUDE_ASSIGNEES,
      })
      setTasks(data)
      const latest = data.reduce(
        (max, t) => (!t.updatedAt ? max : !max || t.updatedAt > max ? t.updatedAt : max),
        null,
      )
      setLastSynced(latest ?? new Date().toISOString())
    } catch (e) {
      setError(e?.message ?? 'Failed to load status data.')
    } finally {
      setLoading(false)
    }
  }, [activeVersion])

  useEffect(() => {
    setLoading(true)
    setTasks([])
    load()
    clearInterval(intervalRef.current)
    intervalRef.current = setInterval(load, REFRESH_INTERVAL_MS)
    return () => clearInterval(intervalRef.current)
  }, [load])

  const overall = computeProgress(tasks)
  const featureGroups = groupByFeature(tasks, EXCLUDE_ASSIGNEES)
  const epicRows = buildEpicRows(tasks, EXCLUDE_ASSIGNEES)

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-2xl font-semibold text-slate-900">
            {activeVersion ? `${activeVersion} Status` : 'Release Status'}
          </p>
          {lastSynced && (
            <p className="mt-1 text-sm text-slate-500">Last synced: {fmtTime(lastSynced)}</p>
          )}
        </div>

        <div className="flex items-end gap-3">
          {/* Version selector — always visible once we have any version to show */}
          {selectorVersions.length > 0 && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-600">Release Version</span>
              <select
                value={activeVersion ?? ''}
                onChange={(e) => dispatch(setProductVersion(e.target.value))}
                className="min-w-[160px] rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-800 shadow-sm focus:border-[#1F3864] focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
              >
                {selectorVersions.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
          )}

          {/* Refresh */}
          <button
            type="button"
            onClick={() => { setLoading(true); load() }}
            disabled={loading}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && tasks.length === 0 && (
        <div className="flex min-h-[40vh] items-center justify-center">
          <p className="text-sm text-slate-500">Loading {activeVersion ?? ''} status…</p>
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && !error && tasks.length === 0 && activeVersion && (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
          <p className="text-sm font-medium text-slate-700">No tasks found for {activeVersion}</p>
          <p className="mt-1 text-sm text-slate-500">Run seed_full_backlog.sql to populate the database.</p>
        </div>
      )}

      {/* ── Content ── */}
      {tasks.length > 0 && (
        <>
          <OverallProgressCard {...overall} />

          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Progress by Feature
            </p>
            <FeatureProgressCards groups={featureGroups} />
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Status by Epic
            </p>
            <EpicStatusList rows={epicRows} />
          </div>
        </>
      )}
    </div>
  )
}
