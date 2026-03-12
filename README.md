# Find Your Stuff

Find Your Stuff is now split into a static frontend and a standalone Node API. A signed-in user can tell the app where they placed an item, then ask for that location later. The app uses:

- Local email/password authentication with server-tracked sessions
- Neon Postgres for storage
- Gemini for message classification
- Static HTML/CSS/JavaScript for the frontend

## Project structure

```text
FindYourStuff/
  web/                  static frontend pages and scripts
  api/                  standalone Node API
  scripts/dev.mjs       helper that runs both locally
```

## API environment variables

Put your real values in `api/.env`:

```bash
DATABASE_URL=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
PORT=4000
NODE_ENV=development
SESSION_DAYS=7
CORS_ORIGIN=http://localhost:5500,http://127.0.0.1:5500
ADMIN_EMAILS=
```

## Run locally

```bash
npm install
npm run dev
```

Open the frontend at `http://localhost:5500`.

The combined dev command starts:

- the API at `http://localhost:4000`
- the static frontend at `http://localhost:5500`

To apply database migrations manually:

```bash
cd api
npm run migrate
```

## Notes

- SQL migrations live in `api/src/db/migrations`.
- The API applies migrations on startup and also supports `cd api && npm run migrate`.
- Each user only reads and writes their own item records.
- The frontend talks to the API with cross-origin cookies.
- Auth is handled directly by the backend endpoints under `/api/auth`.
