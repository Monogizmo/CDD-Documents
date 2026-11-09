export async function getPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString()
  return pdfjs
}
export const isPasswordErr = (e) => !!e && e.name === 'PasswordException'

// Open a PDF that may need a password. ask(file, wrong) -> Promise<string|null> asks the person (null = skip).
// -> { password? } opened | { locked } needs a password but nobody to ask | { cancelled } | { failed } (3 wrong passwords). Throws if the file is broken.
export async function askUntilOpen(file, ask, tries = 3) {
  const pdfjs = await getPdfjs(), data = new Uint8Array(await file.arrayBuffer())
  let password
  for (let i = 0; ; i++) {
    try { const d = await pdfjs.getDocument({ data: data.slice(0), password }).promise; if (d.destroy) d.destroy(); return { password } }
    catch (e) {
      if (!isPasswordErr(e)) throw e
      if (!ask) return { locked: true }
      if (i >= tries) return { failed: true }
      password = await ask(file, i > 0)
      if (!password) return { cancelled: true }
    }
  }
}

// Re-draw every page of a PDF as a picture and save it as a brand-new PDF.
// Used for pay slips: odd PDFs (restricted / strange structure) often fail to open in Power Automate (Outlook), a flat image-PDF always opens.
// scale: render size (2 = about 144 dpi), q: JPEG quality. Throws PasswordException for real password-protected files.
export async function flattenPdf(file, { scale = 2, q = 0.85, maxPages = 20, password, onPage, shouldStop } = {}) {
  const { mkPdf } = await import('./images')
  const pdfjs = await getPdfjs()
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), password }).promise
  if (doc.numPages > maxPages) throw Object.assign(new Error('PDF ยาวเกิน ' + maxPages + ' หน้า'), { tooLong: true })
  const blobs = []
  for (let i = 1; i <= doc.numPages; i++) {
    if (shouldStop && shouldStop()) throw new Error('ยกเลิกแล้ว')
    onPage && onPage(i, doc.numPages)
    const pg = await doc.getPage(i), vp = pg.getViewport({ scale })
    const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height)
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height)
    await pg.render({ canvasContext: g, viewport: vp }).promise
    blobs.push(await new Promise((ok) => cv.toBlob((b) => { b.w = cv.width; b.h = cv.height; ok(b) }, 'image/jpeg', q)))
    cv.width = cv.height = 0
  }
  return mkPdf(blobs)
}

// Render PDF pages to canvases in the browser so they can be redacted and flattened to images
export async function pdfPages(file, scale = 1.6, maxPages = 5, password) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString()
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), password }).promise
  if (doc.numPages > maxPages) return { total: doc.numPages, pages: null }
  const pages = []
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i), vp = pg.getViewport({ scale })
    const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height)
    await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise
    pages.push(cv)
  }
  return { total: doc.numPages, pages }
}
