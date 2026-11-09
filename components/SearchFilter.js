'use client'
import { STATUS_FILTERS } from '../lib/rows'
// Search by name / email / SRF / position + filter by position and document status
export default function SearchFilter({ f, setF, positions, recs = [] }) {
  return (
    <div className="sf">
      <input type="text" value={f.q} placeholder="ค้นหา ชื่อ · อีเมล · SRF · ตำแหน่ง · Recruiter" aria-label="ค้นหา" onChange={(e) => setF({ ...f, q: e.target.value })} />
      <select value={f.pos} aria-label="ตำแหน่ง" onChange={(e) => setF({ ...f, pos: e.target.value })}>
        <option value="">ทุกตำแหน่ง</option>{positions.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      {recs.length > 0 && (
        <select value={f.rec || ''} aria-label="Recruiter" onChange={(e) => setF({ ...f, rec: e.target.value })}>
          <option value="">ทุก Recruiter</option>{recs.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      )}
      <select value={f.st} aria-label="สถานะ" onChange={(e) => setF({ ...f, st: e.target.value })}>
        {STATUS_FILTERS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
      </select>
      {(f.q || f.pos || f.rec || f.st !== 'all') && <button type="button" className="btn sm" onClick={() => setF({ q: '', pos: '', st: 'all', rec: '' })}>ล้างตัวกรอง</button>}
    </div>
  )
}
