import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Chip, ChipRow } from "../components/ui";
import { db } from "../lib/db";
import { useDraft } from "../lib/draft";
import { buildExportDoc, exportFilename } from "../lib/export";
import { colors, radius, space, type as t } from "../lib/theme";

export default function Settings() {
  const insets = useSafeAreaInsets();
  const unit = useDraft((s) => s.unit);
  const setUnit = useDraft((s) => s.setUnit);
  const [counts, setCounts] = useState<{ sessions: number; blocks: number; sets: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    buildExportDoc(db)
      .then((d) => setCounts(d.counts))
      .catch(() => setCounts(null));
  }, []);

  /**
   * Writes the JSON to the cache directory and hands it to the share sheet.
   * Cache rather than documents: the file is a transient handoff to Drive or
   * email, and leaving copies behind would quietly grow forever.
   */
  const onExport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const doc = await buildExportDoc(db);
      const file = new File(Paths.cache, exportFilename());
      if (file.exists) file.delete();
      file.create();
      file.write(JSON.stringify(doc, null, 2));

      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Saved", `Sharing unavailable. File written to:\n${file.uri}`);
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: "application/json",
        dialogTitle: "Back up Chalk",
        UTI: "public.json",
      });
    } catch (e: any) {
      Alert.alert("Export failed", String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: space.xxl + insets.bottom }}
    >
      <Text style={st.label}>Units</Text>
      <ChipRow>
        <Chip label="kg" selected={unit === "kg"} onPress={() => setUnit("kg")} />
        <Chip label="lb" selected={unit === "lb"} onPress={() => setUnit("lb")} />
      </ChipRow>
      <Text style={st.note}>
        Loads are always stored in grams. This only changes how they are shown,
        so switching never rewrites anything you have logged.
      </Text>

      <Text style={st.label}>Backup</Text>
      <View style={st.card}>
        <Text style={st.body}>
          {counts
            ? `${counts.sessions} ${counts.sessions === 1 ? "session" : "sessions"}, ${counts.blocks} ${
                counts.blocks === 1 ? "block" : "blocks"
              }, ${counts.sets} logged ${counts.sets === 1 ? "entry" : "entries"}.`
            : "Reading the log…"}
        </Text>
        <Text style={[st.note, st.noteFlush]}>
          One JSON file holding every session, with the workout text exactly as
          you wrote it. Readable on its own, without this app.
        </Text>
        <Button
          label={busy ? "Preparing…" : "Export a backup"}
          onPress={onExport}
          disabled={busy}
          style={{ marginTop: space.md }}
        />
      </View>

      <Text style={st.label}>About</Text>
      <Text style={st.note}>
        Chalk keeps everything on this phone. There is no account, no server and
        nothing leaves the device unless you export it yourself.
      </Text>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  label: {
    color: colors.textFaint,
    fontSize: t.label,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    marginHorizontal: space.lg,
  },
  body: { color: colors.text, fontSize: t.body, fontWeight: "600" },
  note: {
    color: colors.textFaint,
    fontSize: t.label,
    lineHeight: 19,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  noteFlush: { paddingHorizontal: 0 },
});
