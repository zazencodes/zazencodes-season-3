# RAWBAR — Vegan Protein Bars

Landing page with email waitlist capture for a vegan protein bar brand. Post-apocalyptic cyberpunk aesthetic, zero build tooling, serverless backend on GCP.

---

## Project Structure

```
vegan-bars/
├── vegan-bars.html              # Single-file static landing page
└── functions/
    └── email-capture/
        ├── main.py              # GCP Cloud Function — email capture endpoint
        └── requirements.txt
```

The entire frontend lives in one HTML file with embedded CSS and JavaScript. There is no bundler, no framework, and no npm. The backend is a single Python file deployed as a GCP HTTP Cloud Function.

---

## Local Development

Serve the HTML file over HTTP (required for the form's `fetch` calls to work correctly):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/vegan-bars.html`.

To test the waitlist form locally against the live Cloud Function, no changes are needed — the endpoint URL is hardcoded in the inline `<script>` at the bottom of `vegan-bars.html` and points to the deployed GCP function.

---

## Frontend

### Page Sections

| Section | Description |
|---|---|
| **Nav** | Fixed header with RAWBAR wordmark, green status indicator, and CTA button |
| **Hero** | Full-viewport intro with glitch headline animation and an animated terminal card showing product specs |
| **Waitlist** | Email capture form wired to the GCP backend |
| **Ticker** | Horizontally scrolling warning banner |
| **Products** | 4-column grid — ORIGINAL, DARK OPS, CITADEL CRUNCH, GHOST PROTOCOL ($4.50 each) |
| **Why** | Four value modules: whole ingredients, sustained energy, eco-friendly, field-tested |
| **Testimonials** | Three "operative reports" styled as terminal readouts |
| **Field Data** | Stats — 100% Plant Origin, 0 Synthetic Compounds, 3rd-Party Tested, ~0 Corporate Compromises |
| **CTA Banner** | Final purchase push — 12-unit cache for $38 |
| **Footer** | Links and copyright (© 2086) |

### Design System

The visual language is post-apocalyptic cyberpunk. Key CSS variables:

| Variable | Value | Role |
|---|---|---|
| `--matrix` | `#00ff41` | Primary green — borders, glows, accents |
| `--matrix-dim` | `#00cc34` | Dimmed green for secondary use |
| `--abyss` | `#050505` | Page background |
| `--alert` | `#ff2d2d` | Error and warning states |
| `--toxic` | `#c8ff00` | Highlight / callout color |
| `--data` | `#4a9eff` | Data / info color |

Fonts are loaded from Google Fonts:
- **Orbitron** — headings and logotype
- **Share Tech Mono** — body text throughout

Atmospheric effects applied globally via `body::before` (CRT scanlines) and `body::after` (SVG noise grain). The cursor is set to `crosshair` sitewide.

### JavaScript Interactions

Three inline scripts at the bottom of `vegan-bars.html`:

1. **Scroll reveal** — `IntersectionObserver` adds `.visible` to `.reveal` elements as they enter the viewport, staggered with `transitionDelay`.
2. **Acquire button feedback** — `.add-btn` clicks briefly flash green ("ACQUIRED ▸") then reset after 1.5 s.
3. **Waitlist form** — `fetch` POST to the Cloud Function; on success, replaces the form with a confirmation message; on error, shows an inline retry prompt.

---

## Backend — GCP Cloud Function

### What It Does

`functions/email-capture/main.py` is a stateless HTTP function that:

1. Rejects non-POST requests (returns 204 on OPTIONS for CORS preflight)
2. Parses JSON body, validates the `email` field with a regex
3. Writes the email as a plain-text file to the `vegan-bars-waitlist` GCS bucket
4. Filenames follow the pattern `{YYYYMMDDTHHMMSS}-{uuid4hex}.txt`
5. Returns `{"status": "ok", "file": "<filename>"}` on success

All responses include permissive CORS headers (`Access-Control-Allow-Origin: *`).

### Dependencies

```
functions-framework==3.*
google-cloud-storage==2.*
```

### Deploy

```bash
cd functions/email-capture

gcloud functions deploy email-capture \
  --runtime python311 \
  --trigger-http \
  --allow-unauthenticated \
  --region us-central1
```

The live endpoint is:

```
https://us-central1-starvald-demelain-1.cloudfunctions.net/email-capture
```

### Test the Endpoint

```bash
curl -X POST \
  https://us-central1-starvald-demelain-1.cloudfunctions.net/email-capture \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

Expected response:

```json
{"status": "ok", "file": "20260426T120000-abc123.txt"}
```

### Reading Captured Emails

Emails are stored in GCS. List them with:

```bash
gsutil ls gs://vegan-bars-waitlist/
```

Read a specific file:

```bash
gsutil cat gs://vegan-bars-waitlist/<filename>.txt
```

---

## Deployment — Static Frontend

The HTML file can be served from any static host. To deploy to GCS:

```bash
gsutil cp vegan-bars.html gs://<your-bucket>/vegan-bars.html
gsutil acl ch -u AllUsers:R gs://<your-bucket>/vegan-bars.html
```

Or drop it behind any CDN / static host of your choice — there are no build artifacts to manage.
