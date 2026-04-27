# CLAUDE.md

RAWBAR — vegan protein bar marketing site. Single HTML file (`vegan-bars.html`) + GCP Cloud Function (`functions/email-capture/main.py`). No build tools.

## Key facts

- Preview: `python3 -m http.server 8080` → `http://localhost:8080/vegan-bars.html`
- All frontend styles and scripts are inline in `vegan-bars.html`; GCP function URL is hardcoded in the `<script>` block at the bottom
- Emails stored as flat `.txt` files in GCS bucket `vegan-bars-waitlist` (no database)
- After editing `vegan-bars.html`, Prettier runs automatically via PostToolUse hook

## Design language

Cyberpunk/post-apocalyptic: dark background (`#050505`), matrix-green glows (`#00ff41`), Orbitron + Share Tech Mono fonts, CRT scanline overlays. Keep this aesthetic for any new sections.
