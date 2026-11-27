{
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
    Events,
    ActivityType,
    SectionBuilder,           // ✅ أضف هذا
    ThumbnailBuilder,         // ✅ أضف هذا
    MediaGalleryBuilder,      // ✅ أضف هذا
    MediaGalleryItemBuilder,  // ✅ أضف هذا
} = require("discord.js");
const D = require("./descriptions");
const _ec = require("./embedColor");
const fs = require("fs");
const ms = require("ms");
const path = require("path");
const sharp = require("sharp");
const { getAudioUrl } = require("google-tts-api");
const googleTTS = require("google-tts-api");
const emojis = require("./emojis");
const ED = require("./embedDescriptions");
// helper: resolve embed color (per-server or global config fallback)
async function getColor(guildId, _db, _config) {
    const stored = guildId ? await _db.get(`embed_color_${guildId}`) : null;
    const raw = stored || _config?.color || "0x00AE86";
    return parseInt(raw.replace("#", "").replace("0x", ""), 16);
}
// إصلاح شامل
function _buildAuctionMsg(draft, rem) {
    const m = Math.floor(rem / 60),
        s = rem % 60;
    return `${draft.mentionType}\nالمزاد\n\nالسلعة: ${draft.itemName}\nالسعر الابتدائي: ${draft.startPrice}\nالضريبة: ${draft.includesTax ? "نعم" : "لا"}\nصاحب المزاد: <@${draft.owner}>\n\nالوقت المتبقي: ${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function _buildControlRow(roomId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`pause_auction_${roomId}`)
            .setLabel("توقيف")
            .setStyle(ButtonStyle.Primary)
            .setEmoji(emojis.pause),
        new ButtonBuilder()
            .setCustomId(`resume_auction_${roomId}`)
            .setLabel("استمرار")
            .setStyle(ButtonStyle.Success)
            .setEmoji(emojis.resume),
        new ButtonBuilder()
            .setCustomId(`revive_auction_${roomId}`)
            .setLabel("انعاش")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(emojis.revive),
        new ButtonBuilder()
            .setCustomId(`extend_auction_${roomId}`)
            .setLabel("تمديد")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(emojis.extend),
        new ButtonBuilder()
            .setCustomId(`cancel_active_auction_${roomId}`)
            .setLabel("إلغاء")
            .setStyle(ButtonStyle.Danger)
            .setEmoji(emojis.cancelAuction),
    );
}

module.exports = function registerShopInteractions(
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
    // ====== دالة: إرسال تقييم الخدمة بالخاص بعد إغلاق التكت ======
    async function sendTicketRatingDM(userId, guildId, type) {
        const ratingChId = await db.get(`rating_ch_${guildId}`);
        if (!ratingChId) return;
        try {
            const user = await client.users.fetch(userId).catch(() => null);
            if (!user) return;
            const typeLabels = {
                support: " دعم فني",
                scam: " تشهير",
                order: " طلبات",
                auction: " مزاد",
                roles: " رتب",
            };
            const ratingRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`tr_1_${guildId}_${type}`)
                    .setLabel("⭐")
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji(emojis.rate),
                new ButtonBuilder()
                    .setCustomId(`tr_2_${guildId}_${type}`)
                    .setLabel("⭐⭐")
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji(emojis.rate),
                new ButtonBuilder()
                    .setCustomId(`tr_3_${guildId}_${type}`)
                    .setLabel("⭐⭐⭐")
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji(emojis.rate),
                new ButtonBuilder()
                    .setCustomId(`tr_4_${guildId}_${type}`)
                    .setLabel("⭐⭐⭐⭐")
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji(emojis.rate),
                new ButtonBuilder()
                    .setCustomId(`tr_5_${guildId}_${type}`)
                    .setLabel("⭐⭐⭐⭐⭐")
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji(emojis.rate),
            );
            await user.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("⭐ تقييم الخدمة")
                        .setDescription(
                            ED.shopInteractions_001({ type, typeLabels }),
                        )
                        .setFooter({ text: "اضغط على النجوم لإرسال تقييمك" })
                        .setTimestamp(),
                ],
                components: [ratingRow],
            });
        } catch (e) {
            console.log(`[Rating DM] فشل إرسال لـ ${userId}: ${e.message}`);
        }
    }
// ========== +اغلاق ==========
client.on("messageCreate", async (message) => {
    if (!message.content.startsWith("+صوص")) return;
    if (!message.guild) return;

    const channel = message.channel;
    const guildId = message.guild.id;

    // تحقق إذا الروم تكت مجاني
    const shopTicket = await db.get(`shop_ticket_channel_${channel.id}`);
    const auctionTicket = await db.get(`auction_ticket_channel_${channel.id}`);
    const orderTicket = await db.get(`order_ticket_channel_${channel.id}`);

    const ticketData = shopTicket || auctionTicket || orderTicket;

    if (!ticketData) {
        return message.reply("❌ هذا الروم ليس تكت مجاني.");
    }

    if (!ticketData.isFree) {
        return message.reply("❌ هذا التكت ليس مجاني.");
    }

    const ownerId = ticketData.ownerId;
    const userId = message.author.id;

    // صلاحية: صاحب التكت أو أدمن
    if (userId !== ownerId && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply("❌ فقط صاحب التكت أو الأدمن يمكنه الإغلاق.");
    }

    // حذف البيانات
    if (shopTicket) {
        await db.delete(`shop_ticket_${ownerId}_${guildId}`);
        await db.delete(`shop_ticket_channel_${channel.id}`);
    }
    if (auctionTicket) {
        await db.delete(`auction_ticket_${ownerId}_${guildId}`);
        await db.delete(`auction_ticket_channel_${channel.id}`);
        await db.delete(`auction_draft_${ownerId}_${guildId}`);
    }
    if (orderTicket) {
        await db.delete(`order_ticket_${ownerId}_${guildId}`);
        await db.delete(`order_ticket_channel_${channel.id}`);
    }

    await message.channel.send("🔒 سيتم إغلاق التكت خلال 3 ثواني...");
    setTimeout(() => channel.delete().catch(() => {}), 3000);
});
 // ========== +متاجر ==========
// ========== +متاجر ==========
client.on('messageCreate', async message => {
    if (!message.content.startsWith('+متاجر')) return;
    if (!message.guild) return;

    const guildId = message.guild.id;
    const mention = message.mentions.users.first();
    const args = message.content.split(' ');
    const targetId = mention?.id || args[1]?.replace(/[<@!>]/g, '');

    if (!targetId) return message.reply('❌ استخدم: `+متاجر @منشن` أو `+متاجر ايدي`');

    const allEntries = await db.all();
    const userShops = allEntries.filter(entry =>
        entry.id.startsWith('shop_') &&
        entry.id.endsWith(`_${guildId}`) &&
        entry.value?.sellerId === targetId
    );

    if (userShops.length === 0) return message.reply('❌ هذا الشخص لا يملك أي متجر.');

    const serverColor = _ec.color(guildId);
    const guildIcon = message.guild.iconURL({ size: 1024 });
    const banner = message.guild.bannerURL({ size: 1024 });

    const options = userShops.map((shop, i) => ({
        label: `متجر ${i + 1}`,
        description: `${shop.value?.nametype || 'غير محدد'}`.slice(0, 50),
        value: shop.value.channelId,
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`shop_info_${targetId}`)
        .setPlaceholder('اختر متجر لعرض معلوماته')
        .addOptions(options.slice(0, 25));

    const container = new ContainerBuilder().setAccentColor(serverColor);
    
    // بناء الهيدر مع الصورة الرمزية للسيرفر إن وجدت
    const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`#- متاجر <@${targetId}>`));
    
    if (guildIcon) {
        section.setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
    }
    
    container.addSectionComponents(section);
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**عدد المتاجر:** ${userShops.length}\nاختر متجر من القائمة لعرض معلوماته:`)
    );
    
    if (banner) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(banner))
        );
    }
    
    container.addActionRowComponents(new ActionRowBuilder().addComponents(selectMenu));

    await message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    });
});

// ========== معالج السلكت منيو (المعدل والمصلح) ==========
client.on('interactionCreate', async interaction => {
    if (!interaction.isStringSelectMenu()) return;
    if (!interaction.customId.startsWith('shop_info_')) return;

    const targetId = interaction.customId.replace('shop_info_', '');
    const channelId = interaction.values[0];
    const guildId = interaction.guild.id;

    const shopData = await db.get(`shop_${channelId}_${guildId}`);
    if (!shopData) {
        return interaction.reply({ 
            content: '❌ لم يتم العثور على بيانات هذا المتجر.', 
            flags: MessageFlags.Ephemeral 
        });
    }

    const serverColor = _ec.color(guildId);
    const d = shopData;
 const helpersList = d.helpers || d.partners || [];
const helpers = helpersList.length > 0 ? helpersList.map(id => `<@${id}>`).join(' ') : 'لا يوجد';
    const everyM = d.everyoneMentions || 0;
    const hereM = d.hereMentions || 0;
    const shopRoleM = d.shopRoleMentions || 0;
    const shopRole = d.shoprole ? `<@&${d.shoprole}>` : 'غير محدد';

    // بناء الواجهة المصححة بدون تفكيك أخطاء SectionBuilder
    const container = new ContainerBuilder()
        .setAccentColor(serverColor)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`#- معلومات المتجر`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**المتجر:** <#${d.channelId}>\n` +
                `**المالك:** <@${d.sellerId || targetId}>\n` +
                `**النوع:** ${d.nametype || 'غير محدد'}\n` +
                `**رتبة النوع:** ${shopRole}\n` +
                `**تاريخ الإنشاء:** ${d.date || 'غير محدد'}\n` +
                `**التحذيرات:** ${d.warns || 0}\n` +
                `**المساعدين:** ${helpers}\n\n` +
                `**إحصائيات المنشن:**\n` +
                `• **@everyone:** ${everyM}\n` +
                `• **@here:** ${hereM}\n` +
                `• **منشن المتجر:** ${shopRoleM}`
            )
        );

    await interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
});
   
    
    
    const HELP_CATEGORIES = {
    shops1: {
        label: "أوامر الـمـتـاجـر",
        emoji: "<a:by_shop2:1500772524060049518>",
        commands: [
            ["shop", "لانشاء متجر"],
            ["add-shop-data", "اضافة متجر للداتا بيز"],
            ["remove-shop-data", "حذف المتجر من الداتا"],
            ["shop-data", "اظهار معلومات المتجر"],
            ["change-shop-type", "تغيير نوع متجر"],
            ["change-shop-emoji", "تغيير إيموجي المتجر"],
            ["change-shop-name", "تغيير اسم المتجر"],
            ["check-types", "فحص جميع الأنواع"],
            ["edit-type", "تعديل نوع متجر"],
            ["add-type", "تحديد نوع كتاغوري متاجر"],
            ["add-type2", "يحدد نوع كتاغوري و يضيف كل المتاجر"],
            ["remove-type", "حذف نوع كتاغوري متاجر"],
            ["remove-all-types", "حذف جميع انواع المتاجر"],
            ["active", "لتفعيل متجر"],
            ["active-all", "لتفعيل المتاجر"],
            ["disable", "لتعطيل متجر"],
            ["disable-all", "تعطيل جميع المتاجر"],
            ["tax-time", "تفعيل وضع الضريبه"],
            ["types", "لإظهار معلومات انواع المتاجر"],
            ["set-mention", "تحديد عدد منشنات متجر"],
            ["add-mention", "اضافة عدد منشنات لـ متجر"],
            ["add-helper", "اضافة مساعد للمتجر"],
            ["remove-helper", "ازالة مساعد من متجر"],
            ["show-helpers", "رؤية مساعدين المتجر"],
            ["owner", "تغيير صاحب متجر"],
        ],
    },
    shops2: {
        label: "أوامـر الـمـتـاجـر 2",
        emoji: "<a:by_shop2:1500772524060049518>",
        commands: [
            ["delete-shop", "حذف متجر"],
            ["warns", "عرض تحذيرات متجر"],
            ["warn", "تحذير متجر"],
            ["unwarn", "حذف تحذير"],
            ["unwarn-all", "حذف كل التحذيرات"],
            ["mentions", "اظهار عدد منشنات المتجر"],
            ["shop-check", "فحص المتاجر"],
            ["delete-inactive", "حذف المتاجر الغير متفاعلة"],
            ["say-all-shops", "ارسال رسالة لكل المتاجر"],
            ["reset-mentions", "ترسيت جميع المنشنات"]
        ],
    },
    orders: {
        label: "أوامر الـبـرفـكـس",
        emoji: "<a:by_noobot:1500777751718924318>",
        commands: [["+تحذيرات", " تسطيب تحذيرات المتاجر التلقائيه"],
 ["+تسطيب التقديم", " تسطيب امبد تقديم اداره او على رتبه معينه "],
                    ["+اضافه", " يضيف المتاجر بكاتاجوري للداتا بدون قروشه"],
                    ["!داتا","  يقفل التكت ويحذف بياناته بالتكت "],
        
        ],
    },
    auction: {
        label: "أوامر الـمـزاد والـطـلـبـات",
        emoji: "<a:by_noobot:1500772032160337951>",
        commands: [
            ["r-mzad", "تعيين قوانين المزاد"],
            ["order", "لطلب بروم انت تحدده"],
            ["add-mzad-room", "إضافة روم مزاد"],
            ["remove-mzad-room", "حذف روم مزاد"],
            ["start-mzad", "بدء مزاد"],
            ["mzad-stats", "إحصائيات المزادات"],
            ["mzad-list", "عرض قائمة المزادات النشطة"],
            ["add-mzad2-type", "إضافة نوع مزاد خاص"],
            ["set-mzad2-cat", "تحديد كتاغوريات المزاد الخاص"],
            ["remove-mzad2-type", "حذف نوع مزاد ثاني"],
        ],
    },
    exchange: {
        label: "أوامـر تـبـادل والـرتـب الـشرائـيه",
        emoji: "<a:by_noobot:1500777759348097184>",
        commands: [["exchange-setup", "إعدادات نظام التبادل"],
                     ["add-roles", "إضافة رتبة للبيع"],
            ["remove-roles", "حذف رتبة"],
            ["list-roles", "عرض قائمة الرتب"]
         ],
    },
    owner1: {
        label: "أوامر التـسطـيـب والـبـانـلات",
        emoji: "<a:by_noobot:1500772294031839242>",
        commands: [
            ["setup", "اعداد البوت بسيرفرك"],
            ["setup-images", "تعديل انفوهات وصور السيرفر"],
            ["setup-prices", "تعديل الأسعار في السيرفر"],
            ["setup-auto-reset", "إعداد ريست المنشن"],
            ["edit-auto-reset", "تعديل إعدادات ريست المنشن"],
            ["setup-words", "إعداد نظام الكلمات الممنوعة"],
            ["add-word", "إضافة كلمة ممنوعة"],
            ["list-words", "عرض الكلمات الممنوعة"],
            ["price-panel", "ارسال بانل الاسعار"],
            ["buy-panel", "ارسال قسم الشراء"],
            ["order-panel", "ارسال قسم شراء طلبات"],
            ["shop-panel", "ارسال قسم شراء متاجر"],
            ["auction-panel", "ارسال قسم شراء مزاد"],
            ["mzad2-panel", "إرسال بانل شراء مزاد خاص"],
            ["panel-rules", "إرسال بانل القوانين"],
            ["panel-tickets", "إرسال بانل التكتات"],
            ["all-for-panel", "إرسال بانل شامل"],
            ["panel-support", "إرسال بانل الدعم"],
            ["add-rule", "إضافة قانون جديد"],
            ["send-rule", "إرسال قانون"],
            ["remove-rule", "حذف قانون"],
            ["add-tax-channel", "اضافة روم لرومات الضرائب"],
            ["remove-tax-channel", "ازالة روم لرومات الضرائب"],
            ["show-tax-channels", "لإظهار رومات الضرائب المسجلة"],
            ["add-emoji-channel", "اضافة روم لرومات ايموجي"],
        ],
    },
    owner2: {
        label: "أوامر اضـافـيه",
        emoji: "<a:by_noobot:1500772054327230607>",
        commands: [
            ["remove-emoji-channel", "ازالة روم لرومات ايموجي"],
            ["show-emoji-channels", "اظهار رومات الايموجي"],
            ["add-sticker-channel", "اضافة روم لرومات ستيكر"],
            ["remove-sticker-channel", "حذف روم ستيكر"],
            ["show-sticker-channels", "اظهار رومات الاستيكر"],
            ["reset", "حذف جميع البيانات"],
            ["اختصارت", "اعداد الاختصارات"],
        ],
    },
    admin: {
        label: "أوامر الإدارة",
        emoji: "<a:settings:1475940624392913011>",
        commands: [
            ["report", "لإرسال بلاغ لصاحب البوت"],
            ["tax", "لمعرفة الضريبة لعدد ما"],
            ["afk", "لتفعيل وضع الخمول"],
            ["ping", "لرؤية سرعة استجابة البوت"],
            ["send-tashfeer", "رسالة التشفير"],
            ["come", "استدعاء عضو"],
            ["say-emabed", "ارسال رسالة بايمبد"],
            ["add-autoreply", "اضافة رد تلقائي"],
            ["remove-autoreply", "حذف رد تلقائي"],
            ["list-autoreplies", "اظهار الردود التلقائية"],
            ["نقاطي", "اعرض نقاط التكتات"],
            ["توب-نقاط", "أعلى المسؤولين نقاطاً"],
        ],
    },
};

// الرسالة الرئيسية الثابتة (تبقى كما هي، ما تتعدل أبداً)
function buildMainHelpContainer(guild) {
    const color = _ec.color(guild.id); // بدّلها بدالة اللون المستخدمة عندك لو مختلفة
    const banner = guild.bannerURL({ size: 1024, extension: "png" });
    const container = new ContainerBuilder().setAccentColor(color);

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`# <a:by_noobot:1500777755405455381> قائمة أوامر ${guild.name}`),
    );
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    if (banner) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(banner)),
        );
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    }

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            "اختر قسم الأوامر من القائمة بالأسفل \n-# سـطـب الـبـوت /setup اي مـشـكـلـه ارسـلـها خـاص الـبـوت او خـاصـي",
        ),
    );
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# ${guild.name} | Dev : .onlyzain `),
    );

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("help_select_menu")
        .setPlaceholder(" اختر قسم الأوامر")
        .addOptions(
            Object.entries(HELP_CATEGORIES).map(([key, cat]) => ({
                label: cat.label,
                value: key,
                emoji: cat.emoji,
            })),
        );

    container.addActionRowComponents(new ActionRowBuilder().addComponents(selectMenu));

    const resetRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("help_reset_select")
            .setEmoji("🔄")
            .setStyle(ButtonStyle.Secondary),
    );
    container.addActionRowComponents(resetRow);

    return container;
}

// الرد المخفي لكل قسم (يُرسل كرسالة إفميرال منفصلة عند الاختيار)
function buildCategoryContainer(guild, selectedKey) {
    const color = _ec.color(guild.id);
    const cat = HELP_CATEGORIES[selectedKey];
    const container = new ContainerBuilder().setAccentColor(color);

    const list = cat.commands.map(([name, desc]) => `\`/${name}\` — ${desc}`).join("\n");
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${cat.emoji} ${cat.label}\n${list}`),
    );
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# ${guild.name} |  By : .onlyzain`),
    );

    return container;
}

// ========== +help ==========
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (message.content.trim() !== "help") return;

    const mainContainer = buildMainHelpContainer(message.guild);
    const helpMsg = await message.reply({
        components: [mainContainer],
        flags: MessageFlags.IsComponentsV2,
    });

    const collector = helpMsg.createMessageComponentCollector({
        filter: (i) => i.customId === "help_select_menu" || i.customId === "help_reset_select",
        time: 300000, // 5 دقايق
    });

    collector.on("collect", async (i) => {
        // زر إعادة تحميل/تصفير السلكت
        if (i.customId === "help_reset_select") {
            const freshContainer = buildMainHelpContainer(message.guild);
            await i.update({
                components: [freshContainer],
                flags: MessageFlags.IsComponentsV2,
            });
            return;
        }

        // اختيار قسم من السلكت
        const selectedKey = i.values[0];
        const categoryContainer = buildCategoryContainer(message.guild, selectedKey);
        // رد مخفي جديد بدل تعديل الرسالة الأصلية
        await i.reply({
            components: [categoryContainer],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    });

    collector.on("end", async () => {
        const disabledMain = buildMainHelpContainer(message.guild);
        // تعطيل آخر صفين (السلكت وزر إعادة التحميل) بعد انتهاء الوقت
        const rows = disabledMain.components.slice(-2);
        for (const row of rows) {
            row?.components?.forEach((c) => c.setDisabled?.(true));
        }
        await helpMsg
            .edit({ components: [disabledMain], flags: MessageFlags.IsComponentsV2 })
            .catch(() => {});
    });
});
// ========== +help ==========

    //////////////////////////////////////////////shop
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.guild) return; // ✅ أضف هذا السطر

    const guildId = interaction.guild.id;
    const serverColor = _ec.color(guildId);
    const linePreview = await db.get(`image_${guildId}`);
    //==============================================================================
    // 1. تـفـاعـل عـرض قـائـمـة أنـواع الـمـتـاجـر (shoppri)
    //==============================================================================
    if (interaction.customId === "shoppri") {
        // ✅ تأجيل الرد فوراً عشان ما ينتهي التفاعل
        await interaction.deferReply({ ephemeral: true });

        try {
            const categories = interaction.guild.channels.cache.filter(
                (c) => c.type === ChannelType.GuildCategory,
            );

            if (!categories.size) {
                return interaction.editReply({
                    content: `**❌ لا تـوجـد انـواع مـتـاجـر فـي هـذا الـسـيـرفـر**`,
                });
            }

            const bank = await db.get(`bank_${guildId}`);
            const buyshopimage = await db.get(`buyshopimage_${guildId}`);

            const buttons = [];
            for (const [categoryId, category] of categories) {
                const categoryData = await db.get(
                    `categoryMentions_${categoryId}_${guildId}`,
                );
                if (!categoryData) continue;

                buttons.push(
                    new ButtonBuilder()
                        .setCustomId(`select_shop_price_${categoryId}`)
                        .setLabel(categoryData.nametype || "نـوع غـيـر مـحـدد")
                        .setEmoji(emojis.shop || "🛒")
                        .setStyle(ButtonStyle.Secondary),
                );
            }

            if (buttons.length === 0) {
                return interaction.editReply({
                    content: "**❌ لا تـوجـد بـيـانـات مـسـجـلـة لـلأنـواع.**",
                });
            }

            const row = new ActionRowBuilder().addComponents(
                buttons.slice(0, 5),
            );

            // ✅ Container v2
            const container = new ContainerBuilder()
                .setAccentColor(serverColor)
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# أسـعـار الـمـتـاجـر الـحـالـيـة`)
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(
                            `أسـعـار الـمـتـاجـر فـي ${interaction.guild.name}\n\n` +
                            `يـرجــى اخـتـيـار الـنــوع الـذي تـرغـب فــي مـعـرفــة سـعـره و مـواصــفـاتــه مـن الأزرار أد نـاه.\n\n` +
                            `**الـتـحـو يـل لـحـسـاب الـبـنـك:** <@!${bank || "غـيـر مـحـدد"}>`
                        )
                );

            const imageToUse = buyshopimage || linePreview;
            if (imageToUse) {
                container.addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                );
                container.addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(
                        new MediaGalleryItemBuilder().setURL(imageToUse)
                    )
                );
            }

            container.addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
            );
            container.addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`-# ${interaction.guild.name} | نـظـام الـمـتـاجـر`)
            );

            container.addActionRowComponents(row);

            await interaction.editReply({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
            });

        } catch (error) {
            console.error("Error in shoppri button:", error);
            if (interaction.deferred) {
                await interaction.editReply({
                    content: "❌ حدث خطأ أثناء جلب البيانات.",
                });
            } else {
                await interaction.reply({
                    content: "❌ حدث خطأ أثناء جلب البيانات.",
                    ephemeral: true,
                });
            }
        }
    }

    //==============================================================================
    // 2. تـفـاعـل عـرض تـفـاصـيـل الـسـعـر لـلـنـوع الـمـحـدد
    //==============================================================================
    if (interaction.customId.startsWith("select_shop_price_")) {
        // ✅ تأجيل الرد فوراً
        await interaction.deferReply({ ephemeral: true });

        try {
            const categoryId = interaction.customId.split("_")[3];
            const categoryData = await db.get(
                `categoryMentions_${categoryId}_${guildId}`,
            );

            if (!categoryData) {
                return interaction.editReply({
                    content: "❌ عـفـواً، لـم يـتـم الـعـثـور عـلـى بـيـانـات هـذا الـنـوع.",
                });
            }

            const {
                shopPrice: pric,
                shoprole,
                hasTax,
                taxPrice,
                everyoneMentions: evcount,
                hereMentions: hecount,
                shopmen,
                maxWarns,
                shopRoleMentions: shcount,
                nametype,
            } = categoryData;
            const shopPrice = Math.floor(pric * (20 / 19) + 1);
            const bank = await db.get(`bank_${guildId}`);
            const buyshopimage = await db.get(`buyshopimage_${guildId}`);

            if (!pric) {
                return interaction.editReply({
                    content: "❌ عـفـواً، لـم أسـتـطـع الـعـثـور عـلـى سـعـر لـهـذا الـنـوع.",
                });
            }

            const detailContainer = new ContainerBuilder()
                .setAccentColor(serverColor)
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# تـفـاصـيـل الـنـوع: ${nametype || "غـيـر مـحـدد"}`)
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(
                            ED.shopInteractions_002({
                                bank,
                                config,
                                evcount,
                                hasTax,
                                hecount,
                                maxWarns,
                                nametype,
                                shcount,
                                shopPrice,
                                shopmen,
                                shoprole,
                                taxPrice,
                            })
                        )
                );

            const imageToUse = buyshopimage || linePreview;
            if (imageToUse) {
                detailContainer.addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                );
                detailContainer.addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(
                        new MediaGalleryItemBuilder().setURL(imageToUse)
                    )
                );
            }

            detailContainer.addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
            );
            detailContainer.addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`-# ${interaction.guild.name} | نـظـام الـمـتـاجـر`)
            );

            await interaction.editReply({
                components: [detailContainer],
                flags: MessageFlags.IsComponentsV2,
            });

        } catch (error) {
            console.error("Error in select_shop_price button:", error);
            if (interaction.deferred) {
                await interaction.editReply({
                    content: "❌ حدث خطأ أثناء جلب التفاصيل.",
                });
            } else {
                await interaction.reply({
                    content: "❌ حدث خطأ أثناء جلب التفاصيل.",
                    ephemeral: true,
                });
            }
        }
    }
});
    
    // 1. قائمة التشفير الشاملة بنمط (ـ,ـ) وبدون مسافات
