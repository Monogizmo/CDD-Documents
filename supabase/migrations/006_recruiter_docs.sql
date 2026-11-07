-- Recruiter checklist documents (SRF, Application, Offer, AOU, Rehire ...). Run once, after 001-005.
-- These categories are recruiter-side only: candidates can neither see nor upload them.

-- 1) Category codes
alter table public.documents drop constraint if exists documents_category_check;
alter table public.documents add constraint documents_category_check
  check (category in ('2.1','2.2','2.3','2.4','2.5','2.6','2.7','2.8','PH','PS','OT',
                      'SRF','APP','CV','OFF','OSU','AOU','EML','RHC','RHD','ROT'));

create or replace function public.is_recruiter_cat(cat text) returns boolean
language sql immutable as $$
  select cat in ('SRF','APP','CV','OFF','OSU','AOU','EML','RHC','RHD','ROT')
$$;

-- 2) AOU / Rehire status lives in its own table so candidates can never read it
create table if not exists public.candidate_checks (
  candidate_id uuid primary key references public.candidates(id) on delete cascade,
  aou_status text check (aou_status in ('b','b_clear','normal','not_found')),
  rehire_status text check (rehire_status in ('new_hire','rehire')),
  updated_at timestamptz not null default now()
);
alter table public.candidate_checks enable row level security;
create policy checks_select on public.candidate_checks for select to authenticated
  using (public.is_recruiter() or public.hiring_can_see(candidate_id));
create policy checks_insert on public.candidate_checks for insert to authenticated with check (public.is_recruiter());
create policy checks_update on public.candidate_checks for update to authenticated using (public.is_recruiter());
create policy checks_delete on public.candidate_checks for delete to authenticated using (public.is_recruiter());

create or replace function public.touch_checks() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists checks_touch on public.candidate_checks;
create trigger checks_touch before update on public.candidate_checks for each row execute function public.touch_checks();

do $$ begin alter publication supabase_realtime add table public.candidate_checks; exception when duplicate_object then null; end $$;

-- 3) Candidates must not see / insert / delete recruiter-side documents (rows or files)
drop policy if exists doc_select on public.documents;
create policy doc_select on public.documents for select to authenticated
  using (public.is_recruiter() or public.hiring_can_see(candidate_id)
         or (candidate_id = public.my_candidate_id() and not public.is_recruiter_cat(category)));

drop policy if exists doc_insert on public.documents;
create policy doc_insert on public.documents for insert to authenticated
  with check (public.is_recruiter() or (candidate_id = public.my_candidate_id() and not public.is_recruiter_cat(category)
              and status = 'wait' and note = '' and redaction_checked_at is null));

drop policy if exists doc_delete on public.documents;
create policy doc_delete on public.documents for delete to authenticated
  using (public.is_recruiter() or (candidate_id = public.my_candidate_id() and not public.is_recruiter_cat(category) and status <> 'ok'));

-- storage path = <candidate_id>/<category>/<uuid>.<ext>, so the category is folder [2]
drop policy if exists docs_read on storage.objects;
create policy docs_read on storage.objects for select to authenticated
  using (bucket_id = 'candidate-docs' and (public.is_recruiter()
    or ((storage.foldername(name))[1] = public.my_candidate_id()::text and not public.is_recruiter_cat((storage.foldername(name))[2]))
    or public.hiring_can_see(((storage.foldername(name))[1])::uuid)));

drop policy if exists docs_insert on storage.objects;
create policy docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'candidate-docs' and (public.is_recruiter()
    or ((storage.foldername(name))[1] = public.my_candidate_id()::text and not public.is_recruiter_cat((storage.foldername(name))[2]))));

drop policy if exists docs_delete on storage.objects;
create policy docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'candidate-docs' and (public.is_recruiter()
    or ((storage.foldername(name))[1] = public.my_candidate_id()::text and not public.is_recruiter_cat((storage.foldername(name))[2]))));
