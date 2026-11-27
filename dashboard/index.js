const path = require("path");
const crypto = require("crypto");
const expressSession = require("express-session");
const Database = require("better-sqlite3");
const maker = require("../handlers/modules/maker");

const DISCORD_API = "https://discord.com/api/v10";
const MANAGE_GUILD = 0x20n;
const ADMINISTRATOR = 0x8n;

class SQLiteSessionStore extends expressSession.Store {
  constructor(filename) {
    super();
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL");
    this.db.exec("CREATE TABLE IF NOT EXISTS dashboard_sessions (sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expires INTEGER NOT NULL)");
    this.getStmt = this.db.prepare("SELECT sess, expires FROM dashboard_sessions WHERE sid = ?");
    this.setStmt = this.db.prepare("INSERT INTO dashboard_sessions (sid, sess, expires) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess, expires=excluded.expires");
    this.destroyStmt = this.db.prepare("DELETE FROM dashboard_sessions WHERE sid = ?");
    this.touchStmt = this.db.prepare("UPDATE dashboard_sessions SET expires = ? WHERE sid = ?");
    this.db.prepare("DELETE FROM dashboard_sessions WHERE expires <= ?").run(Date.now());
  }
  get(sid, callback) {
    try {
      const row = this.getStmt.get(sid);
      if (!row) return callback(null, null);
      if (row.expires <= Date.now()) {
        this.destroyStmt.run(sid);
        return callback(null, null);
      }
      callback(null, JSON.parse(row.sess));
    } catch (error) { callback(error); }
  }
  set(sid, sess, callback) {
    try {
      const expires = sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 86400000;
      this.setStmt.run(sid, JSON.stringify(sess), expires);
      if (callback) callback(null);
    } catch (error) { if (callback) callback(error); }
  }
  destroy(sid, callback) {
    try { this.destroyStmt.run(sid); if (callback) callback(null); }
    catch (error) { if (callback) callback(error); }
  }
  touch(sid, sess, callback) {
    try {
      const expires = sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 86400000;
      this.touchStmt.run(expires, sid);
      if (callback) callback(null);
    } catch (error) { if (callback) callback(error); }
  }
}

function hasGuildManagement(permission, owner) {
  if (owner) return true;
  try {
    const bits = BigInt(permission || "0");
    return (bits & ADMINISTRATOR) === ADMINISTRATOR || (bits & MANAGE_GUILD) === MANAGE_GUILD;
  } catch { return false; }
}

