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

## Revisions, Review Center, HR workspace (migration 008)
- Run `supabase/migrations/008_revisions_review.sql` after 001-007.
- Revisions: a candidate's "อัปโหลดฉบับแก้ไข" inserts a new file with `replaces` = old file; the old one gets `superseded_at` (kept as history). Review log = `document_events` (written by DB triggers, append-only).
- Status words (lib/status.js): Missing / Received (not opened by HR yet) / Pending (opened, no decision) / Verified / Revision Required.
- HR menu: Dashboard, Candidate List, Document Review (Review Center), Bulk Download, Reports, Add Candidate.
- The status bar and pipeline now stop at "documents complete" (no contract signing / ready-to-start). Columns signed_at / ready_at stay in the DB but are unused.

## Update 009: optional redaction, scan, Hiring page, content-based sorting
- Run `supabase/migrations/009_redaction_optional_hiring.sql` after 001-008, then `npm install` (adds `tesseract.js`).
- ID card: redaction is optional. Candidate either ticks "already redacted / nothing to redact" (`redaction = 'self'`) or uses the tool (zoom + draw/pan modes, `redaction = 'tool'`). HR still does the final check before approving.
- Receipt (2-7) is required. Bank book hint: online version OK, account must be active. Gender shows เพศหญิง when not male.
- Scanner (`components/Scanner.js`, `lib/scan.js`): camera/album -> drag 4 corners -> clean-up filter -> several pages -> one PDF. Photo category uses the plain camera.
- Bulk upload reads the CONTENT when the file name says nothing: PDF text layer first, OCR (Thai + English, `lib/readdoc.js`) for scans/photos. Keyword rules: `TEXT_RULES` in `lib/classify.js`. OCR language data is ~10 MB on first use.
- HR: "complete" is tracked per side (candidate Verified / recruiter checklist / both). Mobile bottom tab bar.
- `/hiring`: Hiring role signs in with email OTP, sees only candidates marked "ส่งให้ Hiring รับเอกสาร" (button on the staff candidate card, `offer_made`) and only Verified files. Add Hiring emails to the `staff` table with role `hiring`.

## Update 010: PDF Checker tab, pay slip flattening
- New recruiter tab "PDF Checker & Automation Prep" (`components/PdfChecker.js`, `lib/pdfcheck.js`, ported from HR Document Hub). Runs fully in the browser. New dependency: `pdf-lib` (run `npm install` / redeploy).
- Pay slips (category PS) uploaded by candidates: PDFs are redrawn as pictures and saved as a new PDF (`flattenPdf` in `lib/pdf.js`, called from `genericJobs`); pictures become a PDF as before. Real password-protected files are refused with a message.
- Receipt (2-7) is optional again.

## Update 011: locked PDFs, Recruiter + Sales/Non-Sales, tidier list
- Run `supabase/migrations/010_recruiter_sales_type.sql` (adds `recruiter_name`, `sales_type`; candidates cannot edit them).
- Locked PDF uploaded by a candidate: the portal asks for the file's password (3 tries), unlocks it in the browser (page re-drawn as a new PDF) and uploads the unlocked copy. The password is never sent or stored. Recruiter uploads use a simple prompt.
- Add Candidate asks for the Recruiter name and Sales / Non-Sales. Candidate List has Sales / Non-Sales tabs (plus "not set" for older candidates) and a Recruiter filter; type and recruiter can be edited inside the opened card.
- Missing documents are shown as small chips ("2-7 Receipt") with a "+N" toggle instead of one long red line.

## Update 012: delete from the web, viewer tools for every file
- Run `supabase/migrations/011_review_log_edit_delete.sql` (review log also records edit / delete).
- Review Center: every file (PDF or picture) opens in `components/DocViewer.js` with zoom, rotate page, rotate all, move page, delete page and "save". Saving keeps PDF text (pdf-lib), replaces the stored file, removes the old one, and puts an Approved file back to "waiting" so it must be approved again.
- "🗑 ลบไฟล์" on every file card in Review Center (and the existing delete in the candidate card): removes the Storage file AND the row in `documents` (older versions included) and writes a text-only log line. Deleting only inside the Supabase Storage screen leaves the row behind; the Review Center now says "file not found in Storage" with the delete button to clean it up.

## Update 012: delete all documents of a candidate
- `app/api/purge-docs/route.js` (server, uses `SUPABASE_SERVICE_ROLE_KEY`): deletes every Storage file of a candidate (also files with no table row) and the rows in `documents`, then writes an `audit_log` line. Recruiter/admin: any candidate. Hiring: only candidates handed over to Hiring.
- Buttons: staff candidate card "🗑 ลบเอกสารทั้งหมดของคนนี้"; /hiring per candidate "🗑 ลบเอกสาร" and "ลบเอกสารของที่เลือก".
- Per-file delete (🗑 ลบไฟล์) and the page viewer with rotate / reorder / delete page / Save (`components/DocViewer.js`) are in Document Review. If the viewer cannot start on a machine it now says so before falling back to the browser's own viewer.

## Update 013: "Quiet Intelligence" redesign
- Theme tokens in `:root` (warm paper, hairlines, yellow only for the main action) + the v2 block at the end of `app/globals.css`.
- Candidate (`app/page.js`): hello + progress ring + one "next step" card; documents as a to-do list grouped Needs action / Waiting for HR / Done / Optional, tap a row to open its upload area; bulk upload, my info and the guide are quiet folds below. Status and summary are on the second tab.
- HR: top navigation instead of the left sidebar (bottom bar on phones); Dashboard starts with `components/TodayInbox.js` ("what needs me today?": files to review, waiting for recruiter-side documents, ready for Hiring, waiting for candidate fixes, overdue); Reports start with a per-recruiter table.

## Update 014: new sign-in screen
- `components/LoginScreen.js` replaces the old login panels on `/`, `/staff` and `/hiring` (same Supabase email-OTP and team-code logic). Role switch (Candidate / HR Team / Hiring) links to the three entrances. Styles: `.lx*` at the end of `app/globals.css`; palette variables at the top of `.lx` (Deep Navy, Sage, Ivory + CI yellow accents). Font: IBM Plex Sans Thai (`app/layout.js`).
