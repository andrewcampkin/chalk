import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Chip, ChipRow, Keypad, WrapRow, s as ui } from "../components/ui";
import { DateField } from "../components/DateField";
import { FeelPicker } from "../components/Feel";
import { MovementPicker } from "../components/MovementPicker";
import { describeIso, todayIso } from "../lib/dates";
import { DISTANCE_PRESETS, isDistanceMovement, presetLabel } from "../lib/inputs";
import { PrToast } from "../components/PrToast";
import type { BlockFormat } from "../db/schema";
import { formatLoad } from "../db/score";
import { generateRawText, useDraft } from "../lib/draft";
import {
  appendDigit,
  appendDot,
  backspace,
  bufferToValue,
  displayBuffer,
  type FieldKind,
} from "../lib/entry";
import { benchmarkComponentIds, recentMovementChips, saveDraft, type SavedPr } from "../lib/save";
import { db } from "../lib/db";
import { colors, radius, space, tap, type as t } from "../lib/theme";
import { movements as movementsTable } from "../db/schema";
import { eq } from "drizzle-orm";

const FORMATS: { key: BlockFormat; label: string }[] = [
  { key: "for_time", label: "For time" },
  { key: "amrap", label: "AMRAP" },
  { key: "emom", label: "EMOM" },
  { key: "intervals", label: "Rounds" },
  { key: "chipper", label: "Chipper" },
];

/** Maps a slot's field id suffix onto the draft column it writes. */
const FIELD_COLUMN: Record<string, string> = {
  reps: "reps",
  load: "loadG",
  distance: "distanceM",
  calories: "calories",
};

const DURATIONS = [8, 10, 12, 15, 20, 30];
const SCHEMES = ["21-15-9", "21-18-15-12-9", "10-9-8-7-6-5-4-3-2-1", "5 rounds", "3 rounds"];

