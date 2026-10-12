# Concord Docs

Files: `worker.js` (API + auth), `index.html` (the app, imported by the worker), `public/og.png` (share-link banner), `wrangler.jsonc`.

## Setup
1. Discord redirect URI: `https://docs.concordstudios.lol/api/auth/callback`
2. Fill `OWNER_DISCORD_ID`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` in `wrangler.jsonc` (or use `wrangler secret put`).
3. Make sure the `d1_databases` entry has a `database_id`. Tables are created automatically on first request.
4. `npx wrangler deploy`

## Sharing
Add people by Discord user ID (Discord > Settings > Advanced > Developer Mode, then right-click a user > Copy User ID) or by display name if they've already signed in and it's unique. Or use "Anyone with the link".

## Notes
Collaboration syncs every 3s (last-write-wins with automatic version snapshots, not character-level merging). Link previews use `public/og.png`.
