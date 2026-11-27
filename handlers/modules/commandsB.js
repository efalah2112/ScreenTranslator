const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
    AttachmentBuilder,
    StringSelectMenuBuilder,
    SelectMenuBuilder,
    PermissionsBitField,
    REST,
    Routes,
    ApplicationCommandOptionType,
    WebhookClient,
    ContainerBuilder,
    MessageFlags,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ComponentType,
    SectionBuilder,
    ThumbnailBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
} = require("discord.js");
const D = require("./descriptions");
const _ec = require("./embedColor");
const fs = require("fs");
const ms = require("ms");
const path = require("path");
const emojis = require("./emojis");
const ED = require("./embedDescriptions");

// ============================================================
// ✅ أدوات مشتركة لبناء وإرسال Components V2 (نفس الأسلوب
// المستخدم بالملفات الثانية بالبوت، عشان الشكل يكون موحّد).
// ============================================================
function footerTextOf(v) {
    if (!v) return null;
    return typeof v === "string" ? v : v.text || null;
}

function buildContainer({
    title,
    description,
    color,
    image,
    footer,
    authorName,
    authorIcon,
    thumbnail,
    fields,
    mention,
}) {
    const container = new ContainerBuilder().setAccentColor(color ?? 0x2f3136);

    if (mention) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(mention),
        );
    }

    const cornerIcon = authorIcon || thumbnail;
    if (title && cornerIcon) {
        const section = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}`));
        if (authorName) {
            section.addTextDisplayComponents(new TextDisplayBuilder().setContent(authorName));
        }
        if (cornerIcon && cornerIcon.startsWith("http")) {
            section.setThumbnailAccessory(new ThumbnailBuilder().setURL(cornerIcon));
        }
        container.addSectionComponents(section);
    } else if (title) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# ${title}`),
        );
    }

    if (description) {
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
        );
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(description),
        );
    }

    if (fields?.length) {
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
        );
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                fields.map((f) => `**${f.name}**\n${f.value}`).join("\n\n"),
            ),
        );
    }

    if (image) {
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
        );
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(image),
            ),
        );
    }

    const footerText = footerTextOf(footer);
    if (footerText) {
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
        );
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# ${footerText}`),
        );
    }

    return container;
}
function sendContainer(target, container, rows = []) {
    if (rows.length) container.addActionRowComponents(...rows);
    return target.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    });
}

function replyContainer(interaction, container, { rows = [], ephemeral = false } = {}) {
    if (rows.length) container.addActionRowComponents(...rows);
    return interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0),
    });
}

function editReplyContainer(interaction, container, { rows = [] } = {}) {
    if (rows.length) container.addActionRowComponents(...rows);
    return interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    });
}

