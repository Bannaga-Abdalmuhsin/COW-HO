import { HandoverDraft, PlanDataset, PlanSummary } from '../types';
import { isActualHandover, matchesPlanArea, summarizePlan } from '../services/plans';
import { StyleSheet, Text, View } from 'react-native';

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

type PlanVsActualProps = {
  plan: PlanDataset;
  handovers: HandoverDraft[];
  region?: string;
  compact?: boolean;
};

export function PlanVsActual({ plan, handovers, region, compact = false }: PlanVsActualProps) {
  const summaries = summarizePlan(plan, handovers, region);
  const daily = plan.daily.filter((row) => !region || row.region === region).slice(0, compact ? 4 : 8);
  const totalPlanned = summaries.reduce((total, row) => total + row.totalPlanned, 0);
  const totalActual = summaries.reduce((total, row) => total + row.actualQuantity, 0);
  const totalScheduled = summaries.reduce((total, row) => total + row.scheduledQuantity, 0);
  const totalUnallocated = summaries.reduce((total, row) => total + row.unallocatedQuantity, 0);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.flexOne}>
          <Text style={styles.eyebrow}>DEPLOYMENT PLAN</Text>
          <Text style={styles.title}>Plan versus actual</Text>
          <Text style={styles.helper}>{plan.notice}</Text>
        </View>
        <View style={[styles.sourceBadge, plan.source === 'supabase' ? styles.sourceConnected : styles.sourcePending]}>
          <Text style={[styles.sourceText, plan.source === 'supabase' ? styles.sourceConnectedText : styles.sourcePendingText]}>{plan.source === 'supabase' ? 'Supabase' : 'Workbook preview'}</Text>
        </View>
      </View>
      <View style={styles.metricRow}>
        <PlanMetric label="Planned" value={totalPlanned} tone="navy" />
        <PlanMetric label="Actual handovers" value={totalActual} tone="blue" />
        <PlanMetric label="Scheduled" value={totalScheduled} tone="green" />
        <PlanMetric label="Unallocated" value={totalUnallocated} tone={totalUnallocated ? 'amber' : 'green'} />
      </View>
      {summaries.length > 0 ? <View style={styles.table}>
        <View style={styles.tableHeader}><Text style={[styles.tableHeaderText, styles.areaColumn]}>REGION / AREA</Text><Text style={styles.tableHeaderText}>PLAN</Text><Text style={styles.tableHeaderText}>ACTUAL</Text><Text style={styles.tableHeaderText}>VARIANCE</Text></View>
        {summaries.map((summary) => <PlanRow key={`${summary.region}-${summary.area}`} summary={summary} />)}
      </View> : <Text style={styles.empty}>No plan rows are available for this region.</Text>}
      {daily.length > 0 && <View style={styles.dailySection}>
        <View style={styles.dailyHeader}><Text style={styles.eyebrow}>DAILY SCHEDULE</Text><Text style={styles.dailyHint}>Planned quantity · actual handovers</Text></View>
        {daily.map((row) => {
          const actual = handovers.filter((handover) => isActualHandover(handover) && handover.site.region === row.region && matchesPlanArea(row.area, handover.site.city, handover.site.district, handover.site.siteLabel) && (handover.submittedAt || handover.updatedAt || handover.createdAt).slice(0, 10) === row.planDate).length;
          return <View key={`${row.region}-${row.area}-${row.planDate}`} style={styles.dailyRow}><Text style={styles.dailyDate}>{formatDate(row.planDate)}</Text><Text style={styles.dailyArea}>{row.area}</Text><Text style={styles.dailyValue}>{row.plannedQuantity} · {actual}</Text></View>;
        })}
      </View>}
    </View>
  );
}

function PlanRow({ summary }: { summary: PlanSummary }) {
  const varianceTone = summary.variance > 0 ? COLORS.red : summary.variance === 0 ? COLORS.green : COLORS.amber;
  return <View style={styles.row}><View style={styles.areaColumn}><Text style={styles.areaRegion}>{summary.region}</Text><Text style={styles.areaName}>{summary.area}</Text>{summary.unallocatedQuantity > 0 && <Text style={styles.unallocated}>1 unallocated in workbook</Text>}</View><Text style={styles.value}>{summary.totalPlanned}</Text><Text style={styles.value}>{summary.actualQuantity}</Text><Text style={[styles.value, { color: varianceTone }]}>{summary.variance > 0 ? `+${summary.variance}` : summary.variance}</Text></View>;
}

function PlanMetric({ label, value, tone }: { label: string; value: number; tone: 'navy' | 'blue' | 'amber' | 'green' }) {
  return <View style={styles.metric}><Text style={[styles.metricValue, { color: COLORS[tone] }]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.white, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 18, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  flexOne: { flex: 1 },
  eyebrow: { color: COLORS.blue, fontSize: 9, letterSpacing: 1.1, fontWeight: '900' },
  title: { color: COLORS.navy, fontSize: 18, fontWeight: '900', marginTop: 4 },
  helper: { color: COLORS.muted, fontSize: 11, lineHeight: 17, marginTop: 5 },
  sourceBadge: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6 },
  sourceConnected: { backgroundColor: '#E4F4EC' },
  sourcePending: { backgroundColor: '#FFF3D9' },
  sourceText: { fontSize: 9, fontWeight: '900' },
  sourceConnectedText: { color: COLORS.green },
  sourcePendingText: { color: '#A86F00' },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  metric: { flex: 1, minWidth: 95, backgroundColor: COLORS.background, borderRadius: 11, padding: 11 },
  metricValue: { fontSize: 22, fontWeight: '900' },
  metricLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '800', marginTop: 3 },
  table: { borderTopWidth: 1, borderTopColor: COLORS.border },
  tableHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9 },
  tableHeaderText: { color: COLORS.muted, fontSize: 8, fontWeight: '900', width: 46, textAlign: 'right' },
  areaColumn: { flex: 1, width: undefined, textAlign: 'left' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: COLORS.border, paddingVertical: 10 },
  areaRegion: { color: COLORS.muted, fontSize: 9, fontWeight: '800' },
  areaName: { color: COLORS.navy, fontSize: 11, fontWeight: '900', marginTop: 2 },
  unallocated: { color: COLORS.amber, fontSize: 8, marginTop: 3, fontWeight: '800' },
  value: { color: COLORS.navy, fontSize: 12, fontWeight: '900', width: 46, textAlign: 'right' },
  dailySection: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 14 },
  dailyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 3 },
  dailyHint: { color: COLORS.muted, fontSize: 9 },
  dailyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: COLORS.border, paddingVertical: 8 },
  dailyDate: { color: COLORS.navy, fontSize: 10, fontWeight: '900', width: 58 },
  dailyArea: { color: COLORS.ink, fontSize: 10, flex: 1 },
  dailyValue: { color: COLORS.blue, fontSize: 10, fontWeight: '900' },
  empty: { color: COLORS.muted, fontSize: 11, paddingVertical: 8 }
});
