create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  email text,
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
  offering_id text references public.offerings (id) on delete set null,
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
  guest_email text,
  notes text not null default '',
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  check (checkout > checkin),
  check (nights = checkout - checkin),
  check (total = price * nights)
);

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings
  add constraint bookings_status_check check (status in ('pending', 'confirmed', 'cancelled'));
alter table public.bookings alter column offering_id drop not null;
alter table public.profiles alter column email drop not null;
alter table public.bookings alter column guest_email drop not null;
alter table public.bookings drop constraint if exists bookings_offering_id_fkey;
alter table public.bookings
  add constraint bookings_offering_id_fkey
  foreign key (offering_id) references public.offerings (id) on delete set null;

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
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Gather guest'
    ),
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
    or host_id = (select auth.uid())
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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Gather listing photos are publicly readable" on storage.objects;
create policy "Gather listing photos are publicly readable"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'listing-photos');

drop policy if exists "Hosts can upload Gather listing photos" on storage.objects;
create policy "Hosts can upload Gather listing photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'host'
    )
  );

drop policy if exists "Hosts can remove their Gather listing photos" on storage.objects;
create policy "Hosts can remove their Gather listing photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

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
  if coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Create or sign in to a Gather account to request a stay.';
  end if;
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
    checkin, checkout, nights, guests, price, total, guest_name, guest_email, notes, status
  ) values (
    v_offering.id, v_user_id, v_offering.owner_id, v_offering.name, v_offering.category,
    v_offering.location, v_offering.image, p_checkin, p_checkout, v_nights,
    p_guests, v_offering.price, v_offering.price * v_nights, v_profile.name,
    v_profile.email, left(coalesce(p_notes, ''), 400), 'pending'
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
  where id = p_booking_id and guest_id = auth.uid() and status in ('pending', 'confirmed')
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
  where offering_id = p_offering_id and status in ('pending', 'confirmed');
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

update public.offerings set image = 'assets/stays/siargao-cloud9.jpg'
where id = 'isla-norte' and image = 'photo-1510414842594-a61c69b5ae57';
update public.offerings set image = 'assets/stays/baguio-camp-john-hay.jpg'
where id = 'amihan-cabin' and image = 'photo-1449158743715-0a90ebb6d2d8';
update public.offerings set image = 'assets/stays/alona-beach-panglao.jpg'
where id = 'bahay-tala' and image = 'photo-1500375592092-40eb2168fd21';
update public.offerings set image = 'assets/stays/coron-twin-lagoon.jpg'
where id = 'coron-cove' and image = 'photo-1507525428034-b723cf961d3e';
update public.offerings set image = 'assets/stays/makati-skyline.jpg'
where id = 'luntian-city-hotel' and image = 'photo-1566073771259-6a8506099945';
update public.offerings set image = 'assets/stays/bgc-burgos-circle.jpg'
where id = 'bgc-serviced-suite' and image = 'photo-1522708323590-d24dbb6b0267';
update public.offerings set image = 'assets/stays/vigan-calle-crisologo.jpg'
where id = 'vigan-heritage-inn' and image = 'photo-1511818966892-d7d671e672a2';
update public.offerings set image = 'assets/stays/tagaytay-taal.jpg'
where id = 'tagaytay-farmstay' and image = 'photo-1500382017468-9049fed747ef';

insert into public.offerings (
  id, name, category, description, location, latitude, longitude, price, rating, reviews,
  guests, bedrooms, bathrooms, icon, image, badge, amenities, days, minimum_nights
) values
  ('isla-norte', 'Isla Norte Beach House', 'Island stays', 'A breezy island hideaway, a swim before breakfast, and nowhere else you need to be.', 'General Luna, Siargao, Philippines', 9.7802, 126.1583, 6800, 4.8, 124, 4, 2, 1, '⌂', 'assets/stays/siargao-cloud9.jpg', 'Guest favorite', array['Beach access','Air conditioning','Kitchen'], array[0,1,2,3,4,5,6]::smallint[], 2),
  ('amihan-cabin', 'Amihan Mountain Cabin', 'Mountain escapes', 'Cool mornings, pine-scented air, and a slow cup of coffee above the city.', 'Baguio City, Benguet, Philippines', 16.4023, 120.5960, 4200, 4.9, 86, 4, 2, 1, '♧', 'assets/stays/baguio-camp-john-hay.jpg', 'Exceptional', array['Mountain view','Fire pit','Kitchen'], array[0,1,2,3,4,5,6]::smallint[], 1),
  ('bahay-tala', 'Bahay Tala by the Sea', 'Beachfront stays', 'Barefoot mornings, a hammock in the shade, and the sea just beyond the deck.', 'Panglao Island, Bohol, Philippines', 9.5805, 123.7371, 8900, 4.8, 59, 4, 2, 2, '❋', 'assets/stays/alona-beach-panglao.jpg', 'A little slice of paradise', array['Sea view','Pool','Breakfast'], array[0,1,2,3,4,5,6]::smallint[], 2),
  ('coron-cove', 'Coron Cove Cottage', 'Island stays', 'An easy island base for lagoon days, salty swims, and dinner under the stars.', 'Coron, Palawan, Philippines', 11.9986, 120.2043, 5400, 4.7, 207, 3, 2, 1, '〰', 'assets/stays/coron-twin-lagoon.jpg', 'Rare island find', array['Island views','Garden','Airport transfer'], array[0,1,2,3,4,5,6]::smallint[], 2),
  ('luntian-city-hotel', 'Luntian City Hotel', 'City hotels', 'A calm, leafy hideaway in the middle of Makati, close to galleries, cafés, and the business district.', 'Makati City, Metro Manila, Philippines', 14.5547, 121.0244, 5200, 4.6, 318, 2, 1, 1, '⌂', 'assets/stays/makati-skyline.jpg', 'City favorite', array['Rooftop pool','Breakfast','Wi-Fi'], array[0,1,2,3,4,5,6]::smallint[], 1),
  ('bgc-serviced-suite', 'BGC Garden Suite', 'Serviced apartments', 'A light-filled apartment with room to settle in, steps from parks, restaurants, and city life.', 'Bonifacio Global City, Taguig, Philippines', 14.5502, 121.0497, 6100, 4.7, 142, 3, 1, 1, '⌂', 'assets/stays/bgc-burgos-circle.jpg', 'Room to settle in', array['Kitchen','Work desk','City view'], array[0,1,2,3,4,5,6]::smallint[], 1),
  ('vigan-heritage-inn', 'Casa de Abel Heritage Inn', 'Heritage inns', 'Stay in a lovingly restored Vigan home, with a quiet courtyard just off the cobbled old town.', 'Vigan City, Ilocos Sur, Philippines', 17.5747, 120.3869, 3900, 4.8, 94, 2, 1, 1, '⌂', 'assets/stays/vigan-calle-crisologo.jpg', 'A heritage hideaway', array['Heritage home','Courtyard','Breakfast'], array[0,1,2,3,4,5,6]::smallint[], 1),
  ('tagaytay-farmstay', 'Hapag Farm Stay', 'Farm stays', 'Slow mornings, garden-to-table meals, and cool countryside air with a view of Taal.', 'Tagaytay, Cavite, Philippines', 14.1153, 120.9621, 4800, 4.8, 76, 4, 2, 1, '♧', 'assets/stays/tagaytay-taal.jpg', 'Countryside favorite', array['Garden','Farm breakfast','Taal view'], array[0,1,2,3,4,5,6]::smallint[], 1),
  ('peninsula-makati', 'Dusit Thani Manila', 'City hotels', 'A hotel in Makati''s central business district. Send a request to check current room availability and terms.', 'Makati City, Metro Manila, Philippines', 14.5526, 121.0224, 12000, 4.6, 0, 2, 1, 1, '⌂', 'assets/stays/makati-skyline.jpg', 'Explore Makati', array[]::text[], array[0,1,2,3,4,5,6]::smallint[], 1),
  ('manila-hotel-ermita', 'The Manila Hotel', 'Heritage hotels', 'A hotel by Manila Bay and Rizal Park. Send a request to check current room availability and terms.', 'Ermita, Manila, Philippines', 14.5821, 120.9747, 10000, 4.6, 0, 2, 1, 1, '⌂', 'assets/stays/makati-skyline.jpg', 'Explore Manila', array[]::text[], array[0,1,2,3,4,5,6]::smallint[], 1),
  ('okada-manila', 'Okada Manila', 'City hotels', 'A hotel and resort complex in Entertainment City. Send a request to check current room availability and terms.', 'Parañaque City, Metro Manila, Philippines', 14.5143, 120.9822, 19000, 4.6, 0, 2, 1, 1, '⌂', 'assets/stays/makati-skyline.jpg', 'Explore Parañaque', array[]::text[], array[0,1,2,3,4,5,6]::smallint[], 1),
  ('discovery-shores-boracay', 'Discovery Shores Boracay', 'Beach resorts', 'A resort on Boracay''s White Beach. Send a request to check current room availability and terms.', 'Boracay Island, Aklan, Philippines', 11.9718, 121.9185, 22000, 4.6, 0, 2, 1, 1, '❋', 'assets/stays/alona-beach-panglao.jpg', 'Explore Boracay', array[]::text[], array[0,1,2,3,4,5,6]::smallint[], 1),
  ('amorita-bohol', 'Amorita Resort', 'Beach resorts', 'A resort above Alona Beach on Panglao Island. Send a request to check current room availability and terms.', 'Panglao Island, Bohol, Philippines', 9.5454, 123.7726, 19000, 4.6, 0, 2, 1, 1, '❋', 'assets/stays/alona-beach-panglao.jpg', 'Explore Panglao', array[]::text[], array[0,1,2,3,4,5,6]::smallint[], 1),
  ('bohol-beach-club', 'Bohol Beach Club', 'Beach resorts', 'A beachfront resort on Panglao Island. Send a request to check current room availability and terms.', 'Panglao Island, Bohol, Philippines', 9.5718, 123.7740, 11000, 4.6, 0, 2, 1, 1, '❋', 'assets/stays/alona-beach-panglao.jpg', 'Explore Panglao', array[]::text[], array[0,1,2,3,4,5,6]::smallint[], 1),
  ('shangri-la-mactan', 'Shangri-La Mactan, Cebu', 'Beach resorts', 'A resort on Mactan Island. Send a request to check current room availability and terms.', 'Lapu-Lapu City, Cebu, Philippines', 10.3090, 124.0160, 22000, 4.6, 0, 2, 1, 1, '❋', 'assets/stays/alona-beach-panglao.jpg', 'Explore Cebu', array[]::text[], array[0,1,2,3,4,5,6]::smallint[], 1),
  ('radisson-blu-cebu', 'Radisson Blu Cebu', 'City hotels', 'A hotel near Cebu City''s North Reclamation Area. Send a request to check current room availability and terms.', 'Cebu City, Cebu, Philippines', 10.3110, 123.9180, 9000, 4.6, 0, 2, 1, 1, '⌂', 'assets/stays/makati-skyline.jpg', 'Explore Cebu City', array[]::text[], array[0,1,2,3,4,5,6]::smallint[], 1),
  ('seda-cebu', 'Seda Ayala Center Cebu', 'City hotels', 'A hotel in Cebu City''s Cebu Business Park. Send a request to check current room availability and terms.', 'Cebu City, Cebu, Philippines', 10.3170, 123.9060, 7500, 4.6, 0, 2, 1, 1, '⌂', 'assets/stays/makati-skyline.jpg', 'Explore Cebu City', array[]::text[], array[0,1,2,3,4,5,6]::smallint[], 1),
  ('anya-tagaytay', 'Anya Resort Tagaytay', 'Nature retreats', 'A resort in Tagaytay. Send a request to check current room availability and terms.', 'Tagaytay, Cavite, Philippines', 14.1070, 120.9540, 17000, 4.6, 0, 2, 1, 1, '♧', 'assets/stays/tagaytay-taal.jpg', 'Explore Tagaytay', array[]::text[], array[0,1,2,3,4,5,6]::smallint[], 1),
  ('lagen-island-el-nido', 'El Nido Resorts Lagen Island', 'Island resorts', 'A resort on Lagen Island in El Nido. Send a request to check current room availability and terms.', 'El Nido, Palawan, Philippines', 11.1990, 119.4070, 40000, 4.6, 0, 2, 1, 1, '〰', 'assets/stays/coron-twin-lagoon.jpg', 'Explore El Nido', array[]::text[], array[0,1,2,3,4,5,6]::smallint[], 1),
  ('dusit-davao', 'Dusit Thani Residence Davao', 'City hotels', 'A hotel in Davao City''s Lanang district. Send a request to check current room availability and terms.', 'Davao City, Philippines', 7.0880, 125.6100, 12000, 4.6, 0, 2, 1, 1, '⌂', 'assets/stays/makati-skyline.jpg', 'Explore Davao', array[]::text[], array[0,1,2,3,4,5,6]::smallint[], 1),
  ('seda-centrio-cdo', 'Seda Centrio', 'City hotels', 'A hotel in Cagayan de Oro''s Centrio district. Send a request to check current room availability and terms.', 'Cagayan de Oro, Philippines', 8.4830, 124.6480, 6500, 4.6, 0, 2, 1, 1, '⌂', 'assets/stays/makati-skyline.jpg', 'Explore Cagayan de Oro', array[]::text[], array[0,1,2,3,4,5,6]::smallint[], 1),
  ('richmonde-iloilo', 'Richmonde Hotel Iloilo', 'City hotels', 'A hotel in Iloilo City''s Iloilo Business Park. Send a request to check current room availability and terms.', 'Iloilo City, Philippines', 10.7180, 122.5530, 7000, 4.6, 0, 2, 1, 1, '⌂', 'assets/stays/makati-skyline.jpg', 'Explore Iloilo', array[]::text[], array[0,1,2,3,4,5,6]::smallint[], 1),
  ('las-casas-bataan', 'Las Casas Filipinas de Acuzar', 'Heritage hotels', 'A heritage resort in Bagac, Bataan. Send a request to check current room availability and terms.', 'Bagac, Bataan, Philippines', 14.7920, 120.5390, 12000, 4.6, 0, 2, 1, 1, '⌂', 'assets/stays/vigan-calle-crisologo.jpg', 'Explore Bataan', array[]::text[], array[0,1,2,3,4,5,6]::smallint[], 1),
  ('crimson-filinvest', 'Crimson Hotel Filinvest City', 'City hotels', 'A hotel in Filinvest City, Alabang. Send a request to check current room availability and terms.', 'Muntinlupa City, Metro Manila, Philippines', 14.4180, 121.0400, 8500, 4.6, 0, 2, 1, 1, '⌂', 'assets/stays/makati-skyline.jpg', 'Explore Alabang', array[]::text[], array[0,1,2,3,4,5,6]::smallint[], 1),
  ('belmont-manila', 'Belmont Hotel Manila', 'City hotels', 'A hotel in Newport City, near Manila''s airport. Send a request to check current room availability and terms.', 'Pasay City, Metro Manila, Philippines', 14.5190, 121.0190, 7500, 4.6, 0, 2, 1, 1, '⌂', 'assets/stays/makati-skyline.jpg', 'Explore Pasay', array[]::text[], array[0,1,2,3,4,5,6]::smallint[], 1)
on conflict (id) do nothing;

update public.offerings set name = 'Isla Cabana Resort', category = 'Beach resorts', description = 'A resort in General Luna, Siargao. Send a request to check current room availability and terms.', location = 'General Luna, Siargao, Philippines', latitude = 9.7802, longitude = 126.1583, price = 9000, rating = 4.6, reviews = 0, guests = 2, bedrooms = 1, bathrooms = 1, badge = 'Explore Siargao', amenities = array[]::text[], minimum_nights = 1 where id = 'isla-norte' and owner_id is null;
update public.offerings set name = 'The Manor at Camp John Hay', category = 'Mountain hotels', description = 'A hotel in Baguio''s Camp John Hay. Send a request to check current room availability and terms.', location = 'Baguio City, Benguet, Philippines', latitude = 16.4023, longitude = 120.6091, price = 11000, rating = 4.6, reviews = 0, guests = 2, bedrooms = 1, bathrooms = 1, badge = 'Explore Baguio', amenities = array[]::text[], minimum_nights = 1 where id = 'amihan-cabin' and owner_id is null;
update public.offerings set name = 'Henann Resort Alona Beach', category = 'Beach resorts', description = 'A resort on Panglao Island. Send a request to check current room availability and terms.', location = 'Panglao Island, Bohol, Philippines', latitude = 9.5500, longitude = 123.7720, price = 11000, rating = 4.6, reviews = 0, guests = 2, bedrooms = 1, bathrooms = 1, badge = 'Explore Bohol', amenities = array[]::text[], minimum_nights = 1 where id = 'bahay-tala' and owner_id is null;
update public.offerings set name = 'Two Seasons Coron Island Resort', category = 'Island resorts', description = 'A resort on Coron Island. Send a request to check current room availability and terms.', location = 'Coron, Palawan, Philippines', latitude = 11.9360, longitude = 120.2260, price = 26000, rating = 4.6, reviews = 0, guests = 2, bedrooms = 1, bathrooms = 1, badge = 'Explore Palawan', amenities = array[]::text[], minimum_nights = 1 where id = 'coron-cove' and owner_id is null;
update public.offerings set name = 'The Peninsula Manila', category = 'City hotels', description = 'A hotel in Makati''s central business district. Send a request to check current room availability and terms.', location = 'Makati City, Metro Manila, Philippines', latitude = 14.5547, longitude = 121.0244, price = 18000, rating = 4.6, reviews = 0, guests = 2, bedrooms = 1, bathrooms = 1, badge = 'Explore Manila', amenities = array[]::text[], minimum_nights = 1 where id = 'luntian-city-hotel' and owner_id is null;
update public.offerings set name = 'Shangri-La The Fort, Manila', category = 'City hotels', description = 'A hotel in Bonifacio Global City. Send a request to check current room availability and terms.', location = 'Bonifacio Global City, Taguig, Philippines', latitude = 14.5502, longitude = 121.0497, price = 19000, rating = 4.6, reviews = 0, guests = 2, bedrooms = 1, bathrooms = 1, badge = 'Explore Taguig', amenities = array[]::text[], minimum_nights = 1 where id = 'bgc-serviced-suite' and owner_id is null;
update public.offerings set name = 'Hotel Luna', category = 'Heritage hotels', description = 'A hotel in the historic center of Vigan. Send a request to check current room availability and terms.', location = 'Vigan City, Ilocos Sur, Philippines', latitude = 17.5747, longitude = 120.3869, price = 8500, rating = 4.6, reviews = 0, guests = 2, bedrooms = 1, bathrooms = 1, badge = 'Explore Vigan', amenities = array[]::text[], minimum_nights = 1 where id = 'vigan-heritage-inn' and owner_id is null;
update public.offerings set name = 'Taal Vista Hotel', category = 'Mountain hotels', description = 'A hotel in Tagaytay. Send a request to check current room availability and terms.', location = 'Tagaytay, Cavite, Philippines', latitude = 14.1153, longitude = 120.9621, price = 9500, rating = 4.6, reviews = 0, guests = 2, bedrooms = 1, bathrooms = 1, badge = 'Explore Tagaytay', amenities = array[]::text[], minimum_nights = 1 where id = 'tagaytay-farmstay' and owner_id is null;
