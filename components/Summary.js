'use client'
import { req, reqd, okCat, nm, base, lbl, fdt } from '../lib/categories'
import Avatar from './Avatar'

// Formal summary: what has been received, status, reason and last update (printable)
export default function Summary({ c, docs, photo }) {
  const my = docs.filter((d) => d.candidate_id === c.id)
  const miss = reqd(c).filter((k) => !okCat(my, c, k))
  const state = (k) => {
    const l = my.filter((d) => d.category === k[0])
    if (!l.length) return ['ยังไม่ได้ส่ง', 'bad']
    if (l.some((d) => d.status === 'fix')) return ['ต้องแก้ไข ส่งใหม่', 'bad']
    return l.every((d) => d.status === 'ok') ? ['ตรวจผ่านแล้ว', 'ok'] : ['ได้รับแล้ว (รอตรวจ)', '']
  }
  return (
    <section className="panel summary">
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <Avatar url={photo} name={c.first_name ? base(c) : ''} size={64} portrait />
        <div>
          <b style={{ fontSize: 17 }}>สรุปเอกสารผู้สมัคร</b>
          <div className="hint">{base(c)} · ตำแหน่ง {c.position} · SRF {c.srf_no} · ณ วันที่ {new Date().toLocaleDateString('th-TH', { dateStyle: 'long' })}</div>
        </div>
      </div>
      {miss.length > 0
        ? <div className="err" style={{ marginTop: 8 }}><b>ยังขาดเอกสารบังคับ {miss.length} รายการ:</b> {miss.map(lbl).join(' · ')}</div>
        : <div style={{ marginTop: 8 }}><span className="tag ok">ส่งเอกสารบังคับครบแล้ว</span></div>}
      <div className="scroll">
        <table className="tbl">
          <thead><tr><th>เอกสาร</th><th>ประเภท</th><th>สถานะ</th><th>อัปเดตล่าสุด</th></tr></thead>
          <tbody>
            {req(c).map((k) => {
              const [t, cl] = state(k), l = my.filter((d) => d.category === k[0])
              const last = l.reduce((a, d) => (d.updated_at > a ? d.updated_at : a), ''), why = l.find((d) => d.status === 'fix')
              return (
                <tr key={k[0]}>
                  <td>{nm(k[0])}{k[1]}<div className="hint">{k[2]}</div></td>
                  <td>{k[5] ? 'ไม่บังคับ' : 'บังคับ'}</td>
                  <td>{k[5] && !l.length ? <span className="mute">ยังไม่มี</span> : <span className={'tag ' + cl}>{t}{l.length > 1 ? ` (${l.length} ไฟล์)` : ''}</span>}
                    {why && <div className="err">เหตุผล: {why.note || 'กรุณาอัปโหลดไฟล์ใหม่'}</div>}</td>
                  <td className="mute">{fdt(last)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="noprint" style={{ marginTop: 10 }}><button className="btn" onClick={() => window.print()}>พิมพ์ / บันทึกเป็น PDF</button></div>
    </section>
  )
}
