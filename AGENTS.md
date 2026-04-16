# AGENTS.md

## Project Instructions

- `README.md` is the public landing page for this repo and should stay simple.
- Only include top-level folders from `src/` that already have matching published video content in `/Users/alex/pro/zazencodes-content/videos`.
- Do not include unpublished folders in `README.md`.
- When asked to "Update the README", assume existing README entries are still correct. Only check new `src/` folders that are not already linked in `README.md`.

## Repo Shape

- `README.md`: public video index for Season 3.
- `src/<folder>`: one top-level folder per video project or companion resource.
- `/Users/alex/pro/zazencodes-content/videos`: local source of truth for published video metadata.

## README Update Workflow

- Read `README.md` and collect the `src/` folders already linked there.
- List top-level folders in `src/` and find any new folders missing from `README.md`.
- For each new folder, search `/Users/alex/pro/zazencodes-content/videos/**/info.json` for a matching `source_code_url` or obvious folder match.
- If there is no corresponding local content entry, skip that folder for now.
- For matched folders, use local metadata as the source of truth:
  - title from `info.json`
  - YouTube URL from `info.json`
  - optional short description from the folder README or local `summary.md`
- If the match is unclear, run a targeted web or YouTube search to confirm before editing `README.md`.
- Keep the video index in chronological order based on the matching local video folders.
- Do not re-check or rewrite existing video rows unless the user explicitly asks.

## Validation

- Re-read `README.md` after editing and make sure every row links to the correct `src/<folder>`.
- Confirm every README video row corresponds to a real local content entry in `/Users/alex/pro/zazencodes-content/videos`.
- If a folder has no published local content yet, leave it out of the README.

