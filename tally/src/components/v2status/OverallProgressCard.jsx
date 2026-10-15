import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

export default function OverallProgressCard({ pct, complete, total }) {
  const data = [{ value: pct }, { value: 100 - pct }]

  return (
    <div className="flex items-center gap-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      {/* Donut */}
      <div className="h-28 w-28 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="62%"
              outerRadius="80%"
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              strokeWidth={0}
            >
              <Cell fill="#95C53F" />
              <Cell fill="#e2e8f0" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Text */}
      <div>
        <p className="text-sm font-medium text-slate-500">Overall Progress</p>
        <p className="mt-1 text-5xl font-semibold tracking-tight text-slate-900">{pct}%</p>
        <p className="mt-1 text-xs text-slate-400">{complete} of {total} tasks complete</p>
      </div>
    </div>
  )
}
