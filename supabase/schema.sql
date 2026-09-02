create extension if not exists pgcrypto;

create type public.user_role as enum ('field_team', 'region_team', 'project_manager', 'admin', 'viewer');
create type public.handover_stage as enum (
  'draft', 'field_submitted', 'region_review', 'returned_to_field', 'region_approved',
  'pm_review', 'returned_to_region', 'rejected', 'approved', 'cancelled'
);
create type public.item_availability as enum ('available', 'missing', 'not_applicable', 'not_checked');
create type public.item_status as enum ('not_checked', 'good', 'fair', 'defective', 'damaged');
create type public.evidence_type as enum ('general', 'item', 'snag', 'rectification');
create type public.snag_severity as enum ('minor', 'major', 'critical');
create type public.snag_status as enum ('open', 'assigned', 'under_rectification', 'ready_for_review', 'closed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  employee_id text,
  role public.user_role not null default 'viewer',
  assigned_region text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_region_assignments (
  user_id uuid not null references public.profiles(id) on delete cascade,
  region text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, region)
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  cow_id text not null unique,
  site_label text not null default '',
  ebu_royal text,
  region text not null default '',
  district text not null default '',
  city text not null default '',
  remote_metropolitan text,
  location text,
  latitude double precision,
  longitude double precision,
  site_status text,
  deployment_date date,
  old_new text,
  vendor text,
  v_sat text,
  radio_availability text,
  tower_reference text,
  mw_reference text,
  land_rental text,
  vehicle_plate text,
  has_truck_head boolean not null default false,
  source_data jsonb not null default '{}'::jsonb,
  sheet_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sheet_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  rows_processed integer not null default 0,
  rows_inserted integer not null default 0,
  rows_updated integer not null default 0,
  rows_skipped integer not null default 0,
  error_count integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  triggered_by uuid references public.profiles(id)
);

