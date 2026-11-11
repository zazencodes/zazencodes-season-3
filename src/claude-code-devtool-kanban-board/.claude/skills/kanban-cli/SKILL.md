---
name: kanban-cli
description: >
  Use this skill whenever the user wants to interact with the Kanban board via
  the CLI — listing or creating projects, viewing a board, managing columns, or
  managing cards (create, update, move, delete). Trigger on any request like
  "show me the board", "add a card", "move that task", "create a project",
  "what's in my backlog", "rename the column", or any other Kanban management
  request, even if the user doesn't say "CLI" explicitly. Always use this skill
  instead of calling the API directly with curl.
---

# Kanban CLI Skill

The `kanban` command is globally linked and talks to the API at `http://localhost:3001`
(override with `KANBAN_API_URL`). The server must be running — if commands fail
with a connection error, remind the user to run `npm run dev -w server`.

## ID Lookup Pattern

Most commands need IDs (project, column, card). Always resolve them before acting:

```bash
# Step 1 — list projects to get a project ID
kanban projects list

# Step 2 — show board to get column/card IDs (shown truncated in [brackets])
kanban board <projectId>

# For full IDs of columns or cards, fetch the board JSON directly:
curl -s http://localhost:3001/api/projects/<projectId>/board | python3 -c \
  "import sys,json; b=json.load(sys.stdin); [print(c['title'], c['id']) for c in b['columns']]"
```

When the user refers to something by name ("the In Progress column", "the CI task"),
look it up — don't ask them to paste an ID.

## Commands

### Projects
```bash
kanban projects list
kanban projects create "<name>"
kanban projects rename <projectId> "<new name>"
kanban projects delete <projectId>
```

### Board (visual overview)
```bash
kanban board <projectId>
```
Shows all columns side-by-side with cards. Card IDs are shown truncated — use
the curl pattern above when you need a full ID.

### Columns
```bash
kanban columns create <projectId> "<title>"
kanban columns rename <projectId> <columnId> "<new title>"
kanban columns delete <projectId> <columnId>   # also deletes all cards in the column
```

### Cards
```bash
kanban cards create <projectId> <columnId> "<title>" ["<description>"]
kanban cards update <projectId> <cardId> --title/-t "<t>" --description/-d "<d>" --column/-c <columnId> --order/-o <n>
kanban cards move   <projectId> <cardId> <columnId>   # shorthand for changing column
kanban cards delete <projectId> <cardId>
```

## Common Workflows

**Add a card to a named column:**
```bash
# 1. Get project ID
kanban projects list
# 2. Get full column ID by name
curl -s http://localhost:3001/api/projects/<projectId>/board | python3 -c \
  "import sys,json; b=json.load(sys.stdin); print(next(c['id'] for c in b['columns'] if c['title']=='In Progress'))"
# 3. Create the card
kanban cards create <projectId> <columnId> "My task" "Optional description"
```

**Move a card by name:**
```bash
# Get full card ID
curl -s http://localhost:3001/api/projects/<projectId>/board | python3 -c \
  "import sys,json; b=json.load(sys.stdin); print(next(c['id'] for c in b['cards'] if c['title']=='My task'))"
# Move it
kanban cards move <projectId> <cardId> <targetColumnId>
```

**After any mutation, show the updated board** so the user can see the result:
```bash
kanban board <projectId>
```

## Tips

- Card IDs in `kanban board` output are truncated to 8 chars — use the curl/python3
  pattern to get the full UUID when needed for update/move/delete.
- `cards update` accepts any combination of flags; omit flags you don't want to change.
- `columns delete` cascades — all cards inside are permanently removed.
- If there's only one project, skip the listing step and use its ID directly.
