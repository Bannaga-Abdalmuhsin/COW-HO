import { SupabaseClient } from '@supabase/supabase-js';
import { HandoverDraft, HandoverPlan, HandoverPlanDaily, PlanDataset, PlanSummary } from '../types';

export const WORKBOOK_PLAN_ROWS: HandoverPlan[] = [
  { region: 'East', area: 'Dammam', totalPlanned: 19, onAirPlanned: 10, offAirPlanned: 9, scheduledQuantity: 19, unallocatedQuantity: 0, source: 'HO workbook aggregate' },
  { region: 'East', area: 'Jubail', totalPlanned: 21, onAirPlanned: 18, offAirPlanned: 3, scheduledQuantity: 21, unallocatedQuantity: 0, source: 'HO workbook aggregate' },
  { region: 'East', area: 'Northern Border', totalPlanned: 13, onAirPlanned: 12, offAirPlanned: 0, scheduledQuantity: 12, unallocatedQuantity: 1, source: 'HO workbook aggregate' },
  { region: 'East', area: 'Al-Ahsa', totalPlanned: 13, onAirPlanned: 12, offAirPlanned: 1, scheduledQuantity: 13, unallocatedQuantity: 0, source: 'HO workbook aggregate' },
  { region: 'Central', area: 'Riyadh City', totalPlanned: 53, onAirPlanned: 52, offAirPlanned: 1, scheduledQuantity: 53, unallocatedQuantity: 0, source: 'HO workbook aggregate' },
  { region: 'Central', area: 'Riyadh District', totalPlanned: 100, onAirPlanned: 54, offAirPlanned: 46, scheduledQuantity: 100, unallocatedQuantity: 0, source: 'HO workbook aggregate' },
  { region: 'Central', area: 'Qassim', totalPlanned: 10, onAirPlanned: 10, offAirPlanned: 0, scheduledQuantity: 10, unallocatedQuantity: 0, source: 'HO workbook aggregate' },
  { region: 'Central', area: 'Hail', totalPlanned: 5, onAirPlanned: 5, offAirPlanned: 0, scheduledQuantity: 5, unallocatedQuantity: 0, source: 'HO workbook aggregate' }
];

export const WORKBOOK_PLAN_DAILY: HandoverPlanDaily[] = [
  { region: 'East', area: 'Dammam', planDate: '2026-09-15', plannedQuantity: 4 },
  { region: 'East', area: 'Dammam', planDate: '2026-09-16', plannedQuantity: 4 },
  { region: 'East', area: 'Dammam', planDate: '2026-09-19', plannedQuantity: 2 },
  { region: 'East', area: 'Dammam', planDate: '2026-09-20', plannedQuantity: 9 },
  { region: 'East', area: 'Jubail', planDate: '2026-09-21', plannedQuantity: 6 },
  { region: 'East', area: 'Jubail', planDate: '2026-09-22', plannedQuantity: 6 },
  { region: 'East', area: 'Jubail', planDate: '2026-09-26', plannedQuantity: 6 },
  { region: 'East', area: 'Jubail', planDate: '2026-09-27', plannedQuantity: 3 },
  { region: 'East', area: 'Northern Border', planDate: '2026-09-28', plannedQuantity: 6 },
  { region: 'East', area: 'Northern Border', planDate: '2026-09-29', plannedQuantity: 6 },
  { region: 'East', area: 'Al-Ahsa', planDate: '2026-09-30', plannedQuantity: 6 },
  { region: 'East', area: 'Al-Ahsa', planDate: '2026-10-01', plannedQuantity: 6 },
  { region: 'East', area: 'Al-Ahsa', planDate: '2026-10-03', plannedQuantity: 1 },
  { region: 'Central', area: 'Riyadh City', planDate: '2026-09-15', plannedQuantity: 5 },
  { region: 'Central', area: 'Riyadh City', planDate: '2026-09-16', plannedQuantity: 5 },
  { region: 'Central', area: 'Riyadh City', planDate: '2026-09-17', plannedQuantity: 5 },
  { region: 'Central', area: 'Riyadh City', planDate: '2026-09-19', plannedQuantity: 5 },
  { region: 'Central', area: 'Riyadh City', planDate: '2026-09-20', plannedQuantity: 5 },
  { region: 'Central', area: 'Riyadh City', planDate: '2026-09-21', plannedQuantity: 5 },
  { region: 'Central', area: 'Riyadh City', planDate: '2026-09-22', plannedQuantity: 5 },
  { region: 'Central', area: 'Riyadh City', planDate: '2026-09-23', plannedQuantity: 5 },
  { region: 'Central', area: 'Riyadh City', planDate: '2026-09-24', plannedQuantity: 5 },
  { region: 'Central', area: 'Riyadh City', planDate: '2026-09-26', plannedQuantity: 5 },
  { region: 'Central', area: 'Riyadh City', planDate: '2026-09-27', plannedQuantity: 2 },
  { region: 'Central', area: 'Riyadh City', planDate: '2026-09-28', plannedQuantity: 1 },
  { region: 'Central', area: 'Riyadh District', planDate: '2026-09-15', plannedQuantity: 5 },
  { region: 'Central', area: 'Riyadh District', planDate: '2026-09-16', plannedQuantity: 5 },
  { region: 'Central', area: 'Riyadh District', planDate: '2026-09-17', plannedQuantity: 5 },
  { region: 'Central', area: 'Riyadh District', planDate: '2026-09-19', plannedQuantity: 5 },
  { region: 'Central', area: 'Riyadh District', planDate: '2026-09-20', plannedQuantity: 5 },
  { region: 'Central', area: 'Riyadh District', planDate: '2026-09-21', plannedQuantity: 5 },
  { region: 'Central', area: 'Riyadh District', planDate: '2026-09-22', plannedQuantity: 5 },
  { region: 'Central', area: 'Riyadh District', planDate: '2026-09-23', plannedQuantity: 5 },
  { region: 'Central', area: 'Riyadh District', planDate: '2026-09-24', plannedQuantity: 5 },
  { region: 'Central', area: 'Riyadh District', planDate: '2026-09-26', plannedQuantity: 5 },
  { region: 'Central', area: 'Riyadh District', planDate: '2026-09-27', plannedQuantity: 4 },
  { region: 'Central', area: 'Riyadh District', planDate: '2026-09-29', plannedQuantity: 20 },
  { region: 'Central', area: 'Riyadh District', planDate: '2026-09-30', plannedQuantity: 26 },
  { region: 'Central', area: 'Qassim', planDate: '2026-09-15', plannedQuantity: 5 },
  { region: 'Central', area: 'Qassim', planDate: '2026-09-16', plannedQuantity: 5 },
  { region: 'Central', area: 'Hail', planDate: '2026-09-15', plannedQuantity: 5 }
];

