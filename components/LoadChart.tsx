import { format, parseISO } from "date-fns";
import { useMemo } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { formatLoad, gramsToKg, gramsToLb, type Unit } from "../db/score";
import { feelColor } from "../lib/feel";
import { colors, radius, space, type as t } from "../lib/theme";

export type LoadPoint = {
  date: string;
  loadG: number;
  reps: number | null;
  feel: number | null;
};

/**
 * Top set over time.
 *
 * Restrained on purpose — this is a logbook, not a dashboard. No gridlines, no
 * y-axis furniture, no gradient fill. The line carries the trend and each point
 * is coloured by how that session felt, which is the part you cannot get from
 * the numbers alone.
 */
export function LoadChart({ points, unit }: { points: LoadPoint[]; unit: Unit }) {
  const { width } = useWindowDimensions();

  const data = useMemo(
    () =>
      points.map((p) => {
        const c = feelColor(p.feel);
        return {
          value: unit === "kg" ? gramsToKg(p.loadG) : gramsToLb(p.loadG),
          // Unrated sessions still get a point, just a quiet one.
          dataPointColor: c ?? colors.textDim,
          dataPointRadius: c ? 5 : 3.5,
          label: format(parseISO(p.date), "MMM"),
        };
      }),
    [points, unit],
  );

  if (points.length < 2) return null;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const best = points.reduce((a, b) => (b.loadG > a.loadG ? b : a), points[0]);
  const latest = points[points.length - 1];

  // Leave a little air above and below so the line never touches the edges.
  const pad = Math.max(2, (max - min) * 0.25);

  return (
    <View style={st.wrap}>
      <View style={st.header}>
        <View>
          <Text style={st.big}>{formatLoad(latest.loadG, unit)}</Text>
          <Text style={st.caption}>
            latest{latest.reps ? ` · ${latest.reps} rep${latest.reps === 1 ? "" : "s"}` : ""}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={st.bigDim}>{formatLoad(best.loadG, unit)}</Text>
          <Text style={st.caption}>best · {format(parseISO(best.date), "MMM yy")}</Text>
        </View>
      </View>

      <LineChart
        data={data}
        width={width - space.lg * 2 - space.lg * 2}
        height={120}
        initialSpacing={10}
        endSpacing={10}
        adjustToWidth
        thickness={2}
        color={colors.textDim}
        hideRules
        hideYAxisText
        yAxisThickness={0}
        xAxisThickness={0}
        yAxisOffset={Math.max(0, min - pad)}
        maxValue={max + pad - Math.max(0, min - pad)}
        hideDataPoints={false}
        xAxisLabelTextStyle={st.axis}
        curved
        isAnimated={false}
      />
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    marginHorizontal: space.lg,
    overflow: "hidden",
  },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: space.md },
  big: { color: colors.text, fontSize: 26, fontWeight: "700", fontVariant: ["tabular-nums"] },
  bigDim: { color: colors.textDim, fontSize: 26, fontWeight: "700", fontVariant: ["tabular-nums"] },
  caption: { color: colors.textFaint, fontSize: t.tiny, marginTop: 2 },
  axis: { color: colors.textFaint, fontSize: 9 },
});
