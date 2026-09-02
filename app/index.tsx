import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { categoriesForSite, checklistForSite } from '../src/checklist';
import { isSupabaseConfigured } from '../src/lib/supabase';
import { searchSites } from '../src/services/sites';
import { EvidencePhoto, HandoverDraft, InspectionItem, ItemStatus, Site, Snag } from '../src/types';

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
  background: '#F5F7FA'
};

const STATUS_OPTIONS: { value: ItemStatus; label: string }[] = [
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'defective', label: 'Defective' },
  { value: 'missing', label: 'Missing' },
  { value: 'na', label: 'N/A' }
];

const draftKey = (hoId: string) => `cow-ho:draft:${hoId}`;

function makeHoId(cowId: string) {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const suffix = String(now.getHours() * 60 + now.getMinutes()).padStart(4, '0');
  return `HO-${cowId}-${date}-${suffix}`;
}

function createDraft(site: Site): HandoverDraft {
  const items = Object.fromEntries(
    checklistForSite(site).map((definition) => [
      definition.key,
      {
        definitionKey: definition.key,
        status: 'not_checked',
        quantity: '',
        workingQuantity: '',
        remarks: '',
        photos: [],
        snags: []
      } satisfies InspectionItem
    ])
  );
  return {
    hoId: makeHoId(site.cowId),
    site,
    createdAt: new Date().toISOString(),
    stage: 'draft',
    items
  };
}