create table public.checklist_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.checklist_definitions (
  id uuid primary key default gen_random_uuid(),
  item_key text not null unique,
  title text not null,
  category_id uuid not null references public.checklist_categories(id),
  required_photo_count integer not null default 0 check (required_photo_count >= 0),
  conditional_rule jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.handovers (
  id uuid primary key default gen_random_uuid(),
  ho_id text not null unique,
  site_id uuid not null references public.sites(id),
  created_by uuid not null references public.profiles(id),
  field_engineer_id uuid not null references public.profiles(id),
  field_engineer_name text not null,
  receiving_team text not null default '',
  stage public.handover_stage not null default 'draft',
  general_remarks text not null default '',
  declaration_confirmed boolean not null default false,
  gps_latitude double precision,
  gps_longitude double precision,
  gps_distance_meters double precision,
  submitted_at timestamptz,
  approved_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (gps_distance_meters is null or gps_distance_meters >= 0)
);

create table public.inspection_items (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null references public.handovers(id) on delete cascade,
  item_key text not null,
  availability public.item_availability not null default 'not_checked',
  status public.item_status not null default 'not_checked',
  quantity integer check (quantity is null or quantity >= 0),
  working_quantity integer check (working_quantity is null or working_quantity >= 0),
  brand text not null default '',
  model text not null default '',
  serial_number text not null default '',
  capacity text not null default '',
  structured_values jsonb not null default '{}'::jsonb,
  remarks text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (handover_id, item_key),
  check (working_quantity is null or quantity is null or working_quantity <= quantity)
);

create table public.evidence_photos (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null references public.handovers(id) on delete cascade,
  inspection_item_id uuid references public.inspection_items(id) on delete cascade,
  item_key text not null,
  storage_path text not null,
  evidence_type public.evidence_type not null,
  sequence integer not null default 1 check (sequence > 0),
  captured_at timestamptz not null,
  server_received_at timestamptz not null default now(),
  captured_by uuid not null references public.profiles(id),
  latitude double precision,
  longitude double precision,
  caption text,
  unique (handover_id, storage_path)
);

create table public.snags (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null references public.handovers(id) on delete cascade,
  inspection_item_id uuid not null references public.inspection_items(id) on delete cascade,
  snag_no text not null,
  category text not null,
  description text not null,
  quantity integer not null default 1 check (quantity > 0),
  severity public.snag_severity not null,
  assignee text not null default '',
  required_action text not null default '',
  target_date date,
  status public.snag_status not null default 'open',
  closure_remarks text,
  closure_reviewer uuid references public.profiles(id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (handover_id, snag_no)
);

create table public.snag_events (
  id uuid primary key default gen_random_uuid(),
  snag_id uuid not null references public.snags(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  previous_status public.snag_status,
  new_status public.snag_status not null,
  comments text,
  created_at timestamptz not null default now()
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null references public.handovers(id) on delete cascade,
  stage public.handover_stage not null check (stage in ('region_review', 'pm_review')),
  decision text not null check (decision in ('approved', 'returned', 'rejected')),
  comments text not null default '',
  decided_by uuid not null references public.profiles(id),
  decided_at timestamptz not null default now(),
  check (decision = 'approved' or length(trim(comments)) > 0)
);

create table public.handover_events (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null references public.handovers(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  actor_role public.user_role not null,
  previous_stage public.handover_stage,
  new_stage public.handover_stage,
  action text not null,
  comments text,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  audience_user_id uuid references public.profiles(id) on delete cascade,
  audience_role public.user_role,
  handover_id uuid references public.handovers(id) on delete cascade,
  snag_id uuid references public.snags(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (audience_user_id is not null or audience_role is not null)
);

create index handovers_stage_idx on public.handovers(stage);
create index handovers_site_idx on public.handovers(site_id);
create index handovers_created_by_idx on public.handovers(created_by);
create index handovers_updated_at_idx on public.handovers(updated_at desc);
create index sites_region_idx on public.sites(region);
create index snags_status_severity_idx on public.snags(status, severity);
create index evidence_handover_idx on public.evidence_photos(handover_id);
create index handover_events_handover_idx on public.handover_events(handover_id, created_at desc);

create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select p from public.profiles p where p.id = auth.uid() and p.active = true limit 1;
$$;

create or replace function public.has_role(required_roles public.user_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active = true and p.role = any(required_roles)
  );
$$;

create or replace function public.can_access_region(target_region text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(array['admin'::public.user_role, 'project_manager'::public.user_role, 'viewer'::public.user_role])
    or exists (
      select 1 from public.profiles p
      left join public.user_region_assignments a on a.user_id = p.id
      where p.id = auth.uid() and p.active = true and (p.assigned_region = target_region or a.region = target_region)
    );
$$;

create or replace function public.generate_ho_id(p_cow_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  date_part text := to_char(current_date, 'YYYYMMDD');
  prefix text := 'HO-' || upper(regexp_replace(trim(p_cow_id), '[^A-Za-z0-9-]', '', 'g')) || '-' || date_part || '-';
  next_sequence integer;
begin
  if not public.has_role(array['field_team'::public.user_role, 'admin'::public.user_role]) then
    raise exception 'not authorized';
  end if;
  perform pg_advisory_xact_lock(hashtext(prefix));
  select count(*) + 1 into next_sequence from public.handovers where ho_id like prefix || '%';
  return prefix || lpad(next_sequence::text, 4, '0');
end;
$$;

create or replace function public.transition_handover(p_handover_id uuid, p_new_stage public.handover_stage, p_comments text default '')
returns public.handover_stage
language plpgsql
security definer
set search_path = public
as $$
declare
  current_handover public.handovers;
  actor_profile public.profiles;
  decision text;
  action_label text;
begin
  select * into actor_profile from public.profiles where id = auth.uid() and active = true;
  if actor_profile.id is null then raise exception 'not authorized'; end if;
  select * into current_handover from public.handovers where id = p_handover_id for update;
  if current_handover.id is null then raise exception 'handover not found'; end if;
  if current_handover.stage in ('approved', 'rejected', 'cancelled') then raise exception 'handover is locked'; end if;
  if p_new_stage not in ('field_submitted', 'region_review', 'returned_to_field', 'pm_review', 'returned_to_region', 'approved', 'rejected') then raise exception 'invalid transition'; end if;
  if p_new_stage = 'field_submitted' and not (actor_profile.role = 'field_team' and current_handover.created_by = auth.uid() and current_handover.stage in ('draft', 'returned_to_field')) then raise exception 'field transition not authorized'; end if;
  if actor_profile.role = 'region_team' and not ((current_handover.stage = 'field_submitted' and p_new_stage in ('region_review', 'returned_to_field', 'rejected')) or (current_handover.stage in ('region_review', 'returned_to_region') and p_new_stage in ('pm_review', 'returned_to_field', 'rejected'))) then raise exception 'region transition not authorized'; end if;
  if actor_profile.role = 'project_manager' and not (current_handover.stage = 'pm_review' and p_new_stage in ('approved', 'returned_to_region', 'rejected')) then raise exception 'project manager transition not authorized'; end if;
  if actor_profile.role not in ('field_team', 'region_team', 'project_manager', 'admin') then raise exception 'role cannot transition handovers'; end if;
  if p_new_stage in ('returned_to_field', 'returned_to_region', 'rejected') and length(trim(coalesce(p_comments, ''))) = 0 then raise exception 'comments are required'; end if;
  if p_new_stage = 'approved' and exists (
    select 1 from public.snags g where g.handover_id = current_handover.id and g.severity = 'critical' and g.status <> 'closed'
  ) then raise exception 'open critical snags block final approval'; end if;

  decision := case when p_new_stage in ('returned_to_field', 'returned_to_region') then 'returned' when p_new_stage = 'rejected' then 'rejected' else 'approved' end;
  action_label := case when p_new_stage = 'approved' then 'Project Manager final approval' when decision = 'returned' then 'Handover returned for correction' when decision = 'rejected' then 'Handover rejected' when p_new_stage = 'pm_review' then 'Region Team approved for PM review' else 'Review started' end;
  update public.handovers set stage = p_new_stage, submitted_at = case when p_new_stage = 'field_submitted' then now() else submitted_at end, approved_at = case when p_new_stage = 'approved' then now() else approved_at end, locked_at = case when p_new_stage = 'approved' then now() else locked_at end, updated_at = now() where id = current_handover.id;
  insert into public.approvals (handover_id, stage, decision, comments, decided_by) select current_handover.id, case when current_handover.stage = 'pm_review' then 'pm_review'::public.handover_stage else 'region_review'::public.handover_stage end, decision, coalesce(p_comments, ''), auth.uid() where p_new_stage in ('pm_review', 'returned_to_field', 'returned_to_region', 'rejected', 'approved');
  insert into public.handover_events (handover_id, actor_id, actor_role, previous_stage, new_stage, action, comments) values (current_handover.id, auth.uid(), actor_profile.role, current_handover.stage, p_new_stage, action_label, nullif(trim(coalesce(p_comments, '')), ''));
  return p_new_stage;
end;
$$;

grant execute on function public.generate_ho_id(text) to authenticated;
grant execute on function public.transition_handover(uuid, public.handover_stage, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.user_region_assignments enable row level security;
alter table public.sites enable row level security;
alter table public.sheet_sync_runs enable row level security;
alter table public.checklist_categories enable row level security;
alter table public.checklist_definitions enable row level security;
alter table public.handovers enable row level security;
alter table public.inspection_items enable row level security;
alter table public.evidence_photos enable row level security;
alter table public.snags enable row level security;
alter table public.snag_events enable row level security;
alter table public.approvals enable row level security;
alter table public.handover_events enable row level security;
alter table public.notifications enable row level security;

create policy profiles_self_or_admin on public.profiles for select using (id = auth.uid() or public.has_role(array['admin'::public.user_role]));
create policy profiles_admin_update on public.profiles for update using (public.has_role(array['admin'::public.user_role]));
create policy assignments_self_or_admin on public.user_region_assignments for select using (user_id = auth.uid() or public.has_role(array['admin'::public.user_role]));
create policy assignments_admin_write on public.user_region_assignments for all using (public.has_role(array['admin'::public.user_role])) with check (public.has_role(array['admin'::public.user_role]));

create policy sites_authorized_read on public.sites for select to authenticated using (public.can_access_region(region));
create policy sites_admin_write on public.sites for all using (public.has_role(array['admin'::public.user_role])) with check (public.has_role(array['admin'::public.user_role]));
create policy sync_admin_read on public.sheet_sync_runs for select using (public.has_role(array['admin'::public.user_role]));
create policy sync_admin_write on public.sheet_sync_runs for all using (public.has_role(array['admin'::public.user_role])) with check (public.has_role(array['admin'::public.user_role]));
create policy checklist_authenticated_read on public.checklist_categories for select to authenticated using (true);
create policy checklist_authenticated_read_definitions on public.checklist_definitions for select to authenticated using (true);
create policy checklist_admin_write on public.checklist_categories for all using (public.has_role(array['admin'::public.user_role])) with check (public.has_role(array['admin'::public.user_role]));
create policy checklist_admin_write_definitions on public.checklist_definitions for all using (public.has_role(array['admin'::public.user_role])) with check (public.has_role(array['admin'::public.user_role]));

create policy handovers_region_read on public.handovers for select to authenticated using (
  public.can_access_region((select s.region from public.sites s where s.id = site_id))
);
create policy handovers_field_insert on public.handovers for insert to authenticated with check (
  created_by = auth.uid() and field_engineer_id = auth.uid() and public.has_role(array['field_team'::public.user_role, 'admin'::public.user_role])
);
create policy handovers_field_update on public.handovers for update to authenticated using (
  created_by = auth.uid() and stage in ('draft', 'returned_to_field')
) with check (created_by = auth.uid() and stage in ('draft', 'field_submitted', 'returned_to_field'));
drop policy if exists handovers_reviewer_update on public.handovers;

create policy inspection_read_authorized on public.inspection_items for select to authenticated using (
  exists (select 1 from public.handovers h join public.sites s on s.id = h.site_id where h.id = handover_id and public.can_access_region(s.region))
);
create policy inspection_field_write on public.inspection_items for all to authenticated using (
  exists (select 1 from public.handovers h where h.id = handover_id and h.created_by = auth.uid() and h.stage in ('draft', 'returned_to_field'))
) with check (
  exists (select 1 from public.handovers h where h.id = handover_id and h.created_by = auth.uid() and h.stage in ('draft', 'returned_to_field'))
);
create policy evidence_read_authorized on public.evidence_photos for select to authenticated using (
  exists (select 1 from public.handovers h join public.sites s on s.id = h.site_id where h.id = handover_id and public.can_access_region(s.region))
);
create policy evidence_field_write on public.evidence_photos for insert to authenticated with check (
  captured_by = auth.uid() and exists (select 1 from public.handovers h where h.id = handover_id and h.created_by = auth.uid() and h.stage in ('draft', 'returned_to_field'))
);
create policy snags_read_authorized on public.snags for select to authenticated using (
  exists (select 1 from public.handovers h join public.sites s on s.id = h.site_id where h.id = handover_id and public.can_access_region(s.region))
);
create policy snags_field_write on public.snags for all to authenticated using (
  exists (select 1 from public.handovers h where h.id = handover_id and h.created_by = auth.uid() and h.stage in ('draft', 'returned_to_field'))
) with check (
  exists (select 1 from public.handovers h where h.id = handover_id and h.created_by = auth.uid() and h.stage in ('draft', 'returned_to_field'))
);
create policy snag_events_read_authorized on public.snag_events for select to authenticated using (
  exists (select 1 from public.snags g join public.handovers h on h.id = g.handover_id join public.sites s on s.id = h.site_id where g.id = snag_id and public.can_access_region(s.region))
);
create policy snag_events_insert_authorized on public.snag_events for insert to authenticated with check (actor_id = auth.uid());
create policy approvals_read_authorized on public.approvals for select to authenticated using (
  exists (select 1 from public.handovers h join public.sites s on s.id = h.site_id where h.id = handover_id and public.can_access_region(s.region))
);
create policy approvals_reviewer_insert on public.approvals for insert to authenticated with check (
  decided_by = auth.uid() and public.has_role(array['region_team'::public.user_role, 'project_manager'::public.user_role, 'admin'::public.user_role])
);
create policy events_read_authorized on public.handover_events for select to authenticated using (
  exists (select 1 from public.handovers h join public.sites s on s.id = h.site_id where h.id = handover_id and public.can_access_region(s.region))
);
create policy events_insert_authenticated on public.handover_events for insert to authenticated with check (actor_id = auth.uid());
create policy notifications_recipient_read on public.notifications for select to authenticated using (audience_user_id = auth.uid() or public.has_role(array['admin'::public.user_role]));
create policy notifications_recipient_update on public.notifications for update to authenticated using (audience_user_id = auth.uid());

insert into storage.buckets (id, name, public) values ('cow-handover', 'cow-handover', false) on conflict (id) do nothing;
create policy evidence_objects_read on storage.objects for select to authenticated using (
  bucket_id = 'cow-handover' and exists (
    select 1 from public.handovers h join public.sites s on s.id = h.site_id
    where h.ho_id = split_part(name, '/', 2) and public.can_access_region(s.region)
  )
);
create policy evidence_objects_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'cow-handover' and exists (
    select 1 from public.handovers h
    where h.ho_id = split_part(name, '/', 2) and (h.created_by = auth.uid() or public.has_role(array['admin'::public.user_role])) and h.stage in ('draft', 'returned_to_field')
  )
);

comment on table public.sites is 'Google Sheet master data. source_data preserves the original imported row.';
comment on table public.handover_events is 'Append-only lifecycle history. Normal users never delete events.';
comment on table public.evidence_photos is 'Private Storage objects referenced by signed review URLs.';
