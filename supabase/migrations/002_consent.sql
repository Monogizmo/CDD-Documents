-- Record when the candidate accepted the personal-data notice (run once, after 001)
alter table public.candidates add column if not exists consent_at timestamptz;
