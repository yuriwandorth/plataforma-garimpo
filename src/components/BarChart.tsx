'use client';
import { fmtBRL } from '@/lib/calc';

/** Gráfico de barras simples em SVG (sem biblioteca), com valor ao passar o mouse */
export function BarChart({ data, highlight }: { data: { label: string; value: number }[]; highlight?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = 720, H = 220, pad = 28, bw = (W - pad * 2) / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 24}`} className="w-full" role="img" aria-label="Faturamento por mês">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={pad} x2={W - pad} y1={H - (H - 20) * f} y2={H - (H - 20) * f} stroke="rgb(var(--line))" strokeWidth="1" />
      ))}
      {data.map((d, i) => {
        const h = ((H - 20) * d.value) / max;
        const x = pad + i * bw + bw * 0.15;
        return (
          <g key={i}>
            <title>{`${d.label}: ${fmtBRL(d.value)}`}</title>
            <rect x={x} y={H - h} width={bw * 0.7} height={Math.max(h, 1)} rx="4"
              fill={i === highlight ? 'rgb(var(--gold))' : 'rgb(var(--gold) / 0.35)'} />
            {d.value > 0 && (
              <text x={x + bw * 0.35} y={H - h - 6} textAnchor="middle" fontSize="11" fill="rgb(var(--mute))">
                {d.value >= 1000 ? `${(d.value / 1000).toFixed(1).replace('.', ',')}k` : Math.round(d.value)}
              </text>
            )}
            <text x={x + bw * 0.35} y={H + 16} textAnchor="middle" fontSize="11" fill="rgb(var(--mute))">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
