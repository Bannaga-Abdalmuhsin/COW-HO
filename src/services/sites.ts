import { supabase } from '../lib/supabase';
import { SAMPLE_SITES } from '../sample-sites';
import { Site } from '../types';

export async function searchSites(query: string): Promise<Site[]> {
  if (!supabase) {
    const needle = query.trim().toLowerCase();
    return SAMPLE_SITES.filter((site) =>
      [site.cowId, site.siteLabel, site.city, site.region].some((value) =>
        value.toLowerCase().includes(needle)
      )
    );
  }

  let request = supabase.from('sites').select('*').order('cow_id').limit(30);
  if (query.trim()) {
    const safe = query.trim().replace(/[%_,()]/g, '');
    request = request.or(`cow_id.ilike.%${safe}%,site_label.ilike.%${safe}%,city.ilike.%${safe}%`);
  }
  const { data, error } = await request;
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    cowId: row.cow_id,
    siteLabel: row.site_label || '',
    region: row.region || '',
    district: row.district || '',
    city: row.city || '',
    latitude: row.latitude,
    longitude: row.longitude,
    siteStatus: row.site_status || '',
    vendor: row.vendor || '',
    hasTruckHead: Boolean(row.has_truck_head)
  }));
}
