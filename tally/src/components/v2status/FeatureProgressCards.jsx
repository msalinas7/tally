export default function FeatureProgressCards({ groups }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {groups.map(({ feature, pct, complete, total }) => (
        <div
          key={feature}
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        >
          <p className="text-sm font-medium text-slate-500">{feature}</p>
          <p className={`mt-2 text-3xl font-semibold tracking-tight ${pct === 100 ? 'text-emerald-600' : 'text-slate-900'}`}>
            {pct}%
          </p>
          <p className="mt-1 text-xs text-slate-400">{complete} of {total} tasks complete</p>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-1.5 rounded-full transition-all duration-500 ${pct === 100 ? 'bg-emerald-500' : 'bg-[#1F3864]'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
