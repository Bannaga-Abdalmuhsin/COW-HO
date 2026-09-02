# COW Handover Mobile

Expo/React Native field application for COW site handover inspections.

## Included in this draft

- Search/select a COW site and load read-only master data
- Automatic HO ID generation
- Equipment checklist grouped by operational category
- Availability/status, installed count, working count and remarks
- Camera-only evidence capture with timestamp and GPS
- Snag creation and severity classification
- Local draft saving for weak/offline coverage
- Submission validation and completion progress
- Supabase-ready database schema and Storage path convention
- Conditional vehicle checks for sites with a truck head

The two records shown before Supabase is connected are explicitly marked demo data.

## Run locally

```bash
npm install
cp .env.example .env
npm start
```

Open with Expo Go on Android/iOS. Native camera capture is intentionally used; there is no gallery picker.

## Supabase information required

1. Project URL
2. Publishable/anon key (never send the service-role key)
3. Preferred Storage bucket name (default: `cow-handover`)
4. Authentication method and approved email domain(s)
5. User list with role and region
6. Google Sheet URL/ID and exact worksheet name
7. HO ID numbering preference, if different from the current pattern

Copy `.env.example` to `.env` and fill in the public values. Execute `supabase/schema.sql` in the Supabase SQL editor only after the schema is reviewed.

## Planned Storage path

`{COW_ID}/{HO_ID}/{ITEM_KEY}/{timestamp}.jpg`

## Approval sequence

`Field Team → Region Team → Project Manager → Approved`

Returned handovers retain their inspection history and evidence.
