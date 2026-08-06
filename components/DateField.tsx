import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Chip, ChipRow } from "./ui";
import {
  WEEKDAYS,
  describeIso,
  isFutureIso,
  monthGrid,
  monthLabel,
  shiftIso,
  shiftMonth,
  todayIso,
} from "../lib/dates";
import { colors, radius, space, type as t } from "../lib/theme";

/**
 * Today by default — zero taps for the normal case. Yesterday is one tap,
 * because "I forgot to log last night" is the only backdating that happens
 * often. Anything older opens the calendar.
 *
 * The chosen date is always stated in words above the workout, since a block
 * silently filed under the wrong day is worse than one that is missing.
 */
export function DateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (iso: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(value);

  const today = todayIso();
  const yesterday = shiftIso(today, -1);
  const isPreset = value === today || value === yesterday;

  return (
    <View>
      <ChipRow>
        <Chip label="Today" selected={value === today} onPress={() => onChange(today)} />
        <Chip label="Yesterday" selected={value === yesterday} onPress={() => onChange(yesterday)} />
        <Chip
          label={isPreset ? "Another day" : describeIso(value)}
          selected={!isPreset}
          onPress={() => {
            setCursor(value);
            setOpen((o) => !o);
          }}
        />
      </ChipRow>

      {open && (
        <View style={st.cal}>
          <View style={st.calHead}>
            <Pressable onPress={() => setCursor(shiftMonth(cursor, -1))} hitSlop={12} style={st.nav}>
              <Text style={st.navText}>‹</Text>
            </Pressable>
            <Text style={st.month}>{monthLabel(cursor)}</Text>
            <Pressable onPress={() => setCursor(shiftMonth(cursor, 1))} hitSlop={12} style={st.nav}>
              <Text style={st.navText}>›</Text>
            </Pressable>
          </View>

          {/* Explicit rows of seven flex cells. Percentage widths cannot tile
              7 columns — 100/7 rounds up per cell, overflows 100%, and the
              seventh day wraps onto the next line, sliding every date out of
              alignment with its weekday heading. */}
          <View style={st.row}>
            {WEEKDAYS.map((w, i) => (
              <View key={i} style={st.cell}>
                <Text style={st.weekday}>{w}</Text>
              </View>
            ))}
          </View>

          {weeksOf(monthGrid(cursor)).map((week, w) => (
            <View key={w} style={st.row}>
              {week.map((iso, i) => {
                if (!iso) return <View key={i} style={st.cell} />;
                const future = isFutureIso(iso);
                const selected = iso === value;
                const isToday = iso === today;
                return (
                  <Pressable
                    key={i}
                    disabled={future}
                    onPress={() => {
                      onChange(iso);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [
                      st.cell,
                      selected && st.cellOn,
                      pressed && !future && { opacity: 0.6 },
                    ]}
                  >
                    <Text style={[st.day, future && st.dayFuture, selected && st.dayOn]}>
                      {Number(iso.slice(8, 10))}
                    </Text>
                    {isToday && !selected && <View style={st.todayDot} />}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** 42 cells into 6 rows of 7. */
function weeksOf(cells: (string | null)[]): (string | null)[][] {
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const st = StyleSheet.create({
  cal: {
    marginHorizontal: space.lg,
    marginTop: space.xs,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  calHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.sm,
  },
  nav: { width: 44, height: 40, alignItems: "center", justifyContent: "center" },
  navText: { color: colors.textDim, fontSize: 26, fontWeight: "700" },
  month: { color: colors.text, fontSize: t.body, fontWeight: "700" },

  row: { flexDirection: "row" },
  weekday: {
    textAlign: "center",
    color: colors.textFaint,
    fontSize: t.tiny,
    fontWeight: "700",
    marginBottom: space.xs,
  },
  cell: {
    flex: 1,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  // Not the accent — chalk yellow means "record" and nothing else.
  cellOn: { backgroundColor: colors.surfaceHi, borderRadius: radius.sm },
  day: { color: colors.text, fontSize: 15, fontVariant: ["tabular-nums"] },
  dayFuture: { color: colors.textFaint, opacity: 0.4 },
  dayOn: { fontWeight: "800" },
  todayDot: {
    position: "absolute",
    bottom: 6,
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.textDim,
  },
});
