# Chalk — working notes

A personal CrossFit log. One user, sideloaded onto an Android Galaxy S21.

Two jobs:

- **Record a PR or an exceptional performance, against anything** — not just
  today's class WOD.
- **Review recent history for a movement at a glance.** "When did I last do
  pull-ups, and how many" matters as much as "what is my best triple", so it
  has to work for gymnastics and not only for loaded lifts.

Everything else is scope creep.

**The design bar: five or six taps to log a simple AMRAP, performed exhausted,
lying on the floor, one-handed.** Nothing tappable is smaller than 56dp, the
score pad is custom rather than the system keyboard, and recently-used movements
are one tap away. A change that adds a tap to the common path has to earn it.

`SPEC.md` has the product reasoning and the screens.

---

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Runtime | Expo SDK 54+, React Native | Managed workflow, no native code needed |
| Routing | expo-router | File-based, typed routes |
| Database | expo-sqlite | Works offline in a basement gym with no signal |
| ORM | drizzle-orm ≥ 0.45 + drizzle-kit | Typed schema, real migrations |
| State | Zustand | Only the in-progress draft; everything else reads SQLite |
| Charts | react-native-gifted-charts | Renders on RN without a WebView |
| Dates | date-fns | No moment, no Temporal polyfill |

Drizzle must be ≥ 0.37 — the schema uses array-style index config in the table
callback, which older versions reject. Verified against 0.45.2.

Local-first, no server. Backup is a JSON export to the share sheet.

---

## Repo layout

```
db/
  schema.ts          five tables, heavily commented — read this first
  score.ts           the ONLY place that knows what a score integer means
  queries.ts         search, PR derivation, activity rollups
  seed.ts            the movement vocabulary and the benchmark WODs
  migrations/        drizzle-kit generated; migrations.js is the bundled entry
  sql/fts.sql        FTS5 table + triggers, rebuilt by lib/db.ts every launch
lib/
  db.ts              opens the database, migrates, applies FTS, seeds once
  draft.ts           the in-progress log (the ONLY Zustand store), and the
                     workout text generated from it
  save.ts            draft -> rows, benchmark auto-tagging, PR detection
  edit.ts            a saved block -> a draft, the inverse of save.ts
  entry.ts           stopwatch-style digit entry — 4,1,2 reads as 4:12
  inputs.ts          which fields a movement offers
  dates.ts           local calendar days, backdating, "3 days ago"
  feel.ts            the 1-5 "felt like" scale and its red->green ramp
  movements.ts       slugs, tidy names, adding a custom movement
  export.ts          the backup document
  import.ts          validate-then-replace restore
  sample.ts          twelve weeks of history, loadable from Settings
  theme.ts           design tokens
app/                 expo-router screens; log.tsx is the big one
components/          ui.tsx (Chip/Button/Keypad), Stage.tsx (the staged setup),
                     MovementPicker, DateField, Feel, LoadChart, PrToast
tests/               vitest, runs against the real generated migration
```

Two build-level gotchas that fail *silently*:

- `babel.config.js` needs `babel-plugin-inline-import` for `.sql`, or migration
  imports resolve to a path string and every migration no-ops.
- `metro.config.js` needs `sql` in `resolver.sourceExts`.

---

## Invariants

Break these and the data goes quietly wrong, which is worse than a crash.

- **`blocks.raw_text` is never lost.** The verbatim workout is the source of
  truth. A block with zero parsed movements is a complete, useful record;
  logging is never blocked on the parser understanding the workout.
- **Scores are integers, in the units `score.ts` declares.** Grams, seconds,
  metres. Every format and compare goes through `score.ts`.
- **`prs` is a cache**, fully reconstructible by `rebuildAllPrs()`. Never write
  a record that cannot be re-derived from `blocks` and `block_movements`.
- **One row per set, and one row per round.** A 5×3 is five `block_movements`
  rows; a 21-15-9 Fran is six, because a round is not always the same work.
  This is why there is no sixth table. `set_number` is the set for strength and
  the round for a WOD, and is null when there is only one — so never read "has
  a set number" as "is a strength set"; use `blocks.kind`.
- **Load records come from strength blocks only.** A WOD contributes one record:
  its benchmark time or rounds. The 42.5 kg on a Fran thruster is descriptive —
  21 thrusters at 42.5 kg is prescribed volume, not an attempt at a 21-rep max.
  The CrossFit Total is three strength blocks. `candidatesForBlock()`,
  `repMaxes()` and `topSetsOverTime()` must agree on this.
- **A failed rep is flagged, not deleted.** The ✕ on a strength set keeps the
  attempt in the log and out of the records; deleting it loses the fact that
  you tried.
