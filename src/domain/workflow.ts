import { checklistForSite } from '../checklist';
import {
  AuditEvent,
  HandoverDraft,
  HandoverStage,
  InspectionItem,
  Site,
  UserRole,
  ValidationResult
} from '../types';

export const STAGE_LABELS: Record<HandoverStage, string> = {
  draft: 'Draft',
  field_submitted: 'Field submitted',
  region_review: 'Region review',
  returned_to_field: 'Returned to field',
  region_approved: 'Region approved',
  pm_review: 'PM review',
  returned_to_region: 'Returned to region',
  rejected: 'Rejected',
  approved: 'Approved',
  cancelled: 'Cancelled'
};

const ALLOWED_TRANSITIONS: Record<HandoverStage, HandoverStage[]> = {
  draft: ['field_submitted', 'cancelled'],
  field_submitted: ['region_review', 'returned_to_field', 'rejected'],
  region_review: ['region_approved', 'pm_review', 'returned_to_field', 'rejected'],
  returned_to_field: ['field_submitted', 'cancelled'],
  region_approved: ['pm_review'],
  pm_review: ['approved', 'returned_to_region', 'rejected'],
  returned_to_region: ['region_approved', 'pm_review', 'rejected'],
  rejected: [],
  approved: [],
  cancelled: []
};

export function canTransition(from: HandoverStage, to: HandoverStage): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function canRoleTransition(role: UserRole, from: HandoverStage, to: HandoverStage): boolean {
  if (!canTransition(from, to)) return false;
  if (role === 'admin') return false;
  if (role === 'field_team') return (from === 'draft' || from === 'returned_to_field') && to === 'field_submitted';
  if (role === 'region_team') {
    return from === 'field_submitted' || from === 'region_review' || from === 'returned_to_region';
  }
  if (role === 'project_manager') return from === 'pm_review';
  return false;
}

export function canAccessHandover(role: UserRole, assignedRegion: string, handover: HandoverDraft): boolean {
  if (role === 'admin' || role === 'viewer' || role === 'project_manager') return true;
  return handover.site.region === assignedRegion;
}

export function createHoId(cowId: string, existing: HandoverDraft[], now = new Date()): string {
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const prefix = `HO-${cowId}-${date}-`;
  const sequence = existing.filter((handover) => handover.hoId.startsWith(prefix)).length + 1;
  return `${prefix}${String(sequence).padStart(4, '0')}`;
}

export function createAuditEvent(
  handoverId: string,
  actor: string,
  role: UserRole,
  action: string,
  previousStage?: HandoverStage,
  newStage?: HandoverStage,
  comments?: string
): AuditEvent {
  return {
    id: `${handoverId}-event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    handoverId,
    actor,
    role,
    occurredAt: new Date().toISOString(),
    previousStage,
    newStage,
    action,
    comments
  };
}

export function emptyInspectionItem(definitionKey: string): InspectionItem {
  return {
    definitionKey,
    availability: 'not_checked',
    status: 'not_checked',
    quantity: '',
    workingQuantity: '',
    brand: '',
    model: '',
    serialNumber: '',
    capacity: '',
    structuredValues: {},
    remarks: '',
    photos: [],
    snags: []
  };
}

export function createDraft(site: Site, existing: HandoverDraft[], fieldEngineer = 'Development field account'): HandoverDraft {
  const definitions = checklistForSite(site);
  const now = new Date().toISOString();
  const hoId = createHoId(site.cowId, existing);
  return {
    id: `local-${hoId}`,
    hoId,
    site,
    createdAt: now,
    updatedAt: now,
    stage: 'draft',
    fieldEngineer,
    receivingTeam: 'Receiving team to be confirmed',
    generalRemarks: '',
    generalPhotos: [],
    declarationConfirmed: false,
    items: Object.fromEntries(definitions.map((definition) => [definition.key, emptyInspectionItem(definition.key)])),
    audit: [createAuditEvent(`local-${hoId}`, fieldEngineer, 'field_team', 'Draft created')],
    approvals: [],
    locked: false,
    isDemo: true
  };
}

export function validateHandover(handover: HandoverDraft): ValidationResult {
  const definitions = checklistForSite(handover.site);
  const issues = [] as ValidationResult['issues'];
  let completedItems = 0;
  let photoCount = handover.generalPhotos.length;
  let snagCount = 0;

  for (const definition of definitions) {
    const item = handover.items[definition.key];
    const installed = item.quantity === '' ? undefined : Number(item.quantity);
    const working = item.workingQuantity === '' ? undefined : Number(item.workingQuantity);
    photoCount += item.photos.length;
    snagCount += item.snags.length;

    if (item.availability === 'not_checked' || item.status === 'not_checked') {
      issues.push({ code: 'required', itemKey: definition.key, message: `${definition.title} needs an availability and status.` });
    } else if (item.photos.length < definition.requiredPhotos && item.availability !== 'not_applicable') {
      issues.push({ code: 'required', itemKey: definition.key, message: `${definition.title} needs ${definition.requiredPhotos} camera photo(s).` });
    } else {
      completedItems += 1;
    }

    if (installed !== undefined && working !== undefined && (Number.isNaN(installed) || Number.isNaN(working) || working > installed)) {
      issues.push({ code: 'quantity', itemKey: definition.key, message: `${definition.title} working quantity cannot exceed installed quantity.` });
    }

    if (['defective', 'damaged'].includes(item.status) || item.availability === 'missing') {
      if (item.snags.length === 0) {
        issues.push({ code: 'snag', itemKey: definition.key, message: `${definition.title} needs a snag before submission.` });
      }
    }
  }

  const openCritical = Object.values(handover.items).flatMap((item) => item.snags).some((snag) => snag.severity === 'critical' && snag.status !== 'closed');
  if (openCritical) issues.push({ code: 'critical_snag', message: 'Open critical snags block final approval.' });
  if (!handover.declarationConfirmed) issues.push({ code: 'declaration', message: 'The field declaration must be confirmed.' });

  return {
    valid: issues.length === 0,
    issues,
    completedItems,
    totalItems: definitions.length,
    photoCount,
    snagCount
  };
}

export function completionPercent(handover: HandoverDraft): number {
  const result = validateHandover({ ...handover, declarationConfirmed: true });
  return result.totalItems ? Math.round((result.completedItems / result.totalItems) * 100) : 0;
}
