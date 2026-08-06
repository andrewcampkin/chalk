# Chalk — product spec

The reasoning behind the app, and what each screen is for. `CLAUDE.md` is the
operating manual; this is the argument.

## What CrossFit's own format tells us

The daily post on crossfit.com is remarkably consistent, and the shape of it is
the shape of the data model.

A post is a workout plus a scoring instruction plus a comparison. Some days it
is strength — five sets of three power cleans, *post loads to comments*. Some
days it is a metcon — a descending couplet, *post time to comments*. Underneath
sits a line like *Compare to 260717*, pointing at the last time the same thing
was programmed.

Two conclusions carried into the build:

1. **The score type is the only thing that really varies.** Load, time, reps,
   rounds, distance. Everything else is presentation.
2. **A PR is a comparison between two dates.** CrossFit does not maintain a
   leaderboard in the post; it links to the previous occurrence and lets you
   compare. That is the whole feature.

A third conclusion was considered and **rejected**: that scaling level belongs
in the record. crossfit.com posts Rx'd / Intermediate / Beginner, and an early
draft of the schema carried an `rx_level` on every block and keyed records by
it. It was removed on 2026-08-06. This is a log of what one person actually
did, not a competition result, and the person using it scales most workouts. A
field that has the same value on every row is not information, and separating
records by it only fragments a history that is already small. Capped (DNF)
scores are still excluded from records — that distinction earns its place,
because a DNF is not a performance at all.

## What a session actually looks like

A real gym day is often two or three pieces of work:

```
2026-08-05
  1. Strength — Power clean 5x3, building
     60kg / 70 / 77.5 / 82.5 / 85kg          felt: Flat
  2. WOD — "Fran"
     21-15-9 thruster (43kg) + pull-up
     4:12                                    felt: Flying
```

One `sessions` row, two `blocks` rows. The strength block writes five
`block_movements` rows (one per set, all pointing at Power Clean). The Fran
block writes two (Thruster and Pull-up), because logging a named benchmark
auto-tags its components from the seed data.

That last detail is what makes the headline feature work: searching "thruster"
finds every Fran you have ever done, without you ever having typed the word.

Note the two different ratings on one day. That is the point of putting "felt
like" on the block rather than the session — the squats and the running after
them rarely feel the same, and a session-level number would average away the
only interesting thing.

## The five tables, and why not fewer or more

`movements` · `sessions` · `blocks` · `block_movements` · `prs`

- **`sessions` is thin on purpose.** It owns a date. All the substance lives in
  blocks, because a day is a container, not a workout.
- **`blocks` carries the score**, because "the score" is a property of one piece
  of work, not of the day. It also carries the feel rating, for the same reason.
- **`block_movements` is doing double duty** — it is both the search index and
  the set log. That is the one clever thing in the model, and it removes an
  entire `sets` table. A strength set and a movement-inside-a-WOD are the same
  shape: a movement, and some combination of load, reps, distance or calories.
  Only `setNumber` distinguishes them.
- **`prs` is a cache**, not a source of truth. It exists so the records screen
  is instant, and it is deleted and rebuilt whenever the rules change or a
  block is edited, deleted, or logged out of order.
- **Named workouts live in `movements`**, not in a table of their own, so a
  single search box covers "snatch" and "Isabel" without a union query.

The escape hatch that keeps all of this from becoming rigid is `raw_text`. The
workout goes in verbatim. If the tagging is wrong or absent, the record is still
complete and still findable through full-text search. Structure is an
enhancement, never a gate.

## Screens

**Log.** Opens on today with one primary action: *Log WOD* or *Log strength*.
Below, recent sessions, each showing a dot per block coloured by how it felt.

**Logging a block.** Date first (Today and Yesterday one tap each, a calendar
for anything older), then the format, then movements from the recent chips,
then one score on a custom pad. The fields follow the movement: runs and ergs
ask for metres and calories, everything else for reps and load. Strength opens
as a single top-set field and expands into a grid that carries the rep count
down the rows, so only the loads need typing.

Structured entry *generates* the verbatim text rather than demanding it. The
moment it is edited by hand, generation stops overwriting it.

**Search.** One field. Typing "snat" offers Snatch, Power Snatch, Isabel,
Amanda. Below that, anything whose workout text matches but was never tagged.

**Movement detail.** Rep maxes at the top, each with the date that set actually
happened. Then the top set over time, with each point coloured by feel. Then
every session the movement appears in — WODs included, not just loaded sets,
because "when did I last do pull-ups" is half the reason the app exists.

**Records.** Grouped by movement, each showing the delta from the previous best
and the date. A record is marked by chalk yellow and nothing else.

**Activity.** Sessions per week as a stacked bar, strength against WOD.
Modality mix, counting blocks rather than reps so a heavy squat day does not
swamp a metcon. Then the neglect list: movements not touched in eight weeks,
keyed on "ever logged" rather than "has a record", so bodyweight work can
appear at all.

**Settings.** Units, and the JSON backup.

## Design direction

The register is a **logbook**, not a dashboard. The reference is the notebook on
the shelf by the whiteboard, not a fitness app: dated entries, monospaced
numbers, the workout as written.

- **Type carries it.** Tabular figures everywhere a number appears, so loads
  stack into a readable column down the set grid.
- **Numbers are the interface.** Scores are set large; labels stay small and
  quiet. A PR is marked by a single change in weight or a rule, not a badge, a
  confetti burst, or a trophy.
- **One accent, used only for records.** If chalk yellow appears anywhere that
  is not a personal best, it stops meaning anything. This is why the feel ramp
  runs red → neutral → green and skips amber, and why the selected day in the
  calendar is a grey fill rather than the accent.
- **Density over whitespace.** A session with three blocks belongs on one screen
  without scrolling. This is a reference document being consulted mid-workout,
  not a feed being browsed.
- **The empty state is an invitation.** A new install shows today's date and one
  button, not an illustration and a paragraph of onboarding.

Copy stays plain and active: *Log WOD*, *Save*, *No sessions yet — log your
first one*. Never *Submit*, never *Oops!*, never *Crush your goals*.
