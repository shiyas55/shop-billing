-- Shop Billing: initial Supabase schema and transactional billing functions.
create extension if not exists pgcrypto;

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My Shop',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  category text not null check (category in ('kg', 'piece')),
  purchase_price numeric(12,2) not null default 0 check (purchase_price >= 0),
  retail_price numeric(12,2) check (retail_price is null or retail_price >= 0),
  selling_price numeric(12,2) not null check (selling_price >= 0),
  discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  stock_quantity numeric(14,6) not null default 0 check (stock_quantity >= 0),
  low_stock_at numeric(14,6) not null default 0 check (low_stock_at >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (category <> 'piece' or stock_quantity = trunc(stock_quantity)),
  check (category <> 'piece' or low_stock_at = trunc(low_stock_at))
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  receipt_number text not null,
  idempotency_key uuid not null,
  customer_name text not null default '',
  customer_phone text not null default '',
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount_total numeric(12,2) not null default 0 check (discount_total >= 0),
  total numeric(12,2) not null check (total >= 0),
  status text not null default 'completed' check (status in ('completed', 'void')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (shop_id, receipt_number),
  unique (shop_id, idempotency_key)
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  category_snapshot text not null check (category_snapshot in ('kg', 'piece')),
  display_quantity numeric(14,3) not null check (display_quantity > 0),
  display_unit text not null check (display_unit in ('g', 'kg', 'piece')),
  base_quantity numeric(14,6) not null check (base_quantity > 0),
  unit_price_snapshot numeric(12,2) not null check (unit_price_snapshot >= 0),
  cost_price_snapshot numeric(12,2) not null check (cost_price_snapshot >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  check ((category_snapshot = 'kg' and display_unit in ('g', 'kg')) or (category_snapshot = 'piece' and display_unit = 'piece'))
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  method text not null check (method in ('cash', 'upi')),
  amount numeric(12,2) not null check (amount > 0),
  reference text,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  category text not null,
  note text not null default '',
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (method in ('cash', 'upi')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  movement_type text not null check (movement_type in ('opening', 'purchase', 'adjustment', 'sale')),
  quantity numeric(14,6) not null check (quantity <> 0),
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  payment_method text check (payment_method is null or payment_method in ('cash', 'upi')),
  note text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.receipt_counters (
  shop_id uuid not null references public.shops(id) on delete cascade,
  sale_day date not null,
  next_number integer not null check (next_number > 0),
  primary key (shop_id, sale_day)
);

create index if not exists products_shop_active_idx on public.products(shop_id, active, name);
create index if not exists sales_shop_created_idx on public.sales(shop_id, created_at desc);
create index if not exists sale_items_sale_idx on public.sale_items(sale_id);
create index if not exists payments_sale_idx on public.payments(sale_id);
create index if not exists expenses_shop_created_idx on public.expenses(shop_id, created_at desc);
create index if not exists stock_movements_shop_created_idx on public.stock_movements(shop_id, created_at desc);

create or replace function public.owns_shop(target_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.shops s
    where s.id = target_shop_id and s.owner_id = auth.uid()
  );
$$;

alter table public.shops enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.stock_movements enable row level security;
alter table public.receipt_counters enable row level security;

drop policy if exists shops_owner_all on public.shops;
create policy shops_owner_all on public.shops for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists products_shop_owner_all on public.products;
create policy products_shop_owner_all on public.products for all to authenticated
  using (public.owns_shop(shop_id)) with check (public.owns_shop(shop_id));

drop policy if exists sales_shop_owner_read on public.sales;
create policy sales_shop_owner_read on public.sales for select to authenticated
  using (public.owns_shop(shop_id));

drop policy if exists sale_items_shop_owner_read on public.sale_items;
create policy sale_items_shop_owner_read on public.sale_items for select to authenticated
  using (public.owns_shop(shop_id));

drop policy if exists payments_shop_owner_read on public.payments;
create policy payments_shop_owner_read on public.payments for select to authenticated
  using (public.owns_shop(shop_id));

drop policy if exists expenses_shop_owner_all on public.expenses;
create policy expenses_shop_owner_all on public.expenses for all to authenticated
  using (public.owns_shop(shop_id)) with check (public.owns_shop(shop_id));

drop policy if exists stock_movements_shop_owner_read on public.stock_movements;
create policy stock_movements_shop_owner_read on public.stock_movements for select to authenticated
  using (public.owns_shop(shop_id));

drop policy if exists receipt_counters_shop_owner_read on public.receipt_counters;
create policy receipt_counters_shop_owner_read on public.receipt_counters for select to authenticated
  using (public.owns_shop(shop_id));

create or replace function public.receive_stock(
  p_product_id uuid,
  p_quantity numeric,
  p_unit_cost numeric,
  p_payment_method text default null,
  p_note text default '',
  p_movement_type text default 'purchase'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product public.products%rowtype;
  v_movement_id uuid;
begin
  select * into v_product from public.products where id = p_product_id for update;
  if not found or not public.owns_shop(v_product.shop_id) then
    raise exception 'Product not found or access denied';
  end if;
  if p_quantity is null or p_quantity = 0 then raise exception 'Quantity must not be zero'; end if;
  if p_unit_cost is null or p_unit_cost < 0 then raise exception 'Unit cost must be zero or greater'; end if;
  if p_movement_type not in ('purchase', 'adjustment', 'opening') then raise exception 'Invalid stock movement type'; end if;
  if p_movement_type <> 'adjustment' and p_quantity < 0 then raise exception 'Stock received must be positive'; end if;
  if v_product.category = 'piece' and p_quantity <> trunc(p_quantity) then raise exception 'Piece quantity must be a whole number'; end if;
  if coalesce(p_payment_method, '') not in ('', 'cash', 'upi') then raise exception 'Invalid payment method'; end if;
  if p_movement_type = 'purchase' and p_payment_method is null then raise exception 'Choose how the stock purchase was paid'; end if;

  update public.products
     set stock_quantity = stock_quantity + p_quantity,
         purchase_price = case when p_unit_cost > 0 then p_unit_cost else purchase_price end,
         updated_at = now()
   where id = p_product_id
   returning * into v_product;
  if v_product.stock_quantity < 0 then raise exception 'Stock cannot become negative'; end if;

  insert into public.stock_movements(shop_id, product_id, product_name_snapshot, movement_type, quantity, unit_cost, payment_method, note, created_by)
  values (v_product.shop_id, v_product.id, v_product.name, p_movement_type, p_quantity, p_unit_cost, nullif(p_payment_method, ''), coalesce(p_note, ''), auth.uid())
  returning id into v_movement_id;
  return v_movement_id;
end;
$$;

create or replace function public.create_sale(p_payload jsonb, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shop_id uuid;
  v_existing public.sales%rowtype;
  v_sale_id uuid;
  v_receipt_number text;
  v_sale_day date := timezone('Asia/Kolkata', now())::date;
  v_sequence integer;
  v_line jsonb;
  v_product public.products%rowtype;
  v_lines jsonb := '[]'::jsonb;
  v_line_count integer;
  v_index integer := 0;
  v_quantity numeric;
  v_unit text;
  v_base_quantity numeric;
  v_gross numeric;
  v_product_discount numeric;
  v_bill_discount numeric := coalesce((p_payload->>'bill_discount')::numeric, 0);
  v_subtotal numeric := 0;
  v_product_discounts numeric := 0;
  v_discountable numeric := 0;
  v_total numeric := 0;
  v_paid numeric := 0;
  v_line_before numeric;
  v_bill_share numeric;
  v_remaining_discount numeric;
  v_line_total numeric;
  v_method text;
  v_payment jsonb;
  v_payment_amount numeric;
begin
  select id into v_shop_id from public.shops where owner_id = auth.uid() order by created_at limit 1;
  if v_shop_id is null then raise exception 'Create a shop before billing'; end if;
  select * into v_existing from public.sales where shop_id = v_shop_id and idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('sale_id', v_existing.id, 'receipt_number', v_existing.receipt_number, 'total', v_existing.total); end if;
  if coalesce(jsonb_typeof(p_payload->'lines') <> 'array', true) or jsonb_array_length(p_payload->'lines') = 0 then raise exception 'Add a product to the bill'; end if;
  if coalesce(jsonb_typeof(p_payload->'payments') <> 'array', true) then raise exception 'Add a payment method'; end if;

  for v_line in select value from jsonb_array_elements(p_payload->'lines') loop
    v_quantity := (v_line->>'quantity')::numeric;
    v_unit := v_line->>'unit';
    if v_quantity is null or v_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;
    select * into v_product from public.products
      where id = (v_line->>'product_id')::uuid and shop_id = v_shop_id and active = true
      for update;
    if not found then raise exception 'Product not found or inactive'; end if;
    if v_product.category = 'kg' then
      if v_unit = 'g' then v_base_quantity := v_quantity / 1000;
      elsif v_unit = 'kg' then v_base_quantity := v_quantity;
      else raise exception 'Weight products require grams or kilograms'; end if;
    else
      if v_unit <> 'piece' or v_quantity <> trunc(v_quantity) then raise exception 'Piece products require a whole number of pieces'; end if;
      v_base_quantity := v_quantity;
    end if;
    if v_product.stock_quantity < v_base_quantity then raise exception 'Insufficient stock for %', v_product.name; end if;
    v_gross := round(v_base_quantity * v_product.selling_price, 2);
    v_product_discount := round(v_gross * v_product.discount_percent / 100, 2);
    v_subtotal := v_subtotal + v_gross;
    v_product_discounts := v_product_discounts + v_product_discount;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id, 'name', v_product.name, 'category', v_product.category,
      'quantity', v_quantity, 'unit', v_unit, 'base_quantity', v_base_quantity,
      'unit_price', v_product.selling_price, 'cost_price', v_product.purchase_price,
      'gross', v_gross, 'product_discount', v_product_discount
    ));
  end loop;
  v_subtotal := round(v_subtotal, 2);
  v_product_discounts := round(v_product_discounts, 2);
  v_discountable := round(v_subtotal - v_product_discounts, 2);
  if v_bill_discount < 0 or v_bill_discount > v_discountable then raise exception 'Bill discount is greater than the amount due'; end if;
  v_total := round(v_discountable - v_bill_discount, 2);

  select coalesce(sum((value->>'amount')::numeric), 0) into v_paid from jsonb_array_elements(p_payload->'payments');
  if exists (
    select 1 from jsonb_array_elements(p_payload->'payments') p
    where (p->>'method') not in ('cash', 'upi') or (p->>'amount')::numeric <= 0
  ) then raise exception 'Invalid payment details'; end if;
  if round(v_paid, 2) <> v_total then raise exception 'Payment amount must equal the bill total'; end if;

  insert into public.receipt_counters(shop_id, sale_day, next_number)
  values (v_shop_id, v_sale_day, 1)
  on conflict (shop_id, sale_day) do update set next_number = public.receipt_counters.next_number + 1
  returning next_number into v_sequence;
  v_receipt_number := to_char(v_sale_day, 'YYYYMMDD') || '-' || lpad(v_sequence::text, 4, '0');

  insert into public.sales(shop_id, receipt_number, idempotency_key, customer_name, customer_phone, subtotal, discount_total, total, created_by)
  values (
    v_shop_id, v_receipt_number, p_idempotency_key,
    coalesce(nullif(trim(p_payload->>'customer_name'), ''), ''),
    coalesce(nullif(trim(p_payload->>'customer_phone'), ''), ''),
    v_subtotal, round(v_product_discounts + v_bill_discount, 2), v_total, auth.uid()
  ) returning id into v_sale_id;

  v_line_count := jsonb_array_length(v_lines);
  v_remaining_discount := v_bill_discount;
  for v_line in select value from jsonb_array_elements(v_lines) with ordinality as t(value, ord) order by ord loop
    v_index := v_index + 1;
    v_line_before := round((v_line->>'gross')::numeric - (v_line->>'product_discount')::numeric, 2);
    if v_index = v_line_count then
      v_bill_share := least(v_remaining_discount, v_line_before);
    elsif v_discountable > 0 then
      v_bill_share := least(v_remaining_discount, v_line_before, round(v_bill_discount * v_line_before / v_discountable, 2));
      v_remaining_discount := round(v_remaining_discount - v_bill_share, 2);
    else
      v_bill_share := 0;
    end if;
    v_line_total := greatest(0, round(v_line_before - v_bill_share, 2));
    insert into public.sale_items(
      shop_id, sale_id, product_id, product_name_snapshot, category_snapshot, display_quantity, display_unit,
      base_quantity, unit_price_snapshot, cost_price_snapshot, discount_amount, line_total
    ) values (
      v_shop_id, v_sale_id, (v_line->>'product_id')::uuid, v_line->>'name', v_line->>'category',
      (v_line->>'quantity')::numeric, v_line->>'unit', (v_line->>'base_quantity')::numeric,
      (v_line->>'unit_price')::numeric, (v_line->>'cost_price')::numeric,
      round((v_line->>'product_discount')::numeric + v_bill_share, 2), v_line_total
    );
    update public.products set stock_quantity = stock_quantity - (v_line->>'base_quantity')::numeric, updated_at = now()
      where id = (v_line->>'product_id')::uuid and shop_id = v_shop_id;
    insert into public.stock_movements(shop_id, product_id, product_name_snapshot, movement_type, quantity, unit_cost, note, created_by)
    values (v_shop_id, (v_line->>'product_id')::uuid, v_line->>'name', 'sale', -((v_line->>'base_quantity')::numeric), (v_line->>'cost_price')::numeric, 'Receipt ' || v_receipt_number, auth.uid());
  end loop;

  for v_payment in select value from jsonb_array_elements(p_payload->'payments') loop
    v_method := v_payment->>'method';
    v_payment_amount := round((v_payment->>'amount')::numeric, 2);
    insert into public.payments(shop_id, sale_id, method, amount)
      values (v_shop_id, v_sale_id, v_method, v_payment_amount);
  end loop;
  return jsonb_build_object('sale_id', v_sale_id, 'receipt_number', v_receipt_number, 'total', v_total);
end;
$$;

revoke all on function public.owns_shop(uuid) from public, anon;
revoke all on function public.receive_stock(uuid, numeric, numeric, text, text, text) from public, anon;
revoke all on function public.create_sale(jsonb, uuid) from public, anon;
grant execute on function public.owns_shop(uuid) to authenticated;
grant execute on function public.receive_stock(uuid, numeric, numeric, text, text, text) to authenticated;
grant execute on function public.create_sale(jsonb, uuid) to authenticated;
grant select, insert, update on public.shops to authenticated;
grant select, insert, update on public.products to authenticated;
grant select on public.sales, public.sale_items, public.payments, public.stock_movements, public.receipt_counters to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
