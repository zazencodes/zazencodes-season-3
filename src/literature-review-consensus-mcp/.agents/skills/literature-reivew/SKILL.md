---
name: literature-review
description: Create a literature review for a user’s research question. Use when the user asks for a research summary, related work, evidence review, or what the literature says about a topic.
---

# Literature Review

Use this skill to turn a user’s question into a short, grounded review of relevant research.

Skill support files live alongside this skill:

- `latex_reference.md`
- `render_latex_pdf.py`
- `prepare_report_images.py`

## Required artifacts

For every literature review produced with this skill:

1. Write the review to the user in the assistant response.
2. Write a LaTeX version of the review to a `.tex` file in the current working directory.
3. Source supporting images as part of the review workflow unless the user explicitly says not to include figures.
4. Create an image manifest, prepare the image assets locally, and include the generated figure snippet in the `.tex` file before PDF rendering whenever suitable figures are available.
5. If no suitable image can be sourced, say so directly in the response and continue without inventing one.
6. Run the local Python PDF conversion script through `uv` after creating the `.tex` file so the workflow attempts to produce a PDF immediately inside the project environment.
7. Keep the LaTeX usage reference document separate from this skill file, inside the skill directory.

Use these paths by default unless the user asks for different names:

- `literature_review.tex` for the generated LaTeX review
- `literature_review.pdf` for the rendered PDF output
- `literature_review_images.json` for optional image inputs and prepared asset metadata
- `literature_review_images.tex` for optional generated LaTeX figure blocks
- `literature_review_assets/images/` for prepared local image assets
- `.agents/skills/literature-reivew/latex_reference.md` for the separate LaTeX usage reference
- `.agents/skills/literature-reivew/render_latex_pdf.py` for the Python renderer
- `.agents/skills/literature-reivew/prepare_report_images.py` for image preparation

## What to do

1. Identify the core research question.
2. Ask the user two explicit setup questions before searching:
   - what journal quality quartile to include
   - whether the report should include sourced images
3. Search Consensus for the most relevant and credible sources available.
4. Prefer review papers and strong primary studies.
5. Summarize the research by theme or major finding.
6. Highlight agreement, disagreement, and major limitations.
7. If the user wants images, source 1 to 3 relevant figures that materially support the synthesis, such as study flow diagrams, mechanism diagrams, outcome charts, or concept figures.
8. Draft the review in both plain-language response form and LaTeX form.
9. If the user wants images and suitable figures were found, write `literature_review_images.json`, run the image preparation helper, and decide where `\input{literature_review_images.tex}` should appear in the report.
10. Save the LaTeX file to the current working directory.
11. Run `uv run python .agents/skills/literature-reivew/render_latex_pdf.py literature_review.tex` from the current working directory.
12. End with a direct answer to the user’s question.

## Source retrieval workflow

Use the Consensus MCP server as the only literature search tool for this skill.

1. Translate the user request into a focused academic query using domain terms.
2. Before searching, explicitly ask:
   - what journal quality quartile the user wants included
   - whether the user wants images included in the report
3. If either decision was not specified up front, stop and ask before continuing.
4. Map the user's quartile answer to `sjr_max`:
   - `1` = only Q1 journals
   - `2` = Q1-Q2 journals
   - `3` = Q1-Q3 journals
   - `4` = Q1-Q4 journals
5. Search Consensus for all source retrieval in this skill.
6. Prefer human studies when the question is clinical or behavioral.
7. Prefer systematic reviews, meta-analyses, and randomized trials when they fit the question.
8. Apply quality filters when useful:
   - `study_types` to prioritize reviews, meta-analyses, RCTs, or observational studies.
   - `human=true` for human evidence when appropriate.
   - `sjr_max` based on the user's stated quartile threshold.
   - `year_min` to focus on recent evidence when recency matters.
   - `sample_size_min` when small underpowered studies are likely to mislead.
9. Do not use web search or any other fallback source retrieval method.

## Query guidance

- Start broad enough to capture the main literature, then refine.
- Use academic terminology, not conversational phrasing.
- Include the population, intervention or exposure, comparator, and outcome when relevant.
- For mechanism questions, search both the broad topic and the likely mechanism terms.
- For effectiveness questions, look first for systematic reviews or meta-analyses, then fill gaps with strong primary studies.

## Image sourcing workflow

Image sourcing is separate from literature retrieval.

1. Only source images if the user explicitly said the report should include them.
2. First complete the Consensus-based literature search and decide what visual evidence would improve the review.
3. Source 1 to 3 figures by preferring:
   - figures hosted on publisher, journal, preprint, or institutional pages for papers already cited in the review
   - open-access diagrams or charts that clarify the mechanism, intervention, or outcome pattern discussed in the synthesis
   - stable `https://` image URLs that can be downloaded into the local asset pipeline
4. Do not use decorative stock images or generic thumbnails.
5. Only include figures that add information, not visual filler.
6. Record the original source page or publisher in the image `credit` field.
7. After selecting images, write `literature_review_images.json` and run:
   - `uv run python .agents/skills/literature-reivew/prepare_report_images.py literature_review_images.json`
