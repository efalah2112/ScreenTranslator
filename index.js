 const express = require("express");
const app = express();
const port = 2022;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

const fs = require("fs");
const path = require("path");
const emojis = require("./handlers/modules/emojis");
const ED = require("./handlers/modules/embedDescriptions");
const chalk = require("chalk");

const { Events } = require("discord.js");
const {
  Client, GatewayIntentBits, Collection, REST, Routes,
  ApplicationCommandOptionType, EmbedBuilder, ChannelType,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits,
  AttachmentBuilder, StringSelectMenuBuilder, ActivityType, Partials,
  ContainerBuilder, MessageFlags, TextDisplayBuilder, SeparatorBuilder,
  SeparatorSpacingSize, ModalBuilder, TextInputBuilder, TextInputStyle,
  SelectMenuBuilder,
} = require("discord.js");

const { QuickDB, SqliteDriver } = require("quick.db");
const sqliteDriver = new SqliteDriver("./database.sqlite");
const db = QuickDB.createSingleton({ driver: sqliteDriver });

const config = require("./config.json");
const tokenVault = require("./handlers/modules/tokenVault");

// Decrypt the bot token vault at startup; legacy plaintext tokens are migrated
// automatically once TOKEN_ENCRYPTION_KEY is configured.
config.tokens = tokenVault.loadTokens(config);

// Production bot tokens belong in hosting environment secrets, not this public repository.
// BOT_TOKENS accepts a comma-separated list of bot tokens.
const environmentTokens = (process.env.BOT_TOKENS || '')
    .split(',')
    .map(token => token.trim())
    .filter(Boolean);
config.tokens = [...new Set([...(config.tokens || []), ...environmentTokens])];

// ========== MAKER SYSTEM ==========
const maker = require("./handlers/modules/maker");

// ========== TOKENS ==========
const makerToken = config.makerToken || process.env.BOT_TOKEN_MAKER || "";
const generalToken = config.generalToken || process.env.BOT_TOKEN_GENERAL || "";

// إضافة التوكنات الرئيسية إلى قائمة tokens إن لم تكن موجودة
if (makerToken && !config.tokens.includes(makerToken)) {
    config.tokens.push(makerToken);
}
if (generalToken && !config.tokens.includes(generalToken)) {
    config.tokens.push(generalToken);
}

const botTokens = config.tokens.filter((t) => t && t.trim() !== "");

