import { format, subWeeks } from "date-fns";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { activityByWeek, modalityMix, staleMovements } from "../../db/queries";
import { db } from "../../lib/db";
import { colors, radius, space, type as t } from "../../lib/theme";

type Week = { week: string; kind: "strength" | "wod"; blockCount: number };
type Mix = { modality: string | null; blockCount: number };
type Stale = { id: number; name: string; lastSeen: string; timesDone: number };

const MODALITY_LABEL: Record<string, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  gymnastics: "Gymnastics",
  monostructural: "Engine",
  odd_object: "Odd object",
};

export default function Activity() {
  const router = useRouter();
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [mix, setMix] = useState<Mix[]>([]);
  const [stale, setStale] = useState<Stale[]>([]);

  useFocusEffect(
    useCallback(() => {
      const since = format(subWeeks(new Date(), 12), "yyyy-MM-dd");
      const eightWeeks = format(subWeeks(new Date(), 8), "yyyy-MM-dd");
      activityByWeek(db, since).then((r) => setWeeks(r as Week[])).catch(() => {});
      modalityMix(db, since).then((r) => setMix(r as Mix[])).catch(() => {});
      staleMovements(db, eightWeeks).then((r) => setStale(r as Stale[])).catch(() => {});
    }, []),
  );

  const byWeek = Object.values(
    weeks.reduce<Record<string, { week: string; strength: number; wod: number }>>((acc, w) => {
      acc[w.week] ??= { week: w.week, strength: 0, wod: 0 };
      acc[w.week][w.kind] = w.blockCount;
      return acc;
    }, {}),
  );
  const peak = Math.max(1, ...byWeek.map((w) => w.strength + w.wod));
  const mixTotal = Math.max(1, ...[mix.reduce((n, m) => n + m.blockCount, 0)]);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: space.xxl }}>
      <Text style={st.label}>Last 12 weeks</Text>
      {byWeek.length ? (
        <View style={st.chart}>
          {byWeek.map((w) => (
            <View key={w.week} style={st.barCol}>
              <View style={st.barStack}>
                <View style={[st.bar, { flex: w.wod, backgroundColor: colors.wod }]} />
                <View style={[st.bar, { flex: w.strength, backgroundColor: colors.strength }]} />
                <View style={{ flex: Math.max(0, peak - w.strength - w.wod) }} />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={st.empty}>Nothing logged yet.</Text>
      )}
      <View style={st.legend}>
        <Legend color={colors.strength} label="Strength" />
        <Legend color={colors.wod} label="WOD" />
      </View>

      <Text style={st.label}>Modality mix</Text>
      {mix.length ? (
        mix
          .filter((m) => m.modality)
          .sort((a, b) => b.blockCount - a.blockCount)
          .map((m) => (
            <View key={m.modality} style={st.mixRow}>
              <Text style={st.mixName}>{MODALITY_LABEL[m.modality!] ?? m.modality}</Text>
              <View style={st.mixTrack}>
                <View style={[st.mixFill, { width: `${(m.blockCount / mixTotal) * 100}%` }]} />
              </View>
              <Text style={st.mixCount}>{m.blockCount}</Text>
            </View>
          ))
      ) : (
        <Text style={st.empty}>Nothing logged yet.</Text>
      )}

      <Text style={st.label}>Not in 8 weeks</Text>
      {stale.length ? (
        stale.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => router.push(`/movement/${s.id}`)}
            style={({ pressed }) => [st.staleRow, pressed && { opacity: 0.6 }]}
          >
            <Text style={st.staleName}>{s.name}</Text>
            <Text style={st.staleDate}>last {s.lastSeen}</Text>
          </Pressable>
        ))
      ) : (
        <Text style={st.empty}>Nothing has gone stale.</Text>
      )}
    </ScrollView>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
      <Text style={st.legendText}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  label: {
    color: colors.textFaint,
    fontSize: t.label,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    padding: space.lg,
    paddingBottom: space.sm,
  },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    height: 132,
    paddingHorizontal: space.lg,
  },
  barCol: { flex: 1, height: "100%", justifyContent: "flex-end" },
  barStack: { flex: 1, justifyContent: "flex-end", borderRadius: 3, overflow: "hidden" },
  bar: { width: "100%" },
  legend: { flexDirection: "row", gap: space.lg, paddingHorizontal: space.lg, paddingTop: space.md },
  legendText: { color: colors.textFaint, fontSize: t.label },

  mixRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: 6 },
  mixName: { width: 96, color: colors.textDim, fontSize: t.label },
  mixTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.surface, overflow: "hidden" },
  mixFill: { height: "100%", backgroundColor: colors.strength, borderRadius: 5 },
  mixCount: { width: 26, textAlign: "right", color: colors.textFaint, fontSize: t.label, fontVariant: ["tabular-nums"] },

  staleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 46,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  staleName: { color: colors.text, fontSize: t.body },
  staleDate: { color: colors.textFaint, fontSize: t.label, fontVariant: ["tabular-nums"] },
  empty: { color: colors.textFaint, paddingHorizontal: space.lg, paddingBottom: space.md },
});
