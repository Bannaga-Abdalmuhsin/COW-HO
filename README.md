# COW Handover Mobile

Expo/React Native field application for COW site handover inspections.

## Included

- Mobile-first field capture surface with site selection, immutable HO IDs, grouped equipment checklist, counts, availability, status and read-only master data
- Native camera-only evidence capture with timestamp/GPS metadata, upload state and a browser-safe development capture preview
- Snag creation with severity, assignee, action and target date; critical open snags block final approval
- Local draft persistence for weak/offline coverage with clearly labelled development seed records
- Responsive approval portal with dashboards, register filters, review workspace, role switching, returns, rejections, audit timeline, snag register, reports and CSV export
- Shared typed workflow rules, Supabase adapter, private Storage path contract and role/region RLS policies
- Conditional vehicle checks for sites with a truck head

Until Supabase credentials are configured, all records in the local workspace are explicitly labelled development seed data.

## Run locally

```bash
pnpm install
pnpm typecheck
pnpm web
```

For native field capture, use `pnpm start` and open with Expo Go on Android/iOS. Native camera capture is intentionally used; there is no gallery picker. Builder web preview uses `pnpm web`.

## Development demo workflow

1. Open the field app and choose **Start new handover**.
2. Select a development site and use **Development only · fill required camera evidence** to populate clearly labelled local captures.
3. Confirm the declaration, then **Review & submit**.
4. Open **Approval portal** and use the role menu as Region Team to start review and approve for PM.
5. Switch to Project Manager, open the same handover and choose **Final approve & lock**.
6. The approved record is locked; the audit timeline and approval history remain visible.

The portal ships with additional development records in Region review, PM review and Approved states so the review and reporting surfaces can be inspected immediately.

## Supabase information required

1. Project URL
2. Publishable/anon key (never send the service-role key)
3. Preferred Storage bucket name (default: `cow-handover`)
4. Authentication method and approved email domain(s)
5. User list with role and region
6. Google Sheet URL/ID and exact worksheet name
7. HO ID numbering preference, if different from the current pattern

Copy `.env.example` to `.env` and fill in the public values. Execute `supabase/schema.sql` in the Supabase SQL editor only after the schema is reviewed. The browser/mobile bundle only uses the publishable anon key; privileged Sheet sync and HO numbering belong on trusted server functions.

## Planned Storage path

`{COW_ID}/{HO_ID}/{ITEM_KEY}/{timestamp}.jpg`

## Approval sequence

`Field Team → Region Team → Project Manager → Approved`

Returned handovers retain their inspection history and evidence.