export default function LogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { draft, unit, patch, setFormat, addMovement, removeMovement, patchMovement, addSet, patchSet, removeSet } =
    useDraft();

  const [chips, setChips] = useState<
    { id: number; name: string; modality: string | null; defaultScoreType: string | null }[]
  >([]);
  const [picking, setPicking] = useState<null | "strength" | "wod">(null);
  const [active, setActive] = useState<string | null>(null);
  const [buf, setBuf] = useState<Record<string, string>>({});
  const [prs, setPrs] = useState<SavedPr[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    recentMovementChips().then(setChips).catch(() => setChips([]));
  }, []);

  const fieldKind = useCallback((id: string): FieldKind => {
    if (id === "score" && draft.scoreType === "time") return "time";
    if (id.endsWith(":load")) return "load";
    return "int";
  }, [draft.scoreType]);

  const commit = useCallback(
    (id: string, next: string) => {
      setBuf((b) => ({ ...b, [id]: next }));
      const value = bufferToValue(next, fieldKind(id), unit);

      if (id === "score") patch({ scoreValue: value });
      else if (id === "rounds") patch({ scoreRounds: value });
      else if (id === "reps") patch({ scoreReps: value });
      else if (id === "duration") patch({ durationMin: value });
      else {
        const [scope, key, field] = id.split(":");
        const column = FIELD_COLUMN[field] ?? "reps";
        if (scope === "set") patchSet(key, { [column]: value } as any);
        if (scope === "mov") patchMovement(key, { [column]: value } as any);
      }
    },
    [fieldKind, patch, patchMovement, patchSet, unit],
  );

  const onDigit = (d: string) => active && commit(active, appendDigit(buf[active] ?? "", d, fieldKind(active)));
  const onDot = () => active && commit(active, appendDot(buf[active] ?? ""));
  const onBack = () => active && commit(active, backspace(buf[active] ?? ""));

  /** Selecting a benchmark auto-tags its components — this is what makes search work. */
  const pickMovement = async (m: { id: number; name: string; kind: string }) => {
    if (picking === "strength") {
      patch({ strengthMovementId: m.id, strengthMovementName: m.name });
    } else if (m.kind === "benchmark") {
      const [row] = await db.select().from(movementsTable).where(eq(movementsTable.id, m.id));
      patch({
        benchmarkId: m.id,
        benchmarkName: m.name,
        scoreType: (row?.defaultScoreType as any) ?? draft.scoreType,
      });
      const ids = await benchmarkComponentIds(m.id);
      const named = await Promise.all(
        ids.map(async (id) => {
          const [r] = await db.select().from(movementsTable).where(eq(movementsTable.id, id));
          return {
            id,
            name: r?.name ?? "",
            modality: r?.modality ?? null,
            defaultScoreType: r?.defaultScoreType ?? null,
          };
        }),
      );
      named.forEach(addMovement);
    } else {
      addMovement(m);
    }
    setPicking(null);
  };

  const canSave =
    draft.kind === "strength"
      ? draft.strengthMovementId != null && draft.sets.some((s) => s.loadG != null || s.reps != null)
      : draft.movements.length > 0 || draft.rawTextDirty;

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await saveDraft(draft, unit);
      if (res.newPrs.length) setPrs(res.newPrs);
      else router.back();
    } catch (e: any) {
      Alert.alert("Could not save", String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  const preview = useMemo(
    () => (draft.rawTextDirty ? draft.rawText : generateRawText(draft, unit)),
    [draft, unit],
  );

  if (picking) {
    return <MovementPicker onPick={pickMovement} onClose={() => setPicking(null)} />;
  }

  return (
    <View style={st.screen}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: space.lg }}>
        <DateField value={draft.date} onChange={(iso) => patch({ date: iso })} />
        {draft.date !== todayIso() && (
          <Text style={st.backdated}>Logging to {describeIso(draft.date)}</Text>
        )}

        <ChipRow>
          <Chip label="WOD" selected={draft.kind === "wod"} onPress={() => patch({ kind: "wod", format: "for_time", scoreType: "time" })} />
          <Chip label="Strength" selected={draft.kind === "strength"} onPress={() => patch({ kind: "strength", format: "sets", scoreType: "load" })} />
        </ChipRow>

        {draft.kind === "wod" ? (
          <>
            <ChipRow>
              {FORMATS.map((f) => (
                <Chip key={f.key} label={f.label} selected={draft.format === f.key} onPress={() => setFormat(f.key)} />
              ))}
            </ChipRow>

            {(draft.format === "amrap" || draft.format === "emom") && (
              <ChipRow>
                {DURATIONS.map((d) => (
                  <Chip
                    key={d}
                    label={`${d} min`}
                    selected={draft.durationMin === d}
                    onPress={() => patch({ durationMin: d })}
                  />
                ))}
              </ChipRow>
            )}

            {(draft.format === "for_time" || draft.format === "chipper" || draft.format === "intervals") && (
              <ChipRow>
                {SCHEMES.map((sch) => (
                  <Chip key={sch} label={sch} selected={draft.repScheme === sch} onPress={() => patch({ repScheme: sch })} />
                ))}
              </ChipRow>
            )}

            <Text style={st.label}>Movements</Text>
            <ChipRow>
              <Chip label="＋ Find" onPress={() => setPicking("wod")} />
              {chips.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  selected={draft.movements.some((m) => m.movementId === c.id)}
                  onPress={() => addMovement(c)}
                />
              ))}
            </ChipRow>

            {draft.movements.map((m) => {
              const distance = isDistanceMovement(m);
              return (
                <View key={m.key}>
                  <View style={st.movRow}>
                    <Pressable onPress={() => removeMovement(m.key)} hitSlop={10} style={st.remove}>
                      <Ionicons name="close" size={18} color={colors.textFaint} />
                    </Pressable>
                    <Text style={st.movName} numberOfLines={1}>{m.name}</Text>
                    {distance ? (
                      <>
                        <Slot
                          id={`mov:${m.key}:distance`}
                          label="m"
                          value={displayBuffer(buf[`mov:${m.key}:distance`] ?? "", "int")}
                          active={active === `mov:${m.key}:distance`}
                          onPress={setActive}
                          wide
                        />
                        <Slot
                          id={`mov:${m.key}:calories`}
                          label="cal"
                          value={displayBuffer(buf[`mov:${m.key}:calories`] ?? "", "int")}
                          active={active === `mov:${m.key}:calories`}
                          onPress={setActive}
                        />
                      </>
                    ) : (
                      <>
                        <Slot
                          id={`mov:${m.key}:reps`}
                          label="reps"
                          value={displayBuffer(buf[`mov:${m.key}:reps`] ?? "", "int")}
                          active={active === `mov:${m.key}:reps`}
                          onPress={setActive}
                        />
                        <Slot
                          id={`mov:${m.key}:load`}
                          label={unit}
                          value={displayBuffer(buf[`mov:${m.key}:load`] ?? "", "load")}
                          active={active === `mov:${m.key}:load`}
                          onPress={setActive}
                        />
                      </>
                    )}
                  </View>

                  {/* 400s and 5ks are most of the running anybody logs. */}
                  {distance && (
                    <ChipRow>
                      {DISTANCE_PRESETS.map((d) => (
                        <Chip
                          key={d}
                          label={presetLabel(d)}
                          selected={m.distanceM === d}
                          onPress={() => {
                            setBuf((b) => ({ ...b, [`mov:${m.key}:distance`]: String(d) }));
                            patchMovement(m.key, { distanceM: d });
                          }}
                        />
                      ))}
                    </ChipRow>
                  )}
                </View>
              );
            })}
          </>
        ) : (
          <>
            <Text style={st.label}>Movement</Text>
            <ChipRow>
              <Chip label={draft.strengthMovementName ?? "＋ Find"} selected={!!draft.strengthMovementId} onPress={() => setPicking("strength")} />
              {chips.slice(0, 6).map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  selected={draft.strengthMovementId === c.id}
                  onPress={() => patch({ strengthMovementId: c.id, strengthMovementName: c.name })}
                />
              ))}
            </ChipRow>

            <Text style={st.label}>Sets</Text>
            {draft.sets.map((set, i) => (
              <View key={set.key} style={st.movRow}>
                <Text style={st.setNo}>{i + 1}</Text>
                <Slot
                  id={`set:${set.key}:reps`}
                  label="reps"
                  value={displayBuffer(buf[`set:${set.key}:reps`] ?? "", "int")}
                  active={active === `set:${set.key}:reps`}
                  onPress={setActive}
                />
                <Slot
                  id={`set:${set.key}:load`}
                  label={unit}
                  value={displayBuffer(buf[`set:${set.key}:load`] ?? "", "load")}
                  active={active === `set:${set.key}:load`}
                  onPress={setActive}
                  wide
                />
                <Pressable onPress={() => patchSet(set.key, { isWarmup: !set.isWarmup })} hitSlop={8} style={st.flag}>
                  <Text style={[st.flagText, set.isWarmup && st.flagOn]}>W</Text>
                </Pressable>
                <Pressable onPress={() => patchSet(set.key, { isFailed: !set.isFailed })} hitSlop={8} style={st.flag}>
                  <Text style={[st.flagText, set.isFailed && st.flagOn]}>✕</Text>
                </Pressable>
                {draft.sets.length > 1 && (
                  <Pressable onPress={() => removeSet(set.key)} hitSlop={8} style={st.remove}>
                    <Ionicons name="close" size={16} color={colors.textFaint} />
                  </Pressable>
                )}
              </View>
            ))}
            <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
              <Button label="＋ Add set" variant="ghost" onPress={addSet} />
            </View>
          </>
        )}

        <Text style={st.label}>Score</Text>
        <View style={st.scoreRow}>
          {draft.scoreType === "rounds_reps" ? (
            <>
              <BigSlot id="rounds" label="rounds" value={displayBuffer(buf.rounds ?? "", "int", "0")} active={active === "rounds"} onPress={setActive} />
              <Text style={st.plus}>+</Text>
              <BigSlot id="reps" label="reps" value={displayBuffer(buf.reps ?? "", "int", "0")} active={active === "reps"} onPress={setActive} />
            </>
          ) : (
            <BigSlot
              id="score"
              label={draft.scoreType === "time" ? "time" : draft.scoreType === "load" ? unit : draft.scoreType}
              value={displayBuffer(buf.score ?? "", fieldKind("score"), draft.scoreType === "time" ? "0:00" : "0")}
              active={active === "score"}
              onPress={setActive}
            />
          )}
        </View>
        <ChipRow>
          <Chip label="Capped / DNF" selected={draft.capped} onPress={() => patch({ capped: !draft.capped })} />
        </ChipRow>

        <Text style={st.label}>Felt like</Text>
        <FeelPicker value={draft.feel} onChange={(v) => patch({ feel: v })} />

        <Text style={st.label}>As written</Text>
        <TextInput
          style={st.raw}
          value={preview}
          onChangeText={(v) => patch({ rawText: v, rawTextDirty: true })}
          multiline
          placeholder="Paste or type the workout"
          placeholderTextColor={colors.textFaint}
        />
      </ScrollView>

      {active && (
        <View style={st.pad}>
          <Keypad
            onDigit={onDigit}
            onBackspace={onBack}
            onDot={onDot}
            showDot={fieldKind(active) === "load"}
            onClear={() => commit(active, "")}
          />
          <Pressable onPress={() => setActive(null)} style={st.done}>
            <Text style={st.doneText}>Done</Text>
          </Pressable>
        </View>
      )}

      {/* Sits at the very bottom of an edge-to-edge screen, so it must clear
          the Android nav bar itself — nothing else is below it. */}
      <View style={[st.footer, { paddingBottom: space.lg + insets.bottom }]}>
        <Button label={saving ? "Saving…" : "Save"} onPress={onSave} disabled={!canSave || saving} />
      </View>

      {prs && <PrToast prs={prs} unit={unit} onDone={() => router.back()} />}
    </View>
  );
}

