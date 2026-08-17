# Chalk — working notes

A personal CrossFit log. One user, sideloaded onto an Android Galaxy S21. It
replaces SugarWOD, which only allows scores against the class's programmed
workout and nothing else.

Two jobs, and no others:

1. **Record a PR or an exceptional performance, against anything.** Not just
   today's class WOD. What was the heaviest triple, when, and by how much did it
   move.
2. **Review recent history for a movement at a glance.** "When did I last do
   pull-ups, and how many" is as important as "what is my best triple". This
   must work for bodyweight and gymnastics work, not only loaded lifts.

Everything else is scope creep. There is no social feed, no coaching, no
programming engine, no gym management. Nobody else will ever use this.

**The design bar: five or six taps to log a simple AMRAP, performed exhausted,
lying on the floor, one-handed.** Nothing tappable is smaller than 56dp, the
score pad is custom rather than the system keyboard, and recently-used movements
are always one tap away. If a change adds a tap to the common path, it needs to
earn it.

Read `SPEC.md` for the product reasoning and screen-by-screen detail. This file
is the operating manual: what is decided, what must not be broken, and what to
build next.

---

## Stack (decided — do not relitigate)

| Concern | Choice | Why |
| --- | --- | --- |
| Runtime | Expo SDK 54+, React Native | Managed workflow, no native code needed |
| Routing | expo-router | File-based, typed routes |
| Database | expo-sqlite | On-device, works offline in a basement gym with no signal |
| ORM | drizzle-orm ≥ 0.45 + drizzle-kit | Typed schema, real migrations, same schema if a web client ever appears |
| State | Zustand | Only for the in-progress log draft; everything else reads from SQLite |
| Charts | react-native-gifted-charts | Renders on RN without a WebView |
| Dates | date-fns | No moment, no Temporal polyfill |

Drizzle **must** be ≥ 0.37 — the schema uses array-style index config in the
table callback, which older versions reject. It is verified against 0.45.2.

Local-first with no server. Backup is a JSON export to the share sheet. If sync
is ever wanted, add it behind an interface; do not restructure the schema for it.

---

## Repo layout

```
db/
  schema.ts          five tables, heavily commented — read this first
  score.ts           the ONLY place that knows what a score integer means
  queries.ts         search, PR derivation, activity rollups
  seed.ts            105 movements + 51 benchmark WODs
  migrations/        drizzle-kit generated; migrations.js is the bundled entry
  sql/fts.sql        FTS5 virtual table + sync triggers (hand-written, applied
                     by lib/db.ts on every launch, outside drizzle's journal)
lib/
  db.ts              opens the database, migrates, applies FTS, seeds once
  feel.ts            the 1-5 "felt like" scale and its red->green ramp
  draft.ts           the in-progress log (the ONLY Zustand store)
  entry.ts           stopwatch-style digit entry — 4,1,2 reads as 4:12
  save.ts            draft -> rows, benchmark auto-tagging, PR detection
  theme.ts           design tokens
app/                 expo-router screens
components/          ui.tsx (Chip/Button/Keypad), MovementPicker, PrToast
tests/               vitest, runs against the real generated migration
scripts/make-icons.mjs  regenerates the tally-mark icon set
```

Two build-level gotchas that fail *silently* if disturbed:

- `babel.config.js` needs `babel-plugin-inline-import` for `.sql`. Without it,
  migration imports resolve to a path string and every migration no-ops.
- `metro.config.js` needs `sql` in `resolver.sourceExts` or the bundle cannot
  resolve them at all.

---

## Invariants

Break these and the data goes quietly wrong, which is worse than a crash.

1. **`blocks.raw_text` is never lost.** The verbatim workout is the source of
   truth. Parsing is an enhancement layered on top; a block with zero parsed
   movements is a valid, complete, useful record. Logging must never be blocked
   on the parser understanding the workout.

2. **Scores are integers, in the units declared in `score.ts`.** Grams for load,
   seconds for time, metres for distance. No floats, no kilos in the database,
   no "2:31" strings. Every format and compare goes through `score.ts`.

