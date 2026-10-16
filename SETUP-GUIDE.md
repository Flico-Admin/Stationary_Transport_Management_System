# Request Desk: full system (frontend + backend + database)

This folder is the complete project, already connected:

```
request-system/
  frontend/   React app (your code, already changed to call the backend)
  backend/    Node.js + Express server + database/ (schema.sql, seed.sql)
```

All parts of the system use the database: login, requests and approvals, stock, items, vehicles and drivers, purchase orders, maintenance and fuel, departments / showrooms / warehouses, users, roles and permissions, audit log, finance integration log, reports.

You only need to do 4 things: install MySQL, create the database, start the backend, start the frontend.

---

## Step 1. Install MySQL (skip if already installed)

Install **MySQL Server** (and MySQL Workbench if you want to look at the tables). Remember the **root password** you set.

## Step 2. Set the backend login (.env)

In the `backend` folder copy `.env.example` and name the copy **`.env`** (not `.env.txt`). Open it and set:

```
PORT=4000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=<your MySQL root password>
DB_NAME=request_desk
JWT_SECRET=<type any long random text>
```

## Step 3. Create the database, tables and demo data

Open a terminal in the `backend` folder:

```
npm install
npm run db:setup
```

You must see: `Database "request_desk" is ready: 20 tables, 6 demo users.`
MySQL saves everything automatically, there is nothing else to save.

**Same thing in MySQL Workbench (instead of the command):** connect to your Local instance, `File > Open SQL Script...`, open `backend/database/schema.sql` and click the lightning bolt, then do the same with `seed.sql`. Refresh the Schemas panel to see `request_desk`. (Ctrl+S in Workbench only saves the script file, not needed.)

> Running `db:setup` or `schema.sql` again drops and recreates every table, so all data is reset.

## Step 4. Start the backend

In the same `backend` terminal:

```
npm run dev
```

You must see `Connected to MySQL database "request_desk"` and `Backend running at http://localhost:4000`. Keep it open.

## Step 5. Start the frontend

Open a second terminal in the `frontend` folder:

```
npm install
npm run dev
```

Open http://localhost:5173 and log in. Password for all demo users: `Demo@123`

| Email | Role |
|---|---|
| nimal@company.example | Employee (Marketing) |
| sunil@company.example | HOD (Operations) |
| chamari@company.example | HOD (Marketing) |
| dilani@company.example | Admin Department |
| ruwan@company.example | IT (full access) |

## Step 6. Check that it really saves

Log in as Nimal, create a request, refresh the browser: it is still there. In Workbench run `SELECT * FROM request_desk.requests;` to see the new row.

## How it works (short)

- The old `store.jsx` kept everything in browser memory. The new one calls the backend for every action, then reloads the data, so the screen always shows what is in MySQL.
- Passwords are stored as bcrypt hashes, never as plain text. Login gives a token that lasts 12 hours. A page refresh keeps you logged in.
- The server checks permissions on every action (view / add / edit / delete per part of the system), not only the buttons on the screen. Employees only receive their own requests.
- Stock changes, approvals and purchase-order receiving run as database transactions, so a half-finished change is never saved.
- Mock collections became these tables: `roles`, `role_permissions`, `units`, `users`, `user_permissions`, `categories`, `items`, `vehicles`, `drivers`, `suppliers`, `purchase_orders` (+ `_lines`, `_history`), `maintenance`, `fuel_logs`, `requests` (+ `request_lines`, `request_history`), `integration_log`, `audit_log`.
- Request numbers (`REQ-1006`) and PO numbers (`PO-1002`) come from the table id, so two people can never get the same number.
- Trip start and end times are stored exactly as the screen sends them (`2026-10-15T09:00`), dates are stored in UTC.

## Common problems

| Message | Fix |
|---|---|
| `Cannot reach the server. Is the backend running?` on the login screen | Backend terminal is not running (Step 4), or `PORT` in `.env` is not 4000. |
| `Access denied for user 'root'` | Wrong `DB_PASSWORD` in `.env`. |
| `Unknown database 'request_desk'` | Step 3 was not run. |
| `Table ... doesn't exist` | `schema.sql` did not finish. Run it again from the top. |
| `JWT_SECRET is missing` | `.env` is missing or is named `.env.txt`. |
| `EADDRINUSE` | Port 4000 is used by another program. Change `PORT` in `.env` and the `/api` target in `vite.config.js` to the same number. |
| Login says wrong password for demo users | `seed.sql` was not run, or was run before `schema.sql`. |

## Before go-live

- Delete the demo users and the demo accounts text in `Login.jsx`.
- Use a strong `JWT_SECRET`, and create a separate MySQL user for the app instead of `root`.
