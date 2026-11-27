const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle,
    ChannelType, PermissionFlagsBits, MessageFlags,
    ContainerBuilder, SectionBuilder, TextDisplayBuilder,
    SeparatorBuilder, SeparatorSpacingSize,
    MediaGalleryBuilder, MediaGalleryItemBuilder, ThumbnailBuilder,
} = require("discord.js");
const cron = require("node-cron");
const emojis = require("./emojis");
const ED = require("./embedDescriptions");

const MAX_IMAGES = 4;
const MAX_POST_LENGTH = 1800;
const PAYMENT_TIME_MS = 3 * 60 * 1000;
const SIMILARITY_THRESHOLD = 0.85;

const FORBIDDEN_PATTERNS_SRC = [
    "@everyone", "@here", "discord\\.gg/\\S+", "discord\\.com/invite/\\S+", "dsc\\.gg/\\S+",
    "(twitter\\.com|x\\.com)/\\S+", "instagram\\.com/\\S+", "facebook\\.com/\\S+", "tiktok\\.com/\\S+",
    "(youtube\\.com|youtu\\.be)/\\S+", "snapchat\\.com/\\S+", "(telegram\\.me|t\\.me)/\\S+",
    "whatsapp\\.com/\\S+", "wa\\.me/\\S+", "bit\\.ly/\\S+", "tinyurl\\.com/\\S+",
    "rb\\.gy/\\S+", "cutt\\.ly/\\S+", "\\b\\d{10,15}\\b", "\\b[\\w.-]+@[\\w.-]+\\.\\w+\\b",
];

const SCHEDULES = [
    { label: "كل 5 دقائق", value: "*/5 * * * *" },
    { label: "كل 10 دقائق", value: "*/10 * * * *" },
    { label: "كل 15 دقيقة", value: "*/15 * * * *" },
    { label: "كل 30 دقيقة", value: "*/30 * * * *" },
    { label: "كل ساعة", value: "0 * * * *" },
    { label: "كل ساعتين", value: "0 */2 * * *" },
    { label: "كل 6 ساعات", value: "0 */6 * * *" },
    { label: "كل 12 ساعة", value: "0 */12 * * *" },
];

function containsForbidden(text) {
    if (!text) return false;
    for (const src of FORBIDDEN_PATTERNS_SRC) {
        if (new RegExp(src, "i").test(text)) return true;
    }
    return false;
}

function isValidImageUrl(url) {
    if (!url) return false;
    try { new URL(url); } catch { return false; }
    return /\.(?:jpg|jpeg|png|gif|webp|bmp)$/i.test(url);
}

function scheduleLabel(value) {
    return SCHEDULES.find((s) => s.value === value)?.label || value;
}

function similarity(a, b) {
    const wa = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
    const wb = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
    if (wa.size === 0 || wb.size === 0) return 0;
    let inter = 0;
    for (const w of wa) if (wb.has(w)) inter++;
    return inter / new Set([...wa, ...wb]).size;
}