const replacements = {
    // القديمة
    "باونتي": "بـ,ـاونـ,ـتي", 
    "لعبه": "لـ,ـ3ـ,ـبة", 
    "ماب": "مـ,ـاب", 
    "يوزر": "يـ,ـوزر", 
    "خاص": "خـ,ـ1ص", 
    "العاب": "الـ,ـ3ـ,ـاب",
    "سعركم": "سـ,ـ3ـ,ـركم", 
    "كريديت": "كـ,ـريدـ,ـت", 
    "يوزرات": "يـ,ـوزرات", 
    "تواصل": "تـ,ـواصل", 
    "موجود": "مـ,ـوجـ,ـود", 
    "ضمان": "ضـ,ـمان", 
    "طلبات": "طـ,ـلبـ,ـات", 
    "طلب": "طـ,ـلب", 
    "ميزانيه": "مـ,ـيزاـ,ـنيه", 
    "سعرك": "سـ,ـ3ـ,ـرك", 
    "تصاميم": "تـ,ـصاـ,ـميم", 
    "تصميم": "تـ,ـصمـ,ـيم",
    "روبوكس": "روبـ,ـوكـس", 
    "نتفلكس": "نـ,ـتفـ,ـلكـس", 
    "شاهد": "شـ,ـ1هـ,ـد", 
    "بلوكس": "بـ,ـلوكـس", 
    "ديسكورد": "ديـ,ـسكـ,ـورد", 
    "فيزا": "فـ,ـيز1", 
    "نيترو": "نـ,ـيتـ,ـرو", 
    "اسيا": "1سـ,ـيا", 
    "عملات": "عـ,ـمـ,ـلات", 
    "دولار": "دولـ,ـ1ر", 
    "رصيد": "رصـ,ـيد", 
    "شوب": "شـ,ـوب", 
    "بيع": "بـ,ـيـ,ـع", 
    "شراء": "شـ,ـر1ء", 
    "تبادل": "تـ,ـبـ,ـ1دل", 
    "تبديل": "تـ,ـبديـ,ـل", 
    "عروضكم": "عـ,ـروضـ,ـكم", 
    "عروض": "عـ,ـروض", 
    "متوفر": "مـ,ـتـ,ـوفـ,ـر", 
    "مطلوب": "مـ,ـطـ,ـل9ب", 
    "دفع": "دـ,ـفـ,ـ9", 
    "تحويل": "تـ,ـحـ,ـويـ,ـل", 
    "سوم": "سـ,ـوم", 
    "شارة": "شـ,ـ1رة", 
    "انستقرام": "انـ,ـسـ,ـتـ,ـقـ,ـرام", 
    "كمية": "كـ,ـميـ,ـة", 
    "سريع": "سـ,ـريـ,ـ9",
    "كردت": "كـ,ـردت",
    "عرض": "عـ,ـرض",
    "عرضك": "عـ,ـرضـ,ـك",
    "فلوس": "فـ,ـلـ,ـوس",
    "قارما": "قـ,ـ1رمـ,ـا",
    "سعر": "سـ,ـ3ـ,ـر",
    "تبدخاص": "تـ,ـبدـ,ـخـ,ـ1ص",
    "اطلب": "اطـ,ـلب",
    "مقابل": "مـ,ـقـ,ـ1بـ,ـل",
    "تجار": "تـ,ـجـ,ـ1ر",
    "اوفر": "اوفـ,ـر",
    "متجر": "مـ,ـتـ,ـجر",

    // الجديدة - متجر
    "متجري": "مـ,ـتـ,ـجـ,ـري",
    "متجرها": "مـ,ـتـ,ـجـ,ـرهـ,ـا",
    "متجره": "مـ,ـتـ,ـجـ,ـره",
    "متجرك": "مـ,ـتـ,ـجـ,ـرك",
    "متجركم": "مـ,ـتـ,ـجـ,ـركـ,ـم",
    "متجرهم": "مـ,ـتـ,ـجـ,ـرهـ,ـم",
    "متجرنا": "مـ,ـتـ,ـجـ,ـرنـ,ـا",

    // عرض
    "عرضي": "عـ,ـرضـ,ـي",
    "عرضكم": "عـ,ـرضـ,ـكم",
    "عرضهم": "عـ,ـرضـ,ـهـ,ـم",
    "عرضنا": "عـ,ـرضـ,ـنـ,ـا",

    // عروض
    "عروضي": "عـ,ـروضـ,ـي",
    "عروضك": "عـ,ـروضـ,ـك",
    "عروضهم": "عـ,ـروضـ,ـهـ,ـم",
    "عروضنا": "عـ,ـروضـ,ـنـ,ـا",

    // حساب
    "حساب": "حـ,ـسـ,ـ1ب",
    "حسابي": "حـ,ـسـ,ـ1بـ,ـي",
    "حسابك": "حـ,ـسـ,ـ1بـ,ـك",
    "حسابكم": "حـ,ـسـ,ـ1بـ,ـكـ,ـم",
    "حسابهم": "حـ,ـسـ,ـ1بـ,ـهـ,ـم",
    "حسابنا": "حـ,ـسـ,ـ1بـ,ـنـ,ـا",
    "حسابات": "حـ,ـسـ,ـ1بـ,ـ1ت",
    "حساباتي": "حـ,ـسـ,ـ1بـ,ـ1تـ,ـي",
    "حساباتك": "حـ,ـسـ,ـ1بـ,ـ1تـ,ـك",
    "حساباتكم": "حـ,ـسـ,ـ1بـ,ـ1تـ,ـكـ,ـم",
    "حساباتهم": "حـ,ـسـ,ـ1بـ,ـ1تـ,ـهـ,ـم",
    "حساباتنا": "حـ,ـسـ,ـ1بـ,ـ1تـ,ـنـ,ـا",

    // متوفر
    "متوفري": "مـ,ـتـ,ـوفـ,ـري",
    "متوفرها": "مـ,ـتـ,ـوفـ,ـرهـ,ـا",
    "متوفره": "مـ,ـتـ,ـوفـ,ـره",
    "متوفرك": "مـ,ـتـ,ـوفـ,ـرك",
    "متوفركم": "مـ,ـتـ,ـوفـ,ـركـ,ـم",
    "متوفرهم": "مـ,ـتـ,ـوفـ,ـرهـ,ـم",
    "متوفرنا": "مـ,ـتـ,ـوفـ,ـرنـ,ـا",

    // شوب
    "شوبك": "شـ,ـوبـ,ـك",
    "شوبكم": "شـ,ـوبـ,ـكـ,ـم",
    "شوبهم": "شـ,ـوبـ,ـهـ,ـم",
    "شوبنا": "شـ,ـوبـ,ـنـ,ـا",

    // اوفر
    "اوفرها": "اوفـ,ـرهـ,ـا",
    "اوفره": "اوفـ,ـره",
    "اوفرك": "اوفـ,ـرك",
    "اوف ركم": "اوفـ,ـركـ,ـم",
    "اوفرهم": "اوفـ,ـرهـ,ـم",
    "اوفرنا": "اوفـ,ـرنـ,ـا",

    // بيع
    "بيعي": "بـ,ـيـ,ـعـ,ـي",
    "بيعك": "بـ,ـيـ,ـعـ,ـك",
    "بيعكم": "بـ,ـيـ,ـعـ,ـكـ,ـم",
    "بيعهم": "بـ,ـيـ,ـعـ,ـهـ,ـم",
    "بيعنا": "بـ,ـيـ,ـعـ,ـنـ,ـا",
    "للبيع": "لـ,ـلـ,ـبـ,ـيـ,ـع",
    "للبيعي": "لـ,ـلـ,ـبـ,ـيـ,ـعـ,ـي",
    "للبيعك": "لـ,ـلـ,ـبـ,ـيـ,ـعـ,ـك",
    "للبيعكم": "لـ,ـلـ,ـبـ,ـيـ,ـعـ,ـكـ,ـم",
    "للبيعهم": "لـ,ـلـ,ـبـ,ـيـ,ـعـ,ـهـ,ـم",
    "للبيعنا": "لـ,ـلـ,ـبـ,ـيـ,ـعـ,ـنـ,ـا",
    "ابيع": "ابـ,ـيـ,ـع",
    "ابيعك": "ابـ,ـيـ,ـعـ,ـك",
    "ابيعكم": "ابـ,ـيـ,ـعـ,ـكـ,ـم",
    "ابيعهم": "ابـ,ـيـ,ـعـ,ـهـ,ـم",
    "ابيعنا": "ابـ,ـيـ,ـعـ,ـنـ,ـا",

    // بوست
    "بوست": "بـ,ـوسـ,ـت",
    "بوستك": "بـ,ـوسـ,ـتـ,ـك",
    "بوستكم": "بـ,ـوسـ,ـتـ,ـكـ,ـم",
    "بوستهم": "بـ,ـوسـ,ـتـ,ـهـ,ـم",
    "بوستنا": "بـ,ـوسـ,ـتـ,ـنـ,ـا",

    // نيترو
    "نيتروك": "نـ,ـيتـ,ـروك",
    "نيتروكم": "نـ,ـيتـ,ـروكـ,ـم",
    "نيتروهم": "نـ,ـيتـ,ـروهـ,ـم",
    "نيترونا": "نـ,ـيتـ,ـرونـ,ـا",

    // روبكس
    "روبكس": "روبـ,ـكـس",
    "روبكسك": "روبـ,ـكـسـ,ـك",
    "روبكسكم": "روبـ,ـكـسـ,ـكـ,ـم",
    "روبكسهم": "روبـ,ـكـسـ,ـهـ,ـم",
    "روبكسنا": "روبـ,ـكـسـ,ـنـ,ـا",

    // سعر
    "سعري": "سـ,ـ3ـ,ـري",
    "سعرها": "سـ,ـ3ـ,ـرهـ,ـا",
    "سعره": "سـ,ـ3ـ,ـره",
    "سعرهم": "سـ,ـ3ـ,ـرهـ,ـم",
    "سعرنا": "سـ,ـ3ـ,ـرنـ,ـا",
"كريدت":"كـ,ريـ,دت",
    // تبدخاص
    "تبدخاصك": "تـ,ـبدـ,ـخـ,ـ1صـ,ـك",
    "تبدخاصكم": "تـ,ـبدـ,ـخـ,ـ1صـ,ـكـ,ـم",
    "تبدخاصهم": "تـ,ـبدـ,ـخـ,ـ1صـ,ـهـ,ـم",
    "تبدخاصنا": "تـ,ـبدـ,ـخـ,ـ1صـ,ـنـ,ـا",

    // مطلوب
    "مطلوبة": "مـ,ـطـ,ـل9بـ,ـة",
    "مطلوبك": "مـ,ـطـ,ـل9بـ,ـك",
    "مطلوبكم": "مـ,ـطـ,ـل9بـ,ـكـ,ـم",
    "مطلوبهم": "مـ,ـطـ,ـل9بـ,ـهـ,ـم",
    "مطلوبنا": "مـ,ـطـ,ـل9بـ,ـنـ,ـا",

    // اطلب
    "اطلبك": "اطـ,ـلبـ,ـك",
    "اطلبكم": "اطـ,ـلبـ,ـكـ,ـم",
    "اطلبهم": "اطـ,ـلبـ,ـهـ,ـم",
    "اطلبنا": "اطـ,ـلبـ,ـنـ,ـا",

    // كريدت
    "كريدة": "كـ,ـريـ,ـدة",
};
client.on("interactionCreate", async (interaction) => {
    if (!interaction.guild) return;
    const guildId = interaction.guild.id;
    const serverColor = _ec.color(guildId);
    const linePreview = await db.get('image_' + guildId);

    // --- زر tashfeerk ---
    if (interaction.isButton() && interaction.customId === "tashfeerk") {
        const modal = new ModalBuilder()
            .setCustomId("encryptModal")
            .setTitle("🔒 تـشـفـيـر الـرسـالـة");

        const textInput = new TextInputBuilder()
            .setCustomId("messageInput")
            .setLabel("اكـتـب رسـالـتـك هـنـا:")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(textInput));
        await interaction.showModal(modal);
    }

    // --- مـعـالـجـة إرسـال الـمـود ل ---
    if (interaction.isModalSubmit() && interaction.customId === "encryptModal") {
        const text = interaction.fields.getTextInputValue("messageInput");

        let encodedText = text;
        // تـرتـيـب الـكـلـمـات مـن الأطـول لـلأقـصـر لـضـمـان الـدقـة
        const sortedKeys = Object.keys(replacements).sort((a, b) => b.length - a.length);
        
        sortedKeys.forEach(original => {
            const regex = new RegExp(original, "gi"); 
            encodedText = encodedText.replace(regex, replacements[original]);
        });

        const copyButton = new ButtonBuilder()
            .setCustomId("copyMessage")
            .setLabel("🖥️")
            .setStyle(ButtonStyle.Secondary);

        const resultEmbed = new EmbedBuilder()
            .setTitle("تـم الـتـشـفـيـر بـنـجـاح")
            .setDescription(`${encodedText}`)
            .setColor(serverColor)
            .setTimestamp();

        if (linePreview) resultEmbed.setImage(linePreview);

        await interaction.reply({
            embeds: [resultEmbed],
            components: [new ActionRowBuilder().addComponents(copyButton)],
            ephemeral: true,
        });
        
        await db.set('temp_encrypt_' + interaction.user.id, encodedText);
    }

    // --- زر الـنـسـخ ---
    if (interaction.isButton() && interaction.customId === "copyMessage") {
        const savedText = await db.get('temp_encrypt_' + interaction.user.id);
        
        await interaction.reply({
            content: `\`\`\`\n${savedText || "انـتـهـت الـبـيـانـات"}\n\`\`\``,
            ephemeral: true,
        });
    }
});//==============================================================================
    // أمـر تـصـفـيـة الـد اتـا وحـذف روم الـتـكـت
    //==============================================================================
client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    if (message.content === "!داتا") {
        const guildId = message.guild.id;
        const channel = message.channel;

        // البحث عن صاحب التكت من الداتابيس
        const shopMeta = await db.get(`shop_ticket_channel_${channel.id}`);
        const auctionMeta = await db.get(`auction_ticket_channel_${channel.id}`);
        const orderMeta = await db.get(`order_ticket_channel_${channel.id}`);
        const rolesMeta = await db.get(`roles_ticket_channel_${channel.id}`);
        const supportMeta = await db.get(`support_ticket_ch_${channel.id}`);

        const ticketMeta = shopMeta || auctionMeta || orderMeta || rolesMeta || supportMeta;
        if (!ticketMeta) return message.reply("هذه القناة ليست تذكرة.");

        const ownerId = ticketMeta.ownerId || ticketMeta.userId;
        if (!ownerId) return message.reply("لم يتم العثور على صاحب التذكرة.");

        // حذف بيانات المتاجر
        if (shopMeta) {
            await db.delete(`shop_ticket_${ownerId}_${guildId}`);
            await db.delete(`shop_ticket_channel_${channel.id}`);
            await db.delete(`shop_credit_${ownerId}_${guildId}`);
        }

        // حذف بيانات المزاد
        if (auctionMeta) {
            await db.delete(`auction_ticket_${ownerId}_${guildId}`);
            await db.delete(`auction_ticket_channel_${channel.id}`);
            await db.delete(`auction_credit_${ownerId}_${guildId}`);
            await db.delete(`auction_draft_${ownerId}_${guildId}`);
        }

        // حذف بيانات الطلبات
        if (orderMeta) {
            await db.delete(`order_ticket_${ownerId}_${guildId}`);
            await db.delete(`order_ticket_channel_${channel.id}`);
            await db.delete(`order_credit_${ownerId}_${guildId}`);
        }

        // حذف بيانات الرتب
        if (rolesMeta) {
            await db.delete(`roles_ticket_${ownerId}_${guildId}`);
            await db.delete(`roles_ticket_channel_${channel.id}`);
        }

        // حذف بيانات الدعم/التشهير
        if (supportMeta) {
            const dbKey = supportMeta.dbKey || `support_ticket_${ownerId}_${guildId}`;
            await db.delete(dbKey);
            await db.delete(`support_ticket_ch_${channel.id}`);
        }

        await message.channel.send(`تم حذف بيانات <@${ownerId}> بنجاح. سيتم إغلاق التكت...`);
        setTimeout(() => channel.delete().catch(() => {}), 3000);
    }
});
    //==============================================================================
    // 1. تـفـاعـل فـتـح تـكـت شـراء مـتـجـر (buy_shop) - Container v2
    //==============================================================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
    if (!interaction.guild) return; // ✅ أضف هذا السطر

    const guildId = _ec.gid(interaction);
    const userId = interaction.user.id;
    const channel = interaction.channel;
    const serverColor = _ec.color(guildId);
    const linePreview = await db.get(`image_${guildId}`);
    const guildIcon = interaction.guild.iconURL({ size: 1024 });
    if (interaction.customId === "buy_shop") {
    const shopcat = await db.get(`catbuy_shop_${guildId}`);
    const adminRoleId = await db.get(`shopad_${guildId}`);
    if (!shopcat || !adminRoleId)
        return interaction.reply({
            content: "❌ يـرجـى تـحـديـد كـتـا غـور ي الـشـراء والـمـسـؤول مـن `/setup`",
            ephemeral: true,
        });

    const shopData = await db.get(`shop_ticket_${userId}_${guildId}`);
    if (shopData && interaction.guild.channels.cache.get(shopData.channelId)) {
        return interaction.reply({
            content: `❌ لـد يـك تـذكـرة مـفـتـوحـة بـالـفـعـل: <#${shopData.channelId}>`,
            ephemeral: true,
        });
    }

    await interaction.deferReply({ ephemeral: true });
    const ticketChannel = await interaction.guild.channels.create({
        name: `shop-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: shopcat,
        permissionOverwrites: [
            { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory] },
            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: adminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
        ],
    });

    await db.set(`shop_ticket_${userId}_${guildId}`, { userId, channelId: ticketChannel.id });
    await db.set(`shop_ticket_channel_${ticketChannel.id}`, { ownerId: userId, guildId });

    const categories = interaction.guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory);
    const buttons = [];
    const priceLines = [];

    for (const [catId, cat] of categories) {
        const catData = await db.get(`categoryMentions_${catId}_${guildId}`);
        if (!catData) continue;
        buttons.push(
            new ButtonBuilder().setCustomId(`select_shop_type_${catId}`).setLabel(catData.nametype).setEmoji(emojis.shop || "🛒").setStyle(ButtonStyle.Secondary),
        );
        const taxStr = catData.hasTax ? ` (مـع ضـر يـبـة: ${Math.floor(catData.shopPrice * (20 / 19) + 1)})` : "";
        priceLines.push(`${config.shopemoji || "•"} **${catData.nametype}:** ${catData.shopPrice || "0"}${taxStr}`);
    }

    const bank = await db.get(`bank_${guildId}`);
    const buyshopimage = await db.get(`buyshopimage_${guildId}`);
    const finalImage = buyshopimage || linePreview || null;

    const container = new ContainerBuilder().setAccentColor(serverColor);
    const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`# تـكـت شـراء مـتـجـر جـد يـد`));
    if (guildIcon) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
    container.addSectionComponents(section);
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${priceLines.length > 0 ? `### أسـعـار الـمـتـاجـر\n${priceLines.join("\n")}\n\n` : ""}الـتـحـو يـل لـحـسـاب الـبـنـك: <@!${bank || "غـيـر مـحـدد"}>`)
    );
    if (finalImage) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(finalImage)));
    }
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${interaction.guild.name} | نـظـام الـمـتـاجـر`));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`<@${userId}> <@&${adminRoleId}>`));

    // جميع الأزرار داخل Container
    const allRows = [];
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("closeshop").setLabel("إغـلاق الـتـكـت").setStyle(ButtonStyle.Secondary).setEmoji(emojis.close || "🔒"),
        new ButtonBuilder().setCustomId("shoppri").setLabel("الأسـعـار").setStyle(ButtonStyle.Secondary).setEmoji(emojis.shop || "💰"),
    );
    container.addActionRowComponents(row1);

    for (let i = 0; i < buttons.length; i += 5) {
        container.addActionRowComponents(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }

    await ticketChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });

    await interaction.editReply({ content: `✅ **تـم إنـشـاء تـذكـرتـك بـنـجـاح:** <#${ticketChannel.id}>` });
}
    //==============================================================================
    // select_shop_type_ (نفسها)
    //==============================================================================
    if (interaction.customId.startsWith("select_shop_type_")) {
        const categoryId = interaction.customId.split("_")[3];
        const categoryData = await db.get(`categoryMentions_${categoryId}_${guildId}`);
        const shopPrice = categoryData.shopPrice;

        if (!shopPrice) { await interaction.reply({ content: "عفوا لم استطع العثور على سعر نوع هاذا المتجر", ephemeral: true }); return; }

        const bank = await db.get(`bank_${guildId}`);
        if (!bank) { await interaction.reply({ content: "يرجى تحديد البنك عن طريق استخدام الامر الاتي: /setup", ephemeral: true }); return; }

        const data = await db.get(`shop_credit_${userId}_${guildId}`);
        if (data) return await interaction.reply({ content: `** يـوجد لـديـك عـمـلـيـة شــراء فـ الـوقـت الحـالـي بـ الفـعـل **`, ephemeral: true });

        const datauser = await db.get(`shop_ticket_${interaction.member.id}_${guildId}.userId`);
        if (datauser !== interaction.user.id) return await interaction.reply({ content: `**يمكن ل صاحب التكت فقط استعمال الازرار**`, ephemeral: true });

        try {
            const totalPrice = Math.floor(shopPrice * (20 / 19) + 1);
            await interaction.reply({ content: `**يرجى التحويل  \` السعر مع الضريبة: ${totalPrice} \`**`, ephemeral: true });
            await interaction.channel.send(`#credit <@!${bank}> ${totalPrice}`);
            await interaction.channel.send(`\`\`\`#credit ${bank} ${totalPrice}\`\`\``);
            await interaction.channel.send(` . \` يرجى التحويل في أسرع وقت ممكن هنا\` <@!${userId}>`);
            await db.set(`shop_credit_${userId}_${guildId}`, userId);

            const bankBotId = "282859044593598464";
            const collector = interaction.channel.createMessageCollector({ filter: (m) => m.author.id === bankBotId, time: 120000 });

            collector.on("collect", async (c) => {
                const content = c.content;
                let paidAmount = 0;
                const btMatch = content.match(/`\$?([\d,]+(?:\.\d+)?)`/);
                const engMatch = content.match(/transferred\s+\$?([\d,]+)/i);
                const arMatch = content.match(/بتحويل\s+\$?([\d,]+)/);
                const found = btMatch || engMatch || arMatch;
                if (found) paidAmount = Number(found[1].replace(/,/g, ""));
                const bankMentionOk = content.includes(`<@!${bank}>`) || content.includes(`<@${bank}>`);
                const isTransfer = content.includes("has transferred") || content.includes("قام بتحويل");
                if (isTransfer && bankMentionOk && paidAmount >= shopPrice) collector.stop("DONE");
            });

            collector.on("end", async (collected, reason) => {
                if (reason !== "DONE") {
                    await db.delete(`shop_credit_${userId}_${guildId}`);
                    try { await interaction.channel.send(`**⏰ انتهى وقت التحقق من التحويل. <@${userId}> يرجى إعادة المحاولة أو التواصل مع الإدارة.**`); await interaction.channel.send("**🔒 سيتم إغلاق التكت تلقائياً خلال 10 ثواني...**"); setTimeout(async () => { try { await interaction.channel.delete(); } catch {} }, 10000); } catch {} return;
                }

                await interaction.channel.send({ content: `**تم التحقق من التحويل بنجاح. يرجى ارسال اسم المتجر.**` });

                const collectedMessages = await interaction.channel.awaitMessages({ filter: (m) => m.author.id === interaction.user.id, max: 1, time: 300000, errors: ["time"] });
                if (collectedMessages.size > 0) {
                    const userMessage = collectedMessages.first().content;
                    const createConfirmRow = () => new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("confirm_yes_shop").setLabel("نعم").setStyle(ButtonStyle.Success).setEmoji(emojis.yes), new ButtonBuilder().setCustomId("edit_name_shop").setLabel("تعديل الاسم").setStyle(ButtonStyle.Primary).setEmoji("✏️"));
                    const validateName = (name) => { if (name.length > 100) return { valid: false, message: "**هد شوي اسم المتجر كبير ._.**" }; const lr = /\b((https?:\/\/|www\.)[^\s]+(?:\.[a-z]{2,}|\/[^\s]*)?|https?:\/\/(?:discord\.gg|discord\.com\/invite|discord\.com\/channels\/[0-9]+\/[0-9]+\/[0-9]+))/gi; if (lr.test(name)) return { valid: false, message: "**⚠️ لا يُسمح بإضافة روابط .**" }; return { valid: true }; };
                    const iv = validateName(userMessage); if (!iv.valid) return await interaction.channel.send({ content: iv.message });

                    const showConfirmMessage = async (shopName) => await interaction.channel.send({ content: `**يرجــى التأكيد, اسم المتجر هو**\n${shopName}`, components: [createConfirmRow()] });
                    let confirmMessage = await showConfirmMessage(userMessage);

                    const createConfirmCollector = (message, currentShopName) => {
                        const cc = message.createMessageComponentCollector({ filter: (i) => i.user.id === userId, time: 60000 });
                        cc.on("collect", async (i) => {
                            const to = await db.get(`shop_ticket_${interaction.member.id}_${guildId}.userId`);
                            if (to !== interaction.user.id) return await i.reply({ content: `**يمكن لصاحب التكت فقط استعمال الأزرار**`, ephemeral: true });

                            if (i.customId === "confirm_yes_shop") {
                                await i.deferUpdate(); cc.stop();
                                const name = currentShopName.replaceAll(" ", "・");
                                const pirefix = categoryData.pirefix;
                                const admin = await db.get(`shopad_${guildId}`);
                                const newChannel = await i.guild.channels.create({ name: `${pirefix}${name}`, type: ChannelType.GuildText, parent: categoryId, permissionOverwrites: [{ id: i.guild.id, deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }, { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.MentionEveryone, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.UseExternalEmojis, PermissionFlagsBits.ReadMessageHistory] }, { id: admin, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.MentionEveryone, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.UseExternalEmojis, PermissionFlagsBits.ReadMessageHistory] }] });
                                const ob = { channelId: newChannel.id, categoryId, sellerId: i.user.id, everyoneMentions: categoryData.everyoneMentions, hereMentions: categoryData.hereMentions, shopmen: categoryData.shopmen, shoprole: categoryData.shoprole, shopRoleMentions: categoryData.shopRoleMentions, maxWarns: categoryData.maxWarns, date: `<t:${parseInt(Date.now() / 1000)}:R>`, taxPrice: categoryData.taxPrice, hasTax: categoryData.hasTax, nametype: categoryData.nametype, pirefix, shopname: currentShopName };
                                await db.set(`shop_${newChannel.id}_${guildId}`, ob); await db.set(`shop_${newChannel.id}_${guildId}.warns`, "0"); await db.set(`shop_${newChannel.id}_${guildId}.status`, "1"); await db.delete(`shop_credit_${userId}_${guildId}`);
                                const em5 = new EmbedBuilder().setTitle("**تم انشاء متجر : **").setDescription(ED.shopInteractions_003({ categoryData, channel: newChannel, config, i })).setAuthor({ name: i.guild.name, iconURL: i.guild.iconURL({ size: 1024 }) }).setFooter(D.footer(interaction.guild)).setThumbnail(D.thumb(interaction.guild)).setTimestamp().setThumbnail(i.guild.iconURL({ size: 1024 }));
                                const seller = await i.guild.members.fetch(i.user.id);
                                if (categoryData.shoprole) { if (!i.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) await i.channel.send("**عذرا البوت لا يمتلاك الصلاحيات يرجى رفع رتبتي فوق رتبة التاجر و اعطائي الصلاحيات اللازمه..**"); else try { await seller.roles.add(categoryData.shoprole); } catch {} }
                                const guildName = interaction.guild.name;
                                const invoiceEmbed = new EmbedBuilder().setTitle("- فاتورة الشراء -").setDescription(ED.shopInteractions_004({ bank, channel: newChannel, config, guildName, i, shopPrice, totalPrice })).setFooter(D.thanksFooter(interaction.guild)).setThumbnail(D.thumb(interaction.guild)).setTimestamp();
                                try { await interaction.user.send({ embeds: [invoiceEmbed] }); } catch { await interaction.channel.send({ content: `<@${i.user.id}> ** فاتورتك (تعذّر إرسالها بـ DM):**`, embeds: [invoiceEmbed] }); }
                                await newChannel.send({ embeds: [em5] });
                                const shopLogId = await db.get(`logs_${guildId}`); if (shopLogId) { const slc = i.guild.channels.cache.get(shopLogId); if (slc) { const sl = new EmbedBuilder().setTitle(" تم إنشاء متجر جديد").setColor(await getColor(guildId, db, config)).addFields({ name: " المتجر", value: `${newChannel}`, inline: true }, { name: " المالك", value: `<@${i.user.id}>`, inline: true }, { name: " النوع", value: categoryData.nametype || "—", inline: true }, { name: " المبلغ المدفوع", value: `${totalPrice}`, inline: true }, { name: " السعر الأصلي", value: `${shopPrice}`, inline: true }).setTimestamp(); await slc.send({ embeds: [sl] }); } }
                                await db.delete(`shop_ticket_channel_${interaction.channel.id}`); await interaction.channel.delete();
                            } else if (i.customId === "edit_name_shop") {
                                await i.deferUpdate(); await confirmMessage.delete().catch(() => {});
                                const askMsg = await interaction.channel.send({ content: `**✏️ ${i.user}, أرسل الاسم الجديد للمتجر الآن**` });
                                try {
                                    const newMsgs = await interaction.channel.awaitMessages({ filter: (m) => m.author.id === i.user.id, max: 1, time: 300000, errors: ["time"] });
                                    const newName = newMsgs.first().content; await askMsg.delete().catch(() => {}); await newMsgs.first().delete().catch(() => {});
                                    const v = validateName(newName); if (!v.valid) { await interaction.channel.send({ content: v.message }); confirmMessage = await showConfirmMessage(currentShopName); createConfirmCollector(confirmMessage, currentShopName); return; }
                                    confirmMessage = await showConfirmMessage(newName); createConfirmCollector(confirmMessage, newName);
                                } catch { await askMsg.delete().catch(() => {}); await interaction.channel.send({ content: `**⏰ انتهى الوقت المحدد لتعديل الاسم**` }); confirmMessage = await showConfirmMessage(currentShopName); createConfirmCollector(confirmMessage, currentShopName); }
                            }
                        });
                        return cc;
                    };
                    createConfirmCollector(confirmMessage, userMessage);
                }
            });
        } catch (error) { console.error("Error handling shop type selection:", error); await interaction.reply({ content: "❌ حدث خطأ أثناء معالجة الطلب. يرجى المحاولة مرة أخرى لاحقًا.", ephemeral: true }); }
    }

    //==============================================================================
    // closeshop
    //==============================================================================
    if (interaction.customId === "closeshop") {
        const shopChannelMeta = await db.get(`shop_ticket_channel_${channel.id}`);
        const shopTicketOwnerId = shopChannelMeta?.ownerId || userId;
        const shopTicketGuildId = shopChannelMeta?.guildId || guildId;
        await db.delete(`shop_credit_${shopTicketOwnerId}_${shopTicketGuildId}`);
        await db.delete(`shop_ticket_${shopTicketOwnerId}_${shopTicketGuildId}`);

        const closingEmbed = new EmbedBuilder().setDescription(ED.shopInteractions_005()).setColor(await getColor(guildId, db, config));
        await interaction.reply({ embeds: [closingEmbed] });

        setTimeout(async () => {
            await channel.permissionOverwrites.edit(guildId, { ViewChannel: false });
            await channel.permissionOverwrites.edit(shopTicketOwnerId, { ViewChannel: false });
            const shopAdminRoleId = await db.get(`shopad_${guildId}`);
            const shopAdminRole = interaction.guild.roles.cache.get(shopAdminRoleId);
            if (shopAdminRole) await channel.permissionOverwrites.edit(shopAdminRole.id, { ViewChannel: true });

            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("reopenshop").setLabel("فتح التذكرة").setStyle(ButtonStyle.Primary).setEmoji(emojis.reopen),
                new ButtonBuilder().setCustomId("deleteshop").setLabel("حذف التذكرة").setStyle(ButtonStyle.Danger).setEmoji(emojis.delete),
            );
            const closedEmbed = new EmbedBuilder().setDescription(ED.shopInteractions_006()).setColor(await getColor(guildId, db, config));
            await interaction.editReply({ embeds: [closedEmbed], components: [actionRow] });
        }, 5000);
    }
    else if (interaction.customId === "reopenshop") {
        const shopAdminRoleId = await db.get(`shopad_${guildId}`);
        const shopAdminRole = interaction.guild.roles.cache.get(shopAdminRoleId);
        const shopReopenMeta = await db.get(`shop_ticket_channel_${channel.id}`);
        const shopReopenOwnerId = shopReopenMeta?.ownerId || userId;

        await channel.permissionOverwrites.set([
            { id: guildId, deny: ["ViewChannel"] },
            { id: shopReopenOwnerId, allow: ["ViewChannel", "SendMessages", "EmbedLinks", "AttachFiles"] },
            { id: shopAdminRole.id, allow: ["ViewChannel", "SendMessages", "MentionEveryone", "EmbedLinks", "AttachFiles"] },
        ]);

        const reopenedEmbed = new EmbedBuilder().setDescription(ED.shopInteractions_007()).setColor(await getColor(guildId, db, config));
        const newActionRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("closeshop").setLabel("إغلاق التذكرة").setStyle(ButtonStyle.Secondary).setEmoji(emojis.close));
        await interaction.reply({ embeds: [reopenedEmbed], components: [newActionRow] });

        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("reopenshop").setLabel("فتح التذكرة").setStyle(ButtonStyle.Primary).setDisabled(true).setEmoji(emojis.reopen),
            new ButtonBuilder().setCustomId("deleteshop").setLabel("حذف التذكرة").setStyle(ButtonStyle.Danger).setDisabled(true).setEmoji(emojis.delete),
        );
        await interaction.message.edit({ components: [disabledRow] });
    }
    else if (interaction.customId === "deleteshop") {
        await db.delete(`shop_ticket_channel_${interaction.channel.id}`);
        await interaction.channel.delete();
    }
});
    // ==========================================
// نظام المزاد كامل (Container v2 + جميع الإصلاحات + منع الروابط)
// ==========================================

// ========== تعريفات منع الروابط ==========
// ============================================
// 1. المتغيرات والدوال المساعدة الأساسية
// ============================================
const linkRegex = /(https?:\/\/[^\s]+)|(discord\.(gg|io|me|li|com\/invite)\/.+)/gi;
const isLink = (text) => linkRegex.test(text);