const bots = botTokens.map((token, index) => {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildEmojisAndStickers, GatewayIntentBits.GuildIntegrations,
      GatewayIntentBits.GuildWebhooks, GatewayIntentBits.GuildInvites,
      GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildPresences,
      GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildMessageTyping, GatewayIntentBits.DirectMessages,
      GatewayIntentBits.DirectMessageReactions, GatewayIntentBits.DirectMessageTyping,
      GatewayIntentBits.MessageContent,
    ],
    partials: [
      Partials.Message, Partials.Channel, Partials.GuildMember,
      Partials.Reaction, Partials.GuildScheduledEvent, Partials.User,
      Partials.ThreadMember,
    ],
  });
  client.setMaxListeners(0);

  const types = require("./types.js");
  client.types = types;

  function choices() {
    const ch = [];
    for (const t of types) ch.push({ name: t.nametype, value: t.categoryId });
    return ch;
  }
  const chsd = choices();
  client.commands1 = new Collection();

  const botOwner = "959174041422397471";
  const allowedUserId = `${botOwner}`;
  const logJoinChannel = "1492886293800288527";
  const allowedBotId = "1386364859784101969";
  const prefix = "+";
  const TARGET_GUILD_ID = "1500197339329986690";

  // ========== كلمات التشفير ==========
  const replacements = {
    متجر: "مــ.ـتـجر",
    متجري: "مــ.ــتجري",
    متجرها: "مــ.ـتـجرها",
    متجره: "مــ.ـتـجره",
    متجرك: "مــ.ــتجرك",
    متجركم: "مــ.ــتجركم",
    متجرهم: "مــ.ـتجرهم",
    متجرنا: "مــ.ـنتجرنا",
    عرض: "عــ.ـرض",
    عرضي: "عـ.ــرضي",
    عرضك: "عــ.ــرضك",
    عرضكم: "عــ.ــرضكم",
    عرضهم: "عــ.ــرضهم",
    عرضنا: "عــ.ــرض",
    عروض: "عــ.ــروض",
    عروضي: "عــ.ــروضي",
    عروضك: "عــ.ــروضك",
    عروضكم: "عــ.ــروضكم",
    عروضهم: "عــ.ــروضهم",
    عروضنا: "عــ.ــروضنا",
    حساب: "حــ.ــساب",
    حسابي: "حــ.ــسابي",
    حسابك: "حــ.ــسابك",
    حسابكم: "حــ.ــسابكم",
    حسابهم: "حــ.ــسابهم",
    حسابنا: "حــ.ــسابنا",
    حسابات: "حــ.ــسابات",
    حساباتي: "حــ.ــساباتي",
    حساباتك: "حــ.ــساباتك",
    حساباتكم: "حــ.ــساباتكم",
    حساباتهم: "حــ.ــساباتهم",
    حساباتنا: ")�ـ �.ــساباتنا",
    متوفر: "مــ.ــتوفر",
    متوفري: "مــ.ــتوفري",
    متوفرها: "مــ.ــتوفرها",
    متوفره: "مــ.ــتوفره",
    متوفرك: "مــ.ــتوفرك",
    متوفركم: "مــ.ــتوفركم",
    متوفرهم: "مــ.ــتوفرهم",
    متوفرنا: "مــ.ــتوفرنا",
    شوب: "شــ.ــوب",
    شوبك: "شــ.ــوبك",
    شوبكم: "شــ.ــوبكم",
    شوبهم: "شــ.ــوبهم",
    شوبنا: "شــ.ــوبنا",
    اوفر: "أــ.ــوفر",
    اوفرها: "أــ.ــوفرها",
    اوفره: "أــ.ــوفره",
    اوفرك: "أــ.ــفرك",
    اوفركم: "أــ.ــفركم",
    اوفرهم: "أــ.ــوفرهم",
    اوفرنا: "أــ.ــوفرنا",
    بيع: "بــ.ــيع",
    بيعي: "بــ.ــيعي",
    بيعك: "بــ.ــيعك",
    بيعكم: "بــ.ــيعكم",
    بيعهم: "بــ.ــيعهم",
    بيعنا: "بــ.ــيعنا",
    للبيع: "للــ.ــبيع",
    للبيعي: "للــ.ــبيعي",
    للبيعك: "للــ.ــبيعك",
    للبيعكم: "للــ.ــبيعكم",
    للبيعهم: "للــ.ــبيعهم",
    للبيعنا: "للــ.ــبيعنا",
    ابيع: "أبــ.ــيع",
    ابيعك: "أبــ.ــيعك",
    ابيعكم: "أبــ.ــيعكم",
    ابيعهم: "أبــ.ــيعهم",
    ابيعنا: "أبــ.ــيعنا",
    بوست: "بــ.ــوست",
    بوستك: "بــ.ــوستك",
    بوستكم: "بــ.ــوستكم",
    بوستهم: "بــ.ــوستهم",
    بوستنا: "بــ.ــوستنا",
    نيترو: "نيــ.ــترو",
    نيتروك: "نيــ.ــتروك",
    نيتروكم: "نيــ.ــتروكم",
    نيتروهم: "نيــ.ــتروهم",
    نيترونا: "نيــ.ــترونا",
    روبكس: "روبكــ.ــس",
    روبكسك: "روبكســ.ــك",
    روبكسكم: "روبكســ.ــكم",
    روبكسهم: "روبكســ.ــهم",
    روبكسنا: "روبكســ.ــنا",
    سعر: "ســ.ــعر",
    سعري: "ســ.ــعري",
    سعرها: "ســ.ــعرها",
    سعره: "ســ.ــعره",
    سعرك: "ســ.ــعرك",
    سعركم: "ســ.ــعركم",
    سعرهم: "ســ.ــعرهم",
    سعرنا: "ســ.ــعرنا",
    خاص: "خــ.ـاص",
    خاصك: "خــ.ـاصك",
    خاصكم: "خاصــ.ـكم",
    خاصهم: "خاصــ.ـهم",
    خاصنا: "خاصـ.ـنا",
    مطلوب: "مــ.ــطلوب",
    مطلوبة: "مــ.ــطلوبة",
    مطلوبك: "مــ.ــطلوبك",
    مطلوبكم: "مــ.ــطلوبكم",
    مطلوبهم: "مــ.ــطلوبهم",
    مطلوبنا: "مــ.ــطلوبنا",
    اطلب: "أطــ.ــلب",
    اطلبك: "أطــ.ــلبك",
    اطلبكم: "أطــ.ــلبكم",
    اطلبهم: "أطــ.ــلبهم",
    اطلبنا: "أطــ.ــلبنا",
    مقابل: "مــ.ــقابل",
    مقابلي: "مــ.ــقابلي",
    مقابلك: "مــ.ــقابلك",
    مقابلكم: "مــ.ــقابلكم",
    مقابلهم: "مــ.ــقابلهم",
    مقابلنا: "مــ.ــقابلنا",
    مقابله: "مــ.ــقابله",
    مقابلها: "مــ.ــقابلها",
    سيرفر: "ســ.ــيرفر",
    سيرفري: "ســ.ــيرفري",
    سيرفرك: "ســ.ــيرفرك",
    سيرفركم: "ســ.ــيرفركم",
    سيرفرهم: "ســ.ــيرفرهم",
    سيرفرنا: "ســ.ــيرفرنا",
    سيرفره: "ســ.ــيرفره",
    كردت: "كــ.ــردت",
    كريدت: "كريــ.ــدت",
    اسعار: "اس3ـار",
    سيرفرها: "ســ.ــيرفرها",
    كريديت: "كـريـ.ـدت",
    تبادل: " تبـ.ـادل",
    شراء: "شــ.ــراء",
    شرائي: "شــ.ــرائي",
    شرائك: "شــ.ــرائك",
    شرائكم: "شــ.ــرائكم",
    شرائهم: "شــ.ــرائهم",
    شرائنا: "شــ.ــرائنا",
    هاك: "هــ.ــاك",
    هاكر: "هــ.ــاكر",
    هاكات: "هــ.ــاكات",
    فيزا: "فيــ.ــزا",
    فيزه: "فيــ.ــزه",
    فيزات: "فيــ.ــزات",
    تاجر: "تــ.ــاجر",
    تاجرك: "تــ.ــاجرك",
    تاجركم: "تــ.ــاجركم",
    تاجرهم: "تــ.ــاجرهم",
    تاجرنا: "تــ.ــاجرنا",
    تجار: "تــ.ــجار",
    نيتروهات: "نيــ.ــتروهات",
  };

  function applyReplacement(text) {
    if (!text) return text;
    let modified = text;
    for (const [key, value] of Object.entries(replacements)) {
      modified = modified.split(key).join(value);
    }
    return modified;
  }

  // ========== READY - COMMAND REGISTRATION ==========
 client.on("clientReady", async () => {
    console.log(chalk.bold.underline.blue(`✅ Bot ${index + 1} logged in as ${client.user.tag}`));

    // ===== إعداد REST مع إعادة المحاولة =====
    const rest = new REST({ 
        version: 10,
        timeout: 60000,
        retries: 5
    }).setToken(token);

    // ===== أوامر المتاجر (للبوتات العادية فقط) =====
   const globalCommands = [
        {
            name: "exchange-setup",
            description: "إعدادات نظام التبادل (للأدمنستريتور فقط)",
            dm_permission: false,
            default_member_permissions: 8,
        },
        {
            name: "report",
            description: "لـــ ارســال بلاغ لـ صاحب البــوت",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "details",
                    description: `تفــاصيل البلاغ`,
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
            ],
        },
        {
            name: "tax",
            description: "لـمـعـرفـه الـضـريـبـه لـعـدد مـا",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "number",
                    description: "الـعـدد",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
            ],
        },
        {
            name: "add-tax-channel",
            description: " اضـافـة روم لـ رومـات الضـرائـب ",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: `channel`,
                    description: ` الـروم `,
                    type: ApplicationCommandOptionType.Channel,
                    required: true,
                    channel_types: [ChannelType.GuildText],
                },
            ],
        },
        {
            name: "reset-mentions",
            description: "ترسيت جميع المنشنات",
            dm_permission: false,
            default_member_permissions: 1,
        },
        {
            name: "setup-images",
            description: "تعديل انفوهات وصور السيرفر",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                // --- شراء الخدمات ---
                {
                    name: "buy-shop-image",
                    description: "صورة شراء متجر (رابط)",
                    type: 3,
                    required: false,
                },
                {
                    name: "buy-shop-image-attachment",
                    description: "صورة شراء متجر (مرفق)",
                    type: 11,
                    required: false,
                },
                {
                    name: "buy-order-image",
                    description: "صورة شراء طلب (رابط)",
                    type: 3,
                    required: false,
                },
                {
                    name: "buy-order-image-attachment",
                    description: "صورة شراء طلب (مرفق)",
                    type: 11,
                    required: false,
                },
                {
                    name: "buy-auction-image",
                    description: "صورة شراء مزاد (رابط)",
                    type: 3,
                    required: false,
                },
                {
                    name: "buy-auction-image-attachment",
                    description: "صورة شراء مزاد (مرفق)",
                    type: 11,
                    required: false,
                },
                {
                    name: "buy-roles-image",
                    description: "صورة شراء رتبة (رابط)",
                    type: 3,
                    required: false,
                },
                {
                    name: "buy-roles-image-attachment",
                    description: "صورة شراء رتبة (مرفق)",
                    type: 11,
                    required: false,
                },
                // --- قوانين السيرفر فقط ---
                {
                    name: "rules-server",
                    description: "قوانين السيرفر العامة (رابط)",
                    type: 3,
                    required: false,
                },
                {
                    name: "rules-server-attachment",
                    description: "قوانين السيرفر العامة (مرفق)",
                    type: 11,
                    required: false,
                },
                // --- الأسعار ---
                {
                    name: "price-roles",
                    description: "أسعار الرتب (رابط)",
                    type: 3,
                    required: false,
                },
                {
                    name: "price-roles-attachment",
                    description: "أسعار الرتب (مرفق)",
                    type: 11,
                    required: false,
                },
                {
                    name: "price-shop",
                    description: "أسعار المتاجر (رابط)",
                    type: 3,
                    required: false,
                },
                {
                    name: "price-shop-attachment",
                    description: "أسعار المتاجر (مرفق)",
                    type: 11,
                    required: false,
                },
                {
                    name: "price-orders",
                    description: "أسعار الطلبات (رابط)",
                    type: 3,
                    required: false,
                },
                {
                    name: "price-orders-attachment",
                    description: "أسعار الطلبات (مرفق)",
                    type: 11,
                    required: false,
                },
                {
                    name: "price-auction",
                    description: "أسعار المزاد (رابط)",
                    type: 3,
                    required: false,
                },
                {
                    name: "price-auction-attachment",
                    description: "أسعار المزاد (مرفق)",
                    type: 11,
                    required: false,
                },
                // --- الخط العام ---
                {
                    name: "line",
                    description: "صورة خط السيرفر (رابط)",
                    type: 3,
                    required: false,
                },
                {
                    name: "line-attachment",
                    description: "صورة خط السيرفر (مرفق)",
                    type: 11,
                    required: false,
                },
            ],
        },
        {
            name: "setup",
            description: "اعداد البوت بسيرفرك",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "line",
                    description: "خط السيرفر",
                    type: ApplicationCommandOptionType.Attachment,
                    required: false,
                },
                {
                    name: "logs",
                    description: "روم لوق المتاجر",
                    type: ApplicationCommandOptionType.Channel,
                    required: false,
                    channel_types: [ChannelType.GuildText],
                },
                {
                    name: "order-room",
                    description: "روم الطلبات",
                    type: ApplicationCommandOptionType.Channel,
                    required: false,
                    channel_types: [ChannelType.GuildText],
                },
                {
                    name: "action-room",
                    description: "روم المزادات",
                    type: ApplicationCommandOptionType.Channel,
                    required: false,
                    channel_types: [ChannelType.GuildText],
                },
                {
                    name: "buy-shop-tickets",
                    description: "كتاغوري شراء متجر",
                    type: ApplicationCommandOptionType.Channel,
                    required: false,
                    channel_types: [ChannelType.GuildCategory],
                },
                {
                    name: "buy-auction-tickets",
                    description: "كتاغوري شراء مزاد",
                    type: ApplicationCommandOptionType.Channel,
                    required: false,
                    channel_types: [ChannelType.GuildCategory],
                },
                {
                    name: "buy-order-tickets",
                    description: "كتاغوري شراء طلبات",
                    type: ApplicationCommandOptionType.Channel,
                    required: false,
                    channel_types: [ChannelType.GuildCategory],
                },
                {
                    name: "high-staff",
                    description: "رتبة العليا",
                    type: ApplicationCommandOptionType.Role,
                    required: false,
                },
                {
                    name: "shop-admin",
                    description: "مسؤول المتاجر",
                    type: ApplicationCommandOptionType.Role,
                    required: false,
                },
                {
                    name: "order-admin",
                    description: "مسؤول طلبات",
                    type: ApplicationCommandOptionType.Role,
                    required: false,
                },
                {
                    name: "auction-admin",
                    description: "مسؤول المزاد",
                    type: ApplicationCommandOptionType.Role,
                    required: false,
                },
                {
                    name: "auction-mzad-role",
                    description: "رول منشن المزاد (يُذكر في النوع الثالث)",
                    type: ApplicationCommandOptionType.Role,
                    required: false,
                },
                {
                    name: "order-mention-role",
                    description: "رول منشن الطلبات (يُذكر في زر منشن طلبات)",
                    type: ApplicationCommandOptionType.Role,
                    required: false,
                },
                {
                    name: "embed-color",
                    description: "لون الامبدات بالهيكس مثال: 0x00AE86 او #00AE86",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
                {
                    name: "bank",
                    description: "المستخدم الذي ستحدده كبنك السيرفر",
                    type: ApplicationCommandOptionType.User,
                    required: false,
                },
                {
                    name: "buy-roles-tickets",
                    description: "كتاغوري تكتات شراء رتب",
                    type: ApplicationCommandOptionType.Channel,
                    required: false,
                    channel_types: [ChannelType.GuildCategory],
                },
                {
                    name: "roles-admin",
                    description: "مسؤول شراء الرتب",
                    type: ApplicationCommandOptionType.Role,
                    required: false,
                },
                {
                    name: "support-category",
                    description: "كتاغوري تكتات الدعم الفني والتشهير",
                    type: ApplicationCommandOptionType.Channel,
                    required: false,
                    channel_types: [ChannelType.GuildCategory],
                },
                {
                    name: "support-admin",
                    description: "رتبة مسؤول الدعم الفني",
                    type: ApplicationCommandOptionType.Role,
                    required: false,
                },
                {
                    name: "scam-admin",
                    description: "رتبة مسؤول التشهير (تُستخدم لو تركتها فارغة تأخذ مسؤول الدعم)",
                    type: ApplicationCommandOptionType.Role,
                    required: false,
                },
                {
                    name: "scam-room",
                    description: "روم نشر تقارير التشهير تلقائياً بعد إقرار الإدارة",
                    type: ApplicationCommandOptionType.Channel,
                    required: false,
                    channel_types: [ChannelType.GuildText],
                },
                {
                    name: "commands-room",
                    description: "روم الأوامر — يُرسل فيه طلب دفع بيع المتجر",
                    type: ApplicationCommandOptionType.Channel,
                    required: false,
                    channel_types: [ChannelType.GuildText],
                },
                {
                    name: "rating-channel",
                    description: "روم استلام تقييمات الخدمة من التكتات (دعم، مزاد، طلبات، رتب)",
                    type: ApplicationCommandOptionType.Channel,
                    required: false,
                    channel_types: [ChannelType.GuildText],
                },
            ],
        },
        {
            name: "setup-prices",
            description: "تعديل الأسعار في السيرفر",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "everyone-price",
                    description: "سعر منشن ايفري للمتاجر",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "here-price",
                    description: "سعر منشن هير للمتاجر",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "shop-mention-price",
                    description: "سعر منشن متجر",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "order-every-price-credit",
                    description: "سعر منشن ايفري با الكردت للطلبات",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "order-here-price-credit",
                    description: "سعر منشن هير با الكردت",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "order-order-price-credit",
                    description: "سعر منشن الطلبات (رول) بالكردت",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "auction-every-price-credit",
                    description: "سعر منشن ايفري للمزاد باالكردت",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "auction-here-price-credit",
                    description: "سعر منشن هير با الكردت للمزادات",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "auction-mzad-price-credit",
                    description: "سعر منشن مزاد (رول) باالكردت",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "change-partners-credit",
                    description: "سعر اضافة شريك او حذف",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "change-name",
                    description: "سعر تغيير اسم المتجر",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "change-owner",
                    description: "سعر تغيير صاحب المتجر",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "remove-warn-credit",
                    description: "سعر ازالة تحذير",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "auto-message",
                    description: "سعر نشر تلقائي للمتاجر",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "change-shape",
                    description: "سعر تغيير شكل المتجر",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "change-type-price",
                    description: "سعر تغيير نوع المتجر",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "shop-vacation",
                    description: "سعر طلب إجازة للمتجر",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "disable-auto-price",
                    description: "سعر تعطيل الإرسال التلقائي لجميع المتاجر",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "activate-shop-price",
                    description: "سعر تفعيل المتجر",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "sell-shop-price",
                    description: "سعر بيع المتجر",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
            ],
        },
        {
            name: "اختصارت",
            description: "اعداد الاختصارات",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "اختصار-المنشنات",
                    description: "اختصار المنشنات وش تبي العضو يكتب عشان يظهر له المنشنات",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
                {
                    name: "اختصار-تحذير",
                    description: "اختصار التحذيرات وش تبي المسؤول يكتب عشان يحذر المتجر",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
                {
                    name: "اختصار-حذف",
                    description: "وش تبي المسؤول يكتب عشان يحذف المتجر",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
                {
                    name: "اختصار-ضريبه",
                    description: "وش تبي العضو يكتب عشان يظهر الضريبه",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
                {
                    name: "اختصار-نداء",
                    description: "وش تبي المسؤول يكتب عشان ينادي العضو",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
                {
                    name: "اختصار-امر-بنق",
                    description: "وش تبي العضو يكتب عشان يظهر بنق البوت",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
                {
                    name: "اختصار-تحديد-صاحب-المتجر",
                    description: "اختصار الأمر لتحديد صاحب المتجر",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
                {
                    name: "اختصار-تحديد-المنشنات",
                    description: "اختصار الأمر لتحديد المنشنات الخاصة بالمتجر",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
                {
                    name: "اختصار-اضافة-منشنات",
                    description: "اختصار الأمر لإضافة منشنات جديدة",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
                {
                    name: "اختصار-اضافة-متجر",
                    description: "اختصار امر يضيف المتجر لبينات البوت",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
                {
                    name: "اختصار-انشاء-متجر",
                    description: "اختصار امر يسوي المتجر",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
            ],
        },
        {
            name: `price-panel`,
            description: `ارسال بانل الاسعار`,
            dm_permissions: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "embed-text",
                    description: "الكلام الي بيكون محطوط با ايمبد الاسعار",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
            ],
        },
        {
            name: `buy-panel`,
            description: `ارسال قسم الشراء`,
            dm_permissions: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "embed-text",
                    description: "الكلام الي بيكون محطوط با ايمبد التكتات",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
            ],
        },
        {
            name: `order-panel`,
            description: `ارسال قسم شراء طلبات`,
            dm_permissions: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "embed-text",
                    description: "الكلام الي بيكون محطوط با ايمبد التكتات",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
            ],
        },
        {
            name: `shop-panel`,
            description: `ارسال قسم شراء متاجر`,
            dm_permissions: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "embed-text",
                    description: "الكلام الي بيكون محطوط با ايمبد التكتات",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
            ],
        },
        {
            name: `auction-panel`,
            description: `ارسال قسم شراء مزاد`,
            dm_permissions: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "embed-text",
                    description: "الكلام الي بيكون محطوط با ايمبد التكتات",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
            ],
        },
        {
            name: "r-mzad",
            description: "تعيين قوانين المزاد التي تُرسل تلقائياً عند النشر",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "rules",
                    description: "نص قوانين المزاد",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
            ],
        },
        {
            name: "add-mzad-room",
            description: "إضافة روم مزاد للقائمة",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "room",
                    description: "روم المزاد",
                    type: ApplicationCommandOptionType.Channel,
                    required: true,
                    channel_types: [ChannelType.GuildText],
                },
            ],
        },
        {
            name: "remove-mzad-room",
            description: "حذف روم مزاد من القائمة",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "room",
                    description: "روم المزاد",
                    type: ApplicationCommandOptionType.Channel,
                    required: true,
                    channel_types: [ChannelType.GuildText],
                },
            ],
        },
        {
            name: "start-mzad",
            description: "إطلاق مزاد مباشرة بدون تكت (للمسؤولين فقط)",
            dm_permission: false,
            default_member_permissions: 8,
            options: [
                {
                    name: "room",
                    description: "روم المزاد",
                    type: ApplicationCommandOptionType.Channel,
                    required: true,
                    channel_types: [ChannelType.GuildText],
                },
                {
                    name: "item",
                    description: "اسم السلعة",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
                {
                    name: "start-price",
                    description: "السعر المبدئي",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
                {
                    name: "duration",
                    description: "مدة المزاد بالدقائق",
                    type: ApplicationCommandOptionType.Integer,
                    required: true,
                    min_value: 1,
                    max_value: 360,
                },
                {
                    name: "mention-type",
                    description: "نوع المنشن",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                    choices: [
                        { name: "@everyone", value: "everyone" },
                        { name: "@here", value: "here" },
                        { name: "رول المزاد", value: "mzad" },
                    ],
                },
                {
                    name: "tax",
                    description: "هل السلعة بضريبة؟",
                    type: ApplicationCommandOptionType.Boolean,
                    required: true,
                },
                {
                    name: "owner",
                    description: "صاحب المزاد (افتراضي: أنت)",
                    type: ApplicationCommandOptionType.User,
                    required: false,
                },
                {
                    name: "image-url",
                    description: "رابط صورة السلعة (اختياري)",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
            ],
        },
        {
            name: "mzad-stats",
            description: "إحصائيات المزادات في هذا السيرفر",
            dm_permission: false,
            default_member_permissions: 8,
        },
        {
            name: "mzad-list",
            description: "عرض قائمة المزادات النشطة في السيرفر",
            dm_permission: false,
        },
        {
            name: "add-mzad2-type",
            description: "إضافة نوع مزاد خاص (الاسم، الساعات، السعر، إيفري، هير، تنويه)",
            dm_permission: false,
            default_member_permissions: 8,
            options: [
                {
                    name: "name",
                    description: "اسم النوع",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
                {
                    name: "hours",
                    description: "مدة المزاد بالساعات",
                    type: ApplicationCommandOptionType.Integer,
                    required: true,
                    min_value: 1,
                    max_value: 168,
                },
                {
                    name: "price",
                    description: "سعر تكت هذا النوع",
                    type: ApplicationCommandOptionType.Integer,
                    required: true,
                    min_value: 1,
                },
                {
                    name: "every",
                    description: "عدد منشن @everyone المسموح",
                    type: ApplicationCommandOptionType.Integer,
                    required: true,
                    min_value: 0,
                    max_value: 50,
                },
                {
                    name: "here",
                    description: "عدد منشن @here المسموح",
                    type: ApplicationCommandOptionType.Integer,
                    required: true,
                    min_value: 0,
                    max_value: 50,
                },
                {
                    name: "notice",
                    description: "نص التنويه الذي يرسل عند الإنعاش",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
            ],
        },
        {
            name: "set-mzad2-cat",
            description: "تحديد كتاغوري التكتات وكتاغوري رومات المزاد الخاص",
            dm_permission: false,
            default_member_permissions: 8,
            options: [
                {
                    name: "ticket-category",
                    description: "كتاغوري تكتات المزاد الخاص",
                    type: ApplicationCommandOptionType.Channel,
                    required: false,
                    channel_types: [ChannelType.GuildCategory],
                },
                {
                    name: "room-category",
                    description: "كتاغوري إنشاء رومات المزاد الخاص",
                    type: ApplicationCommandOptionType.Channel,
                    required: false,
                    channel_types: [ChannelType.GuildCategory],
                },
            ],
        },
        {
            name: "mzad2-panel",
            description: "إرسال بانل شراء تكت مزاد خاص",
            dm_permission: false,
            default_member_permissions: 8,
            options: [
                {
                    name: "embed-text",
                    description: "نص الايمبد (اختياري)",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
            ],
        },
        {
            name: "remove-mzad2-type",
            description: "حذف نوع مزاد ثاني",
            dm_permission: false,
            default_member_permissions: 8,
            options: [
                {
                    name: "name",
                    description: "اسم النوع",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                    autocomplete: true,
                },
            ],
        },
        {
            name: "remove-tax-channel",
            description: " ازـالـة روم لـ رومـات الضـرائـب ",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: `channel`,
                    description: ` الـروم `,
                    type: ApplicationCommandOptionType.Channel,
                    required: true,
                    channel_types: [ChannelType.GuildText],
                },
            ],
        },
        {
            name: "show-tax-channels",
            description: " لـ اظهار رومات الضرائب المسجلة ",
            dm_permission: false,
            default_member_permissions: 1,
        },
        {
            name: "add-emoji-channel",
            description: " اضـافـة روم لـ رومـات ايموجي ",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: `channel`,
                    description: ` الـروم `,
                    type: ApplicationCommandOptionType.Channel,
                    required: true,
                    channel_types: [ChannelType.GuildText],
                },
            ],
        },
        {
            name: "remove-emoji-channel",
            description: " ازـالـة روم لـ رومـات ايموجي ",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: `channel`,
                    description: ` الـروم `,
                    type: ApplicationCommandOptionType.Channel,
                    required: true,
                    channel_types: [ChannelType.GuildText],
                },
            ],
        },
        {
            name: "show-emoji-channels",
            description: "اظهار رومات الايموجي",
            dm_permission: false,
            default_member_permissions: 1,
        },
        {
            name: "add-sticker-channel",
            description: " اضـافـة روم لـ رومـات ستيكر ",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: `channel`,
                    description: ` الـروم `,
                    type: ApplicationCommandOptionType.Channel,
                    required: true,
                    channel_types: [ChannelType.GuildText],
                },
            ],
        },
        {
            name: "remove-sticker-channel",
            description: " حذف روم ستيكر ",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: `channel`,
                    description: ` الـروم `,
                    type: ApplicationCommandOptionType.Channel,
                    required: true,
                    channel_types: [ChannelType.GuildText],
                },
            ],
        },
        {
            name: "show-sticker-channels",
            description: " اظهار رومات الاستيكر ",
            dm_permission: false,
            default_member_permissions: 1,
        },
        {
            name: "add-autoreply",
            description: "اضافة رد تلقائي",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "keyword",
                    description: "الكلمة",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
                {
                    name: "reply",
                    description: "الرد",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
                {
                    name: "role",
                    description: "حدد الرتبة المسموح بها للرد (اختياري)",
                    type: ApplicationCommandOptionType.Role,
                    required: false,
                },
                {
                    name: "channel",
                    description: "حدد الروم المسموح بها للرد (اختياري)",
                    type: ApplicationCommandOptionType.Channel,
                    required: false,
                },
                {
                    name: "embed",
                    description: "هل تريد الرد كإيمبد؟",
                    type: ApplicationCommandOptionType.Boolean,
                    required: false,
                },
                {
                    name: "title",
                    description: "عنوان الإيمبد (اختياري)",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
                {
                    name: "image",
                    description: "رابط الصورة للإيمبد (اختياري)",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
                {
                    name: "color",
                    description: "لون الايمبد",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                    choices: [
                        { name: "اخضر فاتح", value: "#90EE90" },
                        { name: "اخضر غامق", value: "#006400" },
                        { name: "احمر فاتح", value: "#FF6347" },
                        { name: "احمر غامق", value: "#8B0000" },
                        { name: "ازرق", value: "#0056D7" },
                        { name: "ازرق فاتح", value: "#ADD8E6" },
                        { name: "ازرق سماوي", value: "#00BFFF" },
                        { name: "اصفر", value: "#FFFF00" },
                        { name: "اصفر ذهبي", value: "#FFD700" },
                        { name: "برتقالي فاتح", value: "#FFA07A" },
                        { name: "برتقاني غامق", value: "#FF8C00" },
                        { name: "وردي", value: "#FFC0CB" },
                        { name: "وردي داكن", value: "#FF1493" },
                        { name: "بنفسجي", value: "#800080" },
                        { name: "بنفسجي فاتح", value: "#DDA0DD" },
                        { name: "بني", value: "#A52A2A" },
                        { name: "رمادي فاتح", value: "#D3D3D3" },
                        { name: "رمادي غامق", value: "#696969" },
                        { name: "فيروزي", value: "#40E0D0" },
                        { name: "نيلي", value: "#4B0082" },
                        { name: "ابيض", value: "#FFFFFF" },
                        { name: "اسود", value: "#000000" },
                        { name: "ذهبي", value: "#FFD700" },
                        { name: "ليموني", value: "#32CD32" },
                        { name: "مرجاني", value: "#FF7F50" },
                    ],
                },
            ],
        },
        {
            name: "remove-autoreply",
            description: "حذف رد تلقائي",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "keyword",
                    description: "الكلمه المراد حذفها",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
            ],
        },
        {
            name: "list-autoreplies",
            description: "اظهار الردود التلقائيه",
            dm_permission: false,
            default_member_permissions: 1,
        },
        {
            name: "say-emabed",
            description: "ارسال رساله با ايمبد",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: `msg`,
                    description: "الرساله",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
                {
                    name: `room`,
                    description: `روم الرساله.`,
                    type: ApplicationCommandOptionType.Channel,
                    required: false,
                    channel_types: [ChannelType.GuildText],
                },
                {
                    name: `image`,
                    description: `صورة الأميبد`,
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
                {
                    name: `title`,
                    description: "العنوان",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
            ],
        },
        {
            name: "come",
            description: " اسـتـدعـاء عـضـو ",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: `user`,
                    description: `الشخص المرجو استدعائه `,
                    type: ApplicationCommandOptionType.User,
                    required: true,
                },
                {
                    name: `reason`,
                    description: ` سبب استدعاء الشخص `,
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
            ],
        },
        {
            name: "say-all-shops",
            description: "ارســال رســـالة لـ كل المــتاجــر",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: `message`,
                    description: ` الكلمه `,
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
            ],
        },
        {
            name: "change-shop-type",
            description: "تغيير نوع متجر مسجل إلى نوع آخر مع تحديث الرتبة والبيانات.",
            dm_permission: false,
            default_member_permissions: "8",
            options: [
                {
                    name: "shop",
                    description: "اختر روم المتجر المراد تغيير نوعه.",
                    type: 7,
                    required: true
                },
                {
                    name: "new_category",
                    description: "اختر النوع الجديد (الكاتاجوري المسجل مسبقا).",
                    type: 3,
                    required: true,
                    autocomplete: true
                }
            ]
        },
        {
            name: "change-shop-emoji",
            description: "تغيير إيموجي المتجر مع الحفاظ على مكانه.",
            dm_permission: false,
            default_member_permissions: "8",
            options: [
                {
                    name: "shop",
                    description: "اختر روم المتجر",
                    type: 7,
                    required: true
                },
                {
                    name: "emoji",
                    description: "الإيموجي الجديد",
                    type: 3,
                    required: true
                }
            ]
        },
        {
            name: "change-shop-name",
            description: "تغيير اسم المتجر الأساسي فقط (بدون الزخرفة والإيموجي).",
            dm_permission: false,
            options: [
                {
                    name: "shop",
                    description: "اختر روم المتجر",
                    type: 7,
                    required: true
                },
                {
                    name: "new_name",
                    description: "الاسم الجديد للمتجر",
                    type: 3,
                    required: true
                }
            ]
        },
        {
            name: "shop",
            description: "لانشاء متجر في كاتيجوري محدد من الانواع المسجلة.",
            dm_permission: false,
            default_member_permissions: "8",
            options: [
                {
                    name: "category",
                    description: "اختر نوع المتجر (الكاتيجوري) المسجل مسبقا.",
                    type: 3,
                    required: true,
                    autocomplete: true
                },
                {
                    name: "name",
                    description: "اسم المتجر الجديد.",
                    type: 3,
                    max_length: 35,
                    required: true
                },
                {
                    name: "seller",
                    description: "التاجر المسؤول عن هذا المتجر.",
                    type: 6,
                    required: true
                }
            ]
        },
        {
            name: "add-shop-data",
            description: "اضافة متجر موجود مسبقا الى الداتا بيز مع امكانية نقله وتعديل اسمه.",
            dm_permission: false,
            default_member_permissions: "8",
            options: [
                {
                    name: "shop",
                    description: "اختر روم المتجر المراد اضافته وتنظيمه.",
                    type: 7,
                    required: true
                },
                {
                    name: "category",
                    description: "اختر نوع المتجر (الكاتاجوري المسجل مسبقا).",
                    type: 3,
                    required: true,
                    autocomplete: true
                },
                {
                    name: "seller",
                    description: "صاحب المتجر (التاجر المسؤول).",
                    type: 6,
                    required: true
                }
            ]
        },
        {
            name: "remove-shop-data",
            description: "حذف المتجر من الداتا",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "shop",
                    description: "الـمـتـجـر",
                    type: ApplicationCommandOptionType.Channel,
                    required: true,
                    channel_types: [ChannelType.GuildText],
                },
            ],
        },
        {
            name: "shop-data",
            description: "اظهار معلومات المتجر",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "shop",
                    description: "الـمـتـجـر",
                    type: ApplicationCommandOptionType.Channel,
                    required: true,
                    channel_types: [ChannelType.GuildText],
                },
            ],
        },
        {
            name: "order",
            description: "لـ طلب بروم انت تحدده",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: `الشخص`,
                    description: "صاحب الطلب",
                    type: ApplicationCommandOptionType.User,
                    required: true,
                },
                {
                    name: `الطلب`,
                    description: "السلعة المطلوبة",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
                {
                    name: `المنشن`,
                    description: "نوع منشن الطلب",
                    type: ApplicationCommandOptionType.Integer,
                    required: true,
                    choices: [
                        { name: "Everyone", value: 0 },
                        { name: "Here", value: 1 },
                    ],
                },
            ],
        },
        {
            name: "check-types",
            description: "فحص جميع الأنواع وحذف الأنواع ذات الكاتيجوري المحذوف",
            dm_permission: false,
            default_member_permissions: 1,
            options: [],
        },
        {
            name: "edit-type",
            description: "تعديل نوع متجر موجود بدون إعادة كتابته من الصفر",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "category",
                    description: "الكاتيجوري الخاص بالنوع الذي تريد تعديله",
                    type: ApplicationCommandOptionType.Channel,
                    channel_types: [ChannelType.GuildCategory],
                    required: true,
                },
                {
                    name: "name",
                    description: "الاسم الجديد (اختياري)",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
                {
                    name: "everyone_mention_count",
                    description: "عدد منشنات everyone (اختياري)",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "here_mention_count",
                    description: "عدد منشنات here (اختياري)",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "shop_mention_count",
                    description: "عدد منشنات رتبة المتجر (اختياري)",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "shop_mention",
                    description: "رتبة منشن المتجر الجديدة (اختياري)",
                    type: ApplicationCommandOptionType.Role,
                    required: false,
                },
                {
                    name: "shop_role",
                    description: "رتبة صاحب المتجر (اختياري)",
                    type: ApplicationCommandOptionType.Role,
                    required: false,
                },
                {
                    name: "pirefix",
                    description: "الزخرفة الجديدة (اختياري)",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
                {
                    name: "maxwarns",
                    description: "أقصى عدد تحذيرات (اختياري)",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "shop_price",
                    description: "السعر الجديد (اختياري)",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "has_tax",
                    description: "هل يوجد ضريبة؟ (اختياري)",
                    type: ApplicationCommandOptionType.Boolean,
                    required: false,
                },
                {
                    name: "tax_price",
                    description: "سعر الضريبة (اختياري)",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "shop-emoji",
                    description: "الإيموجي الافتراضي للنوع مثال: 🛒 (اختياري)",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
            ],
        },
        {
            name: "remove-type",
            description: "حذف نوع كتاغوري متاجر",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "category",
                    description: "الكاتيجوري الذي تريد حذفه من الداتا",
                    type: ApplicationCommandOptionType.Channel,
                    channel_types: [ChannelType.GuildCategory],
                    required: true,
                },
            ],
        },
        {
            name: "remove-all-types",
            description: "حذف جميع انواع المتاجر",
            dm_permission: false,
            default_member_permissions: 1,
        },
        {
            name: "reset",
            description: "حذف جميع البينات المتعلقه با السيرفر",
            dm_permission: false,
            default_member_permissions: 1,
        },
        {
            name: "add-type",
            description: "تحديد نوع كتاغوري متاجر",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "name",
                    description: "اسم هاذا النوع",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
                {
                    name: "category",
                    description: "الكاتيجوري الذي تريد تحديد منشناته",
                    type: ApplicationCommandOptionType.Channel,
                    channel_types: [ChannelType.GuildCategory],
                    required: true,
                },
                {
                    name: "everyone_mention_count",
                    description: "عدد منشنات ايفري ون المسموح بها.",
                    type: ApplicationCommandOptionType.Integer,
                    required: true,
                },
                {
                    name: "here_mention_count",
                    description: "عدد منشنات هير المسموح بها.",
                    type: ApplicationCommandOptionType.Integer,
                    required: true,
                },
                {
                    name: "shop_mention_count",
                    description: "عدد منشنات رتبة المسموح بها.",
                    type: ApplicationCommandOptionType.Integer,
                    required: true,
                },
                {
                    name: "shop_mention",
                    description: "رتبت منشن متجر.",
                    type: ApplicationCommandOptionType.Role,
                    required: true,
                },
                {
                    name: "shop_role",
                    description: "رتبت صاحب المتجر من هاذا النوع.",
                    type: ApplicationCommandOptionType.Role,
                    required: true,
                },
                {
                    name: "pirefix",
                    description: "زخرفة المتجر — اكتب هنا مكان الإيموجي مثال: ネ〢「هنا」︲",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
                {
                    name: "maxwarns",
                    description: "اقصى عدد تحذيرات لهاذا النوع.",
                    type: ApplicationCommandOptionType.Integer,
                    required: true,
                },
                {
                    name: "shop_price",
                    description: "سعر المتجر من هاذا النوع.",
                    type: ApplicationCommandOptionType.Integer,
                    required: true,
                },
                {
                    name: "has_tax",
                    description: "هل يحتوي النوع على ضريبة؟",
                    type: ApplicationCommandOptionType.Boolean,
                    required: true,
                },
                {
                    name: "tax_price",
                    description: "سعر الضريبة لهذا النوع (في حالة وجودها).",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "shop-emoji",
                    description: "الإيموجي الافتراضي لهذا النوع مثال: 🛒",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
            ],
        },
        {
            name: "add-type2",
            description: "يحدد نوع كتاغوري و يضيف كل المتاجر الي فيه للداتا",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "name",
                    description: "اسم هاذا النوع",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
                {
                    name: "category",
                    description: "الكاتيجوري الذي تريد تحديد منشناته",
                    type: ApplicationCommandOptionType.Channel,
                    channel_types: [ChannelType.GuildCategory],
                    required: true,
                },
                {
                    name: "everyone_mention_count",
                    description: "عدد منشنات ايفري ون المسموح بها.",
                    type: ApplicationCommandOptionType.Integer,
                    required: true,
                },
                {
                    name: "here_mention_count",
                    description: "عدد منشنات هير المسموح بها.",
                    type: ApplicationCommandOptionType.Integer,
                    required: true,
                },
                {
                    name: "shop_mention_count",
                    description: "عدد منشنات رتبة المسموح بها.",
                    type: ApplicationCommandOptionType.Integer,
                    required: true,
                },
                {
                    name: "shop_mention",
                    description: "رتبت منشن متجر.",
                    type: ApplicationCommandOptionType.Role,
                    required: true,
                },
                {
                    name: "shop_role",
                    description: "رتبت صاحب المتجر من هاذا النوع.",
                    type: ApplicationCommandOptionType.Role,
                    required: true,
                },
                {
                    name: "shop-pirefix",
                    description: "زخرفة المتجر من هاذا النوع",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
                {
                    name: "maxwarns",
                    description: "اقصى عدد تحذيرات لهاذا النوع.",
                    type: ApplicationCommandOptionType.Integer,
                    required: true,
                },
                {
                    name: "shop_price",
                    description: "سعر المتجر من هاذا النوع.",
                    type: ApplicationCommandOptionType.Integer,
                    required: true,
                },
                {
                    name: "has_tax",
                    description: "هل يحتوي النوع على ضريبة؟",
                    type: ApplicationCommandOptionType.Boolean,
                    required: true,
                },
                {
                    name: "tax_price",
                    description: "سعر الضريبة لهذا النوع (في حالة وجودها).",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
            ],
        },
        {
            name: "active",
            description: "لـتـفـعـيـل مـتـجـر",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "shop",
                    description: "الـمـتـجـر",
                    type: ApplicationCommandOptionType.Channel,
                    required: false,
                    channel_types: [ChannelType.GuildText],
                },
            ],
        },
        {
            name: "active-all",
            description: "لـتـفـعـيـل المتاجر",
            dm_permission: false,
            default_member_permissions: 1,
        },
        {
            name: "disable",
            description: "لـتـعـطـيـل مـتـجـر مـعـيـن",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "shop",
                    description: "االـروم",
                    type: ApplicationCommandOptionType.Channel,
                    required: true,
                    channel_types: [ChannelType.GuildText],
                },
                {
                    name: "reason",
                    description: "الـسـبـب",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
            ],
        },
        {
            name: "disable-all",
            description: "تعطيل جميع المتاجر",
            dm_permission: false,
            default_member_permissions: 1,
        },
        {
            name: "tax-time",
            description: "تفعيل وضع الضريبه للمتاجر",
            dm_permission: false,
            default_member_permissions: 1,
        },
        {
            name: "afk",
            description: "لتفعيل وضع الخمول",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "reason",
                    description: "الـسـبـب",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
            ],
        },
        {
            name: "ping",
            description: " لرؤية سرعة استجابت البوت ",
            dm_permission: false,
            default_member_permissions: 1,
        },
        {
            name: "send-tashfeer",
            description: " رسـالـة التـشـفـيـر ",
            dm_permission: false,
            default_member_permissions: 1,
        },
        {
            name: "types",
            description: "لــ اظــهار معلومأت انواع المتاجر",
            dm_permission: false,
            default_member_permissions: 1,
        },
        {
            name: "set-mention",
            description: "تحديد عدد منشنات متجر محدد",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: `shop`,
                    description: `حدد المتجر الذي تريد التعديل عليه.`,
                    type: ApplicationCommandOptionType.Channel,
                    required: true,
                    channel_types: [ChannelType.GuildText],
                },
                {
                    name: `mention`,
                    description: `نوع المنشن.`,
                    type: ApplicationCommandOptionType.String,
                    required: true,
                    choices: [
                        { name: `@everyone`, value: `everyone` },
                        { name: `@here`, value: `here` },
                        { name: `@shop_role`, value: `shop_role` },
                    ],
                },
                {
                    name: `count`,
                    description: `عدد المنشنات الذي سيتم تحديده.`,
                    type: ApplicationCommandOptionType.Integer,
                    required: true,
                },
            ],
        },
        {
            name: "add-mention",
            description: "اضافة عدد منشنات لـ متجر محدد",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: `shop`,
                    description: `حدد المتجر الذي تريد التعديل عليه.`,
                    type: ApplicationCommandOptionType.Channel,
                    required: true,
                    channel_types: [ChannelType.GuildText],
                },
                {
                    name: `mention`,
                    description: `نوع المنشن.`,
                    type: ApplicationCommandOptionType.String,
                    required: true,
                    choices: [
                        { name: `@everyone`, value: `everyone` },
                        { name: `@here`, value: `here` },
                        { name: `@shop_role`, value: `shop_role` },
                    ],
                },
                {
                    name: `count`,
                    description: `عدد المنشنات الذي سيتم تحديده.`,
                    type: ApplicationCommandOptionType.Integer,
                    required: true,
                },
            ],
        },
        {
            name: "add-helper",
            description: " اضـافـة مساعد للمـتـجـر ",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: `helper`,
                    description: `المـساعد.`,
                    type: ApplicationCommandOptionType.User,
                    required: true,
                },
                {
                    name: `shop`,
                    description: ` المـتـجـر.`,
                    type: ApplicationCommandOptionType.Channel,
                    required: false,
                    channel_types: [ChannelType.GuildText],
                },
            ],
        },
        {
            name: "remove-helper",
            description: " ازالة مساعد مـن مـتـجـر مـعـيـن ",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: `helper`,
                    description: `المساعد.`,
                    type: ApplicationCommandOptionType.User,
                    required: true,
                },
                {
                    name: `shop`,
                    description: ` المـتـجـر.`,
                    type: ApplicationCommandOptionType.Channel,
                    required: false,
                    channel_types: [ChannelType.GuildText],
                },
            ],
        },
        {
            name: "show-helpers",
            description: "رؤية مساعدين المتجر",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: `shop`,
                    description: ` المـتـجـر.`,
                    type: ApplicationCommandOptionType.Channel,
                    required: false,
                    channel_types: [ChannelType.GuildText],
                },
            ],
        },
        {
            name: "owner",
            description: "change owner of a shop",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "new-owner",
                    description: "صـاحـب المـتـجـر الجـديـد",
                    type: ApplicationCommandOptionType.User,
                    required: true,
                },
                {
                    name: "shop",
                    description: "المـتـجـر",
                    type: ApplicationCommandOptionType.Channel,
                    required: false,
                    channel_types: [ChannelType.GuildText],
                },
            ],
        },
        {
            name: "delete-shop",
            description: "delete a shop",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "shop",
                    description: "the shop you want to delete",
                    type: ApplicationCommandOptionType.Channel,
                    required: true,
                    channel_types: [ChannelType.GuildText],
                },
                {
                    name: "reason",
                    description: "the reason",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
            ],
        },
        {
            name: "warns",
            description: "عـرض تـحـذيـرات مـتـجـر مـعـيـن",
            dm_permission: false,
            default_member_permissions: 1,
        },
        {
            name: "warn",
            description: "warn a shop",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "thewarn",
                    description: "سبب التحذير",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
                {
                    name: "shop",
                    description: "المـتـجـر",
                    type: ApplicationCommandOptionType.Channel,
                    required: false,
                    channel_types: [ChannelType.GuildText],
                },
                {
                    name: "amount",
                    description: "عـدد التـحـذيـرات",
                    type: ApplicationCommandOptionType.Number,
                    required: false,
                },
                {
                    name: "pic",
                    description: "صوره",
                    type: ApplicationCommandOptionType.Attachment,
                    required: false,
                },
            ],
        },
        {
            name: "unwarn",
            description: "حذف تحذير من متجر",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "shop",
                    description: "المـتـجـر المراد حذف تحذيراته",
                    type: ApplicationCommandOptionType.Channel,
                    required: false,
                    channel_types: [ChannelType.GuildText],
                },
                {
                    name: "amount",
                    description: "عـدد التـحـذيـرات",
                    type: ApplicationCommandOptionType.Number,
                    required: false,
                },
            ],
        },
        {
            name: "unwarn-all",
            description: "حذف كل التحذيرات من المتاجر او متجر",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "shop",
                    description: "المـتـجـر المراد حذف تحذيراته",
                    type: ApplicationCommandOptionType.Channel,
                    required: false,
                    channel_types: [ChannelType.GuildText],
                },
            ],
        },
        {
            name: "mentions",
            description: "اظهار عدد منشنات المتجر",
            dm_permission: false,
            default_member_permissions: 1,
        },
        // أمر إضافة قانون
        {
            name: "add-rule",
            description: "إضـافـة قـانـون جـديـد مـع صـورة (الـحـد الأقـصـى 5)",
            options: [
                { name: "label", description: "اسـم الـزر", type: 3, required: true },
                {
                    name: "content",
                    description: "الـنـص الـذي يـظـهـر عـنـد الـضـغـط",
                    type: 3,
                    required: true,
                },
                {
                    name: "emoji",
                    description: "إيـمـوجـي الـزر (اخـتـيـاري)",
                    type: 3,
                    required: false,
                },
                {
                    name: "image_url",
                    description: "رابـط صـورة لـلإمـبـيـد (اخـتـيـاري)",
                    type: 3,
                    required: false,
                },
                {
                    name: "image_file",
                    description: "رفـع مـلـف صـورة (اخـتـيـاري)",
                    type: 11,
                    required: false,
                },
            ],
        },
        // أمر إرسال قانون كإمبيد
        {
            name: "send-rule",
            description: "إر سـال قـانـون مـحـفـوظ كـإمـبـيـد لـروم مـعـيـنـة",
            options: [
                {
                    name: "rule_name",
                    description: "اخـتـر اسـم الـقـانـون",
                    type: 3,
                    required: true,
                    autocomplete: true,
                },
                {
                    name: "channel",
                    description: "الـروم الـمـراد الإر سـال إلـيـهـا",
                    type: 7,
                    required: true,
                },
            ],
        },
        {
            name: "remove-rule",
            description: "حذف قانون من قائمة البانل",
            dm_permission: false,
            default_member_permissions: 8,
        },
        {
            name: "panel-rules",
            description: "إرسال بانل القوانين",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "embed-text",
                    description: "نص مخصص للإمبد",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
            ],
        },
        {
            name: "panel-tickets",
            description: "إرسال بانل التكتات (شراء متجر، مزاد، طلبات، رتب)",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "embed-text",
                    description: "نص مخصص للإمبد",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
            ],
        },
        {
            name: "all-for-panel",
            description: "إرسال بانل واحد يحتوي على الأسعار والقوانين والتكتات والرتب",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "text",
                    description: "نص مخصص للإمبد (اختياري)",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
            ],
        },
        {
            name: "panel-support",
            description: "إرسال بانل الدعم الفني والتشهير",
            dm_permission: false,
            default_member_permissions: 1,
            options: [
                {
                    name: "embed-text",
                    description: "نص مخصص للإمبد",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
            ],
        },
        {
            name: "نقاطي",
            description: "اعرض نقاط التكتات الخاصة بك",
            dm_permission: false,
        },
        {
            name: "توب-نقاط",
            description: "أعلى المسؤولين نقاطاً في التكتات",
            dm_permission: false,
        },
        {
            name: "add-roles",
            description: "إضافة رتبة للبيع (الحد الأقصى 5)",
            dm_permission: false,
            default_member_permissions: 8,
            options: [
                {
                    name: "role",
                    description: "الرتبة",
                    type: ApplicationCommandOptionType.Role,
                    required: true,
                },
                {
                    name: "price",
                    description: "السعر بالكردت",
                    type: ApplicationCommandOptionType.Integer,
                    required: true,
                },
                {
                    name: "benefits",
                    description: "مميزات الرتبة",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
            ],
        },
        {
            name: "remove-roles",
            description: "حذف رتبة من قائمة البيع",
            dm_permission: false,
            default_member_permissions: 8,
        },
        {
            name: "list-roles",
            description: "عرض قائمة الرتب المتاحة للشراء مع مميزاتها وأسعارها",
            dm_permission: false,
            default_member_permissions: 1,
        },
        {
            name: "shop-check",
            description: "فحص المتاجر المسجلة وعرض الغير متفاعلة (لم ترسل أي رسالة)",
            dm_permission: false,
            default_member_permissions: 8,
        },
        {
            name: "delete-inactive",
            description: "حذف المتاجر الغير متفاعلة خلال مدة محددة",
            dm_permission: false,
            default_member_permissions: 8,
            options: [
                {
                    name: "days",
                    description: "المدة مثال: 1d أو 4d أو 7d",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
            ],
        },
        {
            name: "setup-auto-reset",
            description: "إعداد ريست المنشن التلقائي للمتاجر",
            dm_permission: false,
            default_member_permissions: 8,
            options: [
                {
                    name: "days",
                    description: "عدد الأيام بين كل ريست",
                    type: ApplicationCommandOptionType.Integer,
                    required: true,
                },
                {
                    name: "room",
                    description: "الروم الذي ترسل فيه رسالة الريست",
                    type: ApplicationCommandOptionType.Channel,
                    required: true,
                    channel_types: [ChannelType.GuildText],
                },
                {
                    name: "message",
                    description: "الرسالة التي ترسل في الروم عند الريست",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
            ],
        },
        {
            name: "edit-auto-reset",
            description: "تعديل إعدادات ريست المنشن التلقائي",
            dm_permission: false,
            default_member_permissions: 8,
            options: [
                {
                    name: "days",
                    description: "عدد الأيام بين كل ريست",
                    type: ApplicationCommandOptionType.Integer,
                    required: false,
                },
                {
                    name: "room",
                    description: "الروم الذي ترسل فيه رسالة الريست",
                    type: ApplicationCommandOptionType.Channel,
                    required: false,
                    channel_types: [ChannelType.GuildText],
                },
                {
                    name: "message",
                    description: "الرسالة التي ترسل في الروم عند الريست",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
                {
                    name: "type",
                    description: "نوع المتجر للفلترة (فارغ = الكل)",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                },
            ],
        },
        {
            name: "add-word",
            description: "إضافة أو إزالة كلمة من قائمة الكلمات الممنوعة مع المنشن",
            dm_permission: false,
            default_member_permissions: 8,
            options: [
                {
                    name: "word",
                    description: "الكلمة المراد إضافتها أو إزالتها",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
                {
                    name: "remove",
                    description: "إزالة الكلمة بدلاً من إضافتها؟",
                    type: ApplicationCommandOptionType.Boolean,
                    required: false,
                },
            ],
        },
        {
            name: "list-words",
            description: "عرض قائمة الكلمات الممنوعة (داخل المتجر فقط)",
            dm_permission: false,
            default_member_permissions: 1,
        },
        {
            name: "setup-words",
            description: "إعداد نظام الكلمات الممنوعة (الوضع والروم)",
            dm_permission: false,
            default_member_permissions: 8,
            options: [
                {
                    name: "mode",
                    description: "الوضع",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                    choices: [
                        { name: "تلقائي — يحذر تلقائياً ويمسح الرسالة", value: "auto" },
                        { name: "روم — يرسل للروم وينتظر الإداري", value: "room" },
                    ],
                },
                {
                    name: "room",
                    description: "روم المخالفات (مطلوب في وضع room)",
                    type: ApplicationCommandOptionType.Channel,
                    required: false,
                    channel_types: [ChannelType.GuildText],
                },
            ],
        },
    ];

    try {
        // ===== بوت الميكر: يسجل أوامر الميكر + البريميوم =====
        if (client.user.id === maker.MAKER_BOT_ID) {
            console.log('🔄 جاري تسجيل أوامر الميكر والبريميوم...');
            
            // 1. مسح الأوامر القديمة
            await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
            console.log('✅ تم مسح الأوامر القديمة');
            
            // 2. تسجيل أوامر الميكر + البريميوم في سيرفر واحد
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, maker.TARGET_GUILD_ID),
                { body: maker.makerCommands } // يحتوي على أوامر الميكر والبريميوم
            );
            console.log(`✅ Maker + Premium commands registered for ${client.user.tag}`);
            
            // 3. تفعيل نظام الميكر
            maker.setupMakerSystem(client, bots, db, config, fs);
            console.log(chalk.green(`✅ Maker + Premium system activated for ${client.user.tag}`));
        } else {
            // ===== باقي البوتات: تسجل أوامر المتاجر فقط =====
            console.log('🔄 جاري تسجيل أوامر المتاجر...');
            
            if (globalCommands && globalCommands.length > 0) {
                await rest.put(
                    Routes.applicationCommands(client.user.id), 
                    { body: globalCommands }
                );
                console.log(`✅ Shop commands registered for ${client.user.tag}`);
            } else {
                console.log('⚠️ لا توجد أوامر متاجر للتسجيل');
            }
        }
    } catch (error) {
        console.error(`❌ Error registering commands for ${client.user.tag}:`, error.code || error.message);
        
        console.log(`🔄 سيتم إعادة محاولة تسجيل الأوامر بعد 10 ثواني...`);
        setTimeout(() => {
            client.emit('clientReady');
        }, 10000);
    }
});
  
  // ========== HANDLERS ==========
  require("./handlers/commands")(client, { db, config, botOwner, allowedUserId, owner: botOwner, TARGET_ROLE_ID: "1384831324015296614", TARGET_CHANNEL_ID: "1492886293800288527", logJoinChannel, allowedBotId, prefix, TARGET_GUILD_ID, reportsChannelId: "1492886293800288527", reportsGuildId: "1500197339329986690", chsd });
  require("./handlers/modules/embedColor").init(db, config).catch(() => {});
  require("./handlers/interactions")(client, { db, config, botOwner, allowedUserId, owner: botOwner, TARGET_ROLE_ID: "1384831324015296614", TARGET_CHANNEL_ID: "1492886293800288527", logJoinChannel, allowedBotId, prefix, TARGET_GUILD_ID, reportsChannelId: "1492886293800288527", reportsGuildId: "1500197339329986690", chsd });

  client._botToken = token;

  // ========== GUILD JOIN ==========
    // ========== INTERACTIONS ==========
  client.on(Events.InteractionCreate, async (interaction) => {
    // ===== MAKER + PREMIUM INTERACTIONS =====
    const isMakerCommand = maker.makerCommandNames.includes(interaction.commandName);
    const isMakerButton = interaction.isButton() && (
      interaction.customId === 'add_token' ||
      interaction.customId === 'delete_token' ||
      interaction.customId === 'show_tokens' ||
      interaction.customId === 'change_ownership' ||
      interaction.customId === 'shutdown' ||
      interaction.customId === 'restart' ||
      interaction.customId === 'premium_buy' ||
      interaction.customId === 'premium_buy_monthly' ||
      interaction.customId === 'premium_buy_3months' ||
      interaction.customId === 'premium_my_subscription' ||
      interaction.customId === 'premium_renew' ||
      interaction.customId === 'premium_renew_btn' ||
      interaction.customId === 'premium_invoice' ||
      interaction.customId === 'premium_invoice_btn' ||
      interaction.customId === 'premium_transfer_btn' ||
      interaction.customId === 'premium_cancel' ||
      interaction.customId.startsWith('premium_renew_') ||
      interaction.customId.startsWith('premium_payment_approve_') ||
      interaction.customId.startsWith('premium_payment_reject_') ||
      interaction.customId.startsWith('delete_token_')
    );
    const isPremiumModal = interaction.isModalSubmit() &&
      interaction.customId === 'premium_buy_modal';

    if (isMakerCommand || isMakerButton || isPremiumModal) {
      return await maker.handleMakerInteraction(interaction, client, config, db, fs);
    }

    // ===== LEAVE GUILD BUTTON =====
    if (interaction.isButton()) {
      const [action, guildId] = interaction.customId.split("--");
      if (action === "leaveGuild") {
        if (interaction.user.id !== botOwner) {
          return interaction.reply({ content: "❌ هذا الإجراء مخصص لمالك البوت فقط.", ephemeral: true });
        }
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return interaction.reply({ content: "❌ لا يمكن العثور على هذا السيرفر.", ephemeral: true });
        try {
          await guild.leave();
          await interaction.reply({ content: `✅ تم مغادرة السيرفر: **${guild.name}**`, ephemeral: true });
        } catch {
          await interaction.reply({ content: "❌ فشل في مغادرة السيرفر.", ephemeral: true });
        }
      }
    }
  });


  // ========== MESSAGE CREATE (DM) ==========
  client.on("messageCreate", async (message) => {
    await maker.handleDMMessage(message, client);
  });

  // ========== تشفير الرسائل في الرومات ==========
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (message.channel.type === ChannelType.DM) return;

    const modifiedContent = applyReplacement(message.content);
    if (modifiedContent !== message.content) {
      try {
        await message.edit(modifiedContent);
      } catch (error) {}
    }
  });

  // ========== ERROR HANDLER ==========
  client.on("error", (error) => {
    console.error(`🔴 Bot ${index + 1} encountered an error:`, error);
    if (client.user.id === maker.MAKER_BOT_ID) {
      maker.sendMakerError(client, "Client Error", error);
    }
  });

  client.login(token).catch((error) => {
    if (error.code === "TokenInvalid") console.warn(`⚠️ Bot ${index + 1}: توكن غير صالح`);
    else console.error(`❌ Bot ${index + 1} failed to log in:`, error);
  });

  return client;
});

app.listen(port, () => {
  console.log(`🌐 Server running on port ${port}`);
});