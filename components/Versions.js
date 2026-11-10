'use client'
import { DS, docStatus, EV } from '../lib/status'
import { fdt } from '../lib/categories'

// Revision history of one file: every version (old -> new) and the review log. Used by candidates and HR.
// chain = versions oldest first (last = current), events = log entries, onOpen(file, index)
export default function Versions({ chain, events = [], onOpen, openLabel = 'เปิดไฟล์', activeIndex }) {
  const ids = new Set(chain.map((x) => x.id))
  const log = events.filter((e) => ids.has(e.document_id)).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  return (
    <div>
      {chain.length > 1 && (
        <ul className="files" style={{ marginTop: 4 }}>
          {chain.map((v, i) => {
            const s = docStatus(v), last = i === chain.length - 1
            return (
              <li key={v.id}>
                <div className="fl">
                  <span><b>v{v.rev}</b> {last ? <span className="tag n">ฉบับล่าสุด</span> : <span className="tag g">ฉบับเก่า</span>} · {v.original_name} · {fdt(v.created_at)}</span>
                  <span className={'tag ' + DS[s][2]}>{DS[s][0]}</span>
                </div>
                {v.status === 'fix' && v.note && <div className="err">เหตุผลที่ขอแก้ไข: {v.note}</div>}
                <div className="ctl"><button type="button" className={'btn sm' + (activeIndex === i ? ' pri' : '')} onClick={() => onOpen(v, i)}>{activeIndex === i ? 'กำลังแสดง' : openLabel}</button></div>
              </li>
            )
          })}
        </ul>
      )}
      <div className="hint" style={{ marginTop: 8 }}><b>ประวัติ</b></div>
      {!log.length && <div className="hint">ยังไม่มีบันทึก</div>}
      <ul className="tl">
        {log.map((e) => (
          <li key={e.id}>
            <span className="tld" />
            <div><b>{EV[e.action]}</b> <span className="mute">v{e.rev} · {fdt(e.created_at)} · {e.actor_role === 'candidate' ? 'Candidate' : e.actor_email || e.actor_role}</span>
              {e.action === 'comment' && <span className={'tag ' + (e.visible ? 'n' : 'g')} style={{ marginLeft: 6 }}>{e.visible ? 'Candidate เห็น' : 'ภายใน HR'}</span>}
              {e.comment && <div className="cm">{e.comment}</div>}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}
