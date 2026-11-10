-- Recruiter name list (drop-down on Add Candidate / Candidate card / filters). Staff can add and remove names.
-- Run once, after 001-011. Removing a name only removes it from the list: Candidates that already have it keep it.
create table if not exists public.recruiters (
  name text primary key,
  created_at timestamptz not null default now()
);
alter table public.recruiters enable row level security;

drop policy if exists recruiters_select on public.recruiters;
drop policy if exists recruiters_insert on public.recruiters;
drop policy if exists recruiters_delete on public.recruiters;
create policy recruiters_select on public.recruiters for select to authenticated using (public.is_recruiter());
create policy recruiters_insert on public.recruiters for insert to authenticated with check (public.is_recruiter());
create policy recruiters_delete on public.recruiters for delete to authenticated using (public.is_recruiter());

insert into public.recruiters (name) values
  ('Pisalvit Paphavatana'), ('Jiranan Sittidechkullasin'), ('Supa Chummano'), ('Praethong Tantikijrungrueang'),
  ('Nataphan Wongprommoon'), ('Sunanta Kitbunjerdjarud'), ('Anupong Kijjamnongpun'), ('Nitchamon Loturit'),
  ('Supansa Chaicharoen'), ('Pawinee Kajornkittibaramee'), ('Montita Chaikaew'), ('Wannisa Suksai'),
  ('Piyachat Srisatit'), ('Sonklin Kodthong'), ('Tipthanya Chatchimplee'), ('Amphaporn Dechporn')
on conflict (name) do nothing;
