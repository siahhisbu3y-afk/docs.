# Concord Docs
1. Google Cloud → Credentials → OAuth client (Web). Redirect URI: https://docs.concordstudios.lol/api/auth/callback
   Put your Google email + Client ID in wrangler.toml.
2. In this folder: `npx wrangler deploy` (creates the database + domain automatically), then `npx wrangler secret put GOOGLE_CLIENT_SECRET`.
3. Open https://docs.concordstudios.lol and sign in. (concordstudios.lol must be an Active zone on your Cloudflare account.)
If deploy says the D1 database needs an id: `npx wrangler d1 create concord-docs`, paste the id as database_id in wrangler.toml, deploy again.