const auctionTimers = new Map();
const activeAuctions = new Set();

// ============================================
// 2. الدوال الناقصة من الملف الثاني
// ============================================

async function getColor(guildId, _db, _config) {
    const stored = guildId ? await _db.get(`embed_color_${guildId}`) : null;
    const raw = stored || _config?.color || "0x00AE86";
    return parseInt(raw.replace("#", "").replace("0x", ""), 16);
}

function _buildAuctionMsg(draft, rem) {
    const m = Math.floor(rem / 60),
        s = rem % 60;
    return `${draft.mentionType}\nالمزاد\n\nالسلعة: ${draft.itemName}\nالسعر الابتدائي: ${draft.startPrice}\nالضريبة: ${draft.includesTax ? "نعم" : "لا"}\nصاحب المزاد: <@${draft.owner}>\n\nالوقت المتبقي: ${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function _buildControlRow(roomId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pause_auction_${roomId}`).setLabel("توقيف").setStyle(ButtonStyle.Primary).setEmoji(emojis.pause),
        new ButtonBuilder().setCustomId(`resume_auction_${roomId}`).setLabel("استمرار").setStyle(ButtonStyle.Success).setEmoji(emojis.resume),
        new ButtonBuilder().setCustomId(`revive_auction_${roomId}`).setLabel("انعاش").setStyle(ButtonStyle.Secondary).setEmoji(emojis.revive),
        new ButtonBuilder().setCustomId(`extend_auction_${roomId}`).setLabel("تمديد").setStyle(ButtonStyle.Secondary).setEmoji(emojis.extend),
        new ButtonBuilder().setCustomId(`cancel_active_auction_${roomId}`).setLabel("إلغاء").setStyle(ButtonStyle.Danger).setEmoji(emojis.cancelAuction),
    );
}

async function cleanupAuctionRoom(roomChannel) {
    try {
        const messages = await roomChannel.messages.fetch({ limit: 100 });
        const nonPinned = messages.filter(m => !m.pinned);
        if (nonPinned.size > 0) await roomChannel.bulkDelete(nonPinned, true).catch(() => {});
    } catch {}
}

function startAuctionInterval(td, roomId) {
    let dbTick = 0;
    td.interval = setInterval(async () => {
        if (td.paused) return;
        td.remainingTime--;
        dbTick++;

        if (dbTick % 10 === 0) {
            try {
                const snap = await db.get(`active_auction_${roomId}`);
                if (snap)
                    await db.set(`active_auction_${roomId}`, {
                        ...snap,
                        remainingTime: td.remainingTime,
                    });
            } catch {}
        }

        try {
            await td.auctionMsg.edit({
                content: _buildAuctionMsg(td.draft, td.remainingTime),
            });
        } catch {
            clearInterval(td.interval);
            auctionTimers.delete(roomId);
            return;
        }

        if (td.remainingTime === 60 && !td.oneMinuteNoticeSent) {
            td.oneMinuteNoticeSent = true;
            await td.roomChannel.send("**⚠️ سينتهي المزاد بعد دقيقة واحدة.**");
        }

        if (td.remainingTime <= 0) {
            clearInterval(td.interval);
            auctionTimers.delete(roomId);
            await db.delete(`active_auction_${roomId}`);
            try { await td.controlMsg.delete(); } catch {}
            await td.roomChannel.send("**# انتهى وقت المزاد**");
            await sendAuctionLog(td.guild, td.draft, td.guildId, roomId, "ended", null);
            await new Promise((r) => setTimeout(r, 6000));
            await td.roomChannel.permissionOverwrites.edit(td.guild.roles.everyone, { SendMessages: false });
            await td.roomChannel.send(`**__\nيرجى التواصل مع صاحب المزاد\n<@${td.draft.owner}>\nويرجى طلب وسيط لضمان عدم السرقة\n__**`);
        }
    }, 1000);
}

async function sendAuctionLog(guild, draft, guildId, roomId, reason, cancelledBy) {
    try {
        const logsId = await db.get(`logs_${guildId}`);
        if (logsId) {
            const logsChannel = guild.channels.cache.get(logsId);
            if (logsChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle(reason === "ended" ? "✅ انتهى مزاد بنجاح" : "❌ تم إلغاء مزاد")
                    .setColor(await getColor(guildId, db, config))
                    .addFields(
                        { name: "السلعة", value: draft?.itemName || "—", inline: true },
                        { name: "صاحب المزاد", value: draft?.owner ? `<@${draft.owner}>` : "—", inline: true },
                        { name: "السعر المبدئي", value: draft?.startPrice || "—", inline: true },
                        { name: "الضريبة", value: draft?.includesTax ? "نعم" : "لا", inline: true },
                        { name: "المنشن", value: draft?.mentionType || "—", inline: true },
                        { name: "الروم", value: `<#${roomId}>`, inline: true },
                        ...(cancelledBy ? [{ name: "ألغاه", value: `<@${cancelledBy}>`, inline: true }] : []),
                    )
                    .setTimestamp();
                await logsChannel.send({ embeds: [logEmbed] });
            }
        }
        const stats = (await db.get(`auction_stats_${guildId}`)) || { total: 0, ended: 0, cancelled: 0, earnings: 0 };
        stats.total = (stats.total || 0) + 1;
        if (reason === "ended") stats.ended = (stats.ended || 0) + 1;
        else stats.cancelled = (stats.cancelled || 0) + 1;
        if (draft?.paidPrice) stats.earnings = (stats.earnings || 0) + draft.paidPrice;
        await db.set(`auction_stats_${guildId}`, stats);
    } catch (e) {
        console.error("sendAuctionLog error:", e);
    }
}

async function restoreAuctionTimers() {
    try {
        await new Promise((r) => setTimeout(r, 3000));
        const allData = await db.all();
        const activeKeys = allData.filter((e) => e.id && e.id.startsWith("active_auction_"));
        for (const entry of activeKeys) {
            const roomId = entry.id.replace("active_auction_", "");
            const data = entry.value;
            if (!data || !data.draft || !data.guildId) continue;

            const guild = client.guilds.cache.get(data.guildId);
            if (!guild) continue;
            const roomChannel = guild.channels.cache.get(roomId);
            if (!roomChannel) continue;

            const rem = typeof data.remainingTime === "number" ? data.remainingTime : 60;
            if (rem <= 0) {
                await db.delete(`active_auction_${roomId}`);
                continue;
            }

            await roomChannel.send("**🔄 جارٍ استعادة المزاد بعد إعادة تشغيل البوت...**");
            const auctionMsg = await roomChannel.send({
                content: _buildAuctionMsg(data.draft, rem),
            });

            if (data.draft.imageUrl) {
                try {
                    await roomChannel.send({
                        files: [{ attachment: data.draft.imageUrl, name: "auction.png" }],
                    });
                } catch {
                    try {
                        await roomChannel.send(`**صورة السلعة:**\n${data.draft.imageUrl}`);
                    } catch {}
                }
            }

            const controlMsg = await roomChannel.send({
                content: "**— لوحة تحكم المزاد (للمسؤولين فقط) —**",
                components: [_buildControlRow(roomId)],
            });

            await db.set(`active_auction_${roomId}`, {
                ...data,
                remainingTime: rem,
                auctionMsgId: auctionMsg.id,
                controlMsgId: controlMsg.id,
            });

            const td = {
                remainingTime: rem,
                paused: false,
                guild,
                roomChannel,
                draft: data.draft,
                guildId: data.guildId,
                auctionMsg,
                controlMsg,
                oneMinuteNoticeSent: rem <= 60,
                interval: null,
            };
            auctionTimers.set(roomId, td);
            startAuctionInterval(td, roomId);
            console.log(`[Auction] Restored timer for room ${roomId} (${rem}s remaining)`);
        }
    } catch (e) {
        console.error("restoreAuctionTimers error:", e);
    }
}

async function sendTicketRatingDM(userId, guildId, type) {
    const ratingChId = await db.get(`rating_ch_${guildId}`);
    if (!ratingChId) return;
    try {
        const user = await client.users.fetch(userId).catch(() => null);
        if (!user) return;
        const typeLabels = {
            support: " دعم فني",
            scam: " تشهير",
            order: " طلبات",
            auction: " مزاد",
            roles: " رتب",
        };
        const ratingRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`tr_1_${guildId}_${type}`).setLabel("⭐").setStyle(ButtonStyle.Secondary).setEmoji(emojis.rate),
            new ButtonBuilder().setCustomId(`tr_2_${guildId}_${type}`).setLabel("⭐⭐").setStyle(ButtonStyle.Secondary).setEmoji(emojis.rate),
            new ButtonBuilder().setCustomId(`tr_3_${guildId}_${type}`).setLabel("⭐⭐⭐").setStyle(ButtonStyle.Secondary).setEmoji(emojis.rate),
            new ButtonBuilder().setCustomId(`tr_4_${guildId}_${type}`).setLabel("⭐⭐⭐⭐").setStyle(ButtonStyle.Primary).setEmoji(emojis.rate),
            new ButtonBuilder().setCustomId(`tr_5_${guildId}_${type}`).setLabel("⭐⭐⭐⭐⭐").setStyle(ButtonStyle.Primary).setEmoji(emojis.rate),
        );
        await user.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle("⭐ تقييم الخدمة")
                    .setDescription(ED.shopInteractions_001({ type, typeLabels }))
                    .setFooter({ text: "اضغط على النجوم لإرسال تقييمك" })
                    .setTimestamp(),
            ],
            components: [ratingRow],
        });
    } catch (e) {
        console.log(`[Rating DM] فشل إرسال لـ ${userId}: ${e.message}`);
    }
}

// تشغيل restoreAuctionTimers عند إقلاع البوت
if (client.isReady()) {
    restoreAuctionTimers();
} else {
    client.once("ready", () => restoreAuctionTimers());
}

// ============================================
// 3. ticket-auction: إنشاء تكت المزا�� (Container v2)
// ============================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    
    const guildId = _ec.gid(interaction);
    const userId = interaction.user.id;
    
    if (interaction.customId === "ticket-auction") {
        const auctionCategoryId = await db.get(`catbuy_auction_${guildId}`);
        if (!auctionCategoryId) return interaction.reply({ content: "❌ يرجى تحديد كتاغوري الشراء باستخدام الأمر: /setup", ephemeral: true });
        
        const auctionAdminRoleId = await db.get(`auctionad_${guildId}`);
        const auctionAdminRole = interaction.guild.roles.cache.get(auctionAdminRoleId);
        if (!auctionAdminRole) return interaction.reply({ content: "❌ يرجى تحديد مسؤول المزاد باستخدام الأمر: /setup", ephemeral: true });
        
        try {
            const auctionData = await db.get(`auction_ticket_${userId}_${guildId}`);
            if (auctionData) {
                const existingChannel = interaction.guild.channels.cache.get(auctionData.channelId);
                if (existingChannel) return interaction.reply({ content: `❌ لديك تذكرة مفتوحة بالفعل: <#${existingChannel.id}>`, ephemeral: true });
                await db.delete(`auction_ticket_${userId}_${guildId}`);
            }
            
            await interaction.deferReply({ ephemeral: true });
            
            const ticketChannel = await interaction.guild.channels.create({
                name: `auction-${interaction.user.username}`,
                type: ChannelType.GuildText,
                parent: auctionCategoryId,
                permissionOverwrites: [
                    { id: userId, allow: ["SendMessages", "EmbedLinks", "AttachFiles", "ViewChannel"] },
                    { id: interaction.guild.roles.everyone, deny: ["ViewChannel"] },
                    { id: auctionAdminRole.id, allow: ["SendMessages", "ViewChannel", "MentionEveryone"] },
                ],
            });
            
            await db.set(`auction_ticket_${userId}_${guildId}`, { userId, channelId: ticketChannel.id });
            await db.set(`auction_ticket_channel_${ticketChannel.id}`, { ownerId: userId, guildId });
            
            const auctionEveryPrice = await db.get(`auction-evrypri_${guildId}`);
            const auctionHerePrice = await db.get(`auction-herepri_${guildId}`);
            const auctionMzadPrice = await db.get(`auction-mzadpri_${guildId}`);
            const bank = await db.get(`bank_${guildId}`);
            const auctionImage = await db.get(`buyauctionimage_${guildId}`);
            const serverColor = _ec.color(guildId);
            const guildIcon = interaction.guild.iconURL({ size: 1024 });

            const container = new ContainerBuilder().setAccentColor(serverColor);
            const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`# تـكـت المـزادات`));
            if (guildIcon) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
            container.addSectionComponents(section);
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### أسـعـار المـزادات\n` +
                    `${config.money} - مـنـشـن ( @everyone ) : \`${auctionEveryPrice || "غير محدد"}\`\n` +
                    `${config.money} - مـنـشـن ( @here ) : \`${auctionHerePrice || "غير محدد"}\`\n` +
                    `${config.money} - مـنـشـن مـزاد (رول) : \`${auctionMzadPrice || "غير محدد"}\`\n\n` +
                    `التـحـويـل لـ <@!${bank || "غير محدد"}>`
                )
            );
            if (auctionImage) { container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)); container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(auctionImage))); }
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${interaction.guild.name} | نـظـام المـزادات`));
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`<@${userId}> <@&${auctionAdminRole.id}>`));

            container.addActionRowComponents(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("every-auction").setLabel("مـنشـن ايفري").setStyle(ButtonStyle.Secondary).setEmoji(emojis.auction),
                new ButtonBuilder().setCustomId("here-auction").setLabel("مـنشـن هـيـر").setStyle(ButtonStyle.Secondary).setEmoji(emojis.auction),
                new ButtonBuilder().setCustomId("mzad-auction").setLabel("مـنشـن مـزاد").setStyle(ButtonStyle.Secondary).setEmoji(emojis.auction),
                new ButtonBuilder().setCustomId("closeauction").setLabel("اغـلاق الـتـكت").setStyle(ButtonStyle.Danger).setEmoji(emojis.close || "🔒"),
            ));

            await ticketChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
            
            await interaction.editReply({ content: `**__ تم انشاء تذكرتك بنجاح : <#${ticketChannel.id}> __**` });
        } catch (error) {
            console.error(error);
            if (interaction.deferred) await interaction.editReply({ content: "❌ حدث خطأ أثناء إنشاء التذكرة." });
        }
    }
});

// ============================================
// 4. auctionpri: زر عرض الأسعار
// ============================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    
    const guildId = _ec.gid(interaction);
    
    if (interaction.customId === "auctionpri") {
        try {
            const auctionEveryPrice = await db.get(`auction-evrypri_${guildId}`);
            const auctionHerePrice = await db.get(`auction-herepri_${guildId}`);
            const auctionMzadPrice = await db.get(`auction-mzadpri_${guildId}`);
            const bank = await db.get(`bank_${guildId}`);
            const imageUrl = (await db.get(`priceAuctionImage_${guildId}`)) || (await db.get(`image_${guildId}`));
            const color = _ec.color(guildId);
            
            const container = new ContainerBuilder()
                .setAccentColor(color)
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# أسعار المـزادات في سيرفر ${interaction.guild.name}`)
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(
                            `### أسـعـار المـزادات المتاحة:\n\n` +
                            `${config.money} - مـنـشـن ( @everyone ) : \`${auctionEveryPrice || "غير محدد"}\`\n` +
                            `${config.money} - مـنـشـن ( @here ) : \`${auctionHerePrice || "غير محدد"}\`\n` +
                            `${config.money} - مـنـشـن مـزاد (رول) : \`${auctionMzadPrice || "غير محدد"}\`\n\n` +
                            `**التـحـويـل لـ:** <@!${bank || "غير محدد"}>`
                        )
                );
            
            if (imageUrl) {
                container.addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                );
                container.addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(
                        new MediaGalleryItemBuilder().setURL(imageUrl)
                    )
                );
            }
            
            container.addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
            );
            container.addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`-# ${interaction.guild.name} | نـظـام المـزادات`)
            );
            
            await interaction.reply({ 
                components: [container], 
                flags: MessageFlags.IsComponentsV2,
                ephemeral: true 
            });
            
        } catch (error) {
            console.error("Error in auction prices button:", error);
            if (!interaction.replied) {
                await interaction.reply({ 
                    content: "❌ حدث خطأ أثناء جلب الأسعار.", 
                    ephemeral: true 
                });
            }
        }
    }
});

// ============================================
// 5. handleAuctionPayment: دالة الدفع الموحدة
// ============================================
async function handleAuctionPayment(interaction, db, config, type) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const priceMap = { every: { key: "auction-evrypri_", mention: "@everyone" }, here: { key: "auction-herepri_", mention: "@here" }, mzad: { key: "auction-mzadpri_", mention: "mzad" } };
    const p = priceMap[type];
    if (!p) return;
    const bank = await db.get(`bank_${guildId}`);
    const price = await db.get(`${p.key}${guildId}`);
    const mzadRoleId = type === "mzad" ? await db.get(`auctionmzadrole_${guildId}`) : null;
    if (!bank) return interaction.reply({ content: "يرجى تحديد البنك: /setup", ephemeral: true });
    if (!price) return interaction.reply({ content: `يرجى تحديد سعر منشن ${p.mention}: /setup-prices`, ephemeral: true });
    if (type === "mzad" && !mzadRoleId) return interaction.reply({ content: "يرجى تحديد رول المزاد: /setup", ephemeral: true });
    const activePurchase = await db.get(`auction_credit_${userId}_${guildId}`);
    if (activePurchase) return interaction.reply({ content: `**لديك عملية شراء قيد التنفيذ بالفعل.**`, ephemeral: true });
    const ticketOwner = await db.get(`auction_ticket_${interaction.member.id}_${guildId}.userId`);
    if (ticketOwner !== interaction.user.id) return interaction.reply({ content: `**يمكن لصاحب التكت فقط استعمال الأزرار**`, ephemeral: true });
    const totalPrice = Math.floor(price * (20 / 19) + 1);
    await interaction.reply({ content: `**\`السعر مع الضريبة: ${totalPrice}\`**`, ephemeral: true });
    await interaction.channel.send(`#credit <@!${bank}> ${totalPrice}`);
    await interaction.channel.send(`\`\`\`#credit ${bank} ${totalPrice}\`\`\``);
    await interaction.channel.send(`. \`يرجى التحويل في أسرع وقت ممكن هنا\` <@!${userId}>`);
    await db.set(`auction_credit_${userId}_${guildId}`, userId);
    const bankBotId = "282859044593598464";
    const collector = interaction.channel.createMessageCollector({ filter: (m) => m.author.id === bankBotId, time: 120000 });
    collector.on("collect", (c) => {
        const content = c.content;
        let paidAmount = 0;
        const btMatch = content.match(/`\$?([\d,]+(?:\.\d+)?)`/);
        const engMatch = content.match(/transferred\s+\$?([\d,]+)/i);
        const arMatch = content.match(/بتحويل\s+\$?([\d,]+)/);
        const found = btMatch || engMatch || arMatch;
        if (found) paidAmount = Number(found[1].replace(/,/g, ""));
        const bankMentionOk = content.includes(`<@!${bank}>`) || content.includes(`<@${bank}>`);
        const isTransfer = content.includes("has transferred") || content.includes("قام بتحويل");
        if (isTransfer && bankMentionOk && paidAmount >= price) collector.stop("DONE");
    });
    const auctionadmin = await db.get(`auctionad_${guildId}`);
    collector.on("end", async (collected, reason) => {
        await db.delete(`auction_credit_${userId}_${guildId}`);
        if (reason === "DONE") {
            await db.add(`ernss_${guildId}.erns`, Number(price));
            await db.add(`ernsg.ernsg`, Number(price));
            try {
                const invoiceEmbed = new EmbedBuilder().setTitle("- فاتورة الشراء -").setDescription(ED.shopInteractions_012({ bank, config, price, totalPrice, type, mzadRoleId })).setFooter(D.thanksFooter(interaction.guild)).setThumbnail(D.thumb(interaction.guild)).setTimestamp();
                await interaction.user.send({ embeds: [invoiceEmbed] });
            } catch {}
            let mentionType = type === "every" ? "@everyone" : type === "here" ? "@here" : `<@&${mzadRoleId}>`;
            await runAuctionQuestionFlow(interaction.channel, db, config, mentionType, totalPrice, price, guildId, userId, auctionadmin);
        } else {
            await interaction.channel.send({ content: `**انتهى الوقت ولم يتم التحويل.** <@!${userId}>` });
        }
    });
}

// ============================================
// 6. الأزرار الثلاثة
// ============================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.guild) return;
    if (interaction.customId === "every-auction") await handleAuctionPayment(interaction, db, config, "every");
    if (interaction.customId === "here-auction") await handleAuctionPayment(interaction, db, config, "here");
    if (interaction.customId === "mzad-auction") await handleAuctionPayment(interaction, db, config, "mzad");
});

// ============================================
// ============================================
// publish_auction: معالج زر نشر المزاد (Container v2)
// ============================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("publish_auction_")) return;
    if (!interaction.guild) return;

    const ownerId = interaction.customId.replace("publish_auction_", "");
    const guildId = interaction.guild.id;

    // التحقق من صلاحية مسؤول المزاد
    const auctionadminId = await db.get(`auctionad_${guildId}`);
    if (!auctionadminId || !interaction.member.roles.cache.has(auctionadminId)) {
        return interaction.reply({
            content: `**🚫 يجب أن تملك رتبة <@&${auctionadminId || "?"}> لنشر المزاد.**`,
            ephemeral: true
        });
    }

    // جلب رومات المزاد
    let rooms = (await db.get(`auctionrooms_${guildId}`)) || [];
    const singleRoom = await db.get(`auctionroom_${guildId}`);
    if (rooms.length === 0 && singleRoom) rooms = [singleRoom];
    
    if (rooms.length === 0) {
        return interaction.reply({
            content: "**❌ لا يوجد رومات مزاد. استخدم `/add-mzad-room`.**",
            ephemeral: true
        });
    }

    // بناء قائمة الخيارات
    const options = [];
    for (const roomId of rooms) {
        const roomChannel = interaction.guild.channels.cache.get(roomId);
        if (!roomChannel) continue;
        const isActive = await db.get(`active_auction_${roomId}`);
        options.push({
            label: roomChannel.name,
            value: roomId,
            description: isActive ? "🔴 يوجد مزاد شغال" : "🟢 متاح للنشر",
        });
    }

    if (options.length === 0) {
        return interaction.reply({
            content: "**❌ لا يوجد رومات صالحة.**",
            ephemeral: true
        });
    }

    // إنشاء قائمة منسدلة لاختيار الروم
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`auction_room_select_${ownerId}`)
        .setPlaceholder("اختر روم المزاد")
        .addOptions(options);

    await interaction.reply({
        content: "**اختر روم المزاد:**",
        components: [new ActionRowBuilder().addComponents(selectMenu)],
        ephemeral: true,
    });
});

// ============================================
// auction_room_select: معالج اختيار روم المزاد (Container v2)
// ============================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;
    if (!interaction.customId.startsWith("auction_room_select_")) return;
    if (!interaction.guild) return;

    const ownerId = interaction.customId.replace("auction_room_select_", "");
    const guildId = interaction.guild.id;
    const roomId = interaction.values[0];

    // التحقق من وجود مزاد نشط في الروم
    const isActive = await db.get(`active_auction_${roomId}`);
    if (isActive) {
        return interaction.reply({
            content: "**❌ يوجد مزاد شغال، اختر روماً آخر.**",
            ephemeral: true
        });
    }

    // جلب بيانات المزاد
    const draft = await db.get(`auction_draft_${ownerId}_${guildId}`);
    if (!draft) {
        return interaction.reply({
            content: "**❌ انتهت صلاحية بيانات المزاد.**",
            ephemeral: true
        });
    }

    await interaction.deferReply({ ephemeral: true });
    
    const roomChannel = interaction.guild.channels.cache.get(roomId);
    if (!roomChannel) {
        return interaction.editReply("**❌ الروم غير موجود.**");
    }

    // فتح الروم للكتابة
    await roomChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: true
    });

    // حساب الوقت المتبقي
    const initRem = draft.durationMinutes * 60;
    
    // إرسال رسالة المزاد
    const auctionMsg = await roomChannel.send({
        content: _buildAuctionMsg(draft, initRem)
    });

    // إرسال الصورة أو الفيديو
    if (draft.videoUrl) {
        try {
            await roomChannel.send({ content: `** فيديو السلعة:**\n${draft.videoUrl}` });
        } catch {}
    } else if (draft.imageUrl) {
        try {
            await roomChannel.send({ files: [{ attachment: draft.imageUrl, name: "auction.png" }] });
        } catch {
            await roomChannel.send(`**صورة السلعة:**\n${draft.imageUrl}`);
        }
    }

    // إرسال قوانين المزاد
    const auctionRules = await db.get(`mzad_rules_${guildId}`);
    if (auctionRules) {
        await roomChannel.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle(" قوانين المزاد")
                    .setDescription(auctionRules)
                    .setColor(await getColor(guildId, db, config))
                    .setTimestamp(),
            ],
        });
    }

    // إرسال لوحة التحكم
    const controlMsg = await roomChannel.send({
        content: "**— لوحة تحكم المزاد (للمسؤولين فقط) —**",
        components: [_buildControlRow(roomId)],
    });

    // حفظ بيانات المزاد النشط
    await db.set(`active_auction_${roomId}`, {
        ownerId,
        guildId,
        startedAt: Date.now(),
        draft,
        remainingTime: initRem,
        auctionMsgId: auctionMsg.id,
        controlMsgId: controlMsg.id,
    });

    // إعداد التايمر
    const timerData = {
        remainingTime: initRem,
        paused: false,
        guild: interaction.guild,
        roomChannel,
        draft,
        guildId,
        auctionMsg,
        controlMsg,
        oneMinuteNoticeSent: false,
        interval: null,
        lastBidder: null,
        lastBidAmount: null,
    };

    // إيقاف أي تايمر قديم
    if (activeAuctions.has(roomId)) {
        const oldTd = auctionTimers.get(roomId);
        if (oldTd) clearInterval(oldTd.interval);
    }

    // تشغيل التايمر
    startAuctionInterval(timerData, roomId);

    // حذف بيانات المسودة والتكت
    await db.delete(`auction_draft_${ownerId}_${guildId}`);
    await db.delete(`auction_ticket_${ownerId}_${guildId}`);
    
    await interaction.editReply(`**✅ تم نشر المزاد في ${roomChannel}**`);
    
    // حذف التكت بعد 4 ثواني
    setTimeout(async () => {
        try { await interaction.channel.delete(); } catch {}
    }, 4000);
});
// 7. runAuctionQuestionFlow
// ============================================
async function runAuctionQuestionFlow(channel, db, config, mentionType, paidPrice, originalPrice, guildId, userId, auctionadmin) {
    const timeoutMsg = `**⏳ انتهى الوقت.** <@!${userId}>`;
    
    await channel.send(`<@${userId}> ** ما هي السلعة؟** *(لديك 3 دقائق)*`);
    let itemName;
    try {
        const c = await channel.awaitMessages({ filter: (m) => m.author.id === userId, max: 1, time: 180000, errors: ["time"] });
        itemName = c.first().content;
        if (isLink(itemName)) {
            await channel.send("**❌ ممنوع إرسال الروابط في اسم السلعة. تم إلغاء العملية.**");
            setTimeout(() => channel.delete().catch(() => {}), 5000);
            return;
        }
    } catch {
        await channel.send(timeoutMsg);
        await channel.send("**🔒 سيتم إغلاق التكت تلقائياً خلال 5 ثواني...**");
        setTimeout(() => channel.delete().catch(() => {}), 5000);
        return;
    }

    const taxRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`atax_yes_${userId}`).setLabel("نعم - بضريبة").setStyle(ButtonStyle.Success).setEmoji(emojis.tax),
        new ButtonBuilder().setCustomId(`atax_no_${userId}`).setLabel("لا - بدون ضريبة").setStyle(ButtonStyle.Danger).setEmoji(emojis.cancel),
    );
    const taxMsg = await channel.send({ content: `<@${userId}> ** هل السلعة بضريبة؟**`, components: [taxRow] });
    let includesTax;
    try {
        const btnI = await taxMsg.awaitMessageComponent({ filter: (i) => i.user.id === userId, time: 180000 });
        includesTax = btnI.customId === `atax_yes_${userId}`;
        await btnI.reply({ content: `**✅ تم الاختيار: ${includesTax ? "بضريبة" : "بدون ضريبة"}**`, ephemeral: true });
        await taxMsg.edit({ components: [] });
    } catch {
        await channel.send(timeoutMsg);
        await channel.send("**🔒 سيتم إغلاق التكت تلقائياً خلال 5 ثواني...**");
        setTimeout(() => channel.delete().catch(() => {}), 5000);
        return;
    }

    await channel.send(`**<@${userId}> أرسل السعر المبدئي للسلعة **`);
    let startPrice;
    try {
        const c = await channel.awaitMessages({ filter: (m) => m.author.id === userId, max: 1, time: 180000, errors: ["time"] });
        startPrice = c.first().content;
        if (isLink(startPrice)) {
            await channel.send("**❌ ممنوع إرسال الروابط. تم إلغاء العملية.**");
            setTimeout(() => channel.delete().catch(() => {}), 5000);
            return;
        }
        if (isNaN(Number(startPrice))) {
            await channel.send("**❌ يرجى إرسال رقم فقط للسعر. تم إلغاء العملية.**");
            setTimeout(() => channel.delete().catch(() => {}), 5000);
            return;
        }
    } catch {
        await channel.send(timeoutMsg);
        await channel.send("**🔒 سيتم إغلاق التكت تلقائياً خلال 5 ثواني...**");
        setTimeout(() => channel.delete().catch(() => {}), 5000);
        return;
    }

    const durationMinutes = 5;

    const imgRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`aimg_yes_${userId}`).setLabel("نعم").setStyle(ButtonStyle.Success).setEmoji(emojis.confirm),
        new ButtonBuilder().setCustomId(`aimg_no_${userId}`).setLabel("لا").setStyle(ButtonStyle.Danger).setEmoji(emojis.cancel),
    );
    const imgPromptMsg = await channel.send({ content: `<@${userId}> ** هل تريد إضافة صور أو فيديو؟**`, components: [imgRow] });
    let imageUrl = null, videoUrl = null;
    try {
        const btnI = await imgPromptMsg.awaitMessageComponent({ filter: (i) => i.user.id === userId, time: 180000 });
        const wantsImages = btnI.customId === `aimg_yes_${userId}`;
        await btnI.deferUpdate();
        await imgPromptMsg.edit({ components: [] });
        if (wantsImages) {
            await channel.send(`<@${userId}> ** أرسل الصورة أو الفيديو (مرفق مباشر أو رابط - ممنوع الروابط الأخرى):** *(لديك 3 دقائق)*`);
            try {
                const imgC = await channel.awaitMessages({ filter: (m) => m.author.id === userId, max: 1, time: 180000, errors: ["time"] });
                const imgMsg = imgC.first();
                if (imgMsg.attachments.size > 0) {
                    const att = imgMsg.attachments.first();
                    att.contentType?.startsWith("video/") ? videoUrl = att.url : imageUrl = att.url;
                } else if (imgMsg.content && imgMsg.content.startsWith("http")) {
                    const url = imgMsg.content.trim();
                    if (!url.match(/\.(png|jpe?g|webp|gif|mp4|webm|mov)$/i)) {
                        await channel.send("**❌ الرابط غير صالح. أرسل رابط صورة أو فيديو فقط. تم إلغاء العملية.**");
                        setTimeout(() => channel.delete().catch(() => {}), 5000);
                        return;
                    }
                    url.match(/\.(mp4|webm|mov|gif)$/i) ? videoUrl = url : imageUrl = url;
                }
            } catch {}
        }
    } catch {
        await channel.send(timeoutMsg);
        await channel.send("**🔒 سيتم إغلاق التكت تلقائياً خلال 5 ثواني...**");
        setTimeout(() => channel.delete().catch(() => {}), 5000);
        return;
    }

    const draft = {
        itemName, includesTax, startPrice, durationMinutes,
        imageUrl, videoUrl, mentionType, owner: userId, paidPrice, originalPrice,
    };
    await db.set(`auction_draft_${userId}_${guildId}`, draft);
    await showAuctionSummary(channel, draft, userId, guildId, auctionadmin);
}

