import { storageBucket } from '../lib/supabase';
import { EvidencePhoto, Site } from '../types';

export type SheetSyncSummary = {
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'completed' | 'failed';
  rowsProcessed: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsSkipped: number;
  errors: string[];
};

export interface SheetSyncAdapter {
  sync(): Promise<SheetSyncSummary>;
}

export interface EvidenceStorageAdapter {
  upload(photo: EvidencePhoto): Promise<{ storagePath: string; signedUrl?: string }>;
  createSignedUrl(storagePath: string, expiresInSeconds?: number): Promise<string>;
}

export class ConfiguredEvidenceStorageAdapter implements EvidenceStorageAdapter {
  constructor(private readonly uploadFile: (path: string, file: Blob) => Promise<void>, private readonly signFile: (path: string, expiresInSeconds: number) => Promise<string>) {}

  async upload(photo: EvidencePhoto): Promise<{ storagePath: string; signedUrl?: string }> {
    const timestamp = photo.capturedAt.replace(/[^0-9]/g, '').slice(0, 14);
    const storagePath = `${photo.cowId}/${photo.hoId}/${photo.itemKey}/${photo.evidenceType}/${timestamp}-${photo.id}.jpg`;
    const response = await fetch(photo.uri);
    const file = await response.blob();
    await this.uploadFile(storagePath, file);
    return { storagePath, signedUrl: await this.createSignedUrl(storagePath) };
  }

  async createSignedUrl(storagePath: string, expiresInSeconds = 3600): Promise<string> {
    return this.signFile(storagePath, expiresInSeconds);
  }
}

export class DevelopmentSheetSyncAdapter implements SheetSyncAdapter {
  async sync(): Promise<SheetSyncSummary> {
    const startedAt = new Date().toISOString();
    return { startedAt, finishedAt: new Date().toISOString(), status: 'completed', rowsProcessed: 0, rowsInserted: 0, rowsUpdated: 0, rowsSkipped: 0, errors: ['Development mode: configure a server-side Google Sheet adapter before syncing.'] };
  }
}

export function normalizeSiteRow(row: Record<string, unknown>): Partial<Site> {
  const get = (...keys: string[]) => keys.map((key) => row[key]).find((value) => typeof value === 'string' && value.trim()) as string | undefined;
  const cowId = get('COW ID', 'cow_id', 'COW_ID');
  return {
    cowId: cowId?.trim().toUpperCase(),
    siteLabel: get('Site Label', 'site_label') || '',
    region: get('Region', 'region') || '',
    district: get('District', 'district') || '',
    city: get('City', 'city') || '',
    siteStatus: get('Site Status', 'site_status') || '',
    vendor: get('Vendor', 'vendor') || '',
    hasTruckHead: ['yes', 'true', '1'].includes((get('Truck Head', 'has_truck_head') || '').toLowerCase())
  };
}

export const evidenceBucketName = storageBucket;
