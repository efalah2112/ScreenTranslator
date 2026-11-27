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

The application also needs its existing bot environment variables, including `BOT_TOKENS`, `TOKEN_ENCRYPTION_KEY`, and any configured main bot tokens. The entry point loads `.env` with dotenv and listens on `PORT`, then `SERVER_PORT`, then `2022` as a fallback; set the port allocated by your hosting panel.

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

- Normal: the signed-in user must own the Discord application for the selected bot, and must own the Discord guild or have Manage Server / Administrator permission. Both checks are repeated server-side. If the selected bot is already in the guild, the dashboard offers management; otherwise it offers a bot invite. Guilds without sufficient permission are labelled "لا توجد صلاحية".
- Premium: only the guild attached to the user's active Premium subscription is listed.
- Developer: the maker owner and IDs configured in \`DASHBOARD_DEVELOPER_IDS\` can inspect all normal-bot guilds and active Premium subscriptions without Discord guild permissions.

## Connected dashboard features

- `GET /dashboard/api/workspace?guildId=...&botId=...&mode=normal|premium`: reads live QuickDB settings, guild text/category channels, roles, recent log-channel messages, and dashboard audit entries.
- `POST /dashboard/api/workspace`: validates and saves whitelisted ticket, application, automation, appearance, and role settings into the same QuickDB keys used by the bot.
- `POST /dashboard/api/panels`: sends real Discord ticket, support, or application panels using the existing interaction custom IDs handled by the bot.
- Ticket settings map to existing keys such as `logs_`, `orderroom_`, `auctionroom_`, `catbuy_*`, `shopad_`, `orderad_`, and `support_*`.
- Application settings map to `apply_room_`, `apply_type_`, `apply_roles_`, `apply_admin_`, `apply_ticketcat_`, `apply_qs_`, and `apply_disabled_`.
- Automation settings map to the existing forbidden-word, warning, tax/emoji-channel, shortcut, and auto-mention-reset keys.
- Appearance settings map to `embed_color_` and `image_`. Role settings update the existing role IDs consumed by bot handlers.
- Each save and panel publication is recorded in `dashboard_audit_<guildId>`; the logs page also reads the configured Discord log channel.

All write endpoints repeat bot/guild/subscription authorization on the server and validate channel/role IDs against the selected guild. The GitHub syntax workflow does not replace live Discord testing: confirm the bot has permission to view channels, send messages, embed links, and use components before relying on panel publication.
