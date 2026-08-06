import { StyleSheet, Text, View } from "react-native";
import { formatScore, type Unit } from "../db/score";
import type { SavedPr } from "../lib/save";
import { colors, radius, space, type as t } from "../lib/theme";
import { Button } from "./ui";

/**
 * The PR moment, shown at the instant it is set rather than making the user go
 * looking for it. A record is marked by a change in weight and one accent
 * colour — no badge, no confetti, no trophy.
 */
export function PrToast({
  prs,
  unit,
  onDone,
}: {
  prs: SavedPr[];
  unit: Unit;
  onDone: () => void;
}) {
  return (
    <View style={st.scrim}>
      <View style={st.card}>
        <Text style={st.kicker}>{prs.length > 1 ? `${prs.length} new records` : "New record"}</Text>

        {prs.map((p) => {
          const delta =
            p.previousValue != null
              ? p.scoreType === "time"
                ? p.previousValue - p.value
                : p.value - p.previousValue
              : null;
          return (
            <View key={`${p.movementId}-${p.repScheme}`} style={st.row}>
              <Text style={st.name}>
                {p.name}
                {p.scoreType === "load" ? ` · ${p.repScheme}RM` : ""}
              </Text>
              <Text style={st.value}>
                {formatScore(p.scoreType as any, p.value, { unit })}
              </Text>
              {delta != null && (
                <Text style={st.delta}>
                  {p.scoreType === "load"
                    ? `+${formatScore("load", delta, { unit })} on your last`
                    : p.scoreType === "time"
                      ? `${formatScore("time", Math.abs(delta))} faster`
                      : `+${delta}`}
                </Text>
              )}
              {delta == null && <Text style={st.delta}>First one on record</Text>}
            </View>
          );
        })}

        <Button label="Done" onPress={onDone} style={{ marginTop: space.lg }} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(8,7,6,0.86)",
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
  },
  card: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: space.xl,
  },
  kicker: {
    color: colors.accent,
    fontSize: t.label,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: space.lg,
  },
  row: { marginBottom: space.lg },
  name: { color: colors.textDim, fontSize: t.body, fontWeight: "600" },
  value: {
    color: colors.accent,
    fontSize: t.display,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    marginTop: space.xs,
  },
  delta: { color: colors.textFaint, fontSize: t.label, marginTop: space.xs },
});
