import { useEffect, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolveMovements } from "../db/queries";
import { db } from "../lib/db";
import { createCustomMovement, tidyName, type CustomScoreType } from "../lib/movements";
import { colors, radius, space, tap, type as t } from "../lib/theme";
import { Button, Chip } from "./ui";

type Row = {
  id: number;
  name: string;
  kind: string;
  prescription: string | null;
  /** Carried through so the log form knows whether to ask for metres or kilos. */
  modality: string | null;
  defaultScoreType: string | null;
};

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
  const insets = useSafeAreaInsets();
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [adding, setAdding] = useState(false);

  const trimmed = term.trim();
  const exact = rows.some((r) => r.name.toLowerCase() === trimmed.toLowerCase());
  // Coaches invent movements constantly; not finding one must never be a dead
  // end. Two characters is enough to mean something, and an exact match means
  // it already exists.
  const canAdd = trimmed.length >= 2 && !exact && !adding;

  const add = async (scoreType: CustomScoreType) => {
    setAdding(true);
    try {
      const created = await createCustomMovement(db, trimmed, scoreType);
      if (created) {
        onPick({
          id: created.id,
          name: created.name,
          kind: created.kind,
          prescription: created.prescription,
          modality: created.modality,
          defaultScoreType: created.defaultScoreType,
        });
      }
    } catch (e: any) {
      Alert.alert("Could not add", String(e?.message ?? e));
    } finally {
      setAdding(false);
    }
  };

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
        contentContainerStyle={{ paddingBottom: insets.bottom }}
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
        ListHeaderComponent={
          canAdd ? (
            <View style={st.add}>
              <Text style={st.addTitle} numberOfLines={2}>
                Add “{tidyName(term)}”
              </Text>
              <Text style={st.addHint}>How is it measured?</Text>
              <View style={st.addRow}>
                {/* Only the two that genuinely change the form. A separate
                    "reps" and "reps & load" would render identically, since
                    plenty of rep-counted movements carry a weight — a
                    kettlebell swing is 24kg and still counted in reps. */}
                {(
                  [
                    ["load", "Reps & weight"],
                    ["distance", "Distance"],
                  ] as [CustomScoreType, string][]
                ).map(([type, label]) => (
                  <Chip
                    key={type}
                    label={label}
                    onPress={() => add(type)}
                    style={{ marginRight: 0, flexGrow: 1 }}
                  />
                ))}
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          canAdd ? null : (
            <Text style={st.empty}>{term ? `No match for “${term}”` : "Start typing"}</Text>
          )
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
  add: {
    margin: space.lg,
    marginTop: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  addTitle: { color: colors.text, fontSize: t.body, fontWeight: "700" },
  addHint: { color: colors.textFaint, fontSize: t.label, marginTop: 2, marginBottom: space.md },
  addRow: { flexDirection: "row", gap: space.sm },
});
