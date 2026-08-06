import { Pressable, StyleSheet, Text, View } from "react-native";
import { FEELS, feelColor, feelColorContinuous, feelLabel } from "../lib/feel";
import { colors, radius, space, tap, type as t } from "../lib/theme";

/**
 * One optional tap. Tapping the selected value again clears it, so the rating
 * never becomes something you are forced to answer to save a workout.
 */
export function FeelPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <View style={st.picker}>
      {FEELS.map((f) => {
        const on = value === f.value;
        return (
          <Pressable
            key={f.value}
            onPress={() => onChange(on ? null : f.value)}
            style={({ pressed }) => [
              st.seg,
              on && { backgroundColor: f.color, borderColor: f.color },
              pressed && { opacity: 0.7 },
            ]}
          >
            <View style={[st.dot, { backgroundColor: on ? "#12100E" : f.color }]} />
            <Text style={[st.segText, on && st.segTextOn]} numberOfLines={1}>
              {f.short}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The at-a-glance indicator used everywhere history is surfaced. */
export function FeelDot({
  feel,
  size = 10,
  continuous,
}: {
  feel: number | null | undefined;
  size?: number;
  continuous?: boolean;
}) {
  const c = continuous ? feelColorContinuous(feel) : feelColor(feel);
  if (!c) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: colors.line,
        }}
      />
    );
  }
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c }} />;
}

/** A left-edge rule on a card — colour without a badge. */
export function FeelRule({ feel }: { feel: number | null | undefined }) {
  const c = feelColor(feel);
  if (!c) return null;
  return <View style={[st.rule, { backgroundColor: c }]} />;
}

export function FeelTag({ feel }: { feel: number | null | undefined }) {
  const c = feelColor(feel);
  const label = feelLabel(feel);
  if (!c || !label) return null;
  return (
    <View style={st.tag}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />
      <Text style={[st.tagText, { color: c }]}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  picker: { flexDirection: "row", gap: 6, paddingHorizontal: space.lg },
  seg: {
    flex: 1,
    minHeight: tap.min - 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: space.sm,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  segText: { color: colors.textFaint, fontSize: 10, fontWeight: "700" },
  segTextOn: { color: "#12100E" },

  rule: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
  },
  tag: { flexDirection: "row", alignItems: "center", gap: 5 },
  tagText: { fontSize: t.tiny, fontWeight: "700", letterSpacing: 0.6 },
});
