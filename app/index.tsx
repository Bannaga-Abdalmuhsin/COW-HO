import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ApprovalPortal } from '../src/components/ApprovalPortal';
import { createHoId } from '../src/domain/workflow';
import { FieldApp } from '../src/components/FieldApp';
import { createDemoHandovers } from '../src/services/demo-data';
import { createMigrationRequiredPlanDataset, createWorkbookPlanDataset } from '../src/services/plans';
import { createWorkspaceAdapter } from '../src/services/workspace';
import { isSupabaseConfigured } from '../src/lib/supabase';
import { HandoverDraft, Site, UserRole, WorkspaceState } from '../src/types';

const INITIAL_ROLE: UserRole = 'field_team';

export default function App() {
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [activeHandoverId, setActiveHandoverId] = useState<string | null>(null);
  const [experience, setExperience] = useState<'field' | 'portal'>('field');
  const [adapter] = useState(() => createWorkspaceAdapter());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    adapter.load().then((loaded) => {
      if (!mounted) return;
      if (loaded.isDemoMode && loaded.handovers.length === 0) {
        loaded.handovers = createDemoHandovers(loaded.sites);
      }
      setWorkspace(loaded);
      setReady(true);
    }).catch(() => {
      if (mounted) {
        setWorkspace({ sites: [], handovers: [], notifications: [], currentRole: INITIAL_ROLE, currentRegion: 'Central', isDemoMode: true, plan: isSupabaseConfigured ? createMigrationRequiredPlanDataset() : createWorkbookPlanDataset() });
        setReady(true);
      }
    });
    return () => { mounted = false; };
  }, [adapter]);

  useEffect(() => {
    if (!workspace || !ready) return;
    adapter.save(workspace).catch(() => undefined);
  }, [adapter, ready, workspace]);

  if (!workspace) {
    return <View style={styles.loadingScreen}><ActivityIndicator color="#176B87" /><Text style={styles.loadingText}>Loading COW Handover workspace…</Text></View>;
  }

  const currentWorkspace = workspace;

  function updateHandover(id: string, updater: (handover: HandoverDraft) => HandoverDraft) {
    setWorkspace((current) => current ? { ...current, handovers: current.handovers.map((handover) => handover.id === id ? updater(handover) : handover) } : current);
  }

  function createHandover(site: Site) {
    const existing = currentWorkspace.handovers;
    const now = new Date().toISOString();
    const hoId = createHoId(site.cowId, existing, new Date(now));
    const created = createDemoHandovers([site])[0];
    const blank: HandoverDraft = {
      ...created,
      id: `local-${hoId}`,
      hoId,
      createdAt: now,
      updatedAt: now,
      stage: 'draft',
      items: Object.fromEntries(Object.entries(created.items).map(([key, item]) => [key, { ...item, availability: 'not_checked', status: 'not_checked', quantity: '', workingQuantity: '', brand: '', model: '', photos: [], snags: [] }])),
      generalPhotos: [],
      generalRemarks: '',
      declarationConfirmed: false,
      audit: [{ ...created.audit[0], id: `local-${hoId}-created`, handoverId: `local-${hoId}`, occurredAt: now }],
      approvals: [],
      locked: false
    };
    setWorkspace((current) => current ? { ...current, handovers: [blank, ...current.handovers] } : current);
    return blank;
  }

  function changeRole(role: UserRole, region: string) {
    setWorkspace((current) => current ? { ...current, currentRole: role, currentRegion: region } : current);
  }

  function toggleExperience() {
    setExperience((current) => {
      const next = current === 'field' ? 'portal' : 'field';
      setWorkspace((existing) => existing ? {
        ...existing,
        currentRole: next === 'portal' ? 'region_team' : 'field_team',
        currentRegion: next === 'portal' ? 'Central' : 'Central'
      } : existing);
      return next;
    });
  }

  if (experience === 'portal') {
    return <ApprovalPortal workspace={workspace} onUpdateHandover={updateHandover} onChangeRole={changeRole} onChangeMode={toggleExperience} />;
  }

  return <FieldApp workspace={workspace} activeHandoverId={activeHandoverId} onSetActiveHandover={setActiveHandoverId} onCreateHandover={createHandover} onUpdateHandover={updateHandover} onChangeMode={toggleExperience} />;
}

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FA' },
  loadingText: { color: '#687386', marginTop: 12 }
});
