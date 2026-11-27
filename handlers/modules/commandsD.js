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
// ========== في أول الملف (تحت الاستيرادات) ==========
const https = require("https");

// دالة رفع صورة لـ Catbox وترجع الرابط المباشر
async function uploadImageToHost(fileUrl) {
    return new Promise((resolve, reject) => {
        const tempDir = path.join(__dirname, "..", "temp");
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        const ext = fileUrl.match(/\.(png|jpe?g|webp|gif)/i)?.[0] || ".png";
        const tempFile = path.join(tempDir, `upload_${Date.now()}${ext}`);
        const fileStream = fs.createWriteStream(tempFile);

        // تحميل الملف من الرابط
        https.get(fileUrl, (response) => {
            // إذا كان تحويل (redirect)، نتبع الرابط الجديد
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                return uploadImageToHost(response.headers.location).then(resolve).catch(reject);
            }
            response.pipe(fileStream);
            fileStream.on("finish", () => {
                fileStream.close();
                
                // رفع الملف لـ Catbox
                const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
                const fileContent = fs.readFileSync(tempFile);
                
                const postData = Buffer.concat([
                    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="reqtype"\r\n\r\nfileupload\r\n`),
                    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="fileToUpload"; filename="${path.basename(tempFile)}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
                    fileContent,
                    Buffer.from(`\r\n--${boundary}--\r\n`),
                ]);

                const options = {
                    hostname: "catbox.moe",
                    path: "/user/api.php",
                    method: "POST",
                    headers: {
                        "Content-Type": `multipart/form-data; boundary=${boundary}`,
                        "Content-Length": postData.length,
                    },
                };

                const req = https.request(options, (res) => {
                    let data = "";
                    res.on("data", (chunk) => data += chunk);
                    res.on("end", () => {
                        // حذف الملف المؤقت
                        fs.unlink(tempFile, () => {});
                        resolve(data.trim());
                    });
                });

                req.on("error", (err) => {
                    fs.unlink(tempFile, () => {});
                    reject(err);
                });
                req.write(postData);
                req.end();
            });
        }).on("error", (err) => {
            fs.unlink(tempFile, () => {});
            reject(err);
        });
    });
}

// ========== ثم عدّل كود setup-images ==========

// ============================================================
// ✅ أدوات مشتركة لبناء وإرسال Components V2 (نفس الأسلوب
// المستخدم بباقي ملفات البوت). لو ما فيه صورة، ما تنضاف أي
// MediaGallery خالص (بدل تمرير رابط فاضي أو "undefined" حرفياً
// كان يكسر الإمبد القديم بأكثر من مكان بهذا الملف).
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

    // ✅ لو ما فيه صورة فعلية (لا imageUrl ولا config.line)، ما ننضاف أي
    // MediaGallery خالص — بدل ما نمرر "" أو نص "undefined" حرفياً كان
    // يخلي ديسكورد يرفض الإمبد بخطأ (URL غير صالح).
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

// دالة تنسيق سطر واحد بمجموعة الحقول (نفس أسلوب setup-prices)
const fieldLine = (label, value) =>
    `**${label}:** ${value ? value : "غـيـر مـحـدد"}`;

module.exports = function registerCommandsD(
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
    client.on("interactionCreate", async (i) => {
        if (!i.isChatInputCommand()) return;
        if (!i.guild) return;
        const guildId = i.guild.id;
        switch (i.commandName) {
            case "add-type":
                {
                    const blacklist = (await db.get("blacklist")) || [];
                    if (blacklist.includes(i.user.id)) {
                        return i.reply(
                            "**أنـت فـي الـبـلاك لـسـت، لـمـعـلـومـات أكـثـر تـعـال إلـى سـيـرفـر الـدعـم!**",
                        );
                    }

                    const categoryId = i.options.get("category").value;
                    const nametype = i.options.getString("name");
                    const evcount = i.options.get("everyone_mention_count").value;
                    const hecount = i.options.get("here_mention_count").value;
                    const shcount = i.options.get("shop_mention_count").value;
                    const pirefix = i.options.getString("pirefix");
                    const shopEmoji = i.options.getString("shop-emoji") || "";
                    const shoprole = i.options.getRole("shop_role").id;
                    const shopmen = i.options.getRole("shop_mention").id;
                    const maxWarns = i.options.get("maxwarns").value;
                    const hasTax = i.options.getBoolean("has_tax");
                    let taxPrice = i.options.get("tax_price")?.value || 0;
                    const shopPrice = i.options.get("shop_price")?.value || 0;

                    await i.deferReply({ flags: MessageFlags.Ephemeral });

                    const category = await i.guild.channels
                        .fetch(categoryId)
                        .catch(() => null);
                    if (!category)
                        return i.editReply({
                            content:
                                "❌ **لا يـمـكـنـنـي الـوصـول إلـى هـذا الـكـاتـيـجـوري!**",
                        });

                    const guildId = i.guild.id;
                    const key = `categoryMentions_${categoryId}_${guildId}`;

                    // تحقق من شروط الضريبة
                    if (hasTax && taxPrice === 0) {
                        return i.editReply({
                            content:
                                "❌ يـجـب تـحـديـد سـعـر الـضـريـبـة إذا كـانـت مـفـعـلـة وتـكـون أكـبـر مـن 0.",
                        });
                    }

                    // ضبط الضريبة إلى 0 إذا كانت غير مفعّلة
                    if (!hasTax) {
                        taxPrice = 0;
                    }

                    const op = {
                        categoryId: categoryId,
                        everyoneMentions: evcount,
                        hereMentions: hecount,
                        shopRoleMentions: shcount,
                        pirefix: pirefix,
                        shopEmoji: shopEmoji,
                        shoprole: shoprole,
                        shopmen: shopmen,
                        maxWarns: maxWarns,
                        hasTax: hasTax,
                        taxPrice: taxPrice,
                        shopPrice: shopPrice,
                        nametype: nametype,
                        guildId: guildId,
                    };

                    const imageUrl = await db.get(`image_${guildId}`);

                    const existingData = await db.get(key);

                    await db.set(key, op);

                    const isUpdate = !!existingData;

                    await i.editReply({
                        content: `✅ تـم ${isUpdate ? "تـحـديـث" : "إضـافـة"} الـنـوع بـنـجـاح`,
                    });

                    const typeContainer = buildContainer({
                        title: `**${isUpdate ? "تـم تـحـديـث" : "تـم إضـافـة"} الـنـوع: ${nametype || "غـيـر مـحـدد"}**`,
                        description: ED.commandsD_001({
                            config,
                            evcount,
                            hasTax,
                            hecount,
                            maxWarns,
                            pirefix,
                            shcount,
                            shopEmoji,
                            shopPrice,
                            shopmen,
                            shoprole,
                            taxPrice,
                        }),
                        fields: [{ name: "الـكـاتـيـجـوري", value: `<#${categoryId}>` }],
                        image: imageUrl || config.line || null,
                    });
                    await sendContainer(i.channel, typeContainer);
                }
                break;
            case "add-type2":
                {
                    const blacklist = (await db.get("blacklist")) || [];
                    if (blacklist.includes(i.user.id)) {
                        return i.reply(
                            "**أنـت فـي الـبـلاك لـسـت، لـمـعـلـومـات أكـثـر تـعـال إلـى سـيـرفـر الـدعـم!**",
                        );
                    }
                    const guildId = i.guild.id;
                    const categoryId = i.options.get("category").value;
                    const nametype = i.options.getString("name");
                    const evcount = i.options.get("everyone_mention_count").value;
                    const hecount = i.options.get("here_mention_count").value;
                    const shcount = i.options.get("shop_mention_count").value;
                    const pirefix = i.options.getString("shop-pirefix");
                    const shoprole = i.options.getRole("shop_role").id;
                    const shopmen = i.options.getRole("shop_mention").id;
                    const maxWarns = i.options.get("maxwarns").value;
                    const hasTax = i.options.getBoolean("has_tax");
                    let taxPrice = i.options.get("tax_price")?.value || 0;
                    const shopPrice = i.options.get("shop_price")?.value || 0;
                    const imageUrl = await db.get(`image_${guildId}`);

                    // ✅ إصلاح: كان الكود بالـ catch يستدعي i.reply() ويرجّع
                    // نتيجتها كـ "category"، فلو فشل الجلب كانت العملية
                    // تكمل وتحاول تستخدم category.children.cache على قيمة
                    // مو Category خالص، فتكرش الأمر (حتى بعد الرد بخطأ واضح
                    // للمستخدم). صار الآن يرجع null عند الفشل، ونتحقق ونرجع
                    // فوراً.
                    const category = await i.guild.channels
                        .fetch(categoryId)
                        .catch(() => null);
                    if (!category) {
                        return i.reply({
                            content: `❌ **لا يـمـكـنـنـي الـوصـول عـلـى هـذا الـكـاتـيـجـوري !**`,
                            ephemeral: true,
                        });
                    }

                    const allCategories = await db.all();
                    const categoryCount = allCategories.filter(
                        (entry) =>
                            entry.id.startsWith(`categoryMentions_`) &&
                            entry.id.endsWith(`_${guildId}`),
                    ).length;

                    if (categoryCount > 15) {
                        return i.reply({
                            content: `❌ **لا يـمـكـنـك تـحـديـد أكـثـر مـن 15 كـاتـيـجـوريـات فـي هـذا الـسـيـرفـر.**`,
                            ephemeral: true,
                        });
                    }

                    if (evcount > 9999) {
                        return i.reply({
                            content: `❌ **لا يـمـكـنـك تـحـديـد أكـثـر مـن 9999 مـنـشـنـات ايـفـري ._.**`,
                            ephemeral: true,
                        });
                    }
                    if (hecount > 9999) {
                        return i.reply({
                            content: `❌ **لا يـمـكـنـك تـحـديـد أكـثـر مـن 9999 مـنـشـنـات هـيـر ._.**`,
                            ephemeral: true,
                        });
                    }
                    if (shcount > 9999) {
                        return i.reply({
                            content: `❌ **لا يـمـكـنـك تـحـديـد أكـثـر مـن 9999 مـنـشـنـات شـوب ._.**`,
                            ephemeral: true,
                        });
                    }
                    if (maxWarns > 999) {
                        return i.reply({
                            content: `❌ **لا يـمـكـنـك تـحـديـد أكـثـر مـن 999 أقـصـى عـدد لـتـحـذيـرات ._.**`,
                            ephemeral: true,
                        });
                    }

                    // تحقق من شروط الضريبة
                    if (hasTax && taxPrice === 0) {
                        return i.reply({
                            content:
                                "يـجـب تـحـديـد سـعـر الـضـريـبـة إذا كـانـت الـضـريـبـة مـفـعـلـة ويـكـون أكـبـر مـن 0.",
                            ephemeral: true,
                        });
                    }
                    if (!hasTax && taxPrice > 0) {
                        return i.reply({
                            content:
                                "لا يـمـكـنـك تـحـديـد سـعـر ضـريـبـة إذا كـانـت الـضـريـبـة غـيـر مـفـعـلـة.",
                            ephemeral: true,
                        });
                    }

                    const { member } = i;
                    const highstaff = await db.get(`highstaff_${guildId}`);
                    if (!highstaff) {
                        await i.reply({
                            content:
                                "يـرجـى تـحـديـد رتـبـة الـعـلـيـا (highstaff) عـن طـريـق اسـتـخـدام الامـر الاتـي: /setup",
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

                    // ضبط الضريبة إلى 0 إذا كانت غير مفعّلة
                    if (!hasTax) {
                        taxPrice = 0;
                    }

                    let datecreated = `<t:${parseInt(Date.now() / 1000)}:R>`;
                    for (const channel of category.children.cache) {
                        const op = {
                            channelId: channel[0],
                            categoryId: categoryId,
                            everyoneMentions: evcount,
                            hereMentions: hecount,
                            shopmen: shopmen,
                            shoprole: shoprole,
                            shopRoleMentions: shcount,
                            date: datecreated,
                            maxWarns: maxWarns,
                            taxPrice: taxPrice,
                            hasTax: hasTax,
                            nametype: nametype,
                            pirefix: pirefix,
                            shopname: channel[1].name,
                        };
                        await db.set(`shop_${channel[0]}_${guildId}`, op);
                        await db.set(`shop_${channel[0]}_${guildId}.warns`, "0");
                        await db.set(`shop_${channel[0]}_${guildId}.status`, "1");
                    }
                    const ob = {
                        categoryId: categoryId,
                        everyoneMentions: evcount,
                        hereMentions: hecount,
                        shopRoleMentions: shcount,
                        pirefix: pirefix,
                        shoprole: shoprole,
                        shopmen: shopmen,
                        maxWarns: maxWarns, // إضافة أقصى عدد تحذيرات
                        hasTax: hasTax,
                        taxPrice: taxPrice,
                        shopPrice: shopPrice,
                        nametype: nametype,
                    };
                    await db.set(`categoryMentions_${categoryId}_${guildId}`, ob);

                    const type2Container = buildContainer({
                        title: `**تـم الـتـحـديـد مـعـلـومـات الـنـوع: ${nametype || "غـيـر مـحـدد"}**`,
                        description: ED.commandsD_002({
                            config,
                            evcount,
                            hasTax,
                            hecount,
                            maxWarns,
                            pirefix,
                            shcount,
                            shopPrice,
                            shopmen,
                            shoprole,
                            taxPrice,
                        }),
                        fields: [
                            {
                                name: "الـكـتـاغـوري",
                                value: `(${i.guild.channels.cache.get(categoryId)?.id || "غـيـر مـعـروف"})`,
                            },
                        ],
                        image: imageUrl || config.line || null,
                    });
                    await sendContainer(i.channel, type2Container);
                }
                break;
            case "edit-type":
                {
                    const blacklist = (await db.get("blacklist")) || [];
                    if (blacklist.includes(i.user.id)) {
                        return i.reply(
                            "**أنـت فـي الـبـلاك لـسـت، لـمـعـلـومـات أكـثـر تـعـال إلـى سـيـرفـر الـدعـم!**",
                        );
                    }

                    const categoryId = i.options.get("category").value;
                    const key = `categoryMentions_${categoryId}_${i.guild.id}`;
                    const oldData = await db.get(key);

                    if (!oldData) {
                        return i.reply({
                            content:
                                "❌ **هـذا الـنـوع غـيـر مـوجـود، لا يـمـكـن تـعـديـلـه.**",
                            ephemeral: true,
                        });
                    }

                    const { member } = i;
                    const guildId = i.guild.id;
                    const highstaff = await db.get(`highstaff_${guildId}`);

                    if (!highstaff) {
                        return i.reply({
                            content:
                                "يـرجـى تـحـديـد رتـبـة الـعـلـيـا (highstaff) عـن طـريـق اسـتـخـدام الامـر الاتـي: /setup",
                            ephemeral: true,
                        });
                    }

                    if (!member.roles.cache.has(highstaff)) {
                        return i.reply({
                            content: `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر. تـحـتـاج رتـبـه <@&${highstaff}>.`,
                            ephemeral: true,
                        });
                    }

                    // 🔥 جمع القيم الجديدة إذا موجودة، وإذا ما أرسلها يأخذ القديمة مثل ما هي
                    const newData = {
                        categoryId,
                        nametype: i.options.getString("name") || oldData.nametype,
                        everyoneMentions:
                            i.options.getInteger("everyone_mention_count") ??
                            oldData.everyoneMentions,
                        hereMentions:
                            i.options.getInteger("here_mention_count") ??
                            oldData.hereMentions,
                        shopRoleMentions:
                            i.options.getInteger("shop_mention_count") ??
                            oldData.shopRoleMentions,
                        pirefix: i.options.getString("pirefix") || oldData.pirefix,
                        shopEmoji:
                            i.options.getString("shop-emoji") ?? oldData.shopEmoji ?? "",
                        shoprole: i.options.getRole("shop_role")?.id || oldData.shoprole,
                        shopmen: i.options.getRole("shop_mention")?.id || oldData.shopmen,
                        maxWarns: i.options.getInteger("maxwarns") ?? oldData.maxWarns,
                        shopPrice: i.options.getInteger("shop_price") ?? oldData.shopPrice,
                        hasTax: i.options.getBoolean("has_tax") ?? oldData.hasTax,
                        taxPrice: i.options.getInteger("tax_price") ?? oldData.taxPrice,
                        guildId,
                    };

                    // إذا الضريبة صايرة false نخلي السعر 0
                    if (newData.hasTax === false) newData.taxPrice = 0;

                    await db.set(key, newData);

                    const imageUrl = await db.get(`image_${guildId}`);

                    await i.reply({
                        content: "✅ **تـم تـعـديـل الـنـوع بـنـجـاح!**",
                        ephemeral: true,
                    });

                    const editTypeContainer = buildContainer({
                        title: `**تـم تـعـديـل الـنـوع: ${newData.nametype}**`,
                        description: ED.commandsD_003({ config, newData }),
                        fields: [{ name: "الـكـتـاغـوري", value: `(${categoryId})` }],
                        footer: "تـلـمـيـح: اكـتـب +تحذيرات",
                        color: _ec.color(i.guild?.id),
                        image: imageUrl || config.line || null,
                    });
                    await sendContainer(i.channel, editTypeContainer);
                }
                break;
            case "check-types":
                {
                    const guildId = i.guild.id;
                    const { member } = i;

                    const highstaff = await db.get(`highstaff_${guildId}`);
                    if (!highstaff) {
                        return i.reply({
                            content:
                                "يـرجـى تـحـديـد رتـبـة الـعـلـيـا (highstaff) مـن خـلال /setup",
                            ephemeral: true,
                        });
                    }

                    if (!member.roles.cache.has(highstaff)) {
                        return i.reply({
                            content: `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر. تـحـتـاج رتـبـه <@&${highstaff}>.`,
                            ephemeral: true,
                        });
                    }

                    const all = await db.all();
                    const types = all.filter(
                        (e) =>
                            e.id.startsWith("categoryMentions_") &&
                            e.id.endsWith(`_${guildId}`),
                    );

                    if (types.length === 0) {
                        return i.reply({
                            content: "❌ لا تـوجـد أنـواع مـتـاجـر فـي الـسـيـرفـر.",
                            ephemeral: true,
                        });
                    }

                    let valid = 0;
                    let deleted = 0;

                    for (const entry of types) {
                        const data = entry.value;
                        const cat = i.guild.channels.cache.get(data.categoryId);

                        if (!cat) {
                            await db.delete(entry.id);
                            deleted++;
                        } else {
                            valid++;
                        }
                    }

                    const container = buildContainer({
                        title: " فـحـص الأنـواع",
                        description: ED.commandsD_004({ deleted, valid }),
                        color: _ec.color(guildId),
                    });

                    return replyContainer(i, container);
                }
                break;
            case "remove-helper":
                {
                    // ⚠️ ملاحظة: هذا الأمر مسجّل بنفس الاسم بملف آخر بالبوت
                    // (commandsC.js) كمان. لأن ديسكورد.جي.إس يرسل حدث
                    // interactionCreate لكل الـ listeners المسجّلة، يعني
                    // ضغطة /remove-helper وحدة ممكن تشغّل الكودين مرتين
                    // (رسالتين مكرّرتين + محاولة تعديل نفس البيانات مرتين).
                    // يفضل إبقاء هذا الأمر بملف واحد بس.
                    const blacklist = (await db.get("blacklist")) || [];
                    if (blacklist.includes(i.user.id)) {
                        return i.reply(
                            "**أنـت فـي الـبـلاك لـسـت، لـمـعـلـومـات أكـثـر تـعـال سـيـرفـر الـسـبـورت!**",
                        );
                    }
                    const guildId = i.guild.id;
                    const { member, guild } = i;
                    const { options } = i;
                    const part = options.getUser("helper");
                    const shop = options.getChannel("shop") || i.channel; // استخدم القناة الحالية إذا لم يتم تحديد قناة

                    const admins = await db.get(`shopad_${guildId}`);
                    if (!admins) {
                        return i.reply({
                            content:
                                "يـرجـى تـحـديـد الادمـن عـن طـريـق اسـتـخـدام الامـر الاتـي: /setup",
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
                            return i.editReply("** هـذة الـروم لـيـسـت مـتـجـر **");
                        }

                        const existingPartners = data.partners || [];
                        if (!existingPartners.includes(part.id)) {
                            return i.editReply(
                                "** هـذا الـعـضـو لـيـس عـمـيـل فـي هـذا الـمـتـجـر. **",
                            );
                        }

                        const shopChannel = await i.guild.channels.fetch(shop.id);
                        await shopChannel.permissionOverwrites.delete(part.id);

                        const updatedPartners = existingPartners.filter(
                            (partnerId) => partnerId !== part.id,
                        );
                        await db.set(
                            `shop_${shop.id}_${guildId}.partners`,
                            updatedPartners,
                        );

                        const logs = await db.get(`logs_${guildId}`);
                        const logg = logs ? i.guild.channels.cache.get(logs) : null;

                        await i.editReply(
                            `** الـعـمـيـل <@${part.id}> تـم ازالـتـه مـن الـمـتـجـر <#${shop.id}> بـ نـجـاح. **`,
                        );
                        await shopChannel.send({
                            content: `** تـم ازالـة : <@${part.id}> \n كـ عـمـيـل مـن الـمـتـجـر **`,
                        });

                        if (logg) {
                            await logg.send({
                                content: `** تـم ازالـة : <@${part.id}> \n كـ عـمـيـل مـن الـمـتـجـر **\n<@${i.user.id}> عـن طـريـق`,
                            });
                        }
                    } catch (error) {
                        console.error(error);
                        return i.editReply(
                            "وجـدت مـشـكـلـة أثـنـاء إزالـة الـعـمـيـل مـن الـمـتـجـر.",
                        );
                    }
                }
                break;
            case "types":
                {
                    const guildId = i.guild.id;
                    const { member } = i;

                    const highstaff = await db.get(`highstaff_${guildId}`);
                    if (!highstaff) {
                        return i.reply({
                            content:
                                "يـرجـى تـحـديـد رتـبـة الـعـلـيـا (highstaff) عـن طـريـق اسـتـخـدام الامـر الاتـي: /setup",
                            ephemeral: true,
                        });
                    }

                    if (!member.roles.cache.has(highstaff)) {
                        return i.reply({
                            content: `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر. تـحـتـاج رتـبـه <@&${highstaff}>.`,
                            ephemeral: true,
                        });
                    }

                    const allCategories = await db.all();
                    const categories = allCategories
                        .filter(
                            (entry) =>
                                entry.id.startsWith(`categoryMentions_`) &&
                                entry.id.endsWith(`_${guildId}`),
                        )
                        .map((entry) => entry.value);

                    if (categories.length === 0) {
                        return i.reply({
                            content: `❌ **لا تـوجـد أنـواع مـتـاجـر مـحـددة فـي هـذا الـسـيـرفـر.**`,
                        });
                    }

                    const imageUrl = await db.get(`image_${guildId}`);

                    const container = buildContainer({
                        title: " قـائـمـة أنـواع الـمـتـاجـر",
                        description: ED.commandsD_005({ categories, i }),
                        color: _ec.color(guildId),
                        image: imageUrl || config.line || null,
                    });

                    // إنشاء أزرار لكل نوع، 5 أزرار لكل صف
                    const rows = [];
                    let currentRow = new ActionRowBuilder();
                    let btnCount = 0;

                    for (const category of categories) {
                        const btn = new ButtonBuilder()
                            .setCustomId(`type_${category.categoryId}`)
                            .setLabel(category.nametype || "غـيـر مـحـدد")
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji(emojis.list);

                        currentRow.addComponents(btn);
                        btnCount++;

                        // كل 5 أزرار نبدأ صف جديد
                        if (btnCount === 5) {
                            rows.push(currentRow);
                            currentRow = new ActionRowBuilder();
                            btnCount = 0;
                        }
                    }

                    // إضافة آخر صف إذا فيه أزرار
                    if (currentRow.components.length > 0) {
                        rows.push(currentRow);
                    }

                    // إرسال الرد مع الأزرار
                    await replyContainer(i, container, { rows });
                    const filter = (btnInt) =>
                        btnInt.user.id === i.user.id && btnInt.customId.startsWith("type_");
                    const collector = i.channel.createMessageComponentCollector({
                        filter,
                        time: 60000,
                    });

                    collector.on("collect", async (btnInt) => {
                        const categoryId = btnInt.customId.replace("type_", "");
                        const categoryData = categories.find(
                            (c) => c.categoryId === categoryId,
                        );

                        if (!categoryData) {
                            return btnInt.reply({
                                content:
                                    "❌ لـم أتـمـكـن مـن الـعـثـور عـلـى بـيـانـات هـذا الـنـوع.",
                                ephemeral: true,
                            });
                        }

                        const categoryChannel = i.guild.channels.cache.get(
                            categoryData.categoryId,
                        );
                        const channelName = categoryChannel?.name || "غـيـر مـعـروف";

                        const detailContainer = buildContainer({
                            title: ` مـعـلـومـات الـنـوع: ${categoryData.nametype || "غـيـر مـحـدد"}`,
                            description: ED.commandsD_006({ categoryData, channelName, config }),
                            footer: D.footer(i.guild),
                            thumbnail: D.thumb(i.guild),
                            color: _ec.color(guildId),
                            image: imageUrl || config.line || null,
                        });

                        await replyContainer(btnInt, detailContainer, { ephemeral: true });
                    });
                }
                break;
            case "typeswas":
                {
                    const guildId = i.guild.id;
                    const { member } = i;
                    const highstaff = await db.get(`highstaff_${guildId}`);
                    if (!highstaff) {
                        await i.reply({
                            content:
                                "يـرجـى تـحـديـد رتـبـة الـعـلـيـا (highstaff) عـن طـريـق اسـتـخـدام الامـر الاتـي: /setup",
                            ephemeral: true,
                        });
                        return;
                    }

                    if (!member.roles.cache.has(highstaff)) {
                        await i.reply({
                            content: `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر. تـحـتـاج رتـبـه <@&${highstaff}>.`,
                            ephemeral: true,
                        });
                        return;
                    }

                    // الحصول على جميع الأنواع المرتبطة بالسيرفر
                    const allCategories = await db.all();
                    const categories = allCategories
                        .filter(
                            (entry) =>
                                entry.id.startsWith(`categoryMentions_`) &&
                                entry.id.endsWith(`_${guildId}`),
                        )
                        .map((entry) => entry.value);

                    if (categories.length === 0) {
                        return i.reply({
                            content: `❌ **لا تـوجـد أنـواع مـتـاجـر مـحـددة فـي هـذا الـسـيـرفـر.**`,
                        });
                    }

                    // الحصول على صورة من قاعدة البيانات إذا كانت موجودة
                    const imageUrl = await db.get(`image_${guildId}`);

                    const listContainer = buildContainer({
                        title: " قـائـمـة أنـواع الـمـتـاجـر",
                        description: ED.commandsD_007({ categories, i }),
                        color: _ec.color(i.guild?.id),
                        image: imageUrl || config.line || null,
                    });

                    await replyContainer(i, listContainer);

                    // ✅ إصلاح: كان يجمع كل الأنواع بمصفوفة embeds واحدة
                    // ويرسلها برسالة وحدة — بس ديسكورد يسمح بحد أقصى 10
                    // إمبد بكل رسالة، فلو فيه أكثر من 10 أنواع كان الإرسال
                    // يفشل بالكامل بخطأ من الـ API. صار الآن يرسل رسالة
                    // مستقلة لكل نوع، فما فيه حد أقصى يوقف الإرسال.
                    for (const category of categories) {
                        const categoryChannel = i.guild.channels.cache.get(
                            category.categoryId,
                        );
                        if (!categoryChannel) continue;

                        const catContainer = buildContainer({
                            title: `**مـعـلـومـات الـنـوع: ${category.nametype || "غـيـر مـحـدد"}**`,
                            description: ED.commandsD_008({ category, config }),
                            fields: [
                                {
                                    name: "الـكـتـاغـوري",
                                    value: `(${i.guild.channels.cache.get(category.categoryId)?.id || "غـيـر مـعـروف"})`,
                                },
                            ],
                            authorName: i.guild.name,
                            authorIcon: i.guild.iconURL({ size: 1024 }),
                            footer: D.footer(i.guild),
                            thumbnail: i.guild.iconURL({ size: 1024 }),
                            image: imageUrl || config.line || null,
                        });
                        await i.followUp({
                            components: [catContainer],
                            flags: MessageFlags.IsComponentsV2,
                        }).catch(() => {});
                    }
                }
                break;
            // الكود الجديد
            case "remove-type":
                {
                    const categoryId = i.options.get("category").value;
                    const guildId = i.guild.id;
                    const key = `categoryMentions_${categoryId}_${guildId}`;
                    const { member } = i;
                    const highstaff = await db.get(`highstaff_${guildId}`);
                    if (!highstaff) {
                        await i.reply({
                            content:
                                "يـرجـى تـحـديـد رتـبـة الـعـلـيـا (highstaff) عـن طـريـق اسـتـخـدام الامـر الاتـي: /setup",
                            ephemeral: true,
                        });
                        return;
                    }

                    if (!member.roles.cache.has(highstaff)) {
                        await i.reply({
                            content: `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر. تـحـتـاج رتـبـه <@&${highstaff}>.`,
                            ephemeral: true,
                        });
                        return;
                    }

                    const existingData = await db.get(key);

                    if (!existingData) {
                        return i.reply({
                            content: `❌ **لـم يـتـم الـعـثـور عـلـى الـنـوع الـمـرتـبـط بـهـذا الـكـاتـيـجـوري.**`,
                            ephemeral: true,
                        });
                    }

                    await db.delete(key);

                    return i.reply({
                        content: `✅ **تـم حـذف الـنـوع الـمـرتـبـط بـالـكـاتـيـجـوري بـنـجـاح!**`,
                        ephemeral: true,
                    });
                }
                break;
            case "remove-all-types":
                {
                    const guildId = i.guild.id;
                    const { member } = i;

                    const highstaff = await db.get(`highstaff_${guildId}`);
                    if (!highstaff) {
                        return i.reply({
                            content:
                                "يـرجـى تـحـديـد رتـبـة الـعـلـيـا (highstaff) عـن طـريـق اسـتـخـدام الأمـر الـتـالـي: `/setup`",
                            ephemeral: true,
                        });
                    }

                    if (!member.roles.cache.has(highstaff)) {
                        return i.reply({
                            content: `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر. تـحـتـاج رتـبـه <@&${highstaff}>.`,
                            ephemeral: true,
                        });
                    }

                    // جلب جميع المفاتيح المرتبطة بأنواع المتاجر في هذا السيرفر
                    const allKeys = await db.all();
                    const categoryKeys = allKeys
                        .map((entry) => entry.id)
                        .filter(
                            (key) =>
                                key.startsWith(`categoryMentions_`) &&
                                key.includes(`_${guildId}`),
                        );

                    if (categoryKeys.length === 0) {
                        return i.reply({
                            content: `❌ **لا يـوجـد أنـواع مـتـاجـر مـسـجـلـة فـي هـذا الـسـيـرفـر.**`,
                            ephemeral: true,
                        });
                    }

                    // حذف جميع أنواع المتاجر
                    for (const key of categoryKeys) {
                        await db.delete(key);
                    }

                    return i.reply({
                        content: `✅ **تـم حـذف جـمـيـع أنـواع الـمـتـاجـر فـي هـذا الـسـيـرفـر بـنـجـاح!**`,
                        ephemeral: true,
                    });
                }
                break;
            case "active":
                {
                    const blacklist = (await db.get("blacklist")) || [];
                    if (blacklist.includes(i.user.id)) {
                        return i.reply(
                            "**أنـت فـي الـبـلاك لـسـت، لـمـعـلـومـات أكـثـر تـعـال سـيـرفـر الـسـبـورت!**",
                        );
                    }
                    await i.deferReply({ ephemeral: false });

                    const shopi = i.options.getChannel("shop") || i.channel;
                    const shopoo = await i.guild.channels.fetch(shopi.id);
                    const guildId = i.guild.id;
                    const { member } = i;
                    const admins = await db.get(`shopad_${guildId}`);

                    if (!admins) {
                        await i.editReply({
                            content:
                                "يـرجـى تـحـديـد الادمـن عـن طـريـق اسـتـخـدام الامـر الاتـي: /setup",
                        });
                        return;
                    }

                    if (!member.roles.cache.has(admins)) {
                        await i.editReply(
                            `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر تـحـتـاج رتـبـه <@&${admins}>`,
                        );
                        return;
                    }

                    if (!shopoo) {
                        await i.editReply("**لا أسـتـطـيـع الـعـثـور عـلـي هـذه الـروم**");
                        return;
                    }

                    const shppp = await db.get(`shop_${shopi.id}_${guildId}`);

                    if (!shppp) {
                        await i.editReply("**هـذا الـروم لـيـس مـتـجـر**");
                        return;
                    }

                    if (shppp.status === "1") {
                        await i.editReply("**الـروم لـيـس مـعـطـل**");
                        return;
                    }

                    if (shppp.status === "0") {
                        await shopi.permissionOverwrites.edit(i.guild.roles.everyone, {
                            ViewChannel: true,
                        });

                        // استرجاع رابط الصورة من قاعدة البيانات
                        const imageUrl = await db.get(`image_${guildId}`);

                        await db.set(`shop_${shopi.id}_${guildId}.status`, "1");

                        const activeContainer = buildContainer({
                            title: `تـم تـفـعـيـل الـمـتـجـر`,
                            description: ED.commandsD_009(),
                            footer: D.footer(i.guild),
                            thumbnail: D.thumb(i.guild),
                            image: imageUrl || config.line || null,
                            mention: `<@${shppp.sellerId}>`,
                        });
                        await sendContainer(shopi, activeContainer);
                        await i.editReply("**تـم تـفـعـيـل الـمـتـجـر بـنـجـاح**");

                        const activeLogContainer = buildContainer({
                            title: `تـم تـفـعـيـل مـتـجـر`,
                            description: ED.commandsD_010({ i }),
                            fields: [{ name: "الـمـتـجـر  : ", value: `<#${shopi.id}>` }],
                            footer: D.footer(i.guild),
                            thumbnail: D.thumb(i.guild),
                            image: imageUrl || config.line || null,
                        });

                        // ✅ إصلاح: كان يجلب روم السجلات بـ
                        // .fetch(channelToSendId) بدون أي تحقق ولا .catch() —
                        // لو روم السجلات غير محدد أصلاً، .fetch(undefined)
                        // بديسكورد.جي.إس يرجّع *كل رومات السيرفر* بدل روم
                        // وحد، وبعدها .send() عليها يفشل ويكرش الأمر (رغم
                        // إن التفعيل نفسه صار بنجاح فعلاً).
                        const channelToSendId = await db.get(`logs_${guildId}`);
                        if (channelToSendId) {
                            const channelToSend = await i.guild.channels
                                .fetch(channelToSendId)
                                .catch(() => null);
                            if (channelToSend) {
                                await sendContainer(channelToSend, activeLogContainer).catch(() => {});
                            }
                        }

                        await editReplyContainer(i, activeLogContainer);
                    }
                }
                break;
            case "active-all":
                {
                    const blacklist = (await db.get("blacklist")) || [];
                    if (blacklist.includes(i.user.id)) {
                        return i.reply(
                            "**أنـت فـي الـبـلاك لـسـت، لـمـعـلـومـات أكـثـر تـعـال سـيـرفـر الـسـبـورت!**",
                        );
                    }

                    await i.deferReply({ ephemeral: true });

                    const guildId = i.guild.id;
                    const { member } = i;
                    const highstaff = await db.get(`highstaff_${guildId}`);

                    if (!highstaff) {
                        await i.editReply({
                            content:
                                "يـرجـى تـحـديـد رتـبـة الـعـلـيـا (highstaff) عـن طـريـق اسـتـخـدام الامـر الاتـي: /setup",
                            ephemeral: true,
                        });
                        return;
                    }

                    if (!member.roles.cache.has(highstaff)) {
                        await i.editReply({
                            content: `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر. تـحـتـاج رتـبـه <@&${highstaff}>.`,
                            ephemeral: true,
                        });
                        return;
                    }

                    // جلب قائمة المتاجر المعطلة من قاعدة البيانات
                    const shops = await db.all();
                    const shopChannels = shops.filter(
                        (entry) =>
                            entry.id.startsWith(`shop_`) && entry.value.status === "0",
                    );

                    if (shopChannels.length === 0) {
                        await i.editReply(
                            "**لا تـوجـد مـتـاجـر مـعـطـلـة لـتـفـعـيـلـهـا.**",
                        );
                        return;
                    }

                    const confirmButton = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId("confirm-activate-all")
                            .setLabel("تـأكـيـد الـتـفـعـيـل")
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji(emojis.confirm),
                    );

                    const confirmContainer = buildContainer({
                        title: "تـأكـيـد تـفـعـيـل الـمـتـاجـر",
                        description: ED.commandsD_011({ shopChannels }),
                        footer: D.footer(i.guild),
                        thumbnail: D.thumb(i.guild),
                    });

                    await editReplyContainer(i, confirmContainer, { rows: [confirmButton] });

                    const filter = (interaction) =>
                        interaction.customId === "confirm-activate-all" &&
                        interaction.user.id === i.user.id;
                    const collector = i.channel.createMessageComponentCollector({
                        filter,
                        time: 60000,
                    });

                    collector.on("collect", async (buttonInteraction) => {
                        await buttonInteraction.deferUpdate();

                        // تعطيل الزر بعد الضغط عليه
                        const disabledButton = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId("confirm-activate-all")
                                .setLabel("تـأكـيـد الـتـفـعـيـل")
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(true)
                                .setEmoji(emojis.confirm),
                        );

                        await editReplyContainer(i, confirmContainer, { rows: [disabledButton] });

                        const imageUrl = await db.get(`image_${guildId}`);
                        const logChannelId = await db.get(`logs_${guildId}`);
                        const logChannel = logChannelId
                            ? await i.guild.channels.fetch(logChannelId).catch(() => null)
                            : null;

                        let activatedCount = 0;

                        for (const shop of shopChannels) {
                            const channelId = shop.id.split("_")[1]; // استخراج ID القناة
                            const channel = await i.guild.channels
                                .fetch(channelId)
                                .catch(() => null);
                            if (!channel) continue;

                            // تفعيل القناة بجعلها مرئية
                            await channel.permissionOverwrites.edit(i.guild.roles.everyone, {
                                ViewChannel: true,
                            });

                            // إرسال رسالة التفعيل في القناة
                            const activateContainer = buildContainer({
                                title: "تـم تـفـعـيـل الـمـتـجـر",
                                description: ED.commandsD_012(),
                                footer: D.footer(i.guild),
                                thumbnail: D.thumb(i.guild),
                                image: imageUrl || null,
                            });
                            await sendContainer(channel, activateContainer).catch(() => {});

                            // تحديث حالة المتجر في قاعدة البيانات
                            await db.set(shop.id, { ...shop.value, status: "1" });

                            // إرسال اللوج
                            if (logChannel) {
                                const activateLogContainer = buildContainer({
                                    title: "تـم تـفـعـيـل مـتـجـر",
                                    description: ED.commandsD_013({ i }),
                                    fields: [{ name: "الـمـتـجـر :", value: `<#${channel.id}>` }],
                                    footer: D.footer(i.guild),
                                    thumbnail: D.thumb(i.guild),
                                    image: imageUrl || null,
                                });
                                await sendContainer(logChannel, activateLogContainer).catch(() => {});
                            }

                            activatedCount++;
                        }

                        await i.editReply({
                            content: `**تـم تـفـعـيـل جـمـيـع الـمـتـاجـر بـنـجـاح (${activatedCount}) مـتـجـر.**`,
                            components: [],
                        });

                        collector.stop();
                    });

                    collector.on("end", (collected) => {
                        if (!collected.size) {
                            i.editReply({
                                content: "**تـم إلـغـاء الإجـراء بـسـبـب عـدم الـتـأكـيـد.**",
                                components: [],
                            }).catch(() => {});
                        }
                    });
                }
                break;
            case "disable":
                {
                    const blacklist = (await db.get("blacklist")) || [];
                    if (blacklist.includes(i.user.id)) {
                        return i.reply(
                            "**أنـت فـي الـبـلاك لـسـت، لـمـعـلـومـات أكـثـر تـعـال سـيـرفـر الـسـبـورت!**",
                        );
                    }
                    await i.deferReply({ ephemeral: true });

                    const shop = i.options.getChannel("shop");
                    const reason = i.options.getString("reason");
                    const guildId = i.guild.id;
                    const { member } = i;
                    const admins = await db.get(`shopad_${guildId}`);

                    if (!admins) {
                        await i.editReply({
                            content:
                                "يـرجـى تـحـديـد الادمـن عـن طـريـق اسـتـخـدام الامـر الاتـي: /setup",
                        });
                        return;
                    }

                    if (!member.roles.cache.has(admins)) {
                        await i.editReply(
                            `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر تـحـتـاج رتـبـه <@&${admins}>`,
                        );
                        return;
                    }

                    const datap = await db.get(`shop_${shop.id}_${guildId}`);
                    if (!datap) {
                        await i.editReply("**هـذا الـروم لـيـس مـتـجـر**");
                        return;
                    }

                    const iiff = await i.guild.channels.fetch(shop.id);

                    if (datap.status === "0") {
                        await i.editReply("**هـذا الـروم مـعـطـل بـالـفـعـل**");
                        return;
                    }

                    if (datap.status === "1") {
                        await iiff.permissionOverwrites.edit(i.guild.roles.everyone, {
                            ViewChannel: false,
                        });

                        // استرجاع رابط الصورة من قاعدة البيانات
                        const imageUrl = await db.get(`image_${guildId}`);

                        const disableContainer = buildContainer({
                            title: `تـم تـعـطـيـل الـمـتـجـر`,
                            description: ED.commandsD_014({ i }),
                            fields: [{ name: "الـسـبـب", value: reason }],
                            footer: D.footer(i.guild),
                            thumbnail: D.thumb(i.guild),
                            image: imageUrl || null,
                            mention: `<@${datap.sellerId}>`,
                        });
                        // ✅ إصلاح: كان الإرسال هنا بدون await، يعني الكود
                        // يكمل وينهي الأمر بدون ما ينتظر تأكيد إن الرسالة
                        // فعلاً انرسلت (احتمال يفشل الإرسال بصمت).
                        await sendContainer(iiff, disableContainer);
                        await i.editReply("**تـم تـعـطـيـل الـمـتـجـر بـنـجـاح**");

                        const disableLogContainer = buildContainer({
                            title: `تـم تـعـطـيـل مـتـجـر`,
                            description: ED.commandsD_015({ i }),
                            fields: [
                                { name: "الـمـتـجـر", value: `<#${shop.id}>` },
                                { name: "الـسـبـب", value: reason },
                            ],
                            footer: D.footer(i.guild),
                            thumbnail: D.thumb(i.guild),
                            image: imageUrl || config.line || null,
                        });

                        // ✅ نفس إصلاح "active": تحقق من وجود روم السجلات
                        // قبل .fetch() وأضفنا .catch() لتجنب الكراش.
                        const channelToSendId = await db.get(`logs_${guildId}`);
                        if (channelToSendId) {
                            const channelToSend = await i.guild.channels
                                .fetch(channelToSendId)
                                .catch(() => null);
                            if (channelToSend) {
                                await sendContainer(channelToSend, disableLogContainer).catch(() => {});
                            }
                        }
                        await editReplyContainer(i, disableLogContainer);
                        await db.set(`shop_${shop.id}_${guildId}.status`, "0");
                    }
                }
                break;
            case "disable-all":
                {
                    const blacklist = (await db.get("blacklist")) || [];
                    if (blacklist.includes(i.user.id)) {
                        return i.reply(
                            "**أنـت فـي الـبـلاك لـسـت، لـمـعـلـومـات أكـثـر تـعـال سـيـرفـر الـسـبـورت!**",
                        );
                    }

                    await i.deferReply({ ephemeral: true });

                    const guild = i.guild;
                    const { member } = i;
                    const highstaff = await db.get(`highstaff_${guildId}`);
                    if (!highstaff) {
                        await i.editReply({
                            content:
                                "يـرجـى تـحـديـد رتـبـة الـعـلـيـا (highstaff) عـن طـريـق اسـتـخـدام الامـر الاتـي: /setup",
                            ephemeral: true,
                        });
                        return;
                    }

                    if (!member.roles.cache.has(highstaff)) {
                        await i.editReply({
                            content: `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر. تـحـتـاج رتـبـه <@&${highstaff}>.`,
                            ephemeral: true, // إذا أردت أن تكون الرسالة مرئية فقط للعضو
                        });
                        return;
                    }

                    const categories = guild.channels.cache.filter(
                        (channel) => channel.type === ChannelType.GuildCategory,
                    );
                    if (!categories.size) {
                        await i.editReply(
                            "**لا يـوجـد كـاتـيـجـور   فـي هـذا الـسـيـرفـر**",
                        );
                        return;
                    }

                    const confirmButton = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId("confirm-disable-all")
                            .setLabel("تـأكـيـد الـتـعـطـيـل")
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji(emojis.pause),
                    );

                    const confirmContainer = buildContainer({
                        title: "تـأكـيـد تـعـطـيـل جـمـيـع الـمـتـاجـر",
                        description: ED.commandsD_016(),
                        footer: D.footer(i.guild),
                        thumbnail: D.thumb(i.guild),
                    });

                    await editReplyContainer(i, confirmContainer, { rows: [confirmButton] });

                    const filter = (interaction) =>
                        interaction.customId === "confirm-disable-all" &&
                        interaction.user.id === i.user.id;
                    const collector = i.channel.createMessageComponentCollector({
                        filter,
                        time: 60000,
                    });

                    collector.on("collect", async (buttonInteraction) => {
                        await buttonInteraction.deferUpdate();

                        const disabledButton = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId("confirm-disable-all")
                                .setLabel("تـأكـيـد الـتـعـطـيـل")
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(true)
                                .setEmoji(emojis.pause),
                        );
                        // تحديث الرسالة لتعطيل الزر
                        await editReplyContainer(i, confirmContainer, { rows: [disabledButton] });

                        const imageUrl = await db.get(`image_${guild.id}`);
                        let disabledCount = 0;

                        for (const [categoryId, category] of categories) {
                            const channels = category.children.cache;

                            for (const [channelId, channel] of channels) {
                                const channelDataKey = `shop_${channel.id}_${guild.id}`;
                                const channelData = await db.get(channelDataKey);

                                if (channelData && channelData.status === "1") {
                                    await channel.permissionOverwrites.edit(
                                        guild.roles.everyone,
                                        {
                                            ViewChannel: false,
                                        },
                                    );

                                    const disableAllContainer = buildContainer({
                                        title: `تـم تـعـطـيـل جـمـيـع الـمـتـاجـر`,
                                        description: ED.commandsD_017({ i }),
                                        footer: D.footer(i.guild),
                                        thumbnail: D.thumb(i.guild),
                                        image: imageUrl || config.line || null,
                                    });

                                    await sendContainer(channel, disableAllContainer).catch(() => {});

                                    await db.set(`${channelDataKey}.status`, "0");
                                    disabledCount++;
                                }
                            }
                        }

                        await i.editReply({
                            content: `**تـم تـعـطـيـل ${disabledCount} مـتـجـر بـنـجـاح وإرسـال إشـعـار لـلـجـمـيـع**`,
                            components: [],
                        });

                        collector.stop();
                    });

                    collector.on("end", (collected) => {
                        if (!collected.size) {
                            i.editReply({
                                content: "**تـم إلـغـاء الإجـراء بـسـبـب عـدم الـتـأكـيـد.**",
                                components: [],
                            }).catch(() => {});
                        }
                    });
                }
                break;
            case "tax-time":
                {
                    const blacklist = (await db.get("blacklist")) || [];
                    if (blacklist.includes(i.user.id)) {
                        return i.reply(
                            "**أنـت فـي الـبـلاك لـسـت، لـمـعـلـومـات أكـثـر تـعـال سـيـرفـر الـسـبـورت!**",
                        );
                    }
                    await i.deferReply({ ephemeral: true });
                    const guild = i.guild;
                    const { member } = i;
                    const highstaff = await db.get(`highstaff_${guildId}`);
                    if (!highstaff) {
                        await i.editReply({
                            content:
                                "يـرجـى تـحـديـد رتـبـة الـعـلـيـا (highstaff) عـن طـريـق اسـتـخـدام الامـر الاتـي: /setup",
                            ephemeral: true,
                        });
                        return;
                    }

                    if (!member.roles.cache.has(highstaff)) {
                        await i.editReply({
                            content: `لـيـس لـديـك صـلاحـيـة لإسـتـخـدام هـذا الأمـر. تـحـتـاج رتـبـه <@&${highstaff}>.`,
                            ephemeral: true, // إذا أردت أن تكون الرسالة مرئية فقط للعضو
                        });
                        return;
                    }
                    const categories = guild.channels.cache.filter(
                        (channel) => channel.type === ChannelType.GuildCategory,
                    );
                    if (!categories.size) {
                        await i.editReply(
                            "**لا يـوجـد كـاتـيـجـوري فـي هـذا الـسـيـرفـر**",
                        );
                        return;
                    }
                    const confirmButton = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId("confirm-tax")
                            .setLabel("تـأكـيـد ارسـال ضـريـبـة الـمـتـاجـر")
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji(emojis.tax),
                    );
                    const confirmContainer = buildContainer({
                        title: "تـأكـيـد ارسـال ضـريـبـة الـمـتـاجـر",
                        description: ED.commandsD_018(),
                        footer: D.footer(i.guild),
                        thumbnail: D.thumb(i.guild),
                        color: _ec.color(i.guild?.id),
                    });
                    await editReplyContainer(i, confirmContainer, { rows: [confirmButton] });
                    const filter = (interaction) =>
                        interaction.customId === "confirm-tax" &&
                        interaction.user.id === i.user.id;

                    const collector = i.channel.createMessageComponentCollector({
                        filter,
                        time: 60000,
                    });
                    collector.on("collect", async (buttonInteraction) => {
                        await buttonInteraction.deferUpdate();

                        const disabledButton = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId("confirm-tax")
                                .setLabel("تـأكـيـد ارسـال ضـريـبـة الـمـتـاجـر")
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(true)
                                .setEmoji(emojis.tax),
                        );

                        // تحديث الرسالة لتعطيل الزر
                        await editReplyContainer(i, confirmContainer, { rows: [disabledButton] });

                        const imageUrl = await db.get(`image_${guild.id}`);
                        let disabledCount = 0;
                        for (const [categoryId, category] of categories) {
                            const channels = category.children.cache;
                            for (const [channelId, channel] of channels) {
                                const channelDataKey = `shop_${channel.id}_${guild.id}`;
                                const channelData = await db.get(channelDataKey);
                                // Check if tax is enabled for the category
                                const hasTax = await db.get(
                                    `shop_${channel.id}_${guild.id}.hasTax`,
                                );
                                const taxPrice = await db.get(
                                    `shop_${channel.id}_${guild.id}.taxPrice`,
                                );
                                const owner = await db.get(
                                    `shop_${channel.id}_${guild.id}.sellerId`,
                                );
                                if (channelData && channelData.status === "1" && hasTax) {
                                    await channel.permissionOverwrites.edit(
                                        guild.roles.everyone,
                                        {
                                            ViewChannel: false,
                                        },
                                    );
                                    // ✅ إصلاح: لو المتجر بدون صاحب مسجل (owner
                                    // فاضي)، كان permissionOverwrites.edit(undefined, ...)
                                    // يرمي خطأ ويوقف الحلقة كاملة على باقي
                                    // المتاجر. صار الآن يتخطى منح الصلاحية
                                    // الخاصة بالمالك فقط لو ما فيه مالك، ويكمل
                                    // الباقي بشكل طبيعي.
                                    if (owner) {
                                        await channel.permissionOverwrites
                                            .edit(owner, {
                                                ViewChannel: true,
                                                SendMessages: true,
                                                AddReactions: true,
                                                AttachFiles: true,
                                                EmbedLinks: true,
                                                UseExternalEmojis: true,
                                                ReadMessageHistory: true,
                                            })
                                            .catch(() => {});
                                    }
                                    // Prepare embed for the tax notification
                                    const buytax = new ActionRowBuilder().addComponents(
                                        new ButtonBuilder()
                                            .setCustomId("buy-tax")
                                            .setLabel("دفـع الـضـريـبـة")
                                            .setStyle(ButtonStyle.Primary)
                                            .setEmoji(emojis.payTax),
                                    );
                                    const taxContainer = buildContainer({
                                        title: `حـان وقـت الـضـريـبـة!`,
                                        description: ED.commandsD_019({ taxPrice }),
                                        footer: D.footer(i.guild),
                                        thumbnail: D.thumb(i.guild),
                                        image: imageUrl || null,
                                        mention: owner ? `<@${owner}>` : null,
                                    });
                                    await sendContainer(channel, taxContainer, [buytax]).catch(() => {});
                                    await db.set(`${channelDataKey}.status`, "0");
                                    disabledCount++;
                                }
                            }
                        }
                        await i.editReply({
                            content: `**تـم تـفـعـيـل وضـع الـضـريـبـه ${disabledCount} مـتـجـر بـنـجـاح وإرسـال إشـعـار لـلـجـمـيـع**`,
                            components: [],
                        });
                        collector.stop();
                    });
                    collector.on("end", (collected) => {
                        if (!collected.size) {
                            i.editReply({
                                content: "**تـم إلـغـاء الإجـراء بـسـبـب عـدم الـتـأكـيـد.**",
                                components: [],
                            }).catch(() => {});
                        }
                    });
                }
                break;
            case "say-emabed":
                {
                    const blacklist = (await db.get("blacklist")) || [];
                    if (blacklist.includes(i.user.id)) {
                        return i.reply(
                            "**أنـت فـي الـبـلاك لـسـت، لـمـعـلـومـات أكـثـر تـعـال سـيـرفـر الـسـبـورت!**",
                        );
                    }
                    const { member } = i;
                    const highstaff = await db.get(`highstaff_${guildId}`);
                    if (!highstaff) {
                        await i.reply({
                            content:
                                "يـرجـى تـحـديـد رتـبـة الـعـلـيـا (highstaff) عـن طـريـق اسـتـخـدام الامـر الاتـي: /setup",
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
                    const ch = i.options.getChannel("room");
                    const targetChannel = ch ?? i.channel;
                    const title = i.options.getString(`title`);
                    const msg = i.options.getString(`msg`);
                    const im = i.options.getString(`image`);
                    const guild = i.guild;
                    const serverName = guild.name;
                    const serverIcon = guild.iconURL();

                    const sayContainer = buildContainer({
                        title: title || `${serverName}`,
                        description: ED.commandsD_020({ msg }),
                        color: _ec.color(i.guild?.id),
                        thumbnail: serverIcon,
                        image: im || null,
                        footer: { text: `by ${i.user.tag}` },
                    });

                    await sendContainer(targetChannel, sayContainer);

                    i.reply({ content: "** Done ✅ **", ephemeral: true });
                }
                break;
            case "server-info":
                {
                    const blacklist = (await db.get("blacklist")) || [];
                    if (blacklist.includes(i.user.id)) {
                        return i.reply(
                            "**أنـت فـي الـبـلاك لـسـت، لـمـعـلـومـات أكـثـر تـعـال سـيـرفـر الـسـبـورت!**",
                        );
                    }
                    const guildId = i.guild.id;
                    if (!i.member.permissions.has("Administrator")) {
                        return i.reply({
                            content:
                                "❌ يـجـب أن تـكـون لـديـك صـلاحـيـة **Administrator** لاسـتـخـدام هـذا الأمـر!",
                            ephemeral: true,
                        });
                    }
                    // استرجاع القيم من قاعدة البيانات
                    const imageUrl = await db.get(`image_${guildId}`);
                    const logs = await db.get(`logs_${guildId}`);
                    const orderRoom = await db.get(`orderroom_${guildId}`);
                    const actionRoom = await db.get(`auctionroom_${guildId}`);
                    const shopcat = await db.get(`catbuy_shop_${guildId}`);
                    const auctioncat = await db.get(`catbuy_auction_${guildId}`);
                    const ordercat = await db.get(`catbuy_order_${guildId}`);
                    const shopAdmin = await db.get(`shopad_${guildId}`);
                    const orderAdmin = await db.get(`orderad_${guildId}`);
                    const auctionAdmin = await db.get(`auctionad_${guildId}`);
                    const bank = await db.get(`bank_${guildId}`);
                    const highstaff = await db.get(`highstaff_${guildId}`);

                    const infoLines = [
                        fieldLine("روم لـوق الـمـتـاجـر", logs ? `<#${logs}>` : null),
                        fieldLine("روم الـطـلـبـات", orderRoom ? `<#${orderRoom}>` : null),
                        fieldLine("روم الـمـزادات", actionRoom ? `<#${actionRoom}>` : null),
                        fieldLine("كـتـاغـوري تـكـتـات شـراء مـتـاجـر", shopcat ? `<#${shopcat}>` : null),
                        fieldLine("كـتـاغـوري تـكـتـات شـراء مـزاد", auctioncat ? `<#${auctioncat}>` : null),
                        fieldLine("كـتـاغـوري تـكـتـات شـراء طـلـبـات", ordercat ? `<#${ordercat}>` : null),
                        fieldLine("مـسـؤول الـمـتـاجـر", shopAdmin ? `<@&${shopAdmin}>` : null),
                        fieldLine("مـسـؤول الـطـلـبـات", orderAdmin ? `<@&${orderAdmin}>` : null),
                        fieldLine("مـسـؤول الـمـزاد", auctionAdmin ? `<@&${auctionAdmin}>` : null),
                        fieldLine("بـنـك الـسـيـرفـر", bank ? `<@${bank}>` : null),
                        fieldLine("رتـبـة الـعـلـيـا", highstaff ? `<@&${highstaff}>` : null),
                    ];

                    const infoContainer = buildContainer({
                        title: "مـعـلـومـات الـسـيـرفـر",
                        description: infoLines.join("\n"),
                        footer: "مـعـلـومـات الـسـيـرفـر",
                        color: _ec.color(guildId),
                        image: imageUrl || config.line || null,
                    });

                    await replyContainer(i, infoContainer);
                }
                break;
            case "setup":
                {
                    const blacklist = (await db.get("blacklist")) || [];
                    if (blacklist.includes(i.user.id)) {
                        return i.reply(
                            "**أنـت فـي الـبـلاك لـسـت، لـمـعـلـومـات أكـثـر تـعـال سـيـرفـر الـسـبـورت!**",
                        );
                    }
                    if (!i.member.permissions.has("Administrator")) {
                        return i.reply({
                            content:
                                "❌ يـجـب أن تـكـون لـديـك صـلاحـيـة **Administrator** لاسـتـخـدام هـذا الأمـر!",
                            ephemeral: true,
                        });
                    }
                    const guildId = i.guild.id;

                    // ✅ إصلاح: كل db.set() هنا كانت بدون await، يعني الكود
                    // يكمل ويقرأ القيم فوراً بعدها (عبر db.get) بدون أي ضمان
                    // إن الكتابة خلصت فعلاً — سباق (race condition) ممكن
                    // يخلي إمبد التأكيد يعرض "غير محدد" لقيم فعلياً انحفظت.
                    // أضفنا await لكل واحدة.
                    if (i.options.getChannel("logs"))
                        await db.set(`logs_${guildId}`, i.options.getChannel("logs").id);
                    if (i.options.getChannel("order-room"))
                        await db.set(
                            `orderroom_${guildId}`,
                            i.options.getChannel("order-room").id,
                        );
                    if (i.options.getChannel("action-room"))
                        await db.set(
                            `auctionroom_${guildId}`,
                            i.options.getChannel("action-room").id,
                        );
                    if (i.options.getChannel("buy-shop-tickets"))
                        await db.set(
                            `catbuy_shop_${guildId}`,
                            i.options.getChannel("buy-shop-tickets").id,
                        );
                    if (i.options.getChannel("buy-auction-tickets"))
                        await db.set(
                            `catbuy_auction_${guildId}`,
                            i.options.getChannel("buy-auction-tickets").id,
                        );
                    if (i.options.getChannel("buy-order-tickets"))
                        await db.set(
                            `catbuy_order_${guildId}`,
                            i.options.getChannel("buy-order-tickets").id,
                        );
                    if (i.options.getRole("high-staff"))
                        await db.set(`highstaff_${guildId}`, i.options.getRole("high-staff").id);
                    if (i.options.getRole("shop-admin"))
                        await db.set(`shopad_${guildId}`, i.options.getRole("shop-admin").id);
                    if (i.options.getRole("order-admin"))
                        await db.set(`orderad_${guildId}`, i.options.getRole("order-admin").id);
                    if (i.options.getRole("order-mention-role"))
                        await db.set(
                            `order-mentionrole_${guildId}`,
                            i.options.getRole("order-mention-role").id,
                        );
                    if (i.options.getString("embed-color")) {
                        const raw = i.options
                            .getString("embed-color")
                            .trim()
                            .replace("#", "0x");
                        await db.set(`embed_color_${guildId}`, raw);
                        try {
                            require("./embedColor").setGuildColor(guildId, raw);
                        } catch {}
                    }
                    if (i.options.getRole("auction-admin"))
                        await db.set(
                            `auctionad_${guildId}`,
                            i.options.getRole("auction-admin").id,
                        );
                    if (i.options.getRole("auction-mzad-role"))
                        await db.set(
                            `auctionmzadrole_${guildId}`,
                            i.options.getRole("auction-mzad-role").id,
                        );
                    if (i.options.getUser("bank"))
                        await db.set(`bank_${guildId}`, i.options.getUser("bank").id);
                    if (i.options.getChannel("buy-roles-tickets"))
                        await db.set(
                            `roles_cat_${guildId}`,
                            i.options.getChannel("buy-roles-tickets").id,
                        );
                    if (i.options.getRole("roles-admin"))
                        await db.set(
                            `roles_admin_${guildId}`,
                            i.options.getRole("roles-admin").id,
                        );
                    if (i.options.getChannel("support-category"))
                        await db.set(
                            `support_cat_${guildId}`,
                            i.options.getChannel("support-category").id,
                        );
                    if (i.options.getRole("support-admin"))
                        await db.set(
                            `support_admin_${guildId}`,
                            i.options.getRole("support-admin").id,
                        );
                    if (i.options.getRole("scam-admin"))
                        await db.set(`scam_admin_${guildId}`, i.options.getRole("scam-admin").id);
                    if (i.options.getChannel("scam-room"))
                        await db.set(
                            `scam_room_${guildId}`,
                            i.options.getChannel("scam-room").id,
                        );
                    if (i.options.getChannel("commands-room"))
                        await db.set(
                            `commandsRoom_${guildId}`,
                            i.options.getChannel("commands-room").id,
                        );
                    if (i.options.getChannel("rating-channel"))
                        await db.set(
                            `rating_ch_${guildId}`,
                            i.options.getChannel("rating-channel").id,
                        );

                    // استلام الصورة الرمزية إذا تم تحديدها
                    const imageAttachment = i.options.getAttachment("line");
                    if (imageAttachment) await db.set(`image_${guildId}`, imageAttachment.url);
                    const imageUrl = await db.get(`image_${guildId}`);
                    const logs = await db.get(`logs_${guildId}`);
                    const orderRoom = await db.get(`orderroom_${guildId}`);
                    const actionRoom = await db.get(`auctionroom_${guildId}`);
                    const shopcat = await db.get(`catbuy_shop_${guildId}`);
                    const auctioncat = await db.get(`catbuy_auction_${guildId}`);
                    const ordercat = await db.get(`catbuy_order_${guildId}`);
                    const shopAdmin = await db.get(`shopad_${guildId}`);
                    const orderAdmin = await db.get(`orderad_${guildId}`);
                    const auctionAdmin = await db.get(`auctionad_${guildId}`);
                    const auctionMzadRole = await db.get(`auctionmzadrole_${guildId}`);
                    const bank = await db.get(`bank_${guildId}`);
                    const highstaff = await db.get(`highstaff_${guildId}`);
                    const rolesCat = await db.get(`roles_cat_${guildId}`);
                    const rolesAdmin = await db.get(`roles_admin_${guildId}`);
                    const supportCat = await db.get(`support_cat_${guildId}`);
                    const supportAdmin = await db.get(`support_admin_${guildId}`);
                    const scamAdmin = await db.get(`scam_admin_${guildId}`);
                    const scamRoom = await db.get(`scam_room_${guildId}`);
                    const commandsRoom = await db.get(`commandsRoom_${guildId}`);
                    const ratingCh = await db.get(`rating_ch_${guildId}`);

                    const setupContainer = new ContainerBuilder()
                        .setAccentColor(_ec.color(guildId))
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`# الإعـدادات الـتـي تـم تـحـديـدهـا`),
                        )
                        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                [
                                    fieldLine("روم لـوق الـمـتـاجـر", logs ? `<#${logs}>` : null),
                                    fieldLine("روم الـطـلـبـات", orderRoom ? `<#${orderRoom}>` : null),
                                    fieldLine("روم الـمـزادات", actionRoom ? `<#${actionRoom}>` : null),
                                ].join("\n"),
                            ),
                            new TextDisplayBuilder().setContent(
                                [
                                    fieldLine("كـتـاغـوري تـكـتـات شـراء مـتـاجـر", shopcat ? `<#${shopcat}>` : null),
                                    fieldLine("كـتـاغـوري تـكـتـات شـراء مـزاد", auctioncat ? `<#${auctioncat}>` : null),
                                    fieldLine("كـتـاغـوري تـكـتـات شـراء طـلـبـات", ordercat ? `<#${ordercat}>` : null),
                                    fieldLine("كـتـاغـوري تـكـتـات شـراء رتـب", rolesCat ? `<#${rolesCat}>` : null),
                                    fieldLine("كـتـاغـوري تـكـتـات الـدعـم والـتـشـهـيـر", supportCat ? `<#${supportCat}>` : null),
                                ].join("\n"),
                            ),
                            new TextDisplayBuilder().setContent(
                                [
                                    fieldLine("مـسـؤول الـمـتـاجـر", shopAdmin ? `<@&${shopAdmin}>` : null),
                                    fieldLine("مـسـؤول الـطـلـبـات", orderAdmin ? `<@&${orderAdmin}>` : null),
                                    fieldLine("مـسـؤول الـمـزاد", auctionAdmin ? `<@&${auctionAdmin}>` : null),
                                    fieldLine("مـسـؤول شـراء الـرتـب", rolesAdmin ? `<@&${rolesAdmin}>` : null),
                                    fieldLine("مـسـؤول الـدعـم الـفـنـي", supportAdmin ? `<@&${supportAdmin}>` : null),
                                    fieldLine("مـسـؤول الـتـشـهـيـر", scamAdmin ? `<@&${scamAdmin}>` : null),
                                ].join("\n"),
                            ),
                            new TextDisplayBuilder().setContent(
                                [
                                    fieldLine("روم نـشـر الـتـشـهـيـر", scamRoom ? `<#${scamRoom}>` : null),
                                    fieldLine("رول مـنـشـن مـزاد", auctionMzadRole ? `<@&${auctionMzadRole}>` : null),
                                    fieldLine("بـنـك الـسـيـرفـر", bank ? `<@${bank}>` : null),
                                    fieldLine("رتـبـة الـعـلـيـا", highstaff ? `<@&${highstaff}>` : null),
                                    fieldLine("روم الأوامـر", commandsRoom ? `<#${commandsRoom}>` : null),
                                    fieldLine("روم تـقـيـيـمـات الـتـكـتـات", ratingCh ? `<#${ratingCh}>` : null),
                                ].join("\n"),
                            ),
                        );

                    if (imageUrl) {
                        setupContainer.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
                        setupContainer.addMediaGalleryComponents(
                            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl)),
                        );
                    }

                    await i.reply({
                        components: [setupContainer],
                        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                    });
                }
                break;

            // ============ add-roles ============
            case "add-roles":
                {
                    if (!i.member.permissions.has("Administrator")) {
                        return i.reply({
                            content: "❌ يـجـب أن تـكـون لـديـك صـلاحـيـة **Administrator**!",
                            ephemeral: true,
                        });
                    }
                    const role = i.options.getRole("role");
                    const price = i.options.getInteger("price");
                    const benefits = i.options.getString("benefits");
                    let roles = (await db.get(`buy_roles_${guildId}`)) || [];
                    if (roles.length >= 5) {
                        return i.reply({
                            content:
                                "**❌ وصـلـت الـحـد الأقـصـى (5 رتـب). احـذف رتـبـة قـبـل الإضـافـة.**",
                            ephemeral: true,
                        });
                    }
                    if (roles.find((r) => r.roleId === role.id)) {
                        return i.reply({
                            content: `**❌ الـرتـبـة ${role} مـوجـودة بـالـفـعـل فـي الـقـائـمـة.**`,
                            ephemeral: true,
                        });
                    }
                    roles.push({ roleId: role.id, name: role.name, price, benefits });
                    await db.set(`buy_roles_${guildId}`, roles);

                    const addRoleContainer = buildContainer({
                        title: "✅ تـمـت إضـافـة الـرتـبـة",
                        fields: [
                            { name: " الـرتـبـة", value: `${role}` },
                            { name: " الـسـعـر", value: `${price}` },
                            { name: " الـمـمـيـزات", value: benefits },
                        ],
                        color: _ec.color(i.guild?.id),
                    });
                    await replyContainer(i, addRoleContainer, { ephemeral: true });
                }
                break;

            // ============ remove-roles ============
            case "remove-roles":
                {
                    if (!i.member.permissions.has("Administrator")) {
                        return i.reply({
                            content: "❌ يـجـب أن تـكـون لـديـك صـلاحـيـة **Administrator**!",
                            ephemeral: true,
                        });
                    }
                    const roles = (await db.get(`buy_roles_${guildId}`)) || [];
                    if (roles.length === 0) {
                        return i.reply({
                            content: "**❌ لا تـوجـد رتـب مـضـافـة.**",
                            ephemeral: true,
                        });
                    }
                    const menu = new StringSelectMenuBuilder()
                        .setCustomId(`roles_delete_select_${guildId}`)
                        .setPlaceholder("اخـتـر الـرتـبـة الـتـي تـريـد حـذفـهـا")
                        .addOptions(
                            roles.map((r) => ({
                                label: r.name,
                                description: `الـسـعـر: ${r.price}`,
                                value: r.roleId,
                            })),
                        );
                    await i.reply({
                        content: "**اخـتـر الـرتـبـة لـلـحـذف:**",
                        components: [new ActionRowBuilder().addComponents(menu)],
                        ephemeral: true,
                    });
                }
                break;

            // ============ list-roles ============
            case "list-roles":
                {
                    const roles = (await db.get(`buy_roles_${guildId}`)) || [];
                    if (roles.length === 0) {
                        return i.reply({
                            content: "**❌ لا تـوجـد رتـب مـضـافـة بـعـد.**",
                            ephemeral: true,
                        });
                    }
                    const listRolesContainer = buildContainer({
                        title: " قـائـمـة الـرتـب الـمـتـاحـة لـلـشـراء",
                        description: ED.commandsD_021({ roles }),
                        color: _ec.color(i.guild?.id),
                    });
                    const delBtn = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`roles_delete_panel_${guildId}`)
                            .setLabel("حـذف رتـبـة")
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji(emojis.delete),
                    );
                    const buyBtn = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId("ticket-roles")
                            .setLabel("شـراء رتـبـة")
                            .setStyle(ButtonStyle.Success)
                            .setEmoji(emojis.ticketRoles),
                    );
                    await replyContainer(i, listRolesContainer, { rows: [delBtn, buyBtn] });
                }
                break;
            case "setup-prices":
                {
                    // ✅ هذا الجزء مبني أصلاً بـ Components V2 من قبل، ما لمسناه.
                    const blacklist = (await db.get("blacklist")) || [];
                    if (blacklist.includes(i.user.id)) {
                        return i.reply(
                            "**أنـت فـي الـبـلاك لـسـت، لـمـعـلـومـات أكـثـر تـعـال سـيـرفـر الـسـبـورت!**",
                        );
                    }
                    if (!i.member.permissions.has("Administrator")) {
                        return i.reply({
                            content:
                                "❌ يـجـب أن تـكـون لـديـك صـلاحـيـة **Administrator** لاسـتـخـدام هـذا الأمـر!",
                            ephemeral: true,
                        });
                    }

                    const guildId = i.guild.id;

                    if (i.options.getInteger("remove-warn-credit"))
                        db.set(`removewarncredit_${guildId}`, i.options.getInteger("remove-warn-credit"));
                    if (i.options.getInteger("change-partners-credit"))
                        db.set(`changepartnerscredit_${guildId}`, i.options.getInteger("change-partners-credit"));
                    if (i.options.getInteger("everyone-price"))
                        db.set(`evrypri_${guildId}`, i.options.getInteger("everyone-price"));
                    if (i.options.getInteger("here-price"))
                        db.set(`herepri_${guildId}`, i.options.getInteger("here-price"));
                    if (i.options.getInteger("shop-mention-price"))
                        db.set(`shopprice_${guildId}`, i.options.getInteger("shop-mention-price"));
                    if (i.options.getInteger("order-every-price-credit"))
                        db.set(`order-evrypri_${guildId}`, i.options.getInteger("order-every-price-credit"));
                    if (i.options.getInteger("order-here-price-credit"))
                        db.set(`order-herepri_${guildId}`, i.options.getInteger("order-here-price-credit"));
                    if (i.options.getInteger("order-order-price-credit"))
                        db.set(`order-orderpri_${guildId}`, i.options.getInteger("order-order-price-credit"));
                    if (i.options.getInteger("auction-every-price-credit"))
                        db.set(`auction-evrypri_${guildId}`, i.options.getInteger("auction-every-price-credit"));
                    if (i.options.getInteger("auction-here-price-credit"))
                        db.set(`auction-herepri_${guildId}`, i.options.getInteger("auction-here-price-credit"));
                    if (i.options.getInteger("auction-mzad-price-credit"))
                        db.set(`auction-mzadpri_${guildId}`, i.options.getInteger("auction-mzad-price-credit"));
                    if (i.options.getInteger("change-name"))
                        db.set(`changename_${guildId}`, i.options.getInteger("change-name"));
                    if (i.options.getInteger("change-owner"))
                        db.set(`changeowner_${guildId}`, i.options.getInteger("change-owner"));
                    if (i.options.getInteger("auto-message"))
                        db.set(`automessage_${guildId}`, i.options.getInteger("auto-message"));
                    if (i.options.getInteger("change-shape"))
                        db.set(`changeshape_${guildId}`, i.options.getInteger("change-shape"));
                    if (i.options.getInteger("change-type-price"))
                        db.set(`changetypeprice_${guildId}`, i.options.getInteger("change-type-price"));
                    if (i.options.getInteger("shop-vacation"))
                        db.set(`shopvacation_${guildId}`, i.options.getInteger("shop-vacation"));
                    if (i.options.getInteger("disable-auto-price"))
                        db.set(`disableauto_${guildId}`, i.options.getInteger("disable-auto-price"));
                    if (i.options.getInteger("activate-shop-price"))
                        db.set(`activateshopprice_${guildId}`, i.options.getInteger("activate-shop-price"));
                    if (i.options.getInteger("sell-shop-price"))
                        db.set(`sellshopprice_${guildId}`, i.options.getInteger("sell-shop-price"));

                    const removeWarnCredit = await db.get(`removewarncredit_${guildId}`);
                    const changePartnersCredit = await db.get(`changepartnerscredit_${guildId}`);
                    const changeName = await db.get(`changename_${guildId}`);
                    const changeOwner = await db.get(`changeowner_${guildId}`);
                    const autoMessage = await db.get(`automessage_${guildId}`);
                    const changeShape = await db.get(`changeshape_${guildId}`);
                    const changeTypePrice = await db.get(`changetypeprice_${guildId}`);
                    const shopVacation = await db.get(`shopvacation_${guildId}`);
                    const disableAuto = await db.get(`disableauto_${guildId}`);
                    const activateShopPrice = await db.get(`activateshopprice_${guildId}`);
                    const sellShopPrice = await db.get(`sellshopprice_${guildId}`);

                    const everyonePrice = await db.get(`evrypri_${guildId}`);
                    const herePrice = await db.get(`herepri_${guildId}`);
                    const shopMentionPrice = await db.get(`shopprice_${guildId}`);

                    const orderEveryPriceCredit = await db.get(`order-evrypri_${guildId}`);
                    const orderHerePriceCredit = await db.get(`order-herepri_${guildId}`);
                    const orderOrderPriceCredit = await db.get(`order-orderpri_${guildId}`);

                    const auctionEveryPriceCredit = await db.get(`auction-evrypri_${guildId}`);
                    const auctionHerePriceCredit = await db.get(`auction-herepri_${guildId}`);
                    const auctionMzadPriceCredit = await db.get(`auction-mzadpri_${guildId}`);

                    const line = (label, value) => `**${label}:** ${value ? value : "غـيـر مـحـدد"}`;

                    const container = new ContainerBuilder()
                        .setAccentColor(_ec.color(guildId))
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`# أسـعـار الـخـدمـات الـتـي تـم تـحـديـدهـا`)
                        )
                        .addSeparatorComponents(
                            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                        )
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                [
                                    line("سـعـر ازالـة الـتـحـذيـر", removeWarnCredit),
                                    line("سـعـر اضـافـة/حـذف شـريـك", changePartnersCredit),
                                    line("سـعـر مـنـشـن ايـفـري لـلـمـتـاجـر", everyonePrice),
                                    line("سـعـر مـنـشـن هـيـر لـلـمـتـاجـر", herePrice),
                                    line("سـعـر مـنـشـن مـتـجـر", shopMentionPrice),
                                ].join("\n")
                            ),
                            new TextDisplayBuilder().setContent(
                                [
                                    line("سـعـر مـنـشـن ايـفـري بـا الـكـردت لـلـطـلـبـات", orderEveryPriceCredit),
                                    line("سـعـر مـنـشـن هـيـر بـا الـكـردت لـلـطـلـبـات", orderHerePriceCredit),
                                    line("سـعـر مـنـشـن طـلـبـات (رول) بـالـكـردت", orderOrderPriceCredit),
                                ].join("\n")
                            ),
                            new TextDisplayBuilder().setContent(
                                [
                                    line("سـعـر مـنـشـن ايـفـري لـلـمـزاد بـالـكـردت", auctionEveryPriceCredit),
                                    line("سـعـر مـنـشـن هـيـر بـا الـكـردت لـلـمـزادات", auctionHerePriceCredit),
                                    line("سـعـر مـنـشـن مـزاد (رول) بـالـكـردت", auctionMzadPriceCredit),
                                ].join("\n")
                            ),
                            new TextDisplayBuilder().setContent(
                                [
                                    line("سـعـر تـغـيـيـر اسـم الـمـتـجـر", changeName),
                                    line("سـعـر تـغـيـيـر صـاحـب الـمـتـجـر", changeOwner),
                                    line("سـعـر نـشـر تـلـقـائـي لـلـمـتـاجـر", autoMessage),
                                    line("سـعـر تـغـيـيـر شـكـل الـمـتـجـر", changeShape),
                                    line("سـعـر تـغـيـيـر نـوع الـمـتـجـر", changeTypePrice),
                                ].join("\n")
                            ),
                            new TextDisplayBuilder().setContent(
                                [
                                    line("سـعـر إجـازة الـمـتـجـر", shopVacation),
                                    line("سـعـر تـعـطـيـل الإرسـال الـتـلـقـائـي", disableAuto),
                                    line("سـعـر تـفـعـيـل الـمـتـجـر", activateShopPrice),
                                    line("سـعـر بـيـع الـمـتـجـر", sellShopPrice),
                                ].join("\n")
                            )
                        );

                    await i.reply({
                        components: [container],
                        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                    });
                }
                break;
 case "setup-images":
    {
        const blacklist = (await db.get("blacklist")) || [];
        if (blacklist.includes(i.user.id))
            return i.reply("**أنت في البلاك لست!**");

        if (!i.member.permissions.has("Administrator"))
            return i.reply({ content: "❌ صلاحياتك غير كافية", ephemeral: true });

        const guildId = _ec.gid(i);
        const isValidUrl = (url) => {
            try { new URL(url); return true; } catch { return false; }
        };

        const uploadToCatbox = async (attachmentUrl) => {
            try {
                const axios = require('axios');
                const FormData = require('form-data');
                const imageResponse = await axios.get(attachmentUrl, { responseType: 'arraybuffer' });
                const buffer = Buffer.from(imageResponse.data, 'utf-8');
                const form = new FormData();
                form.append('reqtype', 'fileupload');
                form.append('fileToUpload', buffer, { filename: 'image.png' });
                // ✅ الرابط الصحيح
                const catboxResponse = await axios.post('https://catbox.moe/user/api.php', form, {
                    headers: { ...form.getHeaders() }
                });
                return catboxResponse.data.trim();
            } catch (error) {
                console.error("خطأ أثناء رفع الصورة إلى Catbox:", error.message);
                return null;
            }
        };

        const imageOptions = [
            { key: `buyshopimage_${guildId}`, link: "buy-shop-image", file: "buy-shop-image-attachment" },
            { key: `buyorderimage_${guildId}`, link: "buy-order-image", file: "buy-order-image-attachment" },
            { key: `buyauctionimage_${guildId}`, link: "buy-auction-image", file: "buy-auction-image-attachment" },
            { key: `buyrolesimage_${guildId}`, link: "buy-roles-image", file: "buy-roles-image-attachment" },
            { key: `rulesImage_${guildId}`, link: "rules-server", file: "rules-server-attachment" },
            { key: `priceRolesImage_${guildId}`, link: "price-roles", file: "price-roles-attachment" },
            { key: `priceShopImage_${guildId}`, link: "price-shop", file: "price-shop-attachment" },
            { key: `priceOrdersImage_${guildId}`, link: "price-orders", file: "price-orders-attachment" },
            { key: `priceAuctionImage_${guildId}`, link: "price-auction", file: "price-auction-attachment" },
            { key: `image_${guildId}`, link: "line", file: "line-attachment" },
        ];

        await i.deferReply({ flags: MessageFlags.Ephemeral });

        for (const opt of imageOptions) {
            const url = i.options.getString(opt.link);
            const attachment = i.options.getAttachment(opt.file);
            
            if (url && isValidUrl(url)) {
                await db.set(opt.key, url);
            } else if (attachment) {
                const permanentUrl = await uploadToCatbox(attachment.url);
                if (permanentUrl) {
                    await db.set(opt.key, permanentUrl);
                } else {
                    await db.set(opt.key, attachment.url);
                }
            }
        }

        const embedColor = _ec.color(guildId);

        const container = new ContainerBuilder()
            .setAccentColor(embedColor)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`# ✅ تـم تـحـديـث صـور الـسـيـرفـر`),
                new TextDisplayBuilder().setContent("تـم حـفـظ صـور الـشـراء، الأسـعـار، وقـوانـيـن الـسـيـرفـر والـخـط بـنـجـاح ورفـعـهـا بـشـكـل دائم.")
            );

        const linePreview = await db.get(`image_${guildId}`);
        if (linePreview) {
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(linePreview))
            );
        }

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${new Date().toLocaleString('ar')}`));

        await i.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }
    break;
 }
    });
    client.on("interactionCreate", async (i) => {
        if (!i.isChatInputCommand()) return;
        if (!i.guild) return;
        const guildId = i.guild.id;
        switch (i.commandName) {
            case "r-mzad":
                {
                    if (!i.member.permissions.has("Administrator")) {
                        return i.reply({
                            content: "❌ يـجـب أن تـكـون لـديـك صـلاحـيـة **Administrator**!",
                            ephemeral: true,
                        });
                    }
                    const rules = i.options.getString("rules");
                    await db.set(`mzad_rules_${guildId}`, rules);
                    await i.reply({
                        content: `**✅ تـم حـفـظ قـوانـيـن الـمـزاد بـنـجـاح.**`,
                        ephemeral: true,
                    });
                }
                break;

            case "add-mzad-room":
                {
                    if (!i.member.permissions.has("Administrator")) {
                        return i.reply({
                            content: "❌ يـجـب أن تـكـون لـديـك صـلاحـيـة **Administrator**!",
                            ephemeral: true,
                        });
                    }
                    const room = i.options.getChannel("room");
                    const rooms = (await db.get(`auctionrooms_${guildId}`)) || [];
                    if (rooms.includes(room.id)) {
                        return i.reply({
                            content: `**❌ الـروم ${room} مـوجـود بـالـفـعـل فـي الـقـائـمـة.**`,
                            ephemeral: true,
                        });
                    }
                    rooms.push(room.id);
                    await db.set(`auctionrooms_${guildId}`, rooms);
                    await i.reply({
                        content: `**✅ تـم إضـافـة ${room} لـقـائـمـة رومـات الـمـزاد.**\n**الـرومـات الـحـالـيـة: ${rooms.length}**`,
                        ephemeral: true,
                    });
                }
                break;

            case "remove-mzad-room":
                {
                    if (!i.member.permissions.has("Administrator")) {
                        return i.reply({
                            content: "❌ يـجـب أن تـكـون لـديـك صـلاحـيـة **Administrator**!",
                            ephemeral: true,
                        });
                    }
                    const room = i.options.getChannel("room");
                    let rooms = (await db.get(`auctionrooms_${guildId}`)) || [];
                    const idx = rooms.indexOf(room.id);
                    if (idx === -1) {
                        return i.reply({
                            content: `**❌ الـروم ${room} غـيـر مـوجـود فـي الـقـائـمـة.**`,
                            ephemeral: true,
                        });
                    }
                    rooms.splice(idx, 1);
                    await db.set(`auctionrooms_${guildId}`, rooms);
                    await i.reply({
                        content: `**✅ تـم حـذف ${room} مـن قـائـمـة رومـات الـمـزاد.**`,
                        ephemeral: true,
                    });
                }
                break;

            //============ add-rule ============
            case "add-rule":
                {
                    if (!i.member.permissions.has("Administrator"))
                        return i.reply({
                            content: "❌ لـيـس لـد يـك صـلاحـيـة!",
                            ephemeral: true,
                        });

                    const label = i.options.getString("label");
                    const content = i.options.getString("content");
                    const emoji = i.options.getString("emoji");
                    const imageUrl = i.options.getString("image_url");
                    const imageFile = i.options.getAttachment("image_file");

                    let rules = (await db.get(`server_rules_${guildId}`)) || [];
                    if (rules.length >= 5)
                        return i.reply({
                            content: "**❌ الـحـد الأقـصـى 5 قـوانـيـن.**",
                            ephemeral: true,
                        });

                    const finalImage = imageFile ? imageFile.url : imageUrl || null;
                    const ruleId = Date.now().toString().slice(-8);

                    rules.push({
                        id: ruleId,
                        label,
                        content,
                        emoji: emoji || null,
                        image: finalImage,
                    });
                    await db.set(`server_rules_${guildId}`, rules);

                    // ✅ إصلاح: الكود القديم كان فيه سطر .setColor(...) متبوع
                    // مباشرة بسطر if() بدون فاصلة منقوطة بينهم — يشتغل حاليًا
                    // بالصدفة بسبب Automatic Semicolon Insertion بجافاسكربت،
                    // بس فورمات خطير يقدر ينكسر بأبسط تعديل مستقبلي. صار
                    // مبني بشكل واضح وسليم مع buildContainer.
                    const addRuleContainer = buildContainer({
                        title: "✅ تـمـت إضـافـة الـزر بـنـجـاح",
                        fields: [
                            { name: "الاسـم", value: label },
                            { name: "الـمـحـتـوى", value: content.slice(0, 500) },
                        ],
                        color: _ec.color(i.guild?.id),
                        image: finalImage || null,
                    });

                    await replyContainer(i, addRuleContainer, { ephemeral: true });
                }
                break;

            //--- كـود send-rule ---
            case "send-rule":
                {
                    // ✅ هذا الجزء مبني أصلاً بـ Components V2 من قبل، ما لمسناه.
                    if (!i.member.permissions.has("Administrator"))
                        return i.reply({
                            content: "❌ لـيـس لـد يـك صـلاحـيـة!",
                            ephemeral: true,
                        });

                    const guildId = i.guild.id;

                    const ruleName = i.options.getString("rule_name");
                    const targetChannel = i.options.getChannel("channel");

                    const rules = (await db.get(`server_rules_${guildId}`)) || [];
                    const rule = rules.find((r) => r.label === ruleName);

                    if (!rule)
                        return i.reply({
                            content: "❌ **لـم يـتـم الـعـثـور عـلـى قـانـون بـهـذا الاسـم.**",
                            ephemeral: true,
                        });

                    let ruleImage = rule.image;
                    if (!ruleImage) {
                        const linePreview = await db.get(`image_${guildId}`);
                        if (linePreview) ruleImage = linePreview;
                    }

                    const container = new ContainerBuilder()
                        .setAccentColor(_ec.color(i.guild?.id))
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`# ${rule.label}`),
                            new TextDisplayBuilder().setContent(rule.content)
                        );

                    if (ruleImage) {
                        container.addSeparatorComponents(
                            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                        );
                        container.addMediaGalleryComponents(
                            new MediaGalleryBuilder().addItems(
                                new MediaGalleryItemBuilder().setURL(ruleImage)
                            )
                        );
                    }

                    container.addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                    );
                    container.addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `-# ${new Date().toLocaleString('ar')}`
                        )
                    );

                    await targetChannel.send({
                        components: [container],
                        flags: MessageFlags.IsComponentsV2,
                    });

                    await i.reply({
                        content: `✅ تـم إر سـال الـقـانـون إلـى ${targetChannel} بـنـجـاح.`,
                        ephemeral: true,
                    });
                }
                break;
            //============ remove-rule ============
            case "remove-rule":
                {
                    if (!i.member.permissions.has("Administrator"))
                        return i.reply({
                            content: "❌ يـجـب أن تـكـون لـديـك صـلاحـيـة **Administrator**!",
                            ephemeral: true,
                        });
                    const rules = (await db.get(`server_rules_${guildId}`)) || [];
                    if (rules.length === 0)
                        return i.reply({
                            content: "**❌ لا تـوجـد قـوانـيـن مـضـافـة.**",
                            ephemeral: true,
                        });
                    const menu = new StringSelectMenuBuilder()
                        .setCustomId(`rule_remove_select_${guildId}`)
                        .setPlaceholder("اخـتـر الـقـانـون الـذي تـريـد حـذفـه")
                        .addOptions(
                            rules.map((r) => ({
                                label: r.label.slice(0, 100),
                                description: r.content.slice(0, 50),
                                value: r.id,
                            })),
                        );
                    await i.reply({
                        content: "**اخـتـر الـقـانـون:**",
                        components: [new ActionRowBuilder().addComponents(menu)],
                        ephemeral: true,
                    });
                }
                break;

            //============ panel-rules ============ (V2 أصلاً، ما لمسناه)
            case "panel-rules": {
                const guildId = i.guild.id;
                const highstaff = await db.get(`highstaff_${guildId}`);

                if (highstaff && !i.member.roles.cache.has(highstaff)) {
                    return i.reply({ content: `**❌ تـحـتـاج رتـبـة <@&${highstaff}>.**`, ephemeral: true });
                }

                const rules = (await db.get(`server_rules_${guildId}`)) || [];
                if (rules.length === 0) {
                    return i.reply({ content: "**❌ لـم تـضـف أي قـوانـيـن بـعـد. اسـتـخـدم `/add-rule`.**", ephemeral: true });
                }

                const text = i.options.getString("embed-text");
                const serverColor = _ec.color(guildId);
                const rulesImage = await db.get(`rulesImage_${guildId}`);
                const linePreview = await db.get(`image_${guildId}`);
                const imageUrl = rulesImage || linePreview || null;

                const rows = [];
                for (let idx = 0; idx < rules.length; idx += 5) {
                    const chunk = rules.slice(idx, idx + 5);
                    const row = new ActionRowBuilder().addComponents(
                        chunk.map((r) => {
                            const btn = new ButtonBuilder()
                                .setCustomId(`rule_show_${guildId}_${r.id}`)
                                .setLabel(r.label.slice(0, 80))
                                .setStyle(ButtonStyle.Secondary);
                            if (r.emoji) {
                                try { btn.setEmoji(r.emoji); } catch { btn.setEmoji(emojis.rules); }
                            } else {
                                btn.setEmoji(emojis.rules);
                            }
                            return btn;
                        })
                    );
                    rows.push(row);
                }

                const container = new ContainerBuilder()
                    .setAccentColor(serverColor)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`# قـوانـيـن سـيـرفـر ${i.guild.name}`),
                        new TextDisplayBuilder().setContent(
                            text || `مـرحـبـاً بـكـم فـي قـوانـيـن **${i.guild.name}**\nاضـغـط عـلـى أي زر لـعـرض الـقـانـون بـتـفـاصـيـلـه.`
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

                for (const row of rows) {
                    container.addActionRowComponents(row);
                }

                await i.channel.send({
                    components: [container],
                    flags: MessageFlags.IsComponentsV2,
                });

                await i.reply({ content: "**✅ تـم إر سـال بـانـل الـقـوانـيـن.**", ephemeral: true });
            } break;

            //==============================================================================
            // بـانـل الـتـكـتـات (النسخة القديمة المفردة panel-ticket) — كانت لسا
            // إمبد قديم، حولّناها لنفس أسلوب panel-tickets (الجمع) المجاورة لها.
            //==============================================================================
            case "panel-ticket": {
                const guildId = i.guild.id;
                const highstaff = await db.get(`highstaff_${guildId}`);

                if (highstaff && !i.member.roles.cache.has(highstaff)) {
                    return i.reply({ content: `**❌ تـحـتـاج رتـبـة <@&${highstaff}>.**`, ephemeral: true });
                }

                const text = i.options.getString("embed-text");
                const serverColor = _ec.color(guildId);

                // جـلـب بـنـر الـسـيـرفـر تـلـقـائـيـاً
                const serverBanner = i.guild.bannerURL({ size: 1024, extension: 'png' });
                const linePreview = await db.get(`image_${guildId}`);
                const imageUrl = serverBanner || linePreview || null;

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("buy_shop").setLabel("شـراء مـتـجـر").setStyle(ButtonStyle.Secondary).setEmoji(emojis.shop),
                    new ButtonBuilder().setCustomId("ticket-auction").setLabel("تـكـت مـزاد").setStyle(ButtonStyle.Secondary).setEmoji(emojis.auction),
                    new ButtonBuilder().setCustomId("ticket-order").setLabel("تـكـت طـلـبـات").setStyle(ButtonStyle.Secondary).setEmoji(emojis.order),
                    new ButtonBuilder().setCustomId("ticket-roles").setLabel("شـراء رتـبـة").setStyle(ButtonStyle.Secondary).setEmoji(emojis.roles),
                );

                const ticketContainer = buildContainer({
                    title: `قـسـم الـتـكـتـات والـمـبـيـعـات`,
                    description: text || `**أهـلاً بـك فـي قـسـم الـتـكـتـات لـسـيـرفـر __${i.guild.name}__**\n\n# - هـنـا يـمـكـنـك الـحـصـول عـلـى:\nـ مـتـاجـر مـتـنـوعـة\nـ مـزادات حـصـر يـة\nـ طـلـبـات مـخـصـصـة\nـ رتـب مـمـيـزة`,
                    authorName: i.guild.name,
                    authorIcon: i.guild.iconURL({ size: 1024 }),
                    color: serverColor,
                    image: imageUrl,
                });

                await sendContainer(i.channel, ticketContainer, [row]);
                await i.reply({ content: "**✅ تـم إر سـال بـانـل الـتـكـتـات بـنـجـاح.**", ephemeral: true });
            } break;

            //============ panel-tickets ============ (V2 أصلاً، ما لمسناه)
            case "panel-tickets": {
                const guildId = i.guild.id;
                const highstaff = await db.get(`highstaff_${guildId}`);

                if (highstaff && !i.member.roles.cache.has(highstaff)) {
                    return i.reply({ content: `**❌ تـحـتـاج رتـبـة <@&${highstaff}>.**`, ephemeral: true });
                }

                const text = i.options.getString("embed-text");
                const serverColor = _ec.color(guildId);

                const serverBanner = i.guild.bannerURL({ size: 1024, extension: 'png' });
                const linePreview = await db.get(`image_${guildId}`);
                const guildIcon = i.guild.iconURL({ size: 1024 });

                const imageUrl = serverBanner || linePreview || null;

                const container = new ContainerBuilder()
                    .setAccentColor(serverColor)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `# قـسـم الـتـكـتـات والـمـبـيـعـات`
                        ),
                        new TextDisplayBuilder().setContent(
                            text || `**أهـلاً بـك فـي قـسـم الـتـكـتـات لـسـيـرفـر __${i.guild.name}__**\n\n# - هـنـا يـمـكـنـك الـحـصـول عـلـى:\nـ مـتـاجـر مـتـنـوعـة\nـ مـزادات حـصـر يـة\nـ طـلـبـات مـخـصـصـة\nـ رتـب مـمـيـزة`
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
                    new TextDisplayBuilder().setContent(
                        `-# ${i.guild.name} • ${new Date().toLocaleDateString('ar')}`
                    )
                );

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("buy_shop")
                        .setLabel("شـراء مـتـجـر")
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji(emojis.shop),

                    new ButtonBuilder()
                        .setCustomId("ticket-auction")
                        .setLabel("تـكـت مـزاد")
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji(emojis.auction),

                    new ButtonBuilder()
                        .setCustomId("ticket-order")
                        .setLabel("تـكـت طـلـبـات")
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji(emojis.order),

                    new ButtonBuilder()
                        .setCustomId("ticket-roles")
                        .setLabel("شـراء رتـبـة")
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji(emojis.roles)
                );

                container.addActionRowComponents(row);

                await i.channel.send({
                    components: [container],
                    flags: MessageFlags.IsComponentsV2
                });

                await i.reply({
                    content: "**✅ تـم إر سـال بـانـل الـتـكـتـات بـنـجـاح.**",
                    ephemeral: true
                });
            } break;

            //============ نقاطي ============
            case "نقاطي":
                {
                    const myPts =
                        (await db.get(`ticket_pts_${i.user.id}_${guildId}`)) || 0;
                    const ptsContainer = buildContainer({
                        title: "نـقـاطـك فـي الـتـكـتـات",
                        description: ED.commandsD_023({ i, myPts }),
                        thumbnail: i.user.displayAvatarURL({ size: 256 }),
                        footer: `${i.guild.name} | نـظـام الـنـقـاط`,
                        color: _ec.color(i.guild?.id),
                    });
                    await replyContainer(i, ptsContainer);
                }
                break;

            //============ all-for-panel ============ (V2 أصلاً، ما لمسناه)
            case "all-for-panel":
                {
                    const guildId = i.guild.id;
                    const highstaff = await db.get(`highstaff_${guildId}`);

                    if (highstaff && !i.member.roles.cache.has(highstaff)) {
                        return i.reply({
                            content: `**❌ تـحـتـاج رتـبـة <@&${highstaff}> لـتـنـفـيـذ هـذا الأمـر.**`,
                            flags: MessageFlags.Ephemeral,
                        });
                    }

                    await i.deferReply({ flags: MessageFlags.Ephemeral });

                    const linePreview = await db.get(`image_${guildId}`);
                    const serverBanner = i.guild.bannerURL({ size: 1024, extension: 'png' });
                    const customText = i.options.getString("text");
                    const imageUrl = serverBanner || linePreview || null;
                    const guildIcon = i.guild.iconURL({ size: 1024 });

                    const container = new ContainerBuilder().setAccentColor(_ec.color(guildId));

                    if (guildIcon) {
                        container.addSectionComponents(
                            new SectionBuilder()
                                .addTextDisplayComponents(
                                    new TextDisplayBuilder().setContent(`# الـبـانـل الـشـامـل لـسـيـرفـر ${i.guild.name}`)
                                )
                                .setThumbnailAccessory(
                                    new ThumbnailBuilder().setURL(guildIcon)
                                )
                        );
                    } else {
                        container.addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`# الـبـانـل الـشـامـل لـسـيـرفـر ${i.guild.name}`)
                        );
                    }

                    container.addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                    );

                    container.addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(ED.commandsD_022({ customText }))
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

                    const row1 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`allinone_prices_${guildId}`)
                            .setLabel("الأسـعـار")
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji(emojis.prices),
                        new ButtonBuilder()
                            .setCustomId(`allinone_rules_${guildId}`)
                            .setLabel("الـقـوانـيـن")
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji(emojis.rules),
                    );

                    const row2 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`allinone_tickets_${guildId}`)
                            .setLabel("الـتـكـتـات")
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji(emojis.tickets),
                        new ButtonBuilder()
                            .setCustomId(`allinone_roles_${guildId}`)
                            .setLabel("الـرّتـب")
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji(emojis.roles),
                    );

                    container.addActionRowComponents(row1, row2);

                    await i.channel.send({
                        components: [container],
                        flags: MessageFlags.IsComponentsV2,
                    });

                    await i.editReply({ content: "**✅ تـم إر سـال الـبـانـل الـشـامـل بـنـجـاح.**" });
                }
                break;
            //============ توب-نقاط ============
            case "توب-نقاط":
                {
                    await i.deferReply();
                    const allData = await db.all();
                    const suffix = `_${guildId}`;
                    const prefix = "ticket_pts_";
                    // ✅ إصلاح: كان الكود يستخدم e.ID (بحرف كبير) بينما db.all()
                    // يرجع كل عنصر بخاصية id (بحرف صغير) — نفس الشي المستخدم
                    // بكل مكان ثاني بهذا الملف وبباقي ملفات البوت. هذا كان
                    // يعني e.ID = undefined دايمًا، و undefined.startsWith()
                    // يرمي خطأ فيكرش أمر "توب-نقاط" في كل مرة يشتغل بدون
                    // استثناء.
                    const entries = allData
                        .filter((e) => e.id.startsWith(prefix) && e.id.endsWith(suffix))
                        .map((e) => ({
                            userId: e.id.replace(prefix, "").replace(suffix, ""),
                            pts: e.value || 0,
                        }))
                        .filter((e) => e.pts > 0)
                        .sort((a, b) => b.pts - a.pts)
                        .slice(0, 10);

                    if (!entries.length)
                        return i.editReply({
                            content: "**❌ لا تـوجـد نـقـاط مـسـجـلـة بـعـد.**",
                        });

                    const medals = ["🥇", "🥈", "🥉"];
                    const rows = await Promise.all(
                        entries.map(async (e, idx) => {
                            const member = await i.guild.members
                                .fetch(e.userId)
                                .catch(() => null);
                            const name = member ? member.displayName : `<@${e.userId}>`;
                            return `${medals[idx] || `**${idx + 1}.**`} ${name} — **${e.pts}** نـقـطـة`;
                        }),
                    );

                    const topContainer = buildContainer({
                        title: "أعـلـى الـمـسـؤولـيـن نـقـاطـاً",
                        description: ED.commandsD_024({ rows }),
                        footer: `${i.guild.name} | نـظـام الـنـقـاط`,
                        color: _ec.color(i.guild?.id),
                    });
                    await editReplyContainer(i, topContainer);
                }
                break;

            //============ panel-support ============ (V2 أصلاً، ما لمسناه)
            case "panel-support":
                {
                    const guildId = i.guild.id;
                    const highstaff = await db.get(`highstaff_${guildId}`);

                    if (highstaff && !i.member.roles.cache.has(highstaff)) {
                        return i.reply({
                            content: `**❌ تـحـتـاج رتـبـة <@&${highstaff}> لـتـنـفـيـذ هـذا الأمـر.**`,
                            ephemeral: true,
                        });
                    }

                    const text = i.options.getString("embed-text");
                    const linePreview = await db.get(`image_${guildId}`);
                    const serverBanner = i.guild.bannerURL({ size: 1024, extension: 'png' });
                    const serverColor = _ec.color(guildId);
                    const imageUrl = serverBanner || linePreview || null;
                    const guildIcon = i.guild.iconURL({ size: 1024 });

                    const container = new ContainerBuilder().setAccentColor(serverColor);

                    if (guildIcon) {
                        container.addSectionComponents(
                            new SectionBuilder()
                                .addTextDisplayComponents(
                                    new TextDisplayBuilder().setContent(`# قـسـم الـدعـم والـمـسـاعـدة`)
                                )
                                .setThumbnailAccessory(
                                    new ThumbnailBuilder().setURL(guildIcon)
                                )
                        );
                    } else {
                        container.addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`# قـسـم الـدعـم والـمـسـاعـدة`)
                        );
                    }

                    container.addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                    );

                    container.addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            ED.commandsD_025({ text }) || `**أهـلاً بـك فـي مـركـز الـدعـم لـسـيـرفـر ${i.guild.name}**\n\n# - يـمـكـنـك فـتـح تـذكـرة لـ:\nـ طـلـب مـسـاعـدة فـنـيـة\nـ الإبـلاغ عـن حـالات الـتـلاحـب والـتـشـهـيـر`
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
                        new TextDisplayBuilder().setContent(
                            `-# ${i.guild.name} | نـظـام الـدعـم الـمـتـكـامـل`
                        )
                    );

                    container.addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                    );

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId("ticket-support")
                            .setLabel("الـدعـم الـفـنـي")
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji(emojis.support),
                        new ButtonBuilder()
                            .setCustomId("ticket-scam")
                            .setLabel("الـتـشـهـيـر والـبـلاغـات")
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji(emojis.scam),
                    );

                    container.addActionRowComponents(row);

                    await i.channel.send({
                        components: [container],
                        flags: MessageFlags.IsComponentsV2,
                    });

                    await i.reply({
                        content: "**✅ تـم إر سـال بـانـل الـدعـم بـنـجـاح.**",
                        ephemeral: true,
                    });
                }
                break;
        }
    });
};