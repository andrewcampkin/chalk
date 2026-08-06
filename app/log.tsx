import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
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
import { benchmarkComponentIds, deleteBlock, recentMovementChips, saveDraft, type SavedPr } from "../lib/save";
import { draftFromBlock } from "../lib/edit";
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
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { draft, unit, load, patch, setFormat, addMovement, removeMovement, patchMovement, addSet, patchSet, removeSet } =
    useDraft();

  // Present when opened from a saved block. Everything else is identical —
  // the same form edits an existing block and creates a new one.
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editingBlockId = edit ? Number(edit) : null;

  const [chips, setChips] = useState<
    { id: number; name: string; modality: string | null; defaultScoreType: string | null }[]
  >([]);
  const [picking, setPicking] = useState<null | "strength" | "wod">(null);
  const [active, setActive] = useState<string | null>(null);
  const [buf, setBuf] = useState<Record<string, string>>({});
  const [prs, setPrs] = useState<SavedPr[] | null>(null);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    recentMovementChips().then(setChips).catch(() => setChips([]));
  }, []);

  useEffect(() => {
    if (editingBlockId == null || !Number.isFinite(editingBlockId)) return;
    nav.setOptions({ title: "Edit block" });
    draftFromBlock(editingBlockId, unit)
      .then((res) => {
        if (!res) {
          Alert.alert("Not found", "That block no longer exists.");
          router.back();
          return;
        }
        load(res.draft);
        setBuf(res.buffers);
      })
      .catch((e) => Alert.alert("Could not open", String(e?.message ?? e)));
    // unit is deliberately not a dependency: reloading mid-edit would discard
    // whatever has been typed since.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingBlockId]);

  /**
   * Every numeric field, in the order you would fill them in. Drives the Next
   * key, so a whole workout can be entered without reaching back up to the
   * screen between numbers.
   */
  const fieldOrder = useMemo(() => {
    const ids: string[] = [];
    if (draft.kind === "wod") {
      for (const m of draft.movements) {
        ids.push(
          ...(isDistanceMovement(m)
            ? [`mov:${m.key}:distance`, `mov:${m.key}:calories`]
            : [`mov:${m.key}:reps`, `mov:${m.key}:load`]),
        );
      }
    } else {
      for (const s of draft.sets) ids.push(`set:${s.key}:reps`, `set:${s.key}:load`);
    }
    // Strength stops at the last set — there is no score field to move on to.
    if (draft.kind === "wod") {
      if (draft.scoreType === "rounds_reps") ids.push("rounds", "reps");
      else if (draft.scoreType !== "none") ids.push("score");
    }
    return ids;
  }, [draft.kind, draft.movements, draft.sets, draft.scoreType]);

  const activeIndex = active ? fieldOrder.indexOf(active) : -1;
  const isLastField = activeIndex >= 0 && activeIndex === fieldOrder.length - 1;

  const goToNextField = () => {
    if (activeIndex < 0 || isLastField) {
      setActive(null);
      return;
    }
    setActive(fieldOrder[activeIndex + 1]);
  };

  /**
   * Where each row sits inside the scroll content, recorded as it lays out.
   * Rows are direct children of the content container, so layout.y is already
   * the offset we need.
   */
  const rowY = useRef<Record<string, number>>({});
  const registerRow = (ids: string[]) => (e: LayoutChangeEvent) => {
    const { y } = e.nativeEvent.layout;
    for (const id of ids) rowY.current[id] = y;
  };

  // Bring the field being edited to the top of what is left of the screen, so
  // the pad never hides the thing it is typing into.
  useEffect(() => {
    if (!active) return;
    const y = rowY.current[active];
    if (y == null) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - space.md), animated: true });
  }, [active]);

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
      const res = await saveDraft(draft, unit, editingBlockId);
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
      <ScrollView
        ref={scrollRef}
        // flex:1 so the sheet genuinely shrinks when the pad opens, instead of
        // keeping its full height and letting the pad sit on top of the fields.
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: space.lg }}
      >
        <DateField value={draft.date} onChange={(iso) => patch({ date: iso })} />
        {draft.date !== todayIso() && (
          <Text style={st.backdated}>Logging to {describeIso(draft.date)}</Text>
        )}

        <ChipRow>
          <Chip label="WOD" selected={draft.kind === "wod"} onPress={() => patch({ kind: "wod", format: "for_time", scoreType: "time" })} />
          <Chip
            label="Strength"
            selected={draft.kind === "strength"}
            onPress={() =>
              patch({
                kind: "strength",
                format: "sets",
                // A strength block carries no score of its own; the sets do.
                scoreType: "none",
                scoreValue: null,
                scoreRounds: null,
                scoreReps: null,
                capped: false,
              })
            }
          />
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
              const ids = distance
                ? [`mov:${m.key}:distance`, `mov:${m.key}:calories`]
                : [`mov:${m.key}:reps`, `mov:${m.key}:load`];
              return (
                <View key={m.key} onLayout={registerRow(ids)}>
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
              <View
                key={set.key}
                style={st.movRow}
                onLayout={registerRow([`set:${set.key}:reps`, `set:${set.key}:load`])}
              >
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

        {/* Strength has no separate score. The sets grid already holds the
            loads, and a strength record is derived from those rows — never from
            blocks.score_value — so a score field here would be a second place
            to type the same number, able to disagree with the first. */}
        {draft.kind === "wod" && (
          <>
        <Text style={st.label}>Score</Text>
        <View style={st.scoreRow} onLayout={registerRow(["score", "rounds", "reps"])}>
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
          </>
        )}

        <Text style={st.label}>Felt like</Text>
        <FeelPicker value={draft.feel} onChange={(v) => patch({ feel: v })} />

        {editingBlockId != null && (
          <View style={{ paddingHorizontal: space.lg, paddingTop: space.xl }}>
            <Button
              label="Delete this block"
              variant="danger"
              onPress={() =>
                Alert.alert("Delete block?", "The rest of the session is kept.", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                      await deleteBlock(editingBlockId);
                      router.back();
                    },
                  },
                ])
              }
            />
          </View>
        )}

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
        <View style={[st.pad, { paddingBottom: space.sm + insets.bottom }]}>
          <Keypad
            onDigit={onDigit}
            onBackspace={onBack}
            onDot={onDot}
            showDot={fieldKind(active) === "load"}
            onClear={() => commit(active, "")}
          />
          <View style={st.padActions}>
            <Button label="Done" variant="ghost" onPress={() => setActive(null)} style={{ flex: 1 }} />
            <Button
              label={isLastField ? "Finish" : "Next →"}
              onPress={goToNextField}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      )}

      {/* Hidden while the pad is open. Save is not the next thing you want
          mid-entry, and the height it frees is what stops the pad covering the
          field being typed into. Sits at the bottom of an edge-to-edge screen,
          so it clears the Android nav bar itself. */}
      {!active && (
        <View style={[st.footer, { paddingBottom: space.lg + insets.bottom }]}>
          <Button label={saving ? "Saving…" : "Save"} onPress={onSave} disabled={!canSave || saving} />
        </View>
      )}

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
  padActions: { flexDirection: "row", gap: space.md, paddingHorizontal: space.lg, paddingTop: space.xs },

  footer: {
    padding: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
  },
});
