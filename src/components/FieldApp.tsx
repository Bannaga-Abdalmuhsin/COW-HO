import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from 'react-native';
import { categoriesForSite, categoryShortLabels, checklistForSite } from '../checklist';
import { createAuditEvent, validateHandover } from '../domain/workflow';
import { PlanVsActual } from './PlanVsActual';
import { HandoverDraft, EvidencePhoto, InspectionItem, ItemAvailability, ItemStatus, Site, SnagSeverity, WorkspaceState } from '../types';

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

const AVAILABILITY_OPTIONS: { value: ItemAvailability; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'missing', label: 'Missing' },
  { value: 'not_applicable', label: 'N/A' }
];

const STATUS_OPTIONS: { value: ItemStatus; label: string }[] = [
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'defective', label: 'Defective' },
  { value: 'damaged', label: 'Damaged' }
];

const DRAFT_KEY = 'cow-ho:draft-ids:v2';

type FieldAppProps = {
  workspace: WorkspaceState;
  activeHandoverId: string | null;
  onSetActiveHandover: (id: string | null) => void;
  onCreateHandover: (site: Site) => HandoverDraft;
  onUpdateHandover: (id: string, updater: (handover: HandoverDraft) => HandoverDraft) => void;
  onChangeMode: () => void;
};

export function FieldApp({ workspace, activeHandoverId, onSetActiveHandover, onCreateHandover, onUpdateHandover, onChangeMode }: FieldAppProps) {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [view, setView] = useState<'home' | 'sites' | 'inspection'>('home');
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [cameraItemKey, setCameraItemKey] = useState<string | null>(null);
  const [snagItemKey, setSnagItemKey] = useState<string | null>(null);
  const [snagText, setSnagText] = useState('');
  const [snagSeverity, setSnagSeverity] = useState<SnagSeverity>('minor');
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const availableSites = workspace.sites.filter((site) => ['admin', 'project_manager', 'viewer'].includes(workspace.currentRole) || site.region === workspace.currentRegion);
  const draft = workspace.handovers.find((handover) => handover.id === activeHandoverId) || null;
  const filteredSites = availableSites.filter((site) =>
    [site.cowId, site.siteLabel, site.city, site.region, site.vehiclePlate || ''].some((value) => value.toLowerCase().includes(query.trim().toLowerCase()))
  );
  const definitions = draft ? checklistForSite(draft.site) : [];
  const categories = draft ? categoriesForSite(draft.site) : [];
  const visibleDefinitions = definitions.filter((definition) => definition.category === (activeCategory || categories[0]));
  const validation = draft ? validateHandover(draft) : null;
  const draftRecords = workspace.handovers.filter((handover) => ['draft', 'returned_to_field'].includes(handover.stage));
  const submittedRecords = workspace.handovers.filter((handover) => !['draft', 'returned_to_field', 'approved', 'cancelled'].includes(handover.stage));

  useEffect(() => {
    if (draft && !activeCategory) setActiveCategory(categories[0] || '');
  }, [activeCategory, categories, draft]);

  function openInspection(id: string) {
    const next = workspace.handovers.find((handover) => handover.id === id);
    if (!next || next.locked) return;
    onSetActiveHandover(id);
    setActiveCategory(categoriesForSite(next.site)[0] || '');
    setView('inspection');
  }

  function updateItem(itemKey: string, changes: Partial<InspectionItem>) {
    if (!draft || draft.locked) return;
    onUpdateHandover(draft.id, (current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      items: { ...current.items, [itemKey]: { ...current.items[itemKey], ...changes } }
    }));
  }

  async function saveDraft() {
    if (!draft) return;
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify([...workspace.handovers.filter((item) => item.stage === 'draft').map((item) => item.id), draft.id]));
    onUpdateHandover(draft.id, (current) => ({ ...current, updatedAt: new Date().toISOString() }));
    Alert.alert('Draft saved', `${draft.hoId} is stored locally and marked for sync.`);
  }

  async function openCamera(itemKey: string) {
    if (Platform.OS === 'web') {
      setCameraItemKey(itemKey);
      return;
    }
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera required', 'Camera permission is required for handover evidence.');
        return;
      }
    }
    setCameraItemKey(itemKey);
  }

  async function captureEvidence() {
    if (!draft || !cameraItemKey) return;
    let uri = `demo://camera/${draft.hoId}/${cameraItemKey}/${Date.now()}`;
    let coordinates: Pick<EvidencePhoto, 'latitude' | 'longitude'> = {};
    if (Platform.OS !== 'web' && cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.75, exif: false });
      if (photo?.uri) uri = photo.uri;
      const locationPermission = await Location.requestForegroundPermissionsAsync();
      if (locationPermission.granted) {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        coordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      }
    }
    const item = cameraItemKey === 'general' ? undefined : draft.items[cameraItemKey];
    const evidence: EvidencePhoto = {
      id: `${draft.hoId}-${cameraItemKey}-${Date.now()}`,
      uri,
      capturedAt: new Date().toISOString(),
      cowId: draft.site.cowId,
      hoId: draft.hoId,
      itemKey: cameraItemKey,
      evidenceType: cameraItemKey === 'general' ? 'general' : 'item',
      sequence: item ? item.photos.length + 1 : draft.generalPhotos.length + 1,
      uploadState: uri.startsWith('demo://') ? 'demo' : 'pending',
      ...coordinates
    };
    if (item) updateItem(cameraItemKey, { photos: [...item.photos, evidence] });
    else onUpdateHandover(draft.id, (current) => ({ ...current, generalPhotos: [...current.generalPhotos, evidence], updatedAt: new Date().toISOString() }));
    setCameraItemKey(null);
  }

  function captureAllDemoEvidence() {
    if (!draft) return;
    const now = new Date().toISOString();
    const nextItems = Object.fromEntries(definitions.map((definition) => {
      const current = draft.items[definition.key];
      const photos = Array.from({ length: definition.requiredPhotos }, (_, index) => ({
        id: `${draft.hoId}-${definition.key}-demo-${index}`,
        uri: `demo://camera/${draft.hoId}/${definition.key}/${index}`,
        capturedAt: now,
        cowId: draft.site.cowId,
        hoId: draft.hoId,
        itemKey: definition.key,
        evidenceType: 'item' as const,
        sequence: index + 1,
        uploadState: 'demo' as const,
        caption: 'Development seed capture'
      }));
      return [definition.key, {
        ...current,
        availability: 'available' as const,
        status: 'good' as const,
        quantity: current.quantity || '1',
        workingQuantity: current.workingQuantity || '1',
        brand: current.brand || 'Verified on site',
        model: current.model || 'Field verified',
        photos
      }];
    }));
    onUpdateHandover(draft.id, (current) => ({ ...current, items: nextItems, declarationConfirmed: true, updatedAt: now }));
    Alert.alert('Demo evidence added', 'Every required item now has development-labelled camera captures. Review the declaration before submitting.');
  }

  function addSnag() {
    if (!draft || !snagItemKey || !snagText.trim()) return;
    const definition = definitions.find((item) => item.key === snagItemKey);
    const item = draft.items[snagItemKey];
    const snagNumber = Object.values(draft.items).reduce((count, current) => count + current.snags.length, 0) + 1;
    const snag = {
      id: `${draft.hoId}-snag-${snagNumber}`,
      snagNo: `SN-${String(snagNumber).padStart(3, '0')}`,
      itemKey: snagItemKey,
      category: definition?.category || 'General',
      description: snagText.trim(),
      quantity: '1',
      severity: snagSeverity,
      assignee: 'Site maintenance team',
      requiredAction: 'Rectify and upload closure evidence',
      targetDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      status: 'open' as const,
      photos: [],
      rectificationPhotos: []
    };
    updateItem(snagItemKey, { snags: [...item.snags, snag] });
    if (snagSeverity === 'critical') updateItem(snagItemKey, { availability: 'available', status: 'defective', snags: [...item.snags, snag] });
    setSnagText('');
    setSnagSeverity('minor');
    setSnagItemKey(null);
  }

  function submitHandover() {
    if (!draft || !validation) return;
    if (!validation.valid) {
      Alert.alert('Handover is incomplete', validation.issues.slice(0, 3).map((issue) => issue.message).join('\n'));
      return;
    }
    const now = new Date().toISOString();
    onUpdateHandover(draft.id, (current) => ({
      ...current,
      stage: 'field_submitted',
      submittedAt: now,
      updatedAt: now,
      audit: [...current.audit, createAuditEvent(current.id, current.fieldEngineer, 'field_team', 'Submitted for Region Team review', current.stage, 'field_submitted')]
    }));
    Alert.alert('Submitted for review', `${draft.hoId} is now queued for the Region Team.`);
    setView('home');
    onSetActiveHandover(null);
  }

  function renderHome() {
    const pendingUploads = workspace.handovers.flatMap((handover) => Object.values(handover.items).flatMap((item) => item.photos)).filter((photo) => photo.uploadState === 'pending').length;
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.mobileTopbar}>
          <BrandMark />
          <View style={styles.topbarActions}>
            <View style={styles.demoPill}><View style={styles.demoDot} /><Text style={styles.demoPillText}>Development mode</Text></View>
            <Pressable style={styles.modeButton} onPress={onChangeMode}><Text style={styles.modeButtonText}>Approval portal →</Text></Pressable>
          </View>
        </View>
        <View style={[styles.hero, compact && styles.heroCompact]}>
          <View style={styles.heroCopyBlock}>
            <Text style={styles.eyebrow}>FIELD OPERATIONS / HANDOVER DESK</Text>
            <Text style={styles.heroTitle}>Capture. Verify.{'\n'}Hand over.</Text>
            <Text style={styles.heroCopy}>Equipment condition, counts, camera evidence and snags in one structured record.</Text>
            <Pressable style={styles.primaryButton} onPress={() => setView('sites')}><Text style={styles.primaryButtonText}>+ Start new handover</Text></Pressable>
          </View>
          <View style={styles.heroPanel}>
            <Text style={styles.heroPanelLabel}>TODAY'S FIELD QUEUE</Text>
            <Text style={styles.heroPanelValue}>{draftRecords.length + submittedRecords.length}</Text>
            <Text style={styles.heroPanelHint}>records in progress</Text>
            <View style={styles.heroRule} />
            <View style={styles.heroStat}><Text style={styles.heroStatLabel}>Sync status</Text><Text style={styles.heroStatValue}>Local queue</Text></View>
            <View style={styles.heroStat}><Text style={styles.heroStatLabel}>Region</Text><Text style={styles.heroStatValue}>{workspace.currentRegion || 'All regions'}</Text></View>
          </View>
        </View>
        <View style={styles.sectionHeading}><View><Text style={styles.sectionEyebrow}>MY WORK</Text><Text style={styles.sectionTitle}>Keep every handover moving</Text></View><Text style={styles.sectionHelper}>Offline-ready workspace</Text></View>
        <View style={styles.summaryGrid}>
          <SummaryCard value={String(draftRecords.length)} label="My drafts" tone="navy" onPress={() => draftRecords[0] && openInspection(draftRecords[0].id)} />
          <SummaryCard value={String(workspace.handovers.filter((item) => item.stage === 'returned_to_field').length)} label="Returned to me" tone="amber" />
          <SummaryCard value={String(submittedRecords.length)} label="Submitted" tone="blue" />
          <SummaryCard value={String(pendingUploads)} label="Pending upload" tone="green" />
        </View>
        <PlanVsActual plan={workspace.plan} handovers={workspace.handovers} region={workspace.currentRegion || undefined} compact={compact} />
        <View style={styles.contentSplit}>
          <View style={styles.whitePanel}>
            <View style={styles.panelHeader}><View><Text style={styles.panelEyebrow}>RECENT SITES</Text><Text style={styles.panelTitle}>Continue where you left off</Text></View><Pressable onPress={() => setView('sites')}><Text style={styles.linkText}>View all</Text></Pressable></View>
            {availableSites.map((site) => {
              const latest = workspace.handovers.find((handover) => handover.site.id === site.id);
              return <Pressable key={site.id} style={styles.recentSite} onPress={() => latest ? openInspection(latest.id) : setView('sites')}><View style={styles.siteIcon}><Text style={styles.siteIconText}>{site.cowId.slice(-3)}</Text></View><View style={styles.flexOne}><Text style={styles.siteId}>{site.cowId}</Text><Text style={styles.siteName}>{site.siteLabel}</Text><Text style={styles.meta}>{site.region} · {site.city} · {site.siteStatus}</Text></View><Text style={styles.chevron}>›</Text></Pressable>;
            })}
          </View>
          <View style={styles.noticePanel}><View style={styles.noticeIcon}><Text style={styles.noticeIconText}>i</Text></View><Text style={styles.noticeTitle}>{workspace.plan.source === 'migration_required' ? 'Supabase migration required' : workspace.isDemoMode ? 'Local draft mode' : 'Supabase workspace'}</Text><Text style={styles.noticeText}>{workspace.plan.notice}</Text><View style={styles.noticeFooter}><View style={styles.statusDot} /><Text style={styles.noticeFooterText}>{workspace.plan.source === 'supabase' ? 'Plan synced' : 'Plan preview ready'}</Text></View></View>
        </View>
        <View style={styles.workflowStrip}><Text style={styles.workflowLabel}>WORKFLOW</Text><WorkflowStep number="01" label="Field capture" active /><WorkflowStep number="02" label="Region review" /><WorkflowStep number="03" label="PM approval" /><WorkflowStep number="04" label="Locked record" /></View>
        {workspace.isDemoMode && <Pressable style={styles.demoShortcut} onPress={() => { setView('sites'); }}><View><Text style={styles.demoShortcutEyebrow}>DEMO WORKFLOW</Text><Text style={styles.demoShortcutTitle}>Create a record, then approve it in the portal</Text><Text style={styles.demoShortcutText}>Use development capture to fill required evidence in one tap, then switch roles to exercise the full review chain.</Text></View><Text style={styles.demoShortcutArrow}>→</Text></Pressable>}
      </ScrollView>
    );
  }

  function renderSites() {
    return <ScrollView contentContainerStyle={styles.page}><ScreenHeader title="Select a COW site" subtitle="Choose the master record before starting a new inspection." onBack={() => setView('home')} /><View style={styles.searchWrap}><Text style={styles.searchIcon}>⌕</Text><TextInput style={styles.searchInput} placeholder="Search COW ID, site, city, region or plate" placeholderTextColor={COLORS.muted} value={query} onChangeText={setQuery} autoCapitalize="characters" /></View><View style={styles.siteList}>{filteredSites.map((site) => <Pressable key={site.id} style={styles.siteCard} onPress={() => { const next = onCreateHandover(site); onSetActiveHandover(next.id); setActiveCategory(categoriesForSite(site)[0] || ''); setView('inspection'); }}><View style={styles.siteCardTop}><View style={styles.siteIcon}><Text style={styles.siteIconText}>{site.cowId.slice(-3)}</Text></View><View style={styles.flexOne}><Text style={styles.siteId}>{site.cowId}</Text><Text style={styles.siteName}>{site.siteLabel}</Text></View><View style={[styles.statusBadge, site.siteStatus === 'Active' ? styles.statusBadgeGreen : styles.statusBadgeAmber]}><Text style={styles.statusBadgeText}>{site.siteStatus}</Text></View></View><View style={styles.siteDetails}><Text style={styles.meta}>{site.region} · {site.district} · {site.city}</Text><Text style={styles.meta}>{site.vendor} · {site.hasTruckHead ? 'Truck head included' : 'No truck head'}</Text></View><View style={styles.siteCardFooter}><Text style={styles.readOnly}>MASTER DATA · READ ONLY</Text><Text style={styles.openLabel}>Create handover <Text style={styles.chevronSmall}>›</Text></Text></View></Pressable>)}{filteredSites.length === 0 && <EmptyState title="No matching sites" body="Try another COW ID, city or region." />}</View></ScrollView>;
  }

  function renderInspection() {
    if (!draft) return <EmptyState title="No handover selected" body="Choose a site to start." />;
    const currentCategory = activeCategory || categories[0];
    return <View style={styles.inspectionShell}><ScreenHeader title={draft.site.cowId} subtitle={`${draft.hoId} · ${draft.stage === 'draft' ? 'Draft' : draft.stage}`} onBack={() => setView('home')} /><View style={styles.inspectionMeta}><View style={styles.inspectionSite}><Text style={styles.panelTitle}>{draft.site.siteLabel}</Text><Text style={styles.meta}>{draft.site.region} · {draft.site.district} · {draft.site.city}</Text><View style={styles.readOnlyPill}><Text style={styles.readOnly}>MASTER DATA · READ ONLY</Text></View></View><View style={styles.inspectionInfo}><Text style={styles.infoLabel}>FIELD ENGINEER</Text><Text style={styles.infoValue}>{draft.fieldEngineer}</Text><Text style={styles.infoLabel}>GPS / DISTANCE</Text><Text style={styles.infoValue}>{draft.gps ? `${draft.gps.distanceMeters || 0}m from site` : 'Pending capture'}</Text><Pressable style={styles.generalPhotoButton} onPress={() => openCamera('general')}><Text style={styles.generalPhotoButtonText}>+ General site photo</Text></Pressable></View></View><View style={styles.progressBlock}><View style={styles.progressHeader}><Text style={styles.sectionEyebrow}>INSPECTION PROGRESS</Text><Text style={styles.progressValue}>{validation?.completedItems || 0}/{validation?.totalItems || 0} items · {validation ? Math.round((validation.completedItems / validation.totalItems) * 100) : 0}%</Text></View><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${validation ? Math.round((validation.completedItems / validation.totalItems) * 100) : 0}%` }]} /></View></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>{categories.map((category) => { const categoryItems = definitions.filter((definition) => definition.category === category); const categoryComplete = categoryItems.filter((definition) => { const item = draft.items[definition.key]; return item.status !== 'not_checked' && (item.photos.length >= definition.requiredPhotos || item.availability === 'not_applicable'); }).length; return <Pressable key={category} style={[styles.categoryChip, currentCategory === category && styles.categoryChipActive]} onPress={() => setActiveCategory(category)}><Text style={[styles.categoryChipLabel, currentCategory === category && styles.categoryChipLabelActive]}>{categoryShortLabels[category] || category}</Text><Text style={[styles.categoryChipCount, currentCategory === category && styles.categoryChipCountActive]}>{categoryComplete}/{categoryItems.length}</Text></Pressable>; })}</ScrollView><ScrollView contentContainerStyle={styles.itemsList}>{visibleDefinitions.map((definition, index) => { const item = draft.items[definition.key]; const issue = validation?.issues.find((current) => current.itemKey === definition.key); return <View key={definition.key} style={styles.itemCard}><View style={styles.itemHeader}><View style={styles.numberBadge}><Text style={styles.numberText}>{definitions.indexOf(definition) + 1}</Text></View><View style={styles.flexOne}><Text style={styles.itemTitle}>{definition.title}</Text><Text style={styles.photoRequirement}>{item.photos.length}/{definition.requiredPhotos} camera captures · {item.snags.length} snag(s)</Text></View>{item.status !== 'not_checked' && <View style={[styles.itemStatusDot, issue ? styles.itemStatusDotWarning : styles.itemStatusDotGood]} />}</View><Text style={styles.fieldLabel}>AVAILABILITY</Text><View style={styles.optionRow}>{AVAILABILITY_OPTIONS.map((option) => <Pressable key={option.value} style={[styles.optionChip, item.availability === option.value && styles.optionChipActive, option.value === 'missing' && item.availability === option.value && styles.optionChipDanger]} onPress={() => updateItem(definition.key, { availability: option.value })}><Text style={[styles.optionText, item.availability === option.value && styles.optionTextActive]}>{option.label}</Text></Pressable>)}</View><Text style={styles.fieldLabel}>CONDITION STATUS</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>{STATUS_OPTIONS.map((option) => <Pressable key={option.value} style={[styles.optionChip, item.status === option.value && styles.optionChipActive, ['defective', 'damaged'].includes(option.value) && item.status === option.value && styles.optionChipDanger]} onPress={() => updateItem(definition.key, { status: option.value })}><Text style={[styles.optionText, item.status === option.value && styles.optionTextActive]}>{option.label}</Text></Pressable>)}</ScrollView><View style={styles.countRow}><Field label="Installed quantity" value={item.quantity} onChangeText={(value) => updateItem(definition.key, { quantity: value })} /><Field label="Working quantity" value={item.workingQuantity} onChangeText={(value) => updateItem(definition.key, { workingQuantity: value })} /></View><View style={styles.countRow}><Field label="Brand" value={item.brand} onChangeText={(value) => updateItem(definition.key, { brand: value })} textInput /><Field label="Model / serial" value={item.model} onChangeText={(value) => updateItem(definition.key, { model: value })} textInput /></View><TextInput style={styles.remarks} placeholder="Remarks, capacity or structured verification values" placeholderTextColor={COLORS.muted} multiline value={item.remarks} onChangeText={(value) => updateItem(definition.key, { remarks: value })} /><View style={styles.evidenceRow}><View style={styles.evidenceCount}><Text style={styles.evidenceCountValue}>{item.photos.length}</Text><Text style={styles.evidenceCountLabel}>camera captures</Text></View><View style={styles.evidenceThumbs}>{item.photos.slice(0, 3).map((photo) => photo.uri.startsWith('demo://') ? <View key={photo.id} style={styles.demoThumb}><Text style={styles.demoThumbText}>DEMO</Text></View> : <Image key={photo.id} source={{ uri: photo.uri }} style={styles.evidenceThumb} />)}</View><Pressable style={styles.cameraButton} onPress={() => openCamera(definition.key)}><Text style={styles.cameraButtonText}>Open camera</Text></Pressable></View>{item.snags.map((snag) => <View key={snag.id} style={[styles.snagTag, snag.severity === 'critical' && styles.snagTagCritical]}><Text style={styles.snagTagTitle}>{snag.snagNo} · {snag.severity.toUpperCase()}</Text><Text style={styles.snagTagText}>{snag.description}</Text></View>)}<View style={styles.itemFooter}><Text style={styles.itemFooterHint}>{definition.requiredPhotos} required photo{definition.requiredPhotos === 1 ? '' : 's'}</Text><Pressable style={styles.secondaryButton} onPress={() => setSnagItemKey(definition.key)}><Text style={styles.secondaryButtonText}>+ Add snag</Text></Pressable></View></View>; })}<View style={styles.scrollSpacer} /></ScrollView><View style={styles.declarationRow}><Pressable style={[styles.declarationCheck, draft.declarationConfirmed && styles.declarationCheckActive]} onPress={() => onUpdateHandover(draft.id, (current) => ({ ...current, declarationConfirmed: !current.declarationConfirmed, updatedAt: new Date().toISOString() }))}><Text style={styles.declarationCheckText}>{draft.declarationConfirmed ? '✓' : ''}</Text></Pressable><View style={styles.flexOne}><Text style={styles.declarationTitle}>Field declaration</Text><Text style={styles.declarationText}>I confirm these observations and captures were recorded during the site visit.</Text></View></View><View style={styles.bottomBar}><Pressable style={styles.saveButton} onPress={saveDraft}><Text style={styles.saveButtonText}>Save draft</Text></Pressable><Pressable style={styles.submitButton} onPress={submitHandover}><Text style={styles.primaryButtonText}>Review & submit</Text></Pressable></View>{workspace.isDemoMode && <Pressable style={styles.demoFillButton} onPress={captureAllDemoEvidence}><Text style={styles.demoFillButtonText}>Development only · fill required camera evidence</Text></Pressable>}</View>;
  }

  return <View style={styles.safe}>{view === 'home' && renderHome()}{view === 'sites' && renderSites()}{view === 'inspection' && renderInspection()}<Modal visible={Boolean(cameraItemKey)} animationType="slide" onRequestClose={() => setCameraItemKey(null)}><View style={styles.cameraScreen}>{Platform.OS === 'web' ? <View style={styles.cameraPlaceholder}><Text style={styles.cameraPlaceholderEyebrow}>DEVELOPMENT CAMERA PREVIEW</Text><Text style={styles.cameraPlaceholderTitle}>Camera-only evidence capture</Text><Text style={styles.cameraPlaceholderText}>This browser preview records a clearly labelled development capture. Native builds use the Expo camera and location permissions.</Text></View> : <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="back" /> }<View style={styles.cameraTop}><Pressable onPress={() => setCameraItemKey(null)}><Text style={styles.cameraClose}>Cancel</Text></Pressable><Text style={styles.cameraLabel}>Live camera evidence</Text></View><Pressable style={styles.shutter} onPress={captureEvidence}><View style={styles.shutterInner} /></Pressable></View></Modal><Modal visible={Boolean(snagItemKey)} transparent animationType="fade" onRequestClose={() => setSnagItemKey(null)}><View style={styles.modalBackdrop}><View style={styles.modalCard}><Text style={styles.modalEyebrow}>INSPECTION ITEM</Text><Text style={styles.modalTitle}>Add a snag</Text><TextInput style={styles.snagInput} value={snagText} onChangeText={setSnagText} placeholder="Describe the defect, missing item or required action" placeholderTextColor={COLORS.muted} multiline autoFocus /><Text style={styles.fieldLabel}>SEVERITY</Text><View style={styles.optionRow}>{(['minor', 'major', 'critical'] as const).map((severity) => <Pressable key={severity} style={[styles.optionChip, snagSeverity === severity && styles.optionChipActive, severity === 'critical' && snagSeverity === severity && styles.optionChipDanger]} onPress={() => setSnagSeverity(severity)}><Text style={[styles.optionText, snagSeverity === severity && styles.optionTextActive]}>{severity}</Text></Pressable>)}</View><View style={styles.actionRow}><Pressable style={styles.secondaryButton} onPress={() => setSnagItemKey(null)}><Text style={styles.secondaryButtonText}>Cancel</Text></Pressable><Pressable style={styles.submitButton} onPress={addSnag}><Text style={styles.primaryButtonText}>Add snag</Text></Pressable></View></View></View></Modal></View>;
}

function BrandMark() {
  return <View style={styles.brandRow}><View style={styles.logo}><Text style={styles.logoText}>HO</Text></View><View><Text style={styles.brandEyebrow}>ACES FIELD OPERATIONS</Text><Text style={styles.brandTitle}>COW Handover</Text></View></View>;
}

function ScreenHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return <View style={styles.screenHeader}><Pressable style={styles.backButton} onPress={onBack}><Text style={styles.backText}>‹</Text></Pressable><View style={styles.flexOne}><Text style={styles.screenTitle}>{title}</Text><Text style={styles.screenSubtitle}>{subtitle}</Text></View><View style={styles.demoPill}><View style={styles.demoDot} /><Text style={styles.demoPillText}>Local</Text></View></View>;
}

function SummaryCard({ value, label, tone, onPress }: { value: string; label: string; tone: 'navy' | 'blue' | 'amber' | 'green'; onPress?: () => void }) {
  return <Pressable style={styles.summaryCard} onPress={onPress}><View style={[styles.summaryAccent, { backgroundColor: COLORS[tone] }]} /><Text style={[styles.summaryValue, { color: COLORS[tone] }]}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></Pressable>;
}

function WorkflowStep({ number, label, active }: { number: string; label: string; active?: boolean }) {
  return <View style={styles.workflowStep}><View style={[styles.workflowNumber, active && styles.workflowNumberActive]}><Text style={[styles.workflowNumberText, active && styles.workflowNumberTextActive]}>{number}</Text></View><Text style={[styles.workflowStepLabel, active && styles.workflowStepLabelActive]}>{label}</Text></View>;
}

function Field({ label, value, onChangeText, textInput }: { label: string; value: string; onChangeText: (value: string) => void; textInput?: boolean }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput style={styles.countInput} keyboardType={textInput ? 'default' : 'number-pad'} value={value} onChangeText={onChangeText} placeholder={textInput ? 'Enter value' : '0'} placeholderTextColor={COLORS.muted} /></View>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <View style={styles.emptyState}><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyBody}>{body}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  page: { padding: 24, gap: 22, maxWidth: 1280, width: '100%', alignSelf: 'center' },
  mobileTopbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  topbarActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 46, height: 46, borderRadius: 14, backgroundColor: COLORS.navy, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: COLORS.white, fontSize: 17, fontWeight: '900' },
  brandEyebrow: { fontSize: 9, color: COLORS.blue, fontWeight: '900', letterSpacing: 1.2 },
  brandTitle: { fontSize: 22, color: COLORS.navy, fontWeight: '900' },
  demoPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.pale, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 },
  demoDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.green },
  demoPillText: { color: COLORS.blue, fontSize: 11, fontWeight: '800' },
  modeButton: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: COLORS.white },
  modeButtonText: { color: COLORS.navy, fontSize: 12, fontWeight: '800' },
  hero: { backgroundColor: COLORS.navy, borderRadius: 24, padding: 28, flexDirection: 'row', justifyContent: 'space-between', gap: 24, overflow: 'hidden' },
  heroCompact: { flexDirection: 'column', padding: 22 },
  heroCopyBlock: { flex: 1, maxWidth: 620, gap: 12 },
  eyebrow: { color: '#72C7D6', fontSize: 10, letterSpacing: 1.4, fontWeight: '900' },
  heroTitle: { color: COLORS.white, fontSize: 34, lineHeight: 39, fontWeight: '900' },
  heroCopy: { color: '#CED6E3', lineHeight: 21, fontSize: 14, maxWidth: 490 },
  primaryButton: { backgroundColor: COLORS.blue, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center', alignSelf: 'flex-start', marginTop: 5 },
  primaryButtonText: { color: COLORS.white, fontWeight: '900', fontSize: 14 },
  heroPanel: { width: 220, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 17, padding: 18, justifyContent: 'center' },
  heroPanelLabel: { color: '#9ED5DE', fontSize: 9, letterSpacing: 1.2, fontWeight: '900' },
  heroPanelValue: { color: COLORS.white, fontSize: 42, fontWeight: '900', marginTop: 8 },
  heroPanelHint: { color: '#CED6E3', fontSize: 12 },
  heroRule: { height: 1, backgroundColor: 'rgba(255,255,255,0.17)', marginVertical: 16 },
  heroStat: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 7 },
  heroStatLabel: { color: '#AEBBCB', fontSize: 11 },
  heroStatValue: { color: COLORS.white, fontSize: 11, fontWeight: '800', textAlign: 'right' },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14 },
  sectionEyebrow: { color: COLORS.blue, fontSize: 10, letterSpacing: 1.2, fontWeight: '900' },
  sectionTitle: { color: COLORS.navy, fontSize: 20, fontWeight: '900', marginTop: 4 },
  sectionHelper: { color: COLORS.muted, fontSize: 12 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  summaryCard: { flex: 1, minWidth: 140, backgroundColor: COLORS.white, borderRadius: 16, padding: 17, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  summaryAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  summaryValue: { fontSize: 29, fontWeight: '900' },
  summaryLabel: { color: COLORS.muted, fontSize: 12, marginTop: 5, fontWeight: '700' },
  contentSplit: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  whitePanel: { flex: 2, minWidth: 300, backgroundColor: COLORS.white, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 18 },
  noticePanel: { flex: 1, minWidth: 260, backgroundColor: COLORS.pale, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: '#CBE6EB' },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  panelEyebrow: { color: COLORS.blue, fontSize: 9, letterSpacing: 1.1, fontWeight: '900' },
  panelTitle: { color: COLORS.navy, fontSize: 17, fontWeight: '900', marginTop: 4 },
  linkText: { color: COLORS.blue, fontSize: 12, fontWeight: '900' },
  recentSite: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderTopWidth: 1, borderTopColor: COLORS.border },
  siteIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.softBlue, alignItems: 'center', justifyContent: 'center' },
  siteIconText: { color: COLORS.blue, fontWeight: '900', fontSize: 11 },
  flexOne: { flex: 1 },
  siteId: { color: COLORS.blue, fontWeight: '900', fontSize: 15 },
  siteName: { color: COLORS.ink, fontWeight: '800', marginTop: 3, fontSize: 13 },
  meta: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  chevron: { color: COLORS.blue, fontSize: 26, fontWeight: '300' },
  noticeIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: COLORS.blue, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  noticeIconText: { color: COLORS.white, fontWeight: '900', fontSize: 16 },
  noticeTitle: { color: COLORS.navy, fontSize: 18, fontWeight: '900' },
  noticeText: { color: COLORS.muted, lineHeight: 19, fontSize: 12, marginTop: 8 },
  noticeFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.green },
  noticeFooterText: { color: COLORS.green, fontWeight: '900', fontSize: 12 },
  workflowStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, backgroundColor: COLORS.white, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 15, flexWrap: 'wrap' },
  workflowLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  workflowStep: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  workflowNumber: { width: 26, height: 26, borderRadius: 9, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  workflowNumberActive: { backgroundColor: COLORS.navy },
  workflowNumberText: { color: COLORS.muted, fontSize: 10, fontWeight: '900' },
  workflowNumberTextActive: { color: COLORS.white },
  workflowStepLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  workflowStepLabelActive: { color: COLORS.navy, fontWeight: '900' },
  demoShortcut: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 18, backgroundColor: '#FFF7E6', borderWidth: 1, borderColor: '#F5D78C', borderRadius: 16, padding: 17 },
  demoShortcutEyebrow: { color: '#A86F00', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  demoShortcutTitle: { color: COLORS.navy, fontSize: 15, fontWeight: '900', marginTop: 5 },
  demoShortcutText: { color: '#876D38', fontSize: 12, marginTop: 4, lineHeight: 18 },
  demoShortcutArrow: { color: '#A86F00', fontSize: 28 },
  screenHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  backButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  backText: { color: COLORS.navy, fontSize: 30, lineHeight: 32 },
  screenTitle: { color: COLORS.navy, fontWeight: '900', fontSize: 22 },
  screenSubtitle: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14 },
  searchIcon: { color: COLORS.blue, fontSize: 24, marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 15, fontSize: 14, color: COLORS.ink },
  siteList: { gap: 12 },
  siteCard: { backgroundColor: COLORS.white, borderRadius: 17, borderWidth: 1, borderColor: COLORS.border, padding: 17 },
  siteCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusBadge: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6 },
  statusBadgeGreen: { backgroundColor: '#E4F4EC' },
  statusBadgeAmber: { backgroundColor: '#FFF3D9' },
  statusBadgeText: { color: COLORS.navy, fontSize: 10, fontWeight: '900' },
  siteDetails: { paddingLeft: 52, marginTop: -2 },
  siteCardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 14, paddingTop: 13 },
  readOnly: { color: COLORS.blue, fontWeight: '900', fontSize: 9, letterSpacing: 0.6 },
  openLabel: { color: COLORS.blue, fontSize: 12, fontWeight: '900' },
  chevronSmall: { fontSize: 17 },
  inspectionShell: { flex: 1, backgroundColor: COLORS.background },
  inspectionMeta: { flexDirection: 'row', gap: 16, paddingHorizontal: 24, flexWrap: 'wrap' },
  inspectionSite: { flex: 2, minWidth: 250, backgroundColor: COLORS.pale, borderRadius: 15, padding: 15 },
  readOnlyPill: { alignSelf: 'flex-start', backgroundColor: COLORS.white, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5, marginTop: 10 },
  inspectionInfo: { flex: 1, minWidth: 190, backgroundColor: COLORS.white, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, padding: 15 },
  generalPhotoButton: { borderWidth: 1, borderColor: COLORS.blue, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 8, marginTop: 7, alignSelf: 'flex-start' },
  generalPhotoButtonText: { color: COLORS.blue, fontSize: 10, fontWeight: '900' },
  infoLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, marginTop: 3 },
  infoValue: { color: COLORS.navy, fontWeight: '800', fontSize: 12, marginTop: 4, marginBottom: 8 },
  progressBlock: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 4 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 },
  progressValue: { color: COLORS.navy, fontSize: 12, fontWeight: '900' },
  progressTrack: { height: 8, backgroundColor: '#DCE4EA', borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: COLORS.green },
  categoryRow: { paddingHorizontal: 24, paddingVertical: 16, gap: 8 },
  categoryChip: { paddingHorizontal: 13, paddingVertical: 9, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 7 },
  categoryChipActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  categoryChipLabel: { color: COLORS.muted, fontWeight: '800', fontSize: 12 },
  categoryChipLabelActive: { color: COLORS.white },
  categoryChipCount: { color: COLORS.blue, fontWeight: '900', fontSize: 10 },
  categoryChipCountActive: { color: '#9ED5DE' },
  itemsList: { paddingHorizontal: 24, paddingBottom: 30, gap: 14, maxWidth: 1280, width: '100%', alignSelf: 'center' },
  scrollSpacer: { height: 120 },
  itemCard: { backgroundColor: COLORS.white, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 16, gap: 10 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  numberBadge: { width: 30, height: 30, borderRadius: 10, backgroundColor: COLORS.pale, alignItems: 'center', justifyContent: 'center' },
  numberText: { color: COLORS.blue, fontWeight: '900' },
  itemTitle: { color: COLORS.ink, fontWeight: '900', fontSize: 16 },
  photoRequirement: { color: COLORS.muted, fontSize: 11, marginTop: 3 },
  itemStatusDot: { width: 10, height: 10, borderRadius: 5 },
  itemStatusDotGood: { backgroundColor: COLORS.green },
  itemStatusDotWarning: { backgroundColor: COLORS.amber },
  fieldLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.7, marginBottom: 3 },
  optionRow: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  optionChip: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: COLORS.background },
  optionChipActive: { backgroundColor: COLORS.blue, borderColor: COLORS.blue },
  optionChipDanger: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  optionText: { color: COLORS.muted, fontWeight: '800', textTransform: 'capitalize', fontSize: 11 },
  optionTextActive: { color: COLORS.white },
  countRow: { flexDirection: 'row', gap: 10 },
  field: { flex: 1, minWidth: 120 },
  countInput: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 10, color: COLORS.ink, fontSize: 13 },
  remarks: { minHeight: 57, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background, borderRadius: 10, padding: 11, textAlignVertical: 'top', color: COLORS.ink, fontSize: 13 },
  evidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', backgroundColor: '#F8FBFC', borderRadius: 12, padding: 10 },
  evidenceCount: { width: 58 },
  evidenceCountValue: { color: COLORS.navy, fontSize: 22, fontWeight: '900' },
  evidenceCountLabel: { color: COLORS.muted, fontSize: 9, lineHeight: 12 },
  evidenceThumbs: { flexDirection: 'row', gap: 5, flex: 1, minWidth: 80 },
  evidenceThumb: { width: 35, height: 35, borderRadius: 7, backgroundColor: COLORS.softBlue },
  demoThumb: { width: 35, height: 35, borderRadius: 7, backgroundColor: '#FFF0C7', alignItems: 'center', justifyContent: 'center' },
  demoThumbText: { color: '#A86F00', fontSize: 7, fontWeight: '900' },
  cameraButton: { backgroundColor: COLORS.navy, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  cameraButtonText: { color: COLORS.white, fontWeight: '900', fontSize: 11 },
  snagTag: { backgroundColor: '#FFF5F1', borderLeftWidth: 3, borderLeftColor: COLORS.amber, padding: 9, borderRadius: 8 },
  snagTagCritical: { borderLeftColor: COLORS.red, backgroundColor: '#FFF0EE' },
  snagTagTitle: { color: COLORS.red, fontSize: 10, fontWeight: '900' },
  snagTagText: { color: COLORS.ink, fontSize: 11, marginTop: 3 },
  itemFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  itemFooterHint: { color: COLORS.muted, fontSize: 10 },
  secondaryButton: { borderWidth: 1, borderColor: COLORS.blue, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
  secondaryButtonText: { color: COLORS.blue, fontWeight: '900', fontSize: 11 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 10, backgroundColor: COLORS.white, padding: 14, borderTopWidth: 1, borderTopColor: COLORS.border },
  saveButton: { flex: 1, borderWidth: 1, borderColor: COLORS.navy, borderRadius: 12, padding: 14, alignItems: 'center' },
  saveButtonText: { color: COLORS.navy, fontWeight: '900' },
  submitButton: { flex: 1.4, backgroundColor: COLORS.blue, borderRadius: 12, padding: 14, alignItems: 'center', justifyContent: 'center' },
  demoFillButton: { position: 'absolute', right: 17, bottom: 80, backgroundColor: '#FFF1CE', borderWidth: 1, borderColor: '#E6C873', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  demoFillButtonText: { color: '#876D38', fontSize: 9, fontWeight: '900' },
  declarationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.border, paddingHorizontal: 24, paddingVertical: 13, marginTop: -1 },
  declarationCheck: { width: 24, height: 24, borderWidth: 1, borderColor: COLORS.border, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  declarationCheckActive: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  declarationCheckText: { color: COLORS.white, fontWeight: '900' },
  declarationTitle: { color: COLORS.navy, fontSize: 11, fontWeight: '900' },
  declarationText: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  actionRow: { flexDirection: 'row', gap: 9 },
  cameraScreen: { flex: 1, backgroundColor: '#09101F', justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 44 },
  cameraPlaceholder: { flex: 1, width: '100%', backgroundColor: '#11223A', justifyContent: 'center', alignItems: 'center', padding: 32 },
  cameraPlaceholderEyebrow: { color: '#9ED5DE', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  cameraPlaceholderTitle: { color: COLORS.white, fontWeight: '900', fontSize: 24, textAlign: 'center', marginTop: 10 },
  cameraPlaceholderText: { color: '#CED6E3', maxWidth: 420, textAlign: 'center', lineHeight: 20, marginTop: 10 },
  cameraTop: { position: 'absolute', top: 55, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cameraClose: { color: COLORS.white, fontWeight: '900', fontSize: 16 },
  cameraLabel: { color: COLORS.white, fontWeight: '900' },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 5, borderColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.white },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(10,20,40,0.55)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, gap: 14 },
  modalEyebrow: { color: COLORS.blue, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  modalTitle: { color: COLORS.navy, fontSize: 22, fontWeight: '900' },
  snagInput: { minHeight: 100, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background, borderRadius: 12, padding: 13, textAlignVertical: 'top', color: COLORS.ink },
  emptyState: { backgroundColor: COLORS.white, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 24, alignItems: 'center' },
  emptyTitle: { color: COLORS.navy, fontSize: 16, fontWeight: '900' },
  emptyBody: { color: COLORS.muted, marginTop: 7 }
});
