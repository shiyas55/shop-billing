-- Save customer contacts from completed bills and show them in the shop's customer list.
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null default '',
  phone text not null,
  phone_normalized text not null check (phone_normalized ~ '^[0-9]{6,15}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, phone_normalized)
);

create index if not exists customers_shop_updated_idx on public.customers(shop_id, updated_at desc);

alter table public.customers enable row level security;

drop policy if exists customers_shop_owner_all on public.customers;
create policy customers_shop_owner_all on public.customers for all to authenticated
  using (public.owns_shop(shop_id)) with check (public.owns_shop(shop_id));

grant select, insert, update on public.customers to authenticated;
