import { createClient } from '@supabase/supabase-js'
// Browser client: uses only the public anon/publishable key. Row Level Security protects the data.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)
