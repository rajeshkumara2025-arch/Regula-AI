create table if not exists public.buildings (
  id text primary key,
  name text not null,
  address text default '',
  building_type text default 'Office',
  floors integer default 1,
  building_age integer default 0,
  occupancy integer default 0,
  exit_count integer default 1,
  staircase_count integer default 1,
  fire_extinguisher_count integer default 0,
  alarm_coverage numeric default 0,
  emergency_light_coverage numeric default 0,
  signage_coverage numeric default 0,
  exit_capacity integer default 0,
  occupant_groups jsonb default '{"familiar":40,"unfamiliar":20,"delayed":20,"group_following":20}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.assessments (
  id text primary key,
  building_id text references public.buildings(id) on delete cascade,
  building_name text,
  risk_score numeric,
  risk_level text,
  compliance_score numeric,
  result jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
