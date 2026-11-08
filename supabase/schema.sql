-- Ejecuta este archivo una sola vez en Supabase > SQL Editor > New query.
-- La aplicación usa Auth y las tablas públicas con Row Level Security (RLS).

create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  username text,
  opening_balance bigint not null default 0 check (opening_balance >= 0),
  setup_complete boolean not null default false,
  created_at timestamptz not null default now(),
  constraint profiles_setup_requires_username check (not setup_complete or username is not null),
  constraint profiles_username_format check (
    username is null or username ~ '^[a-z0-9._-]{3,24}$'
  )
);

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  description text not null check (length(trim(description)) between 1 and 80),
  amount bigint not null check (amount > 0),
  date date not null,
  category text not null check (length(trim(category)) between 1 and 40),
  method text not null check (method in ('Efectivo', 'Tarjeta', 'Transferencia')),
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_date_idx
  on public.transactions (user_id, date desc, created_at desc);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category text not null check (length(trim(category)) between 1 and 40),
  month date not null check (extract(day from month) = 1),
  amount bigint not null check (amount > 0),
  created_at timestamptz not null default now(),
  constraint budgets_user_category_month_unique unique (user_id, category, month)
);

create index if not exists budgets_user_month_idx
  on public.budgets (user_id, month desc);

-- Crea un perfil privado para cada cuenta de correo o Google.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, username)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    nullif(lower(trim(new.raw_user_meta_data ->> 'username')), '')
  );
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.handle_new_user() to supabase_auth_admin;
drop trigger if exists on_auth_user_created_mi_bolsillo on auth.users;
create trigger on_auth_user_created_mi_bolsillo
  after insert on auth.users
  for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.transactions from anon, authenticated;
revoke all on table public.budgets from anon, authenticated;

grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.transactions to authenticated;
grant select, insert, update, delete on table public.budgets to authenticated;
grant usage on schema public to authenticated;

drop policy if exists "profiles_read_own" on public.profiles;
create policy "profiles_read_own"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "transactions_manage_own" on public.transactions;
create policy "transactions_manage_own"
  on public.transactions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "budgets_manage_own" on public.budgets;
create policy "budgets_manage_own"
  on public.budgets for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
