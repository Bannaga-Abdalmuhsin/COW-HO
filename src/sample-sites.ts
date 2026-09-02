import { Site } from './types';

// Removed automatically once Supabase is configured.
export const SAMPLE_SITES: Site[] = [
  {
    id: 'demo-cwn034',
    cowId: 'CWN034',
    siteLabel: 'CWN034 Demo Site',
    region: 'Central',
    district: 'Riyadh',
    city: 'Riyadh',
    latitude: 24.7136,
    longitude: 46.6753,
    siteStatus: 'Active',
    vendor: 'Demo Vendor',
    hasTruckHead: true
  },
  {
    id: 'demo-cwh090',
    cowId: 'CWH090',
    siteLabel: 'CWH090 Demo Site',
    region: 'West',
    district: 'Makkah',
    city: 'Makkah',
    siteStatus: 'Standby',
    vendor: 'Demo Vendor',
    hasTruckHead: false
  }
];
