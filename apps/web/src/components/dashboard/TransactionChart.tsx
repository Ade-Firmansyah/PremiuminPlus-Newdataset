import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency } from '../../utils/format';

export interface TransactionChartPoint {
  date: string;
  deposits: number;
  purchases: number;
  profit: number;
}

export function TransactionChart({ data }: { data: TransactionChartPoint[] }) {
  return (
    <div className="h-[310px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 6, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id="deposits" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00ff99" stopOpacity={0.26} />
              <stop offset="95%" stopColor="#00ff99" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="purchases" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ff2f92" stopOpacity={0.26} />
              <stop offset="95%" stopColor="#ff2f92" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="profit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#a855f7" stopOpacity={0.26} />
              <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: 'rgba(255,255,255,0.48)', fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: 'rgba(255,255,255,0.38)', fontSize: 11 }} tickFormatter={(value) => `${Number(value) / 1000}k`} />
          <Tooltip
            cursor={{ stroke: 'rgba(255,255,255,0.14)' }}
            contentStyle={{
              background: 'rgba(11,16,32,0.94)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 14,
              color: '#fff',
              boxShadow: '0 18px 40px rgba(0,0,0,0.28)',
            }}
            formatter={(value) => formatCurrency(Number(value))}
          />
          <Area type="monotone" dataKey="deposits" stroke="#00ff99" strokeWidth={2.4} fill="url(#deposits)" />
          <Area type="monotone" dataKey="purchases" stroke="#ff2f92" strokeWidth={2.4} fill="url(#purchases)" />
          <Area type="monotone" dataKey="profit" stroke="#a855f7" strokeWidth={2.4} fill="url(#profit)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