// ============================================
// 8. showAuctionSummary
// ============================================
async function showAuctionSummary(channel, draft, userId, guildId, auctionadmin) {
    const serverColor = await getColor(guildId, db, config);
    const container = new ContainerBuilder().setAccentColor(serverColor);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ملـخـص تـفـاصـيـل الـمـزاد`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `**السلعة:** ${draft.itemName}\n**السعر المبدئي:** ${draft.startPrice}\n**الضريبة:** ${draft.includesTax ? "نعم" : "لا"}\n**المدة:** ${draft.durationMinutes} دقائق\n**المنشن:** ${draft.mentionType}`
        )
    );
    if (draft.imageUrl) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(draft.imageUrl)));
    }
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# نـظـام المـزادات`));

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`<@&${auctionadmin}>`));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`publish_auction_${userId}`).setLabel("نشر المزاد").setStyle(ButtonStyle.Secondary).setEmoji(emojis.auction),
        new ButtonBuilder().setCustomId(`edit_auction_${userId}`).setLabel("تعديل المزاد").setStyle(ButtonStyle.Primary).setEmoji("✏️"),
        new ButtonBuilder().setCustomId(`cancel_auction_${userId}`).setLabel("إلغاء المزاد").setStyle(ButtonStyle.Danger).setEmoji(emojis.cancelAuction),
    ));

    return await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

// ============================================
// 9. endAuction
// ============================================
async function endAuction(timerData, roomId) {
    const { roomChannel, draft, guildId } = timerData;
    await cleanupAuctionRoom(roomChannel);

    const savedInfo = await db.get(`mzad_info_${guildId}`);
    const middlemanLink = await db.get(`mzad_middleman_link_${guildId}`);
    const auctionDescription = savedInfo || `**صاحب المزاد:** <@${draft.owner}>\n**السلعة:** ${draft.itemName}\n\n**للشراء اضغط الزر ادناه**`;

    const serverBanner = roomChannel.guild.bannerURL({ size: 1024, extension: 'png' });
    const serverColor = await getColor(guildId, db, config);

    const container = new ContainerBuilder().setAccentColor(serverColor);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# انتهى المزاد`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(auctionDescription));
    if (serverBanner) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(serverBanner)));
    }
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${roomChannel.guild.name} | نـظـام المـزادات`));

    const actionRow = new ActionRowBuilder();
    if (middlemanLink) actionRow.addComponents(new ButtonBuilder().setLabel("سيرفر الوسطاء").setStyle(ButtonStyle.Link).setURL(middlemanLink).setEmoji("🔗"));
    actionRow.addComponents(
        new ButtonBuilder().setCustomId("ticket-auction").setLabel("شراء مزاد").setStyle(ButtonStyle.Primary).setEmoji(emojis.auction),
        new ButtonBuilder().setCustomId(`auction_contact_${draft.owner}`).setLabel("تواصل مع صاحب المزاد").setStyle(ButtonStyle.Secondary).setEmoji("💬"),
    );
    container.addActionRowComponents(actionRow);

    await roomChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });

    if (middlemanLink) {
        const warnRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("سيرفر الوسطاء").setStyle(ButtonStyle.Link).setURL(middlemanLink).setEmoji("🔗"));
        await roomChannel.send({ content: `**لتجنب النصب، يرجى اخذ وسيط من ${middlemanLink}**`, components: [warnRow] });
    } else {
        await roomChannel.send("**لتجنب النصب، يرجى اخذ وسيط موثوق.**");
    }

    await roomChannel.permissionOverwrites.edit(roomChannel.guild.roles.everyone, { SendMessages: false }).catch(() => {});
    await db.delete(`active_auction_${roomId}`);
    await sendAuctionLog(roomChannel.guild, draft, guildId, roomId, "ended");
}

// ============================================
// 10. إصلاح أزرار المسؤولين
// ============================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("pause_auction_") && !interaction.customId.startsWith("resume_auction_") && !interaction.customId.startsWith("extend_auction_") && !interaction.customId.startsWith("revive_auction_") && !interaction.customId.startsWith("cancel_active_auction_")) return;
    
    const roomId = interaction.customId.replace(/^(pause_auction_|resume_auction_|extend_auction_|revive_auction_|cancel_active_auction_)/, "");
    const td = auctionTimers.get(roomId);
    if (!td) return interaction.reply({ content: "**❌ لا يوجد مزاد نشط في هذا الروم.**", flags: MessageFlags.Ephemeral });
});

// ============================================
// 11. أمر $مزاد (يفتح أزرار المودال) - Container v2
// ============================================
client.on("messageCreate", async (message) => {
    if (!message.content.startsWith("$مزاد")) return;
    if (!message.guild) return;
    const guildId = message.guild.id;
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply("❌ هذا الامر للادارة العليا فقط.");

    const serverColor = _ec.color(guildId);
    const guildIcon = message.guild.iconURL({ size: 1024 });
    const savedInfo = await db.get(`mzad_info_${guildId}`);
    const savedLink = await db.get(`mzad_middleman_link_${guildId}`);

    const container = new ContainerBuilder().setAccentColor(serverColor);
    const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`# إعـدادات المـزاد`));
    if (guildIcon) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
    container.addSectionComponents(section);
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**الوصف:** ${savedInfo || "افتراضي (صاحب + سلعة)"}\n**رابط الوسطاء:** ${savedLink || "غير محدد"}`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${message.guild.name} | إعـدادات المـزاد`));

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("mzad_modal_desc").setLabel("تغيير وصف نهاية المزاد").setStyle(ButtonStyle.Primary).setEmoji("📝"),
        new ButtonBuilder().setCustomId("mzad_modal_link").setLabel("تسطيب سيرفر الوسطاء").setStyle(ButtonStyle.Success).setEmoji("🔗"),
    );
    container.addActionRowComponents(row);

    await message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
    await message.delete().catch(() => {});
});

// ============================================
// 12. مودال الوصف والرابط
// ============================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId === "mzad_modal_desc") {
        const modal = new ModalBuilder().setCustomId("mzad_modal_desc_submit").setTitle("تغيير وصف نهاية المزاد");
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("mzad_desc_input").setLabel("أدخل الوصف (فاضي = افتراضي)").setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder("معلومات المزاد...")));
        await interaction.showModal(modal);
    }
    if (interaction.customId === "mzad_modal_link") {
        const modal = new ModalBuilder().setCustomId("mzad_modal_link_submit").setTitle("تسطيب سيرفر الوسطاء");
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("mzad_link_input").setLabel("أدخل رابط سيرفر الوسطاء").setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder("https://discord.gg/...")));
        await interaction.showModal(modal);
    }
});

// ============================================
// 13. استقبال المودالات
// ============================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isModalSubmit()) return;
    const guildId = interaction.guild.id;
    if (interaction.customId === "mzad_modal_desc_submit") {
        const desc = interaction.fields.getTextInputValue("mzad_desc_input").trim();
        desc ? await db.set(`mzad_info_${guildId}`, desc) : await db.delete(`mzad_info_${guildId}`);
        await interaction.reply({ content: desc ? `✅ تم تحديث الوصف.` : "✅ تم إعادة الوصف للافتراضي.", flags: MessageFlags.Ephemeral });
    }
    if (interaction.customId === "mzad_modal_link_submit") {
        const link = interaction.fields.getTextInputValue("mzad_link_input").trim();
        if (link && !link.startsWith("http")) return interaction.reply({ content: " رابط غير صالح ضيف https://.", flags: MessageFlags.Ephemeral });
        link ? await db.set(`mzad_middleman_link_${guildId}`, link) : await db.delete(`mzad_middleman_link_${guildId}`);
        await interaction.reply({ content: link ? `✅ تم تسطيب الرابط.` : "✅ تم حذف الرابط.", flags: MessageFlags.Ephemeral });
    }
});

// ============================================
// 14. زر تواصل مع صاحب المزاد (ثريد مع أزرار استدعاء)
// ============================================
// ============================================
// ثريد المزاد
// ============================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("auction_contact_")) return;
    
    const ownerId = interaction.customId.replace("auction_contact_", "");
    const openerId = interaction.user.id;
    const guildId = interaction.guild.id;

    if (openerId === ownerId) {
        return interaction.reply({ content: "❌ لا يمكنك فتح ثريد مع نفسك! انت صاحب المزاد.", flags: MessageFlags.Ephemeral });
    }

    try {
        const thread = await interaction.channel.threads.create({
            name: `تواصل-مزاد`,
            type: ChannelType.PrivateThread,
            invitable: false,
        });
        await thread.members.add(ownerId);
        await thread.members.add(openerId);

        const btnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`auc_call_owner_${ownerId}_${openerId}`).setLabel("استدعاء صاحب المزاد").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`auc_call_opener_${ownerId}_${openerId}`).setLabel("استدعاء فاتح الثريد").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`auc_delete_${ownerId}_${openerId}`).setLabel("حذف الثريد").setStyle(ButtonStyle.Danger),
        );

        await thread.send({
            content: `**صاحب المزاد:** <@${ownerId}>\n**المشتري:** <@${openerId}>`,
            components: [btnRow],
        });

        try {
            const owner = await interaction.guild.members.fetch(ownerId);
            await owner.send({ content: ` تم فتح ثريد تواصل بخصوص مزادك.` });
        } catch {}

        await interaction.reply({ content: `✅ تم فتح ثريد: ${thread}`, flags: MessageFlags.Ephemeral });
    } catch {
        await interaction.reply({ content: "❌ تعذر فتح الثريد.", flags: MessageFlags.Ephemeral });
    }
});

// ============================================
    client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== "closeauction") return;
    if (!interaction.guild) return;

    const guildId = interaction.guild.id;
    const channel = interaction.channel;

    const meta = await db.get(`auction_ticket_channel_${channel.id}`);
    const ownerId = meta?.ownerId || interaction.user.id;
    const gId = meta?.guildId || guildId;

    await db.delete(`auction_ticket_${ownerId}_${gId}`);
    await db.delete(`auction_ticket_channel_${channel.id}`);
    await db.delete(`auction_credit_${ownerId}_${gId}`);
    await db.delete(`auction_draft_${ownerId}_${gId}`);

    await interaction.reply({ content: "**🔒 سيتم إغلاق التكت...**" });
    setTimeout(() => channel.delete().catch(() => {}), 3000);
});
// أزرار استدعاء الثريد
// ============================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("auc_call_")) return;

    const parts = interaction.customId.replace("auc_call_", "").split("_");
    const type = parts[0];
    const ownerId = parts[1];
    const openerId = parts[2];

    if (interaction.user.id !== ownerId && interaction.user.id !== openerId) {
        return interaction.reply({ content: "🚫 هذا الزر للطرفين فقط.", flags: MessageFlags.Ephemeral });
    }

    if (type === "owner") {
        await interaction.reply({ content: `<@${ownerId}>  استدعاء من <@${interaction.user.id}>` });
    } else {
        await interaction.reply({ content: `<@${openerId}>  استدعاء من <@${interaction.user.id}>` });
    }
});

// ============================================
// حذف الثريد
// ============================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("auc_delete_")) return;

    const parts = interaction.customId.replace("auc_delete_", "").split("_");
    const ownerId = parts[0];
    const openerId = parts[1];

    if (interaction.user.id !== ownerId && interaction.user.id !== openerId) {
        return interaction.reply({ content: "🚫 هذا الزر للطرفين فقط.", flags: MessageFlags.Ephemeral });
    }

    try {
        await interaction.reply({ content: "🗑️ سيتم حذف الثريد..." });
        setTimeout(async () => { try { await interaction.channel.delete(); } catch {} }, 2000);
    } catch {
        await interaction.reply({ content: "❌ تعذّر حذف الثريد.", flags: MessageFlags.Ephemeral }).catch(() => {});
    }
});
    // ========== !قفل-تكت ==========
client.on("messageCreate", async (message) => {
    if (!message.content.startsWith("!قفل-تكت")) return;
    if (!message.guild) return;

    const guildId = message.guild.id;
    const channel = message.channel;
    const userId = message.author.id;

    // البحث عن نوع التكت
    const shopTicket = await db.get(`shop_ticket_channel_${channel.id}`);
    const auctionTicket = await db.get(`auction_ticket_channel_${channel.id}`);
    const orderTicket = await db.get(`order_ticket_channel_${channel.id}`);
    const rolesTicket = await db.get(`roles_ticket_channel_${channel.id}`);
    const supportTicket = await db.get(`support_ticket_ch_${channel.id}`);

    const ticketData = shopTicket || auctionTicket || orderTicket || rolesTicket || supportTicket;
    const ownerId = ticketData?.ownerId;

    if (!ticketData) {
        return message.reply("**❌ هذه القناة ليست تذكرة.**");
    }

    // صلاحية: صاحب التكت أو أدمن
    if (userId !== ownerId && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply("**❌ فقط صاحب التكت أو الأدمن يمكنه إغلاق التذكرة.**");
    }

    // حذف بيانات التكت من الداتابيس
    if (shopTicket) {
        await db.delete(`shop_ticket_${ownerId}_${guildId}`);
        await db.delete(`shop_ticket_channel_${channel.id}`);
        await db.delete(`shop_credit_${ownerId}_${guildId}`);
    }
    if (auctionTicket) {
        await db.delete(`auction_ticket_${ownerId}_${guildId}`);
        await db.delete(`auction_ticket_channel_${channel.id}`);
        await db.delete(`auction_credit_${ownerId}_${guildId}`);
        await db.delete(`auction_draft_${ownerId}_${guildId}`);
    }
    if (orderTicket) {
        await db.delete(`order_ticket_${ownerId}_${guildId}`);
        await db.delete(`order_ticket_channel_${channel.id}`);
        await db.delete(`order_credit_${ownerId}_${guildId}`);
    }
    if (rolesTicket) {
        await db.delete(`roles_ticket_${ownerId}_${guildId}`);
        await db.delete(`roles_ticket_channel_${channel.id}`);
    }
    if (supportTicket) {
        const ticketKey = supportTicket.dbKey || `support_ticket_${ownerId}_${guildId}`;
        await db.delete(ticketKey);
        await db.delete(`support_ticket_ch_${channel.id}`);
    }

    await message.channel.send("**🔒 سيتم إغلاق التذكرة خلال 3 ثواني...**");
    setTimeout(() => channel.delete().catch(() => {}), 3000);
});
    //-------- ticket-order: فتح تكت طلبات --------
//-------- ticket-order: فتح تكت طلب (Container v2) --------
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== "ticket-order") return;
    if (!interaction.guild) return;

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    const orderCat = await db.get(`catbuy_order_${guildId}`);
    if (!orderCat) return interaction.reply({ content: "**❌ لم يتم إعداد كتاغوري الطلبات. استخدم `/setup`.**", flags: MessageFlags.Ephemeral });
    const orderAdmin = await db.get(`orderad_${guildId}`);
    if (!orderAdmin) return interaction.reply({ content: "**❌ لم يتم إعداد مسؤول الطلبات. استخدم `/setup`.**", flags: MessageFlags.Ephemeral });

    const existing = await db.get(`order_ticket_${userId}_${guildId}`);
    if (existing) {
        const existingCh = interaction.guild.channels.cache.get(existing.channelId);
        if (existingCh) return interaction.reply({ content: `**❌ لديك تذكرة مفتوحة بالفعل: <#${existingCh.id}>**`, flags: MessageFlags.Ephemeral });
        await db.delete(`order_ticket_${userId}_${guildId}`);
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const adminRole = interaction.guild.roles.cache.get(orderAdmin);
    const safeName = interaction.user.username.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, "-").slice(0, 24) || "user";
    const ticketChannel = await interaction.guild.channels.create({
        name: `order-${safeName}`,
        type: ChannelType.GuildText,
        parent: orderCat,
        permissionOverwrites: [
            { id: userId, allow: ["SendMessages", "EmbedLinks", "AttachFiles", "ViewChannel"] },
            { id: interaction.guild.roles.everyone, deny: ["SendMessages", "ViewChannel"] },
            { id: adminRole?.id || orderAdmin, allow: ["SendMessages", "MentionEveryone", "EmbedLinks", "AttachFiles", "ViewChannel"] },
        ],
    });

    await db.set(`order_ticket_${userId}_${guildId}`, { userId, channelId: ticketChannel.id });
    await db.set(`order_ticket_channel_${ticketChannel.id}`, { ownerId: userId, guildId });

    const evrypri = await db.get(`order-evrypri_${guildId}`);
    const herepri = await db.get(`order-herepri_${guildId}`);
    const orderpri = await db.get(`order-orderpri_${guildId}`);
    const ordermentionrole = await db.get(`order-mentionrole_${guildId}`);
    const bank = await db.get(`bank_${guildId}`);
    const orderImage = await db.get(`buyorderimage_${guildId}`);
    const serverColor = await getColor(guildId, db, config);
    const guildIcon = interaction.guild.iconURL({ size: 1024 });

    const priceLines = [];
    if (evrypri) priceLines.push(`${config.mzademoji} **@everyone:** ${evrypri}`);
    if (herepri) priceLines.push(`${config.mzademoji} **@here:** ${herepri}`);
    if (orderpri && ordermentionrole) priceLines.push(`${config.mzademoji} **منشن طلبات:** ${orderpri}`);

    const typeButtons = [];
    if (evrypri) typeButtons.push(new ButtonBuilder().setCustomId(`order_type_every_${userId}`).setLabel("منشن @everyone").setStyle(ButtonStyle.Secondary).setEmoji(emojis.auction));
    if (herepri) typeButtons.push(new ButtonBuilder().setCustomId(`order_type_here_${userId}`).setLabel("منشن @here").setStyle(ButtonStyle.Secondary).setEmoji(emojis.auction));
    if (orderpri && ordermentionrole) typeButtons.push(new ButtonBuilder().setCustomId(`order_type_order_${userId}`).setLabel("منشن طلبات").setStyle(ButtonStyle.Secondary).setEmoji(emojis.auction));
    typeButtons.push(new ButtonBuilder().setCustomId(`order_close_${userId}`).setLabel("إغلاق التكت").setStyle(ButtonStyle.Danger).setEmoji(emojis.close));

    const container = new ContainerBuilder().setAccentColor(serverColor);
    const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`# تـكـت الطـلـبـات`));
    if (guildIcon) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
    container.addSectionComponents(section);
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${priceLines.length > 0 ? `### أسـعـار الطـلـبـات\n${priceLines.join("\n")}\n\n` : ""}التـحـويـل لـ <@!${bank || "غير محدد"}>`));
    if (orderImage) { container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)); container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(orderImage))); }
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${interaction.guild.name} | نـظـام الطـلـبـات`));
    container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`<@${userId}> <@&${orderAdmin}>`)
);

// ✅ أضف هالسطر
container.addActionRowComponents(new ActionRowBuilder().addComponents(...typeButtons));

await ticketChannel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
});
await interaction.editReply({ content: `**✅ تم إنشاء تذكرتك: <#${ticketChannel.id}>**` });});

//-------- order_close button --------
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("order_close_")) return;
    if (!interaction.guild) return;
    const meta = await db.get(`order_ticket_channel_${interaction.channel.id}`);
    const ownerId = meta?.ownerId || interaction.user.id;
    const gId = meta?.guildId || interaction.guild.id;
    await db.delete(`order_ticket_${ownerId}_${gId}`);
    await db.delete(`order_ticket_channel_${interaction.channel.id}`);
    await sendTicketRatingDM(ownerId, gId, "order").catch(() => {});
    await interaction.reply({ content: "**🔒 سيتم إغلاق التكت...**" });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
});
    
//-------- _handleOrderType (تحويل + كتابة طلب) --------
async function _handleOrderType(interaction, mentionLabel, price) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const channel = interaction.channel;

    const bank = await db.get(`bank_${guildId}`);
    if (!bank) return interaction.reply({ content: "يرجى تحديد البنك باستخدام الأمر: /setup", ephemeral: true });

    const activePurchase = await db.get(`order_credit_${userId}_${guildId}`);
    if (activePurchase) return interaction.reply({ content: "**لديك عملية شراء قيد التنفيذ بالفعل.**", ephemeral: true });

    const meta = await db.get(`order_ticket_channel_${channel.id}`);
    if (meta?.ownerId && meta.ownerId !== userId) return interaction.reply({ content: "**يمكن لصاحب التكت فقط استعمال الأزرار**", ephemeral: true });

    const totalPrice = Math.floor(price * (20 / 19) + 1);
    await interaction.reply({ content: `**\`السعر مع الضريبة: ${totalPrice}\`**`, ephemeral: true });
    await channel.send(`#credit ${bank} ${totalPrice}`);
    await channel.send(`\`\`\`#credit ${bank} ${totalPrice}\`\`\``);
    await channel.send(`. \`يرجى التحويل في أسرع وقت ممكن هنا\` <@!${userId}>`);
    await db.set(`order_credit_${userId}_${guildId}`, userId);

    const bankBotId = "282859044593598464";
    const collector = channel.createMessageCollector({ filter: (m) => m.author.id === bankBotId, time: 120000 });

    let done = false;
    collector.on("collect", (c) => {
        if (
            c.content.includes(`:moneybag: | ${interaction.user.username}, has transferred \`$${price}\` to <@!${bank}>`) ||
            c.content.includes(`**ـ ${interaction.user.username}, قام بتحويل \`$${price}\` لـ <@!${bank}> ** |:moneybag:`)
        ) { done = true; collector.stop("DONE"); }
    });

    collector.on("end", async (collected, reason) => {
        await db.delete(`order_credit_${userId}_${guildId}`);
        if (reason !== "DONE") { await channel.send({ content: `**انتهى الوقت ولم يتم التحويل.** <@!${userId}>` }); setTimeout(() => channel.delete().catch(() => {}), 5000); return; }

        await channel.send("✅ **تم التحقق من التحويل بنجاح!** يرجى كتابة طلبك الآن هنا");

        const publishOrder = async (requestText) => {
            const orderRoomId = await db.get(`orderroom_${guildId}`);
            const orderRoom = interaction.guild.channels.cache.get(orderRoomId);
            if (orderRoom) {
                const orderMsg = `${mentionLabel}\n**- صاحب الطلب : <@${userId}>\n- الطلب : ${requestText}\n- المنشن : ${mentionLabel}**`;
                const reqButtons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`order_thread_${userId}`).setLabel("تواصل").setStyle(ButtonStyle.Secondary).setEmoji(emojis.contact),
                    new ButtonBuilder().setLabel("بايو").setStyle(ButtonStyle.Link).setURL(`https://discord.com/users/${userId}`).setEmoji(emojis.user),
                    new ButtonBuilder().setCustomId(`order_delete_${userId}`).setLabel("حذف الطلب").setStyle(ButtonStyle.Secondary).setEmoji(emojis.deleteOrder),
                    new ButtonBuilder().setCustomId(`order_prices_${guildId}`).setLabel("الأسعار").setStyle(ButtonStyle.Secondary).setEmoji(emojis.prices),
                    new ButtonBuilder().setCustomId("ticket-order").setLabel("فتح تكت طلب").setStyle(ButtonStyle.Secondary).setEmoji(emojis.ticketOrder),
                );
                await orderRoom.send({ content: orderMsg, components: [reqButtons] });
            }
            await db.delete(`order_ticket_${userId}_${guildId}`);
            await db.delete(`order_ticket_channel_${channel.id}`);
            await channel.send("✅ **تم نشر طلبك بنجاح في روم الطلبات، سيتم حذف التكت الآن.**");
            setTimeout(() => channel.delete().catch(() => {}), 3000);
        };

        const validateOrderText = (text) => {
            const linkRegex = /(https?:\/\/[^\s]+)|(discord\.(gg|io|me|li|com\/invite)\/.+[a-z])/gi;
            if (linkRegex.test(text)) return { valid: false, message: "❌ **ممنوع إرسال الروابط أو دعوات السيرفرات!**" };
            return { valid: true };
        };

        const createOrderConfirmRow = () => new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("confirm_yes_order").setLabel("نعم").setStyle(ButtonStyle.Success).setEmoji(emojis.yes),
            new ButtonBuilder().setCustomId("edit_name_order").setLabel("تعديل الطلب").setStyle(ButtonStyle.Primary).setEmoji("✏️"),
        );

        const collectOrderText = async () => {
            let requestText;
            try { const msgs = await channel.awaitMessages({ filter: (m) => m.author.id === userId, max: 1, time: 300000, errors: ["time"] }); requestText = msgs.first().content; }
            catch { await channel.send("**⌛ انتهى وقت كتابة الطلب.**"); setTimeout(() => channel.delete().catch(() => {}), 5000); return null; }
            const validation = validateOrderText(requestText);
            if (!validation.valid) { await channel.send({ content: validation.message }); return collectOrderText(); }
            return requestText;
        };

        const runOrderConfirmCycle = async (currentText) => {
            const confirmMsg = await channel.send({ content: `**يرجــى التأكيد, طلبك هو**\n${currentText}`, components: [createOrderConfirmRow()] });
            const confirmCollector = confirmMsg.createMessageComponentCollector({ filter: (i) => i.user.id === userId, time: 60000 });

            confirmCollector.on("collect", async (i) => {
                const ticketOwner = (await db.get(`order_ticket_channel_${channel.id}`))?.ownerId;
                if (ticketOwner !== userId) return i.reply({ content: "**يمكن لصاحب التكت فقط استعمال الأزرار**", ephemeral: true });
                if (i.customId === "confirm_yes_order") { await i.deferUpdate(); confirmCollector.stop(); await publishOrder(currentText); }
                else if (i.customId === "edit_name_order") { await i.deferUpdate(); confirmCollector.stop(); await channel.send("**✏️ يرجى إرسال طلبك مرة أخرى.**"); const newText = await collectOrderText(); if (newText) await runOrderConfirmCycle(newText); }
            });
        };

        const firstRequestText = await collectOrderText();
        if (firstRequestText) await runOrderConfirmCycle(firstRequestText);
    });
}

//-------- order_type_order_ / order_type_every_ / order_type_here_ --------
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId.startsWith("order_type_order_")) {
        const guildId = interaction.guild.id;
        const price = await db.get(`order-orderpri_${guildId}`);
        if (!price) return interaction.reply({ content: "**❌ سعر منشن الطلبات غير محدد. استخدم `/setup-prices`.**", flags: MessageFlags.Ephemeral });
        const roleId = await db.get(`order-mentionrole_${guildId}`);
        if (!roleId) return interaction.reply({ content: "**❌ رول منشن الطلبات غير محدد. استخدم `/setup`.**", flags: MessageFlags.Ephemeral });
        await _handleOrderType(interaction, `<@&${roleId}>`, price);
    }
    if (interaction.customId.startsWith("order_type_every_")) {
        const price = await db.get(`order-evrypri_${interaction.guild.id}`);
        if (!price) return interaction.reply({ content: "**❌ السعر غير محدد.**", flags: MessageFlags.Ephemeral });
        await _handleOrderType(interaction, "@everyone", price);
    }
    if (interaction.customId.startsWith("order_type_here_")) {
        const price = await db.get(`order-herepri_${interaction.guild.id}`);
        if (!price) return interaction.reply({ content: "**❌ السعر غير محدد.**", flags: MessageFlags.Ephemeral });
        await _handleOrderType(interaction, "@here", price);
    }
});

 //-------- order_thread: فتح ثريد خاص --------
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isButton()) return;
        if (!interaction.customId.startsWith("order_thread_")) return;
        if (!interaction.guild) return;

        const ownerId = interaction.customId.replace("order_thread_", "");
        const openerId = interaction.user.id;
        const guildId = interaction.guild.id;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const thread = await interaction.channel.threads.create({
                name: ` ثريد-طلب-${interaction.user.username}`,
                type: ChannelType.PrivateThread,
                invitable: false,
            });
            await thread.members.add(ownerId);
            await thread.members.add(openerId);

            const threadEmbed = new EmbedBuilder()
                .setTitle(" ثريد خاص تواصل")
                .setDescription(ED.shopInteractions_016({ openerId, ownerId }))
                .setColor(await getColor(guildId, db, config))
                .setTimestamp();

            const threadButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`ot_call_opener_${ownerId}_${openerId}`)
                    .setLabel("استدعاء فاتح الثريد")
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji(emojis.callOpener),
                new ButtonBuilder()
                    .setCustomId(`ot_call_owner_${ownerId}_${openerId}`)
                    .setLabel("استدعاء صاحب الطلب")
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji(emojis.callOwner),
                new ButtonBuilder()
                    .setCustomId(`ot_delete_${ownerId}_${openerId}`)
                    .setLabel("حذف الثريد")
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji(emojis.deleteThread),
            );

            await thread.send({
                embeds: [threadEmbed],
                components: [threadButtons],
            });
            await interaction.editReply({
                content: `**✅ تم فتح ثريد خاص: ${thread}**`,
            });
        } catch (e) {
            await interaction.editReply({
                content: "**❌ تعذّر إنشاء الثريد. تأكد من صلاحيات البوت.**",
            });
        }
    });

    //-------- ot_call_opener: استدعاء فاتح الثريد --------
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isButton()) return;
        if (!interaction.customId.startsWith("ot_call_opener_")) return;
        if (!interaction.guild) return;

        const parts = interaction.customId
            .replace("ot_call_opener_", "")
            .split("_");
        const ownerId = parts[0];
        const openerId = parts[1];

        if (
            interaction.user.id !== ownerId &&
            interaction.user.id !== openerId
        ) {
            return interaction.reply({
                content: "**🚫 هذا الزر للطرفين فقط.**",
                flags: MessageFlags.Ephemeral,
            });
        }
        await interaction.reply({
            content: `<@${openerId}> ** استدعاء من <@${interaction.user.id}>**`,
        });
    });

    //-------- ot_call_owner: استدعاء صاحب الطلب --------
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isButton()) return;
        if (!interaction.customId.startsWith("ot_call_owner_")) return;
        if (!interaction.guild) return;

        const parts = interaction.customId
            .replace("ot_call_owner_", "")
            .split("_");
        const ownerId = parts[0];
        const openerId = parts[1];

        if (
            interaction.user.id !== ownerId &&
            interaction.user.id !== openerId
        ) {
            return interaction.reply({
                content: "**🚫 هذا الزر للطرفين فقط.**",
                flags: MessageFlags.Ephemeral,
            });
        }
        await interaction.reply({
            content: `<@${ownerId}> ** استدعاء من <@${interaction.user.id}>**`,
        });
    });

    //-------- ot_delete: حذف الثريد --------
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isButton()) return;
        if (!interaction.customId.startsWith("ot_delete_")) return;
        if (!interaction.guild) return;

        const parts = interaction.customId.replace("ot_delete_", "").split("_");
        const ownerId = parts[0];
        const openerId = parts[1];

        if (
            interaction.user.id !== ownerId &&
            interaction.user.id !== openerId
        ) {
            return interaction.reply({
                content: "**🚫 هذا الزر للطرفين فقط.**",
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            await interaction.reply({ content: "** سيتم حذف الثريد...**" });
            setTimeout(async () => {
                try {
                    await interaction.channel.delete();
                } catch {}
            }, 2000);
        } catch {
            await interaction
                .reply({
                    content: "**❌ تعذّر حذف الثريد.**",
                    flags: MessageFlags.Ephemeral,
                })
                .catch(() => {});
        }
    });
