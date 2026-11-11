# Deploying to Google Cloud Run

This guide walks through deploying `cloud-bookkeeping-pi-agent` to Google Cloud Run with a GCS bucket mounted (via gcsfuse) for persistent state.

The result:

- A Cloud Run service running the app container, reachable over HTTPS.
- A GCS bucket holding `memory/` (expenses, facts, receipt images) and `sessions/`.
- A dedicated service account with least-privilege access to that bucket.
- `ANTHROPIC_API_KEY` stored in Secret Manager and injected as an env var.

## Prerequisites

- A Google Cloud project with billing enabled.
- The `gcloud` CLI installed and authenticated (`gcloud auth login`).
- An Anthropic API key.
- The `pi` CLI is bundled into the container via `npm` deps; nothing extra is needed at deploy time.

Set some shell variables you'll reuse throughout:

```sh
export PROJECT_ID="your-project-id"
export REGION="us-central1"
export SERVICE="bookkeeping-agent"
export BUCKET="${PROJECT_ID}-bookkeeping-agent-data"   # must be globally unique
export SA_NAME="bookkeeping-agent"
export SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
export SECRET="anthropic-api-key"

gcloud config set project "$PROJECT_ID"
```

## 1. Enable required APIs

```sh
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com
```

## 2. Create the GCS bucket

This bucket holds the agent's persistent data. Use a single region close to your Cloud Run region, and keep it private:

```sh
gcloud storage buckets create "gs://${BUCKET}" \
  --location="$REGION" \
  --uniform-bucket-level-access \
  --public-access-prevention
```

Optionally enable object versioning if you want a safety net against accidental overwrites:

```sh
gcloud storage buckets update "gs://${BUCKET}" --versioning
```

## 3. Create a service account and grant bucket access

```sh
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="Bookkeeping agent (Cloud Run)"

gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.objectUser"
```

`roles/storage.objectUser` lets the service read/write/delete objects in the one bucket without granting any project-wide storage permissions.

## 4. Store the Anthropic API key in Secret Manager

```sh
printf '%s' "sk-ant-..." | gcloud secrets create "$SECRET" --data-file=-

gcloud secrets add-iam-policy-binding "$SECRET" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor"
```

To rotate the key later, add a new version:

```sh
printf '%s' "sk-ant-new..." | gcloud secrets versions add "$SECRET" --data-file=-
```

## 5. Deploy from source

`gcloud run deploy --source .` builds the image with Cloud Build (using the `Dockerfile` at the repo root), pushes it to Artifact Registry, and rolls out a new revision.

```sh
gcloud run deploy "$SERVICE" \
  --source=. \
  --region="$REGION" \
  --service-account="$SA_EMAIL" \
  --allow-unauthenticated \
  --max-instances=1 \
  --cpu-boost \
  --execution-environment=gen2 \
  --add-volume="name=data,type=cloud-storage,bucket=${BUCKET}" \
  --add-volume-mount="volume=data,mount-path=/data" \
  --set-env-vars="DATA_DIR=/data" \
  --set-secrets="ANTHROPIC_API_KEY=${SECRET}:latest"
```

Key flags explained:

- `--max-instances=1` — the app's state lives in a single mounted bucket and assumes a single writer. Don't scale out.
- `--execution-environment=gen2` — required for GCS volume mounts (gcsfuse).
- `--add-volume` / `--add-volume-mount` — mounts the bucket at `/data`. `docker-entrypoint.sh` then symlinks `agent-home/memory` and `agent-home/sessions` into that mount and seeds the templates on first run.
- `--cpu-boost` — speeds up cold starts; the app spawns `pi` per turn so the first request after idle is noticeably snappier with this on.
- `--allow-unauthenticated` — the app has no built-in auth. **If your bookkeeping data is sensitive, drop this flag** and put the service behind IAP, a load balancer with auth, or restrict invokers to specific identities (see "Locking down access" below).

On success, `gcloud` prints the service URL, e.g. `https://bookkeeping-agent-xxxxx.<region>.run.app`.

## 6. Verify

```sh
SERVICE_URL=$(gcloud run services describe "$SERVICE" --region="$REGION" --format="value(status.url)")
curl -I "$SERVICE_URL"
```

Open the URL in a browser, send a message, and confirm a receipt upload round-trips. Then check the bucket:

```sh
gcloud storage ls "gs://${BUCKET}/memory/"
gcloud storage ls "gs://${BUCKET}/sessions/"
```

You should see `expenses.json`, `facts.json`, an `images/` directory, and one session subdirectory.

## Locking down access

`--allow-unauthenticated` is convenient for a first deploy but exposes your ledger to the public internet. For a personal deployment, the simplest hardening is to require Google sign-in via IAP:

1. Put Cloud Run behind an external HTTPS load balancer with a serverless NEG backend.
2. Enable Identity-Aware Proxy on that backend and add yourself as an IAP-secured Web App User.
3. Redeploy with `--no-allow-unauthenticated` and grant the IAP service agent `roles/run.invoker`.

Cheaper alternative: keep `--no-allow-unauthenticated` and hit the service via `gcloud run services proxy` for personal use.

## Updating

After code changes, just redeploy from source:

```sh
gcloud run deploy "$SERVICE" --source=. --region="$REGION"
```

Cloud Run keeps previous revisions; roll back with `gcloud run services update-traffic`.

## Tearing it all down

```sh
gcloud run services delete "$SERVICE" --region="$REGION" --quiet
gcloud storage rm -r "gs://${BUCKET}" --quiet
gcloud iam service-accounts delete "$SA_EMAIL" --quiet
gcloud secrets delete "$SECRET" --quiet

# Optional: delete the container images Cloud Build pushed.
gcloud artifacts docker images delete \
  "${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/${SERVICE}" \
  --delete-tags --quiet
```

## Troubleshooting

- **`PERMISSION_DENIED` reading/writing the bucket at runtime** — the service account is missing `roles/storage.objectUser` on the bucket, or you deployed without `--service-account`.
- **`memory/` is empty and the app seems to have forgotten everything** — first-run seeding only fires when `expenses.json` / `facts.json` are absent in the mount. Check `gcloud storage ls gs://$BUCKET/memory/` and the startup logs from `docker-entrypoint.sh`.
- **Cold starts time out** — bump `--timeout` and keep `--cpu-boost` on. The first turn spawns `pi`, which loads its own deps.
- **Receipts uploaded but the agent can't read them** — confirm the upload landed under `gs://$BUCKET/memory/images/`. The path in chat is `agent-home/memory/images/...` which is symlinked to `/data/memory/images/` at container start.
