"""Connect a Descope user to Google Drive.

This helper is intentionally small. Run it, enter the Descope login ID for the
person connecting Google Drive, finish Google consent in the browser, and the
script verifies that Descope has stored the user's Google Drive token.
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

import httpx
from descope import DescopeClient
from descope.exceptions import AuthException


PROJECT_ID = "P3DwkQY3vSDuTJkEYAvUcnDdksLA"
API_BASE = "https://api.descope.com"
APP_ID = "google-drive"
GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive"
REDIRECT_URL = "http://localhost:8765/descope-google-drive-connected"
TOKEN_CHECK_ATTEMPTS = 12


def main() -> int:
    management_key = os.getenv("DESCOPE_MANAGEMENT_KEY")
    if not management_key:
        print("Set DESCOPE_MANAGEMENT_KEY in the environment.", file=sys.stderr)
        return 2

    login_id = input("Descope login ID/email: ").strip()
    if not login_id:
        print("Login ID is required.", file=sys.stderr)
        return 2

    client = DescopeClient(project_id=PROJECT_ID, management_key=management_key)
    user = get_or_create_user(client, login_id)
    user_id = user["userId"]

    print(f"Descope user: {login_id} ({user_id})")

    callback = CallbackWaiter(REDIRECT_URL)
    callback.start()

    connect_url = create_connect_url(
        client=client,
        login_id=login_id,
        redirect_url=REDIRECT_URL,
    )
    print("\nOpen this URL and complete Google consent:")
    print(connect_url)
    webbrowser.open(connect_url)

    print(f"\nWaiting for browser callback on {REDIRECT_URL}")
    if not callback.wait(timeout=240):
        print("Timed out waiting for Google consent to finish.", file=sys.stderr)
        return 1

    token = wait_for_token(management_key=management_key, user_id=user_id)
    if not token:
        print("No Google Drive token found in Descope after consent.", file=sys.stderr)
        return 1

    print("\nGoogle Drive token is stored in Descope:")
    print(json.dumps(redact_token(token), indent=2))
    return 0


def get_or_create_user(client: DescopeClient, login_id: str) -> dict[str, Any]:
    try:
        return client.mgmt.user.load(login_id)["user"]
    except AuthException as exc:
        if not is_user_not_found(exc):
            raise

    return client.mgmt.user.create(
        login_id=login_id,
        email=login_id if "@" in login_id else None,
        verified_email=True if "@" in login_id else None,
    )["user"]


def is_user_not_found(exc: AuthException) -> bool:
    if exc.status_code == 404:
        return True

    message = exc.error_message or ""
    try:
        data = json.loads(message)
    except ValueError:
        return "User not found" in message

    return (
        data.get("errorCode") == "E112102"
        or data.get("errorDescription") == "User not found"
    )


def create_connect_url(
    *,
    client: DescopeClient,
    login_id: str,
    redirect_url: str,
) -> str:
    session = client.mgmt.jwt.sign_in(login_id)
    refresh_jwt = session["refreshSessionToken"]["jwt"]

    response = httpx.post(
        f"{API_BASE}/v1/outbound/oauth/connect",
        headers={
            "Authorization": f"Bearer {PROJECT_ID}:{refresh_jwt}",
            "Content-Type": "application/json",
        },
        json={
            "appId": APP_ID,
            "options": {
                "redirectUrl": redirect_url,
                "scopes": [GOOGLE_DRIVE_SCOPE],
            },
        },
        timeout=30.0,
    )
    response.raise_for_status()
    return response.json()["url"]


def wait_for_token(*, management_key: str, user_id: str) -> dict[str, Any] | None:
    for _ in range(TOKEN_CHECK_ATTEMPTS):
        token = fetch_latest_token(management_key=management_key, user_id=user_id)
        if token:
            return token
        time.sleep(2)
    return None


def fetch_latest_token(*, management_key: str, user_id: str) -> dict[str, Any] | None:
    response = httpx.post(
        f"{API_BASE}/v1/mgmt/outbound/app/user/token/latest",
        headers={
            "Authorization": f"Bearer {PROJECT_ID}:{management_key}",
            "Content-Type": "application/json",
        },
        json={
            "appId": APP_ID,
            "userId": user_id,
            "options": {"withRefreshToken": False, "forceRefresh": False},
        },
        timeout=30.0,
    )
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json()["token"]


def redact_token(token: dict[str, Any]) -> dict[str, Any]:
    return {
        key: ("<redacted>" if key in {"accessToken", "refreshToken", "token"} else value)
        for key, value in token.items()
    }


class CallbackWaiter:
    def __init__(self, redirect_url: str):
        parsed = urlparse(redirect_url)
        if parsed.hostname not in {"localhost", "127.0.0.1"}:
            raise ValueError("Callback URL must be localhost")
        if not parsed.port:
            raise ValueError("Callback URL must include a port")

        self.redirect_path = parsed.path or "/"
        self.event = threading.Event()
        self.server = ThreadingHTTPServer(
            (parsed.hostname, parsed.port),
            self._handler_class(),
        )

    def start(self) -> None:
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()

    def wait(self, timeout: int) -> bool:
        try:
            return self.event.wait(timeout)
        finally:
            self.server.shutdown()
            self.server.server_close()

    def _handler_class(self):
        waiter = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802
                parsed = urlparse(self.path)
                if parsed.path == waiter.redirect_path:
                    waiter.event.set()
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(
                        b"<html><body><h1>Google Drive connected.</h1>"
                        b"<p>You can close this tab.</p></body></html>"
                    )
                    return

                self.send_response(404)
                self.end_headers()

            def log_message(self, format: str, *args: Any) -> None:
                return

        return Handler


if __name__ == "__main__":
    try:
        sys.exit(main())
    except AuthException as exc:
        print(f"Descope error: {exc}", file=sys.stderr)
        sys.exit(1)
    except httpx.HTTPStatusError as exc:
        print(f"HTTP {exc.response.status_code}: {exc.response.text}", file=sys.stderr)
        sys.exit(1)
