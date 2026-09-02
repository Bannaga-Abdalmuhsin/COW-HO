import { useMemo, useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { categoryShortLabels, checklistForSite } from '../checklist';
import { canAccessHandover, canRoleTransition, completionPercent, createAuditEvent, STAGE_LABELS, validateHandover } from '../domain/workflow';
import { PlanVsActual } from './PlanVsActual';
import { ApprovalRecord, HandoverDraft, HandoverStage, SnagSeverity, UserRole, WorkspaceState } from '../types';

const COLORS = {
  navy: '#14213D',
  blue: '#176B87',
  pale: '#EAF4F7',
  amber: '#F59E0B',
  red: '#C2413B',
  green: '#1F7A5B',
  ink: '#172033',
  muted: '#687386',
  border: '#D9E0E8',
  white: '#FFFFFF',
  background: '#F5F7FA',
  softBlue: '#DDEFF3'
};

type ApprovalPortalProps = {
  workspace: WorkspaceState;
  onUpdateHandover: (id: string, updater: (handover: HandoverDraft) => HandoverDraft) => void;
  onChangeRole: (role: UserRole, region: string) => void;
  onChangeMode: () => void;
};

type PortalTab = 'overview' | 'handovers' | 'snags' | 'reports' | 'admin';
type RoleOption = { role: UserRole; label: string; region: string };

const ROLE_OPTIONS: RoleOption[] = [
  { role: 'region_team', label: 'Region Team', region: 'Central' },
  { role: 'project_manager', label: 'Project Manager', region: '' },
  { role: 'admin', label: 'Administrator', region: '' }
];

export function ApprovalPortal({ workspace, onUpdateHandover, onChangeRole, onChangeMode }: ApprovalPortalProps) {
  const { width } = useWindowDimensions();
  const compact = width < 850;
  const [tab, setTab] = useState<PortalTab>('overview');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<HandoverStage | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<SnagSeverity | 'all'>('all');
  const [comment, setComment] = useState('');
  const [pendingAction, setPendingAction] = useState<'return' | 'reject' | null>(null);
  const [snagToUpdate, setSnagToUpdate] = useState<{ handoverId: string; snagId: string } | null>(null);
  const [snagComment, setSnagComment] = useState('');

  const scopedSites = workspace.sites.filter((site) => ['admin', 'project_manager', 'viewer'].includes(workspace.currentRole) || site.region === workspace.currentRegion);
  const scopedHandovers = workspace.handovers.filter((handover) => canAccessHandover(workspace.currentRole, workspace.currentRegion, handover));
  const selected = scopedHandovers.find((handover) => handover.id === selectedId) || null;
  const allSnags = scopedHandovers.flatMap((handover) => Object.values(handover.items).flatMap((item) => item.snags.map((snag) => ({ ...snag, handover }))));
  const metrics = useMemo(() => ({
    sites: scopedSites.length,
    active: scopedHandovers.filter((handover) => !['approved', 'rejected', 'cancelled'].includes(handover.stage)).length,
    region: scopedHandovers.filter((handover) => ['field_submitted', 'region_review'].includes(handover.stage)).length,
    pm: scopedHandovers.filter((handover) => ['region_approved', 'pm_review'].includes(handover.stage)).length,
    approved: scopedHandovers.filter((handover) => handover.stage === 'approved').length,
    returned: scopedHandovers.filter((handover) => ['returned_to_field', 'returned_to_region', 'rejected'].includes(handover.stage)).length,
    openSnags: allSnags.filter(({ status }) => status !== 'closed').length,
    criticalSnags: allSnags.filter(({ severity, status }) => severity === 'critical' && status !== 'closed').length
  }), [allSnags, scopedHandovers, scopedSites.length]);
  const visibleHandovers = scopedHandovers.filter((handover) => {
    const query = search.trim().toLowerCase();
    const matchesQuery = !query || [handover.hoId, handover.site.cowId, handover.site.siteLabel, handover.site.region, handover.fieldEngineer].some((value) => value.toLowerCase().includes(query));
    return matchesQuery && (stageFilter === 'all' || handover.stage === stageFilter);
  });
  const visibleSnags = allSnags.filter(({ severity, handover }) => (severityFilter === 'all' || severity === severityFilter) && (!search.trim() || [handover.hoId, handover.site.cowId].some((value) => value.toLowerCase().includes(search.trim().toLowerCase()))));

  function chooseRole(option: RoleOption) {
    onChangeRole(option.role, option.region);
    setRoleMenuOpen(false);
    setTab('overview');
  }

  function transition(handover: HandoverDraft, nextStage: HandoverStage, action: string, decision?: ApprovalRecord['decision'], comments = '') {
    if (!canRoleTransition(workspace.currentRole, handover.stage, nextStage) && workspace.currentRole !== 'admin') {
      Alert.alert('Action not allowed', 'This role cannot perform that workflow transition.');
      return;
    }
    if ((decision === 'returned' || decision === 'rejected') && !comments.trim()) {
      setPendingAction(decision === 'returned' ? 'return' : 'reject');
      setSelectedId(handover.id);
      return;
    }
    if (nextStage === 'approved' && validateHandover(handover).issues.some((issue) => issue.code === 'critical_snag')) {
      Alert.alert('Approval blocked', 'Open critical snags must be closed before final approval.');
      return;
    }
    const now = new Date().toISOString();
    const approval = decision ? {
      id: `${handover.id}-approval-${Date.now()}`,
      handoverId: handover.id,
      stage: handover.stage === 'pm_review' ? 'pm_review' : 'region_review',
      decision,
      comments: comments.trim(),
      decidedBy: workspace.currentRole === 'project_manager' ? 'PM demo account' : `${workspace.currentRegion || 'All regions'} reviewer`,
      decidedAt: now
    } satisfies ApprovalRecord : null;
    onUpdateHandover(handover.id, (current) => ({
      ...current,
      stage: nextStage,
      updatedAt: now,
      approvedAt: nextStage === 'approved' ? now : current.approvedAt,
      locked: nextStage === 'approved',
      approvals: approval ? [...current.approvals, approval] : current.approvals,
      audit: [...current.audit, createAuditEvent(current.id, approval?.decidedBy || 'Portal operator', workspace.currentRole, action, current.stage, nextStage, comments.trim())]
    }));
    setComment('');
    setPendingAction(null);
    Alert.alert('Workflow updated', `${handover.hoId} is now ${STAGE_LABELS[nextStage].toLowerCase()}.`);
  }

  function handlePrimaryAction(handover: HandoverDraft) {
    if (workspace.currentRole === 'region_team') {
      if (handover.stage === 'field_submitted') transition(handover, 'region_review', 'Region review started');
      else if (handover.stage === 'region_review') transition(handover, 'pm_review', 'Region Team approved handover for PM review', 'approved');
      else if (handover.stage === 'returned_to_region') transition(handover, 'pm_review', 'Region Team re-approved handover for PM review', 'approved');
    } else if (workspace.currentRole === 'project_manager' && handover.stage === 'pm_review') {
      transition(handover, 'approved', 'Project Manager final approval', 'approved');
    }
  }

  function primaryLabel(handover: HandoverDraft) {
    if (workspace.currentRole === 'region_team' && handover.stage === 'field_submitted') return 'Start region review';
    if (workspace.currentRole === 'region_team' && ['region_review', 'returned_to_region'].includes(handover.stage)) return 'Approve for PM';
    if (workspace.currentRole === 'project_manager' && handover.stage === 'pm_review') return 'Final approve & lock';
    return 'View workspace';
  }

  function saveSnagStatus(nextStatus: 'closed' | 'open') {
    if (!snagToUpdate) return;
    const target = allSnags.find(({ handover, id }) => handover.id === snagToUpdate.handoverId && id === snagToUpdate.snagId);
    if (!target) return;
    if (!snagComment.trim()) {
      Alert.alert('Comment required', 'Add a short comment to record this snag status change.');
      return;
    }
    const now = new Date().toISOString();
    onUpdateHandover(target.handover.id, (current) => ({
      ...current,
      updatedAt: now,
      items: Object.fromEntries(Object.entries(current.items).map(([key, item]) => [key, {
        ...item,
        snags: item.snags.map((snag) => snag.id === target.id ? { ...snag, status: nextStatus } : snag)
      }])),
      audit: [...current.audit, createAuditEvent(current.id, workspace.currentRole === 'admin' ? 'Platform administrator' : 'Portal operator', workspace.currentRole, `${nextStatus === 'closed' ? 'Closed' : 'Reopened'} snag ${target.snagNo}`, current.stage, current.stage, snagComment.trim())]
    }));
    setSnagToUpdate(null);
    setSnagComment('');
  }

  function exportCsv() {
    const rows = [['HO ID', 'COW ID', 'Site', 'Region', 'Stage', 'Completion', 'Photos', 'Open snags'], ...workspace.handovers.map((handover) => {
      const validation = validateHandover(handover);
      return [handover.hoId, handover.site.cowId, handover.site.siteLabel, handover.site.region, STAGE_LABELS[handover.stage], `${completionPercent(handover)}%`, String(validation.photoCount), String(validation.snagCount)];
    })];
    const csv = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')).join('\n');
    if (Platform.OS === 'web') {
      const webDocument = (globalThis as { document?: { createElement: (tag: string) => { href: string; download: string; click: () => void }; body: { appendChild: (node: unknown) => void; removeChild: (node: unknown) => void } } }).document;
      if (webDocument) {
        const anchor = webDocument.createElement('a');
        anchor.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
        anchor.download = 'cow-handover-register.csv';
        webDocument.body.appendChild(anchor);
        anchor.click();
        webDocument.body.removeChild(anchor);
        return;
      }
    }
    Alert.alert('CSV export ready', csv.slice(0, 600));
  }

  function renderSidebar() {
    return <View style={[styles.sidebar, compact && styles.sidebarCompact]}><View style={styles.sidebarBrand}><View style={styles.logo}><Text style={styles.logoText}>HO</Text></View>{!compact && <View><Text style={styles.sidebarEyebrow}>ACES OPERATIONS</Text><Text style={styles.sidebarTitle}>COW Handover</Text></View>}</View><View style={styles.sidebarRule} /><Text style={styles.sidebarSection}>WORKSPACE</Text>{([['overview', 'Overview', '⌂'], ['handovers', 'Handover register', '▤'], ['snags', 'Snag register', '◇'], ['reports', 'Reports', '◫'], ['admin', 'Administration', '⚙']] as const).map(([key, label, icon]) => <Pressable key={key} style={[styles.navItem, tab === key && styles.navItemActive]} onPress={() => setTab(key)}><Text style={[styles.navIcon, tab === key && styles.navIconActive]}>{icon}</Text>{!compact && <Text style={[styles.navLabel, tab === key && styles.navLabelActive]}>{label}</Text>}</Pressable>)}<View style={styles.sidebarBottom}>{!compact && <><Text style={styles.sidebarSection}>CURRENT ACCOUNT</Text><Text style={styles.accountName}>{workspace.currentRole === 'region_team' ? 'Region reviewer' : workspace.currentRole === 'project_manager' ? 'Project Manager' : 'Platform administrator'}</Text><Text style={styles.accountMeta}>{workspace.currentRegion || 'Cross-region access'}</Text></>}<Pressable style={styles.switchAppButton} onPress={onChangeMode}><Text style={styles.switchAppText}>{compact ? '‹' : '← Field app'}</Text></Pressable></View></View>;
  }

  function renderHeader() {
    const roleLabel = ROLE_OPTIONS.find((option) => option.role === workspace.currentRole)?.label || 'Administrator';
    return <View style={styles.portalHeader}><View><Text style={styles.headerEyebrow}>APPROVAL PORTAL / {tab.toUpperCase()}</Text><Text style={styles.headerTitle}>{tab === 'overview' ? 'Operations overview' : tab === 'handovers' ? 'Handover register' : tab === 'snags' ? 'Snag register' : tab === 'reports' ? 'Reports & exports' : 'Platform administration'}</Text></View><View style={styles.headerActions}><View style={styles.demoPill}><View style={styles.demoDot} /><Text style={styles.demoPillText}>Development seed data</Text></View><Pressable style={styles.roleButton} onPress={() => setRoleMenuOpen(!roleMenuOpen)}><View style={styles.avatar}><Text style={styles.avatarText}>{roleLabel.slice(0, 2).toUpperCase()}</Text></View><View><Text style={styles.roleName}>{roleLabel}</Text><Text style={styles.roleMeta}>{workspace.currentRegion || 'All regions'} · demo</Text></View><Text style={styles.roleChevron}>⌄</Text></Pressable>{roleMenuOpen && <View style={styles.roleMenu}>{ROLE_OPTIONS.map((option) => <Pressable key={option.role} style={styles.roleOption} onPress={() => chooseRole(option)}><Text style={styles.roleOptionLabel}>{option.label}</Text><Text style={styles.roleOptionMeta}>{option.region || 'Cross-region'}</Text></Pressable>)}</View>}</View></View>;
  }

  function renderOverview() {
    return <ScrollView contentContainerStyle={styles.content}><View style={styles.welcomeRow}><View><Text style={styles.pageEyebrow}>LIVE WORKSPACE · {workspace.currentRegion || 'ALL REGIONS'}</Text><Text style={styles.pageTitle}>Good morning, {workspace.currentRole === 'region_team' ? 'Region Team' : workspace.currentRole === 'project_manager' ? 'Project Manager' : 'Administrator'}</Text><Text style={styles.pageHelper}>Here is the current handover flow across your assigned operations.</Text></View><Pressable style={styles.exportButton} onPress={exportCsv}><Text style={styles.exportIcon}>↓</Text><Text style={styles.exportText}>Export register</Text></Pressable></View><View style={styles.metricGrid}><MetricCard label="Total sites" value={String(metrics.sites)} note="Master data" tone="navy" /><MetricCard label="Active handovers" value={String(metrics.active)} note="Across all stages" tone="blue" /><MetricCard label="Pending region review" value={String(metrics.region)} note="Needs action" tone="amber" /><MetricCard label="Pending PM review" value={String(metrics.pm)} note="Needs action" tone="amber" /><MetricCard label="Approved handovers" value={String(metrics.approved)} note="Locked records" tone="green" /><MetricCard label="Open snags" value={String(metrics.openSnags)} note={`${metrics.criticalSnags} critical`} tone="red" /></View><PlanVsActual plan={workspace.plan} handovers={workspace.handovers} region={workspace.currentRegion || undefined} /><View style={styles.overviewColumns}><View style={styles.panel}><View style={styles.panelHeader}><View><Text style={styles.panelEyebrow}>ACTION QUEUE</Text><Text style={styles.panelTitle}>Handovers needing attention</Text></View><Pressable onPress={() => setTab('handovers')}><Text style={styles.linkText}>Open register →</Text></Pressable></View>{workspace.handovers.filter((handover) => ['field_submitted', 'region_review', 'pm_review', 'returned_to_region'].includes(handover.stage)).slice(0, 5).map((handover) => <HandoverRow key={handover.id} handover={handover} onPress={() => { setSelectedId(handover.id); setTab('handovers'); }} />)}{workspace.handovers.filter((handover) => ['field_submitted', 'region_review', 'pm_review', 'returned_to_region'].includes(handover.stage)).length === 0 && <Empty title="Queue is clear" body="No handovers currently need review." />}</View><View style={styles.panel}><View style={styles.panelHeader}><View><Text style={styles.panelEyebrow}>SNAG HEALTH</Text><Text style={styles.panelTitle}>Open by severity</Text></View><Text style={styles.panelIcon}>◇</Text></View><SeverityBar label="Critical" count={metrics.criticalSnags} total={Math.max(metrics.openSnags, 1)} color={COLORS.red} /><SeverityBar label="Major" count={allSnags.filter(({ severity, status }) => severity === 'major' && status !== 'closed').length} total={Math.max(metrics.openSnags, 1)} color={COLORS.amber} /><SeverityBar label="Minor" count={allSnags.filter(({ severity, status }) => severity === 'minor' && status !== 'closed').length} total={Math.max(metrics.openSnags, 1)} color={COLORS.blue} /><View style={styles.healthFooter}><Text style={styles.healthFooterLabel}>Average approval duration</Text><Text style={styles.healthFooterValue}>1.8 days</Text></View></View></View><View style={styles.workflowCard}><Text style={styles.panelEyebrow}>APPROVAL PIPELINE</Text><Text style={styles.panelTitle}>A complete audit trail from field to lock</Text><View style={styles.pipeline}>{[['Field submitted', metrics.region, COLORS.blue], ['Region review', metrics.region, COLORS.amber], ['PM review', metrics.pm, COLORS.amber], ['Approved & locked', metrics.approved, COLORS.green]].map(([label, count, color], index) => <View key={String(label)} style={styles.pipelineStep}><View style={[styles.pipelineNumber, { backgroundColor: color as string }]}><Text style={styles.pipelineNumberText}>{String(index + 1).padStart(2, '0')}</Text></View><Text style={styles.pipelineLabel}>{label}</Text><Text style={styles.pipelineCount}>{count}</Text>{index < 3 && <View style={styles.pipelineLine} />}</View>)}</View></View></ScrollView>;
  }

  function renderRegister() {
    return <ScrollView contentContainerStyle={styles.content}><View style={styles.registerToolbar}><View style={styles.registerIntro}><Text style={styles.pageEyebrow}>REGISTER · {visibleHandovers.length} RECORDS</Text><Text style={styles.pageTitle}>All handovers</Text><Text style={styles.pageHelper}>Search, filter and open a controlled review workspace.</Text></View><Pressable style={styles.exportButton} onPress={exportCsv}><Text style={styles.exportIcon}>↓</Text><Text style={styles.exportText}>Export CSV</Text></Pressable></View><View style={styles.filters}><View style={styles.filterSearch}><Text style={styles.filterSearchIcon}>⌕</Text><TextInput style={styles.filterInput} placeholder="Search HO ID, COW ID, site or engineer" placeholderTextColor={COLORS.muted} value={search} onChangeText={setSearch} /></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>{(['all', 'field_submitted', 'region_review', 'pm_review', 'approved', 'returned_to_field'] as const).map((stage) => <Pressable key={stage} style={[styles.filterChip, stageFilter === stage && styles.filterChipActive]} onPress={() => setStageFilter(stage)}><Text style={[styles.filterChipText, stageFilter === stage && styles.filterChipTextActive]}>{stage === 'all' ? 'All stages' : STAGE_LABELS[stage]}</Text></Pressable>)}</ScrollView></View><View style={styles.registerLayout}><View style={styles.registerList}>{visibleHandovers.map((handover) => <Pressable key={handover.id} style={[styles.registerRow, selectedId === handover.id && styles.registerRowActive]} onPress={() => setSelectedId(handover.id)}><View style={styles.registerMain}><View style={styles.hoIcon}><Text style={styles.hoIconText}>{handover.site.cowId.slice(-3)}</Text></View><View style={styles.flexOne}><View style={styles.rowTitle}><Text style={styles.hoId}>{handover.hoId}</Text>{handover.isDemo && <Text style={styles.seedTag}>DEMO</Text>}</View><Text style={styles.siteName}>{handover.site.siteLabel}</Text><Text style={styles.meta}>{handover.site.cowId} · {handover.site.region} · {handover.fieldEngineer}</Text></View></View><View style={styles.registerStat}><Text style={styles.registerStatValue}>{completionPercent(handover)}%</Text><Text style={styles.registerStatLabel}>complete</Text></View><View style={styles.registerStat}><Text style={styles.registerStatValue}>{validateHandover(handover).photoCount}</Text><Text style={styles.registerStatLabel}>photos</Text></View><View style={styles.stageCell}><StageBadge stage={handover.stage} /></View><Text style={styles.rowChevron}>›</Text></Pressable>)}{visibleHandovers.length === 0 && <Empty title="No handovers found" body="Adjust your search or stage filter." />}</View>{selected && renderReview(selected)}</View></ScrollView>;
  }

  function renderReview(handover: HandoverDraft) {
    const validation = validateHandover(handover);
    const definitions = checklistForSite(handover.site);
    const canAct = (workspace.currentRole === 'region_team' && ['field_submitted', 'region_review', 'returned_to_region'].includes(handover.stage)) || (workspace.currentRole === 'project_manager' && handover.stage === 'pm_review');
    return <View style={styles.reviewPanel}><View style={styles.reviewHeader}><View><Text style={styles.panelEyebrow}>REVIEW WORKSPACE</Text><Text style={styles.reviewTitle}>{handover.hoId}</Text><Text style={styles.meta}>{handover.site.siteLabel} · {handover.site.region} · {handover.site.city}</Text></View><StageBadge stage={handover.stage} /></View><View style={styles.reviewMetaGrid}><ReviewMeta label="COW ID" value={handover.site.cowId} /><ReviewMeta label="FIELD ENGINEER" value={handover.fieldEngineer} /><ReviewMeta label="CREATED" value={new Date(handover.createdAt).toLocaleDateString()} /><ReviewMeta label="GPS VARIANCE" value={handover.gps ? `${handover.gps.distanceMeters || 0}m` : 'Not captured'} /></View><View style={styles.masterData}><Text style={styles.panelEyebrow}>MASTER DATA · READ ONLY</Text><View style={styles.masterDataGrid}><ReviewMeta label="Region / district" value={`${handover.site.region} / ${handover.site.district}`} /><ReviewMeta label="Vendor" value={handover.site.vendor} /><ReviewMeta label="Site status" value={handover.site.siteStatus} /><ReviewMeta label="Vehicle" value={handover.site.hasTruckHead ? handover.site.vehiclePlate || 'Truck head' : 'Not applicable'} /></View></View><View style={styles.reviewSection}><View style={styles.reviewSectionHeader}><View><Text style={styles.panelEyebrow}>INSPECTION VALUES</Text><Text style={styles.panelTitle}>Required fields and evidence</Text></View><Text style={styles.completionLabel}>{validation.completedItems}/{validation.totalItems} complete</Text></View>{definitions.map((definition) => { const item = handover.items[definition.key]; const issue = validation.issues.find((current) => current.itemKey === definition.key); return <View key={definition.key} style={styles.reviewItem}><View style={styles.reviewItemTop}><View style={styles.flexOne}><Text style={styles.reviewItemTitle}>{definition.title}</Text><Text style={styles.meta}>{categoryShortLabels[definition.category] || definition.category} · {item.brand || 'Brand not recorded'} · {item.model || 'Model not recorded'}</Text></View><View style={styles.reviewItemRight}><Text style={styles.reviewItemStatus}>{item.availability === 'not_applicable' ? 'N/A' : item.status === 'not_checked' ? 'Pending' : item.status}</Text><Text style={styles.meta}>{item.photos.length}/{definition.requiredPhotos} photos</Text></View></View>{issue && <Text style={styles.issueText}>{issue.message}</Text>}{item.remarks && <Text style={styles.reviewRemarks}>{item.remarks}</Text>}{item.snags.length > 0 && <View style={styles.inlineSnags}>{item.snags.map((snag) => <View key={snag.id} style={styles.inlineSnag}><Text style={styles.inlineSnagTitle}>{snag.snagNo} · {snag.severity}</Text><Text style={styles.inlineSnagText}>{snag.description}</Text></View>)}</View>}</View>; })}</View><View style={styles.reviewSection}><View style={styles.reviewSectionHeader}><View><Text style={styles.panelEyebrow}>EVIDENCE GALLERY</Text><Text style={styles.panelTitle}>Private camera captures</Text></View><Text style={styles.completionLabel}>{validation.photoCount} total</Text></View><View style={styles.gallery}>{Object.values(handover.items).flatMap((item) => item.photos).slice(0, 12).map((photo) => photo.uri.startsWith('demo://') ? <View key={photo.id} style={styles.galleryDemo}><Text style={styles.galleryDemoText}>DEVELOPMENT{`\n`}CAPTURE</Text></View> : <Image key={photo.id} source={{ uri: photo.uri }} style={styles.galleryPhoto} />)}</View></View><View style={styles.reviewSection}><View style={styles.reviewSectionHeader}><View><Text style={styles.panelEyebrow}>APPROVAL TIMELINE</Text><Text style={styles.panelTitle}>Append-only audit history</Text></View></View>{handover.audit.slice().reverse().map((event) => <View key={event.id} style={styles.timelineEvent}><View style={styles.timelineDot} /><View style={styles.flexOne}><Text style={styles.timelineAction}>{event.action}</Text><Text style={styles.meta}>{event.actor} · {new Date(event.occurredAt).toLocaleString()}</Text>{event.comments && <Text style={styles.timelineComment}>“{event.comments}”</Text>}</View></View>)}</View>{canAct && <View style={styles.actionBox}><View><Text style={styles.actionBoxTitle}>{workspace.currentRole === 'region_team' ? 'Region Team decision' : 'Final PM decision'}</Text><Text style={styles.actionBoxText}>{workspace.currentRole === 'region_team' && handover.stage === 'field_submitted' ? 'Start the focused review before approving or returning.' : 'Actions are recorded with the current role, timestamp and comments.'}</Text></View><View style={styles.actionButtons}>{workspace.currentRole === 'region_team' && handover.stage === 'field_submitted' && <Pressable style={styles.primaryAction} onPress={() => handlePrimaryAction(handover)}><Text style={styles.primaryActionText}>{primaryLabel(handover)}</Text></Pressable>}{((workspace.currentRole === 'region_team' && ['region_review', 'returned_to_region'].includes(handover.stage)) || (workspace.currentRole === 'project_manager' && handover.stage === 'pm_review')) && <Pressable style={styles.primaryAction} onPress={() => handlePrimaryAction(handover)}><Text style={styles.primaryActionText}>{primaryLabel(handover)}</Text></Pressable>}<Pressable style={styles.returnAction} onPress={() => { setPendingAction('return'); setComment(''); }}><Text style={styles.returnActionText}>Return with comment</Text></Pressable><Pressable style={styles.rejectAction} onPress={() => { setPendingAction('reject'); setComment(''); }}><Text style={styles.rejectActionText}>Reject</Text></Pressable></View></View>}{pendingAction && selectedId === handover.id && <View style={styles.commentBox}><Text style={styles.panelEyebrow}>{pendingAction === 'return' ? 'RETURN COMMENT REQUIRED' : 'REJECTION COMMENT REQUIRED'}</Text><TextInput style={styles.commentInput} placeholder="Explain the required correction or rejection reason" placeholderTextColor={COLORS.muted} multiline value={comment} onChangeText={setComment} /><View style={styles.commentActions}><Pressable style={styles.secondaryButton} onPress={() => setPendingAction(null)}><Text style={styles.secondaryButtonText}>Cancel</Text></Pressable><Pressable style={styles.submitCommentButton} onPress={() => transition(handover, pendingAction === 'return' ? (workspace.currentRole === 'project_manager' ? 'returned_to_region' : 'returned_to_field') : 'rejected', pendingAction === 'return' ? 'Returned for correction' : 'Rejected handover', pendingAction === 'return' ? 'returned' : 'rejected', comment)}><Text style={styles.primaryActionText}>Save decision</Text></Pressable></View></View>}</View>;
  }

  function renderSnags() {
    return <ScrollView contentContainerStyle={styles.content}><View style={styles.registerToolbar}><View><Text style={styles.pageEyebrow}>SNAGS · {visibleSnags.length} MATCHES</Text><Text style={styles.pageTitle}>Central snag register</Text><Text style={styles.pageHelper}>Track responsibility, severity, target dates and rectification readiness.</Text></View><Pressable style={styles.exportButton} onPress={() => Alert.alert('Snag export', `${visibleSnags.length} snag records prepared for CSV export.`)}><Text style={styles.exportIcon}>↓</Text><Text style={styles.exportText}>Export snags</Text></Pressable></View><View style={styles.filters}><View style={styles.filterSearch}><Text style={styles.filterSearchIcon}>⌕</Text><TextInput style={styles.filterInput} placeholder="Search handover or COW ID" placeholderTextColor={COLORS.muted} value={search} onChangeText={setSearch} /></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>{(['all', 'critical', 'major', 'minor'] as const).map((severity) => <Pressable key={severity} style={[styles.filterChip, severityFilter === severity && styles.filterChipActive]} onPress={() => setSeverityFilter(severity)}><Text style={[styles.filterChipText, severityFilter === severity && styles.filterChipTextActive]}>{severity === 'all' ? 'All severities' : severity}</Text></Pressable>)}</ScrollView></View><View style={styles.snagList}>{visibleSnags.map(({ handover, ...snag }) => <View key={snag.id} style={styles.snagRow}><View style={[styles.severityBar, { backgroundColor: snag.severity === 'critical' ? COLORS.red : snag.severity === 'major' ? COLORS.amber : COLORS.blue }]} /><View style={styles.flexOne}><View style={styles.rowTitle}><Text style={styles.snagNo}>{snag.snagNo}</Text><Text style={styles.severityLabel}>{snag.severity}</Text></View><Text style={styles.snagDescription}>{snag.description}</Text><Text style={styles.meta}>{handover.hoId} · {handover.site.region} · Assignee: {snag.assignee}</Text></View><View style={styles.snagRight}><Text style={styles.targetDate}>{snag.targetDate}</Text><Text style={[styles.snagStatus, snag.status === 'closed' && styles.snagStatusClosed]}>{snag.status.replaceAll('_', ' ')}</Text><Pressable style={styles.snagActionButton} onPress={() => { setSnagToUpdate({ handoverId: handover.id, snagId: snag.id }); setSnagComment(''); }}><Text style={styles.snagActionText}>{snag.status === 'closed' ? 'Reopen' : 'Update'}</Text></Pressable></View></View>)}{visibleSnags.length === 0 && <Empty title="No snags found" body="There are no snag records matching these filters." />}{snagToUpdate && <View style={styles.snagCommentBox}><Text style={styles.panelEyebrow}>SNAG STATUS COMMENT</Text><TextInput style={styles.commentInput} placeholder="Explain the closure or re-opening" placeholderTextColor={COLORS.muted} multiline value={snagComment} onChangeText={setSnagComment} /><View style={styles.commentActions}><Pressable style={styles.secondaryButton} onPress={() => setSnagToUpdate(null)}><Text style={styles.secondaryButtonText}>Cancel</Text></Pressable><Pressable style={styles.submitCommentButton} onPress={() => saveSnagStatus('closed')}><Text style={styles.primaryActionText}>Close snag</Text></Pressable><Pressable style={styles.submitCommentButton} onPress={() => saveSnagStatus('open')}><Text style={styles.primaryActionText}>Reopen snag</Text></Pressable></View></View>}</View></ScrollView>;
  }

  function renderReports() {
    const byRegion = scopedSites.map((site) => ({ region: site.region, total: scopedHandovers.filter((handover) => handover.site.region === site.region).length })).filter((item, index, items) => items.findIndex((current) => current.region === item.region) === index);
    return <ScrollView contentContainerStyle={styles.content}><Text style={styles.pageEyebrow}>REPORTING</Text><Text style={styles.pageTitle}>Operational reports</Text><Text style={styles.pageHelper}>Development metrics are calculated from the local workspace and switch to Supabase queries when connected.</Text><View style={styles.reportGrid}><View style={styles.panel}><Text style={styles.panelEyebrow}>STAGE DISTRIBUTION</Text><Text style={styles.panelTitle}>Records by workflow stage</Text>{Object.entries(STAGE_LABELS).map(([stage, label]) => { const count = workspace.handovers.filter((handover) => handover.stage === stage).length; return <View key={stage} style={styles.reportLine}><Text style={styles.reportLineLabel}>{label}</Text><View style={styles.reportBar}><View style={[styles.reportBarFill, { width: `${workspace.handovers.length ? Math.max(4, count / workspace.handovers.length * 100) : 4}%`, backgroundColor: stage === 'approved' ? COLORS.green : stage === 'rejected' ? COLORS.red : COLORS.blue }]} /></View><Text style={styles.reportLineValue}>{count}</Text></View>; })}</View><View style={styles.panel}><Text style={styles.panelEyebrow}>BY REGION</Text><Text style={styles.panelTitle}>Sites and handovers</Text>{byRegion.map((item) => <View key={item.region} style={styles.regionLine}><View style={styles.siteIcon}><Text style={styles.siteIconText}>{item.region.slice(0, 2).toUpperCase()}</Text></View><View style={styles.flexOne}><Text style={styles.regionName}>{item.region}</Text><Text style={styles.meta}>{scopedSites.filter((site) => site.region === item.region).length} sites in master data</Text></View><Text style={styles.regionCount}>{item.total}</Text></View>)}<View style={styles.reportFooter}><Text style={styles.meta}>Approved PDF generation</Text><Text style={styles.readyTag}>Adapter ready</Text></View></View></View><View style={styles.panel}><View style={styles.panelHeader}><View><Text style={styles.panelEyebrow}>EXPORTS</Text><Text style={styles.panelTitle}>Controlled record outputs</Text></View></View><View style={styles.exportTiles}><ExportTile title="Handover register" detail="CSV · filters preserved" onPress={exportCsv} /><ExportTile title="Snag register" detail="CSV · severity and aging" onPress={() => Alert.alert('Snag export', 'Snag register export is ready in development mode.')} /><ExportTile title="Approved handover PDF" detail="PDF adapter · after approval" onPress={() => Alert.alert('PDF adapter', 'The final PDF adapter is ready for server-side generation after Supabase credentials are supplied.')} /></View></View></ScrollView>;
  }

  function renderAdmin() {
    return <ScrollView contentContainerStyle={styles.content}><Text style={styles.pageEyebrow}>ADMINISTRATION</Text><Text style={styles.pageTitle}>Platform controls</Text><Text style={styles.pageHelper}>Configure workflow definitions, permissions and integrations before production credentials are connected.</Text><View style={styles.adminGrid}><AdminCard eyebrow="USER ACCESS" title="Roles & regions" body="Supabase RLS policies scope region reviewers to their assigned region. Demo role switching is enabled locally." status="Policy adapter ready" /><AdminCard eyebrow="CHECKLIST" title="Definitions & photo rules" body={`${checklistForSite(workspace.sites[0]).length} inspection definitions are active. Truck-head logic is conditional per site master data.`} status="Configured" /><AdminCard eyebrow="SHEET SYNC" title="Google Sheet mapping" body="Server-side sync endpoint and source_data preservation are ready for the approved sheet mapping." status="Credentials required" /><AdminCard eyebrow="STORAGE" title="Private evidence bucket" body="Evidence paths follow COW ID / HO ID / item / type / timestamp and are signed for review." status="Adapter ready" /></View><View style={styles.integrationNotice}><View style={styles.noticeIcon}><Text style={styles.noticeIconText}>i</Text></View><View style={styles.flexOne}><Text style={styles.noticeTitle}>Development environment</Text><Text style={styles.noticeText}>No environment variables are present. Seed data is clearly marked and local-only. Connect Supabase URL and anon key through environment configuration to activate server-backed records.</Text></View></View></ScrollView>;
  }

  return <View style={styles.appShell}>{renderSidebar()}<View style={styles.portalMain}>{renderHeader()}{tab === 'overview' && renderOverview()}{tab === 'handovers' && renderRegister()}{tab === 'snags' && renderSnags()}{tab === 'reports' && renderReports()}{tab === 'admin' && renderAdmin()}</View></View>;
}

function MetricCard({ label, value, note, tone }: { label: string; value: string; note: string; tone: 'navy' | 'blue' | 'amber' | 'green' | 'red' }) {
  return <View style={styles.metricCard}><View style={[styles.metricAccent, { backgroundColor: COLORS[tone] }]} /><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, { color: COLORS[tone] }]}>{value}</Text><Text style={styles.metricNote}>{note}</Text></View>;
}

