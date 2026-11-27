// ============================================
// الاستيرادات الأساسية
// ============================================
const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    ApplicationCommandOptionType,
    ChannelType,
    PermissionFlagsBits,
} = require('discord.js');

const fs = require('fs');

// ===== إعدادات البريميوم =====
const PREMIUM_CONFIG = {
    PLANS: {
        MONTHLY: {
            id: 'monthly',
            label: ' شهري',
            duration: 30,
            durationMs: 30 * 24 * 60 * 60 * 1000,
            emoji: '<a:by_noobot:1500772297303261205>',
        },
        THREE_MONTHS: {
            id: '3months',
            label: ' 3 أشهر',
            duration: 90,
            durationMs: 90 * 24 * 60 * 60 * 1000,
            emoji: '<a:bhr_star_red:1475942865002561699>',
        },
    },
    COLORS: {
        PREMIUM: 0xffd700,
        SUCCESS: 0x00ff00,
        WARNING: 0xffaa00,
        DANGER: 0xff0000,
        INFO: 0x00bfff,
    },
};

function getPlanConfig(planId) {
    if (planId === 'monthly') return PREMIUM_CONFIG.PLANS.MONTHLY;
    if (planId === '3months') return PREMIUM_CONFIG.PLANS.THREE_MONTHS;
    return null;
}

// ===== الثوابت =====
const MAKER_BOT_ID = "1525440127365808210";
const MAKER_OWNER_ID = "959174041422397471";
const LOG_JOIN_CHANNEL_ID = "1332800465716510802";
const EXPIRY_LOG_CHANNEL_ID = "1332800465716510802";
const ERROR_ROOM_ID = "1332800465716510802";
const TARGET_GUILD_ID = "1332800464613408838";
const REPORTS_CHANNEL_ID = "1332800465716510802";
const TARGET_ROLE_ID = "1462105077773762645";
const TARGET_CHANNEL_ID = "1332800465716510802";