module.exports = function registerExchangeSystem(client, { db, config }) {
    const cfgKey = (gid) => `xch_cfg_${gid}`;
    const postsKey = (gid) => `xch_posts_${gid}`;
    const idxKey = (gid) => `xch_idx_${gid}`;
    const pendKey = (uid) => `xch_pend_${uid}`;
    const tempKey = (uid) => `xch_temp_${uid}`;

    const defaultCfg = () => ({
        enabled: false, allowedRoles: [], rooms: [],
        schedule: "*/15 * * * *", userLimit: 5, price: 0,
        transferRoom: null, bankId: null, logRoom: null, totalPublished: 0,
    });

    const getCfg = async (gid) => (await db.get(cfgKey(gid))) || defaultCfg();
    const setCfg = async (gid, c) => db.set(cfgKey(gid), c);
    const getPosts = async (gid) => (await db.get(postsKey(gid))) || [];
    const setPosts = async (gid, p) => db.set(postsKey(gid), p);

    async function getServerColor(guildId) {
        try { const ec = require("./embedColor"); return ec.color(guildId) || 0x9B59B6; }
        catch { return 0x9B59B6; }
    }

    async function getServerImage(guild) {
        const banner = guild.bannerURL({ size: 1024, extension: "png" });
        if (banner) return banner;
        return await db.get(`image_${guild.id}`) || null;
    }

    // ✅ دالة البانل العام
    async function buildPublicPanel(guild) {
        const cfg = await getCfg(guild.id);
        const clr = await getServerColor(guild.id);
        const icon = guild.iconURL({ size: 1024 });
        const image = await getServerImage(guild);

        const container = new ContainerBuilder().setAccentColor(clr);
        const sec = new SectionBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# نظام التبادل — ${cfg.price > 0 ? "مدفوع" : "مجاني"}`)
        );
        if (icon && icon.startsWith("http")) sec.setThumbnailAccessory(new ThumbnailBuilder().setURL(icon));
        container.addSectionComponents(sec);
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(ED.exchangeSystem_003({ cfg, isPaid: cfg.price > 0, scheduleLabel })));
        if (image) { container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)); container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(image))); }
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${guild.name} | نظام التبادل`));
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("xch_open_panel").setLabel("نشر تلقائي").setStyle(ButtonStyle.Secondary),
            )
        );
        return { components: [container], flags: MessageFlags.IsComponentsV2 };
    }

    const cronJobs = new Map();

    async function startCronFor(guildId) {
        const old = cronJobs.get(guildId);
        if (old) { try { old.stop(); } catch {} cronJobs.delete(guildId); }
        const cfg = await getCfg(guildId);
        if (!cfg.enabled || !cron.validate(cfg.schedule)) return;
        const job = cron.schedule(cfg.schedule, () => publishNext(guildId).catch(() => {}));
        cronJobs.set(guildId, job);
    }

    function stopCronFor(guildId) {
        const j = cronJobs.get(guildId);
        if (j) { try { j.stop(); } catch {} cronJobs.delete(guildId); }
    }

    async function publishNext(guildId) {
        const cfg = await getCfg(guildId);
        if (!cfg.enabled || cfg.rooms.length === 0) return;
        const posts = await getPosts(guildId);
        if (posts.length === 0) return;
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;
        let idx = (await db.get(idxKey(guildId))) || 0;
        if (idx >= posts.length) idx = 0;
        const post = posts[idx];
        await db.set(idxKey(guildId), (idx + 1) % posts.length);
        const room = guild.channels.cache.get(post.roomId) || guild.channels.cache.get(cfg.rooms[0]);
        if (!room) return;
        try {
            const hook = (await room.fetchWebhooks()).find(h => h.name === "Exchange" && h.owner?.id === client.user.id) ||
                await room.createWebhook({ name: "Exchange", avatar: client.user.displayAvatarURL({ extension: "png" }) });
            let authorName = post.authorTag || "مستخدم";
            let authorAvatar = null;
            try {
                const member = await guild.members.fetch(post.authorId).catch(() => null);
                if (member) { authorName = member.displayName; authorAvatar = member.displayAvatarURL({ size: 256 }); }
            } catch {}
            let content = post.content;
            if (post.images?.length) content += "\n" + post.images.join("\n");
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`xch_contact_${post.authorId}`).setLabel("تواصل").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setLabel("بروفايل").setStyle(ButtonStyle.Link).setURL(`https://discord.com/users/${post.authorId}`),
            );
            await hook.send({ content: content.slice(0, 2000), username: authorName.slice(0, 80), avatarURL: authorAvatar || undefined, components: [row], allowedMentions: { parse: [] } });
            const fresh = await getPosts(guildId);
            const target = fresh.find(p => p.id === post.id);
            if (target) { target.timesPublished = (target.timesPublished || 0) + 1; await setPosts(guildId, fresh); }
            const freshCfg = await getCfg(guildId);
            freshCfg.totalPublished = (freshCfg.totalPublished || 0) + 1;
            await setCfg(guildId, freshCfg);
        } catch {}
    }

    function userAllowed(member, cfg) {
        if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
        if (cfg.allowedRoles.length === 0) return true;
        return member.roles.cache.some(r => cfg.allowedRoles.includes(r.id));
    }

    client.on("interactionCreate", async (interaction) => {
        if (!interaction.guild) return;
        try {
            const gid = interaction.guild.id;
            const guild = interaction.guild;
            const cfg = await getCfg(gid);
            const clr = await getServerColor(gid);
            const icon = guild.iconURL({ size: 1024 });
            const image = await getServerImage(guild);

            if (interaction.isChatInputCommand?.() && interaction.commandName === "exchange-setup") {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: "❌ للأدمن فقط.", ephemeral: true });
                const container = new ContainerBuilder().setAccentColor(clr);
                const sec = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent("# إعدادات التبادل"));
                if (icon && icon.startsWith("http")) sec.setThumbnailAccessory(new ThumbnailBuilder().setURL(icon));
                container.addSectionComponents(sec);
                container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(ED.exchangeSystem_002({ cfg, scheduleLabel })));
                if (image) { container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)); container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(image))); }
                container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${guild.name}`));
                const r1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("xch_set_roles").setLabel("الرتب").setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId("xch_set_rooms").setLabel("القنوات").setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId("xch_set_schedule").setLabel("الوقت").setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId("xch_set_limit").setLabel("الحد").setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId("xch_set_price").setLabel("السعر").setStyle(ButtonStyle.Secondary),
                );
                const r2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("xch_set_transfer").setLabel("التحويل").setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId("xch_set_bank").setLabel("البنك").setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId("xch_set_log").setLabel("اللوق").setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId("xch_set_toggle").setLabel(cfg.enabled ? "إيقاف" : "تفعيل").setStyle(cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
                );
                const r3 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("xch_set_publish_now").setLabel("نشر الآن").setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId("xch_set_send_panel").setLabel("بانل").setStyle(ButtonStyle.Secondary),
                );
                container.addActionRowComponents(r1, r2, r3);
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            if (interaction.isButton?.()) {
                const id = interaction.customId;
                if (id?.startsWith("xch_contact_")) {
                    const targetId = id.replace("xch_contact_", "");
                    try { const target = await client.users.fetch(targetId); await target.send({ content: `📩 <@${interaction.user.id}> يريد التواصل معك.` }); return interaction.reply({ content: "✅ تم.", ephemeral: true }); }
                    catch { return interaction.reply({ content: "⚠️ DMs مغلقة.", ephemeral: true }); }
                }
                if (id === "xch_open_panel") {
                    if (!userAllowed(interaction.member, cfg)) return interaction.reply({ content: "❌ لا تملك صلاحية.", ephemeral: true });
                    const posts = await getPosts(gid);
                    const userPosts = posts.filter(p => p.authorId === interaction.user.id);
                    const container = new ContainerBuilder().setAccentColor(clr);
                    const sec = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`# التبادل — ${cfg.price > 0 ? "مدفوع" : "مجاني"}`));
                    if (icon && icon.startsWith("http")) sec.setThumbnailAccessory(new ThumbnailBuilder().setURL(icon));
                    container.addSectionComponents(sec);
                    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
                    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(ED.exchangeSystem_001({ cfg, isPaid: cfg.price > 0, scheduleLabel, userPosts })));
                    if (image) { container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)); container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(image))); }
                    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
                    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${guild.name}`));
                    const menu = new StringSelectMenuBuilder().setCustomId("xch_user_menu").setPlaceholder("اختر").addOptions([
                        { label: "إضافة", value: "add", description: cfg.price > 0 ? `السعر: ${cfg.price}` : "مجاني" },
                        { label: "منشوراتي", value: "list" },
                        { label: "تعديل", value: "edit" },
                        { label: "حذف", value: "del" },
                    ]);
                    container.addActionRowComponents(new ActionRowBuilder().addComponents(menu));
                    return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                }
                if (id?.startsWith("xch_set_")) {
                    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: "❌ للأدمن فقط.", ephemeral: true });
                    const action = id.replace("xch_set_", "");
                    if (action === "roles") { const m = new RoleSelectMenuBuilder().setCustomId("xch_pick_roles").setPlaceholder("اختر الرتب").setMinValues(0).setMaxValues(10); return interaction.reply({ content: "اختر الرتب:", components: [new ActionRowBuilder().addComponents(m)], ephemeral: true }); }
                    if (action === "rooms") { const m = new ChannelSelectMenuBuilder().setCustomId("xch_pick_rooms").setPlaceholder("اختر القنوات").addChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(10); return interaction.reply({ content: "اختر القنوات:", components: [new ActionRowBuilder().addComponents(m)], ephemeral: true }); }
                    if (action === "transfer") { const m = new ChannelSelectMenuBuilder().setCustomId("xch_pick_transfer").setPlaceholder("اختر روم التحويل").addChannelTypes(ChannelType.GuildText); return interaction.reply({ content: "اختر الروم:", components: [new ActionRowBuilder().addComponents(m)], ephemeral: true }); }
                    if (action === "log") { const m = new ChannelSelectMenuBuilder().setCustomId("xch_pick_log").setPlaceholder("اختر روم اللوق").addChannelTypes(ChannelType.GuildText); return interaction.reply({ content: "اختر الروم:", components: [new ActionRowBuilder().addComponents(m)], ephemeral: true }); }
                    if (action === "send_panel") { const m = new ChannelSelectMenuBuilder().setCustomId("xch_pick_panel_room").setPlaceholder("اختر قناة").addChannelTypes(ChannelType.GuildText); return interaction.reply({ content: "اختر القناة:", components: [new ActionRowBuilder().addComponents(m)], ephemeral: true }); }
                    if (action === "schedule") { const m = new StringSelectMenuBuilder().setCustomId("xch_pick_schedule").setPlaceholder("اختر الوقت").addOptions(SCHEDULES); return interaction.reply({ content: "اختر الوقت:", components: [new ActionRowBuilder().addComponents(m)], ephemeral: true }); }
                    if (action === "bank") { const modal = new ModalBuilder().setCustomId("xch_modal_bank").setTitle("ID البنك"); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("bank").setLabel("ID البوت").setStyle(TextInputStyle.Short).setRequired(true))); return interaction.showModal(modal); }
                    if (action === "limit") { const modal = new ModalBuilder().setCustomId("xch_modal_limit").setTitle("الحد"); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("val").setLabel("العدد").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(cfg.userLimit)))); return interaction.showModal(modal); }
                    if (action === "price") { const modal = new ModalBuilder().setCustomId("xch_modal_price").setTitle("السعر"); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("val").setLabel("السعر").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(cfg.price)))); return interaction.showModal(modal); }
                    if (action === "toggle") { cfg.enabled = !cfg.enabled; await setCfg(gid, cfg); cfg.enabled ? await startCronFor(gid) : stopCronFor(gid); const panel = await buildPublicPanel(guild); return interaction.update(panel); }
                    if (action === "publish_now") { await interaction.deferReply({ ephemeral: true }); await publishNext(gid); return interaction.editReply("✅ تم النشر."); }
                }
                return;
            }

            if (interaction.isStringSelectMenu?.()) {
                const id = interaction.customId;
                const posts = await getPosts(gid);
                if (id === "xch_user_menu") {
                    const userPosts = posts.filter(p => p.authorId === interaction.user.id);
                    const action = interaction.values[0];
                    if (action === "add") {
                        if (cfg.rooms.length === 0) return interaction.reply({ content: "❌ لا توجد قنوات.", ephemeral: true });
                        if (userPosts.length >= cfg.userLimit) return interaction.reply({ content: "❌ وصلت للحد.", ephemeral: true });
                        const opts = cfg.rooms.slice(0, 25).map(rid => { const ch = guild.channels.cache.get(rid); return ch ? { label: `#${ch.name}`.slice(0, 90), value: rid } : null; }).filter(Boolean);
                        const m = new StringSelectMenuBuilder().setCustomId("xch_pick_room").setPlaceholder("اختر القناة").addOptions(opts);
                        return interaction.reply({ content: "اختر القناة:", components: [new ActionRowBuilder().addComponents(m)], ephemeral: true });
                    }
                    if (action === "list") {
                        if (userPosts.length === 0) return interaction.reply({ content: "📭 لا توجد منشورات.", ephemeral: true });
                        return interaction.reply({ content: userPosts.map((p, i) => `**${i + 1}.** ${p.content.slice(0, 80)}`).join("\n"), ephemeral: true });
                    }
                    if (action === "edit" || action === "del") {
                        if (userPosts.length === 0) return interaction.reply({ content: "📭 لا توجد منشورات.", ephemeral: true });
                        const opts = userPosts.slice(0, 25).map(p => ({ label: p.content.slice(0, 90), value: String(p.id) }));
                        const m = new StringSelectMenuBuilder().setCustomId(`xch_post_${action}`).setPlaceholder(action === "del" ? "حذف" : "تعديل").addOptions(opts);
                        return interaction.reply({ content: "اختر:", components: [new ActionRowBuilder().addComponents(m)], ephemeral: true });
                    }
                }
                if (id === "xch_pick_room") {
                    await db.set(tempKey(interaction.user.id), { roomId: interaction.values[0], mode: "add" });
                    const modal = new ModalBuilder().setCustomId("xch_add_modal").setTitle("إضافة منشور");
                    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("content").setLabel("المحتوى").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(MAX_POST_LENGTH)));
                    for (let i = 1; i <= MAX_IMAGES; i++) modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(`img${i}`).setLabel(`صورة ${i}`).setStyle(TextInputStyle.Short).setRequired(false)));
                    return interaction.showModal(modal);
                }
                if (id === "xch_post_edit" || id === "xch_post_del") {
                    const postId = Number(interaction.values[0]);
                    const post = posts.find(p => p.id === postId && p.authorId === interaction.user.id);
                    if (!post) return interaction.reply({ content: "❌ غير موجود.", ephemeral: true });
                    if (id === "xch_post_del") { await setPosts(gid, posts.filter(p => p.id !== postId)); return interaction.reply({ content: "✅ تم الحذف.", ephemeral: true }); }
                    await db.set(tempKey(interaction.user.id), { postId, mode: "edit" });
                    const modal = new ModalBuilder().setCustomId("xch_edit_modal").setTitle("تعديل");
                    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("content").setLabel("المحتوى").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(MAX_POST_LENGTH).setValue(post.content)));
                    for (let i = 1; i <= MAX_IMAGES; i++) modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(`img${i}`).setLabel(`صورة ${i}`).setStyle(TextInputStyle.Short).setRequired(false).setValue(post.images?.[i - 1] || "")));
                    return interaction.showModal(modal);
                }
                if (id === "xch_pick_schedule") {
                    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
                    cfg.schedule = interaction.values[0];
                    await setCfg(gid, cfg);
                    if (cfg.enabled) await startCronFor(gid);
                    return interaction.reply({ content: "✅ تم.", ephemeral: true });
                }
                return;
            }

            if (interaction.isRoleSelectMenu?.() && interaction.customId === "xch_pick_roles") {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
                cfg.allowedRoles = [...interaction.values];
                await setCfg(gid, cfg);
                return interaction.reply({ content: "✅ تم.", ephemeral: true });
            }

            if (interaction.isChannelSelectMenu?.()) {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
                const id = interaction.customId;
                if (id === "xch_pick_rooms") { cfg.rooms = [...interaction.values]; await setCfg(gid, cfg); return interaction.reply({ content: "✅ تم.", ephemeral: true }); }
                if (id === "xch_pick_transfer") { cfg.transferRoom = interaction.values[0]; await setCfg(gid, cfg); return interaction.reply({ content: "✅ تم.", ephemeral: true }); }
                if (id === "xch_pick_log") { cfg.logRoom = interaction.values[0]; await setCfg(gid, cfg); return interaction.reply({ content: "✅ تم.", ephemeral: true }); }
                if (id === "xch_pick_panel_room") {
                    const ch = guild.channels.cache.get(interaction.values[0]);
                    if (!ch) return interaction.reply({ content: "❌ غير موجود.", ephemeral: true });
                    const panel = await buildPublicPanel(guild);
                    await ch.send(panel).catch(() => null);
                    return interaction.reply({ content: "✅ تم.", ephemeral: true });
                }
                return;
            }

            if (interaction.isModalSubmit?.()) {
                const id = interaction.customId;
                if (id === "xch_modal_limit") {
                    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
                    const v = parseInt(interaction.fields.getTextInputValue("val"), 10);
                    if (!v || v < 1) return interaction.reply({ content: "❌ رقم غير صالح.", ephemeral: true });
                    cfg.userLimit = v; await setCfg(gid, cfg);
                    return interaction.reply({ content: `✅ تم: ${v}`, ephemeral: true });
                }
                if (id === "xch_modal_price") {
                    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
                    const v = parseInt(interaction.fields.getTextInputValue("val"), 10);
                    if (isNaN(v) || v < 0) return interaction.reply({ content: "❌ رقم غير صالح.", ephemeral: true });
                    cfg.price = v; await setCfg(gid, cfg);
                    return interaction.reply({ content: `✅ تم: ${v}`, ephemeral: true });
                }
                if (id === "xch_modal_bank") {
                    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
                    cfg.bankId = interaction.fields.getTextInputValue("bank").trim();
                    await setCfg(gid, cfg);
                    return interaction.reply({ content: "✅ تم.", ephemeral: true });
                }
                if (id === "xch_add_modal" || id === "xch_edit_modal") {
                    await interaction.deferReply({ ephemeral: true });
                    const temp = await db.get(tempKey(interaction.user.id));
                    if (!temp) return interaction.editReply("❌ انتهت الجلسة.");
                    const content = interaction.fields.getTextInputValue("content").trim();
                    if (containsForbidden(content)) return interaction.editReply("❌ محتوى ممنوع.");
                    const images = [];
                    for (let i = 1; i <= MAX_IMAGES; i++) { const v = interaction.fields.getTextInputValue(`img${i}`).trim(); if (!v) continue; if (!isValidImageUrl(v)) return interaction.editReply(`❌ رابط صورة ${i} غير صالح.`); images.push(v); }
                    const posts = await getPosts(gid);
                    if (id === "xch_edit_modal") {
                        const post = posts.find(p => p.id === temp.postId && p.authorId === interaction.user.id);
                        if (!post) return interaction.editReply("❌ غير موجود.");
                        post.content = content; post.images = images;
                        await setPosts(gid, posts); await db.delete(tempKey(interaction.user.id));
                        return interaction.editReply("✅ تم التعديل.");
                    }
                    const userPosts = posts.filter(p => p.authorId === interaction.user.id);
                    if (userPosts.length >= cfg.userLimit) return interaction.editReply("❌ وصلت للحد.");
                    const newPost = { id: Date.now(), content, images, roomId: temp.roomId, authorId: interaction.user.id, authorTag: interaction.user.tag, createdAt: new Date().toISOString(), timesPublished: 0 };
                    if (cfg.price === 0) { posts.push(newPost); await setPosts(gid, posts); await db.delete(tempKey(interaction.user.id)); return interaction.editReply(`✅ أُضيف.`); }
                    if (!cfg.transferRoom || !cfg.bankId) return interaction.editReply("❌ إعدادات ناقصة.");
                    const transferCh = guild.channels.cache.get(cfg.transferRoom);
                    if (!transferCh) return interaction.editReply("❌ روم التحويل غير موجود.");
                    const tax = Math.floor(cfg.price * (20 / 19) + 1);
                    await db.set(pendKey(interaction.user.id), { post: newPost, guildId: gid, tax });
                    await transferCh.send({ content: `<@${interaction.user.id}> حوّل **${tax.toLocaleString()}** إلى <@${cfg.bankId}> خلال 3 دقائق.` });
                    await transferCh.send(`c ${cfg.bankId} ${tax}`);
                    const filter = (m) => m.author.id === cfg.bankId;
                    const collector = transferCh.createMessageCollector({ filter, time: PAYMENT_TIME_MS });
                    const userId = interaction.user.id;
                    let paid = false;
                    collector.on("collect", (m) => { const allText = (m.content || "") + " " + (m.embeds || []).map(e => `${e.title || ""} ${e.description || ""}`).join(" "); if (allText.includes(`<@${userId}>`) && allText.includes(`<@${cfg.bankId}>`) && (allText.includes(String(tax)) || allText.includes(tax.toLocaleString())) && /has transferred|قام بتحويل|transferred/i.test(allText)) { paid = true; collector.stop("PAID"); } });
                    collector.on("end", async () => { await db.delete(pendKey(userId)); if (paid) { const cur = await getPosts(gid); cur.push(newPost); await setPosts(gid, cur); interaction.followUp({ content: "✅ تم الدفع.", ephemeral: true }).catch(() => {}); } else { interaction.followUp({ content: "❌ انتهى الوقت.", ephemeral: true }).catch(() => {}); } });
                    await db.delete(tempKey(interaction.user.id));
                    return interaction.editReply(`✅ تم إرسال الطلب.`);
                }
                return;
            }
        } catch (err) {
            console.error("[exchange] error:", err.message);
            try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: `⚠️ خطأ: ${err.message}`, ephemeral: true }); } catch {}
        }
    });

    client.once("ready", async () => {
        try {
            const all = await db.all();
            const keys = (all || []).filter(e => e.id.startsWith("xch_cfg_"));
            for (const e of keys) { const gid = e.id.replace("xch_cfg_", ""); if (e.value?.enabled) await startCronFor(gid); }
            console.log(`✅ التبادل: ${cronJobs.size} مهمة`);
        } catch {}
    });
};