import { format, parseISO } from "date-fns";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Empty, s as ui } from "../../components/ui";
import { recentSessions } from "../../db/queries";
import { db } from "../../lib/db";
import { todayIso, useDraft } from "../../lib/draft";
import { colors, radius, space, type as t } from "../../lib/theme";

type Row = Awaited<ReturnType<typeof recentSessions>>[number];

export default function Today() {
  const router = useRouter();
  const start = useDraft((s) => s.start);
  const [rows, setRows] = useState<Row[]>([]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      recentSessions(db).then((r) => alive && setRows(r as Row[]));
      return () => {
        alive = false;
      };
    }, []),
  );

  const open = (kind: "strength" | "wod") => {
    start(kind, todayIso());
    router.push("/log");
  };

  return (
    <View style={st.screen}>
      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.id)}
        ListHeaderComponent={
          <View>
            <Text style={st.date}>{format(new Date(), "EEEE d MMMM")}</Text>
            <View style={st.actions}>
              <Button label="Log WOD" onPress={() => open("wod")} style={st.action} />
              <Button
                label="Log strength"
                variant="ghost"
                onPress={() => open("strength")}
                style={st.action}
              />
            </View>
            {rows.length > 0 && <Text style={st.section}>Recent</Text>}
          </View>
        }
        ListEmptyComponent={<Empty text={"No sessions yet —\nlog your first one."} />}
        renderItem={({ item }) => <SessionRow row={item} onPress={() => router.push(`/session/${item.id}`)} />}
        contentContainerStyle={{ paddingBottom: space.xxl }}
      />
    </View>
  );
}

function SessionRow({ row, onPress }: { row: Row; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.row, pressed && ui.pressed]}>
      <View style={st.rowDate}>
        <Text style={st.rowDay}>{format(parseISO(row.date), "d")}</Text>
        <Text style={st.rowMon}>{format(parseISO(row.date), "MMM").toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={st.rowTitle} numberOfLines={1}>
          {row.summary || row.label || "Session"}
        </Text>
        <Text style={st.rowMeta}>
          {row.blockCount} {row.blockCount === 1 ? "block" : "blocks"}
        </Text>
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  date: {
    color: colors.text,
    fontSize: t.title,
    fontWeight: "700",
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  actions: { flexDirection: "row", gap: space.md, padding: space.lg },
  action: { flex: 1 },
  section: {
    color: colors.textFaint,
    fontSize: t.label,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowDate: {
    width: 46,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingVertical: space.xs,
  },
  rowDay: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  rowMon: { color: colors.textFaint, fontSize: t.tiny, fontWeight: "700", letterSpacing: 0.8 },
  rowTitle: { color: colors.text, fontSize: t.body, fontWeight: "600" },
  rowMeta: { color: colors.textFaint, fontSize: t.label, marginTop: 2 },
});
