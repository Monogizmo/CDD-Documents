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

## Recruiter checklist + bulk upload (migration 006)
- Run `supabase/migrations/006_recruiter_docs.sql` once, after 001-005.
- Recruiter categories live in `RCATS` (lib/categories.js); change the number prefixes (1-1., 1-5. ...) there.
- AOU / Rehire status is stored in `candidate_checks` (recruiter + hiring only, candidates cannot read it).
- Bulk upload guesses the category from the file name (lib/classify.js, edit the keyword rules there) and always shows a review step.

## Other Documents title (migration 007)
Run `007_other_doc_title.sql` after 006. The title typed after upload becomes the file name (`<title> - Name Surname.pdf`). Candidates can edit it only on their own Other Documents that are not yet approved.

## Theme + Dashboard
- Brand colors are CSS variables at the top of `app/globals.css` (`--pri` yellow, `--brown`, ...). Change them there.
- Staff page has a left menu: Dashboard (KPIs, pipeline funnel, positions donut, candidate profile cards, kanban, monthly trend) and Candidates (the original list).
- The pipeline stage is derived from documents (`lib/stage.js`), nothing new to store.
- The candidate's Photo (category PH) is shown on the SRF card, list rows, dashboard and the printable summary via batched signed URLs (`lib/photos.js`). No migration needed for this part.
