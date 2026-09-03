import { Session } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApprovalPortal } from './ApprovalPortal';
import { getPortalIdentity } from '../services/portal-auth';
import { createWorkspaceAdapter } from '../services/workspace';
import { supabase } from '../lib/supabase';
import { HandoverDraft, WorkspaceState } from '../types';

export function PortalApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [workspaceError, setWorkspaceError] = useState('');
  const [adapter] = useState(() => createWorkspaceAdapter());
  const identity = useMemo(() => session ? getPortalIdentity(session.user) : null, [session]);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }
    let mounted = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setAuthError(error.message);
      setSession(data.session);
      setAuthReady(true);
    }).catch((error) => {
      if (!mounted) return;
      setAuthError(error instanceof Error ? error.message : 'Unable to check the portal session.');
      setAuthReady(true);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session || !identity) {
      setWorkspace(null);
      return;
    }
    let mounted = true;
    setWorkspaceError('');
    adapter.load().then((loaded) => {
      if (!mounted) return;
      setWorkspace({
        ...loaded,
        currentRole: identity.role,
        currentRegion: identity.region === 'Region not assigned' ? '' : identity.region,
        isDemoMode: false
      });
    }).catch((error) => {
      if (!mounted) return;
      setWorkspaceError(error instanceof Error ? error.message : 'Unable to load the approval workspace.');
    });
    return () => { mounted = false; };
  }, [adapter, identity, session]);

  useEffect(() => {
    if (!workspace || !session) return;
    adapter.save(workspace).catch(() => undefined);
  }, [adapter, session, workspace]);

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setAuthError(error.message);
  }

  function updateHandover(id: string, updater: (handover: HandoverDraft) => HandoverDraft) {
    setWorkspace((current) => current ? {
      ...current,
      handovers: current.handovers.map((handover) => handover.id === id ? updater(handover) : handover)
    } : current);
  }

  if (!authReady) return <LoadingState label="Checking portal session…" />;
  if (!supabase) return <AuthShell title="Portal unavailable" body="Supabase authentication is not configured for this deployment." />;
  if (!session || !identity) return <PortalLogin error={authError} onError={setAuthError} />;
  if (workspaceError) return <AuthShell title="Workspace unavailable" body={workspaceError} actionLabel="Sign out" onAction={signOut} />;
  if (!workspace) return <LoadingState label="Loading approval workspace…" />;

  return <ApprovalPortal workspace={workspace} identity={identity} onUpdateHandover={updateHandover} onSignOut={signOut} />;
}

function PortalLogin({ error, onError }: { error: string; onError: (value: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function signIn() {
    if (!supabase) return;
    setSubmitting(true);
    onError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) onError(signInError.message);
    setSubmitting(false);
  }

  return <AuthShell title="Approval portal" body="Sign in with your Supabase account to review COW handovers.">
    <View style={styles.form}>
      <View style={styles.field}><Text style={styles.label}>EMAIL</Text><TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="name@company.com" placeholderTextColor="#687386" autoCapitalize="none" autoComplete="email" keyboardType="email-address" /></View>
      <View style={styles.field}><Text style={styles.label}>PASSWORD</Text><TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Enter password" placeholderTextColor="#687386" secureTextEntry autoComplete="current-password" onSubmitEditing={signIn} /></View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.button, submitting && styles.buttonDisabled]} onPress={signIn} disabled={submitting}><Text style={styles.buttonText}>{submitting ? 'Signing in…' : 'Sign in'}</Text></Pressable>
      <Text style={styles.noRegistration}>Accounts are created by an administrator. Public registration is disabled.</Text>
    </View>
  </AuthShell>;
}

function LoadingState({ label }: { label: string }) {
  return <View style={styles.center}><ActivityIndicator color="#176B87" /><Text style={styles.loading}>{label}</Text></View>;
}

function AuthShell({ title, body, actionLabel, onAction, children }: { title: string; body: string; actionLabel?: string; onAction?: () => void; children?: React.ReactNode }) {
  return <View style={styles.shell}><View style={styles.card}><View style={styles.logo}><Text style={styles.logoText}>HO</Text></View><Text style={styles.eyebrow}>ACES OPERATIONS</Text><Text style={styles.title}>{title}</Text><Text style={styles.body}>{body}</Text>{children}{actionLabel && onAction ? <Pressable style={styles.secondaryButton} onPress={onAction}><Text style={styles.secondaryButtonText}>{actionLabel}</Text></Pressable> : null}</View></View>;
}

const styles = StyleSheet.create({
  shell: { flex: 1, minHeight: '100%', backgroundColor: '#F5F7FA', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 440, backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: '#D9E0E8', padding: 28 },
  logo: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#14213D', alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  eyebrow: { color: '#176B87', fontSize: 9, letterSpacing: 1.2, fontWeight: '900', marginTop: 18 },
  title: { color: '#14213D', fontSize: 26, fontWeight: '900', marginTop: 5 },
  body: { color: '#687386', fontSize: 13, lineHeight: 20, marginTop: 8 },
  form: { gap: 15, marginTop: 22 },
  field: { gap: 6 },
  label: { color: '#687386', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  input: { borderWidth: 1, borderColor: '#D9E0E8', borderRadius: 10, backgroundColor: '#F5F7FA', paddingHorizontal: 12, paddingVertical: 12, color: '#172033', fontSize: 14 },
  error: { color: '#C2413B', fontSize: 12, lineHeight: 18 },
  button: { backgroundColor: '#176B87', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  noRegistration: { color: '#687386', fontSize: 11, lineHeight: 17, textAlign: 'center' },
  secondaryButton: { borderWidth: 1, borderColor: '#176B87', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 22 },
  secondaryButtonText: { color: '#176B87', fontSize: 12, fontWeight: '900' },
  center: { flex: 1, minHeight: '100%', backgroundColor: '#F5F7FA', alignItems: 'center', justifyContent: 'center', gap: 12 },
  loading: { color: '#687386', fontSize: 12 }
});