//-------- order_delete: حذف رسالة الطلب --------
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("order_delete_")) return;
    if (!interaction.guild) return;

    const ownerId = interaction.customId.replace("order_delete_", "");
    const guildId = interaction.guild.id;
    const orderAdmin = await db.get(`orderad_${guildId}`);
    const isAdmin = orderAdmin && interaction.member.roles.cache.has(orderAdmin);
    const isOwner = interaction.user.id === ownerId;

    if (!isOwner && !isAdmin) {
        return interaction.reply({ content: "**🚫 ليس لديك صلاحية لحذف هذا الطلب.**", flags: MessageFlags.Ephemeral });
    }

    try {
        await interaction.message.delete();
        await interaction.reply({ content: "**✅ تم حذف الطلب.**", flags: MessageFlags.Ephemeral });
    } catch {
        await interaction.reply({ content: "**❌ تعذّر حذف الرسالة.**", flags: MessageFlags.Ephemeral });
    }
});

//-------- order_prices: عرض أسعار الطلبات (Container v2) --------
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("order_prices_")) return;
    if (!interaction.guild) return;

    const guildId = interaction.customId.replace("order_prices_", "");
    const evrypri = await db.get(`order-evrypri_${guildId}`);
    const herepri = await db.get(`order-herepri_${guildId}`);
    const bank = await db.get(`bank_${guildId}`);
    const orderImage = await db.get(`buyorderimage_${guildId}`);
    const serverColor = await getColor(guildId, db, config);
    const guildIcon = interaction.guild.iconURL({ size: 1024 });

    const container = new ContainerBuilder().setAccentColor(serverColor);
    const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`# أسـعـار الطـلـبـات`));
    if (guildIcon) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
    container.addSectionComponents(section);
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(ED.shopInteractions_017({ bank, config, evrypri, herepri })));
    if (orderImage) { container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)); container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(orderImage))); }
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${interaction.guild.name} | أسـعـار الطـلـبـات`));

    const ticketBtn = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket-order").setLabel("فتح تكت طلب").setStyle(ButtonStyle.Secondary).setEmoji(emojis.ticketOrder),
    );
    container.addActionRowComponents(ticketBtn);

    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
});
//-------- /mzad-list slash command (Container v2) --------
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "mzad-list") return;
    if (!interaction.guild) return;

    const guildId = interaction.guild.id;
    const rooms = (await db.get(`auctionrooms_${guildId}`)) || [];

    if (rooms.length === 0) {
        return interaction.reply({ content: "**❌ لا توجد رومات مزاد مضبوطة. استخدم `/add-mzad-room` لإضافة رومات.**", flags: MessageFlags.Ephemeral });
    }

    const serverColor = await getColor(guildId, db, config);
    const guildIcon = interaction.guild.iconURL({ size: 1024 });

    let desc = "";
    rooms.forEach((id, i) => {
        const isActive = auctionTimers.has(id);
        const td = auctionTimers.get(id);
        let status = "⚪ فارغ";
        if (isActive) {
            const m = Math.floor(td.remainingTime / 60), s = td.remainingTime % 60;
            status = `${td.paused ? "⏸" : "🟢"} نشط — ${td.draft?.itemName || "؟"} — \`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}\``;
        }
        desc += `**${i + 1}.** <#${id}> — ${status}\n`;
    });

    const container = new ContainerBuilder().setAccentColor(serverColor);
    const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`# قـائـمـة رومـات الـمـزاد`));
    if (guildIcon) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
    container.addSectionComponents(section);
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(ED.shopInteractions_021({ lines: desc })));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${interaction.guild.name} | إجـمـالـي الـرومـات: ${rooms.length}`));

    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
});
    //-------- /start-mzad slash command --------
  async function requireAuctionAdmin(interaction, db) {
    const auctionadminId = await db.get(`auctionad_${interaction.guild.id}`);
    if (!auctionadminId || !interaction.member.roles.cache.has(auctionadminId)) {
        await interaction.reply({
            content: "**🚫 يجب أن تملك رتبة مسؤول المزاد.**",
            flags: MessageFlags.Ephemeral,
        });
        return false;
    }
    return true;
}
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isChatInputCommand()) return;
        if (interaction.commandName !== "start-mzad") return;
        if (!interaction.guild) return;

        const guildId = interaction.guild.id;
        if (!(await requireAuctionAdmin(interaction, db))) return;

        const room = interaction.options.getChannel("room");
        const itemName = interaction.options.getString("item");
        const startPrice = interaction.options.getString("start-price");
        const durationMinutes = interaction.options.getInteger("duration");
        const mentionRaw = interaction.options.getString("mention-type");
        const includesTax = interaction.options.getBoolean("tax");
        const ownerUser =
            interaction.options.getUser("owner") || interaction.user;
        const imageUrl = interaction.options.getString("image-url") || null;

        let mentionType;
        if (mentionRaw === "everyone") mentionType = "@everyone";
        else if (mentionRaw === "here") mentionType = "@here";
        else {
            const mzadRoleId = await db.get(`auctionmzadrole_${guildId}`);
            if (!mzadRoleId)
                return interaction.reply({
                    content:
                        "**❌ لم يتم تعيين رول المزاد. استخدم `/setup auction-mzad-role` أولاً.**",
                    flags: MessageFlags.Ephemeral,
                });
            mentionType = `<@&${mzadRoleId}>`;
        }

        const roomId = room.id;
        const isActive = await db.get(`active_auction_${roomId}`);
        if (isActive)
            return interaction.reply({
                content: "**❌ يوجد مزاد نشط في هذا الروم.**",
                flags: MessageFlags.Ephemeral,
            });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const roomChannel = interaction.guild.channels.cache.get(roomId);
        if (!roomChannel)
            return interaction.editReply("**❌ الروم غير موجود.**");

        const draft = {
            itemName,
            includesTax,
            startPrice,
            durationMinutes,
            imageUrl,
            mentionType,
            owner: ownerUser.id,
            paidPrice: 0,
            originalPrice: 0,
        };
        const initRem = durationMinutes * 60;

        await roomChannel.permissionOverwrites.edit(
            interaction.guild.roles.everyone,
            { SendMessages: true },
        );

        const auctionMsg = await roomChannel.send({
            content: _buildAuctionMsg(draft, initRem),
        });

        if (imageUrl) {
            try {
                await roomChannel.send({
                    files: [{ attachment: imageUrl, name: "auction.png" }],
                });
            } catch {
                try {
                    await roomChannel.send(`**صورة السلعة:**\n${imageUrl}`);
                } catch {}
            }
        }

        const auctionRules = await db.get(`mzad_rules_${guildId}`);
        if (auctionRules) {
            await roomChannel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(" قوانين المزاد")
                        .setDescription(
                            ED.shopInteractions_022({ auctionRules }),
                        )
                        .setColor(await getColor(guildId, db, config))
                        .setTimestamp(),
                ],
            });
        }

        const controlMsg = await roomChannel.send({
            content: "**— لوحة تحكم المزاد (للمسؤولين فقط) —**",
            components: [_buildControlRow(roomId)],
        });

        await db.set(`active_auction_${roomId}`, {
            ownerId: ownerUser.id,
            guildId,
            startedAt: Date.now(),
            draft,
            remainingTime: initRem,
            auctionMsgId: auctionMsg.id,
            controlMsgId: controlMsg.id,
        });

        const timerData = {
            remainingTime: initRem,
            paused: false,
            guild: interaction.guild,
            roomChannel,
            draft,
            guildId,
            auctionMsg,
            controlMsg,
            oneMinuteNoticeSent: false,
            interval: null,
        };
        auctionTimers.set(roomId, timerData);
        startAuctionInterval(timerData, roomId);

        await interaction.editReply(
            `**✅ تم إطلاق المزاد في ${roomChannel} بنجاح.**`,
        );
    });

    //-------- /mzad-stats slash command --------
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isChatInputCommand()) return;
        if (interaction.commandName !== "mzad-stats") return;
        if (!interaction.guild) return;

        const guildId = interaction.guild.id;
        const stats = (await db.get(`auction_stats_${guildId}`)) || {
            total: 0,
            ended: 0,
            cancelled: 0,
            earnings: 0,
        };
        const active = [];
        for (const [roomId] of auctionTimers) {
            const td = auctionTimers.get(roomId);
            if (td?.guildId === guildId) {
                const m = Math.floor(td.remainingTime / 60),
                    s = td.remainingTime % 60;
                active.push(
                    `<#${roomId}> — ${td.draft?.itemName || "؟"} — ${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} ${td.paused ? "⏸" : "▶️"}`,
                );
            }
        }

        const embed = new EmbedBuilder()
            .setTitle(" إحصائيات المزادات")
            .setColor(await getColor(guildId, db, config))
            .addFields(
                {
                    name: " إجمالي المزادات",
                    value: `${stats.total || 0}`,
                    inline: true,
                },
                {
                    name: " انتهت بنجاح",
                    value: `${stats.ended || 0}`,
                    inline: true,
                },
                {
                    name: " ملغاة",
                    value: `${stats.cancelled || 0}`,
                    inline: true,
                },
                {
                    name: " إجمالي الأرباح",
                    value: `${stats.earnings || 0}`,
                    inline: false,
                },
                {
                    name: ` مزادات نشطة (${active.length})`,
                    value: active.length > 0 ? active.join("\n") : "لا يوجد",
                    inline: false,
                },
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    });

    // ---- core: interval runner ----
    function startAuctionInterval(td, roomId) {
        let dbTick = 0;
        td.interval = setInterval(async () => {
            if (td.paused) return;
            td.remainingTime--;
            dbTick++;

            if (dbTick % 10 === 0) {
                try {
                    const snap = await db.get(`active_auction_${roomId}`);
                    if (snap)
                        await db.set(`active_auction_${roomId}`, {
                            ...snap,
                            remainingTime: td.remainingTime,
                        });
                } catch {}
            }

            try {
                await td.auctionMsg.edit({
                    content: _buildAuctionMsg(td.draft, td.remainingTime),
                });
            } catch {
                clearInterval(td.interval);
                auctionTimers.delete(roomId);
                return;
            }

            if (td.remainingTime === 60 && !td.oneMinuteNoticeSent) {
                td.oneMinuteNoticeSent = true;
                await td.roomChannel.send(
                    "**⚠️ سينتهي المزاد بعد دقيقة واحدة.**",
                );
            }

            if (td.remainingTime <= 0) {
                clearInterval(td.interval);
                auctionTimers.delete(roomId);
                await db.delete(`active_auction_${roomId}`);
                try {
                    await td.controlMsg.delete();
                } catch {}
                await endAuction(td, roomId);
            }
        }, 1000);
    }

    // ---- core: send auction log + update stats ----
    async function sendAuctionLog(
        guild,
        draft,
        guildId,
        roomId,
        reason,
        cancelledBy,
    ) {
        try {
            const logsId = await db.get(`logs_${guildId}`);
            if (logsId) {
                const logsChannel = guild.channels.cache.get(logsId);
                if (logsChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle(
                            reason === "ended"
                                ? "✅ انتهى مزاد بنجاح"
                                : "❌ تم إلغاء مزاد",
                        )
                        .setColor(await getColor(guildId, db, config))
                        .addFields(
                            {
                                name: "السلعة",
                                value: draft?.itemName || "—",
                                inline: true,
                            },
                            {
                                name: "صاحب المزاد",
                                value: draft?.owner ? `<@${draft.owner}>` : "—",
                                inline: true,
                            },
                            {
                                name: "السعر المبدئي",
                                value: draft?.startPrice || "—",
                                inline: true,
                            },
                            {
                                name: "الضريبة",
                                value: draft?.includesTax ? "نعم" : "لا",
                                inline: true,
                            },
                            {
                                name: "المنشن",
                                value: draft?.mentionType || "—",
                                inline: true,
                            },
                            {
                                name: "الروم",
                                value: `<#${roomId}>`,
                                inline: true,
                            },
                            ...(cancelledBy
                                ? [
                                      {
                                          name: "ألغاه",
                                          value: `<@${cancelledBy}>`,
                                          inline: true,
                                      },
                                  ]
                                : []),
                        )
                        .setTimestamp();
                    await logsChannel.send({ embeds: [logEmbed] });
                }
            }
            const stats = (await db.get(`auction_stats_${guildId}`)) || {
                total: 0,
                ended: 0,
                cancelled: 0,
                earnings: 0,
            };
            stats.total = (stats.total || 0) + 1;
            if (reason === "ended") stats.ended = (stats.ended || 0) + 1;
            else stats.cancelled = (stats.cancelled || 0) + 1;
            if (draft?.paidPrice)
                stats.earnings = (stats.earnings || 0) + draft.paidPrice;
            await db.set(`auction_stats_${guildId}`, stats);
        } catch (e) {
            console.error("sendAuctionLog error:", e);
        }
    }

    // ---- core: restore timers on bot restart ----
    async function restoreAuctionTimers() {
        try {
            await new Promise((r) => setTimeout(r, 3000));
            const allData = await db.all();
            const activeKeys = allData.filter(
                (e) => e.id && e.id.startsWith("active_auction_"),
            );
            for (const entry of activeKeys) {
                const roomId = entry.id.replace("active_auction_", "");
                const data = entry.value;
                if (!data || !data.draft || !data.guildId) continue;

                const guild = client.guilds.cache.get(data.guildId);
                if (!guild) continue;
                const roomChannel = guild.channels.cache.get(roomId);
                if (!roomChannel) continue;

                const rem =
                    typeof data.remainingTime === "number"
                        ? data.remainingTime
                        : 60;
                if (rem <= 0) {
                    await db.delete(`active_auction_${roomId}`);
                    continue;
                }

                await roomChannel.send(
                    "**🔄 جارٍ استعادة المزاد بعد إعادة تشغيل البوت...**",
                );
                const auctionMsg = await roomChannel.send({
                    content: _buildAuctionMsg(data.draft, rem),
                });

                if (data.draft.imageUrl) {
                    try {
                        await roomChannel.send({
                            files: [
                                {
                                    attachment: data.draft.imageUrl,
                                    name: "auction.png",
                                },
                            ],
                        });
                    } catch {
                        try {
                            await roomChannel.send(
                                `**صورة السلعة:**\n${data.draft.imageUrl}`,
                            );
                        } catch {}
                    }
                }

                const controlMsg = await roomChannel.send({
                    content: "**— لوحة تحكم المزاد (للمسؤولين فقط) —**",
                    components: [_buildControlRow(roomId)],
                });

                await db.set(`active_auction_${roomId}`, {
                    ...data,
                    remainingTime: rem,
                    auctionMsgId: auctionMsg.id,
                    controlMsgId: controlMsg.id,
                });

                const td = {
                    remainingTime: rem,
                    paused: false,
                    guild,
                    roomChannel,
                    draft: data.draft,
                    guildId: data.guildId,
                    auctionMsg,
                    controlMsg,
                    oneMinuteNoticeSent: rem <= 60,
                    interval: null,
                };
                auctionTimers.set(roomId, td);
                startAuctionInterval(td, roomId);
                console.log(
                    `[Auction] Restored timer for room ${roomId} (${rem}s remaining)`,
                );
            }
        } catch (e) {
            console.error("restoreAuctionTimers error:", e);
        }
    }

    if (client.isReady()) {
        restoreAuctionTimers();
    } else {
        client.once("ready", () => restoreAuctionTimers());
    }

//======================================================
//              نظام تكت شراء الرتب (Container v2)
//======================================================

//-------- ticket-roles: فتح تكت شراء رتبة (Container v2) --------
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== "ticket-roles") return;
    if (!interaction.guild) return;

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    const rolesCat = await db.get(`roles_cat_${guildId}`);
    if (!rolesCat)
        return interaction.reply({ content: "**❌ لم يتم إعداد كتاغوري شراء الرتب. استخدم `/setup`.**", flags: MessageFlags.Ephemeral });
    const rolesAdmin = await db.get(`roles_admin_${guildId}`);
    if (!rolesAdmin)
        return interaction.reply({ content: "**❌ لم يتم إعداد مسؤول شراء الرتب. استخدم `/setup`.**", flags: MessageFlags.Ephemeral });
    const buyRoles = (await db.get(`buy_roles_${guildId}`)) || [];
    if (buyRoles.length === 0)
        return interaction.reply({ content: "**❌ لا توجد رتب متاحة للشراء حالياً.**", flags: MessageFlags.Ephemeral });

    const existing = await db.get(`roles_ticket_${userId}_${guildId}`);
    if (existing) {
        const existingCh = interaction.guild.channels.cache.get(existing.channelId);
        if (existingCh)
            return interaction.reply({ content: `**❌ لديك تذكرة مفتوحة بالفعل: <#${existingCh.id}>**`, flags: MessageFlags.Ephemeral });
        await db.delete(`roles_ticket_${userId}_${guildId}`);
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const adminRole = interaction.guild.roles.cache.get(rolesAdmin);
    const safeName = interaction.user.username.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, "-").slice(0, 24) || "user";
    const bankBotIdForRoles = "282859044593598464";
    const ticketChannel = await interaction.guild.channels.create({
        name: `roles-${safeName}`,
        type: ChannelType.GuildText,
        parent: rolesCat,
        permissionOverwrites: [
            { id: userId, allow: ["SendMessages", "EmbedLinks", "AttachFiles", "ViewChannel", "ReadMessageHistory"] },
            { id: interaction.guild.roles.everyone, deny: ["SendMessages", "ViewChannel"] },
            { id: adminRole?.id || rolesAdmin, allow: ["SendMessages", "EmbedLinks", "AttachFiles", "ViewChannel", "ManageRoles", "ReadMessageHistory"] },
            { id: bankBotIdForRoles, allow: ["SendMessages", "ViewChannel", "ReadMessageHistory", "EmbedLinks"] },
        ],
    });

    await db.set(`roles_ticket_${userId}_${guildId}`, { userId, channelId: ticketChannel.id });
    await db.set(`roles_ticket_channel_${ticketChannel.id}`, { ownerId: userId, guildId });

    const bank = await db.get(`bank_${guildId}`);
    const rolesImage = await db.get(`buyrolesimage_${guildId}`);
    const serverColor = await getColor(guildId, db, config);
    const guildIcon = interaction.guild.iconURL({ size: 1024 });

    const priceLines = buyRoles.map((r) => `**<@&${r.roleId}>** — السعر: \`${r.price}\``).join("\n");

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`roles_pick_${userId}`)
        .setPlaceholder("اختر الرتبة التي تريد شراءها")
        .addOptions(buyRoles.map((r) => ({ label: r.name, description: `السعر: ${r.price} | ${r.benefits.slice(0, 50)}`, value: r.roleId })));

    const actionBtns = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`custom_role_buy_ticket_${userId}`).setLabel("شراء رتبة خاصة").setStyle(ButtonStyle.Primary).setEmoji("🎨"),
        new ButtonBuilder().setCustomId(`roles_close_${userId}`).setLabel("إغلاق التكت").setStyle(ButtonStyle.Secondary).setEmoji(emojis.close),
    );

    const container = new ContainerBuilder().setAccentColor(serverColor);
    const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`# تـكـت شـراء الـرتـب`));
    if (guildIcon) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
    container.addSectionComponents(section);
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### أسعار الرتب المتاحة\n${priceLines}\n\nالتحويل لـ <@!${bank || "غير محدد"}>\n**اختر الرتبة من القائمة أدناه**`));
    if (rolesImage) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(rolesImage)));
    }
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${interaction.guild.name} | نـظـام الـرتـب`));
container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`<@${userId}> <@&${rolesAdmin}>`)
);

container.addActionRowComponents(new ActionRowBuilder().addComponents(selectMenu));
container.addActionRowComponents(actionBtns);

await ticketChannel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
});
    await interaction.editReply({ content: `**✅ تم إنشاء تذكرتك: <#${ticketChannel.id}>**` });
});

//-------- roles_close button --------
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("roles_close_")) return;
    if (!interaction.guild) return;
    const meta = await db.get(`roles_ticket_channel_${interaction.channel.id}`);
    const ownerId = meta?.ownerId || interaction.user.id;
    const gId = meta?.guildId || interaction.guild.id;
    await db.delete(`roles_ticket_${ownerId}_${gId}`);
    await db.delete(`roles_ticket_channel_${interaction.channel.id}`);
    await sendTicketRatingDM(ownerId, gId, "roles").catch(() => {});
    await interaction.reply({ content: "**🔒 سيتم إغلاق التكت...**" });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
});

//-------- custom_role_buy_ticket: شراء رتبة خاصة من داخل التكت (مدفوع) --------
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("custom_role_buy_ticket_")) return;
    if (!interaction.guild) return;

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const channel = interaction.channel;

    const meta = await db.get(`roles_ticket_channel_${channel.id}`);
    if (!meta || meta.ownerId !== userId) return interaction.reply({ content: "**🚫 هذا الخيار لصاحب التكت فقط.**", flags: MessageFlags.Ephemeral });

    const price = await db.get(`customroleprice_${guildId}`);
    const bank = await db.get(`bank_${guildId}`);
    if (!price) return interaction.reply({ content: "❌ سعر الرتبة الخاصة غير محدد.", flags: MessageFlags.Ephemeral });
    if (!bank) return interaction.reply({ content: "❌ البنك غير محدد.", flags: MessageFlags.Ephemeral });

    const totalPrice = Math.floor(price * (20 / 19) + 1);
    await interaction.reply({ content: `**\`السعر مع الضريبة: ${totalPrice}\`**`, flags: MessageFlags.Ephemeral });
    await channel.send(`#credit <@!${bank}> ${totalPrice}`);
    await channel.send(`\`\`\`#credit ${bank} ${totalPrice}\`\`\``);

    const bankBotId = "282859044593598464";
    const collector = channel.createMessageCollector({ filter: (m) => m.author.id === bankBotId, time: 120000 });

    collector.on("collect", (c) => {
        const content = c.content;
        let paidAmount = 0;
        const btMatch = content.match(/`\$?([\d,]+(?:\.\d+)?)`/);
        const engMatch = content.match(/transferred\s+\$?([\d,]+)/i);
        const arMatch = content.match(/بتحويل\s+\$?([\d,]+)/);
        const found = btMatch || engMatch || arMatch;
        if (found) paidAmount = Number(found[1].replace(/,/g, ""));
        const bankMentionOk = content.includes(`<@!${bank}>`) || content.includes(`<@${bank}>`);
        const isTransfer = content.includes("has transferred") || content.includes("قام بتحويل");
        if (isTransfer && bankMentionOk && paidAmount >= price) collector.stop("DONE");
    });

    collector.on("end", async (collected, reason) => {
        if (reason !== "DONE") return channel.send("**⏰ انتهى الوقت.**");
        await db.add(`ernss_${guildId}.erns`, Number(price));
        await db.add(`ernsg.ernsg`, Number(price));
        await channel.send("**✅ تم التحويل. ابدأ بإنشاء رتبتك:**");

        const askAndCollect = async (promptText) => {
            await channel.send(promptText);
            try {
                const msgs = await channel.awaitMessages({ filter: (m) => m.author.id === userId, max: 1, time: 180000, errors: ["time"] });
                return msgs.first().content.trim();
            } catch { await channel.send("**⌛ انتهى الوقت.**"); return null; }
        };

        let roleName = await askAndCollect("**١) اكتب اسم الرتبة (بدون روابط، أقصى 32 حرف):**");
        if (!roleName) return;
        if (/(https?:\/\/[^\s]+)|(discord\.(gg|io|me|li|com\/invite)\/.+)/gi.test(roleName) || roleName.length > 32) return channel.send("**❌ اسم غير صالح.**");

        let hexInput = await askAndCollect("**٢) أرسل كود لون الرتبة (Hex) مثال: `#5865F2`:**");
        if (!hexInput) return;
        const hexMatch = hexInput.trim().match(/^#?([0-9A-Fa-f]{6})$/);
        if (!hexMatch) return channel.send("**❌ كود غير صحيح.**");
        const colorInt = parseInt(hexMatch[1], 16);

        const guild = interaction.guild;
        const hasRoleIcons = guild.features?.includes("ROLE_ICONS") || guild.premiumTier >= 2;
        let iconOption = null;

        if (hasRoleIcons) {
            const iconAnswer = await askAndCollect("**ارسل ايموجي الي  تبيه ايكون**");
            if (iconAnswer && iconAnswer.toLowerCase() !== "تخطي" && iconAnswer.toLowerCase() !== "skip") {
                const customEmojiMatch = iconAnswer.match(/^<(a?):(\w+):(\d+)>$/);
                if (customEmojiMatch) {
                    const animated = customEmojiMatch[1] === "a";
                    const emojiId = customEmojiMatch[3];
                    const ext = animated ? "gif" : "png";
                    iconOption = { type: "image", value: `https://cdn.discordapp.com/emojis/${emojiId}.${ext}` };
                } else if (/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})$/u.test(iconAnswer)) {
                    iconOption = { type: "emoji", value: iconAnswer };
                }
            }
        }

        await channel.send("**⏳ جارٍ إنشاء الرتبة...**");
        try {
            const createOptions = {
                name: roleName, color: colorInt,
                permissions: [PermissionFlagsBits.AttachFiles, PermissionFlagsBits.AddReactions],
                reason: `شراء رتبة خاصة بواسطة ${interaction.user.tag}`,
            };
            if (iconOption?.type === "emoji") createOptions.unicodeEmoji = iconOption.value;
            if (iconOption?.type === "image") createOptions.icon = iconOption.value;

            const newRole = await guild.roles.create(createOptions);
            try { await newRole.setPosition(guild.roles.highest.position - 1); } catch {}

            let member = guild.members.cache.get(userId);
            if (!member) member = await guild.members.fetch(userId).catch(() => null);
            if (member) await member.roles.add(newRole.id);

            const successContainer = new ContainerBuilder()
                .setAccentColor(colorInt)
                .addSectionComponents(new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ✅ تم إنشاء رتبتك`)))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**الرتبة:** <@&${newRole.id}>\n**اللون:** \`#${hexMatch[1].toUpperCase()}\`\n**الأيقونة:** ${iconOption ? "✅" : "بدون"}`));
            await channel.send({ components: [successContainer], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            await channel.send("**❌ فشل إنشاء الرتبة.**");
        }
    });
});

//-------- roles_pick select menu: اختيار الرتبة وبدء الدفع --------
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;
    if (!interaction.customId.startsWith("roles_pick_")) return;
    if (!interaction.guild) return;

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const channel = interaction.channel;

    const meta = await db.get(`roles_ticket_channel_${channel.id}`);
    if (!meta || meta.ownerId !== userId) return interaction.reply({ content: "**🚫 هذا الخيار لصاحب التكت فقط.**", flags: MessageFlags.Ephemeral });

    const selectedRoleId = interaction.values[0];
    const buyRoles = (await db.get(`buy_roles_${guildId}`)) || [];
    const roleData = buyRoles.find((r) => r.roleId === selectedRoleId);
    if (!roleData) return interaction.reply({ content: "**❌ الرتبة لم تعد متاحة.**", flags: MessageFlags.Ephemeral });

    const bank = await db.get(`bank_${guildId}`);
    if (!bank) return interaction.reply({ content: "**❌ لم يتم تحديد البنك.**", flags: MessageFlags.Ephemeral });

    const basePrice = Number(roleData.price);
    const roleTax = Math.floor(basePrice * (20 / 19) + 1);
    await interaction.reply({ content: `**✅ اخترت: <@&${selectedRoleId}> — السعر: \`${basePrice}\`**\nجارٍ بدء عملية الدفع...`, flags: MessageFlags.Ephemeral });
    await channel.send(`#credit <@!${bank}> ${roleTax}\n\`\`\`#credit ${bank} ${roleTax}\`\`\``);
    await channel.send(`يرجى التحويل الآن <@${userId}> — المبلغ: **${roleTax}** (السعر ${basePrice} + رسوم ProBot)`);

    const bankBotId = "282859044593598464";
    const collector = channel.createMessageCollector({ filter: (m) => m.author.id === bankBotId, time: 300000 });

    collector.on("collect", async (m) => {
        const fullText = `${m.content || ""} ${m.embeds?.[0]?.description || ""} ${m.embeds?.[0]?.title || ""}`;
        let paidAmount = 0;
        const found = fullText.match(/`\$?([\d,]+(?:\.\d+)?)`/) || fullText.match(/transferred\s+\$?([\d,]+)/i) || fullText.match(/بتحويل\s+\$?([\d,]+)/);
        if (found) paidAmount = Number(found[1].replace(/,/g, ""));
        const bankOk = fullText.includes(`<@!${bank}>`) || fullText.includes(`<@${bank}>`);
        const isTransfer = fullText.includes("has transferred") || fullText.includes("قام بتحويل");
        if (isTransfer && bankOk && paidAmount >= basePrice) collector.stop("DONE");
    });

    collector.on("end", async (_, reason) => {
        if (reason !== "DONE") {
            const adminRoleId = await db.get(`shopad_${guildId}`);
            await channel.send({
                content: adminRoleId ? `<@&${adminRoleId}>` : "",
                embeds: [new EmbedBuilder().setTitle("⏰ انتهى وقت التحويل").setDescription(ED.shopInteractions_023({ basePrice, roleTax, selectedRoleId, userId })).setColor(await getColor(guildId, db, config)).setTimestamp()],
            }).catch(() => {});
            return;
        }

        try {
            let member = interaction.guild.members.cache.get(userId) || await interaction.guild.members.fetch(userId).catch(() => null);
            if (!member) throw new Error("Member not found");
            await member.roles.add(selectedRoleId);
            await channel.send(`** تهانينا <@${userId}>! تم منحك رتبة <@&${selectedRoleId}>.**`);

            const logsChannelId = await db.get(`logs_${guildId}`);
            const logsChannel = interaction.guild.channels.cache.get(logsChannelId);
            if (logsChannel) {
                await logsChannel.send({ embeds: [new EmbedBuilder().setTitle(" شراء رتبة جديدة").addFields({ name: " العضو", value: `<@${userId}>`, inline: true }, { name: " الرتبة", value: `<@&${selectedRoleId}>`, inline: true }, { name: " المبلغ", value: `${roleData.price}`, inline: true }).setColor(await getColor(guildId, db, config)).setTimestamp()] });
            }

            await channel.send("**✅ سيتم إغلاق هذا التكت تلقائياً خلال 15 ثانية...**");
            await db.delete(`roles_ticket_${userId}_${guildId}`);
            await db.delete(`roles_ticket_channel_${channel.id}`);
            setTimeout(() => channel.delete().catch(() => {}), 15000);
        } catch (e) {
            const adminRoleId = await db.get(`shopad_${guildId}`);
            await channel.send({ content: adminRoleId ? `<@&${adminRoleId}>` : "", embeds: [new EmbedBuilder().setTitle("⚠️ تم استلام الدفع — خطأ في إعطاء الرتبة").setDescription(ED.shopInteractions_024({ reason: e.message, roleData, selectedRoleId, userId })).setColor(_ec.color(guildId)).setTimestamp()] });
        }
    });
});

