'use client'
import { req, reqd, okCat, nm, base, lbl } from '../lib/categories'

// Formal summary: what has been received and what is still missing (printable)
export default function Summary({ c, docs }) {
  const my = docs.filter((d) => d.candidate_id === c.id)
  const miss = reqd(c).filter((k) => !okCat(my, c, k))
  const state = (k) => {
    const l = my.filter((d) => d.category === k[0])
    if (!l.length) return ['ยังไม่ได้ส่ง', 'bad']
    if (l.some((d) => d.status === 'fix')) return ['ต้องแก้ไข ส่งใหม่', 'bad']
    if (k[0] === '2.1' && !c.id_redacted) return ['ได้รับแล้ว แต่ยังไม่ยืนยันการปิดบังข้อมูลบัตร', 'bad']
    return l.every((d) => d.status === 'ok') ? ['ตรวจผ่านแล้ว', 'ok'] : ['ได้รับแล้ว (รอตรวจ)', '']
  }
  return (
    <section className="panel summary">
      <b style={{ fontSize: 17 }}>สรุปเอกสารผู้สมัคร</b>
      <div className="hint">{base(c)} · ตำแหน่ง {c.position} · SRF {c.srf_no} · ณ วันที่ {new Date().toLocaleDateString('th-TH', { dateStyle: 'long' })}</div>
      {miss.length > 0
        ? <div className="err" style={{ marginTop: 8 }}><b>ยังขาดเอกสารบังคับ {miss.length} รายการ:</b> {miss.map(lbl).join(' · ')}</div>
        : <div style={{ marginTop: 8 }}><span className="tag ok">ส่งเอกสารบังคับครบแล้ว</span></div>}
      <table className="tbl">
        <thead><tr><th>เอกสาร</th><th>ประเภท</th><th>สถานะ</th></tr></thead>
        <tbody>
          {req(c).map((k) => {
            const [t, cl] = state(k), cnt = my.filter((d) => d.category === k[0]).length
            return (
              <tr key={k[0]}>
                <td>{nm(k[0])}{k[1]}<div className="hint">{k[2]}</div></td>
                <td>{k[5] ? 'ไม่บังคับ' : 'บังคับ'}</td>
                <td>{k[5] && !cnt ? <span className="mute">ยังไม่มี</span> : <span className={'tag ' + cl}>{t}{cnt > 1 ? ` (${cnt} ไฟล์)` : ''}</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="noprint" style={{ marginTop: 10 }}><button className="btn" onClick={() => window.print()}>พิมพ์ / บันทึกเป็น PDF</button></div>
    </section>
  )
}
