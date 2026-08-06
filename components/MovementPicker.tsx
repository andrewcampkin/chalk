import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { resolveMovements } from "../db/queries";
import { db } from "../lib/db";
import { colors, radius, space, tap, type as t } from "../lib/theme";
import { Button } from "./ui";

type Row = { id: number; name: string; kind: string; prescription: string | null };

/**
 * The autocomplete from the log screen, pointed at the whole vocabulary —
 * movements and benchmarks in one list, because "snat" should offer Snatch and
 * Isabel without the user choosing a category first.
 */
export function MovementPicker({
  onPick,
  onClose,
}: {
  onPick: (m: Row) => void;
  onClose: () => void;
}) {
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let alive = true;
    resolveMovements(db, term, 40)
      .then((r) => alive && setRows(r as Row[]))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [term]);

  return (
    <View style={st.screen}>
      <View style={st.bar}>
        <TextInput
          style={st.input}
          value={term}
          onChangeText={setTerm}
          placeholder="Movement or workout"
          placeholderTextColor={colors.textFaint}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        <Button label="Cancel" variant="ghost" onPress={onClose} style={{ paddingHorizontal: space.lg }} />
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.id)}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable onPress={() => onPick(item)} style={({ pressed }) => [st.row, pressed && { opacity: 0.6 }]}>
            <View style={{ flex: 1 }}>
              <Text style={st.name}>{item.name}</Text>
              {item.prescription ? (
                <Text style={st.sub} numberOfLines={2}>
                  {item.prescription}
                </Text>
              ) : null}
            </View>
            {item.kind === "benchmark" && <Text style={st.tag}>WOD</Text>}
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={st.empty}>
            {term ? `No match for “${term}”` : "Start typing"}
          </Text>
        }
      />
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: "row", alignItems: "center", padding: space.md, gap: space.sm },
  input: {
    flex: 1,
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
  name: { color: colors.text, fontSize: t.body, fontWeight: "600" },
  sub: { color: colors.textFaint, fontSize: t.label, marginTop: 2 },
  tag: {
    color: colors.textFaint,
    fontSize: t.tiny,
    fontWeight: "700",
    letterSpacing: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  empty: { color: colors.textFaint, textAlign: "center", padding: space.xxl },
});