// ============================================
// ===== أوامر الميكر الكاملة بدون اختصار =====
// ============================================
const makerCommands = [
    {
        name: 'add-token',
        description: 'لإضافة توكن',
        dm_permission: false,
        default_member_permissions: 8,
        options: [
            {
                name: 'token',
                description: 'التوكن الذي تريد إضافته',
                type: ApplicationCommandOptionType.String,
                required: true,
            },
            {
                name: 'duration',
                description: 'مدة تشغيل البوت',
                type: ApplicationCommandOptionType.String,
                required: false,
                choices: [
                    { name: ' 3 أيام', value: '3days' },
                    { name: ' أسبوع', value: 'week' },
                    { name: ' أسبوعين', value: '2weeks' },
                    { name: ' شهر', value: 'month' },
                    { name: ' 3 أشهر', value: '3months' },
                    { name: ' 6 أشهر', value: '6months' },
                    { name: ' سنة', value: 'year' },
                ],
            },
        ],
    },
    {
        name: 'remove-token',
        description: 'لحذف توكن',
        dm_permission: false,
        default_member_permissions: 8,
        options: [
            {
                name: 'token',
                description: 'التوكن الذي تريد حذفه',
                type: ApplicationCommandOptionType.String,
                required: true,
            },
        ],
    },
    {
        name: 'panel',
        description: 'لـ ارسال البانل',
        dm_permission: false,
        default_member_permissions: 8,
    },
    {
        name: 'status',
        description: 'لـ ارسـال بـانـل الـحـالـة',
        dm_permission: false,
        default_member_permissions: 8,
    },
    {
        name: 'set-activity',
        dm_permission: false,
        default_member_permissions: 8,
        description: 'تغيير حالة البوت',
        options: [
            {
                name: 'activity',
                description: 'النص الذي تريد عرضه',
                type: ApplicationCommandOptionType.String,
                required: true,
            },
            {
                name: 'type',
                description: 'نوع الحالة (0 = Playing, 1 = Streaming, 2 = Listening, 3 = Watching)',
                type: ApplicationCommandOptionType.Number,
                required: false,
            },
            {
                name: 'presence',
                description: 'حالة الاتصال (online, idle, dnd, invisible)',
                type: ApplicationCommandOptionType.String,
                required: false,
                choices: [
                    { name: '🟢 Online', value: 'online' },
                    { name: '🟡 Idle', value: 'idle' },
                    { name: '🔴 Do Not Disturb', value: 'dnd' },
                ],
            },
        ],
    },
    {
        name: 'set-username',
        dm_permission: false,
        default_member_permissions: 8,
        description: 'تغيير اسم البوت',
        options: [
            {
                name: 'username',
                description: 'الاسم الجديد للبوت',
                type: ApplicationCommandOptionType.String,
                required: true,
            },
        ],
    },
    {
        name: 'bot-avatar',
        description: 'تغيير صورة البوت والبنر',
        dm_permission: false,
        default_member_permissions: 8,
        options: [
            {
                name: 'imge',
                description: 'صورة البوت الجديدة',
                type: ApplicationCommandOptionType.Attachment,
                required: true,
            },
            {
                name: 'banner',
                description: 'بنر البوت الجديد (اختياري)',
                type: ApplicationCommandOptionType.Attachment,
                required: false,
            },
        ],
    },
    {
        name: 'setup-premium',
        description: 'تسطيب نظام البريميوم',
        dm_permission: false,
        default_member_permissions: 8,
        options: [
            {
                name: 'bank',
                description: 'حساب البنك لاستقبال المدفوعات',
                type: ApplicationCommandOptionType.User,
                required: true,
            },
            {
                name: 'log-channel',
                description: 'روم السجلات',
                type: ApplicationCommandOptionType.Channel,
                required: true,
                channel_types: [ChannelType.GuildText],
            },
            {
                name: 'premium-role',
                description: 'رتبة البريميوم',
                type: ApplicationCommandOptionType.Role,
                required: true,
            },
            {
                name: 'notification-channel',
                description: 'روم التنبيهات',
                type: ApplicationCommandOptionType.Channel,
                required: true,
                channel_types: [ChannelType.GuildText],
            },
            {
                name: 'ticket-category',
                description: 'الكاتاجوري التي تُفتح فيها تكتات الشراء والتجديد',
                type: ApplicationCommandOptionType.Channel,
                required: true,
                channel_types: [ChannelType.GuildCategory],
            },
            {
                name: 'price-monthly',
                description: 'سعر الاشتراك الشهري',
                type: ApplicationCommandOptionType.Integer,
                required: true,
                min_value: 1,
            },
            {
                name: 'price-3months',
                description: 'سعر الاشتراك 3 أشهر',
                type: ApplicationCommandOptionType.Integer,
                required: true,
                min_value: 1,
            },
        ],
    },
    {
        name: 'premium-panel',
        description: 'إرسال بانل شراء البريميوم',
        dm_permission: false,
        default_member_permissions: 8,
        options: [
            {
                name: 'embed-text',
                description: 'نص وصف البانل',
                type: ApplicationCommandOptionType.String,
                required: false,
            },
        ],
    },
    {
        name: 'my-premium',
        description: 'عرض تفاصيل اشتراك البريميوم الخاص بك',
        dm_permission: false,
        default_member_permissions: 1,
    },
    {
        name: 'renew-premium',
        description: 'تجديد اشتراك البريميوم',
        dm_permission: false,
        default_member_permissions: 1,
    },
    {
        name: 'transfer-ownership',
        description: 'نقل ملكية البوت لمستخدم آخر',
        dm_permission: false,
        default_member_permissions: 8,
        options: [
            {
                name: 'bot-token',
                description: 'توكن البوت المراد نقله',
                type: ApplicationCommandOptionType.String,
                required: true,
            },
            {
                name: 'new-owner',
                description: 'المستخدم الجديد',
                type: ApplicationCommandOptionType.User,
                required: true,
            },
        ],
    },
    {
        name: 'premium-list',
        description: 'عرض جميع المستخدمين المشتركين',
        dm_permission: false,
        default_member_permissions: 8,
    },
];

const makerCommandNames = [
    'add-token', 'remove-token', 'panel', 'status', 'set-activity', 'set-username', 'bot-avatar',
    'setup-premium', 'premium-panel', 'my-premium', 'renew-premium', 'transfer-ownership', 'premium-list',
];

// Commands that change bot-wide settings or manage subscriptions are owner-only.
const OWNER_ONLY_COMMANDS = new Set([
    'add-token', 'remove-token', 'panel', 'status', 'set-activity', 'set-username',
    'bot-avatar', 'setup-premium', 'premium-panel', 'transfer-ownership', 'premium-list',
]);

// ============================================
// ===== الإمبدات والتصميم =====
// ============================================

function createMakerPanelEmbed(ping, uptime) {
    return new EmbedBuilder()
        .setTitle(' لوحة التحكم')
        .setDescription(
            `** بنق البوت:** \`${ping}ms\`\n` +
            `** مدة التشغيل:** <t:${Math.floor(Date.now() / 1000 - uptime)}:R>\n` +
            `تقدر تسوي بوتك الخاص با الاسم و الصوره الي تبيه من الموقع \n` +
            `https://discord.com/developers/applications\n` +
            `كل شخص له بوت واحد فقط\n` +
            `ما يحتاج تعيد البينات بتلاقيها متسجله علطول`,
        )
        .setFooter({ text: 'تحكم كامل بالبوت' });
}

