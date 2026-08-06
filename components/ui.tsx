import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, radius, space, tap, type as t } from "../lib/theme";

/* -------------------------------------------------------------------------- */
/* Chip — the one-tap primitive the whole log screen is built from             */
/* -------------------------------------------------------------------------- */

export function Chip({
  label,
  selected,
  onPress,
  onLongPress,
  tone = "default",
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  tone?: "default" | "accent" | "danger";
  style?: StyleProp<ViewStyle>;
}) {
  const active = selected ?? false;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        s.chip,
        active && s.chipOn,
        tone === "accent" && active && s.chipAccent,
        tone === "danger" && s.chipDanger,
        pressed && s.pressed,
        style,
      ]}
      hitSlop={6}
    >
      <Text
        style={[s.chipText, active && s.chipTextOn, tone === "accent" && active && s.chipTextAccent]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.chipRow}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function WrapRow({ children }: { children: React.ReactNode }) {
  return <View style={s.wrapRow}>{children}</View>;
}

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        variant === "primary" && s.btnPrimary,
        variant === "ghost" && s.btnGhost,
        variant === "danger" && s.btnDanger,
        disabled && s.btnDisabled,
        pressed && s.pressed,
        style,
      ]}
    >
      <Text
        style={[
          s.btnText,
          variant === "primary" && s.btnTextPrimary,
          variant === "danger" && s.btnTextDanger,
          disabled && s.btnTextDisabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Keypad — the reason this app is usable lying on the floor                   */
/* -------------------------------------------------------------------------- */

/**
 * A purpose-built numeric pad rather than the system keyboard. The OS number
 * pad puts 28dp targets at the bottom of a 6.2" screen and fights the scroll
 * view; these are 64dp and never move.
 */
export function Keypad({
  onDigit,
  onBackspace,
  onDot,
  onClear,
  dotLabel = ".",
  showDot = true,
}: {
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onDot?: () => void;
  onClear?: () => void;
  dotLabel?: string;
  showDot?: boolean;
}) {
  const Key = ({ label, onPress, dim }: { label: string; onPress: () => void; dim?: boolean }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.key, pressed && s.keyPressed]}
      android_disableSound={false}
    >
      <Text style={[s.keyText, dim && s.keyTextDim]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={s.keypad}>
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <Key key={d} label={d} onPress={() => onDigit(d)} />
      ))}
      {showDot ? (
        <Key label={dotLabel} onPress={() => onDot?.()} dim />
      ) : (
        <Key label="C" onPress={() => onClear?.()} dim />
      )}
      <Key label="0" onPress={() => onDigit("0")} />
      <Key label="⌫" onPress={onBackspace} dim />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* layout bits                                                                 */
/* -------------------------------------------------------------------------- */

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Empty({ text }: { text: string }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyText}>{text}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  pressed: { opacity: 0.6 },

  chip: {
    minHeight: tap.chip,
    justifyContent: "center",
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    marginRight: space.sm,
    marginBottom: space.sm,
  },
  chipOn: { backgroundColor: colors.surfaceHi, borderColor: colors.textDim },
  chipAccent: { backgroundColor: colors.accentDim, borderColor: colors.accent },
  chipDanger: { borderColor: colors.danger },
  chipText: { color: colors.textDim, fontSize: t.body, fontWeight: "600" },
  chipTextOn: { color: colors.text },
  chipTextAccent: { color: colors.accent },
  chipRow: { paddingHorizontal: space.lg, paddingVertical: space.xs },
  wrapRow: { flexDirection: "row", flexWrap: "wrap" },

  btn: {
    minHeight: tap.min,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xl,
    borderWidth: 1,
    borderColor: colors.line,
  },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnGhost: { backgroundColor: "transparent" },
  btnDanger: { backgroundColor: "transparent", borderColor: colors.danger },
  btnDisabled: { opacity: 0.35 },
  btnText: { fontSize: t.body, fontWeight: "700", color: colors.text },
  btnTextPrimary: { color: "#1A1508" },
  btnTextDanger: { color: colors.danger },
  btnTextDisabled: { color: colors.textFaint },

  keypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
  },
  key: {
    width: "31.5%",
    height: tap.key,
    marginBottom: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHi,
    alignItems: "center",
    justifyContent: "center",
  },
  keyPressed: { backgroundColor: colors.line },
  keyText: {
    fontSize: 26,
    fontWeight: "600",
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  keyTextDim: { color: colors.textDim },

  label: {
    color: colors.textFaint,
    fontSize: t.label,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: space.sm,
    paddingHorizontal: space.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    marginHorizontal: space.lg,
    marginBottom: space.md,
  },
  empty: { padding: space.xxl, alignItems: "center" },
  emptyText: { color: colors.textFaint, fontSize: t.body, textAlign: "center" },
});
