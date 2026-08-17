# Chalk — product spec

The reasoning behind the app, and what each screen is for. `CLAUDE.md` is the
operating manual; this is the argument.

## What CrossFit's own format tells us

The daily post on crossfit.com is a workout, a scoring instruction, and a
comparison to the last time the same thing was programmed. Two conclusions
shaped the model:

1. **The score type is the only thing that really varies.** Load, time, reps,
   rounds, distance. Everything else is presentation.
2. **A PR is a comparison between two dates.** crossfit.com keeps no leaderboard
   in the post; it links to the previous occurrence and lets you compare. That
   is the whole feature.

## What a session actually looks like

```
2026-08-05
  1. Strength — Power clean 5x3, building
     60kg / 70 / 77.5 / 82.5 / 85kg          felt: Flat
  2. WOD — "Fran"
     21-15-9 thruster (43kg) + pull-up
     4:12                                    felt: Flying
```

One `sessions` row, two `blocks` rows. The strength block writes five
`block_movements` rows, one per set. Fran writes six — thruster and pull-up at
21, 15 and 9 — because logging a named benchmark auto-tags its components from
the seed.

That auto-tagging is what makes the headline feature work: searching "thruster"
finds every Fran you have done without you having typed the word.

The two ratings on one day are why "felt like" sits on the block and not the
session. The squats and the running after them rarely feel the same, and a
session-level number would average away the only interesting thing.

## The five tables

`movements` · `sessions` · `blocks` · `block_movements` · `prs`

- **`sessions` is thin.** It owns a date. A day is a container, not a workout.
- **`blocks` carries the score and the feel rating**, because both are
  properties of one piece of work rather than of the day.
- **`block_movements` is both the search index and the set log.** That is the
  one clever thing in the model, and it removes an entire `sets` table: a
  strength set and a movement in one round of a WOD are the same shape — a
  movement, and some combination of load, reps, distance or calories.
- **`prs` is a cache**, rebuilt whenever the rules change or a block is edited,
  deleted, or logged out of order.
- **Named workouts live in `movements`**, so one search box covers "snatch" and
  "Isabel" without a union query.

The escape hatch that keeps this from becoming rigid is `raw_text`. The workout
goes in verbatim, so if the tagging is wrong or absent the record is still
complete and still findable by full-text search.

## Screens

**Today.** Opens on today with two actions: *WOD ＋* and *Strength ＋*. Below,
recent sessions, each showing a dot per block coloured by how it felt.

**Logging a block.** Date first — Today and Yesterday one tap each, a calendar
for anything older.

Setting up a WOD is **staged**: one question on screen at a time, answered by
swiping sideways through the options and tapping the one under your thumb.
Choosing and advancing are the same motion, so there is no Next button, and the
trail above is the way back into anything already answered. A thumb travelling
sideways is how you choose things on a phone; a row of chips instead makes you
find the right small target among several, which is what fails when you are on
the floor and not really looking. The last stage hands straight over to picking
movements.

A WOD is three formats — **For time**, **AMRAP**, **EMOM** — because everything
else people make a format is really a number. A chipper is a for-time you go
through once. So a format earns only the stages it raises: rounds for a
for-time, a clock for an AMRAP, an interval and a clock for an EMOM. Each offers
the counts a class actually programmes and a keypad escape, because no preset
list holds everybody's workout.

Choosing three rounds lays out three of them, and **each arrives already filled
in from the one above**: enter round one and a uniform workout is done.
Correcting a round carries down to the rounds that still matched it, so a
21-15-9 is entered as 21, then 15, then 9 — three numbers, not nine. That is
what makes Fran recordable as the three different rounds it is, and why "how
many thrusters" has an answer.

The generated text follows the same shape: a ladder every movement shares heads
the workout the way a whiteboard writes it, "21-15-9 reps for time:", while one
only some movements follow stays on their own lines.

Fields follow the movement. Runs and ergs ask for metres and calories,
gymnastics for reps alone, everything else for reps and load. Controls appear
only where they mean something: an AMRAP ends when the clock does, so it is not
offered a Capped / DNF flag it could never truthfully carry. Tapping a field
that already holds a number selects it, so the next digit replaces rather than
appends.

Structured entry *generates* the verbatim text rather than demanding it. The
moment it is edited by hand, generation stops overwriting it.

**Search.** One field. Typing "snat" offers Snatch, Power Snatch, Isabel,
Amanda. Below that, anything whose workout text matches but was never tagged.

**Movement detail.** Rep maxes at the top, each with the date that set actually
happened. Then the top set over time, each point coloured by feel. Then every
session the movement appears in — WODs included, not just loaded sets, because
"when did I last do pull-ups" is half the reason the app exists.

**Records.** Grouped by movement, each showing the delta from the previous best
and the date. A record is marked by chalk yellow and nothing else.

**Activity.** Sessions per week as a stacked bar, strength against WOD. Modality
mix, counting blocks rather than reps so a heavy squat day does not swamp a
metcon. Then the neglect list: movements not touched in eight weeks, keyed on
"ever logged" rather than "has a record", so bodyweight work can appear at all.

**Settings.** Units, the JSON backup, and the loadable sample history.

## Design direction

The register is a **logbook**, not a dashboard — the notebook on the shelf by the
whiteboard, not a fitness app.

- **Numbers are the interface.** Scores are set large, labels small and quiet.
  Tabular figures everywhere, so loads stack into a readable column.
- **One accent, used only for records.** If chalk yellow appears anywhere that
  is not a personal best it stops meaning anything. Hence the feel ramp running
  red → neutral → green and skipping amber, and the selected calendar day being
  a grey fill.
- **Density over whitespace.** A session with three blocks belongs on one screen
  without scrolling. This is a reference document consulted mid-workout.
- **The empty state is an invitation.** A new install shows today's date and one
  button, not an illustration and a paragraph of onboarding.

Copy stays plain and active: *Log WOD*, *Save*, *No sessions yet — log your
first one*. Never *Submit*, never *Oops!*, never *Crush your goals*.
