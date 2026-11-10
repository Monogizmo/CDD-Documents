'use client'
import { useState } from 'react'
import Avatar from './Avatar'
import { base } from '../lib/categories'

// HR home: "what needs me today?" Each block is a short queue of people; click a person to open the Review Center (or the card).
const nm = (c) => (c.first_name ? base(c) : c.email)
export default function TodayInbox({ rows, photos, onReview, onOpen, now = new Date() }) {
  const [all, setAll] = useState({})
  const late = (r) => !r.both && r.c.due_date && new Date(r.c.due_date) < new Date(now.toDateString())
  const Q = [
    { k: 'review', t: 'ไฟล์รอตรวจ', s: 'เปิด Review Center เพื่อ Approve / ขอแก้ไข', who: rows.filter((r) => r.w > 0), note: (r) => r.w + ' ไฟล์', act: onReview, cta: 'ตรวจ' },
    { k: 'rec', t: 'ฝั่งแคนดิเดตผ่านแล้ว · รอเอกสารฝั่ง Recruiter', s: 'อัปโหลดเอกสารที่ Recruiter ต้องแนบ', who: rows.filter((r) => r.candDone && !r.recDone), note: (r) => 'ขาด ' + r.rmiss.length, act: onOpen, cta: 'เปิด' },
    { k: 'hire', t: 'ครบทั้งสองฝั่ง · พร้อมส่งให้ Hiring', s: 'กด "ส่งให้ Hiring รับเอกสาร" ในการ์ด', who: rows.filter((r) => r.both && !r.c.offer_made), note: () => 'ครบแล้ว', act: onOpen, cta: 'เปิด' },
    { k: 'fix', t: 'รอแคนดิเดตแก้ไขไฟล์', s: 'ติดตามถ้าเงียบเกินไป', who: rows.filter((r) => r.x > 0), note: (r) => r.x + ' ไฟล์', act: onOpen, cta: 'เปิด' },
    { k: 'late', t: 'เลยกำหนดส่ง', s: 'ยังไม่ครบทั้งสองฝั่ง', who: rows.filter(late), note: (r) => 'กำหนด ' + new Date(r.c.due_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }), act: onOpen, cta: 'เปิด' },
  ].filter((q) => q.who.length)
  return (
    <section className="inbox" aria-label="วันนี้ต้องจัดการ">
      <div className="inh">
        <div><div className="eyebrow">วันนี้</div><h2>มีอะไรต้องจัดการบ้าง?</h2></div>
        <div className="sub">{Q.length ? Q.reduce((a, q) => a + q.who.length, 0) + ' รายการใน ' + Q.length + ' เรื่อง' : ''}</div>
      </div>
      {!Q.length && <div className="calm">ไม่มีอะไรค้าง ทุกอย่างเรียบร้อยดี ✓</div>}
      <div className="ibg">
        {Q.map((q) => {
          const show = all[q.k] ? q.who : q.who.slice(0, 4)
          return (
            <div className={'ib ' + q.k} key={q.k}>
              <div className="ibt"><span className="ibn">{q.who.length}</span><div><b>{q.t}</b><div className="sub">{q.s}</div></div></div>
              <ul>
                {show.map((r) => (
                  <li key={r.c.id}>
                    <button type="button" onClick={() => q.act(r.c)}>
                      <Avatar url={photos[r.c.id]} name={nm(r.c)} size={28} />
                      <span className="nmx">{nm(r.c)}<span className="sub"> · {r.c.position}{r.c.recruiter_name ? ' · ' + r.c.recruiter_name : ''}</span></span>
                      <span className="tag n">{q.note(r)}</span><span className="go">{q.cta} →</span>
                    </button>
                  </li>
                ))}
              </ul>
              {q.who.length > 4 && <button type="button" className="more" onClick={() => setAll({ ...all, [q.k]: !all[q.k] })}>{all[q.k] ? 'ย่อ' : 'ดูอีก ' + (q.who.length - 4) + ' คน'}</button>}
            </div>
          )
        })}
      </div>
    </section>
  )
}
