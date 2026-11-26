# Shift Tracker (React)

Migrated from a single HTML file to React + Vite.

## Run locally

```sh
npm install
npm run dev
```

## Daily data

- Entries are stored in browser localStorage on the current device.
- The entry is scoped to the browser's local calendar date and is cleared when that date changes, including when the app is reopened after midnight.
- Time inputs validate hours/minutes and support HH:MM or HH.MM. Clock input validates 12-hour AM/PM or 24-hour format.
- With a shift start time, estimated end is start plus shift length. Without it, remaining duration counts down from now.

## Keka

Keka sync is not implemented yet. It requires employer-approved API access, the relevant Keka API documentation/auth method, and a server-side proxy so credentials never enter browser code. Store credentials in server/deployment secrets, not VITE_ variables.
