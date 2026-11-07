-- For the team access-code login: failed-attempt log (server writes with the service role key only)
create table if not exists public.access_attempts (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  ok boolean not null
);
create index if not exists access_attempts_at on public.access_attempts (at);
alter table public.access_attempts enable row level security;  -- no policies = browser can never read or write it

-- The shared account that the code signs in as. Use a RECRUITER account, not admin, and any email you control.
-- insert into public.staff (email, role) values ('team-hr@yourcompany.com', 'recruiter');
