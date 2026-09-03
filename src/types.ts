export type UserRole = 'field_team' | 'region_team' | 'project_manager' | 'admin' | 'viewer';

export type HandoverStage =
  | 'draft'
  | 'field_submitted'
  | 'region_review'
  | 'returned_to_field'
  | 'region_approved'
  | 'pm_review'
  | 'returned_to_region'
  | 'rejected'
  | 'approved'
  | 'cancelled';

export type ItemAvailability = 'available' | 'missing' | 'not_applicable' | 'not_checked';
export type ItemStatus = 'not_checked' | 'good' | 'fair' | 'defective' | 'damaged';
export type EvidenceType = 'general' | 'item' | 'snag' | 'rectification';
export type SnagSeverity = 'minor' | 'major' | 'critical';
export type SnagStatus = 'open' | 'assigned' | 'under_rectification' | 'ready_for_review' | 'closed';

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
  location?: string;
  deploymentDate?: string;
  vehiclePlate?: string;
  sourceData?: Record<string, string>;
};

export type ChecklistDefinition = {
  key: string;
  title: string;
  category: string;
  requiredPhotos: number;
  conditional?: 'truck';
  helpText?: string;
};

export type EvidencePhoto = {
  id: string;
  uri: string;
  storagePath?: string;
  capturedAt: string;
  capturedBy?: string;
  cowId: string;
  hoId: string;
  itemKey: string;
  evidenceType: EvidenceType;
  sequence: number;
  caption?: string;
  latitude?: number;
  longitude?: number;
  uploadState: 'pending' | 'uploaded' | 'failed' | 'demo';
};

export type Snag = {
  id: string;
  snagNo: string;
  itemKey: string;
  category: string;
  description: string;
  quantity: string;
  severity: SnagSeverity;
  assignee: string;
  requiredAction: string;
  targetDate: string;
  status: SnagStatus;
  photos: EvidencePhoto[];
  rectificationPhotos: EvidencePhoto[];
  closureRemarks?: string;
  closureReviewer?: string;
  closedAt?: string;
};

export type InspectionItem = {
  definitionKey: string;
  availability: ItemAvailability;
  status: ItemStatus;
  quantity: string;
  workingQuantity: string;
  brand: string;
  model: string;
  serialNumber: string;
  capacity: string;
  structuredValues: Record<string, string>;
  remarks: string;
  photos: EvidencePhoto[];
  snags: Snag[];
};

export type AuditEvent = {
  id: string;
  handoverId: string;
  actor: string;
  role: UserRole;
  occurredAt: string;
  previousStage?: HandoverStage;
  newStage?: HandoverStage;
  action: string;
  comments?: string;
};

export type ApprovalRecord = {
  id: string;
  handoverId: string;
  stage: 'region_review' | 'pm_review';
  decision: 'approved' | 'returned' | 'rejected';
  comments: string;
  decidedBy: string;
  decidedAt: string;
};

export type HandoverDraft = {
  id: string;
  hoId: string;
  site: Site;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  approvedAt?: string;
  stage: HandoverStage;
  fieldEngineer: string;
  receivingTeam: string;
  gps?: { latitude: number; longitude: number; distanceMeters?: number };
  generalRemarks: string;
  generalPhotos: EvidencePhoto[];
  declarationConfirmed: boolean;
  items: Record<string, InspectionItem>;
  audit: AuditEvent[];
  approvals: ApprovalRecord[];
  locked: boolean;
  isDemo: boolean;
};

export type NotificationRecord = {
  id: string;
  title: string;
  body: string;
  audience: UserRole;
  handoverId?: string;
  createdAt: string;
  read: boolean;
};

export type PlanSource = 'supabase' | 'workbook' | 'migration_required';

export type HandoverPlan = {
  id?: string;
  region: string;
  area: string;
  totalPlanned: number;
  onAirPlanned: number;
  offAirPlanned: number;
  scheduledQuantity: number;
  unallocatedQuantity: number;
  source: string;
};

export type HandoverPlanDaily = {
  id?: string;
  region: string;
  area: string;
  planDate: string;
  plannedQuantity: number;
};

export type PlanDataset = {
  rows: HandoverPlan[];
  daily: HandoverPlanDaily[];
  source: PlanSource;
  notice: string;
};

export type PlanSummary = HandoverPlan & {
  actualQuantity: number;
  variance: number;
};

export type WorkspaceState = {
  sites: Site[];
  handovers: HandoverDraft[];
  notifications: NotificationRecord[];
  currentRole: UserRole;
  currentRegion: string;
  isDemoMode: boolean;
  plan: PlanDataset;
  lastSyncedAt?: string;
};

export type ValidationIssue = {
  code: 'required' | 'quantity' | 'snag' | 'declaration' | 'critical_snag';
  itemKey?: string;
  message: string;
};

export type ValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
  completedItems: number;
  totalItems: number;
  photoCount: number;
  snagCount: number;
};