module.exports = function registerCommandsB(
    client,
    {
        db,
        config,
        botOwner,
        allowedUserId,
        owner,
        TARGET_ROLE_ID,
        TARGET_CHANNEL_ID,
        logJoinChannel,
        allowedBotId,
        prefix,
        TARGET_GUILD_ID,
        reportsChannelId,
        reportsGuildId,
        chsd,
    },
) {
    // ============================================================
    // ✅ أدوات مساعدة خاصة بهذا الملف: فحص البلاك لست + صلاحية
    // highstaff (كانت مكررة حرفيًا بـ 6 أوامر مختلفة)
    // ============================================================
    async function checkBlacklist(i) {
        const blacklist = (await db.get("blacklist")) || [];
        if (blacklist.includes(i.user.id)) {
            await i.reply({
                content:
                    "**أنت في البلاك لست، لمعلومات اكثر تعال سيرفر السبورت!**",
                ephemeral: true,
            });
            return true;
        }
        return false;
    }

    async function requireHighstaff(i, guildId) {
        const highstaff = await db.get(`highstaff_${guildId}`);
        if (!highstaff || !i.member.roles.cache.has(highstaff)) {
            await i.reply({
                content: `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر. تـحـتـاج رتـبـه <@&${highstaff || "غير محددة"}>.`,
                ephemeral: true,
            });
            return false;
        }
        return true;
    }

    // ✅ دالة موحّدة لأوامر "البانل" الأربعة (كانت شبه متطابقة حرفيًا)
    async function sendGuildPanel(i, { title, defaultDescription, imageKeys, rows }) {
        const guildId = _ec.gid(i);
        if (await checkBlacklist(i)) return;
        if (!(await requireHighstaff(i, guildId))) return;

        const text = i.options.getString("embed-text");
        const color = _ec.color(guildId);

        let imageUrl = null;
        for (const key of imageKeys) {
            imageUrl = await db.get(`${key}_${guildId}`);
            if (imageUrl) break;
        }

        const container = buildContainer({
            title,
            description: text || defaultDescription(i.guild),
            authorName: i.guild.name,
            authorIcon: i.guild.iconURL({ size: 1024 }),
            footer: i.guild?.name || "Server",
            color,
            image: imageUrl || null,
        });

        await i.reply({ content: "✅ done", ephemeral: true });
        await sendContainer(i.channel, container, rows);
    }

    client.on("interactionCreate", async (i) => {
        if (!i.isChatInputCommand()) return;
        const guildId = i.guild.id;
        switch (i.commandName) {
            case "مزاد":
                {
                    if (await checkBlacklist(i)) return;

                    const channelssend = i.options.getChannel("channel");
                    const ui = i.options.getUser("الشخص");
                    const re = i.options.getString("السلعة");
                    const pr = i.options.getString("السعر");
                    const ti = i.options.getInteger("وقت");
                    const men = i.options.getInteger("المنشن");
                    const attachments = [
                        i.options.getAttachment("صوره"),
                        i.options.getAttachment("صوره2"),
                        i.options.getAttachment("صوره3"),
                        i.options.getAttachment("صوره4"),
                        i.options.getAttachment("صوره5"),
                    ].filter((a) => a !== null);

                    const guildId = i.guild.id;
                    const admins = await db.get(`auctionad_${guildId}`);

                    if (!admins || !i.member.roles.cache.has(admins)) {
                        return i.reply({
                            content: `لـيـس لـديـك صـلاحـيـة، تـحـتـاج رتـبـه <@&${admins || "غير محددة"}>`,
                            ephemeral: true,
                        });
                    }

                    // ✅ إضافة: تحقق من صحة مدة المزاد (كانت تُقبل أي رقم حتى لو صفر أو سالب)
                    if (!ti || ti <= 0) {
                        return i.reply({
                            content: "❌ يـجـب أن تـكـون مـدة الـمـزاد (وقـت) رقـمـاً أكـبـر مـن الـصـفـر.",
                            ephemeral: true,
                        });
                    }

                    // ✅ إضافة: تحقق من صلاحيات البوت نفسه قبل البدء (كانت غير مفحوصة)
                    if (
                        !i.guild.members.me.permissions.has([
                            PermissionFlagsBits.ManageChannels,
                            PermissionFlagsBits.ManageMessages,
                        ])
                    ) {
                        return i.reply({
                            content: "❌ الـبـوت يـفـتـقـر لـصـلاحـيـة إدارة الـروم أو إدارة الـرسـائـل الـلازمـة لـتـشـغـيـل الـمـزاد.",
                            ephemeral: true,
                        });
                    }

                    let op = men === 0 ? "@everyone" : "@here";
                    const files = attachments.map((att, index) => ({
                        attachment: att.attachment,
                        name: `image${index + 1}.png`,
                    }));

                    // 1. فتح الروم فوراً
                    await channelssend.permissionOverwrites.edit(
                        i.guild.roles.everyone,
                        { SendMessages: true },
                    );

                    const endTimestamp = Math.floor(
                        (Date.now() + ti * 60000) / 1000,
                    );

                    // 2. إرسال رسالة المزاد مع زر الإنهاء اليدوي للمسؤول
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId("stop_auction_now")
                            .setLabel("إنهاء المزاد الآن")
                            .setStyle(ButtonStyle.Danger),
                    );

                    const auctionMsg = await channelssend.send({
                        content: `> **__\n> \`#\` ${config.mzademoji} الـسـلعـة : ${re}\n>\n> \`#\` ${config.mzademoji} صـاحـب السـلعـة : <@${ui.id}>\n>\n> \`#\` ${config.mzademoji} الـسعر المـبـدئـي : ${pr}\n>\n> \`#\` ${config.mzademoji} يـنـتـهـي : <t:${endTimestamp}:R>\n>\n> \`#\` ${config.mzademoji} الـمـنـشـن : ${op}\n> __**`,
                        files: files.length > 0 ? files : undefined,
                        components: [row],
                    });

                    await i.reply({
                        content: "✅ تم بدء المزاد وفتح الروم.",
                        ephemeral: true,
                    });

                    // وظيفة الإنهاء المشتركة (تُستدعى عند انتهاء الوقت أو ضغط الزر)
                    const endAuction = async (byAdmin = false) => {
                        try {
                            // 1. قفل الروم فوراً حتى لا تدخل رسائل جديدة أثناء التنظيف
                            await channelssend.permissionOverwrites.edit(
                                i.guild.roles.everyone,
                                { SendMessages: false },
                            );

                            // 2. ✅ حذف كل رسائل المزايدات المرسلة أثناء المزاد أولاً
                            // (كان الكود القديم يحذف رسالة الإعلان فقط ويترك كل
                            // رسائل المزايدة بالروم). بعدها نكمل الباقي (رسالة الختام).
                            try {
                                await channelssend.bulkDelete(100, true);
                            } catch (bulkErr) {
                                // لو فشل الحذف الجماعي (مثلاً صلاحية ناقصة أو رسائل
                                // أقدم من 14 يوم) نكتفي بحذف رسالة الإعلان نفسها
                                if (auctionMsg.deletable)
                                    await auctionMsg.delete().catch(() => {});
                            }

                            // 3. إرسال رسالة النهاية بعد التنظيف
                            await channelssend.send({
                                content: `**# انـتـهى وقـت الـمـزاد ${byAdmin ? "بواسطة الإدارة" : "تـلـقـائـيـاً"} **\n**__\nيـرجى الـتواصل مع صاحب السلعة: <@${ui.id}>\nيـنـصح بـطـلـب وسـيـط لـضـمـان حـقـك.\n__**`,
                            });
                        } catch (e) {
                            console.error(e);
                        }
                    };

                    // 3. كوليكتور للزر (للمسؤولين فقط)
                    const filter = (btnInt) =>
                        btnInt.customId === "stop_auction_now" &&
                        btnInt.member.roles.cache.has(admins);
                    const collector =
                        auctionMsg.createMessageComponentCollector({
                            filter,
                            time: ti * 60000,
                        });

                    let finished = false;
                    collector.on("collect", async (btnInt) => {
                        finished = true;
                        await btnInt.reply({
                            content: "تم إنهاء المزاد يدوياً وقفل الروم.",
                            ephemeral: true,
                        });
                        collector.stop();
                        await endAuction(true);
                    });

                    // 4. لو خلص الوقت وما حد ضغط الزر
                    collector.on("end", async () => {
                        if (!finished) {
                            await endAuction(false);
                        }
                    });
                }
                break;

            case "send-tashfeer":
                {
                    if (await checkBlacklist(i)) return;

                    const guildId = _ec.gid(i); // استخدام الدالة من ملفك لجلب الأيدي
                    const { member } = i;

                    if (!(await requireHighstaff(i, guildId))) return;

                    // جلب الصورة واللون باستخدام نظامك الجديد
                    const imageUrl = await db.get(`image_${guildId}`);
                    const color = _ec.color(guildId); // جلب اللون من الكاش مباشرة

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId("tashfeerk")
                            .setLabel("تـشـفـيـر مـنشـورك")
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji(emojis.encryption),
                    );

                    await i.reply({ content: "done", ephemeral: true });

                    const tashfeerContainer = buildContainer({
                        title: `**التـشـفـيـر**`,
                        description: `**❦\`-\` __ لتشفير منشورك يرجى الضغط على اسفل الايمبد، \`وكتابة منشورك\`.__**`,
                        authorName: i.guild.name,
                        authorIcon: i.guild.iconURL({ size: 1024 }),
                        footer: i.guild?.name || "Server",
                        color,
                        image: imageUrl || null,
                    });

                    await sendContainer(i.channel, tashfeerContainer, [row]);
                }
                break;

            case "afk":
                {
                    const reason =
                        i.options.getString("reason") || "لا يوجد سبب"; // Ensure default value is used correctly
                    const userId = i.user.id; // الحصول على معرف المستخدم الذي قام بتنفيذ الأمر

                    const linkRegex =
                        /\b((https?:\/\/|www\.)[^\s]+(?:\.[a-z]{2,}|\/[^\s]*)?|https?:\/\/(?:discord\.gg|discord\.com\/invite|discord\.com\/channels\/[0-9]+\/[0-9]+\/[0-9]+))/gi;

                    if (linkRegex.test(reason)) {
                        // ✅ إصلاح: كان الكود يستخدم i.channel.send() مع ephemeral:true،
                        // وهذا خطأ لأن channel.send() ما يدعم ephemeral أصلاً (خاص
                        // بردود التفاعل فقط)، والنتيجة إن الرسالة ترسل بشكل عام
                        // بالروم، والتفاعل نفسه يبقى بدون رد أبداً (يظهر "فشل
                        // التفاعل" عند المستخدم). الصحيح هو i.reply().
                        return i.reply({
                            content:
                                "❌ **غير مسموح بوضع روابط في سبب الـ AFK.**",
                            ephemeral: true,
                        });
                    }

                    await db.set(`afk_${userId}`, reason); // تعيين حالة AFK للمستخدم

                    const afkContainer = buildContainer({
                        description: ED.commandsB_002({ reason }),
                        color: 0xff0000,
                    });

                    await replyContainer(i, afkContainer, { ephemeral: true }); // الرد برسالة AFK
                }
                break;
            case "ping":
                {
                    // جلب البيانات الأساسية (اللون والصورة الافتراضية)
                    const guildId = i.guild?.id;
                    // ✅ إصلاح: getColor() غير معرّفة/مستوردة بهذا الملف إطلاقاً،
                    // فأي استدعاء لها كان يرمي ReferenceError ويكرش أمر /ping
                    // بالكامل في كل مرة. استبدلتها بـ _ec.color() المستخدمة بباقي
                    // هذا الملف لنفس الغرض.
                    const embedColor = _ec.color(guildId);
                    const imageUrl = await db.get(`image_${guildId}`);

                    // حساب الـ Uptime
                    let days = Math.floor(i.client.uptime / 86400000);
                    let hours = Math.floor(i.client.uptime / 3600000) % 24;
                    let minutes = Math.floor(i.client.uptime / 60000) % 60;
                    let seconds = Math.floor(i.client.uptime / 1000) % 60;
                    const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;

                    // قياس البنق
                    const sent = await i.reply({
                        content: "⏳ **Measuring performance...**",
                        fetchReply: true,
                    });
                    const ping = sent.createdTimestamp - i.createdTimestamp;
                    const apiPing = Math.round(i.client.ws.ping);

                    // تحديد الإيموجي بناءً على سرعة الاستجابة
                    let emoji = ping < 300 ? "🟢" : ping < 400 ? "🟡" : "🔴";

                    const pingContainer = buildContainer({
                        title: "**🏓 Pong!**",
                        fields: [
                            { name: "⏱️ **Latency(ping)**", value: `**${emoji} ${ping}ms**` },
                            { name: "🌐 **API Latency**", value: `**${apiPing}ms**` },
                            { name: "🔄 **Uptime**", value: `**${uptimeString}**` },
                        ],
                        footer: `Requested by ${i.user.username}`,
                        color: embedColor,
                        image: imageUrl || null,
                    });

                    // الأزرار
                    const button = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setLabel("انضم لـسيرفر السبورت")
                            .setStyle(ButtonStyle.Link)
                            .setURL("https://discord.gg/mEdX6D7Bjz")
                            .setEmoji(emojis.supportServer || "🛡️"),
                        new ButtonBuilder()
                            .setLabel("ضيف البوت")
                            .setStyle(ButtonStyle.Link)
                            .setURL(
                                `https://discord.com/oauth2/authorize?client_id=${i.client.user.id}&permissions=8&scope=bot%20applications.commands`,
                            )
                            .setEmoji(emojis.addBot || "🤖"),
                    );

                    // تعديل الرد الأصلي
                    await editReplyContainer(i, pingContainer, { rows: [button] });
                }
                break;
            case "help":
                {
                    if (await checkBlacklist(i)) return;

                    const guildId = i.guild.id;
                    const embedColor = _ec.color(guildId);
                    const imageUrl = await db.get(`image_${guildId}`); // الخط العام للسيرفر

                    try {
                        // ✅ إصلاح: كان الكود يكتب .setImage("https://postimg.cc" || imageUrl)
                        // وبما إن أي نص غير فاضي يُعتبر true بجافاسكربت، فهذا الشرط
                        // كان يختار دائماً الرابط الناقص "https://postimg.cc" (رابط
                        // غير مكتمل أصلاً) ولا يستخدم imageUrl الحقيقي إطلاقاً. صار
                        // يستخدم imageUrl مباشرة.
                        const helpContainer = buildContainer({
                            title: "**قائمة المساعدة**",
                            description: ED.commandsB_003(),
                            thumbnail: client.user.displayAvatarURL({ dynamic: true }),
                            color: embedColor,
                            image: imageUrl || null,
                        });

                        const buttonsRow1 =
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setLabel("اوامر الاونر")
                                    .setStyle(ButtonStyle.Secondary)
                                    .setCustomId("ownerCommands")
                                    .setEmoji(emojis.ownerCmds),
                                new ButtonBuilder()
                                    .setLabel("اوامر الاداره")
                                    .setStyle(ButtonStyle.Secondary)
                                    .setCustomId("adminCommands")
                                    .setEmoji(emojis.adminCmds),
                            );

                        const buttonsRow2 =
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setLabel("اضافة البوت")
                                    .setStyle(ButtonStyle.Link)
                                    // ✅ إصلاح: كان الرابط نص عادي "https://discord.com{client.user.id}"
                                    // بدون Template Literal، فكانت الأحرف {client.user.id}
                                    // تترسل حرفياً كنص داخل الرابط بدل ما تستبدل بقيمة الآيدي
                                    // فعلياً، يعني الزر ما يشتغل خالص. صار رابط OAuth صحيح
                                    // مطابق لنفس الرابط المستخدم بأمر /ping.
                                    .setURL(
                                        `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`,
                                    )
                                    .setEmoji(emojis.addBot),
                                new ButtonBuilder()
                                    .setLabel("سيرفر السبورت")
                                    .setStyle(ButtonStyle.Link)
                                    // ✅ إصلاح: نفس المشكلة، الرابط كان "https://discord.gg"
                                    // بدون كود دعوة فعلي (رابط غير صالح). استخدمت نفس رابط
                                    // سيرفر الدعم المستخدم بأمر /ping.
                                    .setURL("https://discord.gg/mEdX6D7Bjz")
                                    .setEmoji(emojis.supportServer),
                            );

                        const selectMenuRow =
                            new ActionRowBuilder().addComponents(
                                new StringSelectMenuBuilder()
                                    .setCustomId("helpMenu")
                                    .setPlaceholder(
                                        "اختر الامر اللذي تريد المساعده فيه.",
                                    )
                                    .addOptions(
                                        {
                                            label: "كيف تضبط البوت بسيرفرك",
                                            value: "multiBot",
                                        },
                                        {
                                            label: "كيف تسوي متاجر",
                                            value: "createStore",
                                        },
                                        {
                                            label: "كيف تسوي بيع تلقائي للطلبات",
                                            value: "autoSellOrders",
                                        },
                                        {
                                            label: "كيف تسوي بيع تلقائي للمزاد",
                                            value: "autoAuction",
                                        },
                                        {
                                            label: "معلومات عن البوت",
                                            value: "botInfo",
                                        },
                                        {
                                            label: "إعادة تشغيل القائمة",
                                            value: "resetMenu",
                                        },
                                    ),
                            );

                        await replyContainer(i, helpContainer, {
                            rows: [buttonsRow1, buttonsRow2, selectMenuRow],
                            ephemeral: true,
                        });

                        setTimeout(async () => {
                            try {
                                const disabledButtonsRow1 =
                                    ActionRowBuilder.from(buttonsRow1);
                                disabledButtonsRow1.components.forEach((c) =>
                                    c.setDisabled(true),
                                );
                                const disabledSelectMenuRow =
                                    ActionRowBuilder.from(selectMenuRow);
                                disabledSelectMenuRow.components.forEach((c) =>
                                    c.setDisabled(true),
                                );

                                const refreshedContainer = buildContainer({
                                    title: "**قائمة المساعدة**",
                                    description: ED.commandsB_003(),
                                    thumbnail: client.user.displayAvatarURL({ dynamic: true }),
                                    color: embedColor,
                                    image: imageUrl || null,
                                });

                                await editReplyContainer(i, refreshedContainer, {
                                    rows: [
                                        disabledButtonsRow1,
                                        buttonsRow2,
                                        disabledSelectMenuRow,
                                    ],
                                });
                            } catch (e) {}
                        }, 300000);
                    } catch (error) {
                        console.error(error);
                        await i.reply({
                            content: "حدث خطأ أثناء عرض قائمة المساعدة.",
                            ephemeral: true,
                        });
                    }
                }
                break;

            case "price-panel": {
                await sendGuildPanel(i, {
                    title: "الاســعــار",
                    defaultDescription: (guild) =>
                        `**اهلا و ســهلا هــنا قسـم الاســعار لــسيرفر**\n__${guild.name}__\nكل الي عليك عشان تعرف الاســعار \nتــختار زر مــن الازرار الــي تـحت\nنأمل ان تنــال اســعارنا رضـــاكم`,
                    imageKeys: ["priceImage", "image"],
                    rows: [
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`mzad2_prices_${guildId}`)
                                .setLabel("أسعار المزاد الخاص")
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji(emojis.auction),
                            new ButtonBuilder()
                                .setCustomId(`roles_prices_${guildId}`)
                                .setLabel("أسعار الرتب")
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji(emojis.roles),
                            new ButtonBuilder()
                                .setCustomId(`additions_prices_${guildId}`)
                                .setLabel("أسعار الإضافات")
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji(emojis.additionsPrices),
                        ),
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId("order-price")
                                .setLabel("اســـعار الـــطلــبات")
                                .setEmoji(emojis.order)
                                .setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder()
                                .setCustomId("auctionpri")
                                .setLabel("اسعار الــمــزادات")
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji(emojis.auction),
                            new ButtonBuilder()
                                .setCustomId("shoppri")
                                .setLabel("اسعار المــتاجــر")
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji(emojis.shop),
                        ),
                    ],
                });
            }
                break;

            case "shop-panel": {
                await sendGuildPanel(i, {
                    title: "بـانـل شــراء مـتـاجـر",
                    defaultDescription: (guild) =>
                        `** أهـلاً و سـهلاً بـك فـي قـسـم شـراء الـمـتـاجـر لـسـيـرفـر**\n__${guild.name}__\n\nنأمل ان تنــال خدماتنا رضـــاكم`,
                    imageKeys: ["buyshopimage", "image"],
                    rows: [
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId("buy_shop")
                                .setLabel("شــراء مـتـجـر")
                                .setEmoji(emojis.shop)
                                .setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder()
                                .setCustomId("shoppri")
                                .setLabel("أسـعـار الـمـتـاجـر")
                                .setEmoji(emojis.shop)
                                .setStyle(ButtonStyle.Secondary),
                        ),
                    ],
                });
            }
                break;
            case "order-panel": {
                await sendGuildPanel(i, {
                    title: "بانل شــراء طــلبات",
                    defaultDescription: (guild) =>
                        `** اهلا و ســهلا هــنا قسـم شراء الـطلبات لــسيرفر**\n__${guild.name}__\nنأمل ان تنــال اســعارنا رضـــاكم`,
                    imageKeys: ["buyorderimage", "image"],
                    rows: [
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId("ticket-order")
                                .setLabel("شــراء طـــلب")
                                .setEmoji(emojis.order)
                                .setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder()
                                .setCustomId("order-price")
                                .setLabel("اســـعار الـــطلــبات")
                                .setEmoji(emojis.order)
                                .setStyle(ButtonStyle.Secondary),
                        ),
                    ],
                });
            }
                break;

            case "auction-panel": {
                await sendGuildPanel(i, {
                    title: "بانل شــراء مــزاد",
                    defaultDescription: (guild) =>
                        `**اهلا و ســهلا هــنا قسـم شراء مـزادات لــسيرفر**\n__${guild.name}__\nنأمل ان تنــال اســعارنا رضـــاكم`,
                    imageKeys: ["buyauctionimage", "image"],
                    rows: [
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId("ticket-auction")
                                .setLabel("شــراء مــزاد")
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji(emojis.auction),
                            new ButtonBuilder()
                                .setCustomId("auctionpri")
                                .setLabel("اسعار المزادات")
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji(emojis.auction),
                        ),
                    ],
                });
            }
                break;

