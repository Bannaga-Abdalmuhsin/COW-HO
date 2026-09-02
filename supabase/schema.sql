create extension if not exists pgcrypto;

create table if not exists public.handover_plan (
  id uuid primary key default gen_random_uuid(),
  region text not null,
  area text not null,
  total_planned integer not null check (total_planned >= 0),
  on_air_planned integer not null check (on_air_planned >= 0),
  off_air_planned integer not null check (off_air_planned >= 0),
  scheduled_quantity integer not null check (scheduled_quantity >= 0),
  unallocated_quantity integer not null default 0 check (unallocated_quantity >= 0),
  source text not null default 'HO workbook aggregate',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (region, area)
);

create table if not exists public.handover_plan_daily (
  id uuid primary key default gen_random_uuid(),
  region text not null,
  area text not null,
  plan_date date not null,
  planned_quantity integer not null check (planned_quantity >= 0),
  source text not null default 'HO workbook daily schedule',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (region, area, plan_date)
);

alter table public.handover_plan enable row level security;
alter table public.handover_plan_daily enable row level security;

drop policy if exists "Plan aggregates are readable" on public.handover_plan;
create policy "Plan aggregates are readable" on public.handover_plan for select to anon, authenticated using (true);

drop policy if exists "Daily plan is readable" on public.handover_plan_daily;
create policy "Daily plan is readable" on public.handover_plan_daily for select to anon, authenticated using (true);

insert into public.handover_plan (region, area, total_planned, on_air_planned, off_air_planned, scheduled_quantity, unallocated_quantity, source)
values
  ('East', 'Dammam', 19, 10, 9, 19, 0, 'HO workbook aggregate'),
  ('East', 'Jubail', 21, 18, 3, 21, 0, 'HO workbook aggregate'),
  ('East', 'Northern Border', 13, 12, 0, 12, 1, 'HO workbook aggregate'),
  ('East', 'Al-Ahsa', 13, 12, 1, 13, 0, 'HO workbook aggregate'),
  ('Central', 'Riyadh City', 53, 52, 1, 53, 0, 'HO workbook aggregate'),
  ('Central', 'Riyadh District', 100, 54, 46, 100, 0, 'HO workbook aggregate'),
  ('Central', 'Qassim', 10, 10, 0, 10, 0, 'HO workbook aggregate'),
  ('Central', 'Hail', 5, 5, 0, 5, 0, 'HO workbook aggregate')
on conflict (region, area) do update set
  total_planned = excluded.total_planned,
  on_air_planned = excluded.on_air_planned,
  off_air_planned = excluded.off_air_planned,
  scheduled_quantity = excluded.scheduled_quantity,
  unallocated_quantity = excluded.unallocated_quantity,
  source = excluded.source,
  updated_at = now();

insert into public.handover_plan_daily (region, area, plan_date, planned_quantity, source)
values
  ('East', 'Dammam', '2026-09-15', 4, 'HO workbook daily schedule'),
  ('East', 'Dammam', '2026-09-16', 4, 'HO workbook daily schedule'),
  ('East', 'Dammam', '2026-09-19', 2, 'HO workbook daily schedule'),
  ('East', 'Dammam', '2026-09-20', 9, 'HO workbook daily schedule'),
  ('East', 'Jubail', '2026-09-21', 6, 'HO workbook daily schedule'),
  ('East', 'Jubail', '2026-09-22', 6, 'HO workbook daily schedule'),
  ('East', 'Jubail', '2026-09-26', 6, 'HO workbook daily schedule'),
  ('East', 'Jubail', '2026-09-27', 3, 'HO workbook daily schedule'),
  ('East', 'Northern Border', '2026-09-28', 6, 'HO workbook daily schedule'),
  ('East', 'Northern Border', '2026-09-29', 6, 'HO workbook daily schedule'),
  ('East', 'Al-Ahsa', '2026-09-30', 6, 'HO workbook daily schedule'),
  ('East', 'Al-Ahsa', '2026-10-01', 6, 'HO workbook daily schedule'),
  ('East', 'Al-Ahsa', '2026-10-03', 1, 'HO workbook daily schedule'),
  ('Central', 'Riyadh City', '2026-09-15', 5, 'HO workbook daily schedule'),
  ('Central', 'Riyadh City', '2026-09-16', 5, 'HO workbook daily schedule'),
  ('Central', 'Riyadh City', '2026-09-17', 5, 'HO workbook daily schedule'),
  ('Central', 'Riyadh City', '2026-09-19', 5, 'HO workbook daily schedule'),
  ('Central', 'Riyadh City', '2026-09-20', 5, 'HO workbook daily schedule'),
  ('Central', 'Riyadh City', '2026-09-21', 5, 'HO workbook daily schedule'),
  ('Central', 'Riyadh City', '2026-09-22', 5, 'HO workbook daily schedule'),
  ('Central', 'Riyadh City', '2026-09-23', 5, 'HO workbook daily schedule'),
  ('Central', 'Riyadh City', '2026-09-24', 5, 'HO workbook daily schedule'),
  ('Central', 'Riyadh City', '2026-09-26', 5, 'HO workbook daily schedule'),
  ('Central', 'Riyadh City', '2026-09-27', 2, 'HO workbook daily schedule'),
  ('Central', 'Riyadh City', '2026-09-28', 1, 'HO workbook daily schedule'),
  ('Central', 'Riyadh District', '2026-09-15', 5, 'HO workbook daily schedule'),
  ('Central', 'Riyadh District', '2026-09-16', 5, 'HO workbook daily schedule'),
  ('Central', 'Riyadh District', '2026-09-17', 5, 'HO workbook daily schedule'),
  ('Central', 'Riyadh District', '2026-09-19', 5, 'HO workbook daily schedule'),
  ('Central', 'Riyadh District', '2026-09-20', 5, 'HO workbook daily schedule'),
  ('Central', 'Riyadh District', '2026-09-21', 5, 'HO workbook daily schedule'),
  ('Central', 'Riyadh District', '2026-09-22', 5, 'HO workbook daily schedule'),
  ('Central', 'Riyadh District', '2026-09-23', 5, 'HO workbook daily schedule'),
  ('Central', 'Riyadh District', '2026-09-24', 5, 'HO workbook daily schedule'),
  ('Central', 'Riyadh District', '2026-09-26', 5, 'HO workbook daily schedule'),
  ('Central', 'Riyadh District', '2026-09-27', 4, 'HO workbook daily schedule'),
  ('Central', 'Riyadh District', '2026-09-29', 20, 'HO workbook daily schedule'),
  ('Central', 'Riyadh District', '2026-09-30', 26, 'HO workbook daily schedule'),
  ('Central', 'Qassim', '2026-09-15', 5, 'HO workbook daily schedule'),
  ('Central', 'Qassim', '2026-09-16', 5, 'HO workbook daily schedule'),
  ('Central', 'Hail', '2026-09-15', 5, 'HO workbook daily schedule')
on conflict (region, area, plan_date) do update set
  planned_quantity = excluded.planned_quantity,
  source = excluded.source,
  updated_at = now();
