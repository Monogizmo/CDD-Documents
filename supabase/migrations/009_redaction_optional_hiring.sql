-- 1) ID card redaction is no longer forced through the tool.
--    redaction = 'tool'  -> redacted in the browser tool
--    redaction = 'self'  -> candidate confirmed they already redacted it (or the card has no religion / blood group)
-- 2) Hiring (role 'hiring') reads only what is ready to hand over: Verified files, latest version only,
--    and an ID card only after HR's final check. Only candidates with offer_made = true are visible.
-- Run once, after 001-008.

alter table public.documents drop constraint if exists documents_redaction_check;
alter table public.documents add constraint documents_redaction_check check (redaction in ('tool', 'self'));

create or replace function public.guard_id_doc() returns trigger language plpgsql as $$
begin
  if new.category = '2.1' then
    -- a candidate must say how the card was handled (tool, or "I did it / nothing to redact")
    if tg_op = 'INSERT' and auth.uid() is not null and not public.is_recruiter() and new.redaction is null then
      raise exception 'ID card needs the redaction confirmation';
    end if;
    -- approval needs HR's final check of the file
    if new.status = 'ok' and new.redaction_checked_at is null then
      raise exception 'ID card must be checked by HR before approval';
    end if;
  end if;
  return new;
end $$;

-- can the Hiring role read this stored file? (path = <candidate_id>/<category>/<uuid>.<ext>)
create or replace function public.hiring_can_read_file(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_hiring() and exists (
    select 1 from public.documents d
    where d.storage_path = p and public.hiring_can_see(d.candidate_id)
      and d.status = 'ok' and d.superseded_at is null
      and (d.category <> '2.1' or d.redaction_checked_at is not null))
$$;

drop policy if exists doc_select on public.documents;
create policy doc_select on public.documents for select to authenticated
  using (public.is_recruiter()
         or (candidate_id = public.my_candidate_id() and not public.is_recruiter_cat(category))
         or (public.hiring_can_see(candidate_id) and status = 'ok' and superseded_at is null
             and (category <> '2.1' or redaction_checked_at is not null)));

drop policy if exists docs_read on storage.objects;
create policy docs_read on storage.objects for select to authenticated
  using (bucket_id = 'candidate-docs' and (public.is_recruiter()
    or ((storage.foldername(name))[1] = public.my_candidate_id()::text and not public.is_recruiter_cat((storage.foldername(name))[2]))
    or public.hiring_can_read_file(name)));

-- Hiring does not need the internal review log
drop policy if exists ev_select on public.document_events;
create policy ev_select on public.document_events for select to authenticated
  using (public.is_recruiter()
         or (candidate_id = public.my_candidate_id() and visible and not public.is_recruiter_cat(category)));
