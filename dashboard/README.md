# ScreenTranslator Dashboard

## Discord OAuth setup

Create or use a Discord application for the dashboard login and add this exact redirect URL to its OAuth2 Redirects:

\`https://YOUR_DOMAIN/dashboard/callback\`

Configure these environment variables in the hosting provider (never commit their values):

- \`DASHBOARD_CLIENT_ID\`: Discord application/client ID used for OAuth login.
- \`DASHBOARD_CLIENT_SECRET\`: OAuth client secret.
- \`DASHBOARD_REDIRECT_URI\`: exact callback URL configured in the Discord Developer Portal.
- \`DASHBOARD_SESSION_SECRET\`: long random secret (at least 32 random bytes).
- \`DASHBOARD_DEVELOPER_IDS\`: optional comma-separated Discord user IDs for additional dashboard developers. The existing maker owner is included automatically.

The application also needs its existing bot environment variables, including \`BOT_TOKENS\`, \`TOKEN_ENCRYPTION_KEY\`, and any configured main bot tokens.

## Current dashboard routes

- \`/dashboard\`: responsive Arabic dashboard.
- \`/dashboard/login\`: Discord OAuth2 login (identify + guilds).
- \`/dashboard/callback\`: OAuth callback with state validation.
- \`/dashboard/api/me\`: current authenticated user.
- \`/dashboard/api/bots\`: available normal bots.
- \`/dashboard/api/guilds?mode=normal&botId=...\`: guild list and permission/bot-install status.
- \`/dashboard/api/guilds?mode=premium\`: active Premium guilds owned by the logged-in buyer (developers can inspect all active Premium guilds).
- \`/dashboard/api/premium\`: buyer's active subscriptions.
- \`/dashboard/logout\`: destroy the session.

Sessions are stored server-side in SQLite; the browser receives only an HTTP-only session cookie. OAuth tokens are not sent to browser JavaScript. Use HTTPS in production.

## Access rules

- Normal: the signed-in user must own the Discord guild or have Manage Server / Administrator permission. If the selected bot is already in the guild, the dashboard offers management; otherwise it offers a bot invite. Guilds without sufficient permission are labelled "لا توجد صلاحية".
- Premium: only the guild attached to the user's active Premium subscription is listed.
- Developer: the maker owner and IDs configured in \`DASHBOARD_DEVELOPER_IDS\` can inspect all normal-bot guilds and active Premium subscriptions without Discord guild permissions.

## Implementation status

The first dashboard milestone provides the visual shell, Discord OAuth, secure server-side sessions, bot selection, normal/Premium server selection, permission states, and invite links. Settings pages are intentionally marked as not yet connected until each control is wired to the bot's actual QuickDB keys and protected server-side by the same guild authorization rules. No fake save buttons are exposed.