//-------- roles_prices: عرض أسعار الرتب (Container v2) --------
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("roles_prices_")) return;
    if (!interaction.guild) return;

    const guildId = _ec.gid(interaction);
    const buyRoles = (await db.get(`buy_roles_${guildId}`)) || [];
    if (buyRoles.length === 0) return interaction.reply({ content: "**❌ لا توجد رتب مضافة بعد.**", flags: MessageFlags.Ephemeral });

    const color = _ec.color(guildId);
    const imageUrl = (await db.get(`priceRolesImage_${guildId}`)) || (await db.get(`image_${guildId}`));
    const guildIcon = interaction.guild.iconURL({ size: 1024 });

    let desc = "";
    for (const r of buyRoles) desc += `**<@&${r.roleId}>** — السعر: **${r.price}** كردت\n> المميزات: ${r.benefits}\n\n`;

    const container = new ContainerBuilder().setAccentColor(color);
    const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`# أسـعـار الـرتـب الـمـتـاحـة`));
    if (guildIcon) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
    container.addSectionComponents(section);
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(desc));
    if (imageUrl) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl)));
    }
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${interaction.guild.name} | أسـعـار الـرتـب`));

    const buyBtn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("ticket-roles").setLabel("شراء رتبة").setStyle(ButtonStyle.Secondary).setEmoji(emojis.ticketRoles));
    container.addActionRowComponents(buyBtn);

    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
});

//-------- roles_delete_panel: زر حذف رتبة --------
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("roles_delete_panel_")) return;
    if (!interaction.guild) return;
    if (!interaction.member.permissions.has("Administrator")) return interaction.reply({ content: "**❌ يجب أن تكون لديك صلاحية Administrator.**", flags: MessageFlags.Ephemeral });

    const guildId = interaction.customId.replace("roles_delete_panel_", "");
    const roles = (await db.get(`buy_roles_${guildId}`)) || [];
    if (roles.length === 0) return interaction.reply({ content: "**❌ لا توجد رتب مضافة.**", flags: MessageFlags.Ephemeral });

    const menu = new StringSelectMenuBuilder().setCustomId(`roles_delete_select_${guildId}`).setPlaceholder("اختر الرتبة التي تريد حذفها").addOptions(roles.map((r) => ({ label: r.name, description: `السعر: ${r.price}`, value: r.roleId })));
    await interaction.reply({ content: "**اختر الرتبة للحذف:**", components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral });
});

// ========== +رتب (تسطيب سعر الرتبة الخاصة + إرسال بانل) ==========
client.on("messageCreate", async (message) => {
    if (!message.content.startsWith("+رتب")) return;
    if (!message.guild) return;
    const guildId = message.guild.id;
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply("❌ هذا الامر للادارة العليا فقط.");

    const args = message.content.split(" ");
    const price = parseInt(args[1]);
    if (!price || isNaN(price)) return message.reply("❌ استخدم: `+رتب <السعر>`");

    await db.set(`customroleprice_${guildId}`, price);

    const serverColor = _ec.color(guildId);
    const guildIcon = message.guild.iconURL({ size: 1024 });
    const imageUrl = await db.get(`image_${guildId}`);

    const container = new ContainerBuilder().setAccentColor(serverColor);
    const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`# شـراء رتـبـة خـاصـة`));
    if (guildIcon) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
    container.addSectionComponents(section);
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**أنشئ رتبتك الخاصة بك!**\n**السعر:** \`${price}\` كردت\n**السعر مع الضريبة:** \`${Math.floor(price * (20 / 19) + 1)}\` كردت\n\n**المميزات:**\n- اسم + لون + أيقونة من اختيارك\n- صلاحية إرسال صور ورياكشن\n- الرتبة تنشأ بأعلى موضع ممكن`));
    if (imageUrl) { container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)); container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl))); }
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${message.guild.name} | نـظـام الـرتـب الـخـاصـة`));

    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("ticket-roles").setLabel("شراء رتبة خاصة").setStyle(ButtonStyle.Primary));
    container.addActionRowComponents(row);

    await message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
    await message.delete().catch(() => {});
});
    //======================================================
    //           نظام تكتات الدعم الفني والتشهير
    //======================================================

    // دالة مشتركة لإنشاء تكت
  // ============================================
// 1. الدوال المساعدة (من المزاد)
// ============================================
// linkRegex و isLink موجودين من المزاد، لا تعيد تعريفهم

// ============================================
// 2. _createTicket - إنشاء تكت (دعم / تشهير) - Container v2
// ============================================
async function _createTicket(interaction, type) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const isScam = type === "scam";

    const supportCat = await db.get(`support_cat_${guildId}`);
    if (!supportCat)
        return interaction.reply({
            content: "**❌ لم يتم إعداد كتاغوري الدعم. استخدم `/setup`.**",
            flags: MessageFlags.Ephemeral,
        });

    const adminKey = isScam ? `scam_admin_${guildId}` : `support_admin_${guildId}`;
    let adminRoleId = await db.get(adminKey);
    if (!adminRoleId) adminRoleId = await db.get(`support_admin_${guildId}`);
    if (!adminRoleId)
        return interaction.reply({
            content: "**❌ لم يتم إعداد مسؤول الدعم. استخدم `/setup`.**",
            flags: MessageFlags.Ephemeral,
        });

    const dbKey = `${type}_ticket_${userId}_${guildId}`;
    const existing = await db.get(dbKey);
    if (existing) {
        const existingCh = interaction.guild.channels.cache.get(existing.channelId);
        if (existingCh)
            return interaction.reply({
                content: `**❌ لديك تذكرة مفتوحة بالفعل: <#${existingCh.id}>**`,
                flags: MessageFlags.Ephemeral,
            });
        await db.delete(dbKey);
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const ticketNum = Math.floor(Math.random() * 9000) + 1000;
    const prefix = isScam ? "تشهير" : "دعم";
    const adminRole = interaction.guild.roles.cache.get(adminRoleId);
    const safeName = interaction.user.username.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, "-").slice(0, 20) || "user";

    let ticketChannel;
    try {
        ticketChannel = await interaction.guild.channels.create({
            name: `${prefix}-${ticketNum}-${safeName}`,
            type: ChannelType.GuildText,
            parent: supportCat,
            permissionOverwrites: [
                { id: userId, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "AttachFiles", "EmbedLinks"] },
                { id: interaction.guild.roles.everyone, deny: ["ViewChannel"] },
                { id: adminRole?.id || adminRoleId, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "AttachFiles", "EmbedLinks", "ManageMessages"] },
            ],
        });
    } catch (err) {
        console.error("[_createTicket] فشل إنشاء روم التكت:", err);
        return interaction.editReply({
            content: "❌ **حدث خطأ أثناء إنشاء التذكرة. تأكد من صلاحيات البوت (إدارة الرومات) وحاول مرة أخرى.**",
        });
    }

    const ticketData = {
        userId,
        channelId: ticketChannel.id,
        guildId,
        ticketNum,
        type,
        createdAt: Date.now(),
        claimedBy: null,
        status: "open",
    };
    await db.set(dbKey, ticketData);
    await db.set(`support_ticket_ch_${ticketChannel.id}`, { ...ticketData, dbKey });

    const imageUrl = await db.get(`image_${guildId}`);
    const serverColor = await getColor(guildId, db, config);
    const guildIcon = interaction.guild.iconURL({ size: 1024 });

    // Container v2
    const container = new ContainerBuilder().setAccentColor(serverColor);
    const section = new SectionBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            isScam ? `# 🚨 تكت تشهير | #${ticketNum}` : `# 🎫 تكت دعم فني | #${ticketNum}`
        )
    );
    if (guildIcon) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
    container.addSectionComponents(section);
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            ED.shopInteractions_026({ interaction, isScam, ticketNum })
        )
    );
    if (imageUrl) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl)));
    }
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# ${interaction.guild.name} | نظام التكتات`)
    );

    // أزرار التحكم
    const controlBtns = [
        new ButtonBuilder().setCustomId(`sup_claim_${ticketChannel.id}`).setLabel("استلام").setStyle(ButtonStyle.Success).setEmoji(emojis.claim),
    ];
    if (isScam)
        controlBtns.push(
            new ButtonBuilder().setCustomId(`scam_form_${ticketChannel.id}`).setLabel("بدء التشهير").setStyle(ButtonStyle.Secondary).setEmoji(emojis.report),
        );
    controlBtns.push(
        new ButtonBuilder().setCustomId(`sup_add_${ticketChannel.id}`).setLabel("إضافة عضو").setStyle(ButtonStyle.Secondary).setEmoji(emojis.addMember),
        new ButtonBuilder().setCustomId(`sup_remove_${ticketChannel.id}`).setLabel("إزالة عضو").setStyle(ButtonStyle.Secondary).setEmoji(emojis.removeMember),
        new ButtonBuilder().setCustomId(`sup_close_${ticketChannel.id}`).setLabel("إغلاق").setStyle(ButtonStyle.Danger).setEmoji(emojis.close),
    );
    container.addActionRowComponents(new ActionRowBuilder().addComponents(...controlBtns));

    container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`<@${userId}> <@&${adminRoleId}>`)
);

await ticketChannel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
});

    await interaction.editReply({
        content: `**✅ تم إنشاء تذكرتك: <#${ticketChannel.id}>**`,
    });
}

// ============================================
// 3. أزرار فتح التكت
// ============================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId === "ticket-support" && interaction.guild) {
        await _createTicket(interaction, "support");
    }
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId === "ticket-scam" && interaction.guild) {
        await _createTicket(interaction, "scam");
    }
});

// ============================================
// 4. sup_claim: استلام التكت
// ============================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("sup_claim_")) return;
    if (!interaction.guild) return;

    const channelId = interaction.customId.replace("sup_claim_", "");
    const guildId = interaction.guild.id;
    const meta = await db.get(`support_ticket_ch_${channelId}`);
    if (!meta)
        return interaction.reply({
            content: "بيانات التكت غير موجودة.",
            flags: MessageFlags.Ephemeral,
        });

    const adminKey = meta.type === "scam" ? `scam_admin_${guildId}` : `support_admin_${guildId}`;
    let adminRoleId = (await db.get(adminKey)) || (await db.get(`support_admin_${guildId}`));
    if (adminRoleId && !interaction.member.roles.cache.has(adminRoleId) && !interaction.member.permissions.has("Administrator")) {
        return interaction.reply({
            content: "هذا الزر لمسؤولي الدعم فقط.",
            flags: MessageFlags.Ephemeral,
        });
    }
    if (meta.claimedBy)
        return interaction.reply({
            content: `التكت مُستلَم بالفعل من <@${meta.claimedBy}>.`,
            flags: MessageFlags.Ephemeral,
        });

    // ✅ تأخير الرد
    await interaction.deferUpdate();

    meta.claimedBy = interaction.user.id;
    meta.claimedAt = Date.now();
    meta.status = "claimed";
    await db.set(`support_ticket_ch_${channelId}`, meta);
    await db.set(meta.dbKey, meta);

    const currentPts = (await db.get(`ticket_pts_${interaction.user.id}_${guildId}`)) || 0;
    await db.set(`ticket_pts_${interaction.user.id}_${guildId}`, currentPts + 1);

    // ✅ إرسال متابعة بدل رد
    const claimContainer = new ContainerBuilder()
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent("# ✅ تم استلام التكت")
                )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**⏱ وقت الاستلام:** <t:${Math.floor(Date.now() / 1000)}:R>\n` +
                `**⭐ نقاطك الحالية:** ${currentPts + 1} نقطة`
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# ${interaction.guild.name} | نظام التكتات`)
        );

    await interaction.followUp({
        components: [claimContainer],
        flags: MessageFlags.IsComponentsV2,
    });

    // لوق
    const logsChannelId = await db.get(`logs_${guildId}`);
    const logsChannel = interaction.guild.channels.cache.get(logsChannelId);
    if (logsChannel) {
        const logContainer = new ContainerBuilder()
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`# ${meta.type === "scam" ? "🚨 استلام تكت تشهير" : "🎫 استلام تكت دعم فني"}`)
                    )
            )
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `**المسؤول المستلم:** <@${interaction.user.id}>\n` +
                    `**صاحب التكت:** <@${meta.userId}>\n` +
                    `**اسم التكت:** <#${channelId}>\n` +
                    `**رقم التكت:** #${meta.ticketNum}\n` +
                    `**وقت الاستلام:** <t:${Math.floor(Date.now() / 1000)}:R>\n` +
                    `**الحالة:** قيد المعالجة`
                )
            )
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# ${interaction.guild.name} | نظام التكتات`)
            );

        await logsChannel.send({
            components: [logContainer],
            flags: MessageFlags.IsComponentsV2,
        });
    }
});
    // ============================================
// 5. scam_form: فورم التشهير التلقائي (نسخة مصلحة بالكامل)
// ============================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("scam_form_")) return;
    if (!interaction.guild) return;

    const channelId = interaction.customId.replace("scam_form_", "");
    const guildId = interaction.guild.id;
    const meta = await db.get(`support_ticket_ch_${channelId}`);
    if (!meta)
        return interaction.reply({
            content: "**❌ بيانات التكت غير موجودة.**",
            flags: MessageFlags.Ephemeral,
        });

    const adminRoleId = (await db.get(`scam_admin_${guildId}`)) || (await db.get(`support_admin_${guildId}`));
    if (adminRoleId && !interaction.member.roles.cache.has(adminRoleId) && !interaction.member.permissions.has("Administrator")) {
        return interaction.reply({
            content: "**❌ فقط مسؤولو الدعم يمكنهم بدء التقرير.**",
            flags: MessageFlags.Ephemeral,
        });
    }

    await interaction.reply({
        content: `** بدأ الإداري <@${interaction.user.id}> استمارة التشهير — جاري طرح الأسئلة...**`,
    });

    const questions = [
        { key: "scammer_name", label: "1️⃣ **اسم/معرف الشخص النصاب في Discord؟**\n*(يفضّل إرسال **منشن** `@user` أو **ID** الرقمي ليتم بانه تلقائياً عند النشر — خلال دقيقتين)*" },
        { key: "what_happened", label: "2️⃣ **كيف قام بالنصب؟**\n*(اشرح ما حدث بالتفصيل)*" },
        { key: "what_lost", label: "3️⃣ **ماذا خسرت؟**\n*(المبلغ أو الشيء الذي أُخذ منك)*" },
        { key: "evidence", label: "4️⃣ **أرسل الأدلة الآن**\n*(صور، مقاطع، أو روابط — عند الانتهاء اكتب `تم`)*" },
    ];

    const answers = {};
    const evidenceTexts = [];
    const evidenceImages = [];
    const ticketOwner = meta.userId;

    const askQuestion = (q) => new Promise(async (resolve) => {
        const qMsg = await interaction.channel.send({ content: q.label });
        const collector = interaction.channel.createMessageCollector({
            filter: (m) => m.author.id === ticketOwner,
            time: 120000,
        });

        if (q.key === "evidence") {
            collector.on("collect", async (m) => {
                // منع الروابط
                if (isLink(m.content)) {
                    await m.delete().catch(() => {});
                    await interaction.channel.send(`**❌ <@${m.author.id}> ممنوع إرسال الروابط!**`);
                    return;
                }
                if (m.content.trim() === "تم") {
                    collector.stop("done");
                    return;
                }
                if (m.attachments.size > 0) {
                    m.attachments.forEach((att) => evidenceImages.push(att.url));
                }
                if (m.content && m.content.trim() !== "تم") {
                    evidenceTexts.push(m.content.trim());
                }
                await m.delete().catch(() => {});
            });
            collector.on("end", (_, reason) => {
                qMsg.delete().catch(() => {});
                const all = [...evidenceTexts, ...evidenceImages];
                resolve(reason === "done" ? (all.length ? all.join("\n") : "لا توجد أدلة") : "⏰ انتهى الوقت");
            });
        } else {
            let answered = false;
            collector.on("collect", async (m) => {
                // منع الروابط
                if (isLink(m.content)) {
                    await m.delete().catch(() => {});
                    await interaction.channel.send(`**❌ <@${m.author.id}> ممنوع إرسال الروابط!**`);
                    return;
                }
                answers[q.key] = m.content;
                await m.delete().catch(() => {});
                answered = true;
                collector.stop("answered");
            });
            collector.on("end", (collected, reason) => {
                qMsg.delete().catch(() => {});
                if (!answered) {
                    answers[q.key] = "⏰ لم يتم الإجابة";
                }
                resolve(answers[q.key]);
            });
        }
    });

    for (const q of questions) {
        await askQuestion(q);
    }

    const scammerName = answers.scammer_name || "—";
    const whatHappened = answers.what_happened || "—";
    const whatLost = answers.what_lost || "—";
    const evidenceText = evidenceTexts.length ? evidenceTexts.join("\n").slice(0, 1024) : "—";
    const evidenceImg = evidenceImages.length ? evidenceImages.join("\n").slice(0, 1024) : "—";

    const imageUrl = await db.get(`image_${guildId}`);
    const serverColor = await getColor(guildId, db, config);
    const guildIcon = interaction.guild.iconURL({ size: 1024 });

    const container = new ContainerBuilder().setAccentColor(serverColor);
    const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🚨 تقرير تشهير — #${meta.ticketNum}`));
    if (guildIcon) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
    container.addSectionComponents(section);
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `**صاحب التقرير:** <@${ticketOwner}>\n` +
            `**المسؤول المُعالج:** <@${interaction.user.id}>\n\n` +
            `**┃ اسم/معرف النصاب:** ${scammerName}\n` +
            `**┃ القصة:** ${whatHappened}\n` +
            `**┃ ماذا خُسر:** ${whatLost}\n` +
            `**┃ الدليل:** ${evidenceText}\n` +
            `**┃ المنشن (صور/مرفقات):** ${evidenceImg}`
        )
    );
    if (imageUrl) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl)));
    }
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${interaction.guild.name} | نظام التشهير`));

    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`scam_publish_${meta.ticketNum}_${guildId}_${ticketOwner}_${interaction.channel.id}`).setLabel("نشر التشهير").setStyle(ButtonStyle.Secondary).setEmoji(emojis.publish),
        new ButtonBuilder().setCustomId(`scam_cancel_${interaction.channel.id}`).setLabel("إلغاء التشهير").setStyle(ButtonStyle.Secondary).setEmoji(emojis.cancelPublish),
    ));

    await interaction.channel.send({
        content: `**✅ تم إكمال التقرير — في انتظار قرار الإدارة:**`,
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    });

    // لوق في قناة اللوق
    const logsChannelId = await db.get(`logs_${guildId}`);
    const logsChannel = interaction.guild.channels.cache.get(logsChannelId);
    if (logsChannel) {
        const logContainer = new ContainerBuilder().setAccentColor(serverColor);
        logContainer.addSectionComponents(new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🚨 تقرير تشهير جديد`)));
        logContainer.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        logContainer.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**صاحب التقرير:** <@${ticketOwner}>\n` +
                `**المسؤول:** <@${interaction.user.id}>\n` +
                `**النصاب:** ${scammerName}\n` +
                `**القصة:** ${whatHappened}\n` +
                `**ماذا خُسر:** ${whatLost}`
            )
        );
        logContainer.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        logContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${interaction.guild.name} | نظام التشهير`));
        await logsChannel.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 });
    }
});

// ============================================
// 6. extractScammerId - استخراج ID النصاب
// ============================================
const extractScammerId = (text) => {
    if (!text || text === "—") return null;
    const mentionMatch = String(text).match(/<@!?(\d{17,20})>/);
    if (mentionMatch) return mentionMatch[1];
    const idMatch = String(text).match(/(\d{17,20})/);
    return idMatch ? idMatch[1] : null;
};

// ============================================
// 7. scam_publish: نشر التشهير + بان تلقائي
// ============================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("scam_publish_")) return;
    if (!interaction.guild) return;

    const adminRoleId = (await db.get(`scam_admin_${interaction.guild.id}`)) || (await db.get(`support_admin_${interaction.guild.id}`));
    if (adminRoleId && !interaction.member.roles.cache.has(adminRoleId) && !interaction.member.permissions.has("Administrator")) {
        return interaction.reply({
            content: "**❌ فقط مسؤولو التشهير يمكنهم النشر.**",
            flags: MessageFlags.Ephemeral,
        });
    }

    const parts = interaction.customId.replace("scam_publish_", "").split("_");
    const ticketNum = parts[0];
    const guildId = parts[1];
    const ownerId = parts[2];
    const channelId = parts[3];

    const scamRoomId = await db.get(`scam_room_${guildId}`);
    if (!scamRoomId) {
        return interaction.reply({
            content: "**❌ لم يتم تحديد روم التشهير. استخدم `/setup` واختر `scam-room`.**",
            flags: MessageFlags.Ephemeral,
        });
    }
    const scamRoom = interaction.guild.channels.cache.get(scamRoomId);
    if (!scamRoom)
        return interaction.reply({
            content: "**❌ روم التشهير غير موجود.**",
            flags: MessageFlags.Ephemeral,
        });

    // قراءة البيانات من الـ Container v2
    const containerContent = interaction.message.content || "";
    const lines = containerContent.split("\n");
    let scammerRaw = "—", whatHappened = "—", whatLost = "—", evidenceText = "—", evidenceImg = "—";

    for (const line of lines) {
        if (line.includes("**┃ اسم/معرف النصاب:**")) scammerRaw = line.replace("**┃ اسم/معرف النصاب:**", "").trim();
        if (line.includes("**┃ القصة:**")) whatHappened = line.replace("**┃ القصة:**", "").trim();
        if (line.includes("**┃ ماذا خُسر:**")) whatLost = line.replace("**┃ ماذا خُسر:**", "").trim();
        if (line.includes("**┃ الدليل:**")) evidenceText = line.replace("**┃ الدليل:**", "").trim();
        if (line.includes("**┃ المنشن (صور/مرفقات):**")) evidenceImg = line.replace("**┃ المنشن (صور/مرفقات):**", "").trim();
    }

    const scammerId = extractScammerId(scammerRaw);

    let banStatus = "⚠️ لم يتم البان (لم يُتعرف على ID)";
    if (scammerId) {
        try {
            await interaction.guild.bans.create(scammerId, {
                reason: `تشهير رسمي #${ticketNum} — بواسطة ${interaction.user.tag}`,
                deleteMessageSeconds: 0,
            });
            banStatus = `✅ تم تبنيده <@${scammerId}> تلقائياً`;
        } catch (e) {
            banStatus = `❌ فشل البان: \`${e.code || e.message}\``;
            console.error("Auto-ban scammer failed:", e);
        }
    }

    const scamMentionRoleId = await db.get(`scam_mention_${guildId}`);
    const mentionPart = scamMentionRoleId ? `<@&${scamMentionRoleId}>` : "@here";
    const scammerDisplay = scammerId ? `<@${scammerId}>` : scammerRaw || "—";

    const publishContent =
        `${mentionPart}\n` +
        `**• استمارة النصابين**\n\n` +
        `**قصة النصاب:** ${whatHappened}\n\n` +
        `**النصاب:** ${scammerDisplay}\n` +
        `**المشتكي:** <@${ownerId}>\n` +
        `**السلعة المنصوبة:** ${whatLost}\n\n` +
        `**دليل:** ${evidenceText}\n\n` +
        `**المنشن:** ${evidenceImg}`;

    const sentMsg = await scamRoom.send({
        content: publishContent.slice(0, 1900),
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`scam_unpub_${scammerId || "na"}`).setLabel("إلغاء تشهير").setStyle(ButtonStyle.Danger).setEmoji(emojis.cancelPublish)
        )],
        allowedMentions: { parse: ["everyone", "roles", "users"] },
    });

    // تعطيل الأزرار
    const disabledContainer = new ContainerBuilder();
    disabledContainer.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("_done1").setLabel("تم النشر").setStyle(ButtonStyle.Secondary).setDisabled(true).setEmoji(emojis.done),
        new ButtonBuilder().setCustomId("_done2").setLabel("إلغاء").setStyle(ButtonStyle.Secondary).setDisabled(true).setEmoji(emojis.cancel),
    ));
    await interaction.update({ components: [disabledContainer], flags: MessageFlags.IsComponentsV2 });

    await interaction.channel.send(
        `**✅ تم نشر التشهير في <#${scamRoomId}> بواسطة <@${interaction.user.id}>.**\n` +
        `${banStatus}\n` +
        `🔗 [الذهاب للرسالة](${sentMsg.url})\n` +
        `**🔒 سيتم إغلاق التكت خلال 10 ثواني...**`
    );

    const meta = await db.get(`support_ticket_ch_${channelId}`);
    if (meta) {
        await db.delete(`scam_ticket_${meta.userId}_${guildId}`);
        await db.delete(`support_ticket_ch_${channelId}`);
    }
    setTimeout(() => interaction.channel.delete().catch(() => {}), 10000);
});

// ============================================
// 8. scam_cancel: إلغاء التشهير
// ============================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("scam_cancel_")) return;
    if (!interaction.guild) return;

    const adminRoleId = (await db.get(`scam_admin_${interaction.guild.id}`)) || (await db.get(`support_admin_${interaction.guild.id}`));
    if (adminRoleId && !interaction.member.roles.cache.has(adminRoleId) && !interaction.member.permissions.has("Administrator")) {
        return interaction.reply({
            content: "**❌ فقط مسؤولو التشهير يمكنهم إلغاء التشهير.**",
            flags: MessageFlags.Ephemeral,
        });
    }

    const channelId = interaction.customId.replace("scam_cancel_", "");
    const guildId = interaction.guild.id;

    const disabledContainer = new ContainerBuilder();
    disabledContainer.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("_done1").setLabel("تم النشر").setStyle(ButtonStyle.Secondary).setDisabled(true).setEmoji(emojis.done),
        new ButtonBuilder().setCustomId("_done2").setLabel("تم الإلغاء").setStyle(ButtonStyle.Secondary).setDisabled(true).setEmoji(emojis.cancel),
    ));
    await interaction.update({ components: [disabledContainer], flags: MessageFlags.IsComponentsV2 });

    await interaction.channel.send(
        `**🚫 تم إلغاء التشهير بواسطة <@${interaction.user.id}>.**\n**🔒 سيتم إغلاق التكت خلال 10 ثواني...**`
    );

    const meta = await db.get(`support_ticket_ch_${channelId}`);
    if (meta) {
        await db.delete(`scam_ticket_${meta.userId}_${guildId}`);
        await db.delete(`support_ticket_ch_${channelId}`);
    }
    setTimeout(() => interaction.channel.delete().catch(() => {}), 10000);
});

// ============================================
// 9. scam_unpub: إلغاء التشهير (فك البان + حذف الرسالة)
// ============================================
// ============================================
// 1. متغيرات التخزين المؤقت لآخر 10 عمليات إلغاء تشهير
// ============================================
const recentUnbans = new Map(); // guildId => [{scammerId, moderatorId, reason, timestamp, scammerName}]

// ============================================
// 2. scam_unpub: إلغاء التشهير (فك البان + حذف الرسالة + لوق)
// ============================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("scam_unpub_")) return;
    if (!interaction.guild) return;

    // ✅ صلاحية الأدمنستريتور فقط
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
            content: "**❌ هذا الزر مخصّص للأدمنستريتور فقط.**",
            flags: MessageFlags.Ephemeral,
        });
    }

    // ✅ استخراج البيانات من الزر
    const scammerId = interaction.customId.replace("scam_unpub_", "");
    const guildId = interaction.guild.id;

    // ✅ جلب بيانات التكت من الرسالة
    let scammerName = "غير معروف";
    let reason = "لا يوجد سبب";
    
    // محاولة جلب اسم النصاب من محتوى الرسالة
    try {
        const msgContent = interaction.message.content || "";
        const lines = msgContent.split("\n");
        for (const line of lines) {
            if (line.includes("**النصاب:**")) {
                const match = line.match(/\*\*النصاب:\*\* <@!?(\d+)>/);
                if (match) {
                    const user = await client.users.fetch(match[1]).catch(() => null);
                    if (user) scammerName = user.username;
                }
                break;
            }
        }
    } catch {}

    // ✅ فك البان
    let unbanStatus = "";
    let success = false;
    if (scammerId && /^\d{17,20}$/.test(scammerId)) {
        try {
            await interaction.guild.bans.remove(scammerId, `إلغاء تشهير بواسطة ${interaction.user.tag}`);
            unbanStatus = `✅ تم فك البان عن <@${scammerId}>`;
            success = true;
        } catch (e) {
            if (e.code === 10026) unbanStatus = `⚠️ <@${scammerId}> غير مبند أصلاً`;
            else unbanStatus = `❌ تعذّر فك البان: \`${e.code || e.message}\``;
        }
    } else {
        unbanStatus = "⚠️ لا يوجد ID نصاب لفك البان عنه";
    }

    // ✅ حفظ العملية في السجل المؤقت
    if (success && scammerId) {
        if (!recentUnbans.has(guildId)) {
            recentUnbans.set(guildId, []);
        }
        const list = recentUnbans.get(guildId);
        list.unshift({
            scammerId,
            scammerName,
            moderatorId: interaction.user.id,
            moderatorName: interaction.user.username,
            reason: reason,
            timestamp: Date.now(),
            success: true,
        });
        // الاحتفاظ بآخر 10 عمليات فقط
        if (list.length > 10) list.pop();
    }

    // ✅ حذف رسالة التشهير
    await interaction.message.delete().catch(() => {});

    // ✅ إعلام الأدمن
    try {
        await interaction.user.send(`**🚫 تم إلغاء التشهير في ${interaction.guild.name}**\n${unbanStatus}`);
    } catch {}

    // ✅ لوق في قناة اللوق (Container v2)
    const logsChannelId = await db.get(`logs_${guildId}`);
    const logsChannel = interaction.guild.channels.cache.get(logsChannelId);
    
    if (logsChannel) {
        const serverColor = await getColor(guildId, db, config);
        const guildIcon = interaction.guild.iconURL({ size: 1024 });
        
        const container = new ContainerBuilder().setAccentColor(serverColor);
        const section = new SectionBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# 🔓 إلغاء تشهير`)
        );
        if (guildIcon) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
        container.addSectionComponents(section);
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**┃ النصاب:** ${scammerId ? `<@${scammerId}>` : "غير معروف"} (${scammerName})\n` +
                `**┃ تم فك البان بواسطة:** <@${interaction.user.id}>\n` +
                `**┃ السبب:** ${reason}\n` +
                `**┃ الحالة:** ${unbanStatus}\n` +
                `**┃ الوقت:** <t:${Math.floor(Date.now() / 1000)}:R>`
            )
        );
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# ${interaction.guild.name} | نظام التشهير`)
        );
        
        await logsChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    // ✅ رد على التفاعل
    await interaction.reply({
        content: `**✅ تم إلغاء التشهير.**\n${unbanStatus}`,
        flags: MessageFlags.Ephemeral,
    });
});

