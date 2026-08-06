# Chalk

A personal CrossFit logbook. One user, sideloaded onto an Android phone.

Most gym logging apps only let you post a score against the class's programmed
workout. Chalk records anything you actually did.

<!-- The mark is a tally group: four strokes and a diagonal. -->

## Why it exists

Two jobs, and no others:

1. **Record a PR or an exceptional performance, against anything.** Not just
   today's class WOD. What was the heaviest triple, when, and by how much did
   it move.
2. **Review recent history for a movement at a glance.** "When did I last do
   pull-ups, and how many" matters as much as "what is my best triple" — so it
   has to work for bodyweight and gymnastics work, not only loaded lifts.

There is no social feed, no coaching, no programming engine, no gym management,
and no account. Everything stays on the phone.

**The design bar is five or six taps to log a simple AMRAP, performed
exhausted, lying on the floor, one-handed.** Nothing tappable is smaller than
56dp, the score pad is custom rather than the system keyboard, and
recently-used movements are always one tap away.

## What v1 does

- **Log a WOD or a strength piece.** Pick a format (for time, AMRAP, EMOM,
  rounds, chipper), tap movements from your recent list, enter one score. The
  verbatim workout text is *generated* from what you tapped, and stays editable.
- **Structured entry that matches the movement.** Runs and ergs ask for metres
  and calories; barbell and gymnastics work asks for reps and load. Strength
  opens as a single top-set field and expands into a set grid on demand.
- **Backdate anything.** Today and Yesterday are one tap; older days open a
  calendar. Future days are refused.
- **Rate how it felt**, 1 (wrecked) to 5 (flying), per block rather than per
  session — because the squats and the running after them rarely feel the same.
  It shows up as colour everywhere history appears.
- **Search** movements, named benchmarks, and the full text of anything logged.
- **Records** derived automatically, with the moment surfaced as it happens.
- **Backup** to a self-describing JSON file via the share sheet.

105 movements and 51 benchmark WODs ship preloaded, so nothing needs typing on
day one. Logging "Fran" also tags thruster and pull-up, which is what makes
searching "thruster" find every Fran you have ever done.

## Running it

Requires a recent Node (developed on 24.19) and an Android phone on the same
network.

```bash
npm install
npm run rebuild:native   # see "Install scripts are off" below
npx expo start
```

Open the printed `exp://` URL in Expo Go. `expo-sqlite` runs inside Expo Go, so
the whole app including the database works without a custom build.

```bash
npm test         # 63 tests
npm run typecheck
```

## Building an APK to sideload

```bash
npm install -g eas-cli
eas login
eas init
eas build --platform android --profile preview
```

The package is `eas-cli` and its binary is `eas`. Do not run `npx eas` — an
unrelated placeholder package called `eas` exists on npm, so npx fetches that
instead and fails with "could not determine executable to run". Use
`npx eas-cli …` if you would rather not install it globally.

`eas init` writes `extra.eas.projectId` into `app.json` — commit that. The build
prints a link; open it on the phone and install, allowing "install unknown
apps" for whichever app opens it.

Use the **preview** profile. It is the only one that produces an installable
APK: `production` builds an Android App Bundle, which is for the Play Store and
cannot be sideloaded. A universal APK covers the arm64 devices this targets.

Two things worth knowing before the second build:

- **Keep the keystore EAS generates.** Android will only install an update over
  an existing app if both are signed with the same key. Lose it, or let a new
  one be generated, and the only way to install is to uninstall first.
- **Uninstalling deletes the database.** The log lives in the app's private
  storage and nothing is backed up anywhere. Export from Settings before any
  uninstall.

## Gotchas

**Install scripts are off.** `.npmrc` sets `ignore-scripts=true`, because
install scripts are the usual delivery mechanism for a compromised npm release
and they run before any code is imported. Two dev dependencies genuinely need
theirs — better-sqlite3 compiles a native binding, esbuild links a platform
binary — so build them deliberately with `npm run rebuild:native`. Nothing the
app ships at runtime needs an install script.

**Re-run `npm run rebuild:native` after changing Node version.** better-sqlite3
is compiled against the Node ABI. Skip it and the test suite dies with
`Worker exited unexpectedly` and a native assertion, with no failing test to
point at.

**Everything is pinned exactly.** No carets, no tildes. `save-exact=true` and
`min-release-age=2` (days) are set so a routine install cannot pull in an
unreviewed or freshly-published version.

**Metro and Windows Firewall.** If the phone cannot reach the dev server, check
for inbound *Block* rules on `node.exe` — a dismissed firewall prompt saves one
permanently, and in Windows Firewall a Block always beats an Allow.

## How it fits together

```
db/       schema, seed, queries, migrations — the data model
lib/      db client, draft store, save path, formatting, theme
app/      expo-router screens
components/
tests/    vitest, run against the real generated migration
```

Five tables: `movements`, `sessions`, `blocks`, `block_movements`, `prs`.

The design rests on two ideas. `blocks.raw_text` holds the workout verbatim, so
a block the parser understood nothing about is still a complete, findable
record. And `block_movements` is both the search index and the set log — one
row per set, which is what lets a rep max fall out of a `MAX()` and is why
there is no sixth table.

- **[SPEC.md](SPEC.md)** — the product reasoning and screen-by-screen detail.
- **[CLAUDE.md](CLAUDE.md)** — the operating manual: what is decided, what must
  not be broken, and what to build next. Read the invariants before changing
  the data model.

## Status

v1, and in use. Not published anywhere and not intended to be — it is a
single-user app with a single user.

Backup and restore both work: export writes a self-describing JSON file, and
restore reads one back, rebuilding records from the workouts rather than
trusting the file.
