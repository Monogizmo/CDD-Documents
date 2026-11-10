-- The review log also records "edit" (recruiter rotated / re-ordered a file and saved it) and "delete" (recruiter removed a file).
-- Log rows keep no file; they survive deleting the file (document_id becomes null). Run once, after 001-010.
alter table public.document_events drop constraint if exists document_events_action_check;
alter table public.document_events add constraint document_events_action_check
  check (action in ('upload', 'revise', 'approve', 'request_revision', 'reopen', 'comment', 'edit', 'delete'));