8. If no suitable image is available from the cited literature or a closely related explanatory source, omit figures and say that none were included.

## Rules

- Do not invent papers or citations.
- Do not invent image URLs, captions, or credits.
- Do not present weak evidence as strong evidence.
- Say when evidence is limited, mixed, or preliminary.
- Prefer synthesis over listing papers one by one.
- Be clear when a source is a preprint or non-peer-reviewed.
- State when the Consensus search returned only weak or indirect evidence.
- When filters are used, choose them to improve evidence quality, not to force a desired conclusion.
- Do not assume a journal quality threshold or image preference for the user. Ask explicitly if either was not provided.
- If Consensus results are sparse or off-topic, report that limitation instead of switching tools.
- If an image is included, ensure it is actually fetched into the local report assets before attempting PDF compilation.

## Default output

Structure the answer like this:

1. **Question**
2. **Overview**
3. **Main findings**
4. **Gaps or limitations**
5. **Bottom line**
6. **References**

## LaTeX output requirements

The `.tex` file should be a self-contained article that compiles without extra project files.

- Use the `article` document class.
- Include UTF-8 friendly packages only when needed.
- Include `\usepackage{graphicx}` whenever the report has figures.
- Include `\usepackage{float}` when exact figure placement such as `[H]` is needed.
- Prefer `\usepackage{xurl}` and `\hypersetup{hidelinks,breaklinks=true}` when URLs are included in references.
- Escape LaTeX special characters in user content and citations.
- Include these sections in the document body:
  - `Question`
  - `Overview`
  - `Main Findings`
  - `Gaps or Limitations`
  - `Bottom Line`
  - `References`
- Keep citations and references readable in plain LaTeX even if BibTeX is not used.
- Prefer a simple manual `enumerate` or `itemize` reference list over introducing `.bib` files unless the user specifically asks for BibTeX.
- Do not mix `enumerate` references with a separate `thebibliography` block unless explicitly needed.
- If figures are included, store assets under `literature_review_assets/images/` and reference them through a generated `literature_review_images.tex` snippet rather than hardcoding ad hoc paths.
- Use `\input{literature_review_images.tex}` at the point in the document where the figures should appear.

## Image workflow

When the report benefits from images, use a manifest-driven process so the LaTeX and PDF outputs stay reproducible.

1. Source 1 to 3 suitable figures unless the user explicitly opts out or no suitable figures can be found.
2. Create `literature_review_images.json` in the current working directory as a JSON array.
3. For each image, include:
   - `source`: required local path or `https://` URL
   - `caption`: optional figure caption text
   - `credit`: optional source or attribution text
   - `section`: optional suggested report section name
   - `width`: optional LaTeX width expression, for example `0.8\\linewidth`
   - `placement`: optional LaTeX placement, for example `htbp` or `H`
   - `label`: optional LaTeX label
   - `filename`: optional stable output base name
4. Run:
   - `uv run python .agents/skills/literature-reivew/prepare_report_images.py literature_review_images.json`
5. The helper will:
   - copy or download supported images into `literature_review_assets/images/`
   - rewrite `literature_review_images.json` with resolved local asset paths
   - generate `literature_review_images.tex` with ready-to-input `figure` environments
6. Add `\input{literature_review_images.tex}` into the report where the figures should appear.
7. Compile the report with the normal PDF render step.

Only use image formats that common TeX engines handle directly: PNG, JPG, JPEG, or PDF. Do not point LaTeX directly at remote URLs.

Use a title block with:

- review title
- date
- optional author line `Generated by Codex`

If a PDF build fails, still return the review to the user and say that the `.tex` file was created but the PDF render step failed.

## PDF render workflow

After writing the `.tex` file:

1. Run `uv run python .agents/skills/literature-reivew/render_latex_pdf.py literature_review.tex`.
2. Report whether `literature_review.pdf` was generated successfully.
3. If rendering fails because no TeX engine is installed in the `uv` environment, say so directly and do not invent success.

## Separate reference document

Maintain a separate skill document named `.agents/skills/literature-reivew/latex_reference.md` that explains:

- basic LaTeX document structure
- required sections for this skill
- how to escape special characters
- how to run the PDF conversion script through `uv`
- how the image manifest and figure snippet workflow works
- what TeX engines the script supports

## Writing guidance

- Be concise and analytical.
- Group papers by idea, result, or method.
- Focus on what the literature supports, not just what exists.
- Include citations for factual claims.
- Briefly note the study mix when it matters, for example "2 meta-analyses, 4 RCTs, 3 observational studies."
- Give more weight to evidence syntheses and better study designs when findings conflict.

## Example triggers

- “Write a literature review on…”
- “What does the research say about…”
- “Summarize the literature on…”
- “Give me related work for…”

## Reminder

A good literature review is not just a list of papers. It is a synthesis of the strongest relevant research that answers the user’s question.
