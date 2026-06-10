# MCP OAuth Flow

## Historical Context

`/.well-known/` is a standardized place on a web origin where software can discover machine-readable metadata without prior configuration.

Before this pattern, every protocol tended to invent its own discovery URL:

```text
https://example.com/some-random-config
https://example.com/api/discovery
https://example.com/oauth/metadata
```

That does not scale. Clients need a predictable place to ask:

```text
"Hey, example.com, what do you support?"
```

So the IETF standardized “well-known URIs.” RFC 8615 defines a well-known URI as a path beginning with:

```text
/.well-known/
```

Common examples:

```text
/.well-known/openid-configuration
    OpenID Connect provider metadata

/.well-known/oauth-protected-resource
    OAuth protected resource metadata, RFC 9728
```

## OAuth Context

OAuth has multiple actors:

```text
+--------+        wants token         +----------------------+
| Client | -------------------------> | Authorization Server |
+--------+                            +----------------------+
    |
    | uses token
    v
+--------------------+
| Protected Resource |
| / API / MCP server |
+--------------------+
```

RFC 8414 standardized discovery for the authorization server:

```text
GET https://auth.example.com/.well-known/oauth-authorization-server
```

That returns JSON like:

```json
{
  "issuer": "https://auth.example.com",
  "authorization_endpoint": "https://auth.example.com/authorize",
  "token_endpoint": "https://auth.example.com/token",
  "jwks_uri": "https://auth.example.com/jwks.json",
  "scopes_supported": ["openid", "profile", "email"]
}
```

## MCP Specifically

- The **MCP server** is the protected resource.
- The **MCP client** is Codex, Claude, or another agent host.
- The **authorization server** may be Descope, Auth0, WorkOS, your own OAuth server, etc.

The MCP authorization spec says MCP servers must implement OAuth Protected Resource Metadata, and MCP clients must use it for authorization server discovery.

For your local server:

```text
MCP endpoint:
http://localhost:8000/mcp
```

The corresponding protected-resource metadata route is:

```text
http://localhost:8000/.well-known/oauth-protected-resource/mcp
```

That document tells Codex:

```json
{
  "resource": "http://localhost:8000/mcp",
  "authorization_servers": [
    "https://api.descope.com/v1/apps/agentic/P3DwkQY3vSDuTJkEYAvUcnDdksLA/MS3EpGSdlmudx7cc55K81QDLg3F9T"
  ],
  "scopes_supported": ["google-drive"],
  "bearer_methods_supported": ["header"]
}
```

Then Codex goes to Descope’s authorization-server metadata:

```text
https://api.descope.com/v1/apps/agentic/<project>/<mcp-server>/.well-known/openid-configuration
```

or an OAuth authorization-server well-known URL depending on discovery rules.

That Descope document tells Codex:

```json
{
  "issuer": "https://api.descope.com/v1/apps/agentic/P3DwkQY3vSDuTJkEYAvUcnDdksLA/MS3EpGSdlmudx7cc55K81QDLg3F9T",
  "authorization_endpoint": "https://api.descope.com/oauth2/v1/apps/agentic/P3DwkQY3vSDuTJkEYAvUcnDdksLA/MS3EpGSdlmudx7cc55K81QDLg3F9T/authorize",
  "token_endpoint": "https://api.descope.com/oauth2/v1/apps/agentic/P3DwkQY3vSDuTJkEYAvUcnDdksLA/MS3EpGSdlmudx7cc55K81QDLg3F9T/token",
  "scopes_supported": ["google-drive"]
}
```

Then Codex builds the browser authorization URL.

For this Google Drive server, there are two different “scope” layers:

```text
google-drive
    The MCP-level Descope scope advertised to Codex.

https://www.googleapis.com/auth/drive
    The downstream Google OAuth scope used by the MCP tool when it fetches
    a Google Drive connection token from Descope.
```

So the flow is:

```text
Codex
  |
  | asks for MCP access with scope:
  | google-drive
  v
Descope
  |
  | returns Descope MCP access token
  v
Google Drive MCP server
  |
  | validates Descope token
  | extracts user_id
  | calls get_connection_token(app_id="google-drive",
  |                            scopes=["https://www.googleapis.com/auth/drive"])
  v
Descope outbound connection
  |
  | returns Google OAuth access token
  v
Google Drive API
```

