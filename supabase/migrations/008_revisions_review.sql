-- Document revisions (old + new files), review log (approve / request revision / comment), "opened by HR" marker.
-- Run once, after 001-007.

alter table public.documents
  add column if not exists rev int not null default 1,
  add column if not exists replaces uuid references public.documents(id) on delete set null,
  add column if not exists superseded_at timestamptz,   -- set when a newer revision replaces this file
  add column if not exists opened_at timestamptz;       -- first time HR looked at the file (Received -> Pending)

-- ============ review log ============
create table if not exists public.document_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete set null,   -- the log survives deleting the file
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  category text not null,
  action text not null check (action in ('upload','revise','approve','request_revision','reopen','comment')),
  comment text not null default '',
  visible boolean not null default false,        -- true = the candidate can see this entry
  actor_role text not null default 'system',
  actor_email text not null default '',
  file_name text not null default '',
  rev int not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists document_events_cand on public.document_events (candidate_id, created_at);
alter table public.document_events enable row level security;
drop policy if exists ev_select on public.document_events;
create policy ev_select on public.document_events for select to authenticated
  using (public.is_recruiter() or public.hiring_can_see(candidate_id)
         or (candidate_id = public.my_candidate_id() and visible and not public.is_recruiter_cat(category)));
drop policy if exists ev_insert on public.document_events;
create policy ev_insert on public.document_events for insert to authenticated with check (public.is_recruiter());
-- append-only: no update / delete policies

-- ============ revisions ============
create or replace function public.doc_rev_before() returns trigger language plpgsql security definer set search_path = public as $$
declare o public.documents;
begin
  if new.replaces is not null then
    select * into o from public.documents where id = new.replaces;
    if not found or o.candidate_id <> new.candidate_id or o.category <> new.category or o.superseded_at is not null then
      raise exception 'invalid revision';
    end if;
    if o.status = 'ok' and auth.uid() is not null and not public.is_recruiter() then
      raise exception 'approved files cannot be revised';
    end if;
    new.rev = o.rev + 1;
  end if;
  return new;
end $$;
drop trigger if exists doc_rev_before on public.documents;
create trigger doc_rev_before before insert on public.documents for each row execute function public.doc_rev_before();

create or replace function public.doc_rev_after() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.replaces is not null then
    perform set_config('app.revising', '1', true);
    update public.documents set superseded_at = now() where id = new.replaces;
    perform set_config('app.revising', '', true);
  end if;
  if not public.is_recruiter_cat(new.category) then
    insert into public.document_events (document_id, candidate_id, category, action, visible, actor_role, actor_email, file_name, rev)
    values (new.id, new.candidate_id, new.category, case when new.replaces is null then 'upload' else 'revise' end, true,
            case when auth.uid() is null then 'system' when public.is_recruiter() then 'recruiter' else 'candidate' end,
            coalesce(auth.jwt() ->> 'email', ''), new.original_name, new.rev);
  end if;
  return new;
end $$;
drop trigger if exists doc_rev_after on public.documents;
create trigger doc_rev_after after insert on public.documents for each row execute function public.doc_rev_after();

-- every status change is logged automatically (approve / request revision / reopen)
create or replace function public.doc_status_event() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and not public.is_recruiter_cat(new.category) then
    insert into public.document_events (document_id, candidate_id, category, action, comment, visible, actor_role, actor_email, file_name, rev)
    values (new.id, new.candidate_id, new.category,
            case new.status when 'ok' then 'approve' when 'fix' then 'request_revision' else 'reopen' end,
            case when new.status = 'fix' then new.note else '' end, true,
            case when auth.uid() is null then 'system' when public.is_recruiter() then 'recruiter' else 'candidate' end,
            coalesce(auth.jwt() ->> 'email', ''), new.original_name, new.rev);
  end if;
  return new;
end $$;
drop trigger if exists doc_status_event on public.documents;
create trigger doc_status_event after update on public.documents for each row execute function public.doc_status_event();

-- opening a file must not look like a content change
create or replace function public.touch_doc() returns trigger language plpgsql as $$
begin
  if new.opened_at is distinct from old.opened_at
     and (new.status, new.category, new.note, new.title, new.storage_path, new.superseded_at)
         is not distinct from (old.status, old.category, old.note, old.title, old.storage_path, old.superseded_at)
  then new.updated_at = old.updated_at; else new.updated_at = now(); end if;
  return new;
end $$;

-- candidates still may only edit the title (and the system may mark a file superseded)
create or replace function public.guard_doc_update() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_recruiter() and coalesce(current_setting('app.revising', true), '') <> '1' and
     (new.candidate_id, new.category, new.storage_path, new.original_name, new.ext, new.size_kb, new.status, new.note,
      new.redaction, new.redaction_boxes, new.redaction_checked_at, new.redaction_checked_by,
      new.rev, new.replaces, new.superseded_at, new.opened_at)
     is distinct from
     (old.candidate_id, old.category, old.storage_path, old.original_name, old.ext, old.size_kb, old.status, old.note,
      old.redaction, old.redaction_boxes, old.redaction_checked_at, old.redaction_checked_by,
      old.rev, old.replaces, old.superseded_at, old.opened_at)
  then raise exception 'not allowed'; end if;
  return new;
end $$;

-- candidates can delete only a first-version file that is not approved (revisions keep their history)
drop policy if exists doc_delete on public.documents;
create policy doc_delete on public.documents for delete to authenticated
  using (public.is_recruiter() or (candidate_id = public.my_candidate_id() and not public.is_recruiter_cat(category)
         and status <> 'ok' and replaces is null and superseded_at is null));