export default function App() {
  const [screen, setScreen] = useState<'home' | 'sites' | 'inspection'>('home');
  const [query, setQuery] = useState('');
  const [sites, setSites] = useState<Site[]>([]);
  const [draft, setDraft] = useState<HandoverDraft | null>(null);
  const [activeCategory, setActiveCategory] = useState('');
  const [cameraItemKey, setCameraItemKey] = useState<string | null>(null);
  const [snagItemKey, setSnagItemKey] = useState<string | null>(null);
  const [snagText, setSnagText] = useState('');
  const [snagSeverity, setSnagSeverity] = useState<Snag['severity']>('minor');
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const definitions = draft ? checklistForSite(draft.site) : [];
  const categories = draft ? categoriesForSite(draft.site) : [];
  const visibleDefinitions = definitions.filter((item) => item.category === activeCategory);

  const completed = useMemo(() => {
    if (!draft) return 0;
    return definitions.filter((definition) => {
      const item = draft.items[definition.key];
      return item.status !== 'not_checked' && item.photos.length >= definition.requiredPhotos;
    }).length;
  }, [draft, definitions]);

  const progress = definitions.length ? Math.round((completed / definitions.length) * 100) : 0;
  const snagCount = draft
    ? Object.values(draft.items).reduce((total, item) => total + item.snags.length, 0)
    : 0;

  useEffect(() => {
    if (screen === 'sites') loadSites(query);
  }, [screen, query]);

  async function loadSites(search: string) {
    try {
      setSites(await searchSites(search));
    } catch (error) {
      Alert.alert('Cannot load sites', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  function chooseSite(site: Site) {
    const next = createDraft(site);
    setDraft(next);
    setActiveCategory(categoriesForSite(site)[0]);
    setScreen('inspection');
  }

  function updateItem(itemKey: string, changes: Partial<InspectionItem>) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        items: {
          ...current.items,
          [itemKey]: { ...current.items[itemKey], ...changes }
        }
      };
    });
  }

  async function saveDraft() {
    if (!draft) return;
    await AsyncStorage.setItem(draftKey(draft.hoId), JSON.stringify(draft));
    Alert.alert('Draft saved', 'This handover is stored on this device.');
  }

  async function openCamera(itemKey: string) {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera required', 'Camera permission is required for handover evidence.');
        return;
      }
    }
    setCameraItemKey(itemKey);
  }

  async function takePhoto() {
    if (!cameraRef.current || !cameraItemKey || !draft) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.75, exif: false });
      const locationPermission = await Location.requestForegroundPermissionsAsync();
      let coords: { latitude?: number; longitude?: number } = {};
      if (locationPermission.granted) {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
      }
      const evidence: EvidencePhoto = {
        uri: photo.uri,
        capturedAt: new Date().toISOString(),
        ...coords
      };
      const item = draft.items[cameraItemKey];
      updateItem(cameraItemKey, { photos: [...item.photos, evidence] });
      setCameraItemKey(null);
    } catch {
      Alert.alert('Photo failed', 'The evidence photo could not be captured.');
    }
  }

  function addSnag() {
    if (!draft || !snagItemKey || !snagText.trim()) return;
    const item = draft.items[snagItemKey];
    const snag: Snag = {
      id: `${draft.hoId}-SN-${String(snagCount + 1).padStart(3, '0')}`,
      description: snagText.trim(),
      severity: snagSeverity,
      status: 'open'
    };
    updateItem(snagItemKey, { snags: [...item.snags, snag] });
    setSnagText('');
    setSnagSeverity('minor');
    setSnagItemKey(null);
  }

  function submit() {
    if (!draft) return;
    const incomplete = definitions.filter((definition) => {
      const item = draft.items[definition.key];
      return item.status === 'not_checked' || item.photos.length < definition.requiredPhotos;
    });
    const defectiveWithoutSnag = definitions.filter((definition) => {
      const item = draft.items[definition.key];
      return ['defective', 'missing'].includes(item.status) && item.snags.length === 0;
    });
    if (incomplete.length || defectiveWithoutSnag.length) {
      Alert.alert(
        'Handover is incomplete',
        `${incomplete.length} item(s) need status/photos. ${defectiveWithoutSnag.length} defective or missing item(s) need a snag.`
      );
      return;
    }
    setDraft({ ...draft, stage: 'field_submitted' });
    Alert.alert('Ready for submission', 'Supabase upload will activate after the project credentials and user roles are connected.');
  }

  if (screen === 'home') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.page}>
          <View style={styles.brandRow}>
            <View style={styles.logo}><Text style={styles.logoText}>HO</Text></View>
            <View><Text style={styles.eyebrow}>ACES FIELD OPERATIONS</Text><Text style={styles.title}>COW Handover</Text></View>
          </View>
          <View style={styles.hero}>
            <Text style={styles.heroKicker}>MOBILE INSPECTION</Text>
            <Text style={styles.heroTitle}>Capture. Verify. Hand over.</Text>
            <Text style={styles.heroCopy}>Equipment condition, counts, camera evidence and snags in one structured record.</Text>
            <Pressable style={styles.primaryButton} onPress={() => setScreen('sites')}>
              <Text style={styles.primaryButtonText}>Start new handover</Text>
            </Pressable>
          </View>
          <View style={styles.grid}>
            <SummaryCard value="0" label="My drafts" />
            <SummaryCard value="0" label="Returned" warning />
            <SummaryCard value="0" label="Submitted" />
            <SummaryCard value="—" label="Pending upload" />
          </View>
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>{isSupabaseConfigured ? 'Supabase connected' : 'Draft mode'}</Text>
            <Text style={styles.noticeText}>{isSupabaseConfigured ? 'Site records will load from Supabase.' : 'Using two clearly marked demo sites until Supabase is connected.'}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === 'sites') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.page}>
          <Header title="Select COW site" onBack={() => setScreen('home')} />
          <Text style={styles.helper}>Search by COW ID, site label, city or region.</Text>
          <TextInput
            style={styles.search}
            placeholder="Example: CWN034"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="characters"
          />
          <FlatList
            data={sites}
            keyExtractor={(site) => site.id}
            contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
            renderItem={({ item }) => (
              <Pressable style={styles.siteCard} onPress={() => chooseSite(item)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.siteId}>{item.cowId}</Text>
                  <Text style={styles.siteLabel}>{item.siteLabel}</Text>
                  <Text style={styles.meta}>{item.region} · {item.city} · {item.siteStatus}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            )}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!draft) return null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.inspectionPage}>
        <Header title={draft.site.cowId} subtitle={draft.hoId} onBack={() => setScreen('sites')} />
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
          <Text style={styles.progressText}>{progress}%</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {categories.map((category) => (
            <Pressable
              key={category}
              style={[styles.categoryChip, activeCategory === category && styles.categoryChipActive]}
              onPress={() => setActiveCategory(category)}
            >
              <Text style={[styles.categoryText, activeCategory === category && styles.categoryTextActive]}>{category}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <ScrollView contentContainerStyle={styles.itemsList}>
          <View style={styles.siteSummary}>
            <Text style={styles.sectionTitle}>{draft.site.siteLabel}</Text>
            <Text style={styles.meta}>{draft.site.region} · {draft.site.district} · {draft.site.city}</Text>
            <Text style={styles.readOnly}>Master data · Read only</Text>
          </View>
          {visibleDefinitions.map((definition, index) => {
            const item = draft.items[definition.key];
            return (
              <View style={styles.itemCard} key={definition.key}>
                <View style={styles.itemHeader}>
                  <View style={styles.numberBadge}><Text style={styles.numberText}>{index + 1}</Text></View>
                  <View style={{ flex: 1 }}><Text style={styles.itemTitle}>{definition.title}</Text><Text style={styles.photoRequirement}>Camera evidence {item.photos.length}/{definition.requiredPhotos}</Text></View>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusRow}>
                  {STATUS_OPTIONS.map((option) => (
                    <Pressable
                      key={option.value}
                      style={[styles.statusChip, item.status === option.value && styles.statusChipActive, option.value === 'defective' && item.status === option.value && styles.statusDanger]}
                      onPress={() => updateItem(definition.key, { status: option.value })}
                    >
                      <Text style={[styles.statusText, item.status === option.value && styles.statusTextActive]}>{option.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={styles.countRow}>
                  <Field label="Installed count" value={item.quantity} onChangeText={(value) => updateItem(definition.key, { quantity: value })} />
                  <Field label="Working count" value={item.workingQuantity} onChangeText={(value) => updateItem(definition.key, { workingQuantity: value })} />
                </View>
                <TextInput
                  style={styles.remarks}
                  placeholder="Remarks"
                  multiline
                  value={item.remarks}
                  onChangeText={(value) => updateItem(definition.key, { remarks: value })}
                />
                {item.snags.map((snag) => (
                  <View key={snag.id} style={styles.snagTag}><Text style={styles.snagText}>{snag.id} · {snag.severity.toUpperCase()} · {snag.description}</Text></View>
                ))}
                <View style={styles.actionRow}>
                  <Pressable style={styles.cameraButton} onPress={() => openCamera(definition.key)}><Text style={styles.cameraButtonText}>Open camera</Text></Pressable>
                  <Pressable style={styles.secondaryButton} onPress={() => setSnagItemKey(definition.key)}><Text style={styles.secondaryButtonText}>+ Snag</Text></Pressable>
                </View>
              </View>
            );
          })}
          <View style={{ height: 90 }} />
        </ScrollView>
        <View style={styles.bottomBar}>
          <Pressable style={styles.saveButton} onPress={saveDraft}><Text style={styles.saveButtonText}>Save draft</Text></Pressable>
          <Pressable style={styles.submitButton} onPress={submit}><Text style={styles.primaryButtonText}>Review & submit</Text></Pressable>
        </View>
      </View>

      <Modal visible={Boolean(cameraItemKey)} animationType="slide" onRequestClose={() => setCameraItemKey(null)}>
        <View style={styles.cameraScreen}>
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
          <View style={styles.cameraTop}><Pressable onPress={() => setCameraItemKey(null)}><Text style={styles.cameraClose}>Cancel</Text></Pressable><Text style={styles.cameraLabel}>Live camera evidence</Text></View>
          <Pressable style={styles.shutter} onPress={takePhoto}><View style={styles.shutterInner} /></Pressable>
        </View>
      </Modal>

      <Modal visible={Boolean(snagItemKey)} transparent animationType="fade" onRequestClose={() => setSnagItemKey(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add snag</Text>
            <TextInput style={styles.snagInput} value={snagText} onChangeText={setSnagText} placeholder="Describe the defect or missing item" multiline autoFocus />
            <Text style={styles.fieldLabel}>Severity</Text>
            <View style={styles.statusRow}>
              {(['minor', 'major', 'critical'] as const).map((severity) => (
                <Pressable key={severity} style={[styles.statusChip, snagSeverity === severity && styles.statusChipActive]} onPress={() => setSnagSeverity(severity)}>
                  <Text style={[styles.statusText, snagSeverity === severity && styles.statusTextActive]}>{severity}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.actionRow}>
              <Pressable style={styles.secondaryButton} onPress={() => setSnagItemKey(null)}><Text style={styles.secondaryButtonText}>Cancel</Text></Pressable>
              <Pressable style={styles.submitButton} onPress={addSnag}><Text style={styles.primaryButtonText}>Add snag</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Header({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return <View style={styles.header}><Pressable style={styles.back} onPress={onBack}><Text style={styles.backText}>‹</Text></Pressable><View><Text style={styles.headerTitle}>{title}</Text>{subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}</View></View>;
}

function SummaryCard({ value, label, warning }: { value: string; label: string; warning?: boolean }) {
  return <View style={styles.summaryCard}><Text style={[styles.summaryValue, warning && { color: COLORS.amber }]}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></View>;
}

function Field({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  return <View style={{ flex: 1 }}><Text style={styles.fieldLabel}>{label}</Text><TextInput style={styles.countInput} keyboardType="number-pad" value={value} onChangeText={onChangeText} placeholder="0" /></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  page: { flexGrow: 1, padding: 20, gap: 18 },
  inspectionPage: { flex: 1, paddingTop: 12 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  logo: { width: 48, height: 48, borderRadius: 14, backgroundColor: COLORS.navy, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: COLORS.white, fontSize: 18, fontWeight: '900' },
  eyebrow: { fontSize: 10, color: COLORS.blue, fontWeight: '800', letterSpacing: 1.3 },
  title: { fontSize: 24, color: COLORS.navy, fontWeight: '900' },
  hero: { backgroundColor: COLORS.navy, borderRadius: 24, padding: 24, gap: 12, marginTop: 14 },
  heroKicker: { color: '#72C7D6', fontSize: 11, letterSpacing: 1.5, fontWeight: '800' },
  heroTitle: { color: COLORS.white, fontSize: 30, fontWeight: '900', lineHeight: 35 },
  heroCopy: { color: '#CED6E3', lineHeight: 21, fontSize: 14 },
  primaryButton: { backgroundColor: COLORS.blue, borderRadius: 13, padding: 15, alignItems: 'center', marginTop: 8 },
  primaryButtonText: { color: COLORS.white, fontWeight: '800', fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  summaryCard: { backgroundColor: COLORS.white, borderRadius: 16, padding: 17, width: '48%', borderWidth: 1, borderColor: COLORS.border },
  summaryValue: { fontSize: 25, color: COLORS.navy, fontWeight: '900' },
  summaryLabel: { color: COLORS.muted, fontSize: 13, marginTop: 5 },
  notice: { padding: 16, borderRadius: 14, backgroundColor: COLORS.pale, borderLeftWidth: 4, borderLeftColor: COLORS.blue },
  noticeTitle: { color: COLORS.navy, fontWeight: '800' },
  noticeText: { color: COLORS.muted, marginTop: 4, lineHeight: 19 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 10 },
  back: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  backText: { color: COLORS.navy, fontSize: 30, lineHeight: 32 },
  headerTitle: { color: COLORS.navy, fontWeight: '900', fontSize: 21 },
  headerSubtitle: { color: COLORS.muted, fontSize: 10, marginTop: 2 },
  helper: { color: COLORS.muted, lineHeight: 20 },
  search: { backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16 },
  siteCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 17 },
  siteId: { color: COLORS.blue, fontWeight: '900', fontSize: 18 },
  siteLabel: { color: COLORS.ink, fontWeight: '700', marginTop: 4 },
  meta: { color: COLORS.muted, fontSize: 12, marginTop: 5 },
  chevron: { color: COLORS.blue, fontSize: 30 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 8 },
  progressTrack: { height: 8, backgroundColor: '#DCE4EA', borderRadius: 5, overflow: 'hidden', flex: 1 },
  progressFill: { height: 8, backgroundColor: COLORS.green },
  progressText: { width: 38, color: COLORS.navy, fontWeight: '800', fontSize: 12 },
  categoryRow: { paddingHorizontal: 20, paddingVertical: 10, gap: 8 },
  categoryChip: { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: 20 },
  categoryChipActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  categoryText: { color: COLORS.muted, fontWeight: '700', fontSize: 12 },
  categoryTextActive: { color: COLORS.white },
  itemsList: { paddingHorizontal: 20, paddingVertical: 8, gap: 12 },
  siteSummary: { backgroundColor: COLORS.pale, padding: 15, borderRadius: 14 },
  sectionTitle: { color: COLORS.navy, fontWeight: '900', fontSize: 16 },
  readOnly: { alignSelf: 'flex-start', color: COLORS.blue, fontWeight: '700', fontSize: 10, marginTop: 8, backgroundColor: COLORS.white, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  itemCard: { backgroundColor: COLORS.white, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 16, gap: 13 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  numberBadge: { width: 30, height: 30, borderRadius: 10, backgroundColor: COLORS.pale, alignItems: 'center', justifyContent: 'center' },
  numberText: { color: COLORS.blue, fontWeight: '900' },
  itemTitle: { color: COLORS.ink, fontWeight: '900', fontSize: 16 },
  photoRequirement: { color: COLORS.muted, fontSize: 11, marginTop: 3 },
  statusRow: { flexDirection: 'row', gap: 7 },
  statusChip: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: COLORS.background },
  statusChipActive: { backgroundColor: COLORS.blue, borderColor: COLORS.blue },
  statusDanger: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  statusText: { color: COLORS.muted, fontWeight: '700', textTransform: 'capitalize', fontSize: 12 },
  statusTextActive: { color: COLORS.white },
  countRow: { flexDirection: 'row', gap: 10 },
  fieldLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '700', marginBottom: 6 },
  countInput: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  remarks: { minHeight: 55, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background, borderRadius: 10, padding: 11, textAlignVertical: 'top' },
  actionRow: { flexDirection: 'row', gap: 9 },
  cameraButton: { flex: 1, backgroundColor: COLORS.navy, borderRadius: 11, padding: 12, alignItems: 'center' },
  cameraButtonText: { color: COLORS.white, fontWeight: '800' },
  secondaryButton: { flex: 1, borderWidth: 1, borderColor: COLORS.blue, borderRadius: 11, padding: 12, alignItems: 'center' },
  secondaryButtonText: { color: COLORS.blue, fontWeight: '800' },
  snagTag: { backgroundColor: '#FFF1EE', borderLeftWidth: 3, borderLeftColor: COLORS.red, padding: 9, borderRadius: 8 },
  snagText: { color: COLORS.red, fontSize: 11, fontWeight: '700' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 10, backgroundColor: COLORS.white, padding: 14, borderTopWidth: 1, borderTopColor: COLORS.border },
  saveButton: { flex: 1, borderWidth: 1, borderColor: COLORS.navy, borderRadius: 12, padding: 14, alignItems: 'center' },
  saveButtonText: { color: COLORS.navy, fontWeight: '800' },
  submitButton: { flex: 1.4, backgroundColor: COLORS.blue, borderRadius: 12, padding: 14, alignItems: 'center' },
  cameraScreen: { flex: 1, backgroundColor: '#000', justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 44 },
  cameraTop: { position: 'absolute', top: 55, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cameraClose: { color: COLORS.white, fontWeight: '800', fontSize: 16 },
  cameraLabel: { color: COLORS.white, fontWeight: '800' },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 5, borderColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.white },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(10,20,40,0.55)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, gap: 14 },
  modalTitle: { color: COLORS.navy, fontSize: 22, fontWeight: '900' },
  snagInput: { minHeight: 100, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background, borderRadius: 12, padding: 13, textAlignVertical: 'top' }
});
