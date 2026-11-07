-- New category codes: PH (Photo, required, no number), OT (Other documents, optional). Pay Slip stays PS.
-- Run once, after 001-003.
alter table public.documents drop constraint if exists documents_category_check;
update public.documents set category = 'PH' where category = '2.9';
alter table public.documents add constraint documents_category_check
  check (category in ('2.1','2.2','2.3','2.4','2.5','2.6','2.7','2.8','PH','PS','OT'));
