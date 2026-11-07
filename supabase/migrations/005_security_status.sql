-- Phase 3c: enforced ID-card redaction, status dates, onboarding steps, realtime. Run once, after 001-004.
alter table public.documents
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists redaction text check (redaction in ('tool')),
  add column if not exists redaction_boxes int,
  add column if not exists redaction_checked_at timestamptz,
  add column if not exists redaction_checked_by text;
alter table public.candidates
  add column if not exists signed_at timestamptz,
  add column if not exists ready_at timestamptz;

create or replace function public.touch_doc() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists doc_touch on public.documents;
create trigger doc_touch before update on public.documents for each row execute function public.touch_doc();

-- ID card (2.1): candidates can only insert files that came from the redaction tool;
-- nobody (including HR) can approve one that was not redacted AND checked by HR.
create or replace function public.guard_id_doc() returns trigger language plpgsql as $$
begin
  if new.category = '2.1' then
    if tg_op = 'INSERT' and auth.uid() is not null and not public.is_recruiter() and new.redaction is distinct from 'tool' then
      raise exception 'ID card must be uploaded through the redaction tool';
    end if;
    if new.status = 'ok' and (new.redaction is null or new.redaction_checked_at is null) then
      raise exception 'ID card must be redacted and checked by HR before approval';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists doc_id_guard on public.documents;
create trigger doc_id_guard before insert or update on public.documents for each row execute function public.guard_id_doc();

-- Candidates can no longer set id_redacted, signed_at or ready_at themselves
create or replace function public.guard_candidate_update() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_recruiter() and
     (new.srf_no, new."position", new.email, new.auth_user_id, new.offer_made, new.due_date, new.id_redacted, new.signed_at, new.ready_at)
       is distinct from (old.srf_no, old."position", old.email, old.auth_user_id, old.offer_made, old.due_date, old.id_redacted, old.signed_at, old.ready_at)
  then raise exception 'not allowed'; end if;
  return new;
end $$;

drop policy if exists doc_insert on public.documents;
create policy doc_insert on public.documents for insert to authenticated
  with check (public.is_recruiter() or (candidate_id = public.my_candidate_id() and status = 'wait' and note = '' and redaction_checked_at is null));

-- ID cards uploaded before this change were not redacted by the tool: send them back for re-upload
update public.documents set status = 'fix', note = 'กรุณาอัปโหลดบัตรประชาชนใหม่ผ่านเครื่องมือปิดบังข้อมูล'
 where category = '2.1' and redaction is null;

-- Realtime (RLS still applies)
do $$ begin alter publication supabase_realtime add table public.documents; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.candidates; exception when duplicate_object then null; end $$;
