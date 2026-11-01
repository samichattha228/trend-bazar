-- TREND BAZAR: run this entire file in Supabase SQL Editor.
-- IMPORTANT: after creating your account, set is_admin=true for your own user
-- using the one-time admin setup instructions in README.md. Never expose service_role keys.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  product_code text not null unique,
  category text not null default 'General',
  description text not null default '',
  price numeric(12,2) not null check (price >= 0),
  compare_at_price numeric(12,2),
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0),
  stock integer not null default 0 check (stock >= 0),
  image_url text,
  video_url text,
  active boolean not null default true,
  views bigint not null default 0,
  average_rating numeric(3,2) not null default 0,
  review_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  customer_name text not null,
  phone text not null,
  city text not null default '',
  address text not null,
  notes text not null default '',
  subtotal numeric(12,2) not null,
  delivery_fee numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  status text not null default 'pending' check (status in ('pending','confirmed','processing','shipped','delivered','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  product_code text not null,
  quantity integer not null check (quantity between 1 and 20),
  unit_price numeric(12,2) not null,
  unit_cost numeric(12,2) not null,
  line_total numeric(12,2) not null
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  customer_name text not null,
  rating integer not null check (rating between 1 and 5),
  body text not null,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists products_active_idx on public.products(active);
create index if not exists products_category_idx on public.products(category);
create index if not exists orders_created_idx on public.orders(created_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists reviews_product_idx on public.reviews(product_id, approved);

-- Create a profile row automatically. New users are never admins by default.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$ begin
  insert into public.profiles(id,full_name) values(new.id, coalesce(new.raw_user_meta_data->>'full_name',''));
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and is_admin=true); $$;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.reviews enable row level security;

drop policy if exists "profile self or admin read" on public.profiles;
create policy "profile self or admin read" on public.profiles for select using (id=auth.uid() or public.is_admin());
drop policy if exists "admin manages profiles" on public.profiles;
create policy "admin manages profiles" on public.profiles for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public reads active categories" on public.categories;
create policy "public reads active categories" on public.categories for select using (active=true or public.is_admin());
drop policy if exists "admin manages categories" on public.categories;
create policy "admin manages categories" on public.categories for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public reads active products" on public.products;
create policy "public reads active products" on public.products for select using (active=true or public.is_admin());
drop policy if exists "admin manages products" on public.products;
create policy "admin manages products" on public.products for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin reads orders" on public.orders;
create policy "admin reads orders" on public.orders for select using (public.is_admin());
drop policy if exists "admin updates orders" on public.orders;
create policy "admin updates orders" on public.orders for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin reads order items" on public.order_items;
create policy "admin reads order items" on public.order_items for select using (public.is_admin());

drop policy if exists "public reads approved reviews" on public.reviews;
create policy "public reads approved reviews" on public.reviews for select using (approved=true or public.is_admin());
drop policy if exists "public submits reviews" on public.reviews;
create policy "public submits reviews" on public.reviews for insert with check (approved=false);
drop policy if exists "admin manages reviews" on public.reviews;
create policy "admin manages reviews" on public.reviews for all using (public.is_admin()) with check (public.is_admin());

-- Keep purchase cost and internal product code inaccessible to public browser roles.
-- Admins retrieve those private fields through the checked RPC below.
revoke select on public.products from anon, authenticated;
grant select (id,name,slug,category,description,price,compare_at_price,image_url,video_url,stock,active,views,average_rating,review_count,created_at,updated_at)
on public.products to anon, authenticated;

create or replace function public.admin_list_products()
returns setof public.products
language plpgsql security definer set search_path=public
as $$ begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  return query select * from public.products order by created_at desc;
end; $$;
revoke all on function public.admin_list_products() from public;
grant execute on function public.admin_list_products() to authenticated;

-- Anonymous customers can only call this function; product prices and internal codes
-- are looked up server-side, never trusted from browser input.
create or replace function public.place_order(
  p_customer_name text, p_phone text, p_city text, p_address text, p_notes text, p_items jsonb
) returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_order_number text := 'TB-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  v_subtotal numeric(12,2) := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty integer;
  v_total_items integer := 0;
begin
  if length(trim(coalesce(p_customer_name,''))) < 2 then raise exception 'Please enter your name'; end if;
  if length(trim(coalesce(p_phone,''))) < 7 then raise exception 'Please enter a valid phone number'; end if;
  if length(trim(coalesce(p_address,''))) < 8 then raise exception 'Please enter your complete address'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'Your cart is empty'; end if;
  if jsonb_array_length(p_items)>30 then raise exception 'Too many different products'; end if;

  insert into public.orders(id,order_number,customer_name,phone,city,address,notes,subtotal,total)
  values(v_order_id,v_order_number,trim(p_customer_name),trim(p_phone),trim(coalesce(p_city,'')),trim(p_address),trim(coalesce(p_notes,'')),0,0);

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty < 1 or v_qty > 20 then raise exception 'Invalid quantity'; end if;
    select * into v_product from public.products
      where id=(v_item->>'product_id')::uuid and active=true for share;
    if not found then raise exception 'A product is no longer available'; end if;
    if v_product.stock < v_qty then raise exception 'Insufficient stock for %',v_product.name; end if;
    v_subtotal := v_subtotal + v_product.price*v_qty;
    v_total_items := v_total_items + 1;
    insert into public.order_items(order_id,product_id,product_name,product_code,quantity,unit_price,unit_cost,line_total)
    values(v_order_id,v_product.id,v_product.name,v_product.product_code,v_qty,v_product.price,v_product.cost_price,v_product.price*v_qty);
    update public.products set stock=stock-v_qty where id=v_product.id;
  end loop;
  if v_total_items=0 then raise exception 'Your cart is empty'; end if;
  update public.orders set subtotal=v_subtotal,total=v_subtotal where id=v_order_id;
  return jsonb_build_object('order_number',v_order_number,'total',v_subtotal);
end; $$;

revoke all on function public.place_order(text,text,text,text,text,jsonb) from public;
grant execute on function public.place_order(text,text,text,text,text,jsonb) to anon, authenticated;

create or replace function public.record_product_view(p_product_id uuid)
returns void language plpgsql security definer set search_path=public
as $$ begin update public.products set views=views+1 where id=p_product_id and active=true; end; $$;
revoke all on function public.record_product_view(uuid) from public;
grant execute on function public.record_product_view(uuid) to anon, authenticated;

-- Keep public review submission safe: reviews remain hidden until admin approves.
grant select on public.products, public.categories, public.reviews to anon, authenticated;
grant insert on public.reviews to anon, authenticated;
grant select, update on public.orders to authenticated;
grant select on public.order_items to authenticated;
grant insert, update, delete on public.products, public.categories to authenticated;
grant select on public.categories to authenticated;

-- Storage bucket for product photos/videos. Admin-only uploads; public read.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('store-media','store-media',true,52428800,array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict(id) do nothing;

drop policy if exists "Public can view store media" on storage.objects;
create policy "Public can view store media" on storage.objects for select using (bucket_id='store-media');
drop policy if exists "Admins upload store media" on storage.objects;
create policy "Admins upload store media" on storage.objects for insert to authenticated with check (bucket_id='store-media' and public.is_admin());
drop policy if exists "Admins update store media" on storage.objects;
create policy "Admins update store media" on storage.objects for update to authenticated using (bucket_id='store-media' and public.is_admin()) with check (bucket_id='store-media' and public.is_admin());
drop policy if exists "Admins delete store media" on storage.objects;
create policy "Admins delete store media" on storage.objects for delete to authenticated using (bucket_id='store-media' and public.is_admin());

insert into public.categories(name) values ('Kitchen'),('Home & Living'),('Cleaning'),('Accessories')
on conflict(name) do nothing;
