# Bookkeeping Brain

Living document of bookkeeping rules and conventions for this user. Append new rules as they're taught — do not delete prior ones without asking.

## Default currency

CAD (override per-expense if the user specifies otherwise).

## Categories

Use these categories on expenses. If something doesn't fit, ask before inventing a new one, then add it here.

- `software` — SaaS subscriptions, dev tools, API credits.
- `hardware` — computers, peripherals, devices.
- `meals` — food & drink, including business meals (note attendees in `description`).
- `travel` — flights, trains, taxis, lodging.
- `office` — supplies, furniture, coworking.
- `services` — contractors, accountants, legal.
- `marketing` — ads, sponsorships, swag.
- `fees` — bank fees, payment processor fees, currency conversion.
- `personal` — personal grooming, haircuts, non-business personal expenses.
- `other` — last resort; ask before using.

## Receipts

When the user shares an image, save it under `memory/images/` with a slugified `<YYYY-MM-DD>-<vendor>.<ext>` filename, then create the expense entry referencing it via `source: "receipt:<filename>"`.

## Reporting conventions

- Fiscal year: calendar year unless `facts.json` says otherwise.
- Round totals to 2 decimal places when reporting; keep raw precision in storage.