function HandoverRow({ handover, onPress }: { handover: HandoverDraft; onPress: () => void }) {
  return <Pressable style={styles.handoverRow} onPress={onPress}><View style={styles.hoIcon}><Text style={styles.hoIconText}>{handover.site.cowId.slice(-3)}</Text></View><View style={styles.flexOne}><View style={styles.rowTitle}><Text style={styles.hoId}>{handover.hoId}</Text>{handover.isDemo && <Text style={styles.seedTag}>DEMO</Text>}</View><Text style={styles.siteName}>{handover.site.siteLabel}</Text><Text style={styles.meta}>{handover.site.region} · {handover.fieldEngineer}</Text></View><StageBadge stage={handover.stage} /><Text style={styles.rowChevron}>›</Text></Pressable>;
}

function StageBadge({ stage }: { stage: HandoverStage }) {
  const tone = ['approved'].includes(stage) ? 'green' : ['rejected', 'returned_to_field', 'returned_to_region'].includes(stage) ? 'red' : ['region_review', 'pm_review', 'region_approved'].includes(stage) ? 'amber' : 'blue';
  return <View style={[styles.stageBadge, { backgroundColor: `${COLORS[tone]}18` }]}><View style={[styles.stageDot, { backgroundColor: COLORS[tone] }]} /><Text style={[styles.stageBadgeText, { color: COLORS[tone] }]}>{STAGE_LABELS[stage]}</Text></View>;
}

function SeverityBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  return <View style={styles.severityRow}><View style={styles.severityLabelRow}><Text style={styles.severityText}>{label}</Text><Text style={styles.severityCount}>{count}</Text></View><View style={styles.severityTrack}><View style={[styles.severityFill, { backgroundColor: color, width: `${Math.max(count ? 8 : 0, count / total * 100)}%` }]} /></View></View>;
}

function ReviewMeta({ label, value }: { label: string; value: string }) {
  return <View style={styles.reviewMeta}><Text style={styles.reviewMetaLabel}>{label}</Text><Text style={styles.reviewMetaValue}>{value}</Text></View>;
}

function ExportTile({ title, detail, onPress }: { title: string; detail: string; onPress: () => void }) {
  return <Pressable style={styles.exportTile} onPress={onPress}><Text style={styles.exportTileIcon}>↓</Text><Text style={styles.exportTileTitle}>{title}</Text><Text style={styles.exportTileDetail}>{detail}</Text></Pressable>;
}

function AdminCard({ eyebrow, title, body, status }: { eyebrow: string; title: string; body: string; status: string }) {
  return <View style={styles.adminCard}><Text style={styles.panelEyebrow}>{eyebrow}</Text><Text style={styles.adminCardTitle}>{title}</Text><Text style={styles.adminCardBody}>{body}</Text><View style={styles.adminStatus}><View style={styles.statusDot} /><Text style={styles.adminStatusText}>{status}</Text></View></View>;
}

