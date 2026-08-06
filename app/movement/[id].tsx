import { format, parseISO } from "date-fns";
import { useLocalSearchParams, useRouter, useNavigation } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { eq } from "drizzle-orm";
import { blocksForMovement, repMaxes } from "../../db/queries";
import { movements as movementsTable } from "../../db/schema";
import { formatScore, type Unit } from "../../db/score";
import { db } from "../../lib/db";
import { useDraft } from "../../lib/draft";
import { colors, radius, space, type as t } from "../../lib/theme";

type Appearance = Awaited<ReturnType<typeof blocksForMovement>>[number];
type RepMax = { reps: number; loadG: number; date: string; blockId: number };

/**
 * Current rep maxes at the top, then every session this movement appears in —
 * strength sets AND WOD appearances, because "when did I last do pull-ups" is
 * as much a question as "what is my best triple".
 */
export default function MovementDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const nav = useNavigation();
  const router = useRouter();
  const unit = useDraft((s) => s.unit) as Unit;

  const [name, setName] = useState("");
  const [maxes, setMaxes] = useState<RepMax[]>([]);
  const [rows, setRows] = useState<Appearance[]>([]);

  const movementId = Number(id);

  useEffect(() => {
    if (!Number.isFinite(movementId)) return;
    db.select().from(movementsTable).where(eq(movementsTable.id, movementId)).then(([m]) => {
      if (m) {
        setName(m.name);
        nav.setOptions({ title: m.name });
      }
    });
    repMaxes(db, movementId).then((r) => setMaxes(r as RepMax[])).catch(() => {});
    blocksForMovement(db, movementId).then((r) => setRows(r as Appearance[])).catch(() => {});
  }, [movementId, nav]);

  return (
    <View style={st.screen}>
      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.blockId)}
        ListHeaderComponent={
          <View>
            {maxes.length > 0 && (
              <>
                <Text style={st.label}>Rep maxes</Text>
                <FlatList
                  horizontal
                  data={maxes}
                  keyExtractor={(m) => String(m.reps)}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}
                  renderItem={({ item }) => (
                    <View style={st.max}>
                      <Text style={st.maxReps}>{item.reps}RM</Text>
                      <Text style={st.maxValue}>{formatScore("load", item.loadG, { unit })}</Text>
                      <Text style={st.maxDate}>{format(parseISO(item.date), "d MMM yy")}</Text>
                    </View>
                  )}
                />
              </>
            )}
            <Text style={st.label}>
              {rows.length} {rows.length === 1 ? "session" : "sessions"}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={st.empty}>{name ? `No ${name} logged yet.` : ""}</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/session/${item.sessionId}`)}
            style={({ pressed }) => [st.row, pressed && { opacity: 0.6 }]}
          >
            <Text style={st.rowDate}>{format(parseISO(item.date), "d MMM yy")}</Text>
            <View style={{ flex: 1 }}>
              <Text style={st.rowTitle} numberOfLines={1}>{item.title || item.kind}</Text>
              <Text style={st.rowRaw} numberOfLines={1}>
                {item.rawText.split("\n").join(" · ")}
              </Text>
            </View>
            <Text style={st.rowScore}>
              {item.topLoadG
                ? formatScore("load", item.topLoadG, { unit })
                : formatScore(item.scoreType as any, item.scoreValue, {
                    unit,
                    rounds: item.scoreRounds,
                    reps: item.scoreReps,
                  })}
            </Text>
          </Pressable>
        )}
        contentContainerStyle={{ paddingBottom: space.xxl }}
      />
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  label: {
    color: colors.textFaint,
    fontSize: t.label,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    padding: space.lg,
    paddingBottom: space.sm,
  },
  max: {
    minWidth: 104,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
  },
  maxReps: { color: colors.textFaint, fontSize: t.label, fontWeight: "700" },
  maxValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    marginTop: 2,
  },
  maxDate: { color: colors.textFaint, fontSize: t.tiny, marginTop: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowDate: { width: 66, color: colors.textDim, fontSize: t.label, fontVariant: ["tabular-nums"] },
  rowTitle: { color: colors.text, fontSize: t.body, fontWeight: "600" },
  rowRaw: { color: colors.textFaint, fontSize: t.label, marginTop: 2 },
  rowScore: { color: colors.text, fontSize: t.body, fontWeight: "700", fontVariant: ["tabular-nums"] },
  empty: { color: colors.textFaint, textAlign: "center", padding: space.xxl },
});