The key idea:

```text
The MCP OAuth scope controls access to your MCP server.

The Google OAuth scope controls what the MCP server can do against Google Drive
after it has already authenticated the MCP caller.
```

There are two separate discovery documents:

```text
1. Protected Resource Metadata:

   /.well-known/oauth-protected-resource/mcp

   Served by the MCP server / API.

   "Who protects this resource?"
   "What scopes does this resource understand?"

2. Authorization Server Metadata:

   /.well-known/oauth-authorization-server

   Served by Descope / auth provider.

   "Where is the authorize endpoint?"
   "Where is the token endpoint?"
   "What scopes does this auth server issue?"
   "Does it support dynamic client registration?"
```


## The Full MCP Auth Flow (Advanced Diagram)

```text
+-------------+                         +----------------------+
| Codex MCP   |                         | Local MCP Server     |
| Client      |                         | localhost:8000/mcp   |
+-------------+                         +----------------------+
       |                                           |
       | 1. Try MCP request without token          |
       |------------------------------------------>|
       |                                           |
       | 2. 401 Unauthorized                       |
       |    WWW-Authenticate may include           |
       |    resource_metadata=...                  |
       |<------------------------------------------|
       |                                           |
       | 3. GET protected resource metadata        |
       |------------------------------------------>|
       |    /.well-known/oauth-protected-resource/mcp
       |                                           |
       | 4. resource, Descope auth server,         |
       |    MCP scope: google-drive                |
       |<------------------------------------------|
       |                                           |
       | 5. Discover auth server metadata          |
       v                                           |
+----------------------+                           |
| Descope Auth Server  |                           |
+----------------------+                           |
       |                                           |
       | GET /.well-known/openid-configuration     |
       | or /.well-known/oauth-authorization-server|
       |                                           |
       | returns authorize endpoint, token endpoint|
       | supported scopes, PKCE support, etc.      |
       v                                           |
+-------------+                                    |
| Browser     |                                    |
+-------------+                                    |
       |                                           |
       | 6. User authorizes MCP access             |
       v                                           |
+-------------+                         +----------------------+
| Codex       |                         | Descope Token URL    |
+-------------+                         +----------------------+
       |                                           |
       | 7. Exchanges code for Descope MCP token   |
       |------------------------------------------>|
       |                                           |
       | 8. Descope MCP access token               |
       |<------------------------------------------|
       |                                           |
       | 9. Calls MCP with:                        |
       |    Authorization: Bearer                  |
       |    <descope_mcp_token>                    |
       |------------------------------------------>|
       |                                           |
       | 10. Validates Descope token               |
       |     extracts user_id                      |
       |                                           |
       v                                           v
+-------------+                         +----------------------+
| Codex       |                         | Local MCP Server     |
| waits for   |                         | runs search_drive    |
| response    |                         +----------------------+
+-------------+                                    |
                                                   |
                                                   | 11. Fetch Google token:
                                                   |     app_id = "google-drive"
                                                   |     scope =
                                                   |     "https://www.googleapis.com/auth/drive"
                                                   v
                                      +-----------------------------+
                                      | Descope Outbound Connection |
                                      | for Google Drive            |
                                      +-----------------------------+
                                                   |
                                                   | 12. Uses stored Google
                                                   |     refresh token if needed;
                                                   |     returns Google access token
                                                   v
                                      +----------------------+
                                      | Local MCP Server     |
                                      +----------------------+
                                                   |
                                                   | 13. Calls Google Drive API:
                                                   |     Authorization: Bearer
                                                   |     <google_access_token>
                                                   v
                                      +----------------------+
                                      | Google Drive API     |
                                      +----------------------+
                                                   |
                                                   | 14. Returns Drive results
                                                   v
+-------------+                         +----------------------+
| Codex       |<------------------------| Local MCP Server     |
| receives    |                         | returns MCP response |
| response    |                         +----------------------+
+-------------+
```

