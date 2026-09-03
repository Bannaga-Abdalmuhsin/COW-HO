import { StyleSheet, Text, View } from 'react-native';
import { summarizePlan } from '../services/plans';
import { HandoverDraft, PlanDataset } from '../types';

type FieldPlanSummaryProps = {
  plan: PlanDataset;
  handovers: HandoverDraft[];
  region?: string;
};

export function FieldPlanSummary({ plan, handovers, region }: FieldPlanSummaryProps) {
  const summaries = summarizePlan(plan, handovers, region);
  const planned = summaries.reduce((total, row) => total + row.totalPlanned, 0);
  const actual = summaries.reduce((total, row) => total + row.actualQuantity, 0);
  const scheduled = summaries.reduce((total, row) => total + row.scheduledQuantity, 0);

  return <View style={styles.card}>
    <View style={styles.header}><View style={styles.flexOne}><Text style={styles.eyebrow}>FIELD DEPLOYMENT PLAN</Text><Text style={styles.title}>Today’s handover target</Text><Text style={styles.helper}>{plan.source === 'supabase' ? 'Synced from the operations plan.' : 'Preview from the workbook until plan migration is complete.'}</Text></View><View style={[styles.badge, plan.source === 'supabase' ? styles.connected : styles.preview]}><Text style={[styles.badgeText, plan.source === 'supabase' ? styles.connectedText : styles.previewText]}>{plan.source === 'supabase' ? 'Synced' : 'Preview'}</Text></View></View>
    <View style={styles.metrics}><Metric label="Planned" value={planned} /><Metric label="Actual" value={actual} /><Metric label="Scheduled" value={scheduled} /></View>
    {summaries.length > 0 ? <View style={styles.rows}>{summaries.map((row) => <View key={`${row.region}-${row.area}`} style={styles.row}><View style={styles.flexOne}><Text style={styles.area}>{row.area}</Text><Text style={styles.region}>{row.region}</Text></View><Text style={styles.actual}>{row.actualQuantity}/{row.totalPlanned}</Text></View>)}</View> : <Text style={styles.empty}>No plan is assigned to this region.</Text>}
  </View>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#D9E0E8', padding: 18, gap: 15 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  flexOne: { flex: 1 },
  eyebrow: { color: '#176B87', fontSize: 9, letterSpacing: 1.1, fontWeight: '900' },
  title: { color: '#14213D', fontSize: 18, fontWeight: '900', marginTop: 4 },
  helper: { color: '#687386', fontSize: 11, lineHeight: 17, marginTop: 5 },
  badge: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6 },
  connected: { backgroundColor: '#E4F4EC' },
  preview: { backgroundColor: '#FFF3D9' },
  badgeText: { fontSize: 9, fontWeight: '900' },
  connectedText: { color: '#1F7A5B' },
  previewText: { color: '#A86F00' },
  metrics: { flexDirection: 'row', gap: 9 },
  metric: { flex: 1, backgroundColor: '#F5F7FA', borderRadius: 11, padding: 11 },
  metricValue: { color: '#14213D', fontSize: 22, fontWeight: '900' },
  metricLabel: { color: '#687386', fontSize: 9, fontWeight: '800', marginTop: 3 },
  rows: { borderTopWidth: 1, borderTopColor: '#D9E0E8' },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#D9E0E8', paddingVertical: 9 },
  area: { color: '#14213D', fontSize: 11, fontWeight: '900' },
  region: { color: '#687386', fontSize: 9, marginTop: 2 },
  actual: { color: '#176B87', fontSize: 12, fontWeight: '900' },
  empty: { color: '#687386', fontSize: 11 }
});
