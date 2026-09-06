# Chalk, for coding agents

Chalk is an Expo / React Native CrossFit logbook for Android with an SQLite
database on the device. `README.md` is the source of truth for running and
building it. This file covers what an agent gets wrong without being told.

## Before saying anything is done

Run `npm run typecheck` and `npm test`. Both must pass. UI changes are checked
by hand on a phone, so say that they were not, rather than claiming otherwise.

## Starting local development

Follow README "Developing". Two things fail silently:

- **Install scripts are off.** `npm install` alone leaves better-sqlite3
  unbuilt and the test suite dies with `Worker exited unexpectedly` and no
  failing test. Run `npm run rebuild:native` after every install and after any
  Node version change.
- **Dependencies are pinned exactly** and `.npmrc` refuses any package version
  published in the last two days. If `npm install <pkg>` fails for that reason,
  wait or pick an older version. Do not override the setting.

`npx expo start` prints a QR code for Expo Go. The phone has to be on the same
Wi-Fi and the user has to scan the code. You cannot do that part; tell the user
what to do and what they should see.

## Getting it onto a phone

Follow README "Get it on your phone". Agent notes:

- `eas login` is interactive. Ask the user to run it.
- The binary is `eas` from the `eas-cli` package. Never run `npx eas`; that
  fetches an unrelated package.
- The EAS project id is not committed. `app.config.js` reads `EAS_PROJECT_ID`
  from an ignored `.env` file. If `eas` reports "EAS project not configured",
  that file is missing. Do not put the id in `app.json` or `eas.json`.
- `eas init` creates a project on the user's Expo account. Run it only when the
  user has asked for a build and has no `.env` yet, then put the id it prints in
  `.env`.
- Only the `preview` profile produces an installable APK.
- Uninstalling the app deletes the log. Never suggest uninstall and reinstall
  without telling the user to export a backup from Settings first.

## Changing code

- The rules under README "The data model" are load-bearing. Breaking one
  corrupts the log silently, which is worse than a crash.
- Migrations are append-only, generated with `npm run db:generate`. A migration
  that drops a column must drop the FTS triggers first.
- `db/score.ts` is the only place that formats or compares a score.
- The in-progress log in `lib/draft.ts` is the only Zustand store. Everything
  else reads SQLite.
- Write to `prs` only through the rebuild functions in `db/queries.ts`.
- `MIN_IMPORT_VERSION` in `lib/import.ts` never moves. Bumping
  `EXPORT_VERSION` means keeping the reader for the previous format.
