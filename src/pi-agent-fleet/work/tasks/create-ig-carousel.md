# Creative Task: Instagram Carousel from Post Draft

## Goal

Turn the attached content (X post draft or research brief) into one publish-ready 3-image Instagram carousel for ZazenCodes.

## Audience

Software engineers learning how to use coding agents, agentic workflows, and modern AI engineering tools.

## Inputs

- The content attached to this run (latest entry in `work/outputs/x-post-draft.md` or `work/outputs/research-ai-engineering.md`).
- ZazenCodes voice: practical agentic coding, first-person, no hype.

## Output Format

- Three square images generated with `generate_image.py`, saved to `../../work/outputs/ig-carousel/` (relative to your working directory) as `slide-1.png`, `slide-2.png`, `slide-3.png`.
- A Markdown summary to stdout with the slide messages, file paths, an Instagram caption, and the next best specialist agent to run.

## Constraints

- Cyberpunk color palette: neon magenta, electric cyan, acid purple on near-black. Visually striking.
- Big, extra-bold uppercase text in every image; 1–5 words per slide, very simple messaging.
- Square images only (the script enforces 1:1 — do not change it).
- Use only facts from the source content. Do not invent stats, quotes, or freshness.
- Caption: no engagement bait or hype words, max one hashtag.