function createPremiumPanelEmbed(settings) {
    return new EmbedBuilder()
        .setTitle(' نظام البريميوم')
        .setDescription('اضغط على الأزرار أدناه للشراء أو لعرض تفاصيل اشتراكك')
        .addFields(
            {
                name: ' خطط الاشتراك المتاحة',
                value:
                    `**${PREMIUM_CONFIG.PLANS.MONTHLY.emoji} ${PREMIUM_CONFIG.PLANS.MONTHLY.label}:** ${settings.priceMonthly} كردت\n` +
                    `**${PREMIUM_CONFIG.PLANS.THREE_MONTHS.emoji} ${PREMIUM_CONFIG.PLANS.THREE_MONTHS.label}:** ${settings.price3Months} كردت\n` +
                    `* اضغط على زر الشراء لااختيار خطتك*`,
                inline: false,
            },
            {
                name: ' مميزات البريميوم',
                value:
                    `• بـوت بـاسـمـك وصـورتـك\n` +
                    `• تـكـت مـزاد خـاص تـلـقـائي\n` +
                    `• شـكـل امـبـد comp v2 \n` +
                    `• اوامـر اضـافـيـة اكـتـشـفهـا بنـفسـك \n` +
                    `• أولوية في الـدعـم الفـنـي`,
                inline: false,
            },
        )
        .setColor(0x000080)
        .setFooter({ text: 'RD Shop | Dev by .onlyzain' })
        .setTimestamp();
}

function createInvoiceEmbed(user, plan, price, days, settings) {
    return new EmbedBuilder()
        .setTitle(' فاتورة شراء البريميوم')
        .setDescription('تم إنشاء طلب شراء جديد، يرجى تحويل المبلغ المطلوب باستعمال الأمر المرفق أسفله.')
        .addFields(
            { name: ' المشتري', value: `${user} | \`${user.id}\``, inline: true },
            { name: ' الخطة', value: plan.label, inline: true },
            { name: ' المدة', value: `${days} يوم`, inline: true },
            { name: ' المبلغ المطلوب', value: `\`${price}\` كردت`, inline: false },
            { name: ' حساب البنك', value: `<@!${settings.bankId}>`, inline: true },
            { name: ' سبب التحويل', value: `شراء اشتراك بريميوم - ${plan.id}`, inline: true },
            { name: ' المهلة', value: '10 دقائق', inline: true },
        )
        .setColor(0x000080)
        .setFooter({ text: 'قم بنسخ أمر التحويل بالأسفل وتحويل المبلغ للتفعيل التلقائي' })
        .setTimestamp();
}

function createExpiryNotificationEmbed(userData, timeLabel) {
    return new EmbedBuilder()
        .setTitle(' تنبيه: اشتراكك على وشك الانتهاء')
        .setDescription(`متبقي **${timeLabel}** على انتهاء اشتراك البريميوم الخاص بك!`)
        .addFields(
            { name: ' تاريخ الانتهاء', value: `<t:${Math.floor(userData.endDate / 1000)}:F>`, inline: true },
            { name: ' الوقت المتبقي', value: `<t:${Math.floor(userData.endDate / 1000)}:R>`, inline: true },
            { name: ' البوت', value: `\`${userData.botId}\``, inline: true },
        )
        .setColor(0xffaa00)
        .setFooter({ text: 'قم بتجديد اشتراكك الآن لتجنب انقطاع الخدمة' })
        .setTimestamp();
}

function createExpiryEmbed(userData) {
    return new EmbedBuilder()
        .setTitle('🔴 انتهى اشتراك البريميوم')
        .setDescription(`انتهى اشتراك البريميوم الخاص بـ <@${userData.userId}>`)
        .addFields(
            { name: ' تاريخ الانتهاء', value: `<t:${Math.floor(userData.endDate / 1000)}:F>`, inline: true },
            { name: ' البوت', value: `\`${userData.botId}\``, inline: true },
            { name: ' السيرفر', value: `\`${userData.guildId}\``, inline: true },
        )
        .setColor(0xff0000)
        .setFooter({ text: 'يرجى تجديد الاشتراك لتفعيل البوت مرة أخرى' })
        .setTimestamp();
}

function createPremiumTicketCancelButton() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('premium_cancel').setLabel(' إلغاء وإغلاق التكت').setStyle(ButtonStyle.Danger),
    );
}

function createPremiumBuyModal() {
    return new ModalBuilder()
        .setCustomId('premium_buy_modal')
        .setTitle(' إدخال بيانات البوت')
        .setComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('bot_token')
                    .setLabel(' توكن البوت')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('أدخل توكن البوت')
                    .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('bot_id')
                    .setLabel(' ايدي البوت')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('أدخل ايدي البوت')
                    .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('guild_id')
                    .setLabel(' ايدي السيرفر')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('أدخل ايدي السيرفر')
                    .setRequired(true),
            ),
        );
}

// ============================================
// ===== إدارة التكتات والبريميوم =====
// ============================================

