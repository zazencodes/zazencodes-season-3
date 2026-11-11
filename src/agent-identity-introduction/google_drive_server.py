"""
Google Drive MCP server with Descope auth
"""

import os

import httpx
from descope_mcp import get_connection_token
from fastmcp import FastMCP
from fastmcp.server.auth import AccessToken
from fastmcp.server.auth.providers.descope import DescopeProvider
from fastmcp.server.dependencies import CurrentAccessToken

# ---- Config -----------------------------------------------------------------
DESCOPE_CONFIG_URL = "https://api.descope.com/v1/apps/agentic/P3DwkQY3vSDuTJkEYAvUcnDdksLA/MS3EslTwZFFSo6s30K2H43cKfl3MP/.well-known/openid-configuration"
SERVER_URL = "http://localhost:8000"
GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive"
MCP_TRANSPORT = "streamable-http"

# ---- FastMCP Server ---------------------------------------------------------
auth_provider = DescopeProvider(
    config_url=DESCOPE_CONFIG_URL,
    base_url=SERVER_URL,
    scopes_supported=["google-drive"],
)

mcp = FastMCP(name="Google Drive Descope Demo", auth=auth_provider)

# ---- Tools ------------------------------------------------------------------


@mcp.tool
def echo(message: str) -> str:
    """Echo a message back — useful for testing connectivity."""
    return f"Echo: {message}"


@mcp.tool
async def search_drive(
    query: str,
    max_results: int = 10,
    token: AccessToken = CurrentAccessToken(),
) -> str:
    """Search Google Drive for files matching a query.

    Uses Google Drive's query syntax. Examples:
    - \"name contains 'report'\" — files with 'report' in the name
    - \"mimeType='application/pdf'\" — only PDF files
    - \"'me' in owners\" — files owned by you

    Full syntax: https://developers.google.com/drive/api/guides/search-files
    """
    # 1. Extract user_id from the validated Descope JWT
    user_id = token.claims.get("sub") or token.claims.get("userId")
    if not user_id:
        return "Error: Could not extract user ID from the access token."

    # 2. Exchange Descope token for a Google Drive OAuth token
    try:
        google_token = get_connection_token(
            user_id=user_id,
            app_id="google-drive",
            scopes=[GOOGLE_DRIVE_SCOPE],
            access_token=token.token,
            project_id=_extract_project_id(DESCOPE_CONFIG_URL),
        )
    except Exception as exc:
        return f"Error obtaining Google Drive token: {exc}"

    # 3. Call Google Drive API
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://www.googleapis.com/drive/v3/files",
                headers={"Authorization": f"Bearer {google_token}"},
                params={
                    "q": query,
                    "pageSize": max_results,
                    "fields": (
                        "files(id,name,mimeType,webViewLink,size,modifiedTime),"
                        "nextPageToken"
                    ),
                },
            )
            resp.raise_for_status()
            data = resp.json()

        files = data.get("files", [])
        if not files:
            return "No files found matching your query."

        lines = []
        for f in files:
            name = f.get("name", "Untitled")
            fid = f.get("id", "")
            mime = f.get("mimeType", "unknown")
            modified = f.get("modifiedTime", "unknown")
            link = f.get("webViewLink", "N/A")
            size = f.get("size")
            size_str = f"  Size: {int(size)} bytes\n" if size else ""
            lines.append(
                f"- **{name}**  \n"
                f"  ID: `{fid}`  \n"
                f"  Type: {mime}  \n"
                f"  Modified: {modified}  \n"
                f"{size_str}"
                f"  Link: {link}"
            )

        result = "\n\n".join(lines)
        if data.get("nextPageToken"):
            result += (
                "\n\n_(More results available. Narrow query or increase max_results.)_"
            )
        return result

    except httpx.HTTPStatusError as exc:
        return f"Google Drive API error (HTTP {exc.response.status_code}): {exc.response.text}"
    except Exception as exc:
        return f"Error searching Google Drive: {exc}"


# ---- Helpers ----------------------------------------------------------------


def _extract_project_id(url: str) -> str:
    from urllib.parse import urlparse

    parsed = urlparse(url)
    parts = [p for p in parsed.path.split("/") if p]
    if "agentic" in parts:
        idx = parts.index("agentic")
        return parts[idx + 1]
    return parts[0] if parts else ""


# ---- Run --------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run(transport=MCP_TRANSPORT)
