-- Other Documents (OT candidate side, ROT recruiter side): a free-text title that becomes the file name. Run once, after 001-006.
alter table public.documents add column if not exists title text not null default '';

-- Candidates may edit ONLY the title, and only on their own Other Documents that are not approved yet
create or replace function public.guard_doc_update() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_recruiter() and
     (new.candidate_id, new.category, new.storage_path, new.original_name, new.ext, new.size_kb, new.status, new.note,
      new.redaction, new.redaction_boxes, new.redaction_checked_at, new.redaction_checked_by)
     is distinct from
     (old.candidate_id, old.category, old.storage_path, old.original_name, old.ext, old.size_kb, old.status, old.note,
      old.redaction, old.redaction_boxes, old.redaction_checked_at, old.redaction_checked_by)
  then raise exception 'not allowed'; end if;
  return new;
end $$;
drop trigger if exists doc_update_guard on public.documents;
create trigger doc_update_guard before update on public.documents for each row execute function public.guard_doc_update();

drop policy if exists doc_update on public.documents;
create policy doc_update on public.documents for update to authenticated
  using (public.is_recruiter() or (candidate_id = public.my_candidate_id() and category = 'OT' and status <> 'ok'))
  with check (public.is_recruiter() or (candidate_id = public.my_candidate_id() and category = 'OT' and status <> 'ok'));