- **Capped (DNF) scores never set a record.**
- **Dates are local calendar days.** A 6 a.m. session must never land on the
  previous day.
- **Movements are archived, never deleted.** Deleting orphans years of history.
- **`blocks.feel` never feeds PR logic.** A bad day that still set a record is
  still a record, and saving must never require a rating.
- **Chalk yellow means "record" and nothing else.** Any new colour that drifts
  toward the accent devalues the only colour that is supposed to matter.

---

## Decided — do not relitigate

- **kg**, stored as grams. A lb toggle exists in `score.ts`, unsurfaced.
- **No Rx / scaled anywhere.** This is a log of what was done, not a
  competition record.
- **Setting up a WOD is staged.** One question on screen at a time — kind,
  format, then only what that format raises — answered by swiping sideways
  through the options and tapping the one under your thumb. Choosing and
  advancing are one motion, so there is no Next button; the trail above is the
  way back. A thumb travelling sideways is how you choose things on a phone,
  where a chip row makes you find the right small target among several.
  Neighbouring options stay half-visible and dimmed — that is the only thing
  saying the row can be swiped, so never widen the item to fill the card.
- **The last stage hands over to the movement picker** on a new log, never when
  editing.
- **A WOD has three formats: For time, AMRAP, EMOM.** Everything else people
  make a format is really a number — a chipper is a for-time you go through
  once. The enum keeps `chipper` and `intervals` for already-saved blocks;
  `shownFormat()` in `app/log.tsx` shows those as For time.
- **The round grid fills itself in.** A new round copies the one before it, and
  editing a round carries down to every later round that still agreed with it.
  Five uniform rounds are typed once; a 21-15-9 is typed as 21, 15, 9. A round
  given its own value is never overwritten again. `patchRound()` in
  `lib/draft.ts`; `app/log.tsx` mirrors the carry-down into the keypad buffers.
- **A ladder's reps live on the movements performing them**, one round at a
  time.
- **Every number the stages offer has a keypad escape hatch**, and a typed
  number folds back into the swipe list in its proper place. Do not add a
  preset without asking whether the pad already covers it.
- **Typing into a field replaces what is there.** Tapping a box that reads 21
  arms it; the next digit takes over.
- **Gymnastics gets no kilos box.** Keyed on modality in `lib/inputs.ts`, where
  the metres box is keyed on score type — "is it measured in metres" is about
  how a movement is counted, "is there a barbell" about what it is. Weighted
  pull-ups reveal a load on request.
- **Benchmark auto-tagging is ON.** Logging Fran writes thruster and pull-up
  rows, which is what makes "recent pull-ups" find WODs and not just strength
  work.

---

## Backup and restore

`lib/export.ts` writes a nested, self-describing document with no foreign keys —
every movement reference carries its slug and display name, because this is the
file you open in three years possibly without the app. Only the user's own
custom movements are exported; the seeded ones ship with the app.

`prs` is never exported and never restored. It is a cache, and a records block
in a file could disagree with the blocks it came from.

`lib/import.ts` is a restore, not a merge: it replaces the log. Merging would
have to decide whether a session on the same date is the same session, and
getting that wrong silently duplicates history. It validates everything before
writing anything, because failing partway leaves a log that is neither the old
one nor the new one. Benchmarks are looked up, never created; unknown movements
are created and flagged `isCustom`.

**A backup must stay restorable by every later build.** The log is the only copy
of years of training and there is no server behind it, so a file a future build
refuses is data lost. Bumping `EXPORT_VERSION` means keeping the reader for what
came before; `MIN_IMPORT_VERSION` is the oldest document that still restores and
does not move. It equals `EXPORT_VERSION` today only because no backup written
by an earlier build has ever existed, and that reasoning is spent.

---

## Working agreements

- Run `npx tsc --noEmit` and `npm test` before saying anything is done.
- Test `score.ts`, `queries.ts`, `draft.ts` and `dates.ts` properly. UI by hand.
- Migrations are append-only. A migration that drops a column must drop the FTS
  triggers first — SQLite refuses `DROP COLUMN` while a trigger names it, and
  `lib/db.ts` rebuilds the triggers straight afterwards.
- Document only what the app does — not what it might do, what was rejected, or
  what used to be true. Prefer deleting a stale section to updating it.
- Comments explain **why**. Keep them short. The schema comments are
  load-bearing; keep them current when the model changes.
- Never number a list that code might cite. Reference a rule by name.
- Dependencies are pinned and install scripts are off. After changing Node
  version run `npm run rebuild:native`, or the suite dies with
  `Worker exited unexpectedly` and no failing test to point at.
