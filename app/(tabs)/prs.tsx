import { format, parseISO } from "date-fns";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { Empty } from "../../components/ui";
import { recentPrs } from "../../db/queries";
import { formatScore, type Unit } from "../../db/score";
import { db } from "../../lib/db";
import { useDraft } from "../../lib/draft";
import { colors, space, type as t } from "../../lib/theme";

type Pr = Awaited<ReturnType<typeof recentPrs>>[number];

export default function Prs() {
  const router = useRouter();
  const unit = useDraft((s) => s.unit) as Unit;
  const [rows, setRows] = useState<Pr[]>([]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      recentPrs(db, 200).then((r) => alive && setRows(r as Pr[])).catch(() => {});
      return () => {
        alive = false;
      };
    }, []),
  );

  const sections = Object.values(
    rows.reduce<Record<string, { title: string; data: Pr[] }>>((acc, p) => {
      acc[p.name] ??= { title: p.name, data: [] };
      acc[p.name].data.push(p);
      return acc;
    }, {}),
  ).map((s) => ({
    ...s,
    data: s.data.sort((a, b) => Number(a.repScheme) - Number(b.repScheme)),
  }));

  if (!rows.length) return <Empty text="No records yet. Log a session and they appear here." />;

  return (
    <SectionList
      style={{ backgroundColor: colors.bg }}
      sections={sections}
      keyExtractor={(p) => String(p.id)}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => <Text style={st.section}>{section.title}</Text>}
      renderItem={({ item }) => {
        const delta =
          item.previousValue != null
            ? item.scoreType === "time"
              ? item.previousValue - item.value
              : item.value - item.previousValue
            : null;
        return (
          <Pressable
            onPress={() => router.push(`/movement/${item.movementId}`)}
            style={({ pressed }) => [st.row, pressed && { opacity: 0.6 }]}
          >
            <Text style={st.scheme}>
              {item.scoreType === "load" ? `${item.repScheme}RM` : item.repScheme === "amrap" ? "AMRAP" : "Best"}
            </Text>
            <Text style={st.value}>
              {formatScore(item.scoreType as any, item.value, { unit, rounds: item.secondary })}
            </Text>
            <View style={{ flex: 1 }} />
            {delta != null && delta > 0 && (
              <Text style={st.delta}>
                {item.scoreType === "load"
                  ? `+${formatScore("load", delta, { unit })}`
                  : item.scoreType === "time"
                    ? `−${formatScore("time", delta)}`
                    : `+${delta}`}
              </Text>
            )}
            <Text style={st.date}>{format(parseISO(item.date), "d MMM yy")}</Text>
          </Pressable>
        );
      }}
      contentContainerStyle={{ paddingBottom: space.xxl }}
    />
  );
}

const st = StyleSheet.create({
  section: {
    color: colors.textDim,
    fontSize: t.label,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 48,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  scheme: { width: 52, color: colors.textFaint, fontSize: t.label, fontWeight: "700" },
  value: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  delta: { color: colors.accent, fontSize: t.label, fontWeight: "700" },
  date: { color: colors.textFaint, fontSize: t.label, fontVariant: ["tabular-nums"] },
});
