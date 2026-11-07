'use client'
// Small dependency-free SVG charts
export const PALETTE = ['#ffc72c', '#5b3a14', '#e0a100', '#b8a27a', '#8a5a0b', '#d9d2c3']

export function Spark({ data, height = 70 }) {
  const w = 240, h = height, max = Math.max(1, ...data), step = w / Math.max(1, data.length - 1)
  const pts = data.map((v, i) => [i * step, h - 6 - (v / max) * (h - 16)])
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
  const last = pts[pts.length - 1] || [0, h]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label="แนวโน้ม" preserveAspectRatio="none">
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill="var(--prib)" />
      <path d={line} fill="none" stroke="var(--acc)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="4" fill="var(--acc)" />
    </svg>
  )
}

export function Donut({ items, size = 130 }) {
  const total = items.reduce((a, x) => a + x.value, 0) || 1, r = 44, C = 2 * Math.PI * r
  let off = 0
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label="สัดส่วนตำแหน่ง">
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--line)" strokeWidth="20" />
      {items.map((x, i) => {
        const len = (x.value / total) * C, el = (
          <circle key={i} cx="60" cy="60" r={r} fill="none" stroke={x.color} strokeWidth="20"
            strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`} strokeDashoffset={-off} transform="rotate(-90 60 60)" />
        )
        off += len
        return el
      })}
    </svg>
  )
}

export function LineChart({ labels, series, height = 200 }) {
  const W = 1000, H = height, L = 34, R = 10, T = 12, B = 26
  const max = Math.max(4, ...series.flatMap((s) => s.data)), top = Math.ceil(max / 4) * 4
  const x = (i) => L + (i * (W - L - R)) / Math.max(1, labels.length - 1), y = (v) => T + (1 - v / top) * (H - T - B)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="แนวโน้มรายเดือน">
      {[0, 1, 2, 3, 4].map((i) => {
        const v = (top / 4) * i
        return <g key={i}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--mute)">{v}</text></g>
      })}
      {labels.map((t, i) => <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--mute)">{t}</text>)}
      {series.map((s, k) => {
        const d = s.data.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ')
        return (
          <g key={k}>
            {k === 0 && <path d={`${d} L${x(s.data.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z`} fill="var(--prib)" opacity=".8" />}
            <path d={d} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" />
            {s.data.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill="var(--card)" stroke={s.color} strokeWidth="2" />)}
          </g>
        )
      })}
    </svg>
  )
}
