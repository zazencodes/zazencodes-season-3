# Google Drive MCP Server with Descope

This folder contains a local FastMCP server that lets an MCP client search
Google Drive through Descope-managed identity.

## Prerequisites

- Python 3.12 or newer.
- `uv`, or another way to install the dependencies in `pyproject.toml`.
- A Descope management key with access to this project.

## Setup

- The Descope Google Drive outbound app ID is `google-drive`.
- The local MCP server URL is `http://localhost:8000/mcp`.

Set the management key before using the token helper:

```sh
export DESCOPE_MANAGEMENT_KEY="..."
```

## 1. Run the MCP server

Start the server in this folder:

```sh
uv run google_drive_server.py
```

Keep it running while Claude Code or Codex is connected. The server uses
streamable HTTP and listens at:

```text
http://localhost:8000/mcp
```

## 2. Add to your Agent

### Claude Code

Add the local HTTP MCP server:

```sh
claude mcp add --transport http google-drive-descope http://localhost:8000/mcp
```

Then open Claude Code and run:

```text
/mcp
```

Choose `google-drive-descope` and complete the OAuth login in the browser.


### Codex

Add the local HTTP MCP server:

```
codex mcp add google-drive-descope --url http://localhost:8000/mcp
```

Then authenticate the MCP server:

```sh
codex mcp login google-drive-descope --scopes google-drive
```


## 3. Connect Google Drive

Run the helper:

```sh
uv run python connect_google_drive.py
```

The script asks for the Descope login ID/email. If that Descope user does not
exist yet, it creates the user. It then opens the Google consent URL and waits
for the localhost callback.


## 4. Test

After both auth steps are complete, ask the MCP client to use the `search_drive` tool.

Example query:

```text
What files do I have in google drive?
```



