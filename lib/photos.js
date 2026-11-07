'use client'
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { BUCKET } from './upload'

// candidate_id -> signed URL of the newest Photo (PH) file. One batched request; links last 1 hour.
export function usePhotoUrls(docs) {
  const [m, setM] = useState({})
  const latest = {}
  docs.filter((d) => d.category === 'PH').forEach((d) => { if (!latest[d.candidate_id] || d.created_at > latest[d.candidate_id].created_at) latest[d.candidate_id] = d })
  const list = Object.values(latest)
  const key = list.map((d) => d.id).sort().join(',')
  useEffect(() => {
    let off = false
    if (!list.length) { setM({}); return }
    supabase.storage.from(BUCKET).createSignedUrls(list.map((d) => d.storage_path), 3600).then(({ data }) => {
      if (off || !data) return
      const byPath = Object.fromEntries(data.filter((r) => r.signedUrl).map((r) => [r.path, r.signedUrl]))
      const o = {}
      list.forEach((d) => { if (byPath[d.storage_path]) o[d.candidate_id] = byPath[d.storage_path] })
      setM(o)
    })
    return () => { off = true }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return m
}
