# Kanban Board — Plan

## Overview

Single-user Kanban board with a React frontend and Express backend. No auth. Data persisted to a local JSON file.

## Stack

- **Frontend:** Vite + React + shadcn/ui + Tailwind CSS
- **Backend:** Express, JSON file persistence
- **Monorepo:** single repo, two packages, run together via `concurrently`

## Project Structure

```
kanban-board/
├── client/
│   ├── src/
│   │   ├── components/   # Board, Column, Card, modals
│   │   ├── hooks/        # useBoard (data fetching + mutations)
│   │   └── lib/          # API client (fetch wrapper)
│   └── vite.config.ts    # proxies /api → localhost:3001
├── server/
│   ├── src/
│   │   ├── routes/       # /api/columns, /api/cards
│   │   ├── db.ts         # JSON file read/write
│   │   └── index.ts      # app entry
│   └── data/
│       └── board.json    # persisted state
└── package.json          # root scripts using concurrently
```

## Features

- Columns with create/edit/delete
- Cards with title + description, create/edit/delete
- Drag-and-drop to move cards between columns

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/board | Get full board state |
| POST | /api/columns | Create column |
| PATCH | /api/columns/:id | Rename column |
| DELETE | /api/columns/:id | Delete column |
| POST | /api/cards | Create card |
| PATCH | /api/cards/:id | Update card (title, description, columnId) |
| DELETE | /api/cards/:id | Delete card |

## Data Shape (board.json)

```json
{
  "columns": [
    { "id": "uuid", "title": "To Do", "order": 0 }
  ],
  "cards": [
    { "id": "uuid", "columnId": "uuid", "title": "Task", "description": "", "order": 0 }
  ]
}
```
