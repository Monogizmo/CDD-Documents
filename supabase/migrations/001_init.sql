-- Candidate Document Portal: Phase 3a (tables, security rules, storage bucket)
-- Run once in Supabase > SQL Editor on a NEW project (region: Singapore).

-- ===== Tables =====
-- Staff are identified by email (verified by the email OTP), so you can add someone
-- before their first login. Roles: admin (everything + manage staff), recruiter, hiring.
create table public.staff (
  email text primary key check (email = lower(email)),
  role text not null default 'recruiter' check (role in ('admin','recruiter','hiring')),
  active boolean not null default true,
  added_at timestamptz not null default now()
);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  srf_no text not null unique,
  position text not null,
  email text not null,
  auth_user_id uuid references auth.users(id) on delete set null,
  first_name text not null default '',
  last_name text not null default '',
  is_male boolean not null default false,
  name_changed boolean not null default false,
  id_redacted boolean not null default false,
  offer_made boolean not null default false,
  due_date date,
  created_at timestamptz not null default now()
);
create index on public.candidates (lower(email));

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  category text not null check (category in ('2.1','2.2','2.3','2.4','2.5','2.6','2.7','2.8','2.9','PS')),
  storage_path text not null unique,  -- <candidate_id>/<category>/<uuid>.<ext>
  original_name text not null,
  ext text not null check (ext in ('pdf','jpg')),
  size_kb int not null,
  status text not null default 'wait' check (status in ('wait','ok','fix')),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index on public.documents (candidate_id);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  actor_role text,
  action text not null,          -- view | download | move | delete | status | zip
  candidate_id uuid,
  document_id uuid,
  detail jsonb
);

-- ===== Helper functions =====
create function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.staff where email = lower(auth.jwt()->>'email') and active limit 1
$$;
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.my_role() = 'admin', false) $$;
create function public.is_recruiter() returns boolean  -- admin counts as recruiter
language sql stable security definer set search_path = public as $$ select coalesce(public.my_role() in ('admin','recruiter'), false) $$;
create function public.is_hiring() returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.my_role() = 'hiring', false) $$;
create function public.hiring_can_see(cid uuid) returns boolean  -- hiring sees only candidates with an offer
language sql stable security definer set search_path = public as $$
  select public.is_hiring() and exists (select 1 from public.candidates where id = cid and offer_made)
$$;

create function public.my_candidate_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.candidates where auth_user_id = auth.uid() limit 1
$$;

-- Link a candidate row to the login account by email (both directions)
create function public.link_on_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.candidates set auth_user_id = new.id
   where lower(email) = lower(new.email) and auth_user_id is null;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.link_on_signup();

create function public.link_on_candidate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select id into new.auth_user_id from auth.users where lower(email) = lower(new.email) limit 1;
  return new;
end $$;
create trigger candidate_link before insert on public.candidates
  for each row execute function public.link_on_candidate();

-- Candidates may edit only their own profile fields; the rest is recruiter-only
create function public.guard_candidate_update() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_recruiter() and
     (new.srf_no, new."position", new.email, new.auth_user_id, new.offer_made, new.due_date)
       is distinct from (old.srf_no, old."position", old.email, old.auth_user_id, old.offer_made, old.due_date)
  then raise exception 'not allowed'; end if;
  return new;
end $$;
create trigger candidate_guard before update on public.candidates
  for each row execute function public.guard_candidate_update();

-- ===== Row Level Security =====
alter table public.staff enable row level security;
alter table public.candidates enable row level security;
alter table public.documents enable row level security;
alter table public.audit_log enable row level security;

create policy staff_select on public.staff for select to authenticated
  using (public.is_admin() or email = lower(auth.jwt()->>'email'));
create policy staff_insert on public.staff for insert to authenticated with check (public.is_admin());
create policy staff_update on public.staff for update to authenticated using (public.is_admin());
create policy staff_delete on public.staff for delete to authenticated using (public.is_admin());

create policy cand_select on public.candidates for select to authenticated
  using (public.is_recruiter() or auth_user_id = auth.uid() or public.hiring_can_see(id));
create policy cand_insert on public.candidates for insert to authenticated with check (public.is_recruiter());
create policy cand_update on public.candidates for update to authenticated
  using (public.is_recruiter() or auth_user_id = auth.uid());
create policy cand_delete on public.candidates for delete to authenticated using (public.is_recruiter());

create policy doc_select on public.documents for select to authenticated
  using (public.is_recruiter() or candidate_id = public.my_candidate_id() or public.hiring_can_see(candidate_id));
create policy doc_insert on public.documents for insert to authenticated
  with check (public.is_recruiter() or (candidate_id = public.my_candidate_id() and status = 'wait' and note = ''));
create policy doc_update on public.documents for update to authenticated using (public.is_recruiter());
create policy doc_delete on public.documents for delete to authenticated
  using (public.is_recruiter() or (candidate_id = public.my_candidate_id() and status <> 'ok'));

create policy audit_select on public.audit_log for select to authenticated using (public.is_recruiter());
-- audit_log rows are written by the server (service role key), never by the browser.
-- Hiring: read-only, and only candidates marked offer_made (no insert/update/delete policies).

-- ===== Private storage bucket =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('candidate-docs', 'candidate-docs', false, 10485760, array['application/pdf','image/jpeg'])
on conflict (id) do nothing;

create policy docs_read on storage.objects for select to authenticated
  using (bucket_id = 'candidate-docs' and (public.is_recruiter() or (storage.foldername(name))[1] = public.my_candidate_id()::text
    or public.hiring_can_see(((storage.foldername(name))[1])::uuid)));
create policy docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'candidate-docs' and (public.is_recruiter() or (storage.foldername(name))[1] = public.my_candidate_id()::text));
create policy docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'candidate-docs' and (public.is_recruiter() or (storage.foldername(name))[1] = public.my_candidate_id()::text));

-- ===== Make yourself admin (replace the email, lowercase). Do this before your first staff login =====
-- insert into public.staff (email, role) values ('your_email@example.com', 'admin');
-- Later, add people (or use an admin screen):  ('name@company.com', 'recruiter')  /  ('name@company.com', 'hiring')
-- Remove access:  update public.staff set active = false where email = 'name@company.com';
