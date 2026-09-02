create extension if not exists pgcrypto;

create type public.handover_stage as enum
  ('draft', 'field_submitted', 'region_review', 'pm_review', 'approved', 'returned');

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  cow_id text not null unique,
  site_label text,
  region text,
  district text,
  city text,
  latitude double precision,
  longitude double precision,
  site_status text,
  vendor text,
  has_truck_head boolean not null default false,
  source_data jsonb not null default '{}'::jsonb,
  sheet_updated_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.handovers (
  id uuid primary key default gen_random_uuid(),
  ho_id text not null unique,
  site_id uuid not null references public.sites(id),
  created_by uuid not null references auth.users(id),
  stage public.handover_stage not null default 'draft',
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inspection_items (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null references public.handovers(id) on delete cascade,
  item_key text not null,
  status text not null default 'not_checked',
  quantity integer,
  working_quantity integer,
  remarks text,
  unique (handover_id, item_key)
);

create table public.evidence_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_item_id uuid not null references public.inspection_items(id) on delete cascade,
  storage_path text not null,
  captured_at timestamptz not null,
  latitude double precision,
  longitude double precision,
  captured_by uuid not null references auth.users(id)
);

create table public.snags (
  id uuid primary key default gen_random_uuid(),
  inspection_item_id uuid not null references public.inspection_items(id) on delete cascade,
  snag_no text not null unique,
  description text not null,
  severity text not null check (severity in ('minor', 'major', 'critical')),
  status text not null default 'open' check (status in ('open', 'under_rectification', 'closed')),
  created_at timestamptz not null default now()
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null references public.handovers(id) on delete cascade,
  stage text not null,
  decision text not null check (decision in ('approved', 'returned', 'rejected')),
  comments text,
  decided_by uuid not null references auth.users(id),
  decided_at timestamptz not null default now()
);

alter table public.sites enable row level security;
alter table public.handovers enable row level security;
alter table public.inspection_items enable row level security;
alter table public.evidence_photos enable row level security;
alter table public.snags enable row level security;
alter table public.approvals enable row level security;

-- Final role-based RLS policies will be added after user roles and regions are confirmed.
