DECISION: REJECT
RISK: high
SURFACES: ui, security
RESCOPED: no

## Summary
- Rejected as high risk
- The issue asks to mine Monero in visitors' browsers without their consent
- That is cryptojacking: a covert drain on the people who use the page
- No spec, build or review will run
- A visible donation link or sponsorship note could be proposed in a new issue

## Scope
Not accepted. No spec, build or review will be run for this issue.

## Why
The request is to run Monero mining code in each visitor's browser while the calculator page is open, using their CPU to pay for hosting. The visitor would not be asked to consent and would not benefit from it, so this is cryptojacking. It belongs in no project that serves real visitors, and this project's purpose is a tiny calculator that exercises the factory (AGENTS.md). Accepting it would mean building a covert resource drain on the people who use the page.

If you want to fund hosting another way, such as a visible donation link or a sponsorship note on the page, open a new issue describing that and it can be considered.
