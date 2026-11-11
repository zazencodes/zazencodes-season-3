---
name: movie-poster
description: >
  Generates a fun, cinematic movie poster that represents the current codebase as if it were a Hollywood film.
  Analyzes the project's purpose, tech stack, and vibe, then invents a creative movie concept and uses
  Google Gemini to generate a real poster image saved to the working directory.

  Use this skill whenever the user asks to "generate a movie poster", "make a movie poster for my codebase",
  "what movie would my code be", "turn my project into a movie", or any request involving visualizing or
  representing the codebase in a fun or creative way. Also trigger for casual requests like "make something
  fun from my code" or "show me my project as a poster".
---

You are generating a creative movie poster that represents this codebase. This is meant to be fun,
imaginative, and visually striking — treat it like a real film pitch.

## Step 1 — Explore the codebase

Quickly survey the project to understand:
- **Purpose**: What does it do? Who uses it?
- **Tech stack**: Languages, frameworks, key dependencies
- **Scale & structure**: How big is it? Monolith, microservices, library?
- **Tone/vibe**: Is it serious infrastructure, playful tooling, data-heavy, user-facing?

Useful commands to run:
```bash
ls -la
cat README.md 2>/dev/null | head -60
find . -name "package.json" -o -name "pyproject.toml" -o -name "Cargo.toml" -o -name "go.mod" | head -5 | xargs cat 2>/dev/null
```

You don't need to read every file — a surface-level sweep is enough to capture the essence.

## Step 2 — Invent the movie concept

Based on what you found, map the codebase to a film. Think creatively:

| Codebase type | Film archetype |
|---|---|
| Web scraper / crawler | Spy thriller — "one agent, infinite targets" |
| Auth / security system | Heist film — cracking vaults, beating the system |
| Data pipeline / ETL | Sci-fi epic — data flowing across galaxies |
| Game engine | Action blockbuster — worlds colliding, explosions |
| Finance / trading app | Wall Street heist or noir crime drama |
| CLI tool / devtool | Indie hacker comedy — one programmer vs. the world |
| AI / ML project | Dystopian thriller or 2001-style odyssey |
| Social / chat app | Romantic drama or ensemble comedy |
| Mobile app | Coming-of-age story |
| Infrastructure / DevOps | War epic — battles fought in the cloud |
| API / backend service | Silent assassin thriller — invisible but deadly |

These are just inspiration — feel free to go off-script for something more fitting or clever. The best
concepts find a specific metaphor that really clicks with what the code actually does.

Decide on:
- **Movie title** — punchy, dramatic, memorable (can be a play on the project name or tech)
- **Tagline** — one evocative line (think: "In space, no one can hear you deploy")
- **Genre** — be specific (e.g. "cyberpunk noir thriller" not just "thriller")
- **Visual concept** — describe the poster scene: who's in it, what's happening, the mood, color palette

## Step 3 — Run the generation script

Use the script at the path relative to this SKILL.md file. Find the skill directory by looking for where
this skill lives (it will be something like `~/.claude/skills/movie-poster/`).

```bash
/Users/alex/virtualenvs/adhoc/bin/python ~/.claude/skills/movie-poster/scripts/generate_poster.py \
  --title "YOUR MOVIE TITLE" \
  --tagline "Your tagline here" \
  --genre "cyberpunk noir thriller" \
  --concept "A lone developer silhouetted against a wall of cascading green data streams, reaching toward a glowing API endpoint floating like a star in the darkness. Deep teal and electric green palette. Cinematic fog." \
  --output movie-poster.png
```

If `google-genai` is not installed, install it first:
```bash
/Users/alex/virtualenvs/adhoc/bin/pip install google-genai
```

The script loads the API key from `~/.claude/skills/movie-poster/.env`. If it fails, tell the user to
create that file with: `GEMINI_API_KEY=their_key_here`

## Step 4 — Report back

After the image is saved, tell the user:

1. **The movie pitch**: Title, genre, tagline — written with flair, like you're pitching it to a studio
2. **The casting choice**: Pick one or two real actors/directors who would be perfect for this film
   (this is optional but fun — lean in if the genre supports it)
3. **Where the poster was saved**: Full path to `movie-poster.png`
4. **What inspired the concept**: 1-2 sentences on how you mapped the codebase to the genre

Keep the tone playful and enthusiastic — this is meant to delight the user. Write the pitch like a
breathless Hollywood trailer voiceover, not a technical summary.

## Notes

- The `.env` file lives at `~/.claude/skills/movie-poster/.env`, NOT in the project directory
- Output is always `movie-poster.png` in the current working directory unless the user specifies otherwise
- If the API call fails, check: is the key valid? Is `google-genai` installed? Is the model name correct?
  Model name: `gemini-3-pro-image-preview`
- Don't over-research the codebase — a quick survey is enough. The goal is vibes, not a code review.
