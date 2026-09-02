import { checklistForSite } from '../checklist';
import { createAuditEvent, emptyInspectionItem } from '../domain/workflow';
import { HandoverDraft, EvidencePhoto, HandoverStage, Site, Snag } from '../types';

function demoPhoto(handoverId: string, site: Site, itemKey: string, sequence: number, evidenceType: EvidencePhoto['evidenceType'] = 'item'): EvidencePhoto {
  return {
    id: `${handoverId}-${itemKey}-${sequence}`,
    uri: `demo://camera/${handoverId}/${itemKey}/${sequence}`,
    capturedAt: new Date(Date.now() - sequence * 3600000).toISOString(),
    capturedBy: 'development-seed',
    cowId: site.cowId,
    hoId: handoverId,
    itemKey,
    evidenceType,
    sequence,
    uploadState: 'demo',
    caption: 'Development seed capture'
  };
}

function demoSnag(handoverId: string, site: Site, itemKey: string, severity: Snag['severity'], status: Snag['status']): Snag {
  return {
    id: `${handoverId}-${itemKey}-snag`,
    snagNo: 'SN-001',
    itemKey,
    category: 'Power System',
    description: severity === 'critical' ? 'Generator auto-start requires rectification.' : 'Minor cable label requires replacement.',
    quantity: '1',
    severity,
    assignee: 'Site maintenance team',
    requiredAction: 'Rectify and upload closure evidence',
    targetDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
    status,
    photos: [demoPhoto(handoverId, site, itemKey, 1, 'snag')],
    rectificationPhotos: status === 'closed' ? [demoPhoto(handoverId, site, itemKey, 2, 'rectification')] : [],
    closureRemarks: status === 'closed' ? 'Rectification reviewed and accepted.' : undefined,
    closureReviewer: status === 'closed' ? 'Region reviewer' : undefined,
    closedAt: status === 'closed' ? new Date().toISOString() : undefined
  };
}

export function createDemoHandover(site: Site, hoId: string, stage: HandoverStage): HandoverDraft {
  const definitions = checklistForSite(site);
  const id = `demo-${hoId}`;
  const items = Object.fromEntries(definitions.map((definition) => {
    const item = emptyInspectionItem(definition.key);
    const photos = Array.from({ length: definition.requiredPhotos }, (_, index) => demoPhoto(hoId, site, definition.key, index + 1));
    return [definition.key, {
      ...item,
      availability: 'available' as const,
      status: 'good' as const,
      quantity: '1',
      workingQuantity: '1',
      brand: 'Development seed',
      model: 'Field verified',
      photos
    }];
  }));
  const snagItemKey = definitions[2]?.key || definitions[0].key;
  if (stage === 'region_review') items[snagItemKey].snags = [demoSnag(hoId, site, snagItemKey, 'major', 'open')];
  if (stage === 'approved') items[snagItemKey].snags = [demoSnag(hoId, site, snagItemKey, 'minor', 'closed')];
  const fieldActor = 'Development field account';
  const reviewActor = 'Central reviewer';
  const pmActor = 'Project Manager demo account';
  const audit = [createAuditEvent(id, fieldActor, 'field_team', 'Draft created')];
  if (['field_submitted', 'region_review', 'region_approved', 'pm_review', 'approved'].includes(stage)) audit.push(createAuditEvent(id, fieldActor, 'field_team', 'Submitted for Region Team review', 'draft', 'field_submitted'));
  if (['region_review', 'region_approved', 'pm_review', 'approved'].includes(stage)) audit.push(createAuditEvent(id, reviewActor, 'region_team', 'Region review started', 'field_submitted', 'region_review'));
  if (['region_approved', 'pm_review', 'approved'].includes(stage)) audit.push(createAuditEvent(id, reviewActor, 'region_team', 'Region Team approved handover', 'region_review', 'region_approved'));
  if (['pm_review', 'approved'].includes(stage)) audit.push(createAuditEvent(id, reviewActor, 'region_team', 'Moved to Project Manager review', 'region_approved', 'pm_review'));
  if (stage === 'approved') audit.push(createAuditEvent(id, pmActor, 'project_manager', 'Project Manager final approval', 'pm_review', 'approved'));
  const createdAt = new Date(Date.now() - 4 * 86400000).toISOString();
  return {
    id,
    hoId,
    site,
    createdAt,
    updatedAt: new Date().toISOString(),
    submittedAt: stage === 'draft' ? undefined : new Date(Date.now() - 3 * 86400000).toISOString(),
    approvedAt: stage === 'approved' ? new Date(Date.now() - 3600000).toISOString() : undefined,
    stage,
    fieldEngineer: fieldActor,
    receivingTeam: 'COW operations receiving team',
    gps: { latitude: site.latitude || 24.7136, longitude: site.longitude || 46.6753, distanceMeters: 18 },
    generalRemarks: 'Development seed record. Master data remains read only.',
    generalPhotos: [demoPhoto(hoId, site, 'general', 1, 'general')],
    declarationConfirmed: stage !== 'draft',
    items,
    audit,
    approvals: stage === 'approved' ? [{ id: `${id}-approval-pm`, handoverId: id, stage: 'pm_review', decision: 'approved', comments: 'Final review complete.', decidedBy: pmActor, decidedAt: new Date(Date.now() - 3600000).toISOString() }] : [],
    locked: stage === 'approved',
    isDemo: true
  };
}

export function createDemoHandovers(sites: Site[]): HandoverDraft[] {
  const central = sites.find((site) => site.region === 'Central') || sites[0];
  const west = sites.find((site) => site.region === 'West') || sites[0];
  return [
    createDemoHandover(central, `HO-${central.cowId}-20260305-0001`, 'region_review'),
    createDemoHandover(west, `HO-${west.cowId}-20260304-0001`, 'pm_review'),
    createDemoHandover(central, `HO-${central.cowId}-20260301-0001`, 'approved')
  ];
}
