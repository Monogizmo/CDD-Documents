// Render PDF pages to canvases in the browser so they can be redacted and flattened to images
export async function pdfPages(file, scale = 1.6, maxPages = 5) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString()
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
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
