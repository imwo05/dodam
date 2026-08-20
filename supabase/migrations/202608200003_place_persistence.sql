-- Forward-only Place domain persistence.
-- The Node backend uses text ids so existing auth ids (for example usr_001)
-- can be used as creator_id without a silent UUID migration.

create table if not exists places (
  id text primary key,
  source_id text unique,
  creator_id text,
  name text not null,
  description text not null default '',
  tip text,
  address text not null default '',
  district text,
  geometry_type text not null default 'POINT'
    check (geometry_type in ('POINT', 'SEGMENT')),
  latitude double precision,
  longitude double precision,
  start_latitude double precision,
  start_longitude double precision,
  end_latitude double precision,
  end_longitude double precision,
  encoded_polyline text,
  distance_meters double precision,
  duration_minutes integer,
  activity_type text,
  experience_categories text[] not null default '{}',
  source_wellness_type text,
  atmosphere_tags text[] not null default '{}',
  intensity text check (intensity is null or intensity in ('LOW', 'MEDIUM', 'HIGH')),
  indoor_outdoor text,
  recommended_time_bands text[] not null default '{}',
  solo_friendly boolean,
  price_level text,
  image_urls text[] not null default '{}',
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'HIDDEN', 'DELETED')),
  source text not null default 'USER'
    check (source in ('SEED', 'USER')),
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (geometry_type = 'POINT'
      and latitude is not null and longitude is not null
      and latitude between -90 and 90 and longitude between -180 and 180)
    or
    (geometry_type = 'SEGMENT'
      and start_latitude is not null and start_longitude is not null
      and end_latitude is not null and end_longitude is not null
      and start_latitude between -90 and 90 and start_longitude between -180 and 180
      and end_latitude between -90 and 90 and end_longitude between -180 and 180)
  ),
  check (distance_meters is null or distance_meters >= 0),
  check (duration_minutes is null or duration_minutes between 1 and 1440)
);

create index if not exists places_active_idx on places (status, updated_at desc);
create index if not exists places_creator_idx on places (creator_id, status, created_at desc);
create index if not exists places_geometry_type_idx on places (geometry_type, status);
create index if not exists places_district_idx on places (district, status);
create index if not exists places_activity_type_idx on places (activity_type, status);
create index if not exists places_source_idx on places (source, source_id);

create table if not exists saved_places (
  user_id text not null,
  place_id text not null references places(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

create index if not exists saved_places_place_idx on saved_places (place_id, created_at desc);

alter table places enable row level security;
alter table saved_places enable row level security;

-- The backend uses the Supabase service-role key and owns authorization at the
-- HTTP layer. No direct anon/authenticated policies are added here.

create or replace function set_places_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists places_updated_at on places;
create trigger places_updated_at
before update on places
for each row execute function set_places_updated_at();
