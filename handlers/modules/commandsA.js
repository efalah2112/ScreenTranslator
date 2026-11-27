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
// ✅ أدوات مشتركة لبناء وإرسال Components V2 (بدل تكرار نفس
// الأسطر بكل حالة). هذا يبني نفس شكل الإمبد القديم تقريبًا:
// عنوان (# )، وصف، فيلدز كنص، صورة، فوتر (-# ).
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
        const texts = [new TextDisplayBuilder().setContent(`# ${title}`)];
        if (authorName)
            texts.push(new TextDisplayBuilder().setContent(authorName));
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(...texts)
                .setThumbnailAccessory(
                    new ThumbnailBuilder().setURL(cornerIcon),
                ),
        );
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

// إرسال Container لروم/قناة (channel.send / user.send / dmChannel.send)
function sendContainer(target, container, rows = []) {
    if (rows.length) container.addActionRowComponents(...rows);
    return target.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    });
}

// رد أولي (interaction.reply)
function replyContainer(interaction, container, { rows = [], ephemeral = false } = {}) {
    if (rows.length) container.addActionRowComponents(...rows);
    return interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0),
    });
}

// تعديل رد مؤجل (interaction.editReply)
function editReplyContainer(interaction, container, { rows = [] } = {}) {
    if (rows.length) container.addActionRowComponents(...rows);
    return interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    });
}

