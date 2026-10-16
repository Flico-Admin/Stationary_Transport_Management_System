# Request Desk: Stationery and Vehicle Request Management System (frontend)

React + Vite frontend. All data now comes from the backend (`../backend`) and the MySQL database.

## Run
```bash
npm install
npm run dev
```
Open http://localhost:5173 (the backend must be running, see ../SETUP-GUIDE.md).

## Structure
- `src/api.js`          fetch helper that calls the backend
- `src/permissions.js`  roles, modules, view/add/edit/delete model
- `src/store.jsx`       all data and actions, every action calls the backend
- `src/data/mock.js`    only the constants (vehicle types, statuses) are still used
- `src/pages/*`         one file per screen
- `src/components/*`    layout, request detail (approval flow), UI helpers