// ============================================
// 3. أمر /اخر-عمليات-الغاء-تشهير - عرض آخر 10 عمليات
// ============================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isCommand()) return;
    if (interaction.commandName !== "اخر-عمليات-الغاء-تشهير") return;
    if (!interaction.guild) return;

    // ✅ صلاحية الأدمنستريتور فقط
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
            content: "**❌ هذا الأمر للأدمنستريتور فقط.**",
            flags: MessageFlags.Ephemeral,
        });
    }

    const guildId = interaction.guild.id;
    const list = recentUnbans.get(guildId) || [];

    if (list.length === 0) {
        return interaction.reply({
            content: "**📭 لا توجد عمليات إلغاء تشهير مسجلة.**",
            flags: MessageFlags.Ephemeral,
        });
    }

    const serverColor = await getColor(guildId, db, config);
    const guildIcon = interaction.guild.iconURL({ size: 1024 });

    // بناء المحتوى
    let content = `# 📋 آخر 10 عمليات إلغاء تشهير\n\n`;
    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const time = `<t:${Math.floor(item.timestamp / 1000)}:R>`;
        content += `**${i + 1}.** <@${item.scammerId}> (${item.scammerName})\n`;
        content += `┃ بواسطة: <@${item.moderatorId}>\n`;
        content += `┃ السبب: ${item.reason}\n`;
        content += `┃ الوقت: ${time}\n\n`;
    }

    // Container v2
    const container = new ContainerBuilder().setAccentColor(serverColor);
    const section = new SectionBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`# 📋 آخر 10 عمليات إلغاء تشهير`)
    );
    if (guildIcon) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
    container.addSectionComponents(section);
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(content)
    );
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# ${interaction.guild.name} | نظام التشهير`)
    );

    await interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true,
    });
});

// ============================================
// 4. تسجيل الأمر "/اخر-عمليات-الغاء-تشهير"
// ============================================
client.on("ready", async () => {
    try {
        await client.application.commands.create({
            name: "اخر-عمليات-الغاء-تشهير",
            description: "عرض آخر 10 عمليات إلغاء تشهير (فك باند)",
            type: 1, // CHAT_INPUT
        });
        console.log("✅ تم تسجيل الأمر /اخر-عمليات-الغاء-تشهير");
    } catch (e) {
        console.error("❌ فشل تسجيل الأمر:", e);
    }
});
// ============================================
// 10. sup_add: إضافة عضو للتكت
// ============================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("sup_add_")) return;
    if (!interaction.guild) return;

    const channelId = interaction.customId.replace("sup_add_", "");
    const guildId = interaction.guild.id;
    const adminRoleId = await db.get(`support_admin_${guildId}`);
    if (adminRoleId && !interaction.member.roles.cache.has(adminRoleId) && !interaction.member.permissions.has("Administrator")) {
        return interaction.reply({
            content: "**❌ هذا الزر لمسؤولي الدعم فقط.**",
            flags: MessageFlags.Ephemeral,
        });
    }

    await interaction.reply({
        content: "**أرسل معرّف العضو الذي تريد إضافته (ID) خلال دقيقتين:**",
        flags: MessageFlags.Ephemeral,
    });

    try {
        const msgs = await interaction.channel.awaitMessages({
            filter: (m) => m.author.id === interaction.user.id,
            max: 1,
            time: 120000,
            errors: ["time"],
        });
        const memberId = msgs.first().content.trim();
        await msgs.first().delete().catch(() => {});
        if (!/^\d{17,20}$/.test(memberId))
            return interaction.followUp({
                content: "**❌ معرّف غير صالح.**",
                flags: MessageFlags.Ephemeral,
            });
        const member = await interaction.guild.members.fetch(memberId).catch(() => null);
        if (!member)
            return interaction.followUp({
                content: "**❌ العضو غير موجود في السيرفر.**",
                flags: MessageFlags.Ephemeral,
            });
        await interaction.channel.permissionOverwrites.edit(member, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
        });
        await interaction.channel.send(`**✅ تمت إضافة <@${memberId}> للتكت.**`);
    } catch {
        await interaction.followUp({
            content: "**⏰ انتهى الوقت.**",
            flags: MessageFlags.Ephemeral,
        });
    }
});

// ============================================
// 11. sup_remove: إزالة عضو من التكت
// ============================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("sup_remove_")) return;
    if (!interaction.guild) return;

    const channelId = interaction.customId.replace("sup_remove_", "");
    const guildId = interaction.guild.id;
    const adminRoleId = await db.get(`support_admin_${guildId}`);
    if (adminRoleId && !interaction.member.roles.cache.has(adminRoleId) && !interaction.member.permissions.has("Administrator")) {
        return interaction.reply({
            content: "**❌ هذا الزر لمسؤولي الدعم فقط.**",
            flags: MessageFlags.Ephemeral,
        });
    }

    await interaction.reply({
        content: "**أرسل معرّف العضو الذي تريد إزالته (ID) خلال دقيقتين:**",
        flags: MessageFlags.Ephemeral,
    });

    try {
        const msgs = await interaction.channel.awaitMessages({
            filter: (m) => m.author.id === interaction.user.id,
            max: 1,
            time: 120000,
            errors: ["time"],
        });
        const memberId = msgs.first().content.trim();
        await msgs.first().delete().catch(() => {});
        const meta = await db.get(`support_ticket_ch_${channelId}`);
        if (meta && memberId === meta.userId)
            return interaction.followUp({
                content: "**❌ لا يمكنك إزالة صاحب التكت.**",
                flags: MessageFlags.Ephemeral,
            });
        await interaction.channel.permissionOverwrites.delete(memberId).catch(() => {});
        await interaction.channel.send(`**✅ تمت إزالة <@${memberId}> من التكت.**`);
    } catch {
        await interaction.followUp({
            content: "**⏰ انتهى الوقت.**",
            flags: MessageFlags.Ephemeral,
        });
    }
});

// ============================================
// 12. sup_close: إغلاق التكت

  // ============================================
// ✅ الكود الصحيح لإغلاق التكت - بدون أخطاء
// ============================================

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("sup_close_")) return;
    if (!interaction.guild) return;

    const channelId = interaction.customId.replace("sup_close_", "");
    const guildId = interaction.guild.id;
    const meta = await db.get(`support_ticket_ch_${channelId}`);
    if (!meta)
        return interaction.reply({
            content: "بيانات التكت غير موجودة.",
            flags: MessageFlags.Ephemeral,
        });

    const adminRoleId = (await db.get(`support_admin_${guildId}`)) || (await db.get(`scam_admin_${guildId}`));
    const isOwner = interaction.user.id === meta.userId;
    const isAdmin = adminRoleId && interaction.member.roles.cache.has(adminRoleId);
    if (!isOwner && !isAdmin && !interaction.member.permissions.has("Administrator")) {
        return interaction.reply({
            content: "فقط صاحب التكت أو الإداري يمكنه الإغلاق.",
            flags: MessageFlags.Ephemeral,
        });
    }

    meta.status = "closed";
    meta.closedBy = interaction.user.id;
    meta.closedAt = Date.now();
    await db.set(`support_ticket_ch_${channelId}`, meta);
    await db.set(meta.dbKey, meta);
    await db.delete(meta.dbKey);

    // ✅ استخدم EmbedBuilder (وليس Container v2) عشان تقدر تستخدم content
    const closeEmbed = new EmbedBuilder()
        .setTitle("تم إغلاق التكت")
        .setColor(0x2b2d31)
        .addFields(
            { name: "صاحب التكت", value: `<@${meta.userId}>`, inline: true },
            { name: "المغلق بواسطة", value: `<@${interaction.user.id}>`, inline: true },
            { name: "وقت الإغلاق", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        )
        .setFooter({ text: `${interaction.guild.name} | نظام التكتات` });

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`sup_delete_${channelId}`)
                .setLabel("حذف القناة")
                .setStyle(ButtonStyle.Danger)
        );

    await interaction.reply({
        embeds: [closeEmbed],
        components: [row],
        flags: MessageFlags.Ephemeral,  // ✅ استخدم Ephemeral بدل IsComponentsV2 عشان تقدر تستخدم content
    });

    // لوق
    const logsChannelId = await db.get(`logs_${guildId}`);
    const logsChannel = interaction.guild.channels.cache.get(logsChannelId);
    if (logsChannel) {
        const logEmbed = new EmbedBuilder()
            .setTitle(`إغلاق تكت ${meta.type === "scam" ? "تشهير" : "دعم"}`)
            .setColor(0x2b2d31)
            .addFields(
                { name: "صاحب التكت", value: `<@${meta.userId}>`, inline: true },
                { name: "المغلق بواسطة", value: `<@${interaction.user.id}>`, inline: true },
                { name: "رقم التكت", value: `#${meta.ticketNum}`, inline: true },
                { name: "المُستلَم بواسطة", value: meta.claimedBy ? `<@${meta.claimedBy}>` : "لم يُستلم", inline: false }
            )
            .setFooter({ text: `${interaction.guild.name} | نظام التكتات` });

        await logsChannel.send({
            embeds: [logEmbed],
        });
    }

    if (meta.claimedBy) {
        await sendTicketRatingDM(meta.userId, guildId, meta.type || "support").catch(() => {});
    }
});

// ============================================
// ✅ الكود الصحيح لحذف القناة
// ============================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("sup_delete_")) return;
    if (!interaction.guild) return;

    const guildId = interaction.guild.id;
    const adminRoleId = await db.get(`support_admin_${guildId}`);
    if (adminRoleId && !interaction.member.roles.cache.has(adminRoleId) && !interaction.member.permissions.has("Administrator")) {
        return interaction.reply({
            content: "فقط الإداري يمكنه حذف القناة.",
            flags: MessageFlags.Ephemeral,
        });
    }

    await interaction.reply({
        content: "🗑️ سيتم حذف القناة خلال 3 ثوانٍ...",
        flags: MessageFlags.Ephemeral,
    });

    setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
});  
    
    
    // أمر !اصلاح
client.on("messageCreate", async (message) => {
    if (!message.content.startsWith("!اصلاح")) return;
    if (!message.guild) return;

    const guildId = message.guild.id;

    // صلاحية الأدمن فقط
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply("**❌ هذا الأمر للإدارة العليا فقط.**");
    }

    // استخراج المنشن من الرسالة
    const mention = message.mentions.users.first();
    if (!mention) {
        return message.reply("**❌ يرجى منشن المستخدم: `!اصلاح @المستخدم`**");
    }

    const targetId = mention.id;

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fix_shop_${targetId}_${guildId}`).setLabel("متاجر").setStyle(ButtonStyle.Primary).setEmoji("🛒"),
        new ButtonBuilder().setCustomId(`fix_auction_${targetId}_${guildId}`).setLabel("مزاد").setStyle(ButtonStyle.Primary).setEmoji("🔨"),
        new ButtonBuilder().setCustomId(`fix_order_${targetId}_${guildId}`).setLabel("طلبات").setStyle(ButtonStyle.Primary).setEmoji("📦"),
        new ButtonBuilder().setCustomId(`fix_roles_${targetId}_${guildId}`).setLabel("رتب").setStyle(ButtonStyle.Primary).setEmoji("👑"),
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fix_support_${targetId}_${guildId}`).setLabel("دعم").setStyle(ButtonStyle.Primary).setEmoji("🎫"),
        new ButtonBuilder().setCustomId(`fix_scam_${targetId}_${guildId}`).setLabel("تشهير").setStyle(ButtonStyle.Primary).setEmoji("🚨"),
        new ButtonBuilder().setCustomId(`fix_all_${targetId}_${guildId}`).setLabel("الكل").setStyle(ButtonStyle.Danger).setEmoji("🗑️"),
    );

    await message.channel.send({
        content: `**🛠️ اختر نوع التكت لمسح بيانات <@${targetId}>:**`,
        components: [row1, row2],
    });
});

// معالج الأزرار
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("fix_")) return;

    const parts = interaction.customId.split("_");
    const type = parts[1];
    const targetId = parts[2];
    const guildId = parts[3];

    // صلاحية الأدمن فقط
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
            content: "**❌ هذا الزر للإدارة العليا فقط.**",
            flags: MessageFlags.Ephemeral,
        });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const deletedChannels = [];
    const deletedKeys = [];

    const pushIfOpen = async (channelId) => {
        try {
            const ch = interaction.guild.channels.cache.get(channelId);
            if (ch) {
                deletedChannels.push(`<#${channelId}>`);
                await ch.delete().catch(() => {});
            }
        } catch {}
    };

    // ========== متاجر ==========
    if (type === "shop" || type === "all") {
        const shopTicket = await db.get(`shop_ticket_${targetId}_${guildId}`);
        if (shopTicket?.channelId) {
            await pushIfOpen(shopTicket.channelId);
            await db.delete(`shop_ticket_${targetId}_${guildId}`);
            await db.delete(`shop_ticket_channel_${shopTicket.channelId}`);
            deletedKeys.push("shop_ticket");
        }
        await db.delete(`shop_credit_${targetId}_${guildId}`);
        deletedKeys.push("shop_credit");
    }

    // ========== مزاد ==========
    if (type === "auction" || type === "all") {
        const auctionTicket = await db.get(`auction_ticket_${targetId}_${guildId}`);
        if (auctionTicket?.channelId) {
            await pushIfOpen(auctionTicket.channelId);
            await db.delete(`auction_ticket_${targetId}_${guildId}`);
            await db.delete(`auction_ticket_channel_${auctionTicket.channelId}`);
            deletedKeys.push("auction_ticket");
        }
        await db.delete(`auction_credit_${targetId}_${guildId}`);
        await db.delete(`auction_draft_${targetId}_${guildId}`);
        deletedKeys.push("auction_credit", "auction_draft");
    }

    // ========== طلبات ==========
    if (type === "order" || type === "all") {
        const orderTicket = await db.get(`order_ticket_${targetId}_${guildId}`);
        if (orderTicket?.channelId) {
            await pushIfOpen(orderTicket.channelId);
            await db.delete(`order_ticket_${targetId}_${guildId}`);
            await db.delete(`order_ticket_channel_${orderTicket.channelId}`);
            deletedKeys.push("order_ticket");
        }
        await db.delete(`order_credit_${targetId}_${guildId}`);
        deletedKeys.push("order_credit");
    }

    // ========== رتب ==========
    if (type === "roles" || type === "all") {
        const rolesTicket = await db.get(`roles_ticket_${targetId}_${guildId}`);
        if (rolesTicket?.channelId) {
            await pushIfOpen(rolesTicket.channelId);
            await db.delete(`roles_ticket_${targetId}_${guildId}`);
            await db.delete(`roles_ticket_channel_${rolesTicket.channelId}`);
            deletedKeys.push("roles_ticket");
        }
    }

    // ========== دعم ==========
    if (type === "support" || type === "all") {
        const supportTicket = await db.get(`support_ticket_${targetId}_${guildId}`);
        if (supportTicket?.channelId) {
            await pushIfOpen(supportTicket.channelId);
            await db.delete(`support_ticket_${targetId}_${guildId}`);
            await db.delete(`support_ticket_ch_${supportTicket.channelId}`);
            deletedKeys.push("support_ticket");
        }
    }

    // ========== تشهير ==========
    if (type === "scam" || type === "all") {
        const scamTicket = await db.get(`scam_ticket_${targetId}_${guildId}`);
        if (scamTicket?.channelId) {
            await pushIfOpen(scamTicket.channelId);
            await db.delete(`scam_ticket_${targetId}_${guildId}`);
            await db.delete(`support_ticket_ch_${scamTicket.channelId}`);
            deletedKeys.push("scam_ticket");
        }
    }

    const resultEmbed = new EmbedBuilder()
        .setTitle(" نتيجة الإصلاح")
        .setDescription(
            `**المستخدم:** <@${targetId}>\n` +
            `**النوع:** \`${type === "all" ? "الكل" : type}\`\n\n` +
            `**القنوات المحذوفة:** ${deletedChannels.length > 0 ? deletedChannels.join("، ") : "لا يوجد"}\n` +
            `**المفاتيح المحذوفة:** \`${deletedKeys.join("`, `") || "لا يوجد"}\``
        )
        .setColor(0x00FF00)
        .setTimestamp();

    await interaction.editReply({ embeds: [resultEmbed] });

    // لوق
    const logsChannelId = await db.get(`logs_${guildId}`);
    const logsChannel = interaction.guild.channels.cache.get(logsChannelId);
    if (logsChannel) {
        await logsChannel.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle("تم اصلاح")
                    .addFields(
                        { name: "المنفذ", value: `<@${interaction.user.id}>`, inline: true },
                        { name: "المستخدم", value: `<@${targetId}>`, inline: true },
                        { name: "النوع", value: type, inline: true },
                        { name: "القنوات المحذوفة", value: deletedChannels.length.toString(), inline: true },
                    )
                    .setColor(0xFFA500)
                    .setTimestamp(),
            ],
        });
    }
});
    //----
    //-------- rule_show: عرض محتوى القانون --------
  client.on("interactionCreate", async (interaction) => {
    // 1. Autocomplete
    if (interaction.isAutocomplete() && interaction.commandName === "send-rule") {
        const focusedValue = interaction.options.getFocused();
        const rules = (await db.get(`server_rules_${interaction.guild.id}`)) || [];
        const filtered = rules.filter((rule) =>
            rule.label.toLowerCase().includes(focusedValue.toLowerCase()),
        );
        return await interaction.respond(
            filtered.slice(0, 25).map((rule) => ({ name: rule.label, value: rule.label })),
        );
    }

    // 2. أزرار عرض القوانين
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("rule_show_")) return;
    if (!interaction.guild) return;

    const parts = interaction.customId.split("_");
    const guildId = parts[2];
    const ruleId = parts[3];

    const rules = (await db.get(`server_rules_${guildId}`)) || [];
    const rule = rules.find((r) => r.id === ruleId);

    if (!rule)
        return interaction.reply({
            content: "**❌ هـذا الـقـانـون لـم يـعـد مـوجـوداً.**",
            flags: MessageFlags.Ephemeral,
        });

    const serverColor = await getColor(guildId, db, config);
    const guildIcon = interaction.guild.iconURL({ size: 1024 });
    const linePreview = await db.get(`image_${guildId}`);
    const finalImage = rule.image || linePreview || null;

    const container = new ContainerBuilder().setAccentColor(serverColor);

    const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${rule.emoji || ""} ${rule.label}`));

    if (guildIcon) {
        section.setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
    }

    container.addSectionComponents(section);

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(ED.shopInteractions_029({ rule }))
    );

    if (finalImage) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(finalImage))
        );
    }

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# ${interaction.guild.name} | الـقـوانـيـن`)
    );

    await interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
});
    //-------- rule_remove_select: حذف قانون من الداتابيز --------
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isStringSelectMenu()) return;
        if (!interaction.customId.startsWith("rule_remove_select_")) return;
        if (!interaction.guild) return;
        if (!interaction.member.permissions.has("Administrator")) {
            return interaction.reply({
                content: "**❌ يجب أن تكون لديك صلاحية Administrator.**",
                flags: MessageFlags.Ephemeral,
            });
        }

        const guildId = interaction.customId.replace("rule_remove_select_", "");
        const selectedId = interaction.values[0];
        let rules = (await db.get(`server_rules_${guildId}`)) || [];
        const toDelete = rules.find((r) => r.id === selectedId);
        if (!toDelete)
            return interaction.reply({
                content: "**❌ القانون غير موجود.**",
                flags: MessageFlags.Ephemeral,
            });

        rules = rules.filter((r) => r.id !== selectedId);
        await db.set(`server_rules_${guildId}`, rules);
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("✅ تم حذف القانون")
                    .setDescription(ED.shopInteractions_030({ toDelete }))
                    .setColor(await getColor(guildId, db, config)),
            ],
            flags: MessageFlags.Ephemeral,
        });
    });

    //-------- roles_delete_select: حذف الرتبة من القائمة --------
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isStringSelectMenu()) return;
        if (!interaction.customId.startsWith("roles_delete_select_")) return;
        if (!interaction.guild) return;
        if (!interaction.member.permissions.has("Administrator")) {
            return interaction.reply({
                content: "**❌ يجب أن تكون لديك صلاحية Administrator.**",
                flags: MessageFlags.Ephemeral,
            });
        }

        const guildId = interaction.customId.replace(
            "roles_delete_select_",
            "",
        );
        const selectedId = interaction.values[0];
        let roles = (await db.get(`buy_roles_${guildId}`)) || [];
        const toDelete = roles.find((r) => r.roleId === selectedId);
        if (!toDelete)
            return interaction.reply({
                content: "**❌ الرتبة غير موجودة.**",
                flags: MessageFlags.Ephemeral,
            });

        roles = roles.filter((r) => r.roleId !== selectedId);
        await db.set(`buy_roles_${guildId}`, roles);
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("✅ تم حذف الرتبة")
                    .setDescription(ED.shopInteractions_031({ toDelete }))
                    .setColor(await getColor(guildId, db, config)),
            ],
            flags: MessageFlags.Ephemeral,
        });
    });

    //-------- allinone_prices: بانل الأسعار --------
// ========== ADDITIONS_LIST ==========
// ========== ADDITIONS_LIST ==========
const ADDITIONS_LIST = [
    { id: "changeshape", label: "تغيير شكل المتجر", emojiKey: "shape", dbKey: "changeshape" },
    { id: "changetypeprice", label: "تغيير نوع المتجر", emojiKey: "typeChange", dbKey: "changetypeprice" },
    { id: "changename", label: "تغيير اسم المتجر", emojiKey: "nameChange", dbKey: "changename" },
    { id: "changeowner", label: "تغيير صاحب المتجر", emojiKey: "ownerChange", dbKey: "changeowner" },
    { id: "removewarn", label: "إزالة تحذيرات", emojiKey: "removeWarn", dbKey: "removewarncredit" },
    { id: "shopmention", label: "شراء منشن متجر", emojiKey: "mention", dbKey: "shopprice" },
    { id: "automessage", label: "النشر التلقائي", emojiKey: "autoPublish", dbKey: "automessage" },
    { id: "disableauto", label: "تعطيل الإرسال التلقائي", emojiKey: "disableAuto", dbKey: "disableauto" },
    { id: "shopvacation", label: "إجازة المتجر", emojiKey: "vacation", dbKey: "shopvacation" },
    { id: "activateshop", label: "تفعيل المتجر", emojiKey: "activate", dbKey: "activateshopprice" },
    { id: "sellshop", label: "بيع المتجر", emojiKey: "sell", dbKey: "sellshopprice" },
];

// ========== بانل الأسعار (Container v2) ==========
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("allinone_prices_")) return;
    if (!interaction.guild) return;

    const gId = interaction.customId.replace("allinone_prices_", "");
    const imageUrl = await db.get(`image_${gId}`);
    const priceImage = await db.get(`priceImage_${gId}`);
    const serverColor = await getColor(gId, db, config);
    const guildIcon = interaction.guild.iconURL({ size: 1024 });
    const finalImage = priceImage || imageUrl || null;

    const container = new ContainerBuilder().setAccentColor(serverColor);
    const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`# الأسـعـار`));
    if (guildIcon) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
    container.addSectionComponents(section);
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(ED.shopInteractions_032()));
    if (finalImage) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(finalImage)));
    }
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${interaction.guild.name} | الأسـعـار`));

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("order-price").setLabel("أسعار الطلبات").setStyle(ButtonStyle.Secondary).setEmoji(emojis.order),
        new ButtonBuilder().setCustomId("auctionpri").setLabel("أسعار المزادات").setStyle(ButtonStyle.Secondary).setEmoji(emojis.auction),
        new ButtonBuilder().setCustomId("shoppri").setLabel("أسعار المتاجر").setStyle(ButtonStyle.Secondary).setEmoji(emojis.shop),
        new ButtonBuilder().setCustomId(`roles_prices_${gId}`).setLabel("أسعار الرتب").setStyle(ButtonStyle.Secondary).setEmoji(emojis.roles),
        new ButtonBuilder().setCustomId(`additions_prices_${gId}`).setLabel("أسعار الإضافات").setStyle(ButtonStyle.Secondary).setEmoji(emojis.additionsPrices),
    );
    container.addActionRowComponents(row);
    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
});

// ========== أسعار الإضافات - أزرار (Container v2) ==========
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("additions_prices_")) return;
    if (!interaction.guild) return;

    const gId = interaction.customId.replace("additions_prices_", "");
    const serverColor = await getColor(gId, db, config);
    const guildIcon = interaction.guild.iconURL({ size: 1024 });

    const container = new ContainerBuilder().setAccentColor(serverColor);
    const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`# أسـعـار الإضـافـات`));
    if (guildIcon) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
    container.addSectionComponents(section);
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**اضـغـط عـلـى أي زر لـعـرض سـعـر الـخـدمـة**`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${interaction.guild.name} | أسـعـار الإضـافـات`));

    for (let i = 0; i < ADDITIONS_LIST.length; i += 5) {
        const chunk = ADDITIONS_LIST.slice(i, i + 5);
        const row = new ActionRowBuilder().addComponents(
            chunk.map((a) => {
                const emo = emojis[a.emojiKey] || emojis.dashboard || "🧩";
                return new ButtonBuilder().setCustomId(`addprice_${a.id}_${gId}`).setLabel(a.label).setStyle(ButtonStyle.Secondary).setEmoji(emo);
            }),
        );
        container.addActionRowComponents(row);
    }
    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
});

