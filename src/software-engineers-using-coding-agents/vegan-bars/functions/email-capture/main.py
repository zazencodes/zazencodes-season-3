import functions_framework
import re
import uuid
from datetime import datetime, timezone
from google.cloud import storage

BUCKET_NAME = "vegan-bars-waitlist"
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


@functions_framework.http
def capture_email(request):
    if request.method == "OPTIONS":
        return "", 204, CORS_HEADERS

    data = request.get_json(silent=True)
    if not data or "email" not in data:
        return {"error": "missing email"}, 400, CORS_HEADERS

    email = str(data["email"]).strip().lower()
    if not EMAIL_RE.match(email):
        return {"error": "invalid email"}, 400, CORS_HEADERS

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    filename = f"{timestamp}-{uuid.uuid4().hex}.txt"

    client = storage.Client()
    bucket = client.bucket(BUCKET_NAME)
    blob = bucket.blob(filename)
    blob.upload_from_string(email, content_type="text/plain")

    return {"status": "ok", "file": filename}, 200, CORS_HEADERS