async function createPremiumTicket(guild, user, db, settings, purpose = 'شراء') {
    if (!settings.ticketCategoryId) return null;
    const category = guild.channels.cache.get(settings.ticketCategoryId);
    if (!category) return null;

    const safeName = `premium-${user.username}`.toLowerCase().replace(/[^a-z0-9\-]/g, '').slice(0, 90) || `premium-${user.id}`;

    const overwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
            id: user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
            ],
        },
    ];

    const channel = await guild.channels.create({
        name: safeName,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: overwrites,
        topic: `تكت ${purpose} بريميوم — صاحب التكت: ${user.id}`,
    }).catch((err) => {
        console.error('فشل إنشاء تكت البريميوم:', err);
        return null;
    });

    return channel;
}

async function closePremiumTicket(channel, userId, db, delayMs = 8000) {
    await db.delete(`premium_ticket_${userId}`).catch(() => {});
    if (!channel) return;
    setTimeout(() => channel.delete().catch(() => {}), delayMs);
}

// ============================================
// ===== معالجات أوامر البوت الإدارية والعادية =====
// ============================================

async function handleAddToken(i, config, fs) {
    const token = i.options.getString('token');
    const duration = i.options.getString('duration') || 'month';

    try {
        const configFile = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
        if (configFile.tokens.includes(token)) {
            return i.reply({ content: '❌ هذا التوكن موجود بالفعل!', ephemeral: true });
        }
        configFile.tokens.push(token);
        fs.writeFileSync('./config.json', JSON.stringify(configFile, null, 2));
        await i.reply({ content: `✅ تم إضافة التوكن بنجاح! المدة: ${duration}`, ephemeral: true });
    } catch (err) {
        await i.reply({ content: '❌ حدث خطأ أثناء إضافة التوكن.', ephemeral: true });
    }
}

async function handleRemoveToken(i, config, fs) {
    const token = i.options.getString('token');
    try {
        const configFile = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
        const index = configFile.tokens.indexOf(token);
        if (index === -1) {
            return i.reply({ content: '❌ التوكن غير موجود!', ephemeral: true });
        }
        configFile.tokens.splice(index, 1);
        fs.writeFileSync('./config.json', JSON.stringify(configFile, null, 2));
        await i.reply({ content: '✅ تم حذف التوكن بنجاح!', ephemeral: true });
    } catch (err) {
        await i.reply({ content: '❌ حدث خطأ أثناء حذف التوكن.', ephemeral: true });
    }
}

async function handlePanel(i, client) {
    const ping = client.ws.ping;
    const uptime = client.uptime / 1000;
    const embed = createMakerPanelEmbed(ping, uptime);
    await i.reply({ embeds: [embed] });
}

async function handleStatus(i, client) {
    const embed = new EmbedBuilder()
        .setTitle('📊 حالة البوت')
        .addFields(
            { name: '🏓 البنق', value: `${client.ws.ping}ms`, inline: true },
            { name: '⏱️ وقت التشغيل', value: `<t:${Math.floor(Date.now() / 1000 - client.uptime / 1000)}:R>`, inline: true }
        )
        .setColor(0x00ff00);
    await i.reply({ embeds: [embed] });
}

async function handleSetActivity(i, client) {
    const activity = i.options.getString('activity');
    const type = i.options.getNumber('type') || 0;
    const presence = i.options.getString('presence') || 'online';

    client.user.setPresence({
        activities: [{ name: activity, type }],
        status: presence,
    });
    await i.reply({ content: '✅ تم تغيير حالة البوت بنجاح!', ephemeral: true });
}

async function handleSetUsername(i, client) {
    const username = i.options.getString('username');
    try {
        await client.user.setUsername(username);
        await i.reply({ content: `✅ تم تغيير اسم البوت إلى: **${username}**`, ephemeral: true });
    } catch (err) {
        await i.reply({ content: '❌ حدث خطأ، قد يكون الاسم مكرراً أو تجاوزت الحد المسموح.', ephemeral: true });
    }
}

async function handleBotAvatar(i, client) {
    const avatar = i.options.getAttachment('imge');
    const banner = i.options.getAttachment('banner');
    await i.deferReply({ ephemeral: true });

    try {
        if (avatar) await client.user.setAvatar(avatar.url);
        if (banner) await client.user.setBanner(banner.url).catch(() => {});
        await i.editReply({ content: '✅ تم تحديث صورة/بنر البوت بنجاح!' });
    } catch (err) {
        await i.editReply({ content: '❌ حدث خطأ أثناء تغيير الصورة.' });
    }
}

// ============================================
// ===== معالجة تفاعلات البريميوم =====
// ============================================

