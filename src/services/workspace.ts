import AsyncStorage from '@react-native-async-storage/async-storage';
import { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { SAMPLE_SITES } from '../sample-sites';
import { ApprovalRecord, EvidencePhoto, HandoverDraft, InspectionItem, Site, Snag, WorkspaceState } from '../types';

const WORKSPACE_KEY = 'cow-ho:workspace:v2';

export interface WorkspaceAdapter {
  load(): Promise<WorkspaceState>;
  save(workspace: WorkspaceState): Promise<void>;
  syncSites(): Promise<Site[]>;
  uploadEvidence(photo: EvidencePhoto): Promise<{ storagePath: string }>;
}

function createSeedWorkspace(): WorkspaceState {
  return {
    sites: SAMPLE_SITES,
    handovers: [],
    notifications: [],
    currentRole: 'field_team',
    currentRegion: 'Central',
    isDemoMode: true
  };
}

export class LocalWorkspaceAdapter implements WorkspaceAdapter {
  async load(): Promise<WorkspaceState> {
    const stored = await AsyncStorage.getItem(WORKSPACE_KEY);
    if (!stored) return createSeedWorkspace();
    return JSON.parse(stored) as WorkspaceState;
  }

  async save(workspace: WorkspaceState): Promise<void> {
    await AsyncStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
  }

  async syncSites(): Promise<Site[]> {
    return SAMPLE_SITES;
  }

  async uploadEvidence(photo: EvidencePhoto): Promise<{ storagePath: string }> {
    return { storagePath: `${photo.cowId}/${photo.hoId}/${photo.itemKey}/${photo.evidenceType}/${photo.id}.jpg` };
  }
}

export class SupabaseWorkspaceAdapter implements WorkspaceAdapter {
  constructor(private readonly client: SupabaseClient) {}

  async load(): Promise<WorkspaceState> {
    const [{ data: sites, error: sitesError }, { data: handovers, error: handoversError }] = await Promise.all([
      this.client.from('sites').select('*').order('cow_id'),
      this.client.from('handovers').select('*, sites(*), inspection_items(*, evidence_photos(*), snags(*)), approvals(*)').order('created_at', { ascending: false })
    ]);
    if (sitesError) throw sitesError;
    if (handoversError) throw handoversError;
    return {
      sites: (sites || []).map(mapSiteRow),
      handovers: (handovers || []).map(mapHandoverRow),
      notifications: [],
      currentRole: 'viewer',
      currentRegion: '',
      isDemoMode: false,
      lastSyncedAt: new Date().toISOString()
    };
  }

  async save(workspace: WorkspaceState): Promise<void> {
    const { error } = await this.client.from('handovers').upsert(workspace.handovers.map((handover) => ({
      id: handover.id,
      ho_id: handover.hoId,
      site_id: handover.site.id,
      stage: handover.stage,
      submitted_at: handover.submittedAt,
      approved_at: handover.approvedAt,
      created_at: handover.createdAt,
      updated_at: handover.updatedAt
    })));
    if (error) throw error;
  }

  async syncSites(): Promise<Site[]> {
    const { data, error } = await this.client.from('sites').select('*').order('cow_id');
    if (error) throw error;
    return (data || []).map(mapSiteRow);
  }

  async uploadEvidence(photo: EvidencePhoto): Promise<{ storagePath: string }> {
    const timestamp = photo.capturedAt.replace(/[^0-9]/g, '').slice(0, 14);
    const storagePath = `${photo.cowId}/${photo.hoId}/${photo.itemKey}/${photo.evidenceType}/${timestamp}-${photo.id}.jpg`;
    const response = await fetch(photo.uri);
    const file = await response.blob();
    const { error } = await this.client.storage.from('cow-handover').upload(storagePath, file, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    return { storagePath };
  }
}

function mapSiteRow(row: Record<string, unknown>): Site {
  return {
    id: String(row.id),
    cowId: String(row.cow_id || ''),
    siteLabel: String(row.site_label || ''),
    region: String(row.region || ''),
    district: String(row.district || ''),
    city: String(row.city || ''),
    latitude: typeof row.latitude === 'number' ? row.latitude : undefined,
    longitude: typeof row.longitude === 'number' ? row.longitude : undefined,
    siteStatus: String(row.site_status || ''),
    vendor: String(row.vendor || ''),
    hasTruckHead: Boolean(row.has_truck_head),
    location: typeof row.location === 'string' ? row.location : undefined,
    sourceData: typeof row.source_data === 'object' && row.source_data ? row.source_data as Record<string, string> : undefined
  };
}

function mapHandoverRow(row: Record<string, unknown>): HandoverDraft {
  const siteRow = (row.sites || {}) as Record<string, unknown>;
  const site = mapSiteRow(siteRow);
  const handoverId = String(row.id);
  const hoId = String(row.ho_id || '');
  const itemRows = Array.isArray(row.inspection_items) ? row.inspection_items as Record<string, unknown>[] : [];
  const approvalRows = Array.isArray(row.approvals) ? row.approvals as Record<string, unknown>[] : [];
  const items = Object.fromEntries(itemRows.map((itemRow) => [String(itemRow.item_key), mapInspectionRow(itemRow, handoverId, hoId, site)]));
  return {
    id: handoverId,
    hoId,
    site,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    submittedAt: typeof row.submitted_at === 'string' ? row.submitted_at : undefined,
    approvedAt: typeof row.approved_at === 'string' ? row.approved_at : undefined,
    stage: (row.stage || 'draft') as HandoverDraft['stage'],
    fieldEngineer: String(row.field_engineer_name || 'Authenticated field user'),
    receivingTeam: String(row.receiving_team || 'Receiving team'),
    gps: typeof row.gps_latitude === 'number' && typeof row.gps_longitude === 'number' ? { latitude: row.gps_latitude, longitude: row.gps_longitude, distanceMeters: typeof row.gps_distance_meters === 'number' ? row.gps_distance_meters : undefined } : undefined,
    generalRemarks: String(row.general_remarks || ''),
    generalPhotos: [],
    declarationConfirmed: Boolean(row.declaration_confirmed),
    items,
    audit: [],
    approvals: approvalRows.map((approvalRow) => ({
      id: String(approvalRow.id),
      handoverId,
      stage: approvalRow.stage === 'pm_review' ? 'pm_review' : 'region_review',
      decision: approvalRow.decision as ApprovalRecord['decision'],
      comments: String(approvalRow.comments || ''),
      decidedBy: String(approvalRow.decided_by || ''),
      decidedAt: String(approvalRow.decided_at || '')
    })),
    locked: row.stage === 'approved',
    isDemo: false
  };
}

function mapInspectionRow(row: Record<string, unknown>, handoverId: string, hoId: string, site: Site): InspectionItem {
  const photos = Array.isArray(row.evidence_photos) ? row.evidence_photos as Record<string, unknown>[] : [];
  const snags = Array.isArray(row.snags) ? row.snags as Record<string, unknown>[] : [];
  return {
    definitionKey: String(row.item_key),
    availability: (row.availability || 'not_checked') as InspectionItem['availability'],
    status: (row.status || 'not_checked') as InspectionItem['status'],
    quantity: row.quantity === null || row.quantity === undefined ? '' : String(row.quantity),
    workingQuantity: row.working_quantity === null || row.working_quantity === undefined ? '' : String(row.working_quantity),
    brand: String(row.brand || ''),
    model: String(row.model || ''),
    serialNumber: String(row.serial_number || ''),
    capacity: String(row.capacity || ''),
    structuredValues: typeof row.structured_values === 'object' && row.structured_values ? row.structured_values as Record<string, string> : {},
    remarks: String(row.remarks || ''),
    photos: photos.map((photoRow) => mapPhotoRow(photoRow, handoverId, hoId, site, String(row.item_key))),
    snags: snags.map((snagRow) => mapSnagRow(snagRow, handoverId, hoId, site))
  };
}

function mapPhotoRow(row: Record<string, unknown>, handoverId: string, hoId: string, site: Site, itemKey: string): EvidencePhoto {
  return {
    id: String(row.id),
    uri: String(row.storage_path || ''),
    storagePath: String(row.storage_path || ''),
    capturedAt: String(row.captured_at || ''),
    capturedBy: String(row.captured_by || ''),
    cowId: site.cowId,
    hoId,
    itemKey: String(row.item_key || itemKey || 'item'),
    evidenceType: (row.evidence_type || 'item') as EvidencePhoto['evidenceType'],
    sequence: Number(row.sequence || 1),
    caption: typeof row.caption === 'string' ? row.caption : undefined,
    latitude: typeof row.latitude === 'number' ? row.latitude : undefined,
    longitude: typeof row.longitude === 'number' ? row.longitude : undefined,
    uploadState: 'uploaded'
  };
}

function mapSnagRow(row: Record<string, unknown>, handoverId: string, hoId: string, site: Site): Snag {
  return {
    id: String(row.id),
    snagNo: String(row.snag_no || ''),
    itemKey: String(row.item_key || ''),
    category: String(row.category || ''),
    description: String(row.description || ''),
    quantity: String(row.quantity || 1),
    severity: row.severity as Snag['severity'],
    assignee: String(row.assignee || ''),
    requiredAction: String(row.required_action || ''),
    targetDate: String(row.target_date || ''),
    status: row.status as Snag['status'],
    photos: [],
    rectificationPhotos: []
  };
}

export function createWorkspaceAdapter(): WorkspaceAdapter {
  return isSupabaseConfigured && supabase ? new SupabaseWorkspaceAdapter(supabase) : new LocalWorkspaceAdapter();
}

export async function saveWorkspace(workspace: WorkspaceState): Promise<void> {
  await createWorkspaceAdapter().save(workspace);
}
