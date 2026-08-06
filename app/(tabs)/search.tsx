import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { resolveMovements, searchRawText } from "../../db/queries";
import { db } from "../../lib/db";
import { colors, radius, space, tap, type as t } from "../../lib/theme";

type Mv = { id: number; name: string; kind: string; prescription: string | null };
type Raw = { blockId: number; sessionId: number; date: string; snippet: string };

/**
 * One field. Typing "snat" offers Snatch, Power Snatch, Isabel, Amanda. Below
 * that, anything whose verbatim text matches but was never tagged.
 */
export default function Search() {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [mv, setMv] = useState<Mv[]>([]);
  const [raw, setRaw] = useState<Raw[]>([]);

  useEffect(() => {
    let alive = true;
    if (!term.trim()) {
      setMv([]);
      setRaw([]);
      return;
    }
    resolveMovements(db, term, 12).then((r) => alive && setMv(r as Mv[])).catch(() => {});
    searchRawText(db, term, 20).then((r) => alive && setRaw(r as Raw[])).catch(() => alive && setRaw([]));
    return () => {
      alive = false;
    };
  }, [term]);

  return (
    <View style={st.screen}>
      <View style={{ padding: space.lg }}>
        <TextInput
          style={st.input}
          value={term}
          onChangeText={setTerm}
          placeholder="Movement, workout, or any word"
          placeholderTextColor={colors.textFaint}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      <FlatList
        data={mv}
        keyExtractor={(m) => `m${m.id}`}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/movement/${item.id}`)}
            style={({ pressed }) => [st.row, pressed && { opacity: 0.6 }]}
          >
            <Text style={st.name}>{item.name}</Text>
            {item.kind === "benchmark" && <Text style={st.tag}>WOD</Text>}
          </Pressable>
        )}
        ListEmptyComponent={
          term.trim() ? null : (
            <Text style={st.hint}>
              Search finds movements, named workouts, and any word in a logged
              session.
            </Text>
          )
        }
        ListFooterComponent={
          raw.length ? (
            <View>
              <Text style={st.section}>In the workout text</Text>
              {raw.map((r) => (
                <Pressable
                  key={r.blockId}
                  onPress={() => router.push(`/session/${r.sessionId}`)}
                  style={({ pressed }) => [st.row, pressed && { opacity: 0.6 }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={st.date}>{r.date}</Text>
                    <Text style={st.snippet} numberOfLines={2}>
                      {r.snippet}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null
        }
      />
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  input: {
    height: tap.min,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    fontSize: t.body,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: tap.min,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  name: { flex: 1, color: colors.text, fontSize: t.body, fontWeight: "600" },
  tag: {
    color: colors.textFaint,
    fontSize: t.tiny,
    fontWeight: "700",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  section: {
    color: colors.textFaint,
    fontSize: t.label,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    padding: space.lg,
  },
  date: { color: colors.textDim, fontSize: t.label, fontVariant: ["tabular-nums"] },
  snippet: { color: colors.text, fontSize: 14, fontFamily: t.mono, marginTop: 2 },
  hint: { color: colors.textFaint, fontSize: t.body, padding: space.xl, textAlign: "center", lineHeight: 22 },
});