// ========== عرض سعر إضافة (Container v2) ==========
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("addprice_")) return;
    if (!interaction.guild) return;

    const rest = interaction.customId.replace("addprice_", "");
    const lastUnderscore = rest.lastIndexOf("_");
    if (lastUnderscore === -1) return;
    const itemId = rest.slice(0, lastUnderscore);
    const gId = rest.slice(lastUnderscore + 1);
    const item = ADDITIONS_LIST.find((a) => a.id === itemId);
    if (!item) return interaction.reply({ content: "**❌ خـدمـة غـيـر مـعـروفـة.**", flags: MessageFlags.Ephemeral });

    const price = await db.get(`${item.dbKey}_${gId}`);
    const emo = emojis[item.emojiKey] || emojis.dashboard || "🧩";
    const serverColor = await getColor(gId, db, config);
    const guildIcon = interaction.guild.iconURL({ size: 1024 });

    const container = new ContainerBuilder().setAccentColor(serverColor);
    const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${emo} ${item.label}`));
    if (guildIcon) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
    container.addSectionComponents(section);
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(price ? `**الـسـعـر:** \`${price}\`` : "**الـسـعـر غـيـر مـحـدد بـعـد.**"));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${interaction.guild.name} | الأسـعـار`));
    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
});

// ========== القوانين (Container v2) ==========
// ========== الرتب (Container v2 - Section واحد) ==========
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("allinone_roles_")) return;
    if (!interaction.guild) return;

    const gId = interaction.customId.replace("allinone_roles_", "");
    const rolesList = (await db.get(`buy_roles_${gId}`)) || [];
    if (!rolesList.length) return interaction.reply({ content: "**❌ لا توجد رتب متاحة للبيع حالياً.**", flags: MessageFlags.Ephemeral });

    const imageUrl = await db.get(`image_${gId}`);
    const serverColor = await getColor(gId, db, config);
    const guildIcon = interaction.guild.iconURL({ size: 1024 });

    let desc = "";
    for (const [idx, r] of rolesList.entries()) {
        desc += `**${idx + 1}.** <@&${r.roleId}>\n> السعر: **${r.price}** كردت\n> المميزات: ${r.benefits}\n\n`;
    }

    const container = new ContainerBuilder().setAccentColor(serverColor);
    const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`# الـرتـب الـمـتـاحـة لـلـشـراء`));
    if (guildIcon) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
    container.addSectionComponents(section);
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(desc));
    if (imageUrl) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl)));
    }
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${interaction.guild.name} | نـظـام الـرتـب`));

    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("ticket-roles").setLabel("شراء رتبة").setStyle(ButtonStyle.Success).setEmoji(emojis.roles));
    container.addActionRowComponents(row);
    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
});    //-------- allinone_rules: بانل القوانين --------
    client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("allinone_rules_")) return;
    if (!interaction.guild) return;

    const gId = interaction.customId.replace("allinone_rules_", "");
    const rules = (await db.get(`server_rules_${gId}`)) || [];
    if (!rules.length)
        return interaction.reply({
            content: "**❌ لا توجد قوانين مضافة بعد.**",
            flags: MessageFlags.Ephemeral,
        });

    const imageUrl = await db.get(`image_${gId}`);
    const rulesImage = await db.get(`rulesImage_${gId}`);
    const serverColor = await getColor(gId, db, config);
    const guildIcon = interaction.guild.iconURL({ size: 1024 });
    const finalImage = rulesImage || imageUrl || null;

    const container = new ContainerBuilder().setAccentColor(serverColor);

    const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# قـوانـيـن ${interaction.guild.name}`));

    if (guildIcon) {
        section.setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
    }

    container.addSectionComponents(section);

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(ED.shopInteractions_033({ interaction }))
    );

    if (finalImage) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(finalImage))
        );
    }

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# ${interaction.guild.name} | نـظـام الـقـوانـيـن`)
    );

    const btnRow = new ActionRowBuilder().addComponents(
        rules.slice(0, 5).map((r) => {
            const btn = new ButtonBuilder()
                .setCustomId(`rule_show_${gId}_${r.id}`)
                .setLabel(r.label.slice(0, 80))
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(emojis.rules);
            if (r.emoji) {
                try { btn.setEmoji(r.emoji); } catch {}
            }
            return btn;
        }),
    );

    container.addActionRowComponents(btnRow);

    await interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
});
    //-------- allinone_tickets: بانل التكتات --------
    client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("allinone_tickets_")) return;
    if (!interaction.guild) return;

    const gId = interaction.customId.replace("allinone_tickets_", "");
    const guildIcon = interaction.guild.iconURL({ size: 1024 });
    const imageUrl = await db.get(`image_${gId}`);
    const serverColor = await getColor(gId, db, config);

    const container = new ContainerBuilder().setAccentColor(serverColor);

    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# قـسـم الـتـكـتـات`))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon))
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(ED.shopInteractions_034())
    );

    if (imageUrl) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl))
        );
    }

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# ${interaction.guild.name} | نـظـام الـتـكـتـات`)
    );

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("buy_shop").setLabel("شراء متجر").setStyle(ButtonStyle.Secondary).setEmoji(emojis.shop),
        new ButtonBuilder().setCustomId("ticket-auction").setLabel("تكت مزاد").setStyle(ButtonStyle.Secondary).setEmoji(emojis.auction),
        new ButtonBuilder().setCustomId("ticket-order").setLabel("تكت طلبات").setStyle(ButtonStyle.Secondary).setEmoji(emojis.order),
        new ButtonBuilder().setCustomId("ticket-roles").setLabel("شراء رتبة").setStyle(ButtonStyle.Secondary).setEmoji(emojis.roles),
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket-support").setLabel("الدعم الفني").setStyle(ButtonStyle.Primary).setEmoji(emojis.support),
        new ButtonBuilder().setCustomId("ticket-scam").setLabel("تشهير نصاب").setStyle(ButtonStyle.Danger).setEmoji(emojis.scam),
    );

    container.addActionRowComponents(row1);
    container.addActionRowComponents(row2);

    await interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
});
    //-------- allinone_roles: بانل الرتب --------
    //====== معالج أزرار تقييم التكتات (tr_) — تصل من الخاص ======
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("tr_")) return;

    const parts = interaction.customId.split("_");
    if (parts.length < 4) return;
    const rating = parseInt(parts[1]);
    const guildId = parts[2];
    const type = parts[3];
    if (isNaN(rating) || rating < 1 || rating > 5) return;

    const ratingChId = await db.get(`rating_ch_${guildId}`);
    if (!ratingChId) {
        const embed = new EmbedBuilder()
            .setTitle("❌ لم يتم تحديد روم التقييمات")
            .setDescription(ED.shopInteractions_036())
            .setTimestamp();
        return interaction.update({ embeds: [embed], components: [] }).catch(() => {});
    }

    const typeLabels = {
        support: "🎫 دعم فني",
        scam: "🚨 تشهير",
        order: "📦 طلبات",
        auction: "🏆 مزاد",
        roles: "🎭 رتب",
    };
    const stars = "⭐".repeat(rating);

    try {
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        const ratingCh = guild?.channels?.cache?.get(ratingChId);
        if (ratingCh) {
            const color = rating >= 4 ? 0x00ff88 : rating >= 3 ? 0xffcc00 : 0xff4444;
            await ratingCh.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(`${stars} تقييم جديد — ${typeLabels[type] || type}`)
                        .setDescription(ED.shopInteractions_037({ interaction, rating, stars, type, typeLabels }))
                        .setColor(color)
                        .setTimestamp(),
                ],
            }).catch(() => {});
        }
    } catch (e) {
        console.log(`[tr_] ${e.message}`);
    }

    const disabledRow = new ActionRowBuilder().addComponents(
        ...[1, 2, 3, 4, 5].map((n) =>
            new ButtonBuilder()
                .setCustomId(`tr_${n}_${guildId}_${type}_done`)
                .setLabel("⭐".repeat(n))
                .setStyle(n === rating ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setDisabled(true),
              ),
    );

    const serverColor = await getColor(guildId, db, config);
    const guildIcon = interaction.guild?.iconURL({ size: 1024 });

    const container = new ContainerBuilder().setAccentColor(serverColor);
const section = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ✅ شـكـراً عـلـى تـقـيـيـمـك!`));

if (guildIcon) {
    section.setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
}

container.addSectionComponents(section);
    
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(ED.shopInteractions_038({ stars }))
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# ${interaction.guild?.name || "سيرفر"} | نـظـام الـتـقـيـيـمـات`)
    );

    container.addActionRowComponents(disabledRow);

    await interaction.update({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    }).catch(() => {});
});

       // ==========================================
// 1. أمر +مجاني (Container v2)
// ==========================================
client.on("messageCreate", async (message) => {
    if (!message.content.startsWith("+مجاني")) return;
    if (!message.guild) return;

    const guildId = message.guild.id;

    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply("❌ هذا الامر للادارة العليا فقط.");
    }

    const serverColor = _ec.color(guildId);
    const guildIcon = message.guild.iconURL({ size: 1024 });
    const imageUrl = await db.get(`image_${guildId}`);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("free_shop_open").setLabel("متجر مجاني").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("free_auction_open").setLabel("مزاد مجاني").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("free_order_open").setLabel("طلب مجاني").setStyle(ButtonStyle.Secondary),
    );

    const container = new ContainerBuilder().setAccentColor(serverColor);

    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# قـسـم الـمـجـانـي`))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon))
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**احصل على متجر، م��اد، او طلب مجاني**\n**اختر احد الازرار ادناه:**`)
    );

    if (imageUrl) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl))
        );
    }

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${message.guild.name} | نـظـام الـمـجـانـي`));
    container.addActionRowComponents(row);

    await message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
    await message.delete().catch(() => {});
});

// ==========================================
// 2. متجر مجاني - فتح تكت
// ==========================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton() || interaction.customId !== "free_shop_open") return;

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    const shopcat = await db.get(`catbuy_shop_${guildId}`);
    const adminRoleId = await db.get(`shopad_${guildId}`);
    if (!shopcat || !adminRoleId) {
        return interaction.reply({ content: "❌ يرجى تحديد كتاغوري الشراء والمسؤول من /setup", ephemeral: true });
    }

    const shopData = await db.get(`shop_ticket_${userId}_${guildId}`);
    if (shopData && interaction.guild.channels.cache.get(shopData.channelId)) {
        return interaction.reply({ content: `❌ لديك تذكرة مفتوحة: <#${shopData.channelId}>`, ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const ticketChannel = await interaction.guild.channels.create({
        name: `مجاني-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: shopcat,
        permissionOverwrites: [
            { id: userId, allow: ["ViewChannel", "SendMessages", "AttachFiles", "EmbedLinks", "ReadMessageHistory"] },
            { id: interaction.guild.id, deny: ["ViewChannel"] },
            { id: adminRoleId, allow: ["ViewChannel", "SendMessages", "ManageMessages"] },
        ],
    });

    await db.set(`shop_ticket_${userId}_${guildId}`, { userId, channelId: ticketChannel.id, isFree: true });
    await db.set(`shop_ticket_channel_${ticketChannel.id}`, { ownerId: userId, guildId, isFree: true });

    const categories = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory);
    const buttons = [];

    for (const [catId] of categories) {
        const catData = await db.get(`categoryMentions_${catId}_${guildId}`);
        if (!catData) continue;
        buttons.push(
            new ButtonBuilder().setCustomId(`free_shop_type_${catId}`).setLabel(catData.nametype).setStyle(ButtonStyle.Secondary)
        );
    }

    const serverColor = _ec.color(guildId);
    const guildIcon = interaction.guild.iconURL({ size: 1024 });
    const imageUrl = await db.get(`image_${guildId}`);

    const container = new ContainerBuilder().setAccentColor(serverColor);

    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# تـكـت مـتـجـر مـجـانـي`))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon))
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**اخـتـر نـوع الـمـتـجـر (مـجـانـاً)**`)
    );

    if (imageUrl) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl))
        );
    }

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${interaction.guild.name} | نـظـام الـمـتـاجـر الـمـجـانـي`));

    const rows = [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("closeshop").setLabel("إغلاق التكت").setStyle(ButtonStyle.Danger).setEmoji("🔒"))];
    for (let i = 0; i < buttons.length; i += 5) {
        if (rows.length < 5) rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }
    rows.forEach(r => container.addActionRowComponents(r));

    // حط المنشن داخل container
container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`<@${userId}> <@&${adminRoleId}>`)
);

await ticketChannel.send({
    components: [container],  // بدون content
    flags: MessageFlags.IsComponentsV2,
});
    await interaction.editReply({ content: `✅ تم فتح تذكرة المتجر المجاني: <#${ticketChannel.id}>` });
});

// ==========================================
// 3. اختيار نوع متجر مجاني
// ==========================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("free_shop_type_")) return;
    const catId = interaction.customId.replace("free_shop_type_", "");
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    const ticketOwner = await db.get(`shop_ticket_${userId}_${guildId}.userId`);
    if (ticketOwner !== userId) return interaction.reply({ content: "❌ ليس لك.", ephemeral: true });

    const catData = await db.get(`categoryMentions_${catId}_${guildId}`);
    if (!catData) return interaction.reply({ content: "❌ النوع غير موجود.", ephemeral: true });

    await interaction.reply({ content: "**✏️ أرسل اسم المتجر:**", ephemeral: true });

    const collected = await interaction.channel.awaitMessages({
        filter: m => m.author.id === userId, max: 1, time: 120000, errors: ["time"]
    }).catch(() => null);

    if (!collected) return interaction.channel.send("⏰ انتهى الوقت.");

    const name = collected.first().content.trim();
    if (name.length > 100) return interaction.channel.send("الاسم طويل.");
    if (/https?:\/\//.test(name)) return interaction.channel.send("ممنوع روابط.");

    const pirefix = catData.pirefix || "";
    const cleanName = name.replaceAll(" ", "・");
    const channelName = `${pirefix}${cleanName}`.slice(0, 90);

    const shopChannel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: catId,
        permissionOverwrites: [
            { id: interaction.guild.id, deny: ["SendMessages"], allow: ["ViewChannel"] },
            { id: userId, allow: ["ViewChannel", "SendMessages", "AttachFiles", "EmbedLinks", "MentionEveryone", "ReadMessageHistory"] },
        ],
    });
const datecreated = `<t:${parseInt(Date.now() / 1000)}:R>`;
const ob = {
    channelId: shopChannel.id,
    categoryId: catId,
    sellerId: userId,
    everyoneMentions: catData.everyoneMentions,
    hereMentions: catData.hereMentions,
    shopmen: catData.shopmen,
    shoprole: catData.shoprole,
    shopRoleMentions: catData.shopRoleMentions,
    maxWarns: catData.maxWarns,
    date: datecreated,
    taxPrice: catData.taxPrice,
    hasTax: catData.hasTax,
    nametype: catData.nametype,
    pirefix: pirefix,
    shopname: name,
    warns: 0,
    status: "1",
    isFree: true,
};

await db.set(`shop_${shopChannel.id}_${guildId}`, ob);

if (catData.shoprole) {
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (member) await member.roles.add(catData.shoprole).catch(() => {});
}
    const serverColor = _ec.color(guildId);
    const guildIcon = interaction.guild.iconURL({ size: 1024 });

    const container = new ContainerBuilder().setAccentColor(serverColor);

    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# تـم انـشـاء مـتـجـر `))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon))
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
const everyonePrice = catData.everyoneMentions || "غير محدد";
const herePrice = catData.hereMentions || "غير محدد";
const shopRolePrice = catData.shopRoleMentions || "غير محدد";
const shopRoleId = catData.shoprole || "";
const hasTax = catData.hasTax ? "نعم" : "لا";

container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
        `**> <a:blue:1475940275951112202> ﹣ المـتـجـر : ${shopChannel}**\n` +
        `**> <a:blue:1475940275951112202> ﹣ صـاحـب المـتـجـر : <@${userId}>**\n` +
        `**> <a:blue:1475940275951112202> ﹣ نـوع المـتـجر : ${catData.nametype}**\n` +
        `**> <a:blue:1475940275951112202> ﹣ رتبة هاذا النوع : ${shopRoleId ? `<@&${shopRoleId}>` : "غير محدد"}**\n` +
        `**> <a:blue:1475940275951112202> ﹣ اقصى عدد للتحذيرات : ${catData.maxWarns || 3}**\n` +
        `**> <a:blue:1475940275951112202> ﹣ بضريبه؟ : ${hasTax}**\n\n` +
        `<a:by_noobot:1500772524060049518> - __ @everyone : ${everyonePrice} __\n` +
        `<a:by_noobot:1500772050715807825>: - __ @here : ${herePrice} __\n` +
        `<a:MEX_SHOP:1474489365500526703> - __ ${shopRoleId ? `<@&${shopRoleId}>` : "رول"} : ${shopRolePrice} __`
    )
);
     container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${interaction.guild.name} | نـظـام الـمـتـاجـر`));

// حط المنشن داخل container
container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`<@${userId}> `)
);
// للمتجر
await shopChannel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
});

// للتكت
await interaction.channel.send({
    content: `✅ تم إنشاء متجرك المجاني: ${shopChannel}`,
});
    await db.delete(`shop_ticket_${userId}_${guildId}`);
    setTimeout(() => interaction.channel.delete().catch(() => {}), 20000);
});
// ==========================================
// 4. مزاد مجاني - فتح تكت (Container v2)
// ==========================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton() || interaction.customId !== "free_auction_open") return;

    const guildId = _ec.gid(interaction);
    const userId = interaction.user.id;

    const auctionCategoryId = await db.get(`catbuy_auction_${guildId}`);
    if (!auctionCategoryId) {
        return interaction.reply({ content: "❌ يرجى تحديد كتاغوري الشراء باستخدام الأمر: /setup", ephemeral: true });
    }

    const auctionAdminRoleId = await db.get(`auctionad_${guildId}`);
    const auctionAdminRole = interaction.guild.roles.cache.get(auctionAdminRoleId);
    if (!auctionAdminRole) {
        return interaction.reply({ content: "❌ يرجى تحديد مسؤول المزاد باستخدام الأمر: /setup", ephemeral: true });
    }

    try {
        const auctionData = await db.get(`auction_ticket_${userId}_${guildId}`);
        if (auctionData) {
            const existingChannel = interaction.guild.channels.cache.get(auctionData.channelId);
            if (existingChannel) {
                return interaction.reply({ content: `❌ لديك تذكرة مفتوحة بالفعل: <#${existingChannel.id}>`, ephemeral: true });
            } else {
                await db.delete(`auction_ticket_${userId}_${guildId}`);
            }
        }

        await interaction.deferReply({ ephemeral: true });

        const ticketChannel = await interaction.guild.channels.create({
            name: `مزاد-مجاني-${interaction.user.username}`,
            type: ChannelType.GuildText,
            parent: auctionCategoryId,
            permissionOverwrites: [
                { id: userId, allow: ["SendMessages", "EmbedLinks", "AttachFiles", "ViewChannel"] },
                { id: interaction.guild.roles.everyone, deny: ["ViewChannel"] },
                { id: auctionAdminRole.id, allow: ["SendMessages", "ViewChannel", "MentionEveryone"] },
            ],
        });

        await db.set(`auction_ticket_${userId}_${guildId}`, { userId, channelId: ticketChannel.id, isFree: true });
        await db.set(`auction_ticket_channel_${ticketChannel.id}`, { ownerId: userId, guildId, isFree: true });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("every-auction").setLabel("مـنشـن ايفري").setStyle(ButtonStyle.Secondary).setEmoji(emojis.auction),
            new ButtonBuilder().setCustomId("here-auction").setLabel("مـنشـن هـيـر").setStyle(ButtonStyle.Secondary).setEmoji(emojis.auction),
            new ButtonBuilder().setCustomId("mzad-auction").setLabel("مـنشـن مـزاد").setStyle(ButtonStyle.Secondary).setEmoji(emojis.auction),
            new ButtonBuilder().setCustomId("closeauction").setLabel("اغـلاق الـتـكت").setStyle(ButtonStyle.Danger).setEmoji(emojis.close || "🔒"),
        );

        const serverColor = _ec.color(guildId);
        const guildIcon = interaction.guild.iconURL({ size: 1024 });
        const auctionImage = await db.get(`buyauctionimage_${guildId}`) || await db.get(`image_${guildId}`);

        const container = new ContainerBuilder().setAccentColor(serverColor);

        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# تـكـت الـمـزادات (مـجـانـي)`))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon))
        );

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**اخـتـر نـوع الـمـنـشـن (مـجـانـاً)**\n` +
                `**الـتـحـويـل لـ <@&${auctionAdminRole.id}>**`
            )
        );

        if (auctionImage) {
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(auctionImage))
            );
        }

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${interaction.guild.name} | نـظـام الـمـزادات الـمـجـانـي`));

        container.addActionRowComponents(row);
// حط المنشن داخل container
container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`<@${userId}> <@&${auctionAdminRoleId}>`)
);

await ticketChannel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
});
        await interaction.editReply({ content: `**__ تم انشاء تذكرة المزاد المجاني : <#${ticketChannel.id}> __**` });
    } catch (error) {
        console.error(error);
        if (interaction.deferred) await interaction.editReply({ content: "❌ حدث خطأ." });
    }
});

// ==========================================
// 5. أزرار المزاد - إذا مجاني (يتخطى الدفع)
// ==========================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!["every-auction", "here-auction", "mzad-auction"].includes(interaction.customId)) return;
    if (!interaction.guild) return;

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const channel = interaction.channel;

    const ticketData = await db.get(`auction_ticket_channel_${channel.id}`);
    if (!ticketData?.isFree) return;

    const ticketOwner = await db.get(`auction_ticket_${userId}_${guildId}.userId`);
    if (ticketOwner !== userId) return interaction.reply({ content: "❌ ليس لك.", ephemeral: true });

    let mentionType;
    if (interaction.customId === "every-auction") mentionType = "@everyone";
    else if (interaction.customId === "here-auction") mentionType = "@here";
    else {
        const mzadRoleId = await db.get(`auctionmzadrole_${guildId}`);
        mentionType = `<@&${mzadRoleId}>`;
    }

    const auctionadmin = await db.get(`auctionad_${guildId}`);
    await interaction.reply({ content: "✅ تم الاختيار مجاناً", ephemeral: true });
    await runAuctionQuestionFlow(interaction.channel, db, config, mentionType, 0, 0, guildId, userId, auctionadmin);
});

// ==========================================
// 6. طلب مجاني - فتح تكت (Container v2)
// ==========================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton() || interaction.customId !== "free_order_open") return;

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    const orderCat = await db.get(`catbuy_order_${guildId}`);
    if (!orderCat) return interaction.reply({ content: "❌ لم يتم إعداد كتاغوري الطلبات. استخدم /setup", flags: MessageFlags.Ephemeral });

    const orderAdmin = await db.get(`orderad_${guildId}`);
    if (!orderAdmin) return interaction.reply({ content: "❌ لم يتم إعداد مسؤول الطلبات. استخدم /setup", flags: MessageFlags.Ephemeral });

    const existing = await db.get(`order_ticket_${userId}_${guildId}`);
    if (existing) {
        const existingCh = interaction.guild.channels.cache.get(existing.channelId);
        if (existingCh) return interaction.reply({ content: `❌ لديك تذكرة مفتوحة: <#${existingCh.id}>`, flags: MessageFlags.Ephemeral });
        await db.delete(`order_ticket_${userId}_${guildId}`);
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const adminRole = interaction.guild.roles.cache.get(orderAdmin);
    const safeName = interaction.user.username.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, "-").slice(0, 24) || "user";
    const ticketChannel = await interaction.guild.channels.create({
        name: `طلب-مجاني-${safeName}`,
        type: ChannelType.GuildText,
        parent: orderCat,
        permissionOverwrites: [
            { id: userId, allow: ["SendMessages", "EmbedLinks", "AttachFiles", "ViewChannel"] },
            { id: interaction.guild.roles.everyone, deny: ["SendMessages", "ViewChannel"] },
            { id: adminRole?.id || orderAdmin, allow: ["SendMessages", "MentionEveryone", "EmbedLinks", "AttachFiles", "ViewChannel"] },
        ],
    });

    await db.set(`order_ticket_${userId}_${guildId}`, { userId, channelId: ticketChannel.id, isFree: true });
    await db.set(`order_ticket_channel_${ticketChannel.id}`, { ownerId: userId, guildId, isFree: true });

    const typeButtons = [
        new ButtonBuilder().setCustomId(`order_type_every_${userId}`).setLabel("منشن @everyone").setStyle(ButtonStyle.Secondary).setEmoji(emojis.auction),
        new ButtonBuilder().setCustomId(`order_type_here_${userId}`).setLabel("منشن @here").setStyle(ButtonStyle.Secondary).setEmoji(emojis.auction),
        new ButtonBuilder().setCustomId(`order_type_order_${userId}`).setLabel("منشن طلبات").setStyle(ButtonStyle.Secondary).setEmoji(emojis.auction),
        new ButtonBuilder().setCustomId(`order_close_${userId}`).setLabel("إغلاق التكت").setStyle(ButtonStyle.Danger).setEmoji(emojis.close),
    ];

    const serverColor = _ec.color(guildId);
    const guildIcon = interaction.guild.iconURL({ size: 1024 });
    const orderImage = await db.get(`buyorderimage_${guildId}`) || await db.get(`image_${guildId}`);

    const container = new ContainerBuilder().setAccentColor(serverColor);

    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# تـكـت الـطـلـبـات (مـجـانـي)`))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon))
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**اخـتـر نـوع الـمـنـشـن (مـجـانـاً)**`)
    );

    if (orderImage) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(orderImage))
        );
    }

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${interaction.guild.name} | نـظـام الـطـلـبـات الـمـجـانـي`));

    container.addActionRowComponents(new ActionRowBuilder().addComponents(...typeButtons));

   // حط المنشن داخل container
container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`<@${userId}> <@&${orderAdmin}>`)
);

await ticketChannel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
});
    await interaction.editReply({ content: `✅ تم إنشاء تذكرة الطلب المجاني: <#${ticketChannel.id}>` });
});

// ==========================================
// 7. أزرار الطلبات - إذا مجاني (يتخطى الدفع)
// ==========================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("order_type_") || interaction.customId.startsWith("order_close_")) return;
    if (!interaction.guild) return;

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const channel = interaction.channel;

    const ticketData = await db.get(`order_ticket_channel_${channel.id}`);
    if (!ticketData?.isFree) return;

    const ticketOwner = ticketData?.ownerId;
    if (ticketOwner && ticketOwner !== userId) return interaction.reply({ content: "❌ ليس لك.", ephemeral: true });

    let mentionLabel;
    if (interaction.customId.startsWith("order_type_every_")) mentionLabel = "@everyone";
    else if (interaction.customId.startsWith("order_type_here_")) mentionLabel = "@here";
    else {
        const roleId = await db.get(`order-mentionrole_${guildId}`);
        mentionLabel = `<@&${roleId}>`;
    }

    await interaction.reply({ content: "✅ تم الاختيار مجاناً", ephemeral: true });
    await interaction.channel.send("✅ **تم الاختيار مجاناً!** يرجى كتابة طلبك الآن:");

    let requestText;
    try {
        const msgs = await interaction.channel.awaitMessages({ filter: m => m.author.id === userId, max: 1, time: 300000, errors: ["time"] });
        requestText = msgs.first().content;
        if (/(https?:\/\/[^\s]+)|(discord\.(gg|io|me|li|com\/invite)\/.+[a-z])/gi.test(requestText)) {
            await interaction.channel.send("❌ ممنوع الروابط.");
            setTimeout(() => channel.delete().catch(() => {}), 5000);
            return;
        }
    } catch {
        await interaction.channel.send("⏰ انتهى الوقت.");
        setTimeout(() => channel.delete().catch(() => {}), 5000);
        return;
    }

    const orderRoomId = await db.get(`orderroom_${guildId}`);
    const orderRoom = interaction.guild.channels.cache.get(orderRoomId);
    if (orderRoom) {
        await orderRoom.send(`${mentionLabel}\n**- صاحب الطلب: <@${userId}>\n- الطلب: ${requestText}\n- المنشن: ${mentionLabel}**`);
    }

    await db.delete(`order_ticket_${userId}_${guildId}`);
    await db.delete(`order_ticket_channel_${channel.id}`);
    await interaction.channel.send("✅ تم نشر طلبك بنجاح، سيتم حذف التكت.");
    setTimeout(() => channel.delete().catch(() => {}), 3000);
});     
 // ============================================
// 1. أمر $تغير - تغيير اسم التكت (لرتبة الدعم الفني)
// ============================================
client.on("messageCreate", async (message) => {
    if (!message.content.startsWith("$تغير")) return;
    if (!message.guild) return;

    const channel = message.channel;
    const args = message.content.slice(6).trim();

    // التحقق من أن الروم تكت دعم/تشهير
    const meta = await db.get(`support_ticket_ch_${channel.id}`);
    if (!meta) {
        return message.reply("**❌ هذه القناة ليست تكت دعم أو تشهير.**");
    }

    // جلب رتبة الدعم الفني
    const supportRoleId = await db.get(`support_admin_${message.guild.id}`);
    const scamRoleId = await db.get(`scam_admin_${message.guild.id}`);
    
    // التحقق من صلاحية رتبة الدعم الفني
    const hasSupportRole = supportRoleId && message.member.roles.cache.has(supportRoleId);
    const hasScamRole = scamRoleId && message.member.roles.cache.has(scamRoleId);
    const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);
    
    if (!hasSupportRole && !hasScamRole && !isAdmin) {
        return message.reply("**❌ هذا الأمر لرتبة الدعم الفني فقط.**");
    }

    if (!args) {
        return message.reply("**❌ استخدم: `$تغير الاسم الجديد`**");
    }

    // تنظيف الاسم
    const newName = args
        .replace(/[^a-zA-Z0-9\u0600-\u06FF\-]/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 32);

    if (!newName) {
        return message.reply("**❌ الاسم غير صالح.**");
    }

    try {
        await channel.setName(newName);
        await message.reply(`**✅ تم تغيير اسم التكت إلى: \`${newName}\`**`);
        await message.delete().catch(() => {});
    } catch (error) {
        await message.reply(`**❌ حدث خطأ: ${error.message}**`);
    }
});

// ============================================
// 2. أمر $اضافه - إضافة عضو للتكت (لرتبة الدعم الفني)
// ============================================
client.on("messageCreate", async (message) => {
    if (!message.content.startsWith("$اضافه")) return;
    if (!message.guild) return;

    const channel = message.channel;
    const args = message.content.slice(7).trim();

    // التحقق من أن الروم تكت دعم/تشهير
    const meta = await db.get(`support_ticket_ch_${channel.id}`);
    if (!meta) {
        return message.reply("**❌ هذه القناة ليست تكت دعم أو تشهير.**");
    }

    // جلب رتبة الدعم الفني
    const supportRoleId = await db.get(`support_admin_${message.guild.id}`);
    const scamRoleId = await db.get(`scam_admin_${message.guild.id}`);
    
    const hasSupportRole = supportRoleId && message.member.roles.cache.has(supportRoleId);
    const hasScamRole = scamRoleId && message.member.roles.cache.has(scamRoleId);
    const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);
    
    if (!hasSupportRole && !hasScamRole && !isAdmin) {
        return message.reply("**❌ هذا الأمر لرتبة الدعم الفني فقط.**");
    }

    if (!args) {
        return message.reply("**❌ استخدم: `$اضافه @منشن` أو `$اضافه ID`**");
    }

    // استخراج ID من المنشن أو النص
    let memberId = args;
    const mentionMatch = args.match(/<@!?(\d+)>/);
    if (mentionMatch) memberId = mentionMatch[1];

    if (!/^\d{17,20}$/.test(memberId)) {
        return message.reply("**❌ معرف غير صالح. أرسل منشن أو ID صحيح.**");
    }

    try {
        const member = await message.guild.members.fetch(memberId).catch(() => null);
        if (!member) {
            return message.reply("**❌ العضو غير موجود في السيرفر.**");
        }

        await channel.permissionOverwrites.edit(member, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
            EmbedLinks: true,
        });

        await message.reply(`**✅ تمت إضافة <@${memberId}> للتكت.**`);
        await message.delete().catch(() => {});
    } catch (error) {
        await message.reply(`**❌ حدث خطأ: ${error.message}**`);
    }
});

// ============================================
// 3. أمر $ازاله - إزالة عضو من التكت (لرتبة الدعم الفني)
// ============================================
client.on("messageCreate", async (message) => {
    if (!message.content.startsWith("$ازاله")) return;
    if (!message.guild) return;

    const channel = message.channel;
    const args = message.content.slice(7).trim();

    // التحقق من أن الروم تكت دعم/تشهير
    const meta = await db.get(`support_ticket_ch_${channel.id}`);
    if (!meta) {
        return message.reply("**❌ هذه القناة ليست تكت دعم أو تشهير.**");
    }

    // جلب رتبة الدعم الفني
    const supportRoleId = await db.get(`support_admin_${message.guild.id}`);
    const scamRoleId = await db.get(`scam_admin_${message.guild.id}`);
    
    const hasSupportRole = supportRoleId && message.member.roles.cache.has(supportRoleId);
    const hasScamRole = scamRoleId && message.member.roles.cache.has(scamRoleId);
    const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);
    
    if (!hasSupportRole && !hasScamRole && !isAdmin) {
        return message.reply("**❌ هذا الأمر لرتبة الدعم الفني فقط.**");
    }

    if (!args) {
        return message.reply("**❌ استخدم: `$ازاله @منشن` أو `$ازاله ID`**");
    }

    // استخراج ID من المنشن أو النص
    let memberId = args;
    const mentionMatch = args.match(/<@!?(\d+)>/);
    if (mentionMatch) memberId = mentionMatch[1];

    if (!/^\d{17,20}$/.test(memberId)) {
        return message.reply("**❌ معرف غير صالح. أرسل منشن أو ID صحيح.**");
    }

    // منع إزالة صاحب التكت
    if (meta.userId === memberId) {
        return message.reply("**❌ لا يمكنك إزالة صاحب التكت.**");
    }

    try {
        await channel.permissionOverwrites.delete(memberId).catch(() => {});
        await message.reply(`**✅ تمت إزالة <@${memberId}> من التكت.**`);
        await message.delete().catch(() => {});
    } catch (error) {
        await message.reply(`**❌ حدث خطأ: ${error.message}**`);
    }
});

// ===    

}
}