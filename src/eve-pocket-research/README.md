# Pocket Research

A research assistant for the phone. Give it a topic or question and it searches the web and replies with a short brief and sources. Every research item is listed on the home page, so you can open one later and ask follow-up questions.

It is an [eve](https://eve.dev) agent with a Next.js web app.

## Setup

Set these environment variables (in `.env.local` for local development, and on the Vercel project for production):

| Variable              | Purpose                                                      |
| --------------------- | ------------------------------------------------------------ |
| `DATABASE_URL`        | Postgres connection string for the research item index.      |
| `BASIC_AUTH_USERNAME` | Username for the login prompt that guards the app and agent. |
| `BASIC_AUTH_PASSWORD` | Password for that prompt.                                    |

Create the table once per database:

```bash
npm run db:setup
```

Then run the app:

```bash
npm run dev
```

## How it works

- `agent/instructions.md` defines the research process and the brief format. Research uses eve's built-in `web_search` and `web_fetch` tools.
- Each research item is one eve session. `agent/hooks/research-index.ts` records every message in the `research_items` table; the first message becomes the item's title.
- `app/page.tsx` lists research items, newest activity first. `app/s/[sessionId]` reopens one.
- `proxy.ts` puts the web app behind HTTP Basic auth. `agent/channels/eve.ts` accepts the same credentials on the agent routes.

## Learn more

To learn more about eve, explore these resources:

- [eve documentation](https://eve.dev/docs) — learn about eve's features and authoring APIs.
- [Build an Agent tutorial](https://eve.dev/docs/tutorial/first-agent) — build and deploy an agent step by step.
- [eve on GitHub](https://github.com/vercel/eve) — view the source and contribute.

## Deploy on Vercel

Deploy your agent to [Vercel](https://vercel.com) from the project root:

```bash
eve deploy
```

`eve deploy` links a Vercel project if needed and deploys the agent to production. See the [eve deployment documentation](https://eve.dev/docs/guides/deployment/vercel) for authentication, environment variables, and deployment options.