async function handleSetupPremium(i, db) {
    const bank = i.options.getUser('bank');
    const logChannel = i.options.getChannel('log-channel');
    const premiumRole = i.options.getRole('premium-role');
    const notificationChannel = i.options.getChannel('notification-channel');
    const ticketCategory = i.options.getChannel('ticket-category');
    const priceMonthly = i.options.getInteger('price-monthly');
    const price3Months = i.options.getInteger('price-3months');

    const settings = {
        bankId: bank.id,
        logChannelId: logChannel.id,
        premiumRoleId: premiumRole.id,
        notificationChannelId: notificationChannel.id,
        ticketCategoryId: ticketCategory.id,
        priceMonthly,
        price3Months,
        guildId: i.guild.id,
        setupDate: Date.now(),
    };

    await db.set('premium_settings', settings);

    const embed = new EmbedBuilder()
        .setTitle(' تم تسطيب نظام البريميوم بنجاح!')
        .setColor(0x00ff00)
        .addFields(
            { name: ' حساب البنك', value: `<@${bank.id}>`, inline: true },
            { name: ' روم السجلات', value: `<#${logChannel.id}>`, inline: true },
            { name: ' رتبة البريميوم', value: `<@&${premiumRole.id}>`, inline: true },
            { name: ' روم التنبيهات', value: `<#${notificationChannel.id}>`, inline: true },
            { name: ' كاتاجوري التكتات', value: `${ticketCategory.name}`, inline: true },
            { name: ' سعر شهري', value: `${priceMonthly} كردت`, inline: true },
            { name: ' سعر 3 أشهر', value: `${price3Months} كردت`, inline: true },
        )
        .setTimestamp();

    await i.reply({ embeds: [embed], ephemeral: true });
}

async function handlePremiumPanel(i, db) {
    const embedText = i.options.getString('embed-text');
    const settings = await db.get('premium_settings');

    if (!settings) {
        return i.reply({ content: '❌ يرجى تسطيب النظام أولاً باستخدام /setup-premium', ephemeral: true });
    }

    const embed = createPremiumPanelEmbed(settings);
    if (embedText) embed.setDescription(embedText);

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('premium_buy').setLabel('شراء اشتراك').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('premium_my_subscription').setLabel('تفاصيل اشتراكي').setStyle(ButtonStyle.Primary),
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('premium_renew').setLabel(' تجديد الاشتراك').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('premium_invoice').setLabel(' فاتورتي').setStyle(ButtonStyle.Secondary),
    );

    await i.channel.send({ embeds: [embed], components: [row1, row2] });
    await i.reply({ content: '✅ تم إرسال بانل البريميوم', ephemeral: true });
}

