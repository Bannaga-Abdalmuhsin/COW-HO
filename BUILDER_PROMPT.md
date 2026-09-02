# Builder Master Prompt — COW Handover Platform

Build a production-ready COW Handover platform consisting of:

1. A native mobile application for field teams.
2. A responsive web approval portal for region teams, project managers and administrators.
3. One Supabase backend shared by both applications.

Do not create a visual-only prototype. Implement functional navigation, database operations, authentication, authorization, Storage uploads, validations, audit history and approval actions. Where credentials are unavailable, provide a typed adapter and clearly marked environment variables; never hard-code secrets.

## Repository and structure

Use this repository and preserve the existing Expo draft. Convert it into a monorepo:

```text
apps/
  mobile/        Expo + React Native + TypeScript
  web/           Next.js + TypeScript
packages/
  ui/            shared design tokens/components where practical
  domain/        shared types, validation and workflow rules
supabase/
  migrations/
  functions/
  seed/
docs/
```

Use strict TypeScript, ESLint, formatter rules and clear README setup instructions. Add `.env.example` files only. Never commit live credentials.

## Design direction

Create a clean industrial operations interface optimized for outdoor field use. Use dark navy, teal/blue, white and light gray. Amber represents warnings and red represents critical defects. Avoid decorative gradients and excessive animation. Use large touch targets, strong contrast, short labels and clear completion indicators.

Product name: `COW Handover`.

Use English first, but structure all labels for later Arabic localization and RTL support.

## Roles and access

Implement these roles:

- `field_team`: create and edit assigned-region handovers, capture evidence, submit, and correct returned records.
- `region_team`: review handovers in assigned region, comment, approve, return, or reject.
- `project_manager`: review region-approved handovers, approve, return, or reject.
- `admin`: manage users, roles, regions, checklist definitions, required photo counts, Google Sheet synchronization and reports.
- `viewer`: read-only dashboards and approved records.

Enforce permissions using Supabase Row Level Security, not only hidden interface buttons. A user must only access authorized regions unless assigned a cross-region role.

## Site master data and Google Sheet synchronization

The Google Sheet is the source for existing site master data. Synchronize it server-side into the Supabase `sites` table. Do not call Google Sheets directly from the mobile client.

Provide:

- Manual `Sync now` action for administrators.
- Scheduled synchronization-ready Edge Function or secure server endpoint.
- Upsert by normalized `COW ID`.
- Sync log with start time, finish time, rows processed, inserted, updated, skipped and errors.
- Column mapping page so Sheet header changes can be managed.
- Preserve the original imported row in a `source_data` JSONB column.
- Never overwrite inspection results during a Sheet sync.

When a field user selects a COW ID, load all available site reference information as read-only, except fields that must be physically verified during each handover.

Reference fields include COW ID, site label, EBU/Royal, region, district, city, remote/metropolitan, location, coordinates, site status, deployment dates, old/new, vendor, V-Sat, radio availability/configuration, tower reference information, MW reference information, land/rental information, vehicle identity and all other source columns not classified below as tracked inspection items.

The following are tracked per handover and must not be treated as current condition from the Sheet:

- Power configuration
- SEC connection where field confirmation is required
- MDB
- Generator, ATS and fuel tank
- Rectifier/DC power system
- Batteries/BBU
- HVAC, AC units and PLC/controller
- FACP and firefighting equipment
- Civil condition
- Tower condition and accessories
- Earthing and grounding
- Vehicle key for sites with truck head
- Tire status and count
- Shelter key
- Internal/security lights
- Emergency light
- Tower motor
- Motor panel
- Step-down transformer for tower motor
- Telecom equipment installed on tower
- Door sensor
- Additional checklist items configured by an administrator

## Handover identity and lifecycle

Keep `COW ID` as the permanent site identifier. Create a new immutable `HO ID` for each handover record. Default format:

`HO-{COW_ID}-{YYYYMMDD}-{SEQUENCE}`

Generate this server-side to prevent duplicates. The same site can have multiple handovers over time.

Workflow states:

```text
draft
field_submitted
region_review
returned_to_field
region_approved
pm_review
returned_to_region
rejected
approved
cancelled
```

Store every state transition in an append-only audit log with actor, role, timestamp, previous state, new state and comments. Approved records are locked. Corrections after approval require a new revision or formally reopened record with a complete audit trail.

## Mobile application

Use Expo/React Native. Implement these screens:

### Authentication

- Email/password initially, ready for Microsoft SSO later.
- Display user name, employee ID, role and assigned region.
- Persist session securely.

### Home

- New Handover
- My Drafts
- Returned to Me
- Submitted
- Pending Uploads
- Recent Sites
- Offline/sync indicator

### Site selection

- Search by COW ID, site label, city, region or vehicle plate.
- Scan-ready architecture for future QR selection.
- Show site summary and warning when another active handover exists.
- Confirm before creating a new HO.

### Handover header

- HO ID
- COW ID
- Site label
- Field engineer
- Receiving person/team
- Date/time
- GPS
- Distance from registered coordinates
- General site photo
- General remarks

### Checklist layout

Group items into horizontal category tabs and show completion per category:

1. Power System
2. Cooling & HVAC
3. Fire & Safety
4. Tower System
5. Shelter & Civil
6. Vehicle, shown only when the site has a truck head

Each checklist item must support configurable fields:

- Availability: available, missing, not applicable
- Status: good, fair, defective, damaged
- Installed quantity
- Working quantity
- Brand
- Model
- Serial number
- Capacity/rating
- Structured item-specific values
- Remarks
- Required camera photo count
- Snag count

Validate that working quantity cannot exceed installed quantity. Require a snag for every missing, damaged or defective item unless an authorized user records a controlled exception.

