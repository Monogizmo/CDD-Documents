'use client'
import Avatar from './Avatar'
import { Spark, Donut, LineChart, PALETTE } from './Charts'
import { STAGES, STAGE_NAME, chips } from '../lib/stage'
import { base } from '../lib/categories'

// Recruiter dashboard. `rows` = [{ c, m (candidate files), stage, n, miss, rn, rmiss, w, x }] (built in app/staff/page.js)
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const nameOf = (c) => (c.first_name ? base(c) : c.email)

export default function Dashboard({ rows, photos, onOpen, onZip, now = new Date() }) {
  const total = rows.length
  const sent = rows.reduce((a, r) => a + (r.n - r.miss.length), 0), need = rows.reduce((a, r) => a + r.n, 0)
  const pct = need ? Math.round((sent / need) * 100) : 0
  const ready = rows.filter((r) => r.stage === 'complete' || r.stage === 'onboard').length
  const waiting = rows.reduce((a, r) => a + r.w, 0), fix = rows.reduce((a, r) => a + r.x, 0)

  // new candidates per week (last 8 weeks) and per month (last 12 months)
  const day = 86400000, wk = Array(8).fill(0)
  rows.forEach((r) => { const a = Math.floor((now - new Date(r.c.created_at)) / (7 * day)); if (a >= 0 && a < 8) wk[7 - a]++ })
  const new30 = rows.filter((r) => now - new Date(r.c.created_at) <= 30 * day).length
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1); return { y: d.getFullYear(), m: d.getMonth() } })
  const inM = (iso, mo) => { if (!iso) return false; const d = new Date(iso); return d.getFullYear() === mo.y && d.getMonth() === mo.m }
  const newM = months.map((mo) => rows.filter((r) => inM(r.c.created_at, mo)).length)
  const doneM = months.map((mo) => rows.filter((r) => inM(r.c.ready_at || r.c.signed_at, mo)).length)

  // positions donut
  const pos = {}
  rows.forEach((r) => { pos[r.c.position] = (pos[r.c.position] || 0) + 1 })
  const sorted = Object.entries(pos).sort((a, b) => b[1] - a[1])
  const items = sorted.slice(0, 4).map(([label, value], i) => ({ label, value, color: PALETTE[i] }))
  if (sorted.length > 4) items.push({ label: 'อื่นๆ', value: sorted.slice(4).reduce((a, x) => a + x[1], 0), color: PALETTE[5] })

  const by = Object.fromEntries(STAGES.map(([k]) => [k, rows.filter((r) => r.stage === k)]))
  const attention = [...rows].sort((a, b) => (b.x > 0) - (a.x > 0) || (b.w > 0) - (a.w > 0) || new Date(b.c.created_at) - new Date(a.c.created_at)).slice(0, 4)
  const maxStage = Math.max(1, ...STAGES.map(([k]) => by[k].length))

  return (
    <>
      <div className="dg">
        <div className="s3 stack">
          <div className="panel">
            <div className="ph">ความคืบหน้าเอกสารบังคับ</div>
            <div className="sub" style={{ display: 'flex', justifyContent: 'space-between' }}><span>ส่งแล้ว {sent}/{need} หมวด</span><b style={{ color: 'var(--ink)' }}>{pct}%</b></div>
            <div className="bar" style={{ marginTop: 6 }}><i style={{ width: pct + '%' }} /></div>
          </div>
          <div className="panel">
            <div className="ph">ผู้สมัครทั้งหมด</div>
            <div className="big">{total}</div>
            <div className="bar" style={{ marginTop: 8 }}><i style={{ width: (total ? (ready / total) * 100 : 0) + '%' }} /></div>
            <div className="sub">เอกสารครบแล้ว {ready} คน</div>
          </div>
        </div>
        <div className="panel s3">
          <div className="ph">ผู้สมัครใหม่ (30 วัน)</div>
          <div className="big">{new30}</div>
          <Spark data={wk} />
          <div className="sub">รายสัปดาห์ ย้อนหลัง 8 สัปดาห์</div>
        </div>
        <div className="panel s4">
          <div className="ph">ขั้นตอนการรับเข้า</div>
          <div className="fun">
            {STAGES.map(([k, t]) => (
              <div key={k}>
                <div className="v">{by[k].length}</div>
                <div className="bx" style={{ height: 46 + (by[k].length / maxStage) * 40 }}>
                  {by[k][0] && <Avatar url={photos[by[k][0].c.id]} name={nameOf(by[k][0].c)} size={26} />}
                </div>
                <div className="l">{t}</div>
                <div className="l">{total ? Math.round((by[k].length / total) * 100) : 0}%</div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel s2">
          <div className="ph">ตำแหน่งที่เปิดรับ</div>
          <div style={{ display: 'flex', justifyContent: 'center' }}><Donut items={items} size={104} /></div>
          <div className="lg">{items.map((x) => <span key={x.label}><i style={{ background: x.color }} />{x.label} {x.value}</span>)}</div>
        </div>
      </div>

      <div className="dg">
        <div className="panel s4">
          <div className="ph">โปรไฟล์ผู้สมัคร <span className="sub">· ที่ต้องดูก่อน</span></div>
          <div className="cp">
            {!attention.length && <div className="sub">ยังไม่มีผู้สมัคร</div>}
            {attention.map((r) => (
              <div className="pc" key={r.c.id}>
                <div className="top">
                  <Avatar url={photos[r.c.id]} name={nameOf(r.c)} size={52} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <b style={{ display: 'block' }}>{nameOf(r.c)}</b>
                    <div className="sub">{r.c.position} · SRF {r.c.srf_no}</div>
                  </div>
                </div>
                <div className="chips">
                  <span className={'tag ' + (r.x ? 'bad' : r.stage === 'complete' || r.stage === 'onboard' ? 'ok' : 'n')}>{r.x ? `แก้ไข ${r.x} ไฟล์` : STAGE_NAME[r.stage]}</span>{chips(r.c, r.m).map((x) => <span key={x.code} className={'chip ' + x.st}>{x.t}</span>)}</div>
                <div className="acts">
                  <button type="button" onClick={() => onOpen(r.c)}>ตรวจเอกสาร</button>
                  <a href={'mailto:' + r.c.email}>อีเมล</a>
                  <button type="button" onClick={() => onZip(r.c)}>โหลด Zip</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel s8">
          <div className="ph">Pipeline <span className="sub">· คลิกการ์ดเพื่อเปิดดูเอกสาร</span></div>
          <div className="kb">
            {STAGES.map(([k, t]) => (
              <div className="kc" key={k}>
                <h4>{t}<span>{by[k].length}</span></h4>
                {by[k].slice(0, 5).map((r) => (
                  <button type="button" className="kcard" key={r.c.id} onClick={() => onOpen(r.c)}>
                    <Avatar url={photos[r.c.id]} name={nameOf(r.c)} size={30} />
                    <span style={{ minWidth: 0 }}>
                      <b>{nameOf(r.c)}</b>
                      <span className="sub">{r.x ? `แก้ไข ${r.x} ไฟล์` : r.w ? `รอตรวจ ${r.w} ไฟล์` : r.c.position}</span>
                    </span>
                  </button>
                ))}
                {by[k].length > 5 && <div className="sub" style={{ textAlign: 'center' }}>+{by[k].length - 5} คน</div>}
                {!by[k].length && <div className="sub" style={{ textAlign: 'center' }}>—</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dg">
        <div className="panel s12">
          <div className="ph">แนวโน้มรายเดือน <span className="sub">· <b style={{ color: 'var(--acc)' }}>●</b> ผู้สมัครใหม่ &nbsp;<b style={{ color: 'var(--brown)' }}>●</b> เซ็นเอกสาร/พร้อมเริ่มงาน &nbsp;· ไฟล์รอตรวจ {waiting} · ต้องแก้ไข {fix}</span></div>
          <LineChart labels={months.map((x) => MONTHS[x.m])} series={[{ name: 'ผู้สมัครใหม่', data: newM, color: '#e0a100' }, { name: 'เสร็จสิ้น', data: doneM, color: '#5b3a14' }]} />
        </div>
      </div>
    </>
  )
}
