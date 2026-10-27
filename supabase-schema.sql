create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  email text not null,
  role text not null check (role in ('guest', 'host')),
  created_at timestamptz not null default now()
);

create table if not exists public.offerings (
  id text primary key,
  owner_id uuid references public.profiles (id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  category text not null,
  description text not null check (char_length(description) between 1 and 240),
  location text not null check (char_length(location) between 1 and 100),
  latitude double precision,
  longitude double precision,
  price integer not null check (price between 100 and 999999),
  rating numeric(2,1) not null default 4.6 check (rating between 1 and 5),
  reviews integer not null default 0 check (reviews >= 0),
  guests integer not null check (guests between 1 and 20),
  bedrooms integer not null default 1 check (bedrooms between 0 and 30),
  bathrooms integer not null default 1 check (bathrooms between 1 and 30),
  icon text not null default '⌂',
  image text not null,
  badge text not null default 'A new favorite',
  amenities text[] not null default '{}',
  days smallint[] not null default '{0,1,2,3,4,5,6}' check (days <@ array[0,1,2,3,4,5,6]::smallint[]),
  minimum_nights integer not null default 1 check (minimum_nights between 1 and 30),
  created_at timestamptz not null default now(),
  check ((latitude is null and longitude is null) or (latitude between 4 and 22 and longitude between 115 and 128))
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  offering_id text not null references public.offerings (id) on delete restrict,
  guest_id uuid not null references public.profiles (id) on delete restrict,
  host_id uuid references public.profiles (id) on delete set null,
  offering_name text not null,
  category text not null,
  location text not null,
  image text not null,
  checkin date not null,
  checkout date not null,
  nights integer not null check (nights > 0),
  guests integer not null check (guests > 0),
  price integer not null check (price > 0),
  total integer not null check (total > 0),
  guest_name text not null,
  guest_email text not null,
  notes text not null default '',
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  check (checkout > checkin),
  check (nights = checkout - checkin),
  check (total = price * nights)
);

create table if not exists public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  offering_id text not null references public.offerings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, offering_id)
);

create index if not exists bookings_guest_id_idx on public.bookings (guest_id, checkin);
create index if not exists bookings_host_id_idx on public.bookings (host_id, checkin);
create index if not exists bookings_offering_dates_idx on public.bookings (offering_id, checkin, checkout);
create index if not exists offerings_owner_id_idx on public.offerings (owner_id);

create or replace function public.create_gather_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := new.raw_user_meta_data ->> 'role';
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
    lower(new.email),
    case when requested_role = 'host' then 'host' else 'guest' end
  );
  return new;
end;
$$;

drop trigger if exists on_gather_user_created on auth.users;
create trigger on_gather_user_created
  after insert on auth.users
  for each row execute function public.create_gather_profile();

alter table public.profiles enable row level security;
alter table public.offerings enable row level security;
alter table public.bookings enable row level security;
alter table public.favorites enable row level security;

drop policy if exists "Profiles are visible to their owner" on public.profiles;
create policy "Profiles are visible to their owner"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Offerings are publicly readable" on public.offerings;
create policy "Offerings are publicly readable"
  on public.offerings for select to anon, authenticated using (true);

drop policy if exists "Hosts can create their own offerings" on public.offerings;
create policy "Hosts can create their own offerings"
  on public.offerings for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'host')
  );

drop policy if exists "Hosts can update their own offerings" on public.offerings;
create policy "Hosts can update their own offerings"
  on public.offerings for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Hosts can remove their own offerings" on public.offerings;
create policy "Hosts can remove their own offerings"
  on public.offerings for delete to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Guests and hosts can read related bookings" on public.bookings;
