-- Who looks after the candidate, and Sales / Non-Sales (used for the two tabs and the recruiter filter on the staff page).
-- Run once, after 001-009. Existing candidates stay "not set" (null) until a recruiter picks a type.
alter table public.candidates add column if not exists recruiter_name text not null default '';
alter table public.candidates add column if not exists sales_type text check (sales_type in ('sales', 'non_sales'));

-- candidates must not be able to change these two on their own row (same guard as 005, two more columns)
create or replace function public.guard_candidate_update() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_recruiter() and
     (new.srf_no, new."position", new.email, new.auth_user_id, new.offer_made, new.due_date, new.id_redacted, new.signed_at, new.ready_at, new.recruiter_name, new.sales_type)
       is distinct from (old.srf_no, old."position", old.email, old.auth_user_id, old.offer_made, old.due_date, old.id_redacted, old.signed_at, old.ready_at, old.recruiter_name, old.sales_type)
  then raise exception 'not allowed'; end if;
  return new;
end $$;
