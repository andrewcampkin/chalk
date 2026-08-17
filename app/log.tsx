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
import { Button, Chip, ChipRow, Keypad } from "../components/ui";
import { DateField } from "../components/DateField";
import { FeelPicker } from "../components/Feel";
import { MovementPicker } from "../components/MovementPicker";
import { describeIso, todayIso } from "../lib/dates";
import { DISTANCE_PRESETS, isBodyweight, isDistanceMovement, presetLabel } from "../lib/inputs";
import { PrToast } from "../components/PrToast";
import type { BlockFormat } from "../db/schema";
import { StageCarousel, StageTrail } from "../components/Stage";
import { generateRawText, roundCount, useDraft, wodHeader, type Draft } from "../lib/draft";
import {
  appendDigit,
  appendDot,
  backspace,
  bufferToValue,
  displayBuffer,
  gramsToBuffer,
  type FieldKind,
} from "../lib/entry";
import { benchmarkComponentIds, deleteBlock, recentMovementChips, saveDraft, type SavedPr } from "../lib/save";
import { draftFromBlock } from "../lib/edit";
import { db } from "../lib/db";
import { colors, radius, space, tap, type as t } from "../lib/theme";
import { movements as movementsTable } from "../db/schema";
import { eq } from "drizzle-orm";

/**
 * Setting up a WOD is a run of stages, one question at a time, each answered by
 * rotating a single big value. See components/Stage.tsx for why a rotor rather
 * than a row of chips.
 *
 * Which stages run depends on the format, because a format only earns the
 * questions it actually raises: a for-time asks how many rounds, an AMRAP how
 * long, an EMOM both how often and how long.
 */
type Stage = "kind" | "format" | "rounds" | "every" | "duration";

/**
 * Three formats, not five.
 *
 * "Chipper" and "Rounds" were both for-time workouts wearing a different hat: a
 * chipper is a for-time you go through once, and "5 rounds for time" is one you
 * go through five times. Both are now the Rounds stage, which is also the only
 * way to say two rounds, or ten.
 */
const FORMAT_KEYS: BlockFormat[] = ["for_time", "amrap", "emom"];
const FORMAT_LABEL: Record<string, string> = {
  for_time: "For time",
  amrap: "AMRAP",
  emom: "EMOM",
};

/** Maps a slot's field id suffix onto the draft column it writes. */
const FIELD_COLUMN: Record<string, string> = {
  reps: "reps",
  load: "loadG",
  distance: "distanceM",
  calories: "calories",
};

/**
 * What each numeric stage rotates through. These are the counts a class
 * actually programmes, and rotation wraps, so nothing here is a ceiling —
 * anything else is one "Type a number" away on the pad.
 */
const ROUNDS = [1, 2, 3, 4, 5, 6, 8, 10];
const DURATIONS = [5, 8, 10, 12, 15, 20, 24, 30];
/** EMOM interval. 1 is a plain EMOM; 2 and 3 read as E2MOM and E3MOM. */
const EVERY = [1, 2, 3, 4, 5];

/** Which draft field each numeric stage rotates, and what it may rotate to. */
const NUMERIC: Record<string, { options: number[]; field: string }> = {
  rounds: { options: ROUNDS, field: "shape:rounds" },
  duration: { options: DURATIONS, field: "shape:duration" },
  every: { options: EVERY, field: "shape:every" },
};

const numBuf = (n: number | null | undefined) => (n != null ? String(n) : "");

/**
 * Old blocks still carry the formats the picker dropped. Both were time-scored
 * variants of a for-time, so show them as one rather than opening a saved
 * workout on a stage with nothing on it.
 */
const shownFormat = (f: BlockFormat): BlockFormat =>
  f === "chipper" || f === "intervals" ? "for_time" : f;

/**
 * The run of questions for a given draft. Strength asks none of them — its sets
 * are its shape, and it goes straight to picking the lift.
 */
function stagesFor(kind: Draft["kind"], format: BlockFormat): Stage[] {
  if (kind === "strength") return ["kind"];
  const f = shownFormat(format);
  if (f === "amrap") return ["kind", "format", "duration"];
  if (f === "emom") return ["kind", "format", "every", "duration"];
  return ["kind", "format", "rounds"];
}

