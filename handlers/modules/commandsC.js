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
// المستخدم بباقي ملفات البوت، عشان الشكل يكون موحّد).
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

module.exports = function registerCommandsC(
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
    // ✅ أدوات مساعدة مشتركة: فحص البلاك لست + صلاحية highstaff
    // (كانت مكررة حرفيًا بأكثر من 8 أوامر بهذا الملف)
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
        if (!highstaff) {
            await i.reply({
                content:
                    "يرجى تحديد رتبة العليا (highstaff) عن طريق استخدام الامر الاتي: /setup",
                ephemeral: true,
            });
            return false;
        }
        if (!i.member.roles.cache.has(highstaff)) {
            await i.reply({
                content: `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر. تـحـتـاج رتـبـه <@&${highstaff}>.`,
                ephemeral: true,
            });
            return false;
        }
        return true;
    }

    client.on("interactionCreate", async (i) => {
        if (!i.isChatInputCommand()) return;
        const guildId = i.guild.id;
        switch (i.commandName) {
            case "warns":
                {
                    if (await checkBlacklist(i)) return;
                    const guildId = i.guild.id;

                    try {
                        // استرجاع بيانات المتجر من قاعدة البيانات
                        const shopData = await db.get(
                            `shop_${i.channel.id}_${guildId}`,
                        );
                        if (!shopData) {
                            return await i.reply({
                                content: `❌ **هذا الشات ليس متجرا.**`,
                                ephemeral: true,
                            });
                        }

                        // استرجاع عدد التحذيرات
                        const warns = shopData.warns || 0;

                        // استرجاع رابط الصورة من قاعدة البيانات
                        const imageUrl = await db.get(`image_${guildId}`);

                        const container = buildContainer({
                            title: " تحذيرات المتجر",
                            authorName: i.guild.name,
                            authorIcon: i.guild.iconURL({ size: 1024 }),
                            fields: [{ name: "عدد التحذيرات:", value: `${warns}` }],
                            footer: i.guild?.name || "Server",
                            color: _ec.color(guildId),
                            image: imageUrl || null,
                        });

                        await replyContainer(i, container);
                    } catch (error) {
                        console.error(error);
                        await i.reply({
                            content: "❌ **حدثت مشكلة أثناء تنفيذ الأمر.**",
                            ephemeral: true,
                        });
                    }
                }
                break;
            case "warn":
                {
                    if (await checkBlacklist(i)) return;
                    const guildId = i.guild.id;
                    const { member } = i;

                    try {
                        await i.deferReply({ ephemeral: true });

                        const sellerId = await db.get(
                            `shop_${i.channel.id}_${guildId}.sellerId`,
                        );
                        const admins = await db.get(`shopad_${guildId}`);
                        const shop = i.options.getChannel("shop") || i.channel;
                        const pic = i.options.getAttachment("pic")?.url;
                        const thewarn =
                            i.options.getString("thewarn") ||
                            "لا يوجد سبب محدد.";
                        let amount = i.options.get("amount")?.value ?? 1;

                        // التحقق من الصلاحيات
                        if (!admins) {
                            return await i.editReply({
                                content:
                                    "❌ يرجى تحديد الأدمن باستخدام الأمر: `/setup`",
                            });
                        }

                        if (!member.roles.cache.has(admins)) {
                            return await i.editReply({
                                content: `❌ لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر. تـحـتـاج رتـبـة <@&${admins}>`,
                            });
                        }

                        // التحقق من العدد
                        if (amount < 1 || !Number.isInteger(amount)) {
                            return await i.editReply({
                                content:
                                    "❌ يجب أن يكون عدد التحذيرات عددًا صحيحًا أكبر من أو يساوي 1.",
                            });
                        }

                        if (amount > 999) {
                            return i.editReply({
                                content: `❌ **لا يمكنك تحذير أكثر من 999 تحذير ._.**
-# يا ساتر المتجر وش مسوي `,
                            });
                        }

                        const shopData = await db.get(
                            `shop_${shop.id}_${guildId}`,
                        );
                        if (!shopData) {
                            return await i.editReply({
                                content: `❌ **هذا الشات ليس متجرا.**`,
                            });
                        }

                        // تحديث التحذيرات
                        const updatedWarns = (shopData.warns || 0) + amount;
                        await db.add(
                            `shop_${shop.id}_${guildId}.warns`,
                            amount,
                        );

                        // ✅ إنشاء Container التحذير (Components V2)
                        const warningContainer = buildContainer({
                            title: `**تم تحذير المتجر ${shop} ${config.whaitshop}**`,
                            description: ED.commandsC_001({ config }),
                            fields: [
                                { name: `صـاحب الـمـتجــر ${config.whaitshop}`, value: `<@!${sellerId}>` },
                                { name: `عـدد تـحذيـرات الـمتجـر ${config.whaitshop}`, value: `${updatedWarns}` },
                                { name: `سـبب تحـذير الــمتجر ${config.whaitshop}`, value: `${thewarn}` },
                                { name: `المــسؤول ${config.whaitshop}`, value: `<@${i.user.id}>` },
                            ],
                            image: pic || null,
                        });

                        // إرسال التحذير في القناة
                        await sendContainer(shop, warningContainer);

                        // إرسال Container في قناة السجلات إذا كانت موجودة
                        const logsChannelId = await db.get(`logs_${guildId}`);
                        if (logsChannelId) {
                            // ✅ إصلاح: كان .fetch() بدون .catch()، فلو الروم
                            // محذوف أو الآيدي غير صالح كان يرمي خطأ غير ملتقط
                            // يوقف باقي الأمر (رغم إن التحذير نفسه كان انرسل
                            // بالفعل بالمتجر، فيطلع "حدثت مشكلة" زوراً).
                            const logsChannel = await i.guild.channels
                                .fetch(logsChannelId)
                                .catch(() => null);
                            if (logsChannel) {
                                await sendContainer(logsChannel, buildContainer({
                                    title: `**تم تحذير المتجر ${shop} ${config.whaitshop}**`,
                                    description: ED.commandsC_001({ config }),
                                    fields: [
                                        { name: `صـاحب الـمـتجــر ${config.whaitshop}`, value: `<@!${sellerId}>` },
                                        { name: `عـدد تـحذيـرات الـمتجـر ${config.whaitshop}`, value: `${updatedWarns}` },
                                        { name: `سـبب تحـذير الــمتجر ${config.whaitshop}`, value: `${thewarn}` },
                                        { name: `المــسؤول ${config.whaitshop}`, value: `<@${i.user.id}>` },
                                    ],
                                    image: pic || null,
                                })).catch(() => {});
                            }
                        }

                        // إرسال رابط الصورة إذا كان موجودًا (خط زخرفي منفصل، كما بالأصل)
                        const imageUrl = await db.get(`image_${guildId}`);
                        if (imageUrl) {
                            await shop.send({ content: imageUrl });
                            if (logsChannelId) {
                                const logsChannel = await i.guild.channels
                                    .fetch(logsChannelId)
                                    .catch(() => null);
                                if (logsChannel) {
                                    await logsChannel.send({ content: imageUrl }).catch(() => {});
                                }
                            }
                        }

                        // الرد على المستخدم
                        await i.editReply({
                            content: `✅ **تـم تحذير مـتـجـر ${shop} \n بـ ${amount} تـحـذيـر \n عـدد تـحـذيـرات المـتـجـر الآن: ${updatedWarns}**`,
                        });
                    } catch (error) {
                        console.error(error);
                        await i.editReply({
                            content: "❌ **حدثت مشكلة أثناء تنفيذ الأمر.**",
                        }).catch(() => {});
                    }
                }
                break;
            case "unwarn":
                {
                    if (await checkBlacklist(i)) return;
                    const { member, channel } = i;
                    const guildId = i.guild.id;
                    await i.deferReply({ ephemeral: true });

                    let amount = i.options.get("amount")?.value || 1;
                    let shop = i.options.getChannel("shop") || channel;

                    shop = i.guild.channels.cache.get(shop.id);
                    const data = await db.get(`shop_${shop.id}_${guildId}`);
                    const admins = await db.get(`shopad_${guildId}`);

                    if (!admins) {
                        await i.editReply({
                            content:
                                "يرجى تحديد الادمن عن طريق استخدام الامر الاتي: /setup",
                        });
                        return;
                    }

                    if (!member.roles.cache.has(admins)) {
                        await i.editReply({
                            content: `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر تـحـتـاج رتـبـه <@&${admins}>`,
                        });
                        return;
                    }

                    if (!data) {
                        await i.editReply({
                            content: `** هـذة الـروم لـيـسـت مـتـجـرا  **`,
                        });
                        return;
                    }

                    // التحقق من العدد
                    if (amount < 1 || !Number.isInteger(amount)) {
                        return await i.editReply({
                            content:
                                "❌ يجب أن يكون عدد التحذيرات المراد إزالتها عددًا صحيحًا أكبر من أو يساوي 1.",
                        });
                    }

                    if (data.warns - amount < 0) {
                        await i.editReply({
                            content: `** بـتـشـيـل ${amount} كـيـف و عـدد تـحـذيـرات المـتـجـر ${data.warns} اصـلا **`,
                        });
                        return;
                    }

                    if (shop && data) {
                        // تحديث عدد التحذيرات
                        await db.sub(
                            `shop_${shop.id}_${guildId}.warns`,
                            amount,
                        );
                        const updatedWarns = data.warns - amount;

                        // ✅ إصلاح: كانت قيمتا "عدد التحذيرات التي تمت إزالتها"
                        // و"التحذيرات المتبقية" منسوختين حرفيًا من أمر
                        // unwarn-all (اللي فيه المنطق صحيح لأنه يصفّر كل شي).
                        // هنا بأمر unwarn العادي (إزالة جزئية) كانت القيم:
                        // "المُزالة" = data.warns (العدد الكلي القديم! غلط)
                        // "المتبقية" = 0 ثابتة دائمًا (غلط تمامًا، حتى لو
                        // تبقى تحذيرات فعلية). صارت:
                        // "المُزالة" = amount (العدد الفعلي المُزال)
                        // "المتبقية" = updatedWarns (العدد الحقيقي المتبقي)
                        const removeWarnContainer = buildContainer({
                            title: " **تـم ازالـة تحـذيـر مـن مـتـجـر**",
                            fields: [
                                { name: `${config.whaitshop} **الـمـتـجـر**`, value: `${shop}` },
                                { name: `${config.whaitshop} **عدد التحذيرات التي تمت إزالتها**`, value: `${amount}` },
                                { name: `${config.whaitshop} **التحذيرات المتبقية**`, value: `${updatedWarns}` },
                                { name: `${config.whaitshop} **صاحب المتجر**`, value: `<@${data.sellerId}>` },
                                { name: `${config.whaitshop} **المسؤول**`, value: `<@${i.user.id}>` },
                            ],
                            footer: "تم حذف التحذيرات بنجاح",
                        });

                        // إرسال الـ Container في المتجر
                        await sendContainer(shop, removeWarnContainer);

                        // إرسال الـ Container في السجلات
                        const logsChannelId = await db.get(`logs_${guildId}`);
                        if (logsChannelId) {
                            const logsChannel = await i.guild.channels
                                .fetch(logsChannelId)
                                .catch(() => null);
                            if (logsChannel) {
                                await sendContainer(logsChannel, buildContainer({
                                    title: " **تـم ازالـة تحـذيـر مـن مـتـجـر**",
                                    fields: [
                                        { name: `${config.whaitshop} **الـمـتـجـر**`, value: `${shop}` },
                                        { name: `${config.whaitshop} **عدد التحذيرات التي تمت إزالتها**`, value: `${amount}` },
                                        { name: `${config.whaitshop} **التحذيرات المتبقية**`, value: `${updatedWarns}` },
                                        { name: `${config.whaitshop} **صاحب المتجر**`, value: `<@${data.sellerId}>` },
                                        { name: `${config.whaitshop} **المسؤول**`, value: `<@${i.user.id}>` },
                                    ],
                                    footer: "تم حذف التحذيرات بنجاح",
                                })).catch(() => {});
                            }
                        }

                        // الرد على المستخدم
                        await i.editReply({
                            content: `✅ **تـم ازالـة ${amount} تـحـذيـرات مـن مـتـجـر ${shop}\nعـدد تـحـذيـرات المـتـجـر الآن: ${updatedWarns}**`,
                        });
                    }
                }
                break;
            case "unwarn-all":
                {
                    if (await checkBlacklist(i)) return;

                    const { member, channel } = i;
                    const guildId = i.guild.id;
                    await i.deferReply({ ephemeral: true });

                    let shop = i.options.getChannel("shop");

                    if (!(await requireHighstaff(i, guildId))) return;

                    // زر التأكيد
                    const confirmButton = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId("confirm_unwarn_all")
                            .setLabel("تأكيد حذف التحذيرات")
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji(emojis.delete),
                    );

                    await i.editReply({
                        content: "❗ هل أنت متأكد من رغبتك بحذف التحذيرات؟",
                        components: [confirmButton],
                    });

                    const filter = (interaction) =>
                        interaction.customId === "confirm_unwarn_all" &&
                        interaction.user.id === i.user.id;
                    const collector = channel.createMessageComponentCollector({
                        filter,
                        time: 60000,
                    });

                    collector.on("collect", async (interaction) => {
                        if (!shop) {
                            // حذف التحذيرات من جميع المتاجر
                            const shops = await db.all();
                            const shopKeys = shops.filter(
                                (entry) =>
                                    entry.id.startsWith(`shop_`) &&
                                    entry.id.endsWith(`_${guildId}`),
                            );

                            for (const shopKey of shopKeys) {
                                await db.set(shopKey.id, {
                                    ...shopKey.value,
                                    warns: 0,
                                });
                            }

                            await interaction.update({
                                content: `✅ **تـم ازالـة جـمـيـع الـتـحـذيـرات مـن كـل الـمـتـاجـر**`,
                                components: [],
                            });
                        } else {
                            shop = i.guild.channels.cache.get(shop.id);
                            const data = await db.get(
                                `shop_${shop.id}_${guildId}`,
                            );

                            if (!data) {
                                await interaction.update({
                                    content: `** هـذة الـروم لـيـسـت مـتـجـرا  **`,
                                    components: [],
                                });
                                return;
                            }

                            await db.set(`shop_${shop.id}_${guildId}.warns`, 0);

                            const removeAllWarnsContainer = buildContainer({
                                title: " **تـم ازالـة كـل تـحـذيـرات مـتـجـر**",
                                fields: [
                                    { name: `${config.whaitshop} **الـمـتـجـر**`, value: `${shop}` },
                                    { name: `${config.whaitshop} **عدد التحذيرات التي تمت إزالتها**`, value: `${data.warns}` },
                                    { name: `${config.whaitshop} **التحذيرات المتبقية**`, value: `0` },
                                    { name: `${config.whaitshop} **صاحب المتجر**`, value: `<@${data.sellerId}>` },
                                    { name: `${config.whaitshop} **المسؤول**`, value: `<@${i.user.id}>` },
                                ],
                                footer: "تم حذف جميع التحذيرات بنجاح",
                            });

                            await sendContainer(shop, removeAllWarnsContainer);

                            const logsChannelId = await db.get(
                                `logs_${guildId}`,
                            );
                            if (logsChannelId) {
                                const logsChannel = await i.guild.channels
                                    .fetch(logsChannelId)
                                    .catch(() => null);
                                if (logsChannel) {
                                    await sendContainer(logsChannel, buildContainer({
                                        title: " **تـم ازالـة كـل تـحـذيـرات مـتـجـر**",
                                        fields: [
                                            { name: `${config.whaitshop} **الـمـتـجـر**`, value: `${shop}` },
                                            { name: `${config.whaitshop} **عدد التحذيرات التي تمت إزالتها**`, value: `${data.warns}` },
                                            { name: `${config.whaitshop} **التحذيرات المتبقية**`, value: `0` },
                                            { name: `${config.whaitshop} **صاحب المتجر**`, value: `<@${data.sellerId}>` },
                                            { name: `${config.whaitshop} **المسؤول**`, value: `<@${i.user.id}>` },
                                        ],
                                        footer: "تم حذف جميع التحذيرات بنجاح",
                                    })).catch(() => {});
                                }
                            }

                            await interaction.update({
                                content: `✅ **تـم ازالـة جـمـيـع الـتـحـذيـرات مـن مـتـجـر ${shop}**`,
                                components: [],
                            });
                        }

                        collector.stop();
                    });

                    collector.on("end", async (_, reason) => {
                        if (reason !== "collect") {
                            const disabledButton =
                                new ActionRowBuilder().addComponents(
                                    new ButtonBuilder()
                                        .setCustomId("confirm_unwarn_all")
                                        .setLabel("تأكيد حذف التحذيرات")
                                        .setStyle(ButtonStyle.Danger)
                                        .setDisabled(true)
                                        .setEmoji(emojis.delete),
                                );

                            await i.editReply({
                                content:
                                    "❗ هل أنت متأكد من رغبتك بحذف التحذيرات؟",
                                components: [disabledButton],
                            }).catch(() => {});
                        }
                    });
                }
                break;
            case "order":
                {
                    if (await checkBlacklist(i)) return;
                    const guildId = i.guild.id;
                    const ordersroomId = await db.get(`orderroom_${guildId}`);
                    const ch = i.guild.channels.cache.get(ordersroomId);
                    const imageUrl = await db.get(`image_${guildId}`);
                    const Ourderadmins = await db.get(`orderad_${guildId}`);
                    const ui = i.options.getUser(`الشخص`);
                    const re = i.options.getString(`الطلب`);
                    const men = i.options.getInteger(`المنشن`);

                    // ✅ إصلاح: كان الكود يفحص .has(`${Ourderadmins}`) مباشرة
                    // بدون التأكد إذا كانت الرتبة معرّفة أصلاً، فلو ما حد ضبطها
                    // بعد، كل مستخدم كان ياخذ رسالة "ما تمتلك صلاحية" المضللة
                    // بدل رسالة واضحة تقول "لسه ما تحدد رتبة أدمن الطلبات".
                    if (!Ourderadmins) {
                        return i.reply({
                            content:
                                "يرجى تحديد رتبة أدمن الطلبات عن طريق استخدام الامر الاتي: /setup",
                            ephemeral: true,
                        });
                    }

                    if (!i.member.roles.cache.has(Ourderadmins)) {
                        return i.reply({
                            content:
                                "** انت لا تمتلك الصلاحيات الكافيه لأستخدام هذا الامر **",
                            ephemeral: true,
                        });
                    }

                    // ✅ إصلاح: ch كان يُستخدم مباشرة بدون أي تحقق من وجوده،
                    // فلو روم الطلبات (orderroom) غير محدد أو محذوف، الكود كان
                    // يرمي خطأ ويكرش الأمر بالكامل (ما فيه try/catch أصلاً هنا).
                    if (!ch) {
                        return i.reply({
                            content:
                                "❌ روم الطلبات غير محدد أو محذوف، يرجى ضبطه عبر: `/setup`",
                            ephemeral: true,
                        });
                    }

                    // ✅ إصلاح: "op" كان يبقى undefined لو men مو 0 ولا 1،
                    // فتصير رسالة المنشن حرفياً "@undefined". صار الآن ما فيه
                    // منشن إذا القيمة غير متوقعة، بدل نص مكسور.
                    let op = null;
                    if (men === 0) op = "everyone";
                    else if (men === 1) op = "here";

                    const container = buildContainer({
                        description: `**- الطلـــلـب : ${re}\n\n- صـاحـب الطلـــلـب : <@${ui.id}>**`,
                        footer: `By: ${i.user.username}`,
                        image: imageUrl || null,
                        mention: op ? `@${op}` : null,
                    });

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId("ticket-order")
                            .setLabel("شــراء طــلب")
                            .setEmoji(emojis.order)
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId("order-price")
                            .setLabel("اســـعار الـــطلــبات")
                            .setEmoji(emojis.order)
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setLabel("صاحب الطــلب")
                            .setStyle(ButtonStyle.Link)
                            .setURL(`https://discord.com/users/${ui.id}`)
                            .setEmoji(emojis.user),
                    );

                    await sendContainer(ch, container, [row]);

                    i.reply({ content: "** Done ✅ **", ephemeral: true });
                }
                break;
            case "owner": {
                if (await checkBlacklist(i)) return;
                await i.deferReply();
                const interaction = i;
                const shop =
                    interaction.options.getChannel("shop") || i.channel;
                let newOwner = interaction.options.getMember("new-owner");
                const guildId = i.guild.id;
                const { member, guild } = i;
                const admins = await db.get(`shopad_${guildId}`);
                const imageUrl = await db.get(`image_${guildId}`);

                if (!admins) {
                    await i.editReply({
                        content:
                            "يرجى تحديد الادمن عن طريق استخدام الامر الاتي: /setup",
                    });
                    return;
                }

                if (!member.roles.cache.has(admins)) {
                    await i.editReply({
                        content: `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر تـحـتـاج رتـبـه <@&${admins}>`,
                    });
                    return;
                }

                try {
                    const shopData = await db.get(`shop_${shop.id}_${guildId}`);
                    const settings = shopData;
                    if (!settings) {
                        return interaction.editReply({
                            content: "هـذة الـروم لـيـست مـتـجـرا.",
                        });
                    }

                    const oldOwnerId = shopData.sellerId;
                    const oldOwner =
                        interaction.guild.members.cache.get(oldOwnerId);
                    if (!newOwner) {
                        return interaction.editReply({
                            content: "المـالـك الجـديـد غـيـر صـحـيـح.",
                        });
                    }

                    if (oldOwnerId === newOwner.id) {
                        return interaction.editReply({
                            content: `هـذا الشـخـص : <@${newOwner.id}> هـو مـالـك المـتـجـر بـالفـعـل.`,
                        });
                    }

                    // تحديث الأذونات
                    await shop.permissionOverwrites.delete(oldOwnerId);
                    await shop.permissionOverwrites.edit(newOwner, {
                        ViewChannel: true,
                        SendMessages: true,
                        EmbedLinks: true,
                        AddReactions: true,
                        UseExternalEmojis: true,
                        ReadMessageHistory: true,
                        MentionEveryone: true,
                        AttachFiles: true,
                    });

                    // تحديث قاعدة البيانات
                    await db.set(
                        `shop_${shop.id}_${guildId}.sellerId`,
                        newOwner.id,
                    );

                    // إرسال الرد في الرسالة المؤقتة
                    await interaction.editReply({
                        content: `تـم نـقـل مـلـكـيـة المـتـجـر :${shop} الـي : ${newOwner}`,
                    });

                    // ✅ إنشاء Container لتفاصيل نقل الملكية (بدل Embed)
                    // وضم صورة الخط الزخرفية داخل نفس الـ Container بدل ما
                    // ترسل كرسالة منفصلة بعدها (كان الكود القديم يرسلها
                    // كرسالتين منفصلتين لكل قناة، صارت رسالة وحدة).
                    const transferContainer = buildContainer({
                        title: "نقل ملكية المتجر",
                        description: ED.commandsC_002({ shop }),
                        fields: [
                            { name: "صاحب المتجر القديم", value: oldOwner ? `<@${oldOwner.id}>` : "غير محدد" },
                            { name: "صاحب المتجر الجديد", value: `<@${newOwner.id}>` },
                            { name: "المسؤول", value: `<@${i.user.id}>` },
                            { name: "تاريخ النقل", value: new Date().toLocaleString() },
                            { name: "اسم المتجر", value: shop.name },
                        ],
                        image: imageUrl || null,
                    });

                    // إرسال الـ Container في المتجر
                    await sendContainer(shop, transferContainer);

                    // ✅ إصلاح: كان الكود يجلب قناة السجلات بـ
                    // .fetch(channelToSendId) بدون .catch() ولا حتى تحقق من
                    // وجود channelToSendId أصلاً — لو روم السجلات غير محدد،
                    // .fetch(undefined) بديسكورد.جي.إس يجلب *كل* رومات
                    // السيرفر (Collection) بدل روم واحد، وبعدها .send() على
                    // الـ Collection يرمي خطأ يوقف الأمر بالكامل (رغم إن نقل
                    // الملكية نفسه كان تم فعلاً، فتطلع رسالة "حدثت مشكلة"
                    // زوراً). كذلك كان فيه إرسال مكرر لنفس الإيمبد بنفس روم
                    // السجلات مرتين (channelToSend ثم logg بنفس المفتاح
                    // logs_${guildId})! أزلنا التكرار وأصلحنا الفحص.
                    const logsChannelId = await db.get(`logs_${guildId}`);
                    if (logsChannelId) {
                        const logsChannel = await i.guild.channels
                            .fetch(logsChannelId)
                            .catch(() => null);
                        if (logsChannel) {
                            await sendContainer(logsChannel, transferContainer).catch(() => {});
                        } else {
                            console.log(
                                `i can't fined log channel ${i.guild.name} .`,
                            );
                        }
                    }
                } catch (error) {
                    console.error("Error transferring ownership:", error);
                    await interaction.editReply({
                        content: "حـدثـت مـشـكـلـة مـا.",
                    }).catch(() => {});
                }
                break;
            }

            case "mentions":
                {
                    if (await checkBlacklist(i)) return;

                    const guildId = i.guild.id;
                    const data = await db.get(
                        `shop_${i.channel.id}_${guildId}`,
                    );
                    if (!data)
                        return await i.reply({
                            content: `❌ **هذا الروم ليس مسجل كمتجر**`,
                            ephemeral: true,
                        });

                    const imageUrl = await db.get(`image_${guildId}`);

                    // ✅ لم يتم لمس هذا الجزء إطلاقاً — أصلاً مبني بـ
                    // Components V2 بنفس الكود الأصلي.
                    const container = new ContainerBuilder()
                        .setAccentColor(0x00ccff) // لون جانبي مثل الإيمبد
                        .addSectionComponents((section) =>
                            section
                                .addTextDisplayComponents((td) =>
                                    td.setContent(
                                        `**\`-\`. 𒆜__Everyone__ : ${data.everyoneMentions}**`,
                                    ),
                                )
                                .setButtonAccessory((btn) =>
                                    btn
                                        .setCustomId("dashboardshop")
                                        .setLabel("تحكــم بـ المــتجــر")
                                        .setStyle(ButtonStyle.Secondary),
                                ),
                        )
                        .addSectionComponents((section) =>
                            section
                                .addTextDisplayComponents((td) =>
                                    td.setContent(
                                        `**\`-\`. 𒆜__Here__ : ${data.hereMentions}**`,
                                    ),
                                )
                                .setButtonAccessory((btn) =>
                                    btn
                                        .setCustomId("tashfeerk")
                                        .setLabel("تشفــير")
                                        .setStyle(ButtonStyle.Secondary),
                                ),
                        )
                        .addSectionComponents((section) =>
                            section
                                .addTextDisplayComponents((td) =>
                                    td.setContent(
                                        `**\`-\`. 𒆜 __Shop mention__ : ${data.shopRoleMentions}**`,
                                    ),
                                )
                                .setButtonAccessory((btn) =>
                                    btn
                                        .setCustomId("mention")
                                        .setLabel("شراء منشات")
                                        .setStyle(ButtonStyle.Secondary),
                                ),
                        );

                    await i.reply({
                        components: [container],
                        flags: MessageFlags.IsComponentsV2,
                    });
                }
                break;

            case "add-tax-channel":
                {
                    const guildId = i.guild.id;
                    if (await checkBlacklist(i)) return;
                    if (!(await requireHighstaff(i, guildId))) return;

                    const channelId = i.options.get("channel").value;
                    if (!channelId) {
                        return i.reply({
                            content: "** لـم يـتـم ادخـال ايـدي روم . **",
                            ephemeral: true,
                        });
                    }

                    const channel = i.guild.channels.cache.get(channelId);
                    if (!channel) {
                        return i.reply({
                            content: "** تـم ادخـال ايـدي روم خـاطـئ. **",
                            ephemeral: true,
                        });
                    }

                    // حفظ روم الضرائب بحيث يكون واحدًا فقط لكل سيرفر
                    await db.set(`tax-channel_${guildId}`, channelId);

                    i.reply({
                        content: `**تـم تعيين الروم : <#${channelId}> كـ روم الضرائب للسيرفر.**`,
                    });
                }
                break;
            case "remove-tax-channel":
                {
                    if (await checkBlacklist(i)) return;
                    if (!(await requireHighstaff(i, guildId))) return;

                    const taxChannel = await db.get(
                        `tax-channel_${i.guild.id}`,
                    );
                    if (!taxChannel) {
                        return i.reply({
                            content:
                                "** لا يوجد روم ضرائب معين لهذا السيرفر. **",
                            ephemeral: true,
                        });
                    }

                    // إزالة روم الضرائب
                    await db.delete(`tax-channel_${i.guild.id}`);

                    i.reply({
                        content: `**تـم ازالـة روم الضرائب : <#${taxChannel}> بـ نـجـاح.**`,
                    });
                }
                break;
            case "show-tax-channels":
                {
                    if (!(await requireHighstaff(i, guildId))) return;

                    const taxChannel =
                        (await db.get(`tax-channel_${i.guild.id}`)) ||
                        "غير مسجل";

                    const container = buildContainer({
                        title: " روم الضرائب",
                        description: ED.commandsC_003({ taxChannel }),
                        color: _ec.color(i.guild?.id),
                    });

                    await replyContainer(i, container);
                }
                break;
            case "add-emoji-channel":
                {
                    const guildId = i.guild.id;
                    if (await checkBlacklist(i)) return;
                    if (!(await requireHighstaff(i, guildId))) return;

                    const channelId = i.options.get("channel").value;
                    if (!channelId) {
                        return i.reply({
                            content: "** لـم يـتـم ادخـال ايـدي روم . **",
                            ephemeral: true,
                        });
                    }

                    const channel = i.guild.channels.cache.get(channelId);
                    if (!channel) {
                        return i.reply({
                            content: "** تـم ادخـال ايـدي روم خـاطـئ. **",
                            ephemeral: true,
                        });
                    }

                    // حفظ القناة لكل سيرفر فقط
                    await db.set(`emoji-channel_${guildId}`, channelId);

                    i.reply({
                        content: `**تـم تعيين الروم : <#${channelId}> كـ روم الإيموجي للسيرفر.**`,
                    });
                }
                break;
            case "remove-emoji-channel":
                {
                    const guildId = i.guild.id;
                    if (await checkBlacklist(i)) return;
                    if (!(await requireHighstaff(i, guildId))) return;

                    const emojiChannel = await db.get(
                        `emoji-channel_${i.guild.id}`,
                    );
                    if (!emojiChannel) {
                        return i.reply({
                            content:
                                "** لا يوجد روم إيموجي معين لهذا السيرفر. **",
                            ephemeral: true,
                        });
                    }

                    // إزالة روم الإيموجي
                    await db.delete(`emoji-channel_${i.guild.id}`);

                    i.reply({
                        content: `**تـم ازالـة روم الإيموجي : <#${emojiChannel}> بـ نـجـاح.**`,
                    });
                }
                break;
            case "show-emoji-channels":
                {
                    const guildId = i.guild.id;
                    if (!(await requireHighstaff(i, guildId))) return;

                    const emojiChannel =
                        (await db.get(`emoji-channel_${i.guild.id}`)) ||
                        "غير مسجل";

                    const container = buildContainer({
                        title: " روم الإيموجي",
                        description: ED.commandsC_004({ emojiChannel }),
                        color: _ec.color(guildId),
                    });

                    await replyContainer(i, container);
                }
                break;
            case "add-sticker-channel":
                {
                    const guildId = i.guild.id;
                    if (await checkBlacklist(i)) return;

                    // ✅ إضافة: هذا الأمر كان بدون أي فحص صلاحية (highstaff)
                    // إطلاقاً، على عكس كل الأوامر المشابهة بهذا الملف (فحص
                    // البلاك لست موجود، لكن أي عضو عادي كان يقدر يغيّر روم
                    // الستيكر). أضفنا نفس فحص highstaff المستخدم بالأوامر
                    // الأخرى (add-tax-channel, add-emoji-channel...).
                    if (!(await requireHighstaff(i, guildId))) return;

                    const sticker = i.options.getChannel("channel");

                    const oldSticker = await db.get(`sticker_${guildId}`);

                    if (oldSticker) {
                        if (oldSticker === sticker.id) {
                            i.reply({ content: "هذا هو روم لوقات المتاجر بالفعل.", ephemeral: true });
                        } else {
                            await db.set(`sticker_${guildId}`, sticker.id);
                            i.reply({
                                content: `تم تحديد ${sticker.name} كروم ستيكر جديد لهذا السيرفر.`,
                            });
                        }
                    } else {
                        await db.set(`sticker_${guildId}`, sticker.id);
                        i.reply({ content: `تم تحديد ${sticker.name} كروم ستيكر.` });
                    }
                }
                break;

            // أمر حذف روم الاستيكر
            case "remove-sticker-channel":
                {
                    const guildId = i.guild.id;
                    if (await checkBlacklist(i)) return;

                    // ✅ إضافة: نفس فحص الصلاحية الناقص بالأمر السابق
                    if (!(await requireHighstaff(i, guildId))) return;

                    const oldSticker = await db.get(`sticker_${guildId}`);

                    if (oldSticker) {
                        await db.delete(`sticker_${guildId}`);
                        i.reply({ content: "تم حذف روم الاستيكر بنجاح." });
                    } else {
                        i.reply({ content: "لا يوجد روم استيكر محدد لهذا السيرفر.", ephemeral: true });
                    }
                }
                break;
            case "show-sticker-channels":
                {
                    const guildId = i.guild.id;
                    if (await checkBlacklist(i)) return;
                    if (!(await requireHighstaff(i, guildId))) return;

                    const stickerChannelId =
                        (await db.get(`sticker_${guildId}`)) || "غير مسجل";

                    const container = buildContainer({
                        title: "روم الاستيكر",
                        description: ED.commandsC_005({ stickerChannelId }),
                        color: _ec.color(guildId),
                    });

                    await replyContainer(i, container);
                }
                break;
        }
    });
};