create policy "Guests and hosts can read related bookings"
  on public.bookings for select to authenticated
  using (
    guest_id = (select auth.uid())
    or exists (
      select 1 from public.offerings o
      where o.id = offering_id and o.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Users can read their own favorites" on public.favorites;
create policy "Users can read their own favorites"
  on public.favorites for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can add their own favorites" on public.favorites;
create policy "Users can add their own favorites"
  on public.favorites for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can remove their own favorites" on public.favorites;
create policy "Users can remove their own favorites"
  on public.favorites for delete to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.get_unavailable_dates()
returns table (offering_id text, checkin date, checkout date)
language sql
stable
security definer
set search_path = ''
as $$
  select b.offering_id, b.checkin, b.checkout
  from public.bookings b
  where b.status = 'confirmed' and b.checkout >= (now() at time zone 'Asia/Manila')::date;
$$;

create or replace function public.create_booking(
  p_offering_id text,
  p_checkin date,
  p_checkout date,
  p_guests integer,
  p_notes text default ''
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles;
  v_offering public.offerings;
  v_nights integer;
  v_booking public.bookings;
begin
  if v_user_id is null then raise exception 'Sign in to reserve a stay.'; end if;
  select * into v_profile from public.profiles where id = v_user_id;
  if not found then raise exception 'Your Gather profile could not be found.'; end if;
  select * into v_offering from public.offerings where id = p_offering_id for share;
  if not found then raise exception 'This stay is no longer available.'; end if;
  if p_checkin is null or p_checkout is null or p_checkin < (now() at time zone 'Asia/Manila')::date or p_checkout <= p_checkin then
    raise exception 'Choose valid check-in and check-out dates in the future.';
  end if;
  v_nights := p_checkout - p_checkin;
  if v_nights < v_offering.minimum_nights then raise exception 'This stay requires at least % nights.', v_offering.minimum_nights; end if;
  if p_guests < 1 or p_guests > v_offering.guests then raise exception 'Choose a guest count this place can accommodate.'; end if;
  if not (extract(dow from p_checkin)::smallint = any(v_offering.days)) then
    raise exception 'This stay is not available for check-in on that day.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_offering_id));
  if exists (
    select 1 from public.bookings b
    where b.offering_id = p_offering_id and b.status = 'confirmed'
      and b.checkin < p_checkout and b.checkout > p_checkin
  ) then
    raise exception 'This stay is not available for those dates. Choose a different stay or dates.';
  end if;

  insert into public.bookings (
    offering_id, guest_id, host_id, offering_name, category, location, image,
    checkin, checkout, nights, guests, price, total, guest_name, guest_email, notes
  ) values (
    v_offering.id, v_user_id, v_offering.owner_id, v_offering.name, v_offering.category,
    v_offering.location, v_offering.image, p_checkin, p_checkout, v_nights,
    p_guests, v_offering.price, v_offering.price * v_nights, v_profile.name,
    v_profile.email, left(coalesce(p_notes, ''), 400)
  ) returning * into v_booking;
  return v_booking;
end;
$$;

create or replace function public.cancel_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  update public.bookings
  set status = 'cancelled'
  where id = p_booking_id and guest_id = auth.uid() and status = 'confirmed'
  returning * into v_booking;
  if not found then raise exception 'This reservation could not be cancelled.'; end if;
  return v_booking;
end;
$$;

create or replace function public.delete_offering(p_offering_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.offerings
    where id = p_offering_id and owner_id = auth.uid()
  ) then
    raise exception 'You can only remove your own listing.';
  end if;
  update public.bookings
  set status = 'cancelled'
  where offering_id = p_offering_id and status = 'confirmed';
  delete from public.offerings where id = p_offering_id and owner_id = auth.uid();
end;
$$;

revoke all on function public.create_booking(text, date, date, integer, text) from public;
revoke all on function public.cancel_booking(uuid) from public;
revoke all on function public.delete_offering(text) from public;
revoke all on function public.get_unavailable_dates() from public;
grant execute on function public.create_booking(text, date, date, integer, text) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.delete_offering(text) to authenticated;
grant execute on function public.get_unavailable_dates() to anon, authenticated;

grant select on public.offerings to anon, authenticated;
grant insert, update, delete on public.offerings to authenticated;
grant select on public.bookings to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, delete on public.favorites to authenticated;
grant usage on schema public to anon, authenticated;

insert into public.offerings (
  id, name, category, description, location, latitude, longitude, price, rating, reviews,
  guests, bedrooms, bathrooms, icon, image, badge, amenities, days, minimum_nights
) values
  ('isla-norte', 'Isla Norte Beach House', 'Island stays', 'A breezy island hideaway, a swim before breakfast, and nowhere else you need to be.', 'General Luna, Siargao, Philippines', 9.7802, 126.1583, 6800, 4.8, 124, 4, 2, 1, '⌂', 'photo-1510414842594-a61c69b5ae57', 'Guest favorite', array['Beach access','Air conditioning','Kitchen'], array[0,1,2,3,4,5,6]::smallint[], 2),
  ('amihan-cabin', 'Amihan Mountain Cabin', 'Mountain escapes', 'Cool mornings, pine-scented air, and a slow cup of coffee above the city.', 'Baguio City, Benguet, Philippines', 16.4023, 120.5960, 4200, 4.9, 86, 4, 2, 1, '♧', 'photo-1449158743715-0a90ebb6d2d8', 'Exceptional', array['Mountain view','Fire pit','Kitchen'], array[0,1,2,3,4,5,6]::smallint[], 1),
  ('bahay-tala', 'Bahay Tala by the Sea', 'Beachfront stays', 'Barefoot mornings, a hammock in the shade, and the sea just beyond the deck.', 'Panglao Island, Bohol, Philippines', 9.5805, 123.7371, 8900, 4.8, 59, 4, 2, 2, '❋', 'photo-1500375592092-40eb2168fd21', 'A little slice of paradise', array['Sea view','Pool','Breakfast'], array[0,1,2,3,4,5,6]::smallint[], 2),
  ('coron-cove', 'Coron Cove Cottage', 'Island stays', 'An easy island base for lagoon days, salty swims, and dinner under the stars.', 'Coron, Palawan, Philippines', 11.9986, 120.2043, 5400, 4.7, 207, 3, 2, 1, '〰', 'photo-1507525428034-b723cf961d3e', 'Rare island find', array['Island views','Garden','Airport transfer'], array[0,1,2,3,4,5,6]::smallint[], 2),
  ('luntian-city-hotel', 'Luntian City Hotel', 'City hotels', 'A calm, leafy hideaway in the middle of Makati, close to galleries, cafés, and the business district.', 'Makati City, Metro Manila, Philippines', 14.5547, 121.0244, 5200, 4.6, 318, 2, 1, 1, '⌂', 'photo-1566073771259-6a8506099945', 'City favorite', array['Rooftop pool','Breakfast','Wi-Fi'], array[0,1,2,3,4,5,6]::smallint[], 1),
  ('bgc-serviced-suite', 'BGC Garden Suite', 'Serviced apartments', 'A light-filled apartment with room to settle in, steps from parks, restaurants, and city life.', 'Bonifacio Global City, Taguig, Philippines', 14.5502, 121.0497, 6100, 4.7, 142, 3, 1, 1, '⌂', 'photo-1522708323590-d24dbb6b0267', 'Room to settle in', array['Kitchen','Work desk','City view'], array[0,1,2,3,4,5,6]::smallint[], 1),
  ('vigan-heritage-inn', 'Casa de Abel Heritage Inn', 'Heritage inns', 'Stay in a lovingly restored Vigan home, with a quiet courtyard just off the cobbled old town.', 'Vigan City, Ilocos Sur, Philippines', 17.5747, 120.3869, 3900, 4.8, 94, 2, 1, 1, '⌂', 'photo-1511818966892-d7d671e672a2', 'A heritage hideaway', array['Heritage home','Courtyard','Breakfast'], array[0,1,2,3,4,5,6]::smallint[], 1),
  ('tagaytay-farmstay', 'Hapag Farm Stay', 'Farm stays', 'Slow mornings, garden-to-table meals, and cool countryside air with a view of Taal.', 'Tagaytay, Cavite, Philippines', 14.1153, 120.9621, 4800, 4.8, 76, 4, 2, 1, '♧', 'photo-1500382017468-9049fed747ef', 'Countryside favorite', array['Garden','Farm breakfast','Taal view'], array[0,1,2,3,4,5,6]::smallint[], 1)
on conflict (id) do nothing;
