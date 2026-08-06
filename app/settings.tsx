import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Chip, ChipRow } from "../components/ui";
import { db } from "../lib/db";
import { useDraft } from "../lib/draft";
import { buildExportDoc, exportFilename } from "../lib/export";
import { currentLogSize, importBackup, parseBackup } from "../lib/import";
import { loadSampleData, removeSampleData, sampleDataCount } from "../lib/sample";
import { colors, radius, space, type as t } from "../lib/theme";

export default function Settings() {
  const insets = useSafeAreaInsets();
  const unit = useDraft((s) => s.unit);
  const setUnit = useDraft((s) => s.setUnit);
  const [counts, setCounts] = useState<{ sessions: number; blocks: number; sets: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [samples, setSamples] = useState(0);

  const refresh = useCallback(() => {
    buildExportDoc(db)
      .then((d) => setCounts(d.counts))
      .catch(() => setCounts(null));
    sampleDataCount(db).then(setSamples).catch(() => setSamples(0));
  }, []);

  useEffect(refresh, [refresh]);

  /**
   * Pick a file, validate it completely, show what is about to be lost, and
   * only then write. The confirmation names both sides, because a restore is
   * the one action here that destroys data.
   */
  const onRestore = async () => {
    if (busy) return;
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/plain", "*/*"],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]) return;

      const file = new File(picked.assets[0].uri);
      const parsed = parseBackup(await file.text());

      if (!parsed.ok) {
        Alert.alert("Cannot read that file", parsed.errors.slice(0, 6).join("\n\n"));
        return;
      }

      const incoming = parsed.doc.counts?.sessions ?? parsed.doc.sessions.length;
      const current = await currentLogSize(db);

      Alert.alert(
        "Replace everything logged?",
        `The backup holds ${incoming} ${incoming === 1 ? "session" : "sessions"}.\n\n` +
          `This deletes the ${current.sessions} ${current.sessions === 1 ? "session" : "sessions"} ` +
          `currently on this phone and cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Replace",
            style: "destructive",
            onPress: () =>
              withBusy(async () => {
                const summary = await importBackup(db, parsed.doc);
                Alert.alert(
                  "Restored",
                  `${summary.sessions} sessions, ${summary.blocks} blocks.` +
                    (summary.movementsCreated
                      ? `\n${summary.movementsCreated} movement(s) added that this install did not have.`
                      : ""),
                );
              }),
          },
        ],
      );
    } catch (e: any) {
      Alert.alert("Restore failed", String(e?.message ?? e));
    }
  };

  const withBusy = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      refresh();
    } catch (e: any) {
      Alert.alert("Failed", String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

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

      <Text style={st.label}>Restore</Text>
      <View style={st.card}>
        <Text style={[st.note, st.noteFlush]}>
          Reads a backup file back in. This replaces everything currently
          logged, rather than merging — a backup answers "put it back how it
          was". Records are rebuilt from the workouts, never taken from the
          file.
        </Text>
        <Button
          label={busy ? "Working…" : "Restore from a backup"}
          variant="ghost"
          disabled={busy}
          onPress={onRestore}
          style={{ marginTop: space.md }}
        />
      </View>

      {/* Development only — never reachable in a release build. */}
      {__DEV__ && (
        <>
          <Text style={st.label}>Sample data</Text>
          <View style={st.card}>
            <Text style={st.body}>
              {samples > 0 ? `${samples} sample sessions loaded.` : "None loaded."}
            </Text>
            <Text style={[st.note, st.noteFlush]}>
              Twelve weeks of plausible training, for looking at the charts and
              the activity screen before there is real history. Every session it
              creates is labelled, and removing them touches nothing you logged
              yourself.
            </Text>
            <View style={{ flexDirection: "row", gap: space.md, marginTop: space.md }}>
              <Button
                label={busy ? "Working…" : "Load"}
                variant="ghost"
                disabled={busy || samples > 0}
                style={{ flex: 1 }}
                onPress={() => withBusy(async () => { await loadSampleData(db); })}
              />
              <Button
                label="Remove"
                variant="danger"
                disabled={busy || samples === 0}
                style={{ flex: 1 }}
                onPress={() => withBusy(async () => { await removeSampleData(db); })}
              />
            </View>
          </View>
        </>
      )}

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
