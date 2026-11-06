# Candidate Document Portal

Next.js (App Router) on Vercel + Supabase (Auth, Postgres, Storage). Code on GitHub.

## Planned structure (built from phase 3b)
```
app/
  page.tsx                 candidate login (email OTP); staff link tucked in the footer
  upload/page.tsx          candidate upload page (checklist, redaction, photo, PDF merge)
  staff/login/page.tsx     staff login
  staff/page.tsx           matrix, filters, review, Zip download
  api/otp/request/route.ts only invited emails can receive an OTP
  api/audit/route.ts       writes audit_log with the service role key
lib/supabase/{browser,server}.ts
lib/categories.ts          document categories and rules (from the prototype)
supabase/migrations/001_init.sql
```

## Setup (once)
1. Supabase: create a NEW project (region Singapore). Run `supabase/migrations/001_init.sql` in SQL Editor.
2. Auth > Email: use the 6-digit code template (`{{ .Token }}`), OTP length 6. Before real use, set up custom SMTP (e.g. Resend) because the built-in email quota is very low.
3. GitHub: create a repo, push this folder.
4. Vercel: import the repo, add the 4 env vars from `.env.example`.
5. Run the commented `insert into public.staff` at the end of the SQL with your email as `admin`, then log in at the staff page (email OTP).

## Rules
- Files live in the private bucket `candidate-docs` at `<candidate_id>/<category>/<uuid>.<ext>`; the browser uploads directly to Storage (Vercel functions have a small request-size limit).
- Candidates see only their own rows and files. Recruiters see all. Hiring is read-only and sees only candidates marked offer_made.
- Real candidate data = personal data (PDPA). Inform IT/the data owner before using real candidates.