3. **`prs` is a cache.** It must be fully reconstructible by `rebuildAllPrs()`.
   Never write a record that cannot be re-derived from `blocks` and
   `block_movements`. Estimated 1RMs are display-only and never persisted.

4. **One row per set, and one row per round.** A 5×3 is five `block_movements`
   rows, not one row with a `sets` column. A 21-15-9 Fran is six, because a
   round is not always the same work. This is what lets a rep max fall out of a
   `MAX()` and is why there is no sixth table. `set_number` carries the set for
   strength and the round for a WOD, and is null when there is only one — so
   never read "has a set number" as "is a strength set"; use `blocks.kind`.

5. **Warm-ups and failed reps are flagged, not deleted.** They are excluded from
   PR queries by the flags. Deleting them loses volume data. Only the failed
   flag has a control in the log form; `is_warmup` is still honoured everywhere
   and is set by imported files, so never assume it is always false.

6. **Capped (DNF) scores never set a record.** There is deliberately no Rx /
   scaled concept anywhere in the app — it was removed on 2026-08-06. This is a
   log of what was actually done, not a competition record. Do not reintroduce
   it without being asked.

7. **Dates are local calendar days.** `sessions.date` is `YYYY-MM-DD` in the
   user's timezone. A 6 a.m. session must never land on the previous day.

8. **Movements are archived, never deleted.** Deleting orphans years of history.

9. **`blocks.feel` is optional and never feeds PR logic.** It records how the
   work felt (1 wrecked → 5 flying), not how hard it was, and it lives on the
   block because squats and the running after them rarely feel the same. A bad
   day that still set a record is still a record. Saving must never require it.

10. **Chalk yellow means "record" and nothing else.** The feel ramp runs red →
    neutral → green and skips amber deliberately. Any new colour that drifts
    toward the accent devalues the only colour that is supposed to matter.

---

## v1 — shipped and in use

The whole original build order is done: schema and seed, logging, session
history, movement search, records, activity, and JSON export. Added after that
first pass, and equally part of v1:

- **Per-block feel rating.** `lib/feel.ts`, invariants 9 and 10.
- **Backdating.** `components/DateField.tsx`, all date maths via `lib/dates.ts`.
- **Movement-appropriate fields.** `lib/inputs.ts` — ergs ask for metres and
  calories, everything else for reps and load.
- **Load chart.** `components/LoadChart.tsx`, points coloured by feel.
- **Staged WOD setup.** `components/Stage.tsx` plus the stage machinery at the
  top of `app/log.tsx` — see the decision below. `blocks.rounds`,
  `duration_min`, `every_min`; header text is `wodHeader()` in `lib/draft.ts`.

Where things live, when picking up a thread:

| Concern | File |
| --- | --- |
| What a score integer means | `db/score.ts` |
| Record derivation | `db/queries.ts`, `candidatesForBlock()` |
| Draft → rows, benchmark auto-tagging | `lib/save.ts` |
| The log form | `app/log.tsx` |
| Backup document | `lib/export.ts` |

Later, only if it earns its place: rest timer, a paste-parser that pre-tags
movements from crossfit.com text, plate-loading calculator, Health write.

---

## Working agreements

- Run `npx tsc --noEmit` and `npm test` before saying anything is done. The
  tests run against the real generated migration, not a hand-written copy of it.
- Test `score.ts`, `queries.ts` and `dates.ts` properly; they hold all the logic
  worth getting wrong. UI can be tested by hand.
- Migrations are append-only. Real data now exists on the phone — generate an
  incremental migration, never regenerate `0000`.
- Comments explain *why*. The schema comments are load-bearing — keep them
  current when the model changes.
- Dependencies are pinned exactly and install scripts are off. After changing
  Node version, run `npm run rebuild:native` or the suite dies with
  `Worker exited unexpectedly` and no failing test to point at.

---

## Decided (2026-08-06) — do not relitigate

- **kg**, stored as grams. A lb toggle exists in `score.ts` but is not surfaced.
- **Sets:** a single top-set field that expands into a grid on demand. The grid
  carries the rep count down the rows so only loads need typing.
