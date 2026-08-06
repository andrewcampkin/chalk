# WODLog — product spec

## What CrossFit's own format tells us

The daily post on crossfit.com is remarkably consistent, and the shape of it is
the shape of the data model.

A post is a workout plus a scoring instruction plus a comparison. Some days it
is strength — five sets of three power cleans, *post loads to comments*. Some
days it is a metcon — a descending couplet, *post time to comments*. Underneath
sits a line like *Compare to 260717*, pointing at the last time the same thing
was programmed. Below that, scaling options: Rx'd, Intermediate, Beginner.

Three conclusions:

1. **The score type is the only thing that really varies.** Load, time, reps,
   rounds. Everything else is presentation.
2. **A PR is a comparison between two dates.** CrossFit does not maintain a
   leaderboard in the post; it links to the previous occurrence and lets you
   compare. That is the whole feature.
3. **Scaling level is part of the record.** A Beginner time and an Rx'd time are
   not the same number, and treating them as one makes both meaningless.

## What a session actually looks like

A real gym day is often two or three pieces of work:

```
2026-08-05
  1. Strength — Power clean 5x3, building
     60kg / 70 / 77.5 / 82.5 / 85kg
  2. WOD — "Fran"
     21-15-9 thruster (43kg) + pull-up
     4:12 Rx
```

One `sessions` row, two `blocks` rows. The strength block writes five
`block_movements` rows (one per set, all pointing at Power Clean). The Fran block
writes two (Thruster and Pull-up), because logging a named benchmark auto-tags
its components from the seed data.

That last detail is what makes the headline feature work: searching "thruster"
finds every Fran you have ever done, without you ever having typed the word.

## The five tables, and why not fewer or more

`movements` · `sessions` · `blocks` · `block_movements` · `prs`

- **`sessions` is thin on purpose.** It owns a date and a mood. All the substance
  lives in blocks, because a day is a container, not a workout.
- **`blocks` carries the score**, because "the score" is a property of one piece
  of work, not of the day.
- **`block_movements` is doing double duty** — it is both the search index and
  the set log. That is the one clever thing in the model, and it removes an
  entire `sets` table. A strength set and a movement-inside-a-WOD are the same
  shape: a movement, a load, some reps. Only `setNumber` distinguishes them.
- **`prs` is a cache**, not a source of truth. It exists so the home screen is
  instant, and it is deleted and rebuilt whenever the rules change.
- **Named workouts live in `movements`**, not in a table of their own, so a
  single search box covers "snatch" and "Isabel" without a union query.

The escape hatch that keeps all of this from becoming rigid is `raw_text`. The
workout goes in verbatim. If the tagging is wrong or absent, the record is still
complete and still findable through full-text search. Structure is an
enhancement, never a gate.

## Screens

**Today.** Opens on the current date with one primary action. Two buttons:
*Add strength* and *Add WOD*. Recent movements surface first in the autocomplete,
because gyms run cycles and this week's squat day looks like last week's.

**Log a block.** A text field for the workout as written, a movement tagger, and
a score field whose keyboard and format follow `scoreType` — a number pad for
load, a `mm:ss` mask for time. The set grid for strength pre-fills the rep count
across rows so only the loads need typing. The bar is 30 seconds, sweaty, one
hand, standing next to the rig.

**Search.** One field. Typing "snat" offers Snatch, Power Snatch, Hang Power
Snatch, Isabel, Randy, Amanda. Choosing one lists every block containing it,
newest first, each showing the date, the top load or the score, and the first
line of the raw text. This is the "compare to 260717" screen.

**Movement detail.** Current rep maxes at the top — 1, 3, 5, 10 — each with the
date and the delta from the previous record. Below, a line chart of top set over
time. Below that, every session. For a benchmark, the same thing with times
instead of loads.

**Activity.** Sessions per week as a stacked bar, strength against WOD. Modality
mix as a second chart, counting blocks rather than reps so a heavy squat day does
not swamp a metcon. Finally, the neglect list: movements with a record on file
that have not appeared in eight weeks. That list is the most useful thing on the
screen and should not be buried.

## Design direction

The register is a **logbook**, not a dashboard. The reference is the notebook on
the shelf by the whiteboard, not a fitness app: dated entries, monospaced
numbers, the workout as written.

- **Type carries it.** A condensed grotesque for the workout text so a long
  chipper fits without wrapping, and tabular figures everywhere a number appears,
  so loads stack into a readable column down the set grid.
- **Numbers are the interface.** Scores are set large; labels stay small and
  quiet. A PR is marked by a single change in weight or a rule, not a badge, a
  confetti burst, or a trophy.
- **One accent, used only for records.** If the accent colour appears anywhere
  that is not a personal best, it stops meaning anything.
- **Density over whitespace.** A session with three blocks belongs on one screen
  without scrolling. This is a reference document being consulted mid-workout,
  not a feed being browsed.
- **The empty state is an invitation.** A new install shows today's date and one
  button, not an illustration and a paragraph of onboarding.

Copy stays plain and active: *Add strength*, *Save session*, *No sessions yet —
log your first one*. Never *Submit*, never *Oops!*, never *Crush your goals*.
