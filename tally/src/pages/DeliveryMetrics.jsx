import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { setProductVersion } from '../store/filtersSlice'
import InfoTooltip from '../components/InfoTooltip'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  averageCycleTimeByVersion,
  averageDays,
  computeCompletedTasks,
  fetchTaskEvents,
  getProductVersions,
} from '../lib/queries/delivery'

const ALL_VERSIONS = ''
const CHART_FILL = '#1F3864'

function formatDays(value) {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toFixed(1)
}

function truncateLabel(value, max = 18) {
  if (!value) return ''
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  )
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload ?? {}
  const days = payload[0]?.value
  const title = point.taskName || point.version || label

  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
      <p className="font-medium text-slate-800">{title}</p>
      <p className="mt-0.5 text-slate-500">{formatDays(days)} days</p>
    </div>
  )
}


function SortHeader({ label, column, sort, onSort, tooltip }) {
  const active = sort.column === column
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 text-left font-medium text-slate-600 hover:text-slate-900"
      >
        {label}
        <span className={active ? 'text-[#1F3864]' : 'text-slate-300'}>
          {active && sort.direction === 'desc' ? '↓' : '↑'}
        </span>
      </button>
      {tooltip && <InfoTooltip text={tooltip} />}
    </span>
  )
}

export default function DeliveryMetrics() {
  const dispatch = useDispatch()
  const version = useSelector((state) => state.filters.productVersion)

  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sort, setSort] = useState({ column: 'cycleTimeDays', direction: 'asc' })

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const events = await fetchTaskEvents()
        if (!cancelled) setTasks(computeCompletedTasks(events))
      } catch (err) {
        if (!cancelled) {
          setError(err?.message ?? 'Unable to load delivery metrics.')
          setTasks([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const versions = useMemo(() => getProductVersions(tasks), [tasks])

  const filteredTasks = useMemo(() => {
    if (!version) return tasks
    return tasks.filter((task) => task.productVersion === version)
  }, [tasks, version])

  const sortedTasks = useMemo(() => {
    const copy = [...filteredTasks]
    const { column, direction } = sort
    copy.sort((a, b) => {
      const aVal = a[column]
      const bVal = b[column]
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1
      return direction === 'asc' ? aVal - bVal : bVal - aVal
    })
    return copy
  }, [filteredTasks, sort])

  const avgLeadTime = useMemo(
    () => averageDays(filteredTasks.map((task) => task.leadTimeDays)),
    [filteredTasks]
  )
  const avgCycleTime = useMemo(
    () => averageDays(filteredTasks.map((task) => task.cycleTimeDays)),
    [filteredTasks]
  )

  const versionChartData = useMemo(
    () => averageCycleTimeByVersion(filteredTasks),
    [filteredTasks]
  )

  const taskChartData = useMemo(
    () =>
      [...filteredTasks]
        .filter((task) => task.cycleTimeDays != null)
        .sort((a, b) => a.cycleTimeDays - b.cycleTimeDays)
        .map((task) => ({
          id: task.id,
          taskName: task.taskName,
          label: truncateLabel(task.taskName),
          cycleTimeDays: task.cycleTimeDays,
        })),
    [filteredTasks]
  )

  const handleSort = (column) => {
    setSort((current) =>
      current.column === column
        ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-slate-500">Loading delivery metrics…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error}
      </div>
    )
  }

  const empty = filteredTasks.length === 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Delivery Metrics</h1>
          <p className="mt-1 text-sm text-slate-500">
            Lead time and cycle time for completed tasks.
          </p>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-600">Product Version</span>
          <select
            value={version}
            onChange={(event) => dispatch(setProductVersion(event.target.value))}
            className="min-w-[180px] rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-800 shadow-sm focus:border-[#1F3864] focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
          >
            <option value={ALL_VERSIONS}>All versions</option>
            {versions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <MetricCard
          label="Avg Lead Time (days)"
          value={avgLeadTime == null ? '—' : formatDays(avgLeadTime)}
          hint="Created → Done"
        />
        <MetricCard
          label="Avg Cycle Time (days)"
          value={avgCycleTime == null ? '—' : formatDays(avgCycleTime)}
          hint="In progress → Done"
        />
        <MetricCard
          label="Tasks Delivered"
          value={filteredTasks.length}
          hint="Tasks with a Done event"
        />
      </div>

      {empty ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
          <p className="text-sm font-medium text-slate-700">No completed tasks yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Lead and cycle times appear once tasks reach Done.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800">
                Avg cycle time by version
              </h2>
              <div className="mt-4 h-72">
                {versionChartData.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-sm text-slate-400">
                    No cycle times for this filter.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={versionChartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="version"
                        tick={{ fill: '#64748b', fontSize: 12 }}
                        axisLine={{ stroke: '#e2e8f0' }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: '#64748b', fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        unit="d"
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
                      <Bar dataKey="avgCycleTime" fill={CHART_FILL} radius={[4, 4, 0, 0]} maxBarSize={56} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800">
                Task cycle times
              </h2>
              <div className="mt-4 h-72 overflow-x-auto">
                {taskChartData.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-sm text-slate-400">
                    No cycle times for this filter.
                  </p>
                ) : (
                  <div
                    className="h-full"
                    style={{ minWidth: Math.max(320, taskChartData.length * 36) }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={taskChartData} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="label"
                          interval={0}
                          angle={-40}
                          textAnchor="end"
                          tick={{ fill: '#64748b', fontSize: 11 }}
                          axisLine={{ stroke: '#e2e8f0' }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fill: '#64748b', fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                          unit="d"
                        />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
                        <Bar dataKey="cycleTimeDays" fill={CHART_FILL} radius={[4, 4, 0, 0]} maxBarSize={28} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </section>
          </div>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-slate-600">Task Name</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Product Version</th>
                  <th className="px-4 py-3">
                    <SortHeader
                      label="Lead Time (days)"
                      column="leadTimeDays"
                      sort={sort}
                      onSort={handleSort}
                      tooltip="Total elapsed time from when a task is created to when it reaches Done. Includes any time the task spent waiting before work began."
                    />
                  </th>
                  <th className="px-4 py-3">
                    <SortHeader
                      label="Cycle Time (days)"
                      column="cycleTimeDays"
                      sort={sort}
                      onSort={handleSort}
                      tooltip="Active work period only — from when a task moves to In Progress until it reaches Done. A proxy for team execution speed."
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedTasks.map((task) => (
                  <tr key={task.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-800">{task.taskName}</td>
                    <td className="px-4 py-3 text-slate-600">{task.productVersion}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {formatDays(task.leadTimeDays)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {formatDays(task.cycleTimeDays)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  )
}