- **No Rx / scaled.** Removed from the schema entirely. See invariant 6.
- **Setting up a WOD is staged, not a screen of chips** (2026-08-17). One
  question at a time — kind, format, then only the questions that format
  raises — each answered by rotating a single large value between two 76dp
  arrows that never move. A chip row makes you find the right small target
  among several, which is the thing that fails when you are on the floor and
  not really looking. Rotation wraps, so overshooting costs one tap back rather
  than a hunt. `StageCard` and `StageTrail` in `components/Stage.tsx`.
- **The stages hand over to the movement picker.** Finishing the last one opens
  it automatically on a new log, because that is where you were always going.
  Never when editing — dropping someone into a full-screen picker because they
  reopened a block to fix its score is an ambush.
- **A WOD has three formats: For time, AMRAP, EMOM.** Chipper and Rounds were
  removed — both were for-time workouts wearing a different hat, and having
  them as formats meant the round count lived in a rep-scheme string where "5
  rounds" and `rounds` could contradict each other. The enum keeps `chipper`
  and `intervals` for blocks already saved with them; `shownFormat()` in
  `app/log.tsx` shows those as For time.
- **There is no rep scheme anywhere.** A ladder's reps belong to the movements
  performing them, one round at a time — see the round grid below. Named
  ladders additionally carry their wording on the benchmark row, and
  `draft.benchmarkPrescription` puts "21-15-9 reps for time" into the generated
  text verbatim.
- **The round grid fills itself in.** A new round copies the one before it, and
  editing a round carries the change down to every later round that still
  agreed with it. Five uniform rounds are typed once; a 21-15-9 is typed as 21,
  15, 9 — three edits, not nine — because each entry sweeps the rounds below it
  before being corrected in turn. A round given its own value has stopped
  agreeing and is never overwritten again. `patchRound()` in `lib/draft.ts`;
  the log screen mirrors the same carry-down into the keypad buffers.
- **Every number the stages rotate has a keypad escape hatch.** The presets are
  what a class programmes, not a ceiling. Two rounds, ten rounds and a
  24-minute EMOM were all unreachable before, which is what prompted the
  rework. Do not add a preset without asking whether the pad already covers it.
- **Benchmark auto-tagging is ON.** Logging "Fran" writes thruster and pull-up
  rows. This is what makes "recent pull-ups" find WODs and not just strength
  work, which is job 2. The old objection (inflated volume when scaled) died
  with the Rx concept.

## The export format

`lib/export.ts`. Nested, self-describing, and deliberately free of foreign
keys — every movement reference carries its slug and display name, because this
is the file you open in three years possibly without the app. The 156 seeded
movements are not exported; only the user's own additions.

`prs` is **not** exported. It is a cache (invariant 3) and must be rebuilt with
`rebuildAllPrs()`, never restored — exporting it would create a second source of
truth able to disagree with the blocks it came from.

## Restore

`lib/import.ts`. A restore, not a merge: it replaces the log. Merging would
have to decide whether a session on the same date is the same session, and
getting that wrong silently duplicates history.

Two things it must keep doing:

- **Validate everything before writing anything.** Failing partway through
  leaves a log that is neither the old one nor the new one.
- **Never restore `prs`.** It is rebuilt from the blocks afterwards, so a stale
  or hand-edited records block in a file cannot become a second source of
  truth (invariant 3).

Benchmarks are looked up, never created — inventing a "Fran" that is not the
real one would break every search relying on it. Movements the install has
never seen *are* created, flagged `isCustom`, or a backup from another phone
would not restore complete.

Export is at version 2. Version 1 stored `benchmark` as a bare display name;
v2 stores `{ slug, name }`. Import still reads v1.

## Still to do

- **The load chart has never been rendered with real data.** It needs two or
  more sessions of the same lift before it draws at all. Its axis scaling
  (`yAxisOffset` plus a derived `maxValue`) is the part most likely to look
  wrong the first time it appears.
- **`blocks.compare_to_block_id` is dead.** Nothing writes or reads it. It
  survived migration 0002 deliberately: dropping a column in SQLite means
  rebuilding the table, and doing that in the same change as a UI rework, on a
  phone that now holds real data, is risk bought for nothing. Drop it on its
  own, when there is nothing else in flight.