export function createWorkbookPlanDataset(): PlanDataset {
  return {
    rows: WORKBOOK_PLAN_ROWS.map((row) => ({ ...row })),
    daily: WORKBOOK_PLAN_DAILY.map((row) => ({ ...row })),
    source: 'workbook',
    notice: 'Workbook aggregate plan shown locally. It contains no individual COW IDs and creates no site records.'
  };
}

export function createMigrationRequiredPlanDataset(): PlanDataset {
  return {
    ...createWorkbookPlanDataset(),
    source: 'migration_required',
    notice: 'Plan tables are not available in Supabase. Run supabase/schema.sql in the Supabase SQL Editor; these workbook aggregates are preview-only until then.'
  };
}

export async function loadPlanDataset(client: SupabaseClient): Promise<PlanDataset> {
  const [planResponse, dailyResponse] = await Promise.all([
    client.from('handover_plan').select('*').order('region').order('area'),
    client.from('handover_plan_daily').select('*').order('plan_date').order('region').order('area')
  ]);
  const responses = [planResponse, dailyResponse];
  if (responses.some((response) => response.error?.code === 'PGRST205')) return createMigrationRequiredPlanDataset();
  const error = responses.find((response) => response.error)?.error;
  if (error) throw error;
  return {
    rows: ((planResponse.data || []) as Record<string, unknown>[]).map(mapPlanRow),
    daily: ((dailyResponse.data || []) as Record<string, unknown>[]).map(mapDailyRow),
    source: 'supabase',
    notice: 'Plan and daily schedule loaded from Supabase. Actuals count saved handover records matched to site master data.'
  };
}

export function summarizePlan(plan: PlanDataset, handovers: HandoverDraft[], region?: string): PlanSummary[] {
  return plan.rows
    .filter((row) => !region || row.region === region)
    .map((row) => {
      const actualQuantity = handovers.filter((handover) => isActualHandover(handover) && handover.site.region === row.region && matchesPlanArea(row.area, handover.site.city, handover.site.district, handover.site.siteLabel)).length;
      return { ...row, actualQuantity, variance: actualQuantity - row.totalPlanned };
    });
}

function mapPlanRow(row: Record<string, unknown>): HandoverPlan {
  return {
    id: typeof row.id === 'string' ? row.id : undefined,
    region: String(row.region || ''),
    area: String(row.area || ''),
    totalPlanned: Number(row.total_planned || 0),
    onAirPlanned: Number(row.on_air_planned || 0),
    offAirPlanned: Number(row.off_air_planned || 0),
    scheduledQuantity: Number(row.scheduled_quantity || 0),
    unallocatedQuantity: Number(row.unallocated_quantity || 0),
    source: String(row.source || 'Supabase')
  };
}

function mapDailyRow(row: Record<string, unknown>): HandoverPlanDaily {
  return {
    id: typeof row.id === 'string' ? row.id : undefined,
    region: String(row.region || ''),
    area: String(row.area || ''),
    planDate: String(row.plan_date || ''),
    plannedQuantity: Number(row.planned_quantity || 0)
  };
}

export function isActualHandover(handover: HandoverDraft): boolean {
  return !['draft', 'cancelled'].includes(handover.stage);
}

export function matchesPlanArea(area: string, city: string, district: string, siteLabel: string): boolean {
  const target = normalize(area);
  const values = [city, district, siteLabel].map(normalize).filter(Boolean);
  if (values.includes(target)) return true;
  if (target.endsWith(' city') && normalize(city) === target.slice(0, -5).trim()) return true;
  if (target.endsWith(' district') && normalize(district) === target.slice(0, -9).trim()) return true;
  return false;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
