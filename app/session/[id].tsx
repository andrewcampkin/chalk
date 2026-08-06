import { Ionicons } from "@expo/vector-icons";
import { format, parseISO } from "date-fns";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../components/ui";
import { FeelRule, FeelTag } from "../../components/Feel";
import { deleteSession, sessionWithBlocks } from "../../db/queries";
import { formatScore, type Unit } from "../../db/score";
import { db } from "../../lib/db";
import { todayIso, useDraft } from "../../lib/draft";
import { colors, radius, space, type as t } from "../../lib/theme";

type Data = Awaited<ReturnType<typeof sessionWithBlocks>>;

export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const nav = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const unit = useDraft((s) => s.unit) as Unit;
  const start = useDraft((s) => s.start);
  const [data, setData] = useState<Data>(null);

  const sessionId = Number(id);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      sessionWithBlocks(db, sessionId).then((d) => {
        if (!alive || !d) return;
        setData(d);
        nav.setOptions({ title: format(parseISO(d.session.date), "EEE d MMM yyyy") });
      });
      return () => {
        alive = false;
      };
    }, [sessionId, nav]),
  );

  if (!data) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const confirmDelete = () =>
    Alert.alert("Delete session?", "This removes every block logged that day.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteSession(db, sessionId);
          router.back();
        },
      },
    ]);

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl + insets.bottom }}
    >
      {data.blocks.map((b) => (
        <Pressable
          key={b.id}
          onPress={() => router.push(`/log?edit=${b.id}`)}
          style={({ pressed }) => [st.block, pressed && { opacity: 0.7 }]}
        >
          <FeelRule feel={b.feel} />
          <View style={st.head}>
            <Text style={st.kind}>{b.kind === "strength" ? "STRENGTH" : "WOD"}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              {b.capped && <Text style={st.capped}>CAPPED</Text>}
              <FeelTag feel={b.feel} />
              <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
            </View>
          </View>
          <Text style={st.title}>{b.title}</Text>
          <Text style={st.raw}>{b.rawText}</Text>

          {b.scoreValue != null && (
            <Text style={st.score}>
              {formatScore(b.scoreType as any, b.scoreValue, {
                unit,
                rounds: b.scoreRounds,
                reps: b.scoreReps,
              })}
            </Text>
          )}

          {b.movements.filter((m) => m.setNumber != null).length > 0 && (
            <View style={st.sets}>
              {b.movements
                .filter((m) => m.setNumber != null)
                .map((m, i) => (
                  <View key={i} style={st.setRow}>
                    <Text style={st.setNo}>{m.setNumber}</Text>
                    <Text style={st.setReps}>{m.reps ?? "—"}</Text>
                    <Text style={st.setLoad}>{formatScore("load", m.loadG, { unit })}</Text>
                    {m.isWarmup && <Text style={st.flag}>warm-up</Text>}
                    {m.isFailed && <Text style={st.flag}>failed</Text>}
                  </View>
                ))}
            </View>
          )}

          <View style={st.tags}>
            {b.movements
              .filter((m) => m.setNumber == null)
              .map((m) => (
                <Pressable key={m.movementId} onPress={() => router.push(`/movement/${m.movementId}`)}>
                  <Text style={st.tag}>{m.name}</Text>
                </Pressable>
              ))}
          </View>

          {b.notes ? <Text style={st.notes}>{b.notes}</Text> : null}
        </Pressable>
      ))}

      <Button
        label="＋ Add another block"
        variant="ghost"
        onPress={() => {
          start("wod", data.session.date);
          router.push("/log");
        }}
        style={{ marginTop: space.md }}
      />
      <Button label="Delete session" variant="danger" onPress={confirmDelete} style={{ marginTop: space.md }} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  block: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    marginBottom: space.md,
    overflow: "hidden",
  },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kind: { color: colors.textFaint, fontSize: t.tiny, fontWeight: "700", letterSpacing: 1.4 },
  capped: { color: colors.danger, fontSize: t.tiny, fontWeight: "700", letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: t.title, fontWeight: "700", marginTop: space.xs },
  raw: {
    color: colors.textDim,
    fontFamily: t.mono,
    fontSize: 14,
    lineHeight: 20,
    marginTop: space.sm,
  },
  score: {
    color: colors.text,
    fontSize: t.score,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    marginTop: space.md,
  },
  sets: { marginTop: space.md, gap: 2 },
  setRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  setNo: { width: 16, color: colors.textFaint, fontSize: t.label },
  setReps: { width: 28, color: colors.textDim, fontSize: t.body, fontVariant: ["tabular-nums"] },
  setLoad: { color: colors.text, fontSize: t.body, fontWeight: "600", fontVariant: ["tabular-nums"] },
  flag: { color: colors.textFaint, fontSize: t.tiny },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  tag: {
    color: colors.textDim,
    fontSize: t.label,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    overflow: "hidden",
  },
  notes: { color: colors.textFaint, fontSize: t.label, marginTop: space.md, fontStyle: "italic" },
});
