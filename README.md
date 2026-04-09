# ScheduForge Web MVP

Working web MVP for ScheduForge: employees and managers, shifts, coverage requests, schedules, and optional AI-assisted scheduling.

## Implemented modules

- **User management:** employee/manager roles, sign-up and login
- **Shift management:** assigned shifts, post for coverage, available shifts
- **Scheduling:** schedules and manager shift creation
- **Shift requests:** request to cover, manager approve/deny, notifications

## Prerequisites

- **Node.js** (v20+ recommended)
- **MySQL 8+** running locally, **or** Docker if you prefer the provided `docker-compose` setup

---

## Local database setup (MySQL)

### 1. Create the database

Connect to MySQL as a user that can create databases (often `root`), then:

```sql
CREATE DATABASE IF NOT EXISTS scheduforge CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Environment variables

1. Copy the example env file to `.env` in the **project root** (same folder as this `README.md`):

   ```bash
   copy .env.example .env
   ```

   On macOS/Linux:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and set:

   - **`MYSQL_USER`** / **`MYSQL_PASSWORD`** — your local MySQL user and password (commonly `root` and your own root password).
   - **`MYSQL_DATABASE`** — keep `scheduforge` unless you used a different database name above.
   - **`MYSQL_HOST`** / **`MYSQL_PORT`** — usually `127.0.0.1` and `3306`.

   **Important:** Save the file after editing. The API reads `ScheduForge/.env` from disk; an unsaved buffer in the editor is not used.

### 3. Apply the schema

The schema lives at `database/schema.sql`. Apply it once per database (creates all tables).

**Windows (PowerShell), from the project root:**

```powershell
npm run db:schema
```

This runs `database/run-schema.ps1`, which pipes `schema.sql` into the `mysql` client using the credentials from your `.env`.

**Alternative — MySQL Shell / Workbench:**

- Open `database/schema.sql` and execute it against the `scheduforge` database, **or**
- From a terminal (paths may vary):

  ```bash
  mysql -u root -p scheduforge < database/schema.sql
  ```

  On PowerShell, `<` redirection is unreliable; use:

  ```powershell
  Get-Content -Raw .\database\schema.sql | mysql -u root -p --default-character-set=utf8mb4 scheduforge
  ```

### 4. First API run (seed data)

When you start the app (next section), the API will **seed** demo users and data the first time it connects to an **empty** `employees` table. If you need a clean reset, use **Reset Database** in the login UI (clears browser storage and re-seeds via the API when configured).

---

## Optional: MySQL with Docker

If you use Docker Desktop:

```bash
docker compose up -d
```

Set **`MYSQL_ROOT_PASSWORD`** (and optionally `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE`) in `.env` to match `docker-compose.yml`. The compose file mounts `database/schema.sql` so **new** containers initialize the schema on first startup. Adjust `.env` so the Node API uses the same user/password as the container.

---

## Run the app locally

From the **project root**:

```bash
npm install
npm install --prefix server
npm run dev
```

This starts:

- the **API** on port **3001** (see `PORT` in `.env`)
- the **Vite** dev server (URL printed in the terminal, often `http://localhost:5173`)

Open the Vite URL in your browser. The UI proxies `/api` to the API.

**Frontend only (no MySQL / no API):**

```bash
npm run dev:web
```

The app will fall back to browser storage if the API is unavailable.

---

## Useful scripts

| Script            | Description                                      |
| ----------------- | ------------------------------------------------ |
| `npm run dev`     | API + Vite together                              |
| `npm run dev:web` | Vite only                                        |
| `npm run build`   | Typecheck + production build                     |
| `npm run db:schema` | Apply `database/schema.sql` (Windows script)   |
| `npm run db:up`   | Start MySQL via Docker Compose                   |
| `npm run db:down` | Stop Docker Compose stack                        |

---

## Troubleshooting

- **`Access denied` for MySQL:** Check `MYSQL_USER` / `MYSQL_PASSWORD` in `.env` and that they match a real MySQL account. Remove stray system env vars named `MYSQL_*` if they override your file, or ensure `.env` is saved.
- **Port `3001` in use:** Stop the other process or change `PORT` in `.env` (and update Vite’s proxy in `vite.config.ts` if you change the API port).
- **Schema / FK errors:** Re-run `database/schema.sql` on a fresh database or use **Reset Database** in the app after the API is working.

---

## Build

```bash
npm run build
```

Output is written to `dist/`.
