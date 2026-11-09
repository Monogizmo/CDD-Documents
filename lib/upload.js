// Upload pipeline shared by the candidate page and the recruiter page
import { supabase } from './supabase'
import { loadImg, toJpg, mkPdf, photoBlob, isLocked } from './images'
import { flattenPdf, askUntilOpen } from './pdf'

export const BUCKET = 'candidate-docs'
export const extOf = (f) => { const e = f.name.split('.').pop().toLowerCase(); return e === 'jpeg' ? 'jpg' : e }

// validate files for one category and turn them into upload jobs (k = category row, see lib/categories.js)
// ask(file, wrong) is optional: when a PDF needs a password it asks the person; the file is then unlocked here in the browser (re-drawn as a new PDF) and passed on
export async function genericJobs(k, files, bad, jobs, ask) {
  const key = k[0], imgs = []
  for (const f of files) {
    const x = extOf(f)
    if (f.size > 10485760) { bad.push(f.name + ' ใหญ่เกิน 10 MB'); continue }
    if (x === 'pdf') {
      if (!k[4].includes('pdf')) { bad.push(f.name + ' หมวดนี้รับเฉพาะรูป JPG หรือ PNG'); continue }
      let o
      try { o = await askUntilOpen(f, ask) } catch { o = { broken: true } }
      if (o.locked) { bad.push(f.name + ' มีรหัสผ่าน กรุณาปลดล็อกก่อนอัปโหลด'); continue }
      if (o.cancelled) { bad.push(f.name + ' ข้ามไฟล์นี้ เพราะไม่ได้กรอกรหัสผ่าน'); continue }
      if (o.failed) { bad.push(f.name + ' รหัสผ่านไม่ถูกต้อง (ลองได้ 3 ครั้ง) เลือกไฟล์ใหม่เพื่อลองอีกครั้ง'); continue }
      // Re-drawn as a new PDF when: pay slip (some pay slip PDFs do not open in Power Automate / Outlook), the file had a password (unlock), or it is restricted
      if (!o.broken && (key === 'PS' || o.password || await isLocked(f))) {
        try { jobs.push({ blob: await flattenPdf(f, { scale: 2, q: 0.85, maxPages: key === 'PS' ? 10 : 30, password: o.password }), ext: 'pdf', name: f.name }) }
        catch (e) { bad.push(f.name + (e && e.tooLong ? ' ยาวเกินกำหนด (รับไม่เกิน ' + (key === 'PS' ? 10 : 30) + ' หน้า)' : ' เปิดไฟล์ไม่ได้ ไฟล์อาจเสียหาย ลองบันทึกเป็น PDF ใหม่หรือถ่ายรูปแทน')) }
        continue
      }
      if (o.broken && key === 'PS') { bad.push(f.name + ' เปิดไฟล์ไม่ได้ ไฟล์อาจเสียหาย ลองบันทึกเป็น PDF ใหม่หรือถ่ายรูปแทน'); continue }
      jobs.push({ blob: f, ext: 'pdf', name: f.name })
    } else if (x === 'jpg' || x === 'png') imgs.push(f)
    else bad.push(f.name + ' ไม่รองรับ (รับ PDF, JPG, PNG)')
  }
  if (imgs.length && key === 'PH') {
    const r = await photoBlob(await loadImg(imgs[0]))
    jobs.push({ blob: r.blob, ext: 'jpg', name: imgs[0].name }); bad.push(...r.warn)
    if (imgs.length > 1) bad.push('รูปถ่ายใช้ 1 รูป ระบบใช้รูปแรกให้')
  } else if (imgs.length && k[4].includes('jpg')) {
    for (const f of imgs) jobs.push({ blob: await toJpg(await loadImg(f)), ext: 'jpg', name: f.name })
  } else if (imgs.length) {
    const pg = []
    for (const f of imgs) pg.push(await toJpg(await loadImg(f)))
    jobs.push({ blob: await mkPdf(pg), ext: 'pdf', name: 'photos.pdf' })
  }
}

// upload job blobs to Storage and insert the documents rows. `extra` is merged into every row.
// returns the number of rows stored; problems are pushed to `bad`
export async function storeJobs(candidateId, key, jobs, bad, extra = {}) {
  let stored = 0
  for (const j of jobs) {
    const path = `${candidateId}/${key}/${crypto.randomUUID()}.${j.ext}`
    const u = await supabase.storage.from(BUCKET).upload(path, j.blob, { contentType: j.ext === 'pdf' ? 'application/pdf' : 'image/jpeg' })
    if (u.error) { bad.push(j.name + ': ' + u.error.message); continue }
    const row = { candidate_id: candidateId, category: key, storage_path: path, original_name: j.name, ext: j.ext, size_kb: Math.max(1, Math.round(j.blob.size / 1024)), status: 'wait', note: '', ...extra }
    if (j.boxes) { row.redaction = 'tool'; row.redaction_boxes = j.boxes }
    const r = await supabase.from('documents').insert(row)
    if (r.error) { await supabase.storage.from(BUCKET).remove([path]); bad.push(j.name + ': ' + r.error.message) } else stored++
  }
  return stored
}
