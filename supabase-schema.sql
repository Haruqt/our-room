-- ============================================================
--  Our Room — database schema
--  Paste this whole file into Supabase → SQL Editor → Run.
-- ============================================================

-- Who's allowed in. Add both your emails here; nobody else can read or write.
create table if not exists allowed_emails (
  email text primary key
);

-- ⚠️  EDIT THESE TWO LINES BEFORE RUNNING.
-- Only these addresses will be able to read or write anything.
-- Use the exact emails you'll each sign in with.
insert into allowed_emails (email) values
  ('dreicodespace@gmail.com'),
  ('CHERRYL-EMAIL-HERE@gmail.com')
on conflict do nothing;

-- Books, one row per year. Shared by both of you, not per-user.
create table if not exists books (
  year        int primary key,
  cover       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Pages belong to a book and keep their own order.
create table if not exists pages (
  id          uuid primary key default gen_random_uuid(),
  year        int not null references books(year) on delete cascade,
  label       text not null default 'Untitled',
  paper       text not null default 'kraft',
  elements    jsonb not null default '[]'::jsonb,
  position    int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists pages_year_pos on pages (year, position);

-- Folders and photos for the in-room PC.
create table if not exists pc_folders (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists pc_photos (
  id          uuid primary key default gen_random_uuid(),
  folder_id   uuid not null references pc_folders(id) on delete cascade,
  caption     text default '',
  storage_path text not null,          -- path inside the 'photos' bucket
  created_at  timestamptz not null default now()
);
create index if not exists pc_photos_folder on pc_photos (folder_id);

-- The letters on the desktop.
create table if not exists letters (
  id          text primary key,
  filename    text not null,
  body        text not null default '',
  position    int not null default 0,
  updated_at  timestamptz not null default now()
);

-- ============================================================
--  Row Level Security: only the two allowed emails, nobody else
-- ============================================================
alter table books       enable row level security;
alter table pages       enable row level security;
alter table pc_folders  enable row level security;
alter table pc_photos   enable row level security;
alter table letters     enable row level security;
alter table allowed_emails enable row level security;

create or replace function is_allowed()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from allowed_emails
    where email = coalesce(auth.jwt() ->> 'email', '')
  );
$$;

do $$
declare t text;
begin
  foreach t in array array['books','pages','pc_folders','pc_photos','letters']
  loop
    execute format('drop policy if exists "ours only" on %I', t);
    execute format(
      'create policy "ours only" on %I for all using (is_allowed()) with check (is_allowed())', t);
  end loop;
end $$;

-- The allow-list is readable by signed-in users, writable by nobody.
-- NOTE: auth.role() is a legacy helper that returns null on current Supabase,
-- which silently denied this read and made allowed users look barred.
-- "to authenticated" is the modern, reliable form.
drop policy if exists "read allowlist" on allowed_emails;
create policy "read allowlist" on allowed_emails
  for select to authenticated using (true);

-- let the app ask the database directly whether it's allowed, using the same
-- SECURITY DEFINER function the policies use
grant execute on function is_allowed() to authenticated, anon;

-- ============================================================
--  Storage bucket for photos
-- ============================================================
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "ours only read"   on storage.objects;
drop policy if exists "ours only write"  on storage.objects;
drop policy if exists "ours only delete" on storage.objects;

create policy "ours only read" on storage.objects
  for select using (bucket_id = 'photos' and is_allowed());
create policy "ours only write" on storage.objects
  for insert with check (bucket_id = 'photos' and is_allowed());
create policy "ours only delete" on storage.objects
  for delete using (bucket_id = 'photos' and is_allowed());

-- ============================================================
--  keep updated_at honest
-- ============================================================
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists books_touch on books;
create trigger books_touch before update on books
  for each row execute function touch_updated_at();

drop trigger if exists pages_touch on pages;
create trigger pages_touch before update on pages
  for each row execute function touch_updated_at();