module.exports = function registerCommandsA(
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
    // ========== +اضافه ==========
    client.on("messageCreate", async (message) => {
        if (!message.content.startsWith("+اضافه")) return;
        if (!message.guild) return;

        const guildId = message.guild.id;

        // ✅ إضافة: نفس فحص البلاك لست المستخدم بباقي الأوامر (كان ناقص هنا)
        const blacklist = (await db.get("blacklist")) || [];
        if (blacklist.includes(message.author.id)) {
            return message.reply(
                "**أنت في البلاك لست، لمعلومات اكثر تعال سيرفر السبورت!**",
            );
        }

        const admins = await db.get(`shopad_${guildId}`);
        if (!admins || !message.member.roles.cache.has(admins)) {
            return message.reply(`❌ ليس لديك صلاحية، تحتاج رتبة <@&${admins || "غير محددة"}>`);
        }

        // جلب جميع الأنواع
        const allData = await db.all();
        const types = allData
        .filter(d => d.id.startsWith(`categoryMentions_`) && d.id.endsWith(`_${guildId}`))
        .map(d => {
            const catId = d.id.replace("categoryMentions_", "").replace(`_${guildId}`, "");
            return { id: catId, name: d.data?.nametype || catId };
        });

        if (!types.length) return message.reply("❌ لا توجد أنواع متاجر مضافة.");

        // أزرار الأنواع
        const rows = [];
        let currentRow = new ActionRowBuilder();
        types.forEach((t, i) => {
            currentRow.addComponents(
                new ButtonBuilder()
                .setCustomId(`addshops_type_${t.id}_${guildId}`)
                .setLabel(t.name)
                .setStyle(ButtonStyle.Primary)
            );
            if ((i + 1) % 5 === 0 || i === types.length - 1) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder();
            }
        });

        const replyMsg = await message.reply({
            content: "**📦 اختر نوع المتجر للإضافة:**",
            components: rows,
        });

        // Collector للأزرار
        const filter = (i) => i.user.id === message.author.id;
        const collector = replyMsg.createMessageComponentCollector({ filter, time: 60000 });

        collector.on("collect", async (interaction) => {
            if (!interaction.customId.startsWith("addshops_type_")) return;

            const parts = interaction.customId.replace("addshops_type_", "").split("_");
            const catId = parts[0];
            const gId = parts[1];

            const typeData = await db.get(`categoryMentions_${catId}_${gId}`);
            if (!typeData) return interaction.reply({ content: "❌ النوع غير موجود.", ephemeral: true });

            const categoryChannel = message.guild.channels.cache.get(catId);
            if (!categoryChannel) return interaction.reply({ content: "❌ الكاتاجوري غير موجود.", ephemeral: true });

            // جلب الرومات داخل الكاتاجوري
            const channels = categoryChannel.children?.cache || message.guild.channels.cache.filter(c => c.parentId === catId);

            if (!channels.size) return interaction.reply({ content: "❌ لا توجد رومات في هذا الكاتاجوري.", ephemeral: true });

            // زر تأكيد + إلغاء
            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`addshops_confirm_${catId}_${gId}_${message.author.id}`).setLabel("✅ تأكيد").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`addshops_cancel_${message.author.id}`).setLabel("❌ إلغاء").setStyle(ButtonStyle.Danger),
            );

            await interaction.reply({
                content: `**⚠️ سيتم إضافة ${channels.size} روم كمتاجر من نوع \`${typeData.nametype}\`. هل أنت متأكد؟**`,
                components: [confirmRow],
                ephemeral: true,
            });
        });
    });

    // ========== زر التأكيد ==========
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isButton()) return;
        if (!interaction.customId.startsWith("addshops_confirm_")) return;

        const parts = interaction.customId.replace("addshops_confirm_", "").split("_");
        const catId = parts[0];
        const gId = parts[1];
        const authorId = parts[2];

        if (interaction.user.id !== authorId) {
            return interaction.reply({ content: "❌ هذا الزر ليس لك.", ephemeral: true });
        }

        await interaction.deferUpdate();

        const typeData = await db.get(`categoryMentions_${catId}_${gId}`);
        const categoryChannel = interaction.guild.channels.cache.get(catId);
        const channels = categoryChannel.children?.cache || interaction.guild.channels.cache.filter(c => c.parentId === catId);
        const admins = await db.get(`shopad_${gId}`);

        let added = 0;
        for (const [, channel] of channels) {
            if (channel.type !== ChannelType.GuildText) continue;

            const shopExists = await db.get(`shop_${channel.id}_${gId}`);
            if (shopExists) continue;

            const shopObject = {
                channelId: channel.id,
                categoryId: catId,
                sellerId: null,
                everyoneMentions: typeData.everyoneMentions,
                hereMentions: typeData.hereMentions,
                shopmen: typeData.shopmen,
                shoprole: typeData.shoprole,
                shopRoleMentions: typeData.shopRoleMentions,
                date: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                maxWarns: typeData.maxWarns,
                taxPrice: typeData.taxPrice,
                hasTax: typeData.hasTax,
                nametype: typeData.nametype,
                pirefix: typeData.pirefix,
                shopname: channel.name,
                warns: 0,
                status: "1",
                helpers: [],
            };
            await db.set(`shop_${channel.id}_${gId}`, shopObject);
            added++;

            // تعديل صلاحيات الروم - الكل يشوف محد يكتب
            await channel.permissionOverwrites.set([
                {
                    id: interaction.guild.id,
                    allow: [PermissionFlagsBits.ViewChannel],
                    deny: [PermissionFlagsBits.SendMessages],
                },
                ...(admins ? [{
                    id: admins,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ManageMessages,
                    ],
                }] : []),
            ]).catch(() => {});

            // ✅ إرسال Container (Components V2) مع أزرار لكل متجر
            const container = buildContainer({
                title: "تمت إضافة المتجر",
                description: `**المتجر:** ${channel}\n**النوع:** ${typeData.nametype}\n\nالرجاء إضافة صاحب المتجر والمساعدين.`,
                color: 0x00FF00,
            });

            const shopRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                .setCustomId(`setseller_${channel.id}_${gId}`)
                .setLabel("اضافة صاحب المتجر")
                .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                .setCustomId(`sethelpers_${channel.id}_${gId}`)
                .setLabel("اضافة مساعدين")
                .setStyle(ButtonStyle.Secondary),
            );

            await sendContainer(channel, container, [shopRow]);
        }

        await interaction.editReply({ content: `✅ تم إضافة **${added}** متجر بنجاح.`, components: [] });
    });

    // ========== زر الإلغاء ==========
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isButton()) return;
        if (!interaction.customId.startsWith("addshops_cancel_")) return;

        const authorId = interaction.customId.replace("addshops_cancel_", "");
        if (interaction.user.id !== authorId) return;

        await interaction.update({ content: "❌ تم إلغاء العملية.", components: [] });
    });

    // ========== زر إضافة صاحب المتجر ==========
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isButton()) return;
        if (!interaction.customId.startsWith("setseller_")) return;

        const parts = interaction.customId.replace("setseller_", "").split("_");
        const channelId = parts[0];
        const gId = parts[1];

        const admins = await db.get(`shopad_${gId}`);
        if (!admins || !interaction.member.roles.cache.has(admins)) {
            return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
        }

        await interaction.reply({
            content: "**منشن صاحب المتجر:**",
            ephemeral: true,
        });

        const filter = (m) => m.author.id === interaction.user.id;
        const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000, errors: ["time"] }).catch(() => null);
        if (!collected) return interaction.followUp({ content: "⏰ انتهى الوقت.", ephemeral: true });

        const seller = collected.first().mentions.users.first();
        if (!seller) return interaction.followUp({ content: "❌ يرجى منشن المستخدم.", ephemeral: true });

        await db.set(`shop_${channelId}_${gId}.sellerId`, seller.id);

        const channel = interaction.guild.channels.cache.get(channelId);
        if (channel) {
            await channel.permissionOverwrites.create(seller.id, {
                ViewChannel: true,
                SendMessages: true,
                AddReactions: true,
                AttachFiles: true,
                MentionEveryone: true,
                EmbedLinks: true,
                ReadMessageHistory: true,
            });
        }

        await interaction.followUp({ content: `✅ تم إضافة <@${seller.id}> كصاحب للمتجر ${channel ? `<#${channelId}>` : channelId}`, ephemeral: true });
    });

    // ========== زر إضافة مساعدين ==========
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isButton()) return;
        if (!interaction.customId.startsWith("sethelpers_")) return;

        const parts = interaction.customId.replace("sethelpers_", "").split("_");
        const channelId = parts[0];
        const gId = parts[1];

        const admins = await db.get(`shopad_${gId}`);
        if (!admins || !interaction.member.roles.cache.has(admins)) {
            return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
        }

        await interaction.reply({
            content: "**منشن المساعدين (تقدر تمنشن أكثر من واحد):**",
            ephemeral: true,
        });

        const filter = (m) => m.author.id === interaction.user.id;
        const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000, errors: ["time"] }).catch(() => null);
        if (!collected) return interaction.followUp({ content: "⏰ انتهى الوقت.", ephemeral: true });

        const helpers = collected.first().mentions.users;
        if (!helpers.size) return interaction.followUp({ content: "❌ يرجى منشن المساعدين.", ephemeral: true });

        const channel = interaction.guild.channels.cache.get(channelId);

        let helperIds = [];
        for (const [, helper] of helpers) {
            helperIds.push(helper.id);
            if (channel) {
                await channel.permissionOverwrites.create(helper.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    AddReactions: true,
                    AttachFiles: true,
                    EmbedLinks: true,
                    ReadMessageHistory: true,
                });
            }
        }

        const currentHelpers = (await db.get(`shop_${channelId}_${gId}.helpers`)) || [];
        const updatedHelpers = [...new Set([...currentHelpers, ...helperIds])];
        await db.set(`shop_${channelId}_${gId}.helpers`, updatedHelpers);

        await interaction.followUp({ content: `✅ تم إضافة ${helperIds.length} مساعدين للمتجر ${channel ? `<#${channelId}>` : channelId}`, ephemeral: true });
    });

    client.on("interactionCreate", async (interaction) => {
        if (!interaction.guild) return;
        const guildId = interaction.guild.id;

        // --- 1. مـعـالـجـة ضـغـطـة زر فـتـح الـمـودل ---
        if (interaction.isButton()) {
            if (interaction.customId.startsWith("open_cleanup_modal_")) {
                const modal = new ModalBuilder()
                .setCustomId("cleanup_days_modal")
                .setTitle("تـصـفـيـة الـمـتـاجـر الـخـامـلـة");

                const daysInput = new TextInputBuilder()
                .setCustomId("days_limit")
                .setLabel("عـدد أيـام الـخـمـول")
                .setPlaceholder("مـثـلاً: 7")
                .setStyle(TextInputStyle.Short)
                .setMinLength(1)
                .setMaxLength(3)
                .setRequired(true);

                const firstActionRow = new ActionRowBuilder().addComponents(
                    daysInput,
                );
                modal.addComponents(firstActionRow);

                await interaction
                    .showModal(modal)
                    .catch((err) => console.error("Error showing modal:", err));
            }
        }

        // --- 2. مـعـالـجـة إرسـال الـمـودل (الـتـصـفـيـة والـحـذف) ---
        if (
            interaction.isModalSubmit() &&
            interaction.customId === "cleanup_days_modal"
        ) {
            await interaction.deferReply({ ephemeral: true });

            const days = parseInt(
                interaction.fields.getTextInputValue("days_limit"),
            );
            if (isNaN(days))
                return interaction.editReply(
                    "❌ الـرجـاء إد خـال رقـم صـحـيـح.",
                );

            const msLimit = days * 24 * 60 * 60 * 1000;
            const now = Date.now();
            const color = _ec.color(guildId);
            const linePreview = await db.get(`image_${guildId}`);

            const allKeys = await db.all();
            const shops = allKeys.filter(
                (k) =>
                k.id.startsWith("shop_") &&
                !k.id.includes("lastmsg") &&
                !k.id.includes("ratings") &&
                k.value?.sellerId,
            );

            let deletedCount = 0;
            let deletedNames = [];

            for (const entry of shops) {
                const parts = entry.id.split("_");
                const chId = parts[parts.length - 2];
                const entryGuildId = parts[parts.length - 1];

                if (entryGuildId !== guildId) continue;

                const lastMsg = await db.get(`shop_lastmsg_${chId}_${guildId}`);

                // التعديل هنا: إذا ما فيه سجل رسائل (متجر جديد) يسحب عليه وما يحذفه
                if (!lastMsg) continue;

                const timePassed = now - lastMsg;

                // يحذف فقط إذا تجاوز المدة المحددة
                if (timePassed > msLimit) {
                    const shopName = entry.value?.shopname || chId;

                    // 1. حذف من الداتا
                    await db.delete(`shop_${chId}_${guildId}`);
                    await db.delete(`shop_lastmsg_${chId}_${guildId}`);

                    // 2. حذف القناة
                    const channel = interaction.guild.channels.cache.get(chId);
                    if (channel) {
                        await channel
                            .delete(
                            `تـصـفـيـة خـمـول: ${days} يـوم | بـوا سـطـة: ${interaction.user.tag}`,
                        )
                            .catch(() => {});
                    }

                    deletedNames.push(shopName);
                    deletedCount++;
                }
            }

            // تـنـسـيـق تـقـر يـر الـنـتـائـج
            let namesList =
                deletedNames.length > 0
            ? deletedNames.map((n) => `\`${n}\``).join(", ")
            : "لا يـوجـد";
            if (namesList.length > 1024)
                namesList =
                    namesList.slice(0, 1000) + "... (الـقـائـمـة طـويـلـة)";

            const resultDescription = `تـم حـذف **${deletedCount}** مـتـجـر لـم يـتـفـاعـل مـنـذ **${days}** يـوم.`;
            const resultFields = [
                { name: "الـمـتـاجـر الـمـحـذ وفـة:", value: namesList },
            ];

            const resultContainer = buildContainer({
                title: "✅ تـمـت الـتـصـفـيـة بـنـجـاح",
                description: resultDescription,
                fields: resultFields,
                color,
                image: linePreview || null,
            });

            await editReplyContainer(interaction, resultContainer);

            // إر سـال الـتـقـر يـر لـلـسـجـلات (Logs)
            const logId = await db.get(`logs_${guildId}`);
            if (logId) {
                const logCh = interaction.guild.channels.cache.get(logId);
                if (logCh) {
                    const logContainer = buildContainer({
                        title: "سـجـل تـصـفـيـة الـمـتـاجـر الـخـامـلـة",
                        description: resultDescription,
                        fields: resultFields,
                        color,
                        image: linePreview || null,
                        mention: `🚨 **تـنـبـيـه تـصـفـيـة:** قـام ${interaction.user} بـتـنـظـيـف الـمـتـاجـر.`,
                    });
                    await sendContainer(logCh, logContainer).catch(() => {});
                }
            }
        }
    });

    client.on("interactionCreate", async (i) => {
        if (!i.isChatInputCommand()) return;
        const guildId = i.guild.id;
        switch (i.commandName) {
            case "reset-mentions":
                {
                    const blacklist = (await db.get("blacklist")) || [];
                    if (blacklist.includes(i.user.id)) {
                        return i.reply({
                            content: "**أنت في البلاك لست، لمعلومات اكثر تعال سيرفر السبورت!**",
                            ephemeral: true,
                        });
                    }
                    const { member, guild } = i;
                    const highstaff = await db.get(`highstaff_${guildId}`);
                    if (!highstaff) {
                        await i.reply({
                            content:
                            "يرجى تحديد رتبة العليا (highstaff) عن طريق استخدام الامر الاتي: /setup",
                            ephemeral: true,
                        });
                        return;
                    }

                    if (!member.roles.cache.has(highstaff)) {
                        await i.reply({
                            content: `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر. تـحـتـاج رتـبـه <@&${highstaff}>.`,
                            ephemeral: true, // إذا أردت أن تكون الرسالة مرئية فقط للعضو
                        });
                        return;
                    }
                    // الرد الأولي على التفاعل
                    await i.reply({
                        content: `**يتم ترسيت جميع منشنات المتاجر**`,
                    });

                    //const guild = i.guild;
                    const categories = guild.channels.cache.filter(
                        (channel) => channel.type === ChannelType.GuildCategory,
                    );

                    if (!categories.size) {
                        await i.followUp({
                            content: `**لا يوجد كاتيجوري في هذا السيرفر**`,
                            ephemeral: true,
                        });
                        return;
                    }

                    for (const [categoryId, category] of categories) {
                        const categoryDataKey = `categoryMentions_${categoryId}_${guild.id}`;
                        const categoryData = await db.get(categoryDataKey);

                        if (!categoryData) {
                            continue;
                        }

                        const channels = category.children.cache;

                        for (const [channelId, channel] of channels) {
                            const channelDataKey = `shop_${channel.id}_${guild.id}`;
                            let channelData = await db.get(channelDataKey);

                            if (!channelData) {
                                continue;
                            }

                            // تحقق من "everyone" و "here" و "shopRole" بشكل منفصل
                            if (
                                channelData.everyoneMentions <=
                                (categoryData.everyoneMentions || 0)
                            ) {
                                channelData.everyoneMentions =
                                    categoryData.everyoneMentions || 0;
                            }

                            if (
                                channelData.hereMentions <=
                                (categoryData.hereMentions || 0)
                            ) {
                                channelData.hereMentions =
                                    categoryData.hereMentions || 0;
                            }

                            if (
                                channelData.shopRoleMentions <=
                                (categoryData.shopRoleMentions || 0)
                            ) {
                                channelData.shopRoleMentions =
                                    categoryData.shopRoleMentions || 0;
                            }

                            await db.set(channelDataKey, channelData);
                        }
                    }

                    const serverName = guild.name;
                    const serverIcon = guild.iconURL();

                    // إرسال رسالة إلى القناة
                    const channel = i.channel; // الحصول على القناة التي تم استدعاء التفاعل فيها
                    const resetContainer = buildContainer({
                        title: `**${serverName} - تم اعادة المنشنات**`,
                        description: ED.commandsA_002(),
                        thumbnail: serverIcon,
                        color: _ec.color(i.guild?.id),
                        mention: `صلــي علـــى النـــبي @everyone `,
                    });
                    await sendContainer(channel, resetContainer);
                }
                break;

                //==============================================================================
                // 1. امر انشاء متجر جديد (shop)
                //==============================================================================
            case "shop": {
                const guildId = i.guild.id;
                const { member, guild } = i;

                const categoryId = i.options.getString("category");
                const name = i.options.getString("name");
                const sellerId = i.options.getUser("seller").id;

                const blacklist = (await db.get("blacklist")) || [];
                if (blacklist.includes(i.user.id)) {
                    return i.reply({ content: "انت في البلاك لست، لمعلومات اكثر تعال سيرفر السبورت!", ephemeral: true });
                }

                const typeData = await db.get(`categoryMentions_${categoryId}_${guildId}`);
                if (!typeData) {
                    return i.reply({ content: "❌ يرجى اختيار نوع من القائمة المنسدلة (Autocomplete).", ephemeral: true });
                }

                const { pirefix, shopmen, shoprole, everyoneMentions: every, hereMentions: here, shopRoleMentions: shop, maxWarns, hasTax, taxPrice, nametype } = typeData;

                const admins = await db.get(`shopad_${guildId}`);
                if (!admins || !member.roles.cache.has(admins)) {
                    return i.reply({ content: `❌ ليس لديك صلاحية، تحتاج رتبة <@&${admins || "غير محددة"}>`, ephemeral: true });
                }

                if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
                    return i.reply({ content: "❌ البوت يفتقر لصلاحية ادارة القنوات.", ephemeral: true });
                }

                await i.deferReply();

                const nameFormatted = name.replaceAll(" ", "・");
                let channel;

                try {
                    channel = await guild.channels.create({
                        name: `${pirefix}${nameFormatted}`,
                        type: ChannelType.GuildText,
                        parent: categoryId,
                        permissionOverwrites: [
                            { id: guild.id, deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
                            { id: sellerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.MentionEveryone, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory] },
                            { id: admins, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.MentionEveryone] },
                        ],
                    });
                } catch (error) {
                    return i.editReply({ content: "❌ حدث خطأ اثناء انشاء الروم، تأكد من صلاحيات البوت او مساحة السيرفر." });
                }

                const shopObject = {
                    channelId: channel.id,
                    categoryId,
                    sellerId,
                    everyoneMentions: every,
                    hereMentions: here,
                    shopmen,
                    shoprole,
                    shopRoleMentions: shop,
                    date: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                    maxWarns,
                    taxPrice,
                    hasTax,
                    nametype,
                    pirefix,
                    shopname: name,
                    warns: 0,
                    status: "1"
                };
                await db.set(`shop_${channel.id}_${guildId}`, shopObject);

                const sellerMember = await guild.members.fetch(sellerId).catch(() => null);
                if (sellerMember && shoprole && guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
                    await sellerMember.roles.add(shoprole).catch(() => {});
                }

                const imageUrl = await db.get(`image_${guildId}`);
                const serverColor = _ec.color(guildId);
                const shopDescription = ED.commandsA_001({ channel, config, every, hasTax, here, maxWarns, nametype, sellerId, shop, shopmen, shoprole });

                const shopContainer = buildContainer({
                    title: "تم انشاء متجر جديد",
                    description: shopDescription,
                    authorName: guild.name,
                    authorIcon: guild.iconURL(),
                    thumbnail: guild.iconURL(),
                    color: serverColor,
                    image: imageUrl || null,
                });

                await i.editReply({ content: `✅ تم انشاء المتجر بنجاح: ${channel}` });

                const shopChannelContainer = buildContainer({
                    title: "تم انشاء متجر جديد",
                    description: shopDescription,
                    authorName: guild.name,
                    authorIcon: guild.iconURL(),
                    thumbnail: guild.iconURL(),
                    color: serverColor,
                    image: imageUrl || null,
                    mention: `<@${sellerId}>`,
                });
                await sendContainer(channel, shopChannelContainer);

                const logsId = await db.get(`logs_${guildId}`);
                if (logsId) {
                    const logChannel = guild.channels.cache.get(logsId);
                    if (logChannel) {
                        const logContainer = buildContainer({
                            title: "سجل انشاء متجر",
                            description: shopDescription,
                            authorName: guild.name,
                            authorIcon: guild.iconURL(),
                            thumbnail: guild.iconURL(),
                            color: serverColor,
                            image: imageUrl || null,
                        });
                        await sendContainer(logChannel, logContainer).catch(() => {});
                    }
                }
            }
                break;

                //==============================================================================
                // 2. امر ربط ونقل متجر موجود مسبقا (add-shop-data)
                //==============================================================================
            case "add-shop-data": {
                const guildId = i.guild.id;
                const { member, guild } = i;

                const categoryId = i.options.getString("category");
                const sellerId = i.options.getUser("seller").id;
                const channel = i.options.getChannel("shop");

                const blacklist = (await db.get("blacklist")) || [];
                if (blacklist.includes(i.user.id)) {
                    return i.reply({ content: "انت في البلاك لست، لمعلومات اكثر تعال سيرفر السبورت!", ephemeral: true });
                }

                const typeData = await db.get(`categoryMentions_${categoryId}_${guildId}`);
                if (!typeData) {
                    return i.reply({ content: "❌ يرجى اختيار نوع من القائمة المنسدلة (Autocomplete).", ephemeral: true });
                }

                const { pirefix, shopmen, shoprole, everyoneMentions: every, hereMentions: here, shopRoleMentions: shop, maxWarns, hasTax, taxPrice, nametype } = typeData;

                const admins = await db.get(`shopad_${guildId}`);
                if (!admins || !member.roles.cache.has(admins)) {
                    return i.reply({ content: `❌ ليس لديك صلاحية، تحتاج رتبة <@&${admins || "غير محددة"}>`, ephemeral: true });
                }

                await i.deferReply({ ephemeral: true });

                try {
                    const cleanName = channel.name.replace(`${pirefix}`, "").replaceAll(" ", "・");
                    const newName = `${pirefix}${cleanName}`;

                    await channel.edit({
                        name: newName,
                        parent: categoryId,
                        lockPermissions: false
                    }).catch(() => console.log("Failed to edit or move channel"));

                    await channel.permissionOverwrites.set([
                        { id: guild.id, deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
                        { id: sellerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.MentionEveryone, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory] },
                        { id: admins, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.MentionEveryone] },
                    ]);
                } catch (err) {
                    return i.editReply({ content: "❌ حدث خطأ اثناء نقل الروم او تحديث الصلاحيات." });
                }

                const shopObject = {
                    channelId: channel.id,
                    categoryId,
                    sellerId,
                    everyoneMentions: every,
                    hereMentions: here,
                    shopmen,
                    shoprole,
                    shopRoleMentions: shop,
                    date: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                    maxWarns,
                    taxPrice,
                    hasTax,
                    nametype,
                    pirefix,
                    shopname: channel.name,
                    warns: 0,
                    status: "1"
                };
                await db.set(`shop_${channel.id}_${guildId}`, shopObject);

                const sellerMember = await guild.members.fetch(sellerId).catch(() => null);
                if (sellerMember && shoprole && guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
                    await sellerMember.roles.add(shoprole).catch(() => {});
                }

                const imageUrl = await db.get(`image_${guildId}`);
                const serverColor = _ec.color(guildId);
                const addShopDescription = ED.commandsA_003({ channel, config, every, hasTax, here, maxWarns, nametype, sellerId, shop, shopmen, shoprole });

                await i.editReply({ content: `✅ تم تنظيم ونقل المتجر بنجاح الى الفئة الجديدة: ${channel}` });

                const em5Container = buildContainer({
                    title: "تم تحديث واضافة المتجر",
                    description: addShopDescription,
                    authorName: guild.name,
                    authorIcon: guild.iconURL(),
                    thumbnail: guild.iconURL(),
                    color: serverColor,
                    image: imageUrl || null,
                });
                await sendContainer(channel, em5Container);

                const logsId = await db.get(`logs_${guildId}`);
                if (logsId) {
                    const logChannel = guild.channels.cache.get(logsId);
                    if (logChannel) {
                        const logContainer = buildContainer({
                            title: "سجل نقل واضافة متجر",
                            description: addShopDescription,
                            authorName: guild.name,
                            authorIcon: guild.iconURL(),
                            thumbnail: guild.iconURL(),
                            color: serverColor,
                            image: imageUrl || null,
                        });
                        await sendContainer(logChannel, logContainer).catch(() => {});
                    }
                }
            }
                break;
            case "remove-shop-data":
                {
                    const guildId = i.guild.id;
                    const { member, guild } = i;
                    const channel = i.options.getChannel("shop");

                    const blacklist = (await db.get("blacklist")) || [];
                    if (blacklist.includes(i.user.id)) {
                        return i.reply({
                            content: "**أنـت فـي الـبـلاك لـسـت، لـمـعـلـومـات أكـثـر تـعـال سـيـرفـر الـسـبـورت!**",
                            ephemeral: true,
                        });
                    }

                    // الـتـحـقـق مـن صـلاحـيـات الإدارة
                    const admins = await db.get(`shopad_${guildId}`);
                    if (!admins) {
                        return i.reply({
                            content:
                            "❌ يـرجـى تـحـديـد الإدارة عـن طـريـق الأمـر: `/setup`",
                            ephemeral: true,
                        });
                    }

                    if (!member.roles.cache.has(admins)) {
                        return i.reply({
                            content: `❌ لـيـس لـد يـك صـلاحـيـة، تـحـتـاج رتـبـة <@&${admins}>`,
                            ephemeral: true,
                        });
                    }

                    // حـذف الـبـيـانـات
                    await db.delete(`shop_${channel.id}_${guildId}`);

                    const serverColor = _ec.color(guildId);
                    const imageUrl = await db.get(`image_${guildId}`);

                    await i.reply({
                        content: `✅ **تـم حـذف الـمـتـجـر مـن الـداتـا بـنـجـاح:** ${channel}`,
                        ephemeral: true,
                    });

                    // إرسـال سـجـل الحـذف (Logs)
                    const logsId = await db.get(`logs_${guildId}`);
                    if (logsId) {
                        const logChannel = guild.channels.cache.get(logsId);
                        if (logChannel) {
                            const logContainer = buildContainer({
                                title: "**سـجـل حـذف مـتـجـر**",
                                description: `تـم حـذف بـيـانـات الـمـتـجـر: ${channel}\nالـمـسـؤول: <@!${i.user.id}>`,
                                color: serverColor,
                                image: imageUrl || config.line || null,
                            });
                            await sendContainer(logChannel, logContainer).catch(() => {});
                        }
                    }
                }
                break;
            case "change-shop-name": {
                const guildId = i.guild.id;
                const { member, guild } = i;

                const channel = i.options.getChannel("shop");
                const newName = i.options.getString("new_name");

                // صلاحية
                const admins = await db.get(`shopad_${guildId}`);
                if (!admins || !member.roles.cache.has(admins)) {
                    return i.reply({ content: `❌ ليس لديك صلاحية.`, ephemeral: true });
                }

                // تحقق من وجود المتجر
                const shopData = await db.get(`shop_${channel.id}_${guildId}`);
                if (!shopData) {
                    return i.reply({ content: "❌ هذا الروم ليس متجراً مسجلاً.", ephemeral: true });
                }

                // تحقق من الروابط
                const linkRegex = /(https?:\/\/[^\s]+)|(discord\.(gg|io|me|li|com\/invite)\/.+)/gi;
                if (linkRegex.test(newName)) {
                    return i.reply({ content: "❌ لا يسمح بإضافة روابط.", ephemeral: true });
                }

                await i.deferReply({ ephemeral: true });

                const oldName = shopData.shopname || channel.name;
                const pirefix = shopData.pirefix || "";
                const shopEmoji = shopData.shopEmoji || "";

                // بناء اسم القناة: برفكس + إيموجي + اسم (بدون مسافات)
                const cleanName = newName.replaceAll(" ", "・");
                const newChannelName = `${pirefix}${shopEmoji}${cleanName}`;

                // تحديث الداتابيس
                await db.set(`shop_${channel.id}_${guildId}.shopname`, newName);

                // تحديث اسم الروم
                await channel.edit({ name: newChannelName }).catch(() => {});

                const container = buildContainer({
                    title: "✅ تم تغيير اسم المتجر",
                    description:
                        `**المتجر:** ${channel}\n` +
                        `**الاسم القديم:** ${oldName}\n` +
                        `**الاسم الجديد:** ${newName}`,
                    color: _ec.color(guildId),
                });

                await editReplyContainer(i, container);
            }
                break;
            case "change-shop-emoji": {
                const guildId = i.guild.id;
                const { member, guild } = i;

                const channel = i.options.getChannel("shop");
                const newEmoji = i.options.getString("emoji").trim();

                // صلاحية
                const admins = await db.get(`shopad_${guildId}`);
                if (!admins || !member.roles.cache.has(admins)) {
                    return i.reply({ content: `❌ ليس لديك صلاحية.`, ephemeral: true });
                }

                // تحقق من وجود المتجر
                const shopData = await db.get(`shop_${channel.id}_${guildId}`);
                if (!shopData) {
                    return i.reply({ content: "❌ هذا الروم ليس متجراً مسجلاً.", ephemeral: true });
                }

                // ✅ إصلاح: أسماء الرومات بديسكورد تقبل إيموجي يونيكود عادي فقط
                // (مثل 🛒)، ولا تقبل الإيموجيات المخصصة (Custom Emoji مثل
                // <:name:id>) — ديسكورد يحذفها بصمت من اسم الروم. لو سمحنا بها
                // هنا، العملية بتفشل بصمت وبدون أي تفسير للمستخدم.
                const customEmojiRegex = /^<a?:\w+:\d+>$/;
                if (customEmojiRegex.test(newEmoji)) {
                    return i.reply({
                        content:
                            "❌ أسماء الرومات بديسكورد لا تدعم الإيموجيات المخصصة (Custom Emoji)، يرجى استخدام إيموجي يونيكود عادي مثل 🛒.",
                        ephemeral: true,
                    });
                }

                await i.deferReply({ ephemeral: true });

                const oldChannelName = channel.name;
                const oldEmoji = shopData.shopEmoji || "";
                const pirefix = shopData.pirefix || "";

                // ✅ إصلاح: كان الكود يعتمد على channel.name (الاسم الحقيقي)
                // ويحاول يدور فيه على الإيموجي القديم ويستبدله. المشكلة إن
                // ديسكورد يُطبّع (normalize) أسماء الرومات تلقائياً، فالإيموجي
                // القديم غالباً ما يعود يطابق النص الموجود فعلياً بالروم، فكانت
                // العملية تفشل وتضيف الإيموجي الجديد "جنب" الاسم بدل استبدال
                // القديم. الحل: نبني الاسم من shopname المخزّن بالداتابيس (وهو
                // الاسم النظيف بدون بادئة ولا إيموجي، محفوظ من أمر
                // change-shop-name)، فنضمن نفس المكان دائماً بغض النظر عن أي
                // تطبيع سوّاه ديسكورد للاسم المعروض.
                // نشيل البادئة والإيموجي القديم من shopname احتياطاً (بعض
                // المسارات مثل add-shop-data تخزن shopname وهو يحتوي على
                // البادئة أصلاً، فلو ما شلناها بترسم بادئة مكررة بالاسم)
                const cleanBaseName = (shopData.shopname || oldChannelName)
                    .replace(pirefix, "")
                    .replace(oldEmoji, "");
                const newChannelName = `${pirefix}${newEmoji}${cleanBaseName}`;

                // تحديث الداتابيس
                await db.set(`shop_${channel.id}_${guildId}.shopEmoji`, newEmoji);

                // تحديث اسم الروم
                await channel.edit({ name: newChannelName }).catch(() => {});

                const container = buildContainer({
                    title: "✅ تم تغيير إيموجي المتجر",
                    description:
                        `**المتجر:** ${channel}\n` +
                        `**الإيموجي القديم:** ${oldEmoji || "لا يوجد"}\n` +
                        `**الإيموجي الجديد:** ${newEmoji}\n` +
                        `**الاسم الجديد:** ${newChannelName}`,
                    color: _ec.color(guildId),
                });

                await editReplyContainer(i, container);
            }
                break;
            case "change-shop-type": {
                const guildId = i.guild.id;
                const { member, guild } = i;

                const channel = i.options.getChannel("shop");
                const newCategoryId = i.options.getString("new_category");

                const admins = await db.get(`shopad_${guildId}`);
                if (!admins || !member.roles.cache.has(admins)) {
                    return i.reply({ content: `❌ ليس لديك صلاحية، تحتاج رتبة <@&${admins || "غير محددة"}>`, ephemeral: true });
                }

                // جلب بيانات المتجر الحالي
                const currentShop = await db.get(`shop_${channel.id}_${guildId}`);
                if (!currentShop) {
                    return i.reply({ content: "❌ هذا الروم ليس متجراً مسجلاً.", ephemeral: true });
                }

                // جلب بيانات النوع الجديد
                const newTypeData = await db.get(`categoryMentions_${newCategoryId}_${guildId}`);
                if (!newTypeData) {
                    return i.reply({ content: "❌ النوع الجديد غير موجود.", ephemeral: true });
                }

                await i.deferReply({ ephemeral: true });

                const oldTypeName = currentShop.nametype;
                const newTypeName = newTypeData.nametype;

                // إزالة الرتبة القديمة إذا كان لها رتبة مسجلة
                const oldTypeData = await db.get(`categoryMentions_${currentShop.categoryId}_${guildId}`);
                if (oldTypeData?.shoprole && currentShop.sellerId) {
                    const sellerMember = await guild.members.fetch(currentShop.sellerId).catch(() => null);
                    if (sellerMember) {
                        await sellerMember.roles.remove(oldTypeData.shoprole).catch(() => {});
                    }
                }

                // إضافة الرتبة الجديدة
                if (newTypeData.shoprole && currentShop.sellerId) {
                    const sellerMember = await guild.members.fetch(currentShop.sellerId).catch(() => null);
                    if (sellerMember && guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
                        await sellerMember.roles.add(newTypeData.shoprole).catch(() => {});
                    }
                }

                // تحديث بيانات المتجر
                const updatedShop = {
                    ...currentShop,
                    categoryId: newCategoryId,
                    nametype: newTypeName,
                    pirefix: newTypeData.pirefix,
                    everyoneMentions: newTypeData.everyoneMentions,
                    hereMentions: newTypeData.hereMentions,
                    shopmen: newTypeData.shopmen,
                    shoprole: newTypeData.shoprole,
                    shopRoleMentions: newTypeData.shopRoleMentions,
                    maxWarns: newTypeData.maxWarns,
                    taxPrice: newTypeData.taxPrice,
                    hasTax: newTypeData.hasTax,
                };

                await db.set(`shop_${channel.id}_${guildId}`, updatedShop);

                // تغيير اسم الروم حسب البادئة الجديدة
                const cleanName = channel.name.replace(currentShop.pirefix || "", "").replaceAll(" ", "・");
                const newName = `${newTypeData.pirefix || ""}${cleanName}`;
                await channel.edit({ name: newName }).catch(() => {});

                // نقل الروم للكاتاجوري الجديد
                await channel.edit({ parent: newCategoryId }).catch(() => {});

                const changeDescription =
                    `**المتجر:** ${channel}\n` +
                    `**النوع القديم:** ${oldTypeName || "غير محدد"}\n` +
                    `**النوع الجديد:** ${newTypeName}\n` +
                    `**صاحب المتجر:** <@${currentShop.sellerId || "غير محدد"}>`;

                const container = buildContainer({
                    title: "تم تغيير نوع المتجر",
                    description: changeDescription,
                    color: _ec.color(guildId),
                });
                await editReplyContainer(i, container);

                // لوق
                const logsId = await db.get(`logs_${guildId}`);
                if (logsId) {
                    const logChannel = guild.channels.cache.get(logsId);
                    if (logChannel) {
                        const logContainer = buildContainer({
                            title: "سجل تغيير نوع متجر",
                            description:
                                `**المتجر:** ${channel}\n` +
                                `**من:** ${oldTypeName || "غير محدد"}\n` +
                                `**إلى:** ${newTypeName}\n` +
                                `**بواسطة:** <@${i.user.id}>`,
                            color: _ec.color(guildId),
                        });
                        await sendContainer(logChannel, logContainer).catch(() => {});
                    }
                }
            }
                break;
            case "shop-data":
                {
                    const guildId = i.guild.id;
                    const blacklist = (await db.get("blacklist")) || [];
                    if (blacklist.includes(i.user.id)) {
                        return i.reply({
                            content: "**أنـت فـي الـبـلاك لـسـت، لـمـعـلـومـات أكـثـر تـعـال سـيـرفـر الـسـبـورت!**",
                            ephemeral: true,
                        });
                    }

                    try {
                        const shopData = await db.get(
                            `shop_${i.channel.id}_${guildId}`,
                        );
                        if (!shopData) {
                            return i.reply({
                                content:
                                "**❌ هـذا الـشـات لـيـس مـتـجـراً مـسـجـلاً**",
                                ephemeral: true,
                            });
                        }

                        const {
                            everyoneMentions,
                            hereMentions,
                            shopRoleMentions,
                            sellerId,
                            warns,
                            shoprole,
                            shopmen,
                            maxWarns,
                            hasTax,
                            taxPrice,
                            nametype,
                        } = shopData;

                        const imageUrl = await db.get(`image_${guildId}`);
                        const serverColor = _ec.color(guildId);

                        const container = buildContainer({
                            title: `**مـعـلـومـات الـمـتـجـر: ${i.channel.name}**`,
                            description: ED.commandsA_004({
                                config,
                                everyoneMentions,
                                hasTax,
                                hereMentions,
                                maxWarns,
                                nametype,
                                sellerId,
                                shopRoleMentions,
                                shopmen,
                                shoprole,
                            }),
                            authorName: i.guild.name,
                            authorIcon: i.guild.iconURL({ size: 1024 }),
                            thumbnail: i.guild.iconURL({ size: 1024 }),
                            footer: D.footer(i.guild),
                            color: serverColor,
                            image: imageUrl || config.line || null,
                            mention: `**مـعـلـومـات الـمـتـجـر: ${i.channel}**`,
                        });

                        await replyContainer(i, container);
                    } catch (error) {
                        console.error(error);
                        await i.reply({
                            content:
                            "❌ **حـدثـت مـشـكـلـة أثـنـاء جـلـب الـبـيـانـات.**",
                            ephemeral: true,
                        });
                    }
                }
                break;
            case "reset":
                {
                    const guildId = i.guild.id;
                    const { member } = i;

                    // التحقق مما إذا كان المستخدم هو مالك السيرفر
                    if (member.id !== i.guild.ownerId) {
                        return i.reply({
                            content: `❌ **هذا الأمر مخصص فقط لصاحب السيرفر.**`,
                            ephemeral: true,
                        });
                    }

                    // جلب جميع المفاتيح المخزنة في قاعدة البيانات
                    const allKeys = await db.all();

                    // تصفية المفاتيح الخاصة بالسيرفر فقط
                    const serverKeys = allKeys
                    .map((entry) => entry.id)
                    .filter((key) => key.includes(`_${guildId}`));

                    if (serverKeys.length === 0) {
                        return i.reply({
                            content: `✅ **لا توجد بيانات مسجلة لهذا السيرفر.**`,
                            ephemeral: true,
                        });
                    }

                    // حذف جميع بيانات السيرفر
                    for (const key of serverKeys) {
                        await db.delete(key);
                    }

                    return i.reply({
                        content: `✅ **تم حذف جميع بيانات هذا السيرفر بنجاح!**`,
                        ephemeral: true,
                    });
                }
                break;
            case "tax":
                {
                    // تأخير الرد حتى يتم الانتهاء من العمليات الحسابية
                    await i.deferReply({ ephemeral: false });

                    // الحصول على الخيار "number" من الأوامر
                    const option = i.options.get("number");
                    if (!option)
                        return i.editReply(
                            "**يـجـب ان تـضـع رقـم بـخـيـار number.**",
                        );

                    let number = option.value;

                    // استخدام تعبير منتظم للتحقق من صلاحية الرقم
                    const regex =
                          /^[0-9]+([kKmMbB]|ك|الف|ألف|آلاف|ألاف|الاف|م|مليون|ملايين|مليار|بليون)?$/;
                    if (!regex.test(number))
                        return i.editReply(
                            "**يـجـب ان تـحـتـوي الـرسـالـة عـلـى رقـم.**",
                        );

                    // تحويل الرقم إذا كان يحتوي على أحرف مثل k, m, b
                    if (
                        number.endsWith("m") ||
                        number.endsWith("M") ||
                        number.endsWith("م") ||
                        number.endsWith("مليون") ||
                        number.endsWith("ملايين")
                    ) {
                        number = parseFloat(number) * 1000000;
                    } else if (
                        number.endsWith("k") ||
                        number.endsWith("K") ||
                        number.endsWith("ك") ||
                        number.endsWith("الف") ||
                        number.endsWith("ألف") ||
                        number.endsWith("آلاف") ||
                        number.endsWith("ألاف") ||
                        number.endsWith("الاف")
                    ) {
                        number = parseFloat(number) * 1000;
                    } else if (
                        number.endsWith("b") ||
                        number.endsWith("B") ||
                        number.endsWith("مليار") ||
                        number.endsWith("بليون")
                    ) {
                        number = parseFloat(number) * 1000000000;
                    } else {
                        number = parseFloat(number);
                    }

                    // التحقق من أن الرقم صحيح وأكبر من أو يساوي 1
                    if (isNaN(number) || number < 1)
                        return i.editReply(
                            "**يـجـب أن يـكـون الـرقـم اكـبـر مـن او يـسـاوي الـواحـد**",
                        );

                    // العمليات الحسابية
                    let taxwi = Math.floor((number * 20) / 19 + 1);
                    let num = taxwi - number;
                    let tax4 = Math.floor((num * 20) / 19 + 1 + number);

                    // إنشاء كائن يحتوي على القيم
                    const values = {
                        المبلغ: number, // بدون تنسيق
                        الضريبة: num, // بدون تنسيق
                        "مع الضريبة": taxwi, // بدون تنسيق
                        "مع الوسيط": tax4, // بدون تنسيق
                    };

                    // إنشاء أزرار نسخ
                    const buttons = Object.entries(values).map(
                        ([label, value]) =>
                        new ButtonBuilder()
                        .setCustomId(`copy_${value}`)
                        .setLabel(` نسخ ${label}`)
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji(emojis.list),
                    );

                    // إنشاء صف للأزرار
                    const row = new ActionRowBuilder().addComponents(buttons);

                    const container = buildContainer({
                        title: "**حساب الضريبة**",
                        description: ED.commandsA_005(),
                        fields: [
                            { name: "💰 المبلغ", value: `**${values["المبلغ"]}**` },
                            { name: "💸 الضريبة", value: `**${values["الضريبة"]}**` },
                            { name: "💵 مع الضريبة", value: `**${values["مع الضريبة"]}**` },
                            { name: "💳 مع الوسيط", value: `**${values["مع الوسيط"]}**` },
                        ],
                        footer: "تمت العملية بنجاح | نظام الضرائب",
                        color: 0x2f3136,
                    });

                    // إرسال الرد مع الـ Container والأزرار
                    await editReplyContainer(i, container, { rows: [row] });

                    // إضافة رد عند النقر على الأزرار
                    const filter = (interaction) =>
                    interaction.customId.startsWith("copy_");
                    const collector = i.channel.createMessageComponentCollector(
                        { filter, time: 60000 },
                    );

                    collector.on("collect", async (interaction) => {
                        const value = interaction.customId.replace("copy_", "");
                        const copyContainer = buildContainer({
                            description: `\`\`\` ${value} \`\`\``,
                            color: 0x2f3136,
                            mention: value,
                        });
                        await replyContainer(interaction, copyContainer, { ephemeral: true });
                    });

                    // إخفاء الأزرار بعد 60 ثانية (نفس مدة الـ Collector أعلاه)
                    collector.on("end", async () => {
                        await i.editReply({ components: [] }).catch(() => {});
                    });
                }
                break;
            case "fake-tweet":
                {
                    const text = i.options.getString("tweet");
                    const user = i.options.getUser("user") || i.user;

                    const avatarURL = user.displayAvatarURL({
                        extension: "jpg",
                        size: 512,
                    });
                    const tweetURL = `https://some-random-api.com/canvas/tweet?avatar=${encodeURIComponent(avatarURL)}&displayname=${encodeURIComponent(user.username)}&username=${encodeURIComponent(user.username)}&comment=${encodeURIComponent(text)}`;

                    const container = buildContainer({
                        image: tweetURL,
                        footer: `By ${i.user.username}`,
                    });
                    await i.reply({
                        content: `Done ${config.refrechmark}`,
                        ephemeral: true,
                    });
                    await sendContainer(i.channel, container);
                }
                break;
            case "fake-comment":
                {
                    const text = i.options.getString("comment");
                    const user = i.options.getUser("user") || i.user;

                    const avatarURL = user.displayAvatarURL({
                        extension: "jpg",
                        size: 512,
                    });
                    const tweetURL = `https://some-random-api.com/canvas/Youtube-comment?avatar=${encodeURIComponent(avatarURL)}&displayname=${encodeURIComponent(user.username)}&username=${encodeURIComponent(user.username)}&comment=${encodeURIComponent(text)}`;

                    const container = buildContainer({
                        image: tweetURL,
                        footer: `By ${i.user.username}`,
                    });
                    await i.reply({
                        content: `Done ${config.refrechmark}`,
                        ephemeral: true,
                    });
                    await sendContainer(i.channel, container);
                }
                break;
            case "add-autoreply":
                {
                    const blacklist = (await db.get("blacklist")) || [];
                    if (blacklist.includes(i.user.id)) {
                        return i.reply({
                            content: "**أنت في البلاك لست، لمعلومات اكثر تعال سيرفر السبورت!**",
                            ephemeral: true,
                        });
                    }
                    const { member, guild } = i;
                    const highstaff = await db.get(`highstaff_${guildId}`);
                    if (!highstaff) {
                        await i.reply({
                            content:
                                "يرجى تحديد رتبة العليا (highstaff) عن طريق استخدام الامر الاتي: /setup",
                            ephemeral: true,
                        });
                        return;
                    }

                    if (!member.roles.cache.has(highstaff)) {
                        await i.reply({
                            content: `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر. تـحـتـاج رتـبـه <@&${highstaff}>.`,
                            ephemeral: true, // إذا أردت أن تكون الرسالة مرئية فقط للعضو
                        });
                        return;
                    }
                    const keyword = i.options.getString("keyword");
                    const reply = i.options.getString("reply");
                    const role = i.options.getRole("role");
                    const channel = i.options.getChannel("channel");
                    const embed = i.options.getBoolean("embed");
                    const title = i.options.getString("title");
                    const image = i.options.getString("image");
                    const color = i.options.getString("color"); // اللون المضاف

                    //const guildId = i.guild.id;

                    const keywords = await db.all();
                    const guildKeywords = keywords.filter((entry) =>
                        entry.id.startsWith(`autoreply_${guildId}_`),
                    );

                    if (guildKeywords.length >= 25) {
                        return i.reply({
                            content: `❌ **لا يمكنك اضافة اكثر من 25 رد تلقائي في هذا السيرفر**`,
                            ephemeral: true,
                        });
                    }

                    // التحقق إذا كان الرد موجودًا مسبقًا
                    const existingReply = await db.get(
                        `autoreply_${guildId}_${keyword}`,
                    );

                    if (color && !embed) {
                        return i.reply({
                            content: "يرجى تحديد إذا كنت تريد الرد كإيمبد أم لا قبل اختيار اللون.",
                            ephemeral: true,
                        });
                    }

                    const autoReplyData = {
                        reply,
                        role: role ? role.id : null,
                        channel: channel ? channel.id : null,
                        embed: embed || false,
                        title: title || null,
                        image: image || null,
                        color: embed ? color || null : null, // اللون متاح فقط إذا كان الرد إيمبد
                    };

                    if (existingReply) {
                        // تحديث الرد
                        await db.set(
                            `autoreply_${guildId}_${keyword}`,
                            autoReplyData,
                        );
                        return i.reply({
                            content: `تم تعديل الرد التلقائي للكلمة **${keyword}** بنجاح!`,
                            ephemeral: true,
                        });
                    } else {
                        // إضافة رد جديد
                        await db.set(
                            `autoreply_${guildId}_${keyword}`,
                            autoReplyData,
                        );
                        return i.reply({
                            content: `تم تعيين الرد التلقائي للكلمة **${keyword}** بنجاح!`,
                            ephemeral: true,
                        });
                    }
                }
                break;
            case "remove-autoreply":
                {
                    const blacklist = (await db.get("blacklist")) || [];
                    if (blacklist.includes(i.user.id)) {
                        return i.reply({
                            content: "**أنت في البلاك لست، لمعلومات اكثر تعال سيرفر السبورت!**",
                            ephemeral: true,
                        });
                    }
                    const { member, guild } = i;
                    const highstaff = await db.get(`highstaff_${guildId}`);
                    if (!highstaff) {
                        await i.reply({
                            content:
                                "يرجى تحديد رتبة العليا (highstaff) عن طريق استخدام الامر الاتي: /setup",
                            ephemeral: true,
                        });
                        return;
                    }

                    if (!member.roles.cache.has(highstaff)) {
                        await i.reply({
                            content: `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر. تـحـتـاج رتـبـه <@&${highstaff}>.`,
                            ephemeral: true, // إذا أردت أن تكون الرسالة مرئية فقط للعضو
                        });
                        return;
                    }
                    const keyword = i.options.getString("keyword");

                    //   const guildId = i.guild.id;
                    const autoreply = await db.get(
                        `autoreply_${guildId}_${keyword}`,
                    );

                    if (autoreply) {
                        await db.delete(`autoreply_${guildId}_${keyword}`);
                        i.reply({
                            content: `تم حذف الرد التلقائي للكلمة **${keyword}** في هذا السيرفر.`,
                            ephemeral: true,
                        });
                    } else {
                        i.reply({
                            content: `لا يوجد رد تلقائي للكلمة **${keyword}** في هذا السيرفر.`,
                            ephemeral: true,
                        });
                    }
                }
                break;
            case "list-autoreplies":
                {
                    const { member, guild } = i;
                    const highstaff = await db.get(`highstaff_${guildId}`);
                    if (!highstaff) {
                        await i.reply({
                            content:
                                "يرجى تحديد رتبة العليا (highstaff) عن طريق استخدام الامر الاتي: /setup",
                            ephemeral: true,
                        });
                        return;
                    }

                    if (!member.roles.cache.has(highstaff)) {
                        await i.reply({
                            content: `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر. تـحـتـاج رتـبـه <@&${highstaff}>.`,
                            ephemeral: true, // إذا أردت أن تكون الرسالة مرئية فقط للعضو
                        });
                        return;
                    }
                    const keywords = await db.all();
                    const guildKeywords = keywords.filter((entry) =>
                        entry.id.startsWith(`autoreply_${guildId}_`),
                    );

                    // ✅ إصلاح: كانت المقارنة على المصفوفة نفسها بدل طولها (guildKeywords > 25)
                    // وهذا يجعل الشرط لا يعمل أبداً بشكل صحيح
                    if (guildKeywords.length > 25) {
                        return i.reply({
                            content: `❌ **لا يمكنك اضافة اكثر من 25 رد تلقائي**`,
                            ephemeral: true,
                        });
                    }

                    if (guildKeywords.length === 0) {
                        return i.reply({
                            content: "لا توجد ردود تلقائية مضافة في هذا السيرفر.",
                            ephemeral: true,
                        });
                    }

                    const container = buildContainer({
                        title: "قائمة الردود التلقائية",
                        description: ED.commandsA_006(),
                        footer: `عدد الردود: ${guildKeywords.length}`,
                        color: _ec.color(i.guild?.id),
                    });

                    // إنشاء الأزرار
                    const buttons = guildKeywords.map((entry, index) => {
                        const keyword = entry.id.split(
                            `autoreply_${guildId}_`,
                        )[1];
                        return new ButtonBuilder()
                            .setLabel(keyword)
                            .setStyle(ButtonStyle.Primary)
                            .setCustomId(`view-autoreply_${index}`)
                            .setEmoji(emojis.view);
                    });

                    // تقسيم الأزرار إلى صفوف، بحد أقصى 5 أزرار لكل صف
                    const rows = [];
                    for (let idx = 0; idx < buttons.length; idx += 5) {
                        rows.push(
                            new ActionRowBuilder().addComponents(
                                buttons.slice(idx, idx + 5),
                            ),
                        );
                    }

                    // الرد مع الأزرار والـ Container
                    await replyContainer(i, container, { rows, ephemeral: true });
                }
                break;
            case "set-mention":
                {
                    const blacklist = (await db.get("blacklist")) || [];
                    if (blacklist.includes(i.user.id)) {
                        return i.reply({
                            content: "**أنت في البلاك لست، لمعلومات اكثر تعال سيرفر السبورت!**",
                            ephemeral: true,
                        });
                    }
                    const guildId = i.guild.id;
                    const { member, guild } = i;
                    const channelId = i.options.get("shop").value;
                    const mentionStyle = i.options.get("mention").value;
                    const count = i.options.get("count").value;
                    const data = await db.get(`shop_${channelId}_${guildId}`);

                    const admins = await db.get(`shopad_${guildId}`);
                    // ✅ إصلاح: كان الكود يستخدم i.editReply() هنا بدون أي reply/defer
                    // سابق، وهذا يسبب خطأ (InteractionNotReplied) ويوقف الأمر بالكامل.
                    if (!admins) {
                        return i.reply({
                            content:
                                "يرجى تحديد الادمن عن طريق استخدام الامر الاتي: /setup",
                            ephemeral: true,
                        });
                    }

                    if (!member.roles.cache.has(admins)) {
                        return i.reply({
                            content: `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر تـحـتـاج رتـبـه <@&${admins}>`,
                            ephemeral: true,
                        });
                    }
                    if (count > 999) {
                        return i.reply({
                            content: `❌ **لا يمكنك تحديد أكثر من 999 منشن دفعه واحده**`,
                            ephemeral: true,
                        });
                    }
                    if (!data)
                        return await i.reply({
                            content: `❌ **لا يمكنني العثور على هذا المتجر !**`,
                            ephemeral: true,
                        });
                    if (mentionStyle === "everyone") {
                        await db.set(
                            `shop_${channelId}_${guildId}.everyoneMentions`,
                            count,
                        );
                    } else if (mentionStyle === "here") {
                        await db.set(
                            `shop_${channelId}_${guildId}.hereMentions`,
                            count,
                        );
                    } else if (mentionStyle === "shop_role") {
                        await db.set(
                            `shop_${channelId}_${guildId}.shopRoleMentions`,
                            count,
                        );
                    }
                    await i.reply({
                        content: `✅ **تم التعديل على عدد منشنات المتجر <#${channelId}> بنجاح.**`,
                    });
                    const logs = await db.get(`logs_${guildId}`);
                    const logg = guild.channels.cache.get(logs);
                    if (logg) {
                        await logg.send({
                            content: `**✅ **تم التعديل على عدد منشنات المتجر <#${channelId}> بنجاح.**
المــسؤول:
<@!${i.user.id}>`,
                        });
                    } else {
                        console.log(
                            `i can't fined log channel ${i.guild.name} .`,
                        );
                    }
                }
                break;
            case "add-mention":
                {
                    const blacklist = (await db.get("blacklist")) || [];
                    if (blacklist.includes(i.user.id)) {
                        return i.reply({
                            content: "**أنت في البلاك لست، لمعلومات اكثر تعال سيرفر السبورت!**",
                            ephemeral: true,
                        });
                    }
                    const guildId = i.guild.id;
                    const { member, guild } = i;
                    const channelId = i.options.get("shop").value;
                    const mentionStyle = i.options.get("mention").value;
                    const count = i.options.get("count").value;
                    const data = await db.get(`shop_${channelId}_${guildId}`);

                    const admins = await db.get(`shopad_${guildId}`);
                    // ✅ نفس الإصلاح: استبدال i.editReply() قبل أي رد فعلي بـ i.reply()
                    if (!admins) {
                        return i.reply({
                            content:
                                "يرجى تحديد الادمن عن طريق استخدام الامر الاتي: /setup",
                            ephemeral: true,
                        });
                    }

                    if (!member.roles.cache.has(admins)) {
                        return i.reply({
                            content: `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر تـحـتـاج رتـبـه <@&${admins}>`,
                            ephemeral: true,
                        });
                    }
                    if (count > 999) {
                        return i.reply({
                            content: `❌ **لا يمكنك اضافة أكثر من 999 منشن دفعه واحده**`,
                            ephemeral: true,
                        });
                    }
                    if (!data)
                        return await i.reply({
                            content: `❌ **لا يمكنني العثور على هذا المتجر !**`,
                            ephemeral: true,
                        });
                    if (mentionStyle === "everyone") {
                        await db.add(
                            `shop_${channelId}_${guildId}.everyoneMentions`,
                            count,
                        );
                    } else if (mentionStyle === "here") {
                        await db.add(
                            `shop_${channelId}_${guildId}.hereMentions`,
                            count,
                        );
                    } else if (mentionStyle === "shop_role") {
                        await db.add(
                            `shop_${channelId}_${guildId}.shopRoleMentions`,
                            count,
                        );
                    }
                    await i.reply({
                        content: `✅ **تم اضافة منشنات للمتجر <#${channelId}> بنجاح.**`,
                    });
                    const logs = await db.get(`logs_${guildId}`);
                    const logg = guild.channels.cache.get(logs);
                    if (logg) {
                        await logg.send({
                            content: `✅ **تم اضافة منشنات للمتجر <#${channelId}> بنجاح.**
المــسؤول:
<@!${i.user.id}>`,
                        });
                    } else {
                        console.log(
                            `i can't fined log channel ${i.guild.name} .`,
                        );
                    }
                }
                break;
            case "delete-shop":
                {
                    const blacklist = (await db.get("blacklist")) || [];
                    if (blacklist.includes(i.user.id)) {
                        return i.reply({
                            content: "**أنت في البلاك لست، لمعلومات اكثر تعال سيرفر السبورت!**",
                            ephemeral: true,
                        });
                    }

                    await i.deferReply({ ephemeral: true });
                    const shop = i.options.getChannel("shop");
                    const reason = i.options.getString("reason");
                    const { guild, member } = i;
                    const guildId = guild.id;

                    // Retrieve logs channel
                    const logsChannelId = await db.get(`logs_${guildId}`);
                    const logChannel = guild.channels.cache.get(logsChannelId);

                    // Retrieve admin roles
                    const adminRoleId = await db.get(`shopad_${guildId}`);
                    if (!adminRoleId) {
                        await i.editReply(
                            "يرجى تحديد الأدمن عن طريق استخدام الأمر التالي: /setup",
                        );
                        return;
                    }

                    if (!member.roles.cache.has(adminRoleId)) {
                        await i.editReply(
                            `ليس لديك صلاحية لاستخدام هذا الأمر. تحتاج رتبة <@&${adminRoleId}>.`,
                        );
                        return;
                    }

                    // Retrieve shop data
                    const shopData = await db.get(`shop_${shop.id}_${guildId}`);
                    if (!shopData) {
                        await i.editReply("**هذا الروم ليس متجرًا.**");
                        return;
                    }

                    // Check if the shop channel exists
                    const shopChannel = await guild.channels
                        .fetch(shop.id)
                        .catch(() => null);
                    if (!shopChannel) {
                        await i.editReply(
                            "**لا أستطيع العثور على هذا الروم.**",
                        );
                        return;
                    }

                    // Retrieve image URL
                    const imageUrl = await db.get(`image_${guildId}`);

                    const sharedFields = [
                        { name: "اسم المتجر", value: shopChannel.name },
                        { name: "المسؤول", value: `<@${i.user.id}>` },
                        { name: "السبب", value: reason },
                    ];
                    const sharedFooter = D.footer(i.guild);
                    const sharedThumb = D.thumb(i.guild);
                    const sharedImage = imageUrl || config.line;

                    // Prepare containers (بدل الإمبدات)
                    const deletedShopContainer = buildContainer({
                        title: "تم حذف متجرك",
                        description: ED.commandsA_007({ shopChannel }),
                        fields: sharedFields,
                        image: sharedImage,
                        footer: sharedFooter,
                        thumbnail: sharedThumb,
                    });

                    const logContainer = buildContainer({
                        title: "تم حذف متجر",
                        description: ED.commandsA_008({ shopChannel }),
                        fields: sharedFields,
                        image: sharedImage,
                        footer: sharedFooter,
                        thumbnail: sharedThumb,
                    });

                    // Notify the seller
                    try {
                        const seller = await client.users.fetch(
                            shopData.sellerId,
                        );
                        const dmChannel = await seller.createDM();
                        await sendContainer(dmChannel, deletedShopContainer);
                    } catch (error) {
                        console.error(`Failed to notify the seller: ${error}`);
                    }

                    // Send log
                    if (logChannel) {
                        await sendContainer(logChannel, logContainer).catch(() => {});
                    }

                    // Clean up database and delete shop
                    await db.delete(`shop_${shop.id}_${guildId}`);
                    try {
                        await shopChannel.delete();
                    } catch (error) {
                        console.error(
                            `Failed to delete the shop channel: ${error}`,
                        );
                    }

                    // Remove role from seller if applicable
                    if (shopData.shoprole) {
                        try {
                            const sellerMember = await guild.members.fetch(
                                shopData.sellerId,
                            );
                            await sellerMember.roles.remove(shopData.shoprole);
                        } catch (error) {
                            console.error(
                                `Failed to remove the role from the seller: ${error}`,
                            );
                        }
                    }

                    await i.editReply("✅ تم حذف المتجر بنجاح!");
                }
                break;
            case "add-helper":
                {
                    const blacklist = (await db.get("blacklist")) || [];
                    if (blacklist.includes(i.user.id)) {
                        return i.reply({
                            content: "**أنت في البلاك لست، لمعلومات اكثر تعال سيرفر السبورت!**",
                            ephemeral: true,
                        });
                    }
                    const guildId = i.guild.id;
                    const { member, guild } = i;
                    const { options } = i;
                    const part = options.getUser("helper");
                    const shop = options.getChannel("shop") || i.channel; // استخدم القناة الحالية إذا لم يتم تحديد قناة
                    const shopChannel = await i.guild.channels.fetch(shop.id);

                    await i.deferReply();

                    const admins = await db.get(`shopad_${guildId}`);
                    if (!admins) {
                        await i.editReply({
                            content:
                                "يرجى تحديد الادمن عن طريق استخدام الامر الاتي: /setup",
                        });
                        return;
                    }

                    if (!member.roles.cache.has(admins)) {
                        await i.editReply(
                            `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر تـحـتـاج رتـبـه <@&${admins}>`,
                        );
                        return;
                    }

                    try {
                        const data = await db.get(`shop_${shop.id}_${guildId}`);
                        if (!data) {
                            return i.editReply(
                                "** هـذة الـروم لـيـسـت مـتـجـر **",
                            );
                        }

                        const existingPartners = data.partners || [];
                        if (existingPartners.includes(part.id)) {
                            return i.editReply(
                                "** هـذا العـضـو عـمـيـل بـ الفـعـل فـي هـذا المـتـجـر. **",
                            );
                        }

                        if (data.sellerId === part.id) {
                            return i.editReply(
                                "** هـذا العـضـو هـو صـاحـب المـتـجـر و لا يـمـكـنـك اضـافـتـه ك عـمـيـل. **",
                            );
                        }

                        await shopChannel.permissionOverwrites.edit(part.id, {
                            ViewChannel: true,
                            SendMessages: true,
                            MentionEveryone: true,
                            AttachFiles: true,
                        });

                        const logs = await db.get(`logs_${guildId}`);
                        const logg = logs
                            ? i.guild.channels.cache.get(logs)
                            : null;

                        existingPartners.push(part.id);
                        await db.set(
                            `shop_${shop.id}_${guildId}.partners`,
                            existingPartners,
                        );

                        await i.editReply(
                            `**تـم اضـافـة العـمـيـل <@${part.id}> لـ المـتـجـر <#${shop.id}> بـ نـجـاح.**`,
                        );
                        await shopChannel.send({
                            content: `** تـم اضـافـة : <@${part.id}> \n كـ عـمـيـل فـ المـتـجـر **`,
                        });

                        if (logg) {
                            await logg.send({
                                content: `** تـم اضـافـة : <@${part.id}> \n كـ عـمـيـل فـ المـتـجـر **\n<@${i.user.id}> عن طريق`,
                            });
                        }
                    } catch (error) {
                        console.error(error);
                        return i.editReply("وجدت مشكلة اثناء اتمام العملية.");
                    }
                }
                break;
            case "remove-helper":
                {
                    const blacklist = (await db.get("blacklist")) || [];
                    if (blacklist.includes(i.user.id)) {
                        return i.reply({
                            content: "**أنت في البلاك لست، لمعلومات اكثر تعال سيرفر السبورت!**",
                            ephemeral: true,
                        });
                    }
                    const guildId = i.guild.id;
                    const { member, guild } = i;
                    const { options } = i;
                    const part = options.getUser("helper");
                    const shop = options.getChannel("shop") || i.channel; // استخدم القناة الحالية إذا لم يتم تحديد قناة

                    const admins = await db.get(`shopad_${guildId}`);
                    // ✅ إصلاح: كان الكود يستدعي i.editReply() هنا قبل أي i.reply/deferReply
                    // فيسبب كراش. حولتها لـ i.reply() والـ deferReply() صار قبل try مباشرة.
                    if (!admins) {
                        return i.reply({
                            content:
                                "يرجى تحديد الادمن عن طريق استخدام الامر الاتي: /setup",
                            ephemeral: true,
                        });
                    }

                    if (!member.roles.cache.has(admins)) {
                        return i.reply({
                            content: `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر تـحـتـاج رتـبـه <@&${admins}>`,
                            ephemeral: true,
                        });
                    }

                    await i.deferReply();

                    try {
                        const data = await db.get(`shop_${shop.id}_${guildId}`);
                        if (!data) {
                            return i.editReply(
                                "** هـذة الـروم لـيـسـت مـتـجـر **",
                            );
                        }

                        const existingPartners = data.partners || [];
                        if (!existingPartners.includes(part.id)) {
                            return i.editReply(
                                "** هـذا العـضـو لـيـس عـمـيـل فـي هـذا المـتـجـر. **",
                            );
                        }

                        const shopChannel = await i.guild.channels.fetch(
                            shop.id,
                        );
                        await shopChannel.permissionOverwrites.delete(part.id);

                        const updatedPartners = existingPartners.filter(
                            (partnerId) => partnerId !== part.id,
                        );
                        await db.set(
                            `shop_${shop.id}_${guildId}.partners`,
                            updatedPartners,
                        );

                        const logs = await db.get(`logs_${guildId}`);
                        const logg = logs
                            ? i.guild.channels.cache.get(logs)
                            : null;

                        await i.editReply(
                            `** العـمـيـل <@${part.id}> تـم ازالـتـه مـن المـتـجـر <#${shop.id}> بـ نـجـاح. **`,
                        );
                        await shopChannel.send({
                            content: `** تـم ازالـة : <@${part.id}> \n كـ عـمـيـل مـن المـتـجـر **`,
                        });

                        if (logg) {
                            await logg.send({
                                content: `** تـم ازالـة : <@${part.id}> \n كـ عـمـيـل مـن المـتـجـر **\n<@${i.user.id}> عن طريق`,
                            });
                        }
                    } catch (error) {
                        console.error(error);
                        return i.editReply(
                            "وجدت مشكلة أثناء إزالة العميل من المتجر.",
                        );
                    }
                }
                break;
            case "come":
                {
                    const blacklist = (await db.get("blacklist")) || [];
                    if (blacklist.includes(i.user.id)) {
                        return i.reply({
                            content: "**أنت في البلاك لست، لمعلومات اكثر تعال سيرفر السبورت!**",
                            ephemeral: true,
                        });
                    }
                    const guildId = i.guild.id;
                    const { member, guild } = i;
                    let user = i.options.getUser("user");
                    let reason = i.options.getString("reason");
                    if (i.user.id == user.id) {
                        return i.reply({
                            content: `**ما تقدر تنادي نفسك 👽**`,
                        });
                    }

                    const admins = await db.get(`shopad_${guildId}`);
                    if (!admins) {
                        await i.reply({
                            content:
                                "يرجى تحديد الادمن عن طريق استخدام الامر الاتي: /setup",
                        });
                        return;
                    }

                    if (!member.roles.cache.has(admins)) {
                        await i.reply(
                            `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر تـحـتـاج رتـبـه <@&${admins}>`,
                        );
                        return;
                    }
                    const callContainer = buildContainer({
                        title: "تـم اسـتـدعـائـك",
                        description: `مـرحـبـا ${user}, ${i.user.username} قـام بـ اسـتـدعـائـك`,
                        fields: [
                            { name: "تـوجـه لـروم", value: `<#${i.channel.id}>` },
                            { name: "سـبـب اسـتـدعـائـك", value: `**${reason}**` || "No reason provided" },
                            { name: "قـام بـ اسـتـدعـائـك", value: `<@${i.user.id}>` },
                        ],
                        footer: "يرجـى التوجه للروم بـا اسرع وقت مـمكن",
                    });
                    i.reply({
                        content: ` بنجاح يرجـى عدم السـبام ${user} تم استدعاء `,
                    });
                    try {
                        await sendContainer(await user.createDM(), callContainer);
                    } catch (error) {
                        console.error(
                            `حـدثـت مـشـكـلـة أثـنـاء الارسـال ${user.tag}: ${error}`,
                        );
                    }
                }
                break;
            case "show-helpers":
                {
                    const blacklist = (await db.get("blacklist")) || [];
                    if (blacklist.includes(i.user.id)) {
                        return i.reply({
                            content: "**أنت في البلاك لست، لمعلومات اكثر تعال سيرفر السبورت!**",
                            ephemeral: true,
                        });
                    }
                    const guildId = i.guild.id;
                    const { member, guild } = i;
                    const shop = i.options.getChannel("shop") || i.channel; // استخدم القناة الحالية إذا لم يتم تحديد متجر
                    const data = await db.get(`shop_${shop.id}_${guildId}`);

                    if (!data) {
                        return await i.reply({
                            content: `❌ **لـم يـتـم العـثـور عـلـى المـتـجـر!**`,
                            ephemeral: true,
                        });
                    }

                    const partnerMentions =
                        data.partners && data.partners.length > 0
                            ? data.partners
                                  .map((partnerId) => `<@${partnerId}>`)
                                  .join(", ")
                            : null;

                    if (!partnerMentions) {
                        return await i.reply({
                            content: `❌ **لا يـوجـد عـمـلاء مـسـجـلـيـن فـي هـذا المـتـجـر.**`,
                            ephemeral: true,
                        });
                    }

                    const container = buildContainer({
                        title: ` عـملاء المـتـجـر`,
                        description: ED.commandsA_009({ partnerMentions }),
                        footer: { text: `${i.guild.name}`, iconURL: i.guild.iconURL() },
                        color: _ec.color(guildId),
                    });

                    await replyContainer(i, container, { ephemeral: true }); // جعل الرسالة مخفية
                }
                break;

            //====== shop-check: فحص المتاجر المسجلة والغير متفاعلة ======
            //==============================================================================
            // 1. أمـر فـحـص الـمـتـاجـر (يوضع في commandsA.js أو مكان الأوامر)
            //==============================================================================
            case "shop-check":
                {
                    await i.deferReply({ ephemeral: true });

                    const guildId = _ec.gid(i);
                    const color = _ec.color(guildId);
                    const linePreview = await db.get(`image_${guildId}`);

                    const allKeys = await db.all();
                    const shopKeys = allKeys.filter(
                        (k) =>
                            k.id.startsWith("shop_") &&
                            !k.id.includes("lastmsg") &&
                            !k.id.includes("ratings") &&
                            k.value?.sellerId,
                    );

                    let totalShops = 0;
                    const typeCounts = {};

                    for (const entry of shopKeys) {
                        const parts = entry.id.split("_");
                        if (parts[parts.length - 1] !== guildId) continue;

                        const shopType =
                            entry.value?.nametype || "غـيـر مـحـدد";
                        totalShops++;
                        typeCounts[shopType] = (typeCounts[shopType] || 0) + 1;
                    }

                    const typeLines =
                        Object.entries(typeCounts)
                            .map(([t, c]) => `> **${t}**: ${c} مـتـجـر`)
                            .join("\n") || "> لا تـوجـد مـتـاجـر مـسـجـلـة";

                    const container = buildContainer({
                        title: " فـحـص وتـصـفـيـة الـمـتـاجـر الـخـامـلـة",
                        description: `**إجـمـالـي المـتـاجـر:** ${totalShops}\n\n${typeLines}\n\nاضـغـط عـلـى الـزر بـالأد نـى لـتـحـد يـد مـدة الـخـمـول وتـصـفـيـة الـمـتـاجـر فـعـلـيـاً.`,
                        color,
                        image: linePreview || null,
                    });

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`open_cleanup_modal_${guildId}`)
                            .setLabel("بـدء تـصـفـيـة الـخـامـلـيـن")
                            .setStyle(ButtonStyle.Danger),
                    );

                    await editReplyContainer(i, container, { rows: [row] });
                }
                break;

            //====== delete-inactive: حذف المتاجر الغير متفاعلة ======
            case "delete-inactive":
                {
                    const daysStr = i.options.getString("days");
                    let interval;
                    try {
                        interval = ms(daysStr);
                    } catch {}
                    if (!interval || isNaN(interval) || interval <= 0) {
                        return i.reply({
                            content:
                                "**❌ صيغة المدة غير صحيحة. مثال: `1d` أو `7d` أو `30d`**",
                            ephemeral: true,
                        });
                    }
                    await i.deferReply({ ephemeral: true });
                    const now = Date.now();
                    const allKeys2 = await db.all();
                    const shopKeys2 = allKeys2.filter(
                        (k) =>
                            k.id.startsWith("shop_") &&
                            !k.id.startsWith("shop_lastmsg") &&
                            !k.id.startsWith("shop_ratings") &&
                            typeof k.value === "object" &&
                            k.value?.sellerId,
                    );
                    const toDelete = [];
                    for (const entry of shopKeys2) {
                        const parts = entry.id.split("_");
                        if (parts.length < 3) continue;
                        const entryGuildId = parts[parts.length - 1];
                        const entryChannelId = parts[parts.length - 2];
                        if (entryGuildId !== guildId) continue;
                        const lastMsg = await db.get(
                            `shop_lastmsg_${entryChannelId}_${guildId}`,
                        );
                        // ✅ إصلاح: كان الشرط "!lastMsg || ..." يعني أي متجر ما
                        // عنده سجل رسائل (حتى لو متفاعل جداً بس النظام ما سجّل
                        // له lastMsg لأي سبب) ينحذف فوراً. هذا يناقض نفس منطق
                        // فحص "شيك عليهم" (cleanup_days_modal) اللي يتخطى المتاجر
                        // بدون سجل رسائل بدل ما يحذفها. صار نفس المنطق هنا: نحذف
                        // فقط إذا فيه سجل فعلي وتجاوز المدة، وإلا نتخطاه.
                        if (lastMsg && now - lastMsg >= interval) {
                            toDelete.push({
                                channelId: entryChannelId,
                                dbKey: entry.id,
                            });
                        }
                    }
                    if (!toDelete.length) {
                        return i.editReply({
                            content: `**✅ لا توجد متاجر غير متفاعلة خلال \`${daysStr}\`**`,
                        });
                    }
                    const confirmRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(
                                `confirm_del_inactive_${guildId}_${daysStr.replace(/[^a-z0-9]/g, "")}`,
                            )
                            .setLabel(`تأكيد حذف ${toDelete.length} متجر`)
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji(emojis.delete),
                        new ButtonBuilder()
                            .setCustomId("cancel_del_inactive")
                            .setLabel("إلغاء")
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji(emojis.cancel),
                    );
                    await db.set(
                        `pending_delete_inactive_${guildId}`,
                        toDelete.map((x) => x.channelId),
                    );

                    const container = buildContainer({
                        title: "⚠️ تأكيد الحذف",
                        description: ED.commandsA_011({ daysStr, toDelete }),
                        color: _ec.color(i.guild?.id),
                    });

                    await editReplyContainer(i, container, { rows: [confirmRow] });
                }
                break;

            //====== setup-auto-reset: إعداد ريست المنشن التلقائي ======
            case "setup-auto-reset":
                {
                    // ✅ إضافة: هذا الأمر كان بدون أي فحص صلاحية (highstaff) على عكس
                    // بقية أوامر الإعدادات في هذا الملف — أي عضو كان يقدر يغيّر
                    // إعدادات الريست التلقائي. أضفنا نفس فحص highstaff المستخدم
                    // بالأوامر المشابهة.
                    const { member } = i;
                    const highstaff = await db.get(`highstaff_${guildId}`);
                    if (!highstaff) {
                        return i.reply({
                            content:
                                "يرجى تحديد رتبة العليا (highstaff) عن طريق استخدام الامر الاتي: /setup",
                            ephemeral: true,
                        });
                    }
                    if (!member.roles.cache.has(highstaff)) {
                        return i.reply({
                            content: `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر. تـحـتـاج رتـبـه <@&${highstaff}>.`,
                            ephemeral: true,
                        });
                    }

                    const days = i.options.getInteger("days");
                    const room = i.options.getChannel("room");
                    const message = i.options.getString("message");
                    await db.set(`auto_mention_reset_${guildId}`, {
                        days,
                        roomId: room.id,
                        message,
                        lastReset: Date.now(),
                        type: null,
                    });

                    const container = buildContainer({
                        title: "✅ تم إعداد ريست المنشن التلقائي",
                        description: ED.commandsA_012({ days, message, room }),
                        // ✅ إصلاح: كان الكود يستخدم "message.guild?.id" وmessage هنا
                        // نص وليس Interaction، فهذا كان يسبب خطأ (message.guild غير
                        // موجود على نوع string). الصحيح هو i.guild?.id.
                        color: _ec.color(i.guild?.id),
                    });

                    await replyContainer(i, container, { ephemeral: true });
                }
                break;

            //====== edit-auto-reset: تعديل إعدادات الريست التلقائي ======
            case "edit-auto-reset":
                {
                    // ✅ إضافة: نفس فحص الصلاحية الناقص بالأمر السابق
                    const { member } = i;
                    const highstaff = await db.get(`highstaff_${guildId}`);
                    if (!highstaff) {
                        return i.reply({
                            content:
                                "يرجى تحديد رتبة العليا (highstaff) عن طريق استخدام الامر الاتي: /setup",
                            ephemeral: true,
                        });
                    }
                    if (!member.roles.cache.has(highstaff)) {
                        return i.reply({
                            content: `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر. تـحـتـاج رتـبـه <@&${highstaff}>.`,
                            ephemeral: true,
                        });
                    }

                    const cfg = await db.get(`auto_mention_reset_${guildId}`);
                    if (!cfg)
                        return i.reply({
                            content:
                                "**❌ لم يتم إعداد الريست التلقائي بعد. استخدم `/setup-auto-reset` أولاً.**",
                            ephemeral: true,
                        });
                    if (i.options.getInteger("days") !== null)
                        cfg.days = i.options.getInteger("days");
                    if (i.options.getChannel("room"))
                        cfg.roomId = i.options.getChannel("room").id;
                    if (i.options.getString("message"))
                        cfg.message = i.options.getString("message");
                    if (i.options.getString("type") !== null)
                        cfg.type = i.options.getString("type") || null;
                    await db.set(`auto_mention_reset_${guildId}`, cfg);

                    const container = buildContainer({
                        title: "✅ تم تعديل إعدادات الريست التلقائي",
                        description: ED.commandsA_013({ cfg }),
                        color: _ec.color(i.guild?.id),
                    });

                    await replyContainer(i, container, { ephemeral: true });
                }
                break;

            case "add-word": {
                const guildId = i.guild.id;

                // ✅ إضافة: هذا الأمر كان بدون أي فحص صلاحية أو بلاك لست —
                // أي عضو بالسيرفر كان يقدر يضيف/يحذف كلمات ممنوعة. أضفنا
                // نفس نمط فحص highstaff المستخدم بباقي أوامر الإعدادات.
                const blacklist = (await db.get("blacklist")) || [];
                if (blacklist.includes(i.user.id)) {
                    return i.reply({
                        content: "**أنت في البلاك لست، لمعلومات اكثر تعال سيرفر السبورت!**",
                        ephemeral: true,
                    });
                }
                const highstaff = await db.get(`highstaff_${guildId}`);
                if (!highstaff) {
                    return i.reply({
                        content:
                            "يرجى تحديد رتبة العليا (highstaff) عن طريق استخدام الامر الاتي: /setup",
                        ephemeral: true,
                    });
                }
                if (!i.member.roles.cache.has(highstaff)) {
                    return i.reply({
                        content: `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر. تـحـتـاج رتـبـه <@&${highstaff}>.`,
                        ephemeral: true,
                    });
                }

                const word = i.options.getString('word').trim().toLowerCase();
                const shouldRemove = i.options.getBoolean('remove') ?? false;

                // جـلـب الـكـلـمـات بـطـريـقـة آ مـنـة لـلـتـلـو يـن
                let words = (await db.get('forbidden_words_' + guildId)) || [];
                const serverColor = _ec.color(guildId);
                const linePreview = await db.get('image_' + guildId);

                if (shouldRemove) {
                    if (!words.includes(word)) {
                        return i.reply({ content: '**❌ الـكـلـمـة غـيـر مـوجـودة فـي الـقـائـمـة.**', ephemeral: true });
                    }
                    words = words.filter((w) => w !== word);
                    await db.set('forbidden_words_' + guildId, words);

                    const removeContainer = buildContainer({
                        title: '🗑️ تـم إزالـة كـلـمـة',
                        description: 'تـم حـذف: **' + word + '** مـن الـقـائـمـة.\nالـعـدد الـمـتـبـقـي: **' + words.length + '** كـلـمـة.',
                        color: serverColor,
                        image: linePreview || null,
                    });
                    return replyContainer(i, removeContainer, { ephemeral: true });

                } else {
                    if (words.includes(word)) {
                        return i.reply({ content: '**⚠️ الـكـلـمـة مـوجـودة بـالـفـعـل.**', ephemeral: true });
                    }
                    words.push(word);
                    await db.set('forbidden_words_' + guildId, words);

                    const addContainer = buildContainer({
                        title: '✅ تـم إضـافـة كـلـمـة',
                        description: 'تـم إضـافـة: **' + word + '** لـلـقـائـمـة.\nإجـمـالـي الـكـلـمـات: **' + words.length + '** كـلـمـة.',
                        color: serverColor,
                        image: linePreview || null,
                    });
                    return replyContainer(i, addContainer, { ephemeral: true });
                }
            }
            break;

        } // قـفـلـة الـ switch
    }); // قـفـلـة الـ interactionCreate أو الـ messageCreate
}