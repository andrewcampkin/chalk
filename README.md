# Chalk

A CrossFit logbook for Android. Log what you actually did, whether that is the
class WOD, a heavy single or an EMOM you made up, and see your records and your
recent history for any movement at a glance.

Everything stays on the phone. There is no account, no server and no feed, and
the app works in a basement gym with no signal.

Developed by [Hurricane Gaming](https://andrewcampkin.github.io/hurricane-gaming/).

## What it does

- **Logs a WOD or a strength piece.** A WOD is for time, an AMRAP or an EMOM,
  set up one question at a time by swiping through the options. A strength
  piece is a set of sets. The workout text is generated from what you tap and
  stays editable.
- **One row per round or set.** Three rounds lay out three rows, each pre-filled
  from the one above, so a uniform workout is typed once and a 21-15-9 is typed
  as 21, 15, 9.
- **Fields follow the movement.** Runs and ergs ask for metres and calories,
  gymnastics for reps alone, everything else for reps and load.
- **Backdates.** Today and Yesterday are one tap; older days open a calendar.
- **Rates how each block felt**, 1 to 5, and shows it as colour wherever history
  appears.
- **Searches** movements, named benchmarks and the full text of every workout.
- **Derives personal records** automatically and shows the moment one is set.
- **Backs up and restores.** Export writes a JSON file to the share sheet;
  restore reads one back and rebuilds the records from the workouts.

The movement vocabulary and the benchmark WODs ship preloaded. Logging Fran tags
thruster and pull-up, so searching "thruster" finds every Fran you have done.

## Get it on your phone

Chalk is not on the Play Store. You can try it inside Expo Go without building
anything, or build an APK and install it like any other app.

It has only ever been run on Android. Nothing in it is Android-specific, so it
would probably work in Expo Go on an iPhone, but nobody has tried.

Both routes need Node 24 and npm 11 or later on your computer. Clone the
repository and install first:

```bash
git clone https://github.com/andrewcampkin/chalk.git
cd chalk
npm install
```

### Try it in Expo Go

Install [Expo Go](https://expo.dev/go) from the Play Store, put the phone on the
same Wi-Fi as your computer, then:

```bash
npx expo start
```

Scan the QR code from Expo Go. The whole app, database included, runs inside
Expo Go without a custom build. Anything you log there lives inside Expo Go and
does not carry over to an installed APK, so export a backup from Settings if
you want to keep it.

### Build an APK

Builds run on Expo Application Services (EAS), which has a free tier. Install
the CLI and sign in:

```bash
npm install -g eas-cli
eas login
```

The package is `eas-cli` and its binary is `eas`. Do not run `npx eas`: an
unrelated placeholder package called `eas` exists on npm, and npx fetches that
instead. Use `npx eas-cli` if you would rather not install it globally.

Register the project with your Expo account. The project id is not committed:
`app.config.js` reads it from a `.env` file at the repository root, which git
ignores. `eas init` cannot write into a dynamic config, so it prints the id
for you to put there:

```bash
eas init
echo "EAS_PROJECT_ID=<the id eas init printed>" > .env
eas build --platform android --profile preview
```

Without that file, `eas` stops with "EAS project not configured".

The build prints a link. Open it on the phone, download the APK and install it,
allowing "install unknown apps" for whichever app opens it.

Use the **preview** profile. It is the only one that produces an installable
APK: `production` builds an Android App Bundle, which is for the Play Store and
cannot be sideloaded.

Before the second build:

- **Keep the keystore EAS generates.** Android only installs an update over an
  existing app if both are signed with the same key. Lose it and the only way
  to install is to uninstall first.
- **Uninstalling deletes the database.** The log lives in the app's private
  storage and nothing backs it up anywhere. Export from Settings before any
  uninstall.

If you intend to distribute your build, also change `android.package` in
`app.json`, which names the maintainer.

### First run

A new install opens on today with two buttons. To look at the history screens
before you have any, **Settings > Sample data > Load** adds twelve weeks of
plausible training. **Remove** deletes exactly those sessions and leaves your
own alone.

## Developing

Node 24 (developed on 24.19) and npm 11 or later.

```bash
npm install
npm run rebuild:native
npm test
npm run typecheck
npx expo start
```

**Install scripts are off.** `.npmrc` sets `ignore-scripts=true`, because
install scripts are the usual delivery mechanism for a compromised npm release.
Two dev dependencies need theirs: better-sqlite3 compiles a native binding and
esbuild links a platform binary. `npm run rebuild:native` builds exactly those
two. Nothing the app ships at runtime needs an install script, which is why the
Expo Go route above skips this step.

**Re-run `npm run rebuild:native` after changing Node version.** better-sqlite3
is compiled against the Node ABI. Skip it and the test suite dies with
`Worker exited unexpectedly` and no failing test to point at.

**Everything is pinned exactly.** `.npmrc` sets `save-exact=true` and
`min-release-age=2` days, so `npm install <pkg>` writes an exact version and
refuses anything published in the last two days.

**Metro and Windows Firewall.** If the phone cannot reach the dev server, check
for inbound *Block* rules on `node.exe`. A dismissed firewall prompt saves one
permanently, and a Block always beats an Allow.

### Layout

```
db/
  schema.ts        five tables: movements, sessions, blocks, block_movements, prs
  score.ts         the only place that knows what a score integer means
  queries.ts       search, PR derivation, activity rollups
  seed.ts          the movement vocabulary and the benchmark WODs
  migrations/      drizzle-kit output; migrations.js is the bundled entry
  sql/fts.sql      FTS5 table and triggers, rebuilt by lib/db.ts on every launch
lib/
  db.ts            opens the database, migrates, applies FTS, seeds once
  draft.ts         the in-progress log (the only Zustand store) and its generated text
  save.ts          draft to rows, benchmark auto-tagging, PR detection
  edit.ts          a saved block back to a draft
  export.ts        the backup document
  import.ts        validate-then-replace restore
  sample.ts        the loadable sample history
app/               expo-router screens; log.tsx is the entry form
components/        Chip, Button, Keypad, the staged setup, the movement picker
tests/             vitest, run against the real generated migration
scripts/           make-icons.mjs draws the app icon; run with npm run icons
```

### The data model

Getting these wrong corrupts the log quietly, which is worse than a crash.

- **`blocks.raw_text` is the source of truth.** The verbatim workout is never
  lost. A block with zero parsed movements is a complete record.
- **Scores are integers** in the units `score.ts` declares: grams, seconds,
  metres. Every format and compare goes through `score.ts`.
- **`prs` is a cache.** `rebuildAllPrs()` reconstructs it from `blocks` and
  `block_movements`, and export never writes it.
- **One row per set and one per round.** A 5x3 is five `block_movements` rows;
  Fran is six. `set_number` is the set for strength and the round for a WOD.
  Use `blocks.kind` to tell them apart.
- **Load records come from strength blocks only.** A WOD contributes its time
  or rounds; the load on a Fran thruster is prescribed volume, not an attempt.
- **A failed rep is flagged, not deleted.** It stays in the log and out of the
  records.
- **Dates are local calendar days.** A 6 a.m. session never lands on the day
  before.
- **Movements are archived, never deleted.**

### Changing the schema

Edit `db/schema.ts`, then `npm run db:generate`. Migrations are append-only. A
migration that drops a column must drop the FTS triggers first, because SQLite
refuses `DROP COLUMN` while a trigger names the column; `lib/db.ts` rebuilds
the triggers from `db/sql/fts.sql` on the next launch.

Two build settings fail silently if removed. `babel.config.js` needs
`babel-plugin-inline-import` for `.sql`, or every migration imports as a path
string and applies as a no-op. `metro.config.js` needs `sql` in
`resolver.sourceExts`, or the app dies on first launch.

### The backup format

`lib/export.ts` writes a nested document with no foreign keys: every movement
reference carries its slug and display name. `lib/import.ts` is a restore, not
a merge. It validates the whole file before writing anything, then replaces the
log.

A backup written by any build must stay restorable by every later build.
Bumping `EXPORT_VERSION` means keeping the reader for what came before.
`MIN_IMPORT_VERSION` is the oldest document that still restores and does not
move.

## Contributing

Chalk is a personal project, shared so that anyone can run it, read it or build
on it. It is not taking pull requests or issues, and the licence is permissive
so that you do not need to ask: fork it and make it yours. Bugs you find and
features you want are best fixed in your fork.

## License

MIT. See [LICENSE](LICENSE).