function Slot({
  id,
  label,
  value,
  active,
  onPress,
  wide,
}: {
  id: string;
  label: string;
  value: string;
  active: boolean;
  onPress: (id: string) => void;
  wide?: boolean;
}) {
  return (
    <Pressable onPress={() => onPress(id)} style={[st.slot, wide && st.slotWide, active && st.slotOn]}>
      <Text style={[st.slotValue, active && st.slotValueOn]} numberOfLines={1}>{value}</Text>
      <Text style={st.slotLabel}>{label}</Text>
    </Pressable>
  );
}

function BigSlot(props: Parameters<typeof Slot>[0]) {
  return (
    <Pressable onPress={() => props.onPress(props.id)} style={[st.bigSlot, props.active && st.slotOn]}>
      <Text style={[st.bigValue, props.active && st.slotValueOn]}>{props.value}</Text>
      <Text style={st.slotLabel}>{props.label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  backdated: {
    color: colors.wod,
    fontSize: t.label,
    fontWeight: "700",
    paddingHorizontal: space.lg,
    paddingTop: space.xs,
  },
  label: {
    color: colors.textFaint,
    fontSize: t.label,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  movRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
  },
  movName: { flex: 1, color: colors.text, fontSize: t.body, fontWeight: "600" },
  setNo: { width: 18, color: colors.textFaint, fontSize: t.label, fontWeight: "700" },
  remove: { padding: space.xs },
  flag: {
    width: 34,
    height: tap.min - 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
  },
  flagText: { color: colors.textFaint, fontSize: t.label, fontWeight: "700" },
  flagOn: { color: colors.accent },

  slot: {
    minWidth: 62,
    height: tap.min - 8,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  slotWide: { minWidth: 78 },
  slotOn: { borderColor: colors.accent, backgroundColor: colors.surfaceHi },
  slotValue: { color: colors.text, fontSize: t.body, fontWeight: "700", fontVariant: ["tabular-nums"] },
  slotValueOn: { color: colors.accent },
  slotLabel: { color: colors.textFaint, fontSize: t.tiny },

  scoreRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg },
  bigSlot: {
    flex: 1,
    height: 86,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  bigValue: { color: colors.text, fontSize: t.score, fontWeight: "700", fontVariant: ["tabular-nums"] },
  plus: { color: colors.textFaint, fontSize: t.title },

  raw: {
    marginHorizontal: space.lg,
    minHeight: 90,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    fontFamily: t.mono,
    fontSize: 14,
    textAlignVertical: "top",
  },

  pad: { paddingTop: space.md, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line },
  done: { alignItems: "center", paddingVertical: space.sm },
  doneText: { color: colors.textDim, fontSize: t.body, fontWeight: "700" },

  footer: {
    padding: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
  },
});
