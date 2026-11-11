# Neon Meal Helper Agent

A meal-planning AI agent that runs all the time, built with the Pi agent harness on Neon. You chat with the agent, and it manages your recipes, meal plan, grocery lists and pantry. It can also read recipe photos and text files that you upload. A side pane shows each item the agent creates or changes.

Companion code for the video **Build and Deploy an Always-On AI Agent with Pi** (coming soon).

## Stack

- **Neon Postgres**: stores recipes, the meal plan, groceries, the pantry and chat history (`db/schema.sql`)
- **Neon Auth**: user sign-in. Every row belongs to a user.
- **Neon Object Storage**: a private `recipe-files` bucket for uploads
- **Neon Functions**: a Hono API plus a streaming agent endpoint (`src/server/index.ts`)
- **Neon AI Gateway**: model calls for the Pi agent (GLM 5.3 Flash)
- **React + Vite**: the web client (`src/client`), hosted on Vercel

`neon.ts` declares all of the Neon resources.

## Setup

Requires Node.js 22.18+ (it runs `.ts` scripts directly) and a Neon account.

```bash
npm install

# Sign in, then create or pick a Neon project. This writes .neon and .env.local.
npx neon auth
npx neon link

# Create Auth, the AI Gateway, the bucket and the Function from neon.ts
npm run deploy:api

# Create the tables (they reference neon_auth.user, so deploy first)
npm run db:migrate
```

## Run locally

In two terminals:

```bash
npm run dev:api   # Function on http://localhost:8787
npm run dev:web   # Vite on http://localhost:5173, which proxies /api to the Function
```

## Deploy

1. Deploy the API with `npm run deploy:api`. This also writes `NEON_FUNCTION_MEALS_BASE_URL` to `.env.local`.
2. In `vercel.json`, replace `<your-meals-function-host>` with the host from that URL.
3. Deploy the web client to Vercel with `npx vercel deploy --prod`. Vercel builds `dist/` and sends `/api/*` to your Function, so the auth cookie stays on the app's own domain.

## Project layout

```
neon.ts              Neon resources (auth, AI gateway, bucket, function)
db/schema.sql        Postgres schema
scripts/migrate.ts   Applies the schema
src/server/          Neon Function: Hono API, Pi agent, tools, auth proxy, storage
src/client/          React app: chat and side pane (recipes, plan, groceries, pantry, files)
src/shared/          Types shared by the server and the client
vercel.json          Vercel build and /api rewrite
```
