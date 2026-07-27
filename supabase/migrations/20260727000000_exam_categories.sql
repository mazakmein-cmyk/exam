-- Persistent, admin-managed exam categories.
-- Previously the category list lived only as a hardcoded array in the frontend
-- (src/lib/constants.ts -> EXAM_CATEGORIES). This table lets the admin add or
-- remove categories from the Admin Dashboard, and those changes immediately
-- become available to creators in the category picker (CategoryCombobox).
--
-- NOTE: this migration is defensive/idempotent. A table named
-- public.exam_categories may already exist in the project (created outside of
-- migrations, e.g. with an extra NOT NULL "slug" column). The blocks below
-- reconcile any such pre-existing shape to what the app needs — the app only
-- relies on id + name — so it is safe to re-run.

-- 1. Ensure the table exists (clean shape for fresh installs).
create table if not exists public.exam_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- 2. Make sure the columns the app needs exist (no-ops if already present).
alter table public.exam_categories add column if not exists name text;
alter table public.exam_categories add column if not exists created_at timestamptz not null default now();

-- 3. Relax any leftover NOT NULL columns we don't populate (e.g. "slug"), and
--    backfill them from name so existing rows stay valid. The app never reads
--    these columns, so a name-derived value is fine.
do $reconcile$
declare
  col record;
begin
  -- Drop NOT NULL on every column except the ones we manage, so inserting by
  -- (name) alone always succeeds regardless of how the table was first created.
  for col in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'exam_categories'
      and is_nullable = 'NO'
      and column_default is null
      and column_name not in ('id', 'name', 'created_at')
  loop
    execute format('alter table public.exam_categories alter column %I drop not null', col.column_name);
  end loop;

  -- If a "slug" column exists, backfill nulls with a slugified name for tidiness.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'exam_categories' and column_name = 'slug'
  ) then
    update public.exam_categories
    set slug = regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')
    where slug is null;
  end if;
end
$reconcile$;

-- 4. Guarantee a single-column UNIQUE index on name (required by ON CONFLICT below).
do $uniq$
begin
  if not exists (
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum = any (i.indkey)
    where n.nspname = 'public'
      and c.relname = 'exam_categories'
      and i.indisunique
      and a.attname = 'name'
      and array_length(i.indkey, 1) = 1
  ) then
    alter table public.exam_categories add constraint exam_categories_name_key unique (name);
  end if;
end
$uniq$;

-- 5. Row Level Security: anyone can read the list (creator picker + marketplace).
alter table public.exam_categories enable row level security;
drop policy if exists "Exam categories are viewable by everyone." on public.exam_categories;
create policy "Exam categories are viewable by everyone." on public.exam_categories
  for select using (true);

-- 6. Seed with the categories that previously lived in the frontend constant so
--    nothing disappears from existing exams / pickers after this migration.
insert into public.exam_categories (name) values
  ('JEE Main'),
  ('JEE Advanced'),
  ('GATE'),
  ('BITSAT'),
  ('VITEEE'),
  ('SRMJEEE'),
  ('SBI SO'),
  ('RBI Grade B'),
  ('RBI Assistant'),
  ('NABARD Grade A'),
  ('NABARD Grade B'),
  ('LIC AAO'),
  ('LIC ADO'),
  ('CAT'),
  ('XAT'),
  ('CMAT'),
  ('Others')
on conflict (name) do nothing;

-- Backfill slug for the freshly seeded rows too, if the column exists.
do $seedslug$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'exam_categories' and column_name = 'slug'
  ) then
    update public.exam_categories
    set slug = regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')
    where slug is null;
  end if;
end
$seedslug$;

-- 7. Admin: create a category. Idempotent — returns the existing row on conflict.
drop function if exists admin_add_exam_category(text);
create or replace function admin_add_exam_category(category_name text)
returns public.exam_categories
language plpgsql
security definer
as $$
declare
  new_row public.exam_categories;
  clean_name text := btrim(category_name);
begin
  if auth.jwt() ->> 'email' not in ('abarnwal3008@mocksetu.in', 'admin@mocksetu.in') then
    raise exception 'Access Denied: Admin privileges required.';
  end if;

  if clean_name is null or clean_name = '' then
    raise exception 'Category name cannot be empty.';
  end if;

  insert into public.exam_categories (name)
  values (clean_name)
  on conflict (name) do nothing
  returning * into new_row;

  -- On conflict nothing is returned above, so fetch the existing row.
  if new_row.id is null then
    select * into new_row from public.exam_categories where name = clean_name;
  end if;

  return new_row;
end;
$$;

-- 8. Admin: delete a category. Exams already tagged with the name keep their text
--    value (exam_category is a plain text column, not a foreign key) — this only
--    removes the option from the picker.
drop function if exists admin_delete_exam_category(uuid);
create or replace function admin_delete_exam_category(category_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if auth.jwt() ->> 'email' not in ('abarnwal3008@mocksetu.in', 'admin@mocksetu.in') then
    raise exception 'Access Denied: Admin privileges required.';
  end if;

  delete from public.exam_categories where id = category_id;
end;
$$;
