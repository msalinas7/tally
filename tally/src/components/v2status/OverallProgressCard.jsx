import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { BUCKET_COLORS } from '../../lib/v2status/aggregations'

const BUCKET_ORDER  = ['Complete', 'In QA', 'In development', 'Needs attention', 'Not started']
const BUCKET_LABELS = {
  Complete:          'Done',
  'In QA':           'In QA review',
  'In development':  'In progress',
  'Needs attention': 'Blocked',
  'Not started':     'Not started',
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const { name, value, total } = payload[0].payload
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md text-xs">
      <p className="font-semibold text-slate-700 mb-0.5">{BUCKET_LABELS[name] ?? name}</p>
      <p className="text-slate-500">{value} task{value !== 1 ? 's' : ''} · <span className="font-medium text-slate-700">{pct}%</span></p>
    </div>
  )
}

export default function OverallProgressCard({ pct, complete, total, buckets = {} }) {
  const segments = BUCKET_ORDER
    .map((key) => ({ name: key, value: buckets[key] ?? 0, total }))
    .filter((s) => s.value > 0)

  const chartData = segments.length > 0
    ? segments
    : [{ name: 'Not started', value: 1, total: 0 }]

  // Stacked bar segments (percentage widths)
  const barSegments = BUCKET_ORDER
    .map((key) => ({ key, count: buckets[key] ?? 0 }))
    .filter((s) => s.count > 0)

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-stretch">

        {/* ── Left: donut with center label ── */}
        <div className="flex items-center justify-center p-6 border-r border-slate-100">
          <div className="relative" style={{ width: 120, height: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius="58%"
                  outerRadius="78%"
                  startAngle={90}
                  endAngle={-270}
                  dataKey="value"
                  strokeWidth={0}
                  paddingAngle={segments.length > 1 ? 1.5 : 0}
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={BUCKET_COLORS[entry.name] ?? '#E1EAF0'} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold text-slate-900 leading-none">{pct}%</span>
              <span className="text-[9px] font-medium text-slate-400 mt-0.5 uppercase tracking-wide">done</span>
            </div>
          </div>
        </div>

        {/* ── Right: breakdown ── */}
        <div className="flex-1 p-5 flex flex-col justify-between min-w-0">
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-sm font-semibold text-slate-700">Overall Progress</p>
              <p className="text-xs text-slate-400">{total} tasks</p>
            </div>

            {/* Status rows */}
            <div className="space-y-2">
              {BUCKET_ORDER.map((key) => {
                const count = buckets[key] ?? 0
                if (count === 0) return null
                const segPct = total ? Math.round((count / total) * 100) : 0
                return (
                  <div key={key} className="flex items-center gap-3">
                    {/* Color swatch */}
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ background: BUCKET_COLORS[key] }}
                    />
                    {/* Label */}
                    <span className="text-xs text-slate-600 flex-1 leading-none">
                      {BUCKET_LABELS[key]}
                    </span>
                    {/* Mini bar */}
                    <div className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden shrink-0">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${segPct}%`, background: BUCKET_COLORS[key] }}
                      />
                    </div>
                    {/* Count + pct */}
                    <span className="text-xs tabular-nums text-slate-400 w-5 text-right shrink-0">{count}</span>
                    <span className="text-xs tabular-nums font-medium text-slate-600 w-8 text-right shrink-0">{segPct}%</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Stacked progress bar ── */}
          {barSegments.length > 0 && (
            <div className="mt-4 h-1.5 rounded-full overflow-hidden flex gap-px">
              {barSegments.map(({ key, count }) => {
                const w = total ? (count / total) * 100 : 0
                return (
                  <div
                    key={key}
                    style={{ width: `${w}%`, background: BUCKET_COLORS[key] }}
                    className="h-full"
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