### Camera-only evidence

Use the native camera API. Do not present an image library or file picker. Each photo must store:

- HO ID
- COW ID
- Checklist item key
- User ID
- Captured timestamp
- GPS coordinates when permission is available
- Image sequence
- Evidence type: general, item, snag or rectification
- Optional caption

Compress images responsibly before upload while retaining readable nameplates. Show upload state and allow retry. Do not claim that device metadata proves authenticity; use app capture time, authenticated user and server receipt time as audit evidence.

Storage path:

`{COW_ID}/{HO_ID}/{ITEM_KEY}/{EVIDENCE_TYPE}/{TIMESTAMP}-{UUID}.jpg`

Use signed URLs for private review. Do not expose the bucket publicly.

### Snags

Allow multiple snags under any inspection item. Include:

- Server-generated snag number
- Category and related item
- Description
- Quantity
- Severity: minor, major, critical
- Responsibility/assignee
- Required action
- Target completion date
- Camera evidence
- Status: open, assigned, under_rectification, ready_for_review, closed
- Rectification photo and closure remarks
- Closure reviewer and timestamp

Critical open snags must block final approval. Make other blocking rules admin-configurable.

### Offline behavior

- Store drafts locally.
- Queue photo and record uploads.
- Clearly identify unsynchronized changes.
- Retry safely without creating duplicate handovers, photos or snags.
- Resolve conflicts conservatively and never silently discard field data.

### Review and submission

Before submission show category completion, photo totals and snag totals. Disable submission until required fields/photos are complete and defect-to-snag rules pass. Require a field declaration/confirmation.

## Web approval portal

Use Next.js with a responsive desktop-first dashboard.

### Dashboard

Show:

- Total sites
- Active handovers
- Pending region review
- Pending PM review
- Approved handovers
- Returned/rejected handovers
- Open and critical snags
- Average approval duration
- Records and snags by region
- Aging buckets

All metrics must come from actual Supabase queries. Provide filters for date, region, city, stage, field engineer, COW ID, vendor and severity.

### Handover register

Columns:

- HO ID
- COW ID
- Site label
- Region
- Field engineer
- Created/submitted date
- Completion percentage
- Photo count
- Open/critical snag count
- Current stage
- Current responsible role/user
- Aging days

Support sorting, filtering, pagination and CSV export.

### Review workspace

Create one focused review page with:

- Read-only Google Sheet master data
- Inspection values grouped by category
- Required-versus-captured photo indicator
- Private evidence gallery grouped by item
- Snag register and severity
- Map and GPS variance
- Previous handovers and changed values
- Approval timeline/audit history
- Approve, Return and Reject actions
- Mandatory comments for Return/Reject

Region Team approval moves the record to PM review. Project Manager approval creates the final approved handover. Prevent a user from approving outside their role or region.

### Snag management

- Central snag register
- Filter by region, severity, assignee, aging and status
- Assign responsibility and target date
- Review rectification evidence
- Close/reopen with comments
- Escalation-ready notification records

### Administration

- User and role management
- Region assignments
- Checklist categories and item definitions
- Required field/photo rules
- Conditional logic, such as vehicle section only when truck head exists
- Google Sheet mapping and sync logs
- Approval settings
- Status/severity reference values

## Data model

Implement normalized migrations for at least:

- `profiles`
- `user_region_assignments`
- `sites`
- `sheet_sync_runs`
- `checklist_categories`
- `checklist_definitions`
- `handovers`
- `inspection_items`
- `evidence_photos`
- `snags`
- `snag_events`
- `approvals`
- `handover_events`
- `notifications`

Use timestamps with time zone, UUID primary keys, foreign keys, useful indexes and database constraints. Use soft deletion only where business history must be retained. Do not delete audit, approval or evidence records from normal user flows.

## Security requirements

- Enable RLS on every business table.
- Keep Storage private and add object policies matching handover permissions.
- Never place the Supabase service-role key in the mobile or browser bundle.
- Perform privileged Sheet sync and server-generated numbering on trusted server functions.
- Validate inputs on client and server.
- Sanitize search/filter inputs.
- Rate-limit sensitive endpoints.
- Log privileged actions.

## Reporting

Generate a final Handover PDF after approval containing:

- COW/site details
- HO ID and dates
- Field and approval parties
- Checklist summary
- Item status/counts
- Snag summary
- Selected evidence photos
- Approval history
- QR code or URL to the controlled digital record

Also provide Excel/CSV exports for the handover register and snag register.

## Notifications

Create an internal notification record when:

- A handover is submitted
- A record is returned/rejected
- Region approval is completed
- PM approval is required/completed
- A snag is assigned
- A target date is overdue
- Rectification is ready for review

Design adapters for email and push notifications, but do not require them for the first successful build.

## Testing and quality gates

Add tests for:

- HO ID generation
- Role and region permissions
- Allowed workflow transitions
- Required photo validation
- Quantity validation
- Defect-to-snag validation
- Critical snag approval blocking
- Google Sheet upsert behavior
- Offline retry idempotency

The build is complete only when:

- Mobile and web start successfully from documented commands.
- A seeded field user can create, save, photograph and submit a handover.
- A seeded region reviewer can return or approve it.
- A seeded project manager can provide final approval.
- Unauthorized users cannot access other regions through direct API calls.
- An approved PDF can be generated.
- Setup, migrations and deployment steps are documented.

## Placeholder handling

Until real Supabase and Google Sheet details are supplied:

- Use clearly labeled demo records only in development mode.
- Never mix demo data with production.
- Keep all integration points implemented behind environment configuration.
- Provide a setup checklist describing exactly which values are required.

Do not invent company employee identities, live site values, credentials or approval decisions.