function setupDashboard(app, { bots, db }) {
  const publicDir = path.join(__dirname, "public");
  const clientId = process.env.DASHBOARD_CLIENT_ID;
  const clientSecret = process.env.DASHBOARD_CLIENT_SECRET;
  const redirectUri = process.env.DASHBOARD_REDIRECT_URI;
  const sessionSecret = process.env.DASHBOARD_SESSION_SECRET;
  const developerIds = new Set([maker.MAKER_OWNER_ID, ...(process.env.DASHBOARD_DEVELOPER_IDS || "").split(",").map(x => x.trim()).filter(Boolean)]);

  if (!sessionSecret) console.warn("[Dashboard] Set DASHBOARD_SESSION_SECRET to enable secure sessions.");
  app.set("trust proxy", 1);
  app.use("/dashboard", expressSession({
    name: "screentranslator.sid",
    secret: sessionSecret || crypto.randomBytes(32).toString("hex"),
    store: new SQLiteSessionStore(path.resolve(process.cwd(), "dashboard_sessions.sqlite")),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  }));
  app.use("/dashboard/assets", express.static(publicDir));

  const json = (res, status, data) => res.status(status).json(data);
  const requireOAuthConfig = (res) => {
    if (!clientId || !clientSecret || !redirectUri || !sessionSecret) {
      json(res, 503, { error: "Dashboard OAuth is not configured. Set DASHBOARD_CLIENT_ID, DASHBOARD_CLIENT_SECRET, DASHBOARD_REDIRECT_URI and DASHBOARD_SESSION_SECRET." });
      return false;
    }
    return true;
  };
  const requireUser = (req, res, next) => {
    if (!req.session.user || !req.session.accessToken) return json(res, 401, { error: "يرجى تسجيل الدخول أولاً." });
    next();
  };
  const discordFetch = async (url, token) => {
    const response = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (!response.ok) throw new Error("Discord API returned " + response.status);
    return response.json();
  };
  const ensureAccessToken = async (req) => {
    if (req.session.tokenExpiresAt > Date.now() + 30000) return req.session.accessToken;
    if (!req.session.refreshToken) throw new Error("Discord session expired");
    const refreshBody = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: req.session.refreshToken
    });
    const refreshed = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: refreshBody
    });
    if (!refreshed.ok) throw new Error("Discord session refresh failed");
    const tokens = await refreshed.json();
    req.session.accessToken = tokens.access_token;
    req.session.refreshToken = tokens.refresh_token;
    req.session.tokenExpiresAt = Date.now() + tokens.expires_in * 1000;
    return req.session.accessToken;
  };
  const getUserGuilds = async (req) => {
    const accessToken = await ensureAccessToken(req);
    if (!req.session.guilds || req.session.guildsFetchedAt < Date.now() - 60000) {
      req.session.guilds = await discordFetch(DISCORD_API + "/users/@me/guilds", accessToken);
      req.session.guildsFetchedAt = Date.now();
    }
    return req.session.guilds;
  };
  const getAllPremiumRecords = async () => {
    const rows = await db.all();
    return rows.filter(row => row.id.startsWith("premium_user_") && row.value && row.value.active && Number(row.value.endDate) > Date.now()).map(row => row.value);
  };
  const getBot = (id) => bots.find(client => client.user && client.user.id === id);
  const isDeveloper = (userId) => developerIds.has(userId);

  app.get("/dashboard", (req, res) => res.sendFile(path.join(publicDir, "index.html")));
  app.get("/dashboard/login", (req, res) => {
    if (!requireOAuthConfig(res)) return;
    const state = crypto.randomBytes(24).toString("hex");
    req.session.oauthState = state;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "identify guilds",
      state
    });
    res.redirect("https://discord.com/oauth2/authorize?" + params.toString());
  });
  app.get("/dashboard/callback", async (req, res) => {
    try {
      if (!requireOAuthConfig(res)) return;
      if (!req.query.code || !req.query.state || req.query.state !== req.session.oauthState) {
        return res.status(400).send("OAuth state validation failed. Return to the dashboard and try again.");
      }
      delete req.session.oauthState;
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code: String(req.query.code),
        redirect_uri: redirectUri
      });
      const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      });
      if (!tokenResponse.ok) throw new Error("Discord OAuth token exchange failed: " + tokenResponse.status);
      const tokens = await tokenResponse.json();
      const user = await discordFetch(DISCORD_API + "/users/@me", tokens.access_token);
      req.session.regenerate(error => {
        if (error) return res.status(500).send("Unable to create a secure session.");
        req.session.user = { id: user.id, username: user.username, globalName: user.global_name, avatar: user.avatar };
        req.session.accessToken = tokens.access_token;
        req.session.refreshToken = tokens.refresh_token;
        req.session.tokenExpiresAt = Date.now() + (tokens.expires_in * 1000);
        req.session.save(saveError => {
          if (saveError) return res.status(500).send("Unable to save session.");
          res.redirect("/dashboard");
        });
      });
    } catch (error) {
      console.error("[Dashboard OAuth]", error.message);
      res.status(502).send("تعذر تسجيل الدخول عبر Discord. حاول مرة أخرى.");
    }
  });
  app.post("/dashboard/logout", (req, res) => req.session.destroy(() => {
    res.clearCookie("screentranslator.sid");
    res.status(204).end();
  }));

  app.get("/dashboard/api/me", (req, res) => {
    if (!req.session.user) return json(res, 200, { authenticated: false });
    json(res, 200, { authenticated: true, user: req.session.user, developer: isDeveloper(req.session.user.id) });
  });

  app.get("/dashboard/api/bots", requireUser, async (req, res) => {
    try {
      const records = await getAllPremiumRecords();
      const premiumBotIds = new Set(records.map(record => record.botId).filter(Boolean));
      const normalBots = bots.filter(client => client.user && client.isReady() && client.user.id !== maker.MAKER_BOT_ID && !premiumBotIds.has(client.user.id));
      json(res, 200, { bots: normalBots.map(client => ({ id: client.user.id, username: client.user.username, avatar: client.user.displayAvatarURL({ size: 96 }), guildCount: client.guilds.cache.size })) });
    } catch (error) { json(res, 500, { error: "تعذر تحميل البوتات." }); }
  });

  app.get("/dashboard/api/guilds", requireUser, async (req, res) => {
    try {
      const mode = req.query.mode === "premium" ? "premium" : "normal";
      const developer = isDeveloper(req.session.user.id);
      const records = await getAllPremiumRecords();
      if (mode === "premium") {
        const owned = isDeveloper(req.session.user.id)
        ? records
        : records.filter(record => record.userId === req.session.user.id || record.dashboardOwnerId === req.session.user.id);
        const guilds = owned.map(record => {
          const bot = getBot(record.botId);
          const guild = bot && bot.guilds.cache.get(record.guildId);
          if (!guild) return null;
          return { id: guild.id, name: guild.name, icon: guild.iconURL({ size: 128 }), botId: bot.user.id, botName: bot.user.username, status: "available", plan: record.planLabel || "Premium", endDate: record.endDate };
        }).filter(Boolean);
        return json(res, 200, { mode, guilds, message: guilds.length ? null : "لا يوجد سيرفر مرتبط باشتراك Premium نشط." });
      }

      const botId = String(req.query.botId || "");
      const bot = getBot(botId);
      const premiumBotIds = new Set(records.map(record => record.botId).filter(Boolean));
      if (!bot || bot.user.id === maker.MAKER_BOT_ID || premiumBotIds.has(bot.user.id)) {
        return json(res, 400, { error: "البوت العادي المحدد غير متاح." });
      }

      if (developer) {
        const guilds = [...bot.guilds.cache.values()].map(guild => ({
          id: guild.id,
          name: guild.name,
          icon: guild.iconURL({ size: 128 }),
          manageable: true,
          botPresent: true,
          status: "manage"
        }));
        return json(res, 200, { mode, guilds, developer: true });
      }

      const userGuilds = await getUserGuilds(req);
      const guilds = userGuilds.map(item => {
        const manageable = hasGuildManagement(item.permissions, item.owner);
        const present = bot.guilds.cache.has(item.id);
        return {
          id: item.id,
          name: item.name,
          icon: item.icon ? "https://cdn.discordapp.com/icons/" + item.id + "/" + item.icon + ".png?size=128" : null,
          manageable,
          botPresent: present,
          status: !manageable ? "no_permission" : present ? "manage" : "invite"
        };
      });
      json(res, 200, { mode, guilds });
    } catch (error) {
      console.error("[Dashboard guild list]", error.message);
      json(res, 502, { error: "تعذر جلب السيرفرات من Discord." });
    }
  });

  app.get("/dashboard/api/access", requireUser, async (req, res) => {
    try {
      const guildId = String(req.query.guildId || "");
      const mode = req.query.mode === "premium" ? "premium" : "normal";
      const botId = String(req.query.botId || "");
      if (!/^\d{17,20}$/.test(guildId)) return json(res, 400, { error: "معرّف السيرفر غير صالح." });
      const bot = getBot(botId);
      if (!bot || !bot.isReady()) return json(res, 404, { error: "البوت غير متاح حالياً." });
      const guild = bot.guilds.cache.get(guildId);
      if (!guild) return json(res, 403, { error: "البوت غير موجود في هذا السيرفر." });
      const developer = isDeveloper(req.session.user.id);
      if (mode === "premium") {
        const records = await getAllPremiumRecords();
        const allowed = records.some(record =>
          record.guildId === guildId &&
          record.botId === botId &&
          (developer || record.userId === req.session.user.id || record.dashboardOwnerId === req.session.user.id)
        );
        if (!allowed) return json(res, 403, { error: "هذا السيرفر غير مرتبط باشتراك Premium نشط لحسابك." });
      } else {
        const records = await getAllPremiumRecords();
        const isPremiumBot = records.some(record => record.botId === botId);
        if (bot.user.id === maker.MAKER_BOT_ID || isPremiumBot) return json(res, 403, { error: "هذا البوت ليس ضمن البوتات العادية." });
        if (!developer) {
          const userGuilds = await getUserGuilds(req);
          const membership = userGuilds.find(item => item.id === guildId);
          if (!membership || !hasGuildManagement(membership.permissions, membership.owner)) {
            return json(res, 403, { error: "لا توجد صلاحية لإدارة هذا السيرفر." });
          }
        }
      }
      json(res, 200, { allowed: true, guild: { id: guild.id, name: guild.name, icon: guild.iconURL({ size: 128 }) }, bot: { id: bot.user.id, username: bot.user.username }, developer });
    } catch (error) {
      console.error("[Dashboard access check]", error.message);
      json(res, 502, { error: "تعذر التحقق من صلاحيات السيرفر." });
    }
  });

  app.get("/dashboard/api/premium", requireUser, async (req, res) => {
    try {
      const records = await getAllPremiumRecords();
      const guilds = records.filter(record => record.userId === req.session.user.id || record.dashboardOwnerId === req.session.user.id).map(record => ({
        guildId: record.guildId, botId: record.botId, active: record.active, endDate: record.endDate, plan: record.planLabel || record.plan
      }));
      json(res, 200, { subscriptions: guilds });
    } catch { json(res, 500, { error: "تعذر تحميل الاشتراكات." }); }
  });

  app.get("/dashboard/api/health", (req, res) => json(res, 200, { ok: true, readyBots: bots.filter(bot => bot.isReady()).length }));
}

module.exports = setupDashboard;
