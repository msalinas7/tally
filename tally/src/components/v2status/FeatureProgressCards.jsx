import { IN_FLIGHT_STATUSES } from '../../lib/v2status/aggregations'

export default function FeatureProgressCards({ groups, onSelect }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {groups.map(({ feature, pct, complete, total, tasks }) => {
        const inProgress = (tasks ?? []).filter((t) => IN_FLIGHT_STATUSES.has(t.status)).length

        return (
          <button
            key={feature}
            type="button"
            onClick={() => onSelect?.({ feature, pct, complete, total, tasks })}
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm text-left w-full hover:border-[#00406C] hover:shadow-md transition-all"
          >
            <p className="text-sm font-medium text-slate-500">{feature}</p>
            <p className={`mt-2 text-3xl font-semibold tracking-tight ${pct === 100 ? 'text-[#8CC63F]' : 'text-slate-900'}`}>
              {pct}%
            </p>
            <p className="mt-1 text-xs text-slate-400">{complete} of {total} tasks complete</p>
            {inProgress > 0 && (
              <p className="mt-0.5 text-xs text-[#29ABE0]">{inProgress} of {total} tasks in progress</p>
            )}

            {/* Progress bar */}
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-1.5 rounded-full transition-all duration-500 ${pct === 100 ? 'bg-[#8CC63F]' : 'bg-[#00406C]'}`}
                style={{ width: `${pct}%` }}
              />
            </div>

            <p className="mt-3 text-[11px] font-medium text-[#29ABE0]">View Tasks →</p>
          </button>
        )
      })}
    </div>
  )
}