/** The number a numeric stage is currently sitting on. */
function stageValue(d: Draft, s: Stage): number | null {
  if (s === "rounds") return d.rounds;
  if (s === "duration") return d.durationMin;
  if (s === "every") return d.everyMin;
  return null;
}

/** How a number reads on a given stage. */
function numberLabel(s: Stage, n: number): string {
  if (s === "rounds") return n === 1 ? "1 round" : `${n} rounds`;
  if (s === "every") return n === 1 ? "Every min" : `Every ${n} min`;
  return `${n} min`;
}

/**
 * Everything a stage can be swiped to.
 *
 * A number typed on the pad is folded into the list in its proper place, so
 * the row still shows where the value sits among the usual ones instead of
 * quietly becoming un-swipeable.
 */
function optionsFor(d: Draft, s: Stage): { key: string; label: string }[] {
  if (s === "kind") {
    return [
      { key: "wod", label: "WOD" },
      { key: "strength", label: "Strength" },
    ];
  }
  if (s === "format") {
    return FORMAT_KEYS.map((f) => ({ key: f, label: FORMAT_LABEL[f] }));
  }
  const current = stageValue(d, s);
  const values = [...NUMERIC[s].options];
  if (current != null && !values.includes(current)) values.push(current);
  return values.sort((a, b) => a - b).map((n) => ({ key: String(n), label: numberLabel(s, n) }));
}

/** Which option the stage is currently sitting on. */
function currentKey(d: Draft, s: Stage): string {
  if (s === "kind") return d.kind;
  if (s === "format") return shownFormat(d.format);
  return numBuf(stageValue(d, s));
}

/** The same answer, shortened for the trail above the form. */
function trailLabel(d: Draft, s: Stage): string {
  if (s === "kind") return d.kind === "wod" ? "WOD" : "Strength";
  if (s === "format") return FORMAT_LABEL[shownFormat(d.format)] ?? "For time";
  const n = stageValue(d, s);
  return n == null ? "—" : numberLabel(s, n).toLowerCase();
}

const STAGE_TITLE: Record<Stage, string> = {
  kind: "What was it",
  format: "Format",
  rounds: "Rounds",
  every: "Every",
  duration: "For how long",
};