async function handlePremiumBuyButton(i, db) {
    const settings = await db.get('premium_settings');
    if (!settings) {
        return i.reply({ content: '❌ النظام غير مضبوط', ephemeral: true });
    }

    const existingUser = await db.get(`premium_user_${i.user.id}`);
    if (existingUser && existingUser.active && existingUser.endDate > Date.now()) {
        return i.reply({ content: '❌ لديك اشتراك نشط بالفعل!', ephemeral: true });
    }

    const existingTicketId = await db.get(`premium_ticket_${i.user.id}`);
    if (existingTicketId && i.guild.channels.cache.get(existingTicketId)) {
        return i.reply({ content: `❌ لديك تكت شراء مفتوح بالفعل: <#${existingTicketId}>`, ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle(' شراء اشتراك بريميوم')
        .setDescription('اختر خطة الاشتراك المناسبة لك')
        .addFields(
            { name: 'شهري', value: `المدة: 30 يوم\nالسعر: ${settings.priceMonthly} كردت`, inline: true },
            { name: ' 3 أشهر', value: `المدة: 90 يوم\nالسعر: ${settings.price3Months} كردت`, inline: true },
        )
        .setColor(0xffd700)
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('premium_buy_monthly').setLabel(' شهري').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('premium_buy_3months').setLabel(' 3 أشهر').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('premium_cancel').setLabel(' إلغاء').setStyle(ButtonStyle.Danger),
    );

    await i.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function handlePremiumPlanSelection(i, db) {
    const planId = i.customId === 'premium_buy_monthly' ? 'monthly' : '3months';
    const settings = await db.get('premium_settings');

    if (!settings) {
        return i.reply({ content: '❌ النظام غير مضبوط', ephemeral: true });
    }

    await db.set(`premium_plan_${i.user.id}`, planId);
    await i.showModal(createPremiumBuyModal());
}

async function handlePremiumBuyModal(i, db, client) {
    const botToken = i.fields.getTextInputValue('bot_token');
    const botId = i.fields.getTextInputValue('bot_id');
    const guildId = i.fields.getTextInputValue('guild_id');

    const planId = await db.get(`premium_plan_${i.user.id}`);
    if (!planId) return i.reply({ content: '❌ لم يتم اختيار خطة.', ephemeral: true });

    const settings = await db.get('premium_settings');
    if (!settings) return i.reply({ content: '❌ النظام غير مضبوط', ephemeral: true });

    const plan = getPlanConfig(planId);
    if (!plan) return i.reply({ content: '❌ خطة غير صالحة', ephemeral: true });

    const price = planId === 'monthly' ? settings.priceMonthly : settings.price3Months;
    const days = planId === 'monthly' ? 30 : 90;

    await db.delete(`premium_plan_${i.user.id}`);

    const existingTicketId = await db.get(`premium_ticket_${i.user.id}`);
    if (existingTicketId && i.guild.channels.cache.get(existingTicketId)) {
        return i.reply({ content: `❌ لديك تكت شراء مفتوح بالفعل: <#${existingTicketId}>`, ephemeral: true });
    }

    await i.deferReply({ ephemeral: true });

    const ticketChannel = await createPremiumTicket(i.guild, i.user, db, settings, 'شراء');
    if (!ticketChannel) {
        return i.editReply({ content: '❌ تعذر إنشاء تكت الشراء.' });
    }
    await db.set(`premium_ticket_${i.user.id}`, ticketChannel.id);

    const tempData = {
        userId: i.user.id,
        plan: planId,
        planLabel: plan.label,
        botToken,
        botId,
        guildId,
        price,
        days,
        channelId: ticketChannel.id,
        timestamp: Date.now(),
    };
    await db.set(`premium_temp_${i.user.id}`, tempData);

    await i.editReply({ content: `✅ تم إنشاء تكت الشراء: ${ticketChannel}` });

    const invoiceEmbed = createInvoiceEmbed(i.user, plan, price, days, settings);
    const transferCommand = `#credits <@${settings.bankId}> ${price}`;

    await ticketChannel.send({
        content: `${i.user}\n\n**قم بنسخ الأمر التالي للتحويل:**\n\`\`\`${transferCommand}\`\`\``,
        embeds: [invoiceEmbed],
        components: [createPremiumTicketCancelButton()],
    });

    const filter = (m) =>
        m.author.id === settings.bankId &&
        m.content.includes(i.user.id) &&
        m.content.includes(price.toString());

    const collector = ticketChannel.createMessageCollector({ filter, max: 1, time: 600000 });

    collector.on('collect', async (msg) => {
        const tempData2 = await db.get(`premium_temp_${i.user.id}`);
        if (!tempData2) return;

        const userData = await addPremiumUser(i.user.id, tempData2, db, client);

        const confirmEmbed = new EmbedBuilder()
            .setTitle(' تم تأكيد الدفع بنجاح!')
            .setDescription('تم تفعيل اشتراك البريميوم الخاص بك، سيتم إغلاق هذا التكت تلقائياً.')
            .addFields(
                { name: ' المستخدم', value: `<@${userData.userId}>`, inline: true },
                { name: ' الخطة', value: plan.label, inline: true },
                { name: ' تاريخ الانتهاء', value: `<t:${Math.floor(userData.endDate / 1000)}:F>`, inline: true },
            )
            .setColor(0x00ff00)
            .setTimestamp();

        await ticketChannel.send({ embeds: [confirmEmbed] });

        try {
            const member = await i.guild.members.fetch(i.user.id);
            await member.roles.add(settings.premiumRoleId);
        } catch (err) {}

        const logChannel = client.channels.cache.get(settings.logChannelId);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle(' اشتراك بريميوم جديد')
                .setColor(0x00ff00)
                .addFields(
                    { name: 'المستخدم', value: `<@${i.user.id}>`, inline: true },
                    { name: ' الخطة', value: plan.label, inline: true },
                    { name: ' المبلغ', value: `${price} كردت`, inline: true },
                    { name: ' ايدي البوت', value: botId, inline: true },
                    { name: ' ايدي السيرفر', value: guildId, inline: true },
                    { name: ' تاريخ الانتهاء', value: `<t:${Math.floor(userData.endDate / 1000)}:F>`, inline: true },
                )
                .setTimestamp();
            logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }

        await db.delete(`premium_temp_${i.user.id}`);
        await closePremiumTicket(ticketChannel, i.user.id, db);
    });

    collector.on('end', async (collected) => {
        if (collected.size === 0) {
            const tempData3 = await db.get(`premium_temp_${i.user.id}`);
            if (tempData3) {
                await ticketChannel.send('⏰ انتهى الوقت، لم يتم استلام الدفع. سيتم إغلاق التكت.').catch(() => {});
                await db.delete(`premium_temp_${i.user.id}`);
                await closePremiumTicket(ticketChannel, i.user.id, db);
            }
        }
    });
}

async function handleMyPremium(i, db) {
    const userData = await db.get(`premium_user_${i.user.id}`);
    if (!userData || !userData.active) {
        return i.reply({ content: '❌ ليس لديك اشتراك بريميوم نشط حالياً.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('💎 تفاصيل اشتراكك')
        .addFields(
            { name: 'الخطة', value: userData.planLabel, inline: true },
            { name: 'تاريخ الانتهاء', value: `<t:${Math.floor(userData.endDate / 1000)}:F>`, inline: true },
            { name: 'الوقت المتبقي', value: `<t:${Math.floor(userData.endDate / 1000)}:R>`, inline: true },
            { name: 'ايدي البوت', value: `\`${userData.botId}\``, inline: true },
            { name: 'ايدي السيرفر', value: `\`${userData.guildId}\``, inline: true }
        )
        .setColor(0x00d700)
        .setTimestamp();

    await i.reply({ embeds: [embed], ephemeral: true });
}

async function handleRenewPremium(i, db) {
    const userData = await db.get(`premium_user_${i.user.id}`);
    if (!userData) {
        return i.reply({ content: '❌ ليس لديك بيانات اشتراك سابقة لتجديدها.', ephemeral: true });
    }
    await handlePremiumBuyButton(i, db);
}

async function handleTransferOwnership(i, db) {
    const botToken = i.options.getString('bot-token');
    const newOwner = i.options.getUser('new-owner');

    const allKeys = await db.all();
    const targetKey = allKeys.find(k => k.id.startsWith('premium_user_') && k.value.botToken === botToken);

    if (!targetKey) {
        return i.reply({ content: '❌ لم يتم العثور على اشتراك مرتبط بهذا التوكن.', ephemeral: true });
    }

    const userData = targetKey.value;
    const oldUserId = userData.userId;

    await db.delete(`premium_user_${oldUserId}`);
    userData.userId = newOwner.id;
    await db.set(`premium_user_${newOwner.id}`, userData);

    await i.reply({ content: `✅ تم نقل ملكية البوت من <@${oldUserId}> إلى ${newOwner}`, ephemeral: true });
}

async function handlePremiumList(i, db) {
    const allKeys = await db.all();
    const activeUsers = allKeys.filter(k => k.id.startsWith('premium_user_') && k.value.active);

    if (activeUsers.length === 0) {
        return i.reply({ content: '📋 لا يوجد مشتركين حاليين.', ephemeral: true });
    }

    let description = activeUsers.map((u, index) => {
        const d = u.value;
        return `**${index + 1}.** <@${d.userId}> | الخطة: ${d.planLabel} | ينتهي: <t:${Math.floor(d.endDate / 1000)}:R>`;
    }).join('\n');

    const embed = new EmbedBuilder()
        .setTitle(' قائمة المشتركين بالبريميوم')
        .setDescription(description)
        .setColor(0x000080)
        .setTimestamp();

    await i.reply({ embeds: [embed], ephemeral: true });
}

// ============================================
// ===== الحساب والجداول المصلحة =====
// ============================================

async function addPremiumUser(userId, data, db, client) {
    const { plan, planLabel, botToken, botId, guildId, price, days } = data;
    const endDate = Date.now() + (days * 24 * 60 * 60 * 1000);

    const userData = {
        userId,
        plan,
        planLabel,
        botToken,
        botId,
        guildId,
        price,
        startDate: Date.now(),
        endDate,
        days,
        active: true,
        autoRenew: false,
        renewalCount: 0,
        lastRenewal: Date.now(),
        notified3d: false,
        notified24h: false
    };

    await db.set(`premium_user_${userId}`, userData);

    try {
        const configFile = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
        if (!configFile.tokens.includes(botToken)) {
            configFile.tokens.push(botToken);
            fs.writeFileSync('./config.json', JSON.stringify(configFile, null, 2));
        }
    } catch (err) {
        console.error('فشل تحديث config.json:', err);
    }

    return userData;
}

async function checkAllPremiumExpiries(client, db) {
    const allKeys = await db.all();
    const premiumUsers = allKeys.filter(k => k.id.startsWith('premium_user_') && k.value.active);
    const now = Date.now();

    for (const entry of premiumUsers) {
        const userData = entry.value;
        const userId = userData.userId;
        const timeLeft = userData.endDate - now;

        if (timeLeft <= 0) {
            await handleExpiredSubscription(userId, db, client);
            continue;
        }

        if (timeLeft <= 24 * 60 * 60 * 1000 && !userData.notified24h) {
            userData.notified24h = true;
            await db.set(`premium_user_${userId}`, userData);
            await sendExpiryNotification(userId, '24 ساعة', userData, db, client);
        } else if (timeLeft <= 3 * 24 * 60 * 60 * 1000 && timeLeft > 24 * 60 * 60 * 1000 && !userData.notified3d) {
            userData.notified3d = true;
            await db.set(`premium_user_${userId}`, userData);
            await sendExpiryNotification(userId, '3 أيام', userData, db, client);
        }
    }
}

async function sendExpiryNotification(userId, timeLabel, userData, db, client) {
    const settings = await db.get('premium_settings');
    if (!settings) return;

    const notifChannel = client.channels.cache.get(settings.notificationChannelId);
    const embed = createExpiryNotificationEmbed(userData, timeLabel);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`premium_renew_${userId}`).setLabel(' تجديد الاشتراك').setStyle(ButtonStyle.Primary),
    );

    if (notifChannel) {
        await notifChannel.send({ content: `<@${userId}>`, embeds: [embed], components: [row] }).catch(() => {});
    }
}

async function handleExpiredSubscription(userId, db, client) {
    const userData = await db.get(`premium_user_${userId}`);
    if (!userData || !userData.active) return;

    userData.active = false;
    await db.set(`premium_user_${userId}`, userData);

    const settings = await db.get('premium_settings');
    if (settings) {
        try {
            const guild = await client.guilds.fetch(settings.guildId);
            const member = await guild.members.fetch(userId);
            await member.roles.remove(settings.premiumRoleId);
        } catch (e) {}

        const embed = createExpiryEmbed(userData);
        const logChannel = client.channels.cache.get(settings.logChannelId);
        if (logChannel) {
            await logChannel.send({ content: `<@${userId}>`, embeds: [embed] }).catch(() => {});
        }
    }
}

// ============================================
// ===== MAIN INTERACTION HANDLER =====
// ============================================

async function handleMakerInteraction(i, client, config, db, fs) {
    if (i.isChatInputCommand() && OWNER_ONLY_COMMANDS.has(i.commandName) && i.user.id !== MAKER_OWNER_ID) {
        return i.reply({ content: '❌ هذا الأمر مخصص لمالك البوت فقط.', ephemeral: true });
    }

    if (i.isChatInputCommand()) {
        switch (i.commandName) {
            case 'add-token': return await handleAddToken(i, config, fs);
            case 'remove-token': return await handleRemoveToken(i, config, fs);
            case 'panel': return await handlePanel(i, client);
            case 'status': return await handleStatus(i, client);
            case 'set-activity': return await handleSetActivity(i, client);
            case 'set-username': return await handleSetUsername(i, client);
            case 'bot-avatar': return await handleBotAvatar(i, client);
            case 'setup-premium': return await handleSetupPremium(i, db);
            case 'premium-panel': return await handlePremiumPanel(i, db);
            case 'my-premium': return await handleMyPremium(i, db);
            case 'renew-premium': return await handleRenewPremium(i, db);
            case 'transfer-ownership': return await handleTransferOwnership(i, db);
            case 'premium-list': return await handlePremiumList(i, db);
        }
    }

    if (i.isButton()) {
        switch (i.customId) {
            case 'premium_buy': return await handlePremiumBuyButton(i, db);
            case 'premium_buy_monthly':
            case 'premium_buy_3months': return await handlePremiumPlanSelection(i, db);
            case 'premium_my_subscription': return await handleMyPremium(i, db);
            case 'premium_renew':
            case 'premium_renew_btn': return await handleRenewPremium(i, db);
            case 'premium_invoice':
            case 'premium_invoice_btn': return await handleMyPremium(i, db);
            case 'premium_cancel': {
                await i.reply({ content: '❌ تم إلغاء الطلب، سيتم إغلاق التكت.', ephemeral: true });
                await db.delete(`premium_temp_${i.user.id}`);
                if (i.channel?.name?.startsWith('premium-')) {
                    await closePremiumTicket(i.channel, i.user.id, db, 3000);
                }
                return;
            }
        }

        // Renewal notifications include the intended subscriber ID in the button ID.
        if (i.customId.startsWith('premium_renew_')) {
            const targetUserId = i.customId.slice('premium_renew_'.length);
            if (targetUserId !== i.user.id) {
                return i.reply({ content: '❌ زر التجديد هذا مخصص لصاحب الاشتراك.', ephemeral: true });
            }
            return await handleRenewPremium(i, db);
        }
    }

    if (i.isModalSubmit() && i.customId === 'premium_buy_modal') {
        return await handlePremiumBuyModal(i, db, client);
    }
}

// ============================================
// ===== MAKER SETUP FUNCTION =====
// ============================================

// These hooks are called by index.js. Keep them defined even when no DM/error
// notification channel is configured, so message events never throw TypeError.
async function handleDMMessage(message, client) {
    // No DM command workflow is currently implemented.
}

async function sendMakerError(client, title, error) {
    console.error(`[Maker] ${title}:`, error);
}

function setupMakerSystem(client, bots, db, config, fs) {
    if (client.user.id === MAKER_BOT_ID) {
        setInterval(() => {
            checkAllPremiumExpiries(client, db);
        }, 10 * 60 * 1000);
    }
}

module.exports = {
    MAKER_BOT_ID,
    MAKER_OWNER_ID,
    TARGET_GUILD_ID,
    makerCommandNames,
    makerCommands,
    handleMakerInteraction,
    handleDMMessage,
    sendMakerError,
    setupMakerSystem,
};
