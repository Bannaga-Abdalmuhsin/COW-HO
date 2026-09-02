export type ItemStatus = 'not_checked' | 'good' | 'fair' | 'defective' | 'missing' | 'na';

export type Site = {
  id: string;
  cowId: string;
  siteLabel: string;
  region: string;
  district: string;
  city: string;
  latitude?: number;
  longitude?: number;
  siteStatus: string;
  vendor: string;
  hasTruckHead: boolean;
};

export type ChecklistDefinition = {
  key: string;
  title: string;
  category: string;
  requiredPhotos: number;
  conditional?: 'truck';
};

export type EvidencePhoto = {
  uri: string;
  capturedAt: string;
  latitude?: number;
  longitude?: number;
};

export type Snag = {
  id: string;
  description: string;
  severity: 'minor' | 'major' | 'critical';
  status: 'open' | 'under_rectification' | 'closed';
};

export type InspectionItem = {
  definitionKey: string;
  status: ItemStatus;
  quantity: string;
  workingQuantity: string;
  remarks: string;
  photos: EvidencePhoto[];
  snags: Snag[];
};

export type HandoverDraft = {
  hoId: string;
  site: Site;
  createdAt: string;
  stage: 'draft' | 'field_submitted' | 'region_review' | 'pm_review' | 'approved' | 'returned';
  items: Record<string, InspectionItem>;
};