case "say-all-shops":{
    await i.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = _ec.gid(i);
    const { member } = i;

    const blacklist = (await db.get("blacklist")) || [];
    if (blacklist.includes(i.user.id)) {
        return i.editReply({
            content: "**أنـت فـي الـبـلاك لـسـت، لـمـعـلـومـات أكـثـر تـعـال إلـى سـيـرفـر الـدعـم!**",
        });
    }

    const highstaff = await db.get(`highstaff_${guildId}`);
    if (!highstaff || !member.roles.cache.has(highstaff)) {
        return i.editReply({
            content: `لـيـس لـد يـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر.`,
        });
    }

    const messageContent = i.options.getString("message");
    const color = _ec.color(guildId);
    const linePreview = await db.get(`image_${guildId}`);

    const targetRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("target_all").setLabel("جـمـيـع الـمـتـاجـر").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("target_types").setLabel("تـحـد يـد نـوع مـعـيـن").setStyle(ButtonStyle.Secondary),
    );

    const initialContainer = buildContainer({
        title: "تـهـيـئـة الإر سـال الـجـمـاعـي",
        description: `الـمـحـتـوى الـمـطـلـوب إر سـالـه:\n\`\`\`${messageContent}\`\`\`\n\n**اخـتـر الـفـئـة الـمـسـتـهـدفـة مـن الأزرار بـالأد نـى:**`,
        color,
        image: linePreview || null,
    });

    const msg = await editReplyContainer(i, initialContainer, { rows: [targetRow] });

    let selectedTarget = "all";
    let selectedType = null;

    const collector = msg.createMessageComponentCollector({
        filter: (int) => int.user.id === i.user.id,
        time: 120000,
    });

    collector.on("collect", async (interaction) => {
        try {
            if (interaction.customId === "target_all") {
                selectedTarget = "all";
                const formatRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("send_embed").setLabel("إر سـال كـإمـبـيـد").setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId("send_text").setLabel("إر سـال كـرّسـالـة عـاد يـة").setStyle(ButtonStyle.Secondary),
                );
                await interaction.update({ components: [formatRow] });
            }

            if (interaction.customId === "target_types") {
                const allEntries = await db.all();
                const types = allEntries
                    .filter((e) => {
                        const entryId = e.id || e.key || "";
                        return entryId.startsWith("categoryMentions_") && entryId.endsWith(`_${guildId}`);
                    })
                    .map((e) => ({
                        label: e.value?.nametype || e.value?.categoryId || "نوع غير معروف",
                        value: e.value?.categoryId || "",
                    }))
                    .filter((t) => t.value !== "");

                if (types.length === 0) {
                    return interaction.reply({ content: "❌ لا يـوجـد أنـواع مـتـاجـر مـسـجـلـة.", ephemeral: true });
                }

                const typeSelect = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId("select_shop_type")
                        .setPlaceholder("اخـتـر نـوع الـمـتـجـر الـمـسـتـهـدف")
                        .addOptions(types.slice(0, 25)),
                );
                await interaction.update({ components: [typeSelect] });
            }

            if (interaction.isStringSelectMenu() && interaction.customId === "select_shop_type") {
                selectedTarget = "type";
                selectedType = interaction.values[0];
                const formatRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("send_embed").setLabel("إرسـال كـإمـبـيـد").setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId("send_text").setLabel("إرسـال كـرّسـالـة عـاديـة").setStyle(ButtonStyle.Secondary),
                );
                await interaction.update({ components: [formatRow] });
            }

            if (interaction.customId === "send_embed" || interaction.customId === "send_text") {
                const isEmbed = interaction.customId === "send_embed";
                await interaction.deferUpdate();

                const allData = await db.all();
                const shops = allData.filter((entry) => {
                    const entryId = entry.id || entry.key || "";
                    return entryId.startsWith("shop_") && entryId.includes(`${guildId}`);
                });

                let count = 0;

                for (const shop of shops) {
                    const entryId = shop.id || shop.key || "";
                    const foundIds = entryId.match(/\d{17,20}/g) || [];
                    let targetChannel = null;
                    for (const possibleId of foundIds) {
                        if (possibleId === guildId) continue;
                        const ch = i.guild.channels.cache.get(possibleId) || await i.guild.channels.fetch(possibleId).catch(() => null);
                        if (ch) { targetChannel = ch; break; }
                    }

                    const sellerId = shop.value?.sellerId || shop.value?.owner || (typeof shop.value === "string" ? shop.value : null);
                    const shopCatId = shop.value?.categoryId || shop.value?.typeId || shop.value?.roleId;

                    if (selectedTarget === "type" && shopCatId !== selectedType) continue;

                    if (targetChannel) {
                        try {
                            const mentionText = sellerId ? `<@${sellerId}>` : "";
                            if (isEmbed) {
                                const bContainer = buildContainer({
                                    description: `${mentionText}\n\n${messageContent}`,
                                    color,
                                    image: linePreview || null,
                                });
                                await sendContainer(targetChannel, bContainer);
                            } else {
                                await targetChannel.send({ content: `${mentionText}\n\n${messageContent}` });
                            }
                            count++;
                        } catch (err) {
                            console.error(`خطأ أثناء الإرسال في القناة ${targetChannel.id}:`, err);
                        }
                    }
                }

                await i.editReply({
                    content: `✅ تـم إر سـال الـتـعـمـيـم إلـى **${count}** مـتـجـر بـنـجـاح.`,
                    components: [],
                });

                const logId = await db.get(`logs_${guildId}`);
                const logCh = logId ? (i.guild.channels.cache.get(logId) || await i.guild.channels.fetch(logId).catch(() => null)) : null;

                if (logCh) {
                    const logContainer = buildContainer({
                        title: "سـجـل تـعـمـيـم",
                        fields: [
                            { name: "الـمـسـؤول", value: `${i.user}` },
                            { name: "الـعـدد", value: `${count}` },
                            { name: "الـنـص", value: messageContent },
                        ],
                        color,
                        image: linePreview || null,
                    });
                    await sendContainer(logCh, logContainer).catch(() => {});
                }

                collector.stop();
            }
        } catch (error) {
            console.error("خطأ داخل كوليكتور say-all-shops:", error);
            await i.editReply({
                content: "❌ حـدث خـطـأ غـيـر متـوقـع أثـنـاء تـنـفـيـذ الأمـر.",
                components: [],
            }).catch(() => {});
        }
    });

    collector.on("end", (collected, reason) => {
        if (reason === "time") {
            i.editReply({ content: "⌛ انـتـهـى الـوقـت.", components: [] }).catch(() => {});
        }
    });
}
break;
        
        }
    });
};