export default function LogScreen() {
  const router = useRouter();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { draft, unit, load, patch, setKind, setFormat, setRounds, addMovement, removeMovement, patchRound, addSet, patchSet, removeSet } =
    useDraft();
  const format = shownFormat(draft.format);
  const rounds = roundCount(draft);

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
  /**
   * Which question is on screen, or null once they are all answered. A new log
   * runs the stages; opening a saved block skips them, because coming back to
   * fix one number should not mean walking the whole setup again. The trail
   * above the form reopens any of them.
   */
  const [stage, setStage] = useState<Stage | null>(edit ? null : "kind");
  /** The active field's value is selected, and the next digit replaces it. */
  const [armed, setArmed] = useState(false);
  /**
   * Bodyweight movements the user has asked for a load on. Weighted pull-ups
   * are real, but rare enough that the box does not belong on every row.
   */
  const [weighted, setWeighted] = useState<Set<string>>(new Set());
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
      // The shape fields are deliberately absent: they are answered by the
      // stages, and the pad only ever visits one of them on its own.
      // Round by round, so Next walks a 21-15-9 in the order you would read it.
      for (let r = 0; r < rounds; r++) {
        for (const m of draft.movements) {
          const base = `mov:${m.key}:${r}`;
          if (isDistanceMovement(m)) ids.push(`${base}:distance`, `${base}:calories`);
          else if (showsLoad(m)) ids.push(`${base}:reps`, `${base}:load`);
          // A pull-up has nothing to weigh, so Next does not stop on a box
          // that is not on the screen.
          else ids.push(`${base}:reps`);
        }
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
  }, [draft.kind, draft.movements, draft.sets, draft.scoreType, rounds]);

  const activeIndex = active ? fieldOrder.indexOf(active) : -1;
  const isLastField = activeIndex >= 0 && activeIndex === fieldOrder.length - 1;

  /**
   * Moves to a field and arms it if it already holds a number: the value shows
   * as selected and the next digit replaces it outright.
   *
   * Typing into a box that reads 21 almost always means "make it 15", not
   * "make it 215". Appending is a text-box habit, and here it produces numbers
   * that are wrong by an order of magnitude. Tapping the armed field again
   * disarms it, so correcting a digit is still possible without retyping.
   */
  const focusField = (id: string) => {
    if (id === active) {
      setArmed(false);
      return;
    }
    setActive(id);
    setArmed((buf[id] ?? "") !== "");
  };

  const closePad = () => {
    setActive(null);
    setArmed(false);
  };

  const goToNextField = () => {
    if (activeIndex < 0 || isLastField) {
      closePad();
      return;
    }
    focusField(fieldOrder[activeIndex + 1]);
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
      // Namespaced because the score has its own "rounds" — the number of
      // rounds you got is not the number the workout asked for. Goes through
      // setRounds so the movement grid grows and shrinks with it.
      else if (id === "shape:rounds") setRounds(value);
      else if (id === "shape:duration") patch({ durationMin: value });
      else if (id === "shape:every") patch({ everyMin: value });
      else if (id.startsWith("set:")) {
        const [, key, field] = id.split(":");
        patchSet(key, { [FIELD_COLUMN[field] ?? "reps"]: value } as any);
      } else {
        // mov:<key>:<round>:<field>
        const [, key, round, field] = id.split(":");
        const index = Number(round);
        const column = FIELD_COLUMN[field] ?? "reps";
        patchRound(key, index, { [column]: value } as any);

        // The store carries an edit down to every later round that still
        // agreed with it, and the slots read what they show from the buffers,
        // so those have to follow. Only rounds below the edited one: rewriting
        // the buffer being typed into would normalise "4." to "4" mid-entry.
        const m = useDraft.getState().draft.movements.find((x) => x.key === key);
        if (m) {
          setBuf((b) => {
            const out = { ...b };
            for (let i = index + 1; i < m.rounds.length; i++) {
              const v = (m.rounds[i] as any)[column] as number | null;
              out[`mov:${key}:${i}:${field}`] =
                field === "load" ? gramsToBuffer(v, unit) : numBuf(v);
            }
            return out;
          });
        }
      }
    },
    [fieldKind, patch, patchRound, patchSet, setRounds, unit],
  );

  /**
   * Re-reads the buffers the store just rewrote. Switching format drops the
   * dials the new one has no use for and clears the score — whose digits meant
   * seconds a moment ago and would mean rounds now — so the pad has to be told,
   * or the next tap resumes typing into a number that is no longer there.
   */
  const syncBuffers = () => {
    const d = useDraft.getState().draft;
    setBuf((b) => ({
      ...b,
      score: "",
      rounds: "",
      reps: "",
      "shape:rounds": numBuf(d.rounds),
      "shape:duration": numBuf(d.durationMin),
      "shape:every": numBuf(d.everyMin),
    }));
    setActive(null);
  };

  const changeKind = (k: "strength" | "wod") => {
    setKind(k);
    syncBuffers();
  };

  const changeFormat = (f: BlockFormat) => {
    // Tapping the chip that is already lit does nothing. This is not just a
    // stray-tap guard: an old block stored as chipper or intervals shows "For
    // time" as selected, and re-selecting it would clear the score the user
    // opened the block to keep.
    if (f === format) return;
    setFormat(f);
    syncBuffers();
  };

  /** The rotor and the pad write the same field, so both move the buffer. */
  const setDial = (id: string, value: number | null) => commit(id, numBuf(value));

  /* ---- the staged setup --------------------------------------------------- */

  /**
   * Whether this movement gets a kilos box. Gymnastics does not by default, but
   * a load already entered — or asked for with ＋kg — brings it back, so a
   * weighted pull-up is still loggable and reopens showing what was saved.
   */
  function showsLoad(m: (typeof draft.movements)[number]): boolean {
    if (!isBodyweight(m)) return true;
    return weighted.has(m.key) || m.rounds.some((r) => r.loadG != null);
  }

  const stages = useMemo(() => stagesFor(draft.kind, draft.format), [draft.kind, draft.format]);
  const stageIndex = stage ? stages.indexOf(stage) : stages.length;
  const staging = stage != null;

  const options = useMemo(() => (stage ? optionsFor(draft, stage) : []), [draft, stage]);
  const optionIndex = stage ? options.findIndex((o) => o.key === currentKey(draft, stage)) : -1;

  /** A swipe settled here, or a peeking neighbour was tapped. */
  const selectOption = (i: number) => {
    const key = options[i]?.key;
    if (key == null || !stage) return;
    if (stage === "kind") {
      // Guarded because setKind resets the score and the shape: settling back
      // on the value you started from must not wipe what is already entered.
      if (key !== draft.kind) changeKind(key as "strength" | "wod");
      return;
    }
    if (stage === "format") return changeFormat(key as BlockFormat);
    setDial(NUMERIC[stage].field, Number(key));
  };

  /**
   * The centred option was tapped: take it and move on. Choosing and advancing
   * are one motion, so there is no separate Next.
   *
   * Finishing the last stage hands straight over to movement selection, which
   * is where you were always going. Only on a fresh log — dropping someone into
   * a full-screen picker because they reopened a block to fix its score would
   * be an ambush.
   */
  const commitStage = () => {
    const d = useDraft.getState().draft;
    const list = stagesFor(d.kind, d.format);
    const next = list[list.indexOf(stage!) + 1] ?? null;
    setStage(next);
    if (next != null || editingBlockId != null) return;
    if (d.kind === "strength" && d.strengthMovementId == null) setPicking("strength");
    else if (d.kind === "wod" && d.movements.length === 0) setPicking("wod");
  };

  const trail = stages.slice(0, stageIndex).map((s) => ({ key: s, label: trailLabel(draft, s) }));

  /** An armed field is replaced wholesale by whatever is typed next. */
  const typedInto = () => {
    const base = armed ? "" : (buf[active!] ?? "");
    setArmed(false);
    return base;
  };

  const onDigit = (d: string) =>
    active && commit(active, appendDigit(typedInto(), d, fieldKind(active)));
  const onDot = () => active && commit(active, appendDot(typedInto()));
  const onBack = () => {
    if (!active) return;
    // Backspace on a selection clears the lot, the way it would anywhere else.
    if (armed) {
      setArmed(false);
      commit(active, "");
      return;
    }
    commit(active, backspace(buf[active] ?? ""));
  };

  /** Selecting a benchmark auto-tags its components — this is what makes search work. */
  const pickMovement = async (m: { id: number; name: string; kind: string }) => {
    if (picking === "strength") {
      patch({ strengthMovementId: m.id, strengthMovementName: m.name });
    } else if (m.kind === "benchmark") {
      const [row] = await db.select().from(movementsTable).where(eq(movementsTable.id, m.id));
      patch({
        benchmarkId: m.id,
        benchmarkName: m.name,
        // The prescription is where a ladder's reps come from now — "21-15-9
        // reps for time", in CrossFit's own words rather than retyped.
        benchmarkPrescription: row?.prescription ?? null,
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

        {/* Everything answered so far, and a way back into any of it. */}
        <StageTrail items={trail} onPick={(k) => setStage(k as Stage)} />

        {staging && (
          <View onLayout={registerRow(["shape:rounds", "shape:duration", "shape:every"])}>
            <StageCarousel
              label={STAGE_TITLE[stage]}
              options={options}
              index={optionIndex}
              // Shows the header being built, live, so the stages never feel
              // like a form filled in blind.
              caption={stage === "kind" ? undefined : wodHeader(draft).replace(/:$/, "")}
              onIndex={selectOption}
              onCommit={commitStage}
              total={stages.length}
              step={stageIndex}
            />

            {NUMERIC[stage] && (
              <View style={st.stageType}>
                <Button
                  label="Type a number"
                  variant="ghost"
                  onPress={() => focusField(NUMERIC[stage].field)}
                />
              </View>
            )}
          </View>
        )}

        {staging ? null : draft.kind === "wod" ? (
          <>
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

            {/* One block per round. Round one is where movements are added and
                removed; the rest arrive already filled in from it, and are only
                touched where the workout actually differs — which for a
                21-15-9 is two numbers per movement, not six. */}
            {Array.from({ length: rounds }, (_, r) => (
              <View key={r}>
                {rounds > 1 && <Text style={st.roundLabel}>Round {r + 1}</Text>}
                {draft.movements.map((m) => {
                  const distance = isDistanceMovement(m);
                  const base = `mov:${m.key}:${r}`;
                  const entry = m.rounds[r] ?? { reps: null, loadG: null, distanceM: null, calories: null };
                  const ids = distance
                    ? [`${base}:distance`, `${base}:calories`]
                    : [`${base}:reps`, `${base}:load`];
                  return (
                    <View key={m.key} onLayout={registerRow(ids)}>
                      <View style={st.movRow}>
                        {r === 0 ? (
                          <Pressable onPress={() => removeMovement(m.key)} hitSlop={10} style={st.remove}>
                            <Ionicons name="close" size={18} color={colors.textFaint} />
                          </Pressable>
                        ) : (
                          <View style={st.removeSpacer} />
                        )}
                        <Text style={st.movName} numberOfLines={1}>{m.name}</Text>
                        {distance ? (
                          <>
                            <Slot
                              id={`${base}:distance`}
                              label="m"
                              value={displayBuffer(buf[`${base}:distance`] ?? "", "int")}
                              active={active === `${base}:distance`}
                              onPress={focusField}
                              wide
                            />
                            <Slot
                              id={`${base}:calories`}
                              label="cal"
                              value={displayBuffer(buf[`${base}:calories`] ?? "", "int")}
                              active={active === `${base}:calories`}
                              onPress={focusField}
                            />
                          </>
                        ) : (
                          <>
                            <Slot
                              id={`${base}:reps`}
                              label="reps"
                              value={displayBuffer(buf[`${base}:reps`] ?? "", "int")}
                              active={active === `${base}:reps`}
                              armed={armed}
                              onPress={focusField}
                              wide={!showsLoad(m)}
                            />
                            {showsLoad(m) ? (
                              <Slot
                                id={`${base}:load`}
                                label={unit}
                                value={displayBuffer(buf[`${base}:load`] ?? "", "load")}
                                active={active === `${base}:load`}
                                armed={armed}
                                onPress={focusField}
                              />
                            ) : (
                              // Weighted pull-ups and dips exist; an empty kg box
                              // on every gymnastics row in every WOD does not
                              // earn its place. One tap brings it back.
                              r === 0 && (
                                <Pressable
                                  onPress={() =>
                                    setWeighted((w) => new Set(w).add(m.key))
                                  }
                                  hitSlop={8}
                                  style={st.addLoad}
                                >
                                  <Text style={st.addLoadText}>＋{unit}</Text>
                                </Pressable>
                              )
                            )}
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
                              selected={entry.distanceM === d}
                              onPress={() => commit(`${base}:distance`, String(d))}
                            />
                          ))}
                        </ChipRow>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
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
            <Text style={st.hint}>✕ marks a failed rep. It won't count towards records.</Text>
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
                  onPress={focusField}
                />
                <Slot
                  id={`set:${set.key}:load`}
                  label={unit}
                  value={displayBuffer(buf[`set:${set.key}:load`] ?? "", "load")}
                  active={active === `set:${set.key}:load`}
                  onPress={focusField}
                  wide
                />
                <Pressable
                  onPress={() => patchSet(set.key, { isFailed: !set.isFailed })}
                  hitSlop={8}
                  style={[st.flag, set.isFailed && st.flagBoxOn]}
                >
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
        {!staging && draft.kind === "wod" && (
          <>
        <Text style={st.label}>Score</Text>
        <View style={st.scoreRow} onLayout={registerRow(["score", "rounds", "reps"])}>
          {draft.scoreType === "rounds_reps" ? (
            <>
              <BigSlot id="rounds" label="rounds" value={displayBuffer(buf.rounds ?? "", "int", "0")} active={active === "rounds"} onPress={focusField} />
              <Text style={st.plus}>+</Text>
              <BigSlot id="reps" label="reps" value={displayBuffer(buf.reps ?? "", "int", "0")} active={active === "reps"} onPress={focusField} />
            </>
          ) : (
            <BigSlot
              id="score"
              label={draft.scoreType === "time" ? "time" : draft.scoreType === "load" ? unit : draft.scoreType}
              value={displayBuffer(buf.score ?? "", fieldKind("score"), draft.scoreType === "time" ? "0:00" : "0")}
              active={active === "score"}
              onPress={focusField}
            />
          )}
        </View>
        {/* An AMRAP ends when the clock does — there is nothing to fall short
            of, so the toggle only appears where a cap can actually be hit.
            Offering it on every workout invited a meaningless flag that
            invariant 6 would then quietly bar from the records. */}
        {draft.scoreType !== "rounds_reps" && (
          <ChipRow>
            <Chip label="Capped / DNF" selected={draft.capped} onPress={() => patch({ capped: !draft.capped })} />
          </ChipRow>
        )}
          </>
        )}

        {!staging && (
          <>
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

            {/* Last, and well past the Save button's reach. It was sitting
                directly above the workout text, which is the one field you
                scroll down to edit. */}
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
          </>
        )}
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
            {/* A staged number has nowhere to walk on to — the stage's own Next
                is what moves the flow along, so the pad only has to get out of
                the way. */}
            {active.startsWith("shape:") ? (
              <Button label="Done" onPress={closePad} style={{ flex: 1 }} />
            ) : (
              <>
                <Button label="Done" variant="ghost" onPress={closePad} style={{ flex: 1 }} />
                <Button
                  label={isLastField ? "Finish" : "Next →"}
                  onPress={goToNextField}
                  style={{ flex: 1 }}
                />
              </>
            )}
          </View>
        </View>
      )}

      {/* Hidden while the pad is open, and while the stages are running: a tap
          on the carousel is what moves those along, and a Next button beside it
          would be a second way to do the same thing. Save is not the next thing
          you want mid-entry either, and the height it frees is what stops the
          pad covering the field being typed into. Sits at the bottom of an
          edge-to-edge screen, so it clears the Android nav bar itself. */}
      {!active && !staging && (
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
  armed,
  onPress,
  wide,
}: {
  id: string;
  label: string;
  value: string;
  active: boolean;
  /** True when this field is the active one AND its value is selected. */
  armed?: boolean;
  onPress: (id: string) => void;
  wide?: boolean;
}) {
  const selected = !!active && !!armed;
  return (
    <Pressable onPress={() => onPress(id)} style={[st.slot, wide && st.slotWide, active && st.slotOn]}>
      <View style={[st.sel, selected && st.selOn]}>
        <Text
          style={[st.slotValue, active && st.slotValueOn, selected && st.selText]}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
      <Text style={st.slotLabel}>{label}</Text>
    </Pressable>
  );
}

function BigSlot(props: Parameters<typeof Slot>[0]) {
  const selected = !!props.active && !!props.armed;
  return (
    <Pressable onPress={() => props.onPress(props.id)} style={[st.bigSlot, props.active && st.slotOn]}>
      <View style={[st.sel, selected && st.selOn]}>
        <Text style={[st.bigValue, props.active && st.slotValueOn, selected && st.selText]}>
          {props.value}
        </Text>
      </View>
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
  stageType: { paddingHorizontal: space.lg, paddingTop: space.md },

  // Text-selection highlight, so an armed field visibly says "type and I go".
  // Inverted rather than tinted: chalk yellow means "record" and nothing else
  // (invariant 10), and a coloured selection would compete with it.
  sel: { paddingHorizontal: 4, borderRadius: radius.sm },
  selOn: { backgroundColor: colors.textDim },
  selText: { color: colors.bg },

  addLoad: {
    minWidth: 62,
    height: tap.min - 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.line,
  },
  addLoadText: { color: colors.textFaint, fontSize: t.label, fontWeight: "700" },

  movRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
  },
  movName: { flex: 1, color: colors.text, fontSize: t.body, fontWeight: "600" },
  roundLabel: {
    color: colors.textFaint,
    fontSize: t.label,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  // Keeps the later rounds' names aligned with round one's, where the ✕ is.
  removeSpacer: { width: 18 + space.xs * 2 },
  hint: {
    color: colors.textFaint,
    fontSize: t.label,
    lineHeight: 18,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    marginTop: -space.xs,
  },
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
  // Filled rather than coloured. Chalk yellow means "record" and nothing else
  // (invariant 10); a lit-up warm-up flag would read as an achievement.
  flagOn: { color: colors.text },
  flagBoxOn: { backgroundColor: colors.surfaceHi, borderColor: colors.textDim },

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
  // The field being typed into is not an achievement. It was showing chalk
  // yellow, which made every number look like a record while it was entered.
  slotOn: { borderColor: colors.textDim, backgroundColor: colors.surfaceHi },
  slotValue: { color: colors.text, fontSize: t.body, fontWeight: "700", fontVariant: ["tabular-nums"] },
  slotValueOn: { color: colors.text },
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
