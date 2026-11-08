import JSZip from 'jszip'
import { supabase } from './supabase'
import { BUCKET } from './upload'
import { base, fname, isR } from './categories'

// files that may be handed over. scope 'verified' = approved only, 'all' = every uploaded file.
// An ID card additionally needs the redaction tool + HR's final check, whatever the scope.
export function eligible(c, docs, scope = 'verified', withR = true) {
  return docs.filter((d) => d.candidate_id === c.id && (withR || !isR(d.category)) && (scope === 'all' || d.status === 'ok')
    && (d.category !== '2.1' || (d.redaction === 'tool' && d.redaction_checked_at)) && (d.category !== 'RHD' || c.rehire_status === 'rehire'))
}
export const zipName = (c) => `SRF ${String(c.srf_no).replace(/[\\/:*?"<>|]/g, '-')} - ${base(c)}`
export async function addFiles(z, c, list, folder) {
  for (const d of list) {
    const { data } = await supabase.storage.from(BUCKET).download(d.storage_path)
    if (data) z.file((folder ? folder + '/' : '') + fname(c, d, list), data)
  }
}
export async function zipCandidate(c, list) { const z = new JSZip(); await addFiles(z, c, list); return z.generateAsync({ type: 'blob' }) }
export function saveBlob(b, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000) }
export { JSZip }
