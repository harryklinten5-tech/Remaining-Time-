# Shift Tracker (React)

Migrated from a single HTML file to React + Vite.

## Run the web app locally

```sh
npm install
npm run dev
```

## Chrome extension (Manifest V3)

The extension lives in `extension/` and is a lightweight popup app. It stores shift settings locally with Chrome's `storage` API and does not require an account or access to browsing data.

### Load it in Chrome for testing

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose the repository's `extension` folder.
4. Pin **Remaining Time — Shift Tracker** from the Extensions menu.

After changes, select **Reload** on the extension card. The extension currently has no backend and no network permissions.

## Daily data

- Web app entries are stored in browser localStorage on the current device.
- Extension settings are stored separately in Chrome local storage.
- The extension's daily settings are keyed to the browser's local calendar date.
- Shift length supports 1–12 hours; completed time accepts HH:MM or HH.MM.