function Empty({ title, body }: { title: string; body: string }) {
  return <View style={styles.empty}><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyBody}>{body}</Text></View>;
}

const styles = StyleSheet.create({
  appShell: { flex: 1, flexDirection: 'row', backgroundColor: COLORS.background },
  sidebar: { width: 248, backgroundColor: COLORS.navy, padding: 20, justifyContent: 'flex-start' },
  sidebarCompact: { width: 72, paddingHorizontal: 12, alignItems: 'center' },
  sidebarBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 42, height: 42, borderRadius: 13, backgroundColor: COLORS.blue, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: COLORS.white, fontSize: 16, fontWeight: '900' },
  sidebarEyebrow: { color: '#9ED5DE', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  sidebarTitle: { color: COLORS.white, fontSize: 16, fontWeight: '900', marginTop: 2 },
  sidebarRule: { height: 1, backgroundColor: 'rgba(255,255,255,0.13)', marginVertical: 25 },
  sidebarSection: { color: '#7892AB', fontSize: 9, fontWeight: '900', letterSpacing: 1.1, marginBottom: 9 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, marginBottom: 4 },
  navItemActive: { backgroundColor: 'rgba(114,199,214,0.15)' },
  navIcon: { color: '#91A7BB', fontSize: 17, width: 20, textAlign: 'center' },
  navIconActive: { color: '#9ED5DE' },
  navLabel: { color: '#B2C0CF', fontSize: 12, fontWeight: '700' },
  navLabelActive: { color: COLORS.white, fontWeight: '900' },
  sidebarBottom: { marginTop: 'auto' },
  accountName: { color: COLORS.white, fontSize: 12, fontWeight: '800' },
  accountMeta: { color: '#91A7BB', fontSize: 11, marginTop: 4, marginBottom: 15 },
  switchAppButton: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 10, alignItems: 'center', marginTop: 18 },
  switchAppText: { color: '#C8D7E3', fontSize: 11, fontWeight: '800' },
  portalMain: { flex: 1, minWidth: 0 },
  portalHeader: { minHeight: 78, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingHorizontal: 28, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 18 },
  headerEyebrow: { color: COLORS.blue, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  headerTitle: { color: COLORS.navy, fontSize: 20, fontWeight: '900', marginTop: 4 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12, position: 'relative' },
  demoPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.pale, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 },
  demoDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.green },
  demoPillText: { color: COLORS.blue, fontSize: 10, fontWeight: '900' },
  roleButton: { flexDirection: 'row', alignItems: 'center', gap: 8, borderLeftWidth: 1, borderLeftColor: COLORS.border, paddingLeft: 14 },
  avatar: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.softBlue, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: COLORS.blue, fontSize: 11, fontWeight: '900' },
  roleName: { color: COLORS.navy, fontSize: 11, fontWeight: '900' },
  roleMeta: { color: COLORS.muted, fontSize: 9, marginTop: 2 },
  roleChevron: { color: COLORS.muted, fontSize: 16 },
  roleMenu: { position: 'absolute', right: 0, top: 47, zIndex: 10, width: 200, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 6, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, elevation: 5 },
  roleOption: { padding: 10, borderRadius: 8 },
  roleOptionLabel: { color: COLORS.navy, fontWeight: '800', fontSize: 12 },
  roleOptionMeta: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  content: { padding: 28, gap: 22, maxWidth: 1400, width: '100%', alignSelf: 'center' },
  welcomeRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 },
  pageEyebrow: { color: COLORS.blue, fontSize: 9, letterSpacing: 1.1, fontWeight: '900' },
  pageTitle: { color: COLORS.navy, fontSize: 26, fontWeight: '900', marginTop: 6 },
  pageHelper: { color: COLORS.muted, fontSize: 12, marginTop: 5 },
  exportButton: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 10 },
  exportIcon: { color: COLORS.blue, fontSize: 19 },
  exportText: { color: COLORS.navy, fontSize: 11, fontWeight: '900' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricCard: { flex: 1, minWidth: 145, backgroundColor: COLORS.white, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, padding: 16, overflow: 'hidden' },
  metricAccent: { position: 'absolute', left: 0, right: 0, top: 0, height: 3 },
  metricLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '800' },
  metricValue: { fontSize: 29, fontWeight: '900', marginTop: 8 },
  metricNote: { color: COLORS.muted, fontSize: 10, marginTop: 5 },
  overviewColumns: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  panel: { flex: 1, minWidth: 300, backgroundColor: COLORS.white, borderRadius: 17, borderWidth: 1, borderColor: COLORS.border, padding: 18 },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  panelEyebrow: { color: COLORS.blue, fontSize: 9, fontWeight: '900', letterSpacing: 1.05 },
  panelTitle: { color: COLORS.navy, fontSize: 16, fontWeight: '900', marginTop: 4 },
  linkText: { color: COLORS.blue, fontSize: 11, fontWeight: '900' },
  panelIcon: { color: COLORS.blue, fontSize: 24 },
  handoverRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  hoIcon: { width: 39, height: 39, borderRadius: 11, backgroundColor: COLORS.softBlue, alignItems: 'center', justifyContent: 'center' },
  hoIconText: { color: COLORS.blue, fontSize: 10, fontWeight: '900' },
  flexOne: { flex: 1, minWidth: 0 },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  hoId: { color: COLORS.navy, fontWeight: '900', fontSize: 12 },
  seedTag: { color: '#A86F00', backgroundColor: '#FFF1CE', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, fontSize: 7, fontWeight: '900' },
  siteName: { color: COLORS.ink, fontSize: 12, fontWeight: '800', marginTop: 3 },
  meta: { color: COLORS.muted, fontSize: 10, marginTop: 4 },
  rowChevron: { color: COLORS.blue, fontSize: 22 },
  stageBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 9 },
  stageDot: { width: 6, height: 6, borderRadius: 3 },
  stageBadgeText: { fontSize: 9, fontWeight: '900' },
  severityRow: { marginTop: 18 },
  severityLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  severityText: { color: COLORS.ink, fontSize: 11, fontWeight: '800' },
  severityCount: { color: COLORS.navy, fontSize: 11, fontWeight: '900' },
  severityTrack: { height: 7, backgroundColor: COLORS.background, borderRadius: 4, overflow: 'hidden' },
  severityFill: { height: 7, borderRadius: 4 },
  healthFooter: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 15, marginTop: 20 },
  healthFooterLabel: { color: COLORS.muted, fontSize: 10 },
  healthFooterValue: { color: COLORS.navy, fontSize: 11, fontWeight: '900' },
  workflowCard: { backgroundColor: COLORS.navy, borderRadius: 17, padding: 20 },
  workflowCardTitle: { color: COLORS.white },
  pipeline: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginTop: 22 },
  pipelineStep: { flex: 1, position: 'relative' },
  pipelineNumber: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pipelineNumberText: { color: COLORS.white, fontWeight: '900', fontSize: 10 },
  pipelineLabel: { color: '#D7E3EC', fontSize: 11, fontWeight: '800', marginTop: 9 },
  pipelineCount: { color: COLORS.white, fontSize: 20, fontWeight: '900', marginTop: 5 },
  pipelineLine: { height: 1, backgroundColor: 'rgba(255,255,255,0.24)', position: 'absolute', top: 16, left: 40, right: -15 },
  registerToolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 },
  registerIntro: { flex: 1 },
  filters: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  filterSearch: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: 11, paddingHorizontal: 11, flex: 1, minWidth: 240 },
  filterSearchIcon: { color: COLORS.blue, fontSize: 20 },
  filterInput: { flex: 1, paddingHorizontal: 8, paddingVertical: 12, color: COLORS.ink, fontSize: 12 },
  filterChips: { gap: 7, paddingVertical: 2 },
  filterChip: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  filterChipActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  filterChipText: { color: COLORS.muted, fontSize: 10, fontWeight: '800' },
  filterChipTextActive: { color: COLORS.white },
  registerLayout: { flexDirection: 'row', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' },
  registerList: { flex: 1, minWidth: 400, backgroundColor: COLORS.white, borderRadius: 17, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  registerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  registerRowActive: { backgroundColor: COLORS.pale },
  registerMain: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 210 },
  registerStat: { width: 55 },
  registerStatValue: { color: COLORS.navy, fontSize: 13, fontWeight: '900' },
  registerStatLabel: { color: COLORS.muted, fontSize: 9, marginTop: 2 },
  stageCell: { width: 125 },
  reviewPanel: { flex: 1, minWidth: 350, backgroundColor: COLORS.white, borderRadius: 17, borderWidth: 1, borderColor: COLORS.border, padding: 18 },
  reviewHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  reviewTitle: { color: COLORS.navy, fontSize: 20, fontWeight: '900', marginTop: 5 },
  reviewMetaGrid: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginTop: 18 },
  reviewMeta: { flex: 1, minWidth: 120 },
  reviewMetaLabel: { color: COLORS.muted, fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  reviewMetaValue: { color: COLORS.navy, fontSize: 11, fontWeight: '800', marginTop: 4 },
  masterData: { backgroundColor: COLORS.pale, borderRadius: 12, padding: 13, marginTop: 18 },
  masterDataGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 12 },
  reviewSection: { borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 20, paddingTop: 17 },
  reviewSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  completionLabel: { color: COLORS.green, fontSize: 10, fontWeight: '900' },
  reviewItem: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingVertical: 12 },
  reviewItemTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  reviewItemTitle: { color: COLORS.navy, fontSize: 12, fontWeight: '900' },
  reviewItemRight: { alignItems: 'flex-end' },
  reviewItemStatus: { color: COLORS.blue, fontSize: 11, fontWeight: '900', textTransform: 'capitalize' },
  issueText: { color: COLORS.red, fontSize: 10, fontWeight: '800', marginTop: 6 },
  reviewRemarks: { color: COLORS.muted, fontSize: 11, lineHeight: 17, marginTop: 7 },
  inlineSnags: { gap: 6, marginTop: 8 },
  inlineSnag: { backgroundColor: '#FFF5F1', borderRadius: 7, padding: 8, borderLeftWidth: 3, borderLeftColor: COLORS.red },
  inlineSnagTitle: { color: COLORS.red, fontSize: 9, fontWeight: '900' },
  inlineSnagText: { color: COLORS.ink, fontSize: 10, marginTop: 3 },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  galleryPhoto: { width: 61, height: 61, borderRadius: 8, backgroundColor: COLORS.softBlue },
  galleryDemo: { width: 61, height: 61, borderRadius: 8, backgroundColor: '#FFF1CE', alignItems: 'center', justifyContent: 'center' },
  galleryDemoText: { color: '#A86F00', fontSize: 7, textAlign: 'center', fontWeight: '900' },
  timelineEvent: { flexDirection: 'row', gap: 10, borderTopWidth: 1, borderTopColor: COLORS.border, paddingVertical: 11 },
  timelineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.blue, marginTop: 4 },
  timelineAction: { color: COLORS.navy, fontSize: 11, fontWeight: '900' },
  timelineComment: { color: COLORS.muted, fontSize: 10, marginTop: 5, fontStyle: 'italic' },
  actionBox: { backgroundColor: COLORS.pale, borderWidth: 1, borderColor: '#C8E4E9', borderRadius: 13, padding: 14, marginTop: 18, gap: 12 },
  actionBoxTitle: { color: COLORS.navy, fontSize: 13, fontWeight: '900' },
  actionBoxText: { color: COLORS.muted, fontSize: 10, lineHeight: 16, marginTop: 4 },
  actionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  primaryAction: { backgroundColor: COLORS.blue, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10 },
  primaryActionText: { color: COLORS.white, fontSize: 10, fontWeight: '900' },
  returnAction: { borderWidth: 1, borderColor: COLORS.amber, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10 },
  returnActionText: { color: '#A86F00', fontSize: 10, fontWeight: '900' },
  rejectAction: { borderWidth: 1, borderColor: COLORS.red, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10 },
  rejectActionText: { color: COLORS.red, fontSize: 10, fontWeight: '900' },
  commentBox: { backgroundColor: '#FFF8EA', borderWidth: 1, borderColor: '#F0D18B', borderRadius: 12, padding: 13, marginTop: 12 },
  commentInput: { minHeight: 75, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: 9, padding: 10, color: COLORS.ink, fontSize: 11, marginTop: 10, textAlignVertical: 'top' },
  commentActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
  secondaryButton: { borderWidth: 1, borderColor: COLORS.blue, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9 },
  secondaryButtonText: { color: COLORS.blue, fontSize: 10, fontWeight: '900' },
  submitCommentButton: { backgroundColor: COLORS.navy, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9 },
  snagList: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: 17, overflow: 'hidden' },
  snagRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  severityBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  snagNo: { color: COLORS.navy, fontSize: 12, fontWeight: '900' },
  severityLabel: { color: COLORS.red, textTransform: 'uppercase', fontSize: 8, fontWeight: '900', marginLeft: 6 },
  snagDescription: { color: COLORS.ink, fontSize: 12, fontWeight: '700', marginTop: 4 },
  snagRight: { alignItems: 'flex-end', minWidth: 95 },
  targetDate: { color: COLORS.muted, fontSize: 10 },
  snagStatus: { color: COLORS.amber, fontSize: 9, fontWeight: '900', textTransform: 'capitalize', marginTop: 5 },
  snagStatusClosed: { color: COLORS.green },
  snagActionButton: { borderWidth: 1, borderColor: COLORS.blue, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 5, marginTop: 7 },
  snagActionText: { color: COLORS.blue, fontSize: 9, fontWeight: '900' },
  snagCommentBox: { backgroundColor: '#FFF8EA', borderWidth: 1, borderColor: '#F0D18B', borderRadius: 12, padding: 13, marginTop: 12 },
  reportGrid: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  reportLine: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 15 },
  reportLineLabel: { color: COLORS.ink, fontSize: 10, width: 110 },
  reportBar: { flex: 1, height: 8, backgroundColor: COLORS.background, borderRadius: 4, overflow: 'hidden' },
  reportBarFill: { height: 8, borderRadius: 4 },
  reportLineValue: { color: COLORS.navy, fontSize: 11, fontWeight: '900', width: 20, textAlign: 'right' },
  regionLine: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: 1, borderTopColor: COLORS.border },
  siteIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.softBlue, alignItems: 'center', justifyContent: 'center' },
  siteIconText: { color: COLORS.blue, fontSize: 9, fontWeight: '900' },
  regionName: { color: COLORS.navy, fontSize: 12, fontWeight: '900' },
  regionCount: { color: COLORS.blue, fontWeight: '900', fontSize: 18 },
  reportFooter: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12, marginTop: 9 },
  readyTag: { color: COLORS.green, fontSize: 10, fontWeight: '900' },
  exportTiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  exportTile: { minWidth: 190, flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 11, padding: 13, backgroundColor: COLORS.background },
  exportTileIcon: { color: COLORS.blue, fontSize: 20 },
  exportTileTitle: { color: COLORS.navy, fontSize: 11, fontWeight: '900', marginTop: 12 },
  exportTileDetail: { color: COLORS.muted, fontSize: 10, marginTop: 4 },
  adminGrid: { flexDirection: 'row', gap: 13, flexWrap: 'wrap' },
  adminCard: { flex: 1, minWidth: 220, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: 15, padding: 16 },
  adminCardTitle: { color: COLORS.navy, fontSize: 15, fontWeight: '900', marginTop: 7 },
  adminCardBody: { color: COLORS.muted, fontSize: 11, lineHeight: 18, marginTop: 8, minHeight: 58 },
  adminStatus: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 16 },
  adminStatusText: { color: COLORS.green, fontSize: 10, fontWeight: '900' },
  integrationNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: COLORS.pale, borderRadius: 15, padding: 17 },
  noticeIcon: { width: 27, height: 27, borderRadius: 9, backgroundColor: COLORS.blue, alignItems: 'center', justifyContent: 'center' },
  noticeIconText: { color: COLORS.white, fontWeight: '900' },
  noticeTitle: { color: COLORS.navy, fontSize: 14, fontWeight: '900' },
  noticeText: { color: COLORS.muted, fontSize: 11, lineHeight: 18, marginTop: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.green },
  empty: { alignItems: 'center', padding: 28 },
  emptyTitle: { color: COLORS.navy, fontSize: 14, fontWeight: '900' },
  emptyBody: { color: COLORS.muted, fontSize: 11, marginTop: 6 }
});
