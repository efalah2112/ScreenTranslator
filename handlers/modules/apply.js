const _ec = require("./embedColor");
const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
    MessageFlags,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ComponentType,
} = require("discord.js");

async function getColor(guildId, db, config) {
    const stored = guildId ? await db.get(`embed_color_${guildId}`) : null;
    const raw = stored || config?.color || "0x00AE86";
    return parseInt(String(raw).replace("#", "").replace("0x", ""), 16);
}

// ✅ لوحة الإعدادات كـ Container (Components V2) بدل الإمبد
async function buildSetupContainer(guild, db, config) {
    const gid = guild.id;
    const room = await db.get(`apply_room_${gid}`);
    const type = (await db.get(`apply_type_${gid}`)) || "dm";
    const roles = (await db.get(`apply_roles_${gid}`)) || [];
    const admin = await db.get(`apply_admin_${gid}`);
    const ticketCat = await db.get(`apply_ticketcat_${gid}`);
    const qs = (await db.get(`apply_qs_${gid}`)) || {};
    const qsCount = Object.values(qs).filter(Boolean).length;
    const disabled = !!(await db.get(`apply_disabled_${gid}`));

    const infoLines = [
        `** روم الـقـبـول:** ${room ? `<#${room}>` : "\`غير محدد\`"}`,
        `** نـوع الـقـبـول:** ${type === "dm" ? "\`خـاص (DM)\`" : "\`فـي الـروم\`"}`,
        `** الـرتـب الـتـلـقـائـيـة:** ${roles.length ? roles.map((r) => `<@&${r}>`).join(" ") : "\`غير محدد\`"}`,
        `** روم الـتـقـديـمـات (لـلإدارة):** ${admin ? `<#${admin}>` : "\`غير محدد\`"}`,
        `** كـتـاغـوري تـكـت الـتـقـديـم:** ${ticketCat ? `<#${ticketCat}>` : "\`غير محدد\`"}`,
        `** الأسـئـلـة:** \`${qsCount}/5 مـعـدّة\``,
        `** حـالـة الـتـقـديـم:** ${disabled ? "\`معطل\`" : "\`مفعل\`"}`,
    ];

    const container = new ContainerBuilder()
        .setAccentColor(await getColor(gid, db, config))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`#  لـوحـة إعـدادات نـظـام الـتـقـديـم`),
            new TextDisplayBuilder().setContent(
                "**اضـغـط الأزرار أدنـاه لـتـعـديـل الإعـدادات. عـنـد الانـتـهـاء اضـغـط (نـشـر الـتـقـديـم).**",
            ),
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(infoLines.join("\n")))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${guild.name}`));

    return container;
}

function buildSetupRows(disabled) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("applycfg_room")
                .setLabel("روم القبول")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("<a:011_1367454588252454943:1459220561556144354>"),
            new ButtonBuilder()
                .setCustomId("applycfg_type")
                .setLabel("نوع القبول")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("<a:011_1367454588252454943:1459220561556144354>"),
            new ButtonBuilder()
                .setCustomId("applycfg_roles")
                .setLabel("الرتب")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("<a:011_1367454588252454943:1459220561556144354>"),
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("applycfg_admin")
                .setLabel("روم التقديمات")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("<a:011_1367454588252454943:1459220561556144354>"),
            new ButtonBuilder()
                .setCustomId("applycfg_ticketcat")
                .setLabel("كاتيغوري التكت")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("<a:011_1367454588252454943:1459220561556144354>"),
            new ButtonBuilder()
                .setCustomId("applycfg_questions")
                .setLabel("الأسئلة")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("<a:011_1367454588252454943:1459220561556144354>"),
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("applycfg_publish")
                .setLabel(" نشر التقديم")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId("applycfg_toggle")
                .setLabel(disabled ? "تفعيل التقديم" : "تعطيل التقديم")
                .setStyle(disabled ? ButtonStyle.Success : ButtonStyle.Danger),
        ),
    ];
}

async function sendSetupPanel(channel, guild, db, config) {
    const disabled = !!(await db.get(`apply_disabled_${guild.id}`));
    const container = await buildSetupContainer(guild, db, config);
    container.addActionRowComponents(...buildSetupRows(disabled));
    await channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    });
}

function buildQuestionsRows(qs) {
    qs = qs || {};
    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();
    for (let n = 1; n <= 5; n++) {
        const has = !!qs[n];
        const btn = new ButtonBuilder()
            .setCustomId(`applycfg_q${n}`)
            .setLabel(`سؤال ${n}${has ? " ✓" : ""}`)
            .setStyle(has ? ButtonStyle.Success : ButtonStyle.Secondary);
        if (n <= 3) row1.addComponents(btn);
        else row2.addComponents(btn);
    }
    return [row1, row2];
}

// ✅ صندوق اختيار نوع التقديم + الروم قبل النشر النهائي
function buildPublishPrompt(pending, note) {
    const typeLabel =
        pending.type === "ticket"
            ? "`تكت`"
            : pending.type === "questions"
              ? "`أسئلة`"
              : "`لم يتم الاختيار`";
    const channelLabel = pending.channelId ? `<#${pending.channelId}>` : "`لم يتم الاختيار`";

    const content =
        (note ? `${note}\n\n` : "") +
        `**اخـتـر نـوع الـتـقـديـم والـروم الـذي سـيُـرسـل فـيـه الـبـانـل:**\n` +
        `الـنـوع الـحـالـي: ${typeLabel}\n` +
        `الـروم الـحـالـي: ${channelLabel}`;

    const typeSelect = new StringSelectMenuBuilder()
        .setCustomId("apply_pub_type_select")
        .setPlaceholder("اختر نوع التقديم")
        .addOptions(
            {
                label: "أسئلة",
                value: "questions",
                description: "المتقدم يجاوب على الأسئلة المعدة داخل نافذة (مودال)",
            },
            {
                label: "تكت",
                value: "ticket",
                description: "يفتح تكت خاص للتواصل مع الإدارة",
            },
        );

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId("apply_pub_channel_select")
        .setPlaceholder("اختر الروم الذي يُرسل فيه بانل التقديم")
        .addChannelTypes(ChannelType.GuildText);

    return {
        content,
        components: [
            new ActionRowBuilder().addComponents(typeSelect),
            new ActionRowBuilder().addComponents(channelSelect),
        ],
    };
}

const ticketLocks = new Set();
// ✅ تخزين مؤقت لبيانات النشر بين المودال والـ Select Menus (بالذاكرة)
const pendingPublish = new Map();

async function safeReplyError(interaction, msg) {
    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
                content: msg,
                flags: MessageFlags.Ephemeral,
            });
        } else {
            await interaction.reply({
                content: msg,
                flags: MessageFlags.Ephemeral,
            });
        }
    } catch {}
}

module.exports = function registerApply(client, { db, config }) {
    const isGeneral = () => {
        const tok = client._botToken || "";
        return (
            tok &&
            tok === (config.generalToken || process.env.BOT_TOKEN_GENERAL || "")
        );
    };

    //========= prefix command: +تسطيب-تقديم =========
    client.on("messageCreate", async (message) => {
        if (!isGeneral()) return;
        if (!message.guild || message.author.bot) return;
        const content = message.content.trim();
        if (content !== "+تسطيب-تقديم" && content !== "+تسطيب التقديم") return;
        if (
            !message.member.permissions.has(PermissionFlagsBits.Administrator)
        ) {
            return message.reply(
                "**❌ يـجـب أن تـكـون لـديـك صـلاحـيـة Administrator.**",
            );
        }
        await sendSetupPanel(message.channel, message.guild, db, config);
    });

    //========= setup panel buttons =========
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isButton() || !interaction.guild) return;
        if (!interaction.customId.startsWith("applycfg_")) return;
        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.Administrator,
            )
        ) {
            return interaction.reply({
                content:
                    "**❌ يـجـب أن تـكـون لـديـك صـلاحـيـة Administrator.**",
                flags: MessageFlags.Ephemeral,
            });
        }

        const id = interaction.customId;
        const gid = interaction.guild.id;

        // اختيار روم القبول
        if (id === "applycfg_room") {
            const sel = new ChannelSelectMenuBuilder()
                .setCustomId("applycfg_pickroom")
                .setPlaceholder("اختر روم القبول")
                .addChannelTypes(ChannelType.GuildText);
            return interaction.reply({
                content: "**اخـتـر الـروم الـذي يـرسـل فـيـه (تـم قـبـولـك):**",
                components: [new ActionRowBuilder().addComponents(sel)],
                flags: MessageFlags.Ephemeral,
            });
        }

        // تبديل نوع القبول
        if (id === "applycfg_type") {
            const cur = (await db.get(`apply_type_${gid}`)) || "dm";
            const next = cur === "dm" ? "channel" : "dm";
            await db.set(`apply_type_${gid}`, next);
            try {
                const disabled = !!(await db.get(`apply_disabled_${gid}`));
                const container = await buildSetupContainer(
                    interaction.guild,
                    db,
                    config,
                );
                container.addActionRowComponents(...buildSetupRows(disabled));
                await interaction.update({
                    components: [container],
                    flags: MessageFlags.IsComponentsV2,
                });
            } catch {
                await interaction.reply({
                    content: `**✅ تـم: \`${next === "dm" ? "خاص" : "في الروم"}\`**`,
                    flags: MessageFlags.Ephemeral,
                });
            }
            return;
        }

        // اختيار الرتب
        if (id === "applycfg_roles") {
            const sel = new RoleSelectMenuBuilder()
                .setCustomId("applycfg_pickroles")
                .setPlaceholder("اختر الرتب التي تُعطى للمقبول")
                .setMinValues(0)
                .setMaxValues(10);
            return interaction.reply({
                content:
                    "**اخـتـر الـرتـب الـتـي تُـعـطـى تـلـقـائـيـاً لـلـمـقـبـول (يـمـكـن الـمـتـعـدد):**",
                components: [new ActionRowBuilder().addComponents(sel)],
                flags: MessageFlags.Ephemeral,
            });
        }

        // اختيار روم التقديمات (للإدارة)
        if (id === "applycfg_admin") {
            const sel = new ChannelSelectMenuBuilder()
                .setCustomId("applycfg_pickadmin")
                .setPlaceholder("اختر روم استقبال التقديمات")
                .addChannelTypes(ChannelType.GuildText);
            return interaction.reply({
                content:
                    "**اخـتـر روم اسـتـقـبـال الـتـقـديـمـات (لـلإدارة):**",
                components: [new ActionRowBuilder().addComponents(sel)],
                flags: MessageFlags.Ephemeral,
            });
        }

        // اختيار كاتيغوري التكت
        if (id === "applycfg_ticketcat") {
            const sel = new ChannelSelectMenuBuilder()
                .setCustomId("applycfg_pickticketcat")
                .setPlaceholder("اختر كاتيغوري التكت")
                .addChannelTypes(ChannelType.GuildCategory);
            return interaction.reply({
                content:
                    "**اخـتـر الـكـتـاغـوري الـذي تُـنـشـأ فـيـه تـكـتـات الـتـقـديـم:**",
                components: [new ActionRowBuilder().addComponents(sel)],
                flags: MessageFlags.Ephemeral,
            });
        }

        // قائمة الأسئلة
        if (id === "applycfg_questions") {
            const qs = (await db.get(`apply_qs_${gid}`)) || {};
            return interaction.reply({
                content:
                    "**اضـغـط عـلـى رقـم الـسـؤال لـتـعـديـلـه (الـعـلامـة ✓ تـعـنـي مـعـدّ).**",
                components: buildQuestionsRows(qs),
                flags: MessageFlags.Ephemeral,
            });
        }

        // أزرار الأسئلة 1..5 (تفتح Modal)
        const qm = id.match(/^applycfg_q([1-5])$/);
        if (qm) {
            const n = qm[1];
            const qs = (await db.get(`apply_qs_${gid}`)) || {};
            const cur = qs[n] || "";
            const modal = new ModalBuilder()
                .setCustomId(`applymodal_q${n}`)
                .setTitle(`السؤال رقم ${n}`)
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId("qtext")
                            .setLabel("نص السؤال")
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                            .setMaxLength(200)
                            .setValue(cur ? cur.slice(0, 200) : ""),
                    ),
                );
            return interaction.showModal(modal);
        }

        // تبديل تفعيل/تعطيل التقديم
        if (id === "applycfg_toggle") {
            const cur = !!(await db.get(`apply_disabled_${gid}`));
            await db.set(`apply_disabled_${gid}`, !cur);
            try {
                const disabled = !cur;
                const container = await buildSetupContainer(
                    interaction.guild,
                    db,
                    config,
                );
                container.addActionRowComponents(...buildSetupRows(disabled));
                await interaction.update({
                    components: [container],
                    flags: MessageFlags.IsComponentsV2,
                });
            } catch {
                await interaction.reply({
                    content: `**✅ تـم: \`${!cur ? "تعطيل" : "تفعيل"} التقديم\`**`,
                    flags: MessageFlags.Ephemeral,
                });
            }
            return;
        }

        // نشر التقديم → Modal (بدون حقل النوع، صار Select Menu بعدها)
        if (id === "applycfg_publish") {
            const room = await db.get(`apply_admin_${gid}`);
            if (!room)
                return interaction.reply({
                    content: "**❌ حـدد روم الـتـقـديـمـات أولاً.**",
                    flags: MessageFlags.Ephemeral,
                });
            const modal = new ModalBuilder()
                .setCustomId("applypub_modal")
                .setTitle("نشر بانل التقديم")
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId("title")
                            .setLabel("عنوان الإمبد")
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setMaxLength(100)
                            .setValue("التقديم"),
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId("desc")
                            .setLabel("وصف الإمبد")
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                            .setMaxLength(2000)
                            .setValue("اضغط الزر أدناه للتقديم."),
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId("btnlabel")
                            .setLabel("نص الزر")
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setMaxLength(50)
                            .setValue("تقديم"),
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId("emoji")
                            .setLabel(
                                "الإيموجي (اختياري — مثل 📝 أو <:name:id>)",
                            )
                            .setStyle(TextInputStyle.Short)
                            .setRequired(false)
                            .setMaxLength(80),
                    ),
                );
            return interaction.showModal(modal);
        }
    });

    //========= channel/role select menus (إعدادات) =========
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.guild) return;
        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.Administrator,
            )
        )
            return;
        const gid = interaction.guild.id;

        if (interaction.isChannelSelectMenu()) {
            if (interaction.customId === "applycfg_pickroom") {
                await db.set(`apply_room_${gid}`, interaction.values[0]);
                return interaction.update({
                    content: `**✅ تـم تـحـديـد روم الـقـبـول: <#${interaction.values[0]}>**`,
                    components: [],
                });
            }
            if (interaction.customId === "applycfg_pickadmin") {
                await db.set(`apply_admin_${gid}`, interaction.values[0]);
                return interaction.update({
                    content: `**✅ تـم تـحـديـد روم الـتـقـديـمـات: <#${interaction.values[0]}>**`,
                    components: [],
                });
            }
            if (interaction.customId === "applycfg_pickticketcat") {
                await db.set(`apply_ticketcat_${gid}`, interaction.values[0]);
                return interaction.update({
                    content: `**✅ تـم تـحـديـد كـتـاغـوري الـتـكـت: <#${interaction.values[0]}>**`,
                    components: [],
                });
            }
        }

        if (
            interaction.isRoleSelectMenu() &&
            interaction.customId === "applycfg_pickroles"
        ) {
            await db.set(`apply_roles_${gid}`, interaction.values);
            return interaction.update({
                content: interaction.values.length
                    ? `**✅ تـم حـفـظ الـرتـب:** ${interaction.values.map((r) => `<@&${r}>`).join(" ")}`
                    : "**✅ تـم مـسـح كـل الـرتـب.**",
                components: [],
            });
        }
    });

    //========= modal: question text =========
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isModalSubmit() || !interaction.guild) return;
        const m = interaction.customId.match(/^applymodal_q([1-5])$/);
        if (!m) return;
        const n = m[1];
        const gid = interaction.guild.id;
        const txt = interaction.fields.getTextInputValue("qtext").trim();
        const qs = (await db.get(`apply_qs_${gid}`)) || {};
        qs[n] = txt;
        await db.set(`apply_qs_${gid}`, qs);
        await interaction.reply({
            content: `**✅ تـم حـفـظ الـسـؤال رقـم ${n}.**`,
            flags: MessageFlags.Ephemeral,
        });
    });

    //========= modal: publish panel (title/desc/btn/emoji) =========
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isModalSubmit() || !interaction.guild) return;
        if (interaction.customId !== "applypub_modal") return;
        const gid = interaction.guild.id;
        const title =
            interaction.fields.getTextInputValue("title").trim() || "التقديم";
        const desc = interaction.fields.getTextInputValue("desc").trim();
        const btnlabel =
            interaction.fields.getTextInputValue("btnlabel").trim() || "تقديم";
        const emoji =
            interaction.fields.getTextInputValue("emoji").trim() || "";

        const key = `${gid}_${interaction.user.id}`;
        const pending = { title, desc, btnlabel, emoji, type: null, channelId: null };
        pendingPublish.set(key, pending);

        const prompt = buildPublishPrompt(pending);
        await interaction.reply({
            content: prompt.content,
            components: prompt.components,
            flags: MessageFlags.Ephemeral,
        });
    });

    //========= select menus: نوع التقديم + الروم قبل النشر =========
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.guild) return;
        if (
            interaction.customId !== "apply_pub_type_select" &&
            interaction.customId !== "apply_pub_channel_select"
        )
            return;
        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.Administrator,
            )
        )
            return;

        const gid = interaction.guild.id;
        const key = `${gid}_${interaction.user.id}`;
        const pending = pendingPublish.get(key);
        if (!pending) {
            return interaction.reply({
                content:
                    "**❌ انـتـهـت صـلاحـيـة الـجـلـسـة. أعـد الـضـغـط عـلـى (نـشـر الـتـقـديـم).**",
                flags: MessageFlags.Ephemeral,
            });
        }

        if (interaction.customId === "apply_pub_type_select") {
            pending.type = interaction.values[0];
        } else {
            pending.channelId = interaction.values[0];
        }

        if (pending.type && pending.channelId) {
            // تحقق قبل النشر النهائي
            if (pending.type === "questions") {
                const qs = (await db.get(`apply_qs_${gid}`)) || {};
                if (Object.values(qs).filter(Boolean).length === 0) {
                    pending.type = null;
                    const p = buildPublishPrompt(
                        pending,
                        "**❌ لا تـوجـد أسـئـلـة مـعـدّة. اضـبـط الأسـئـلـة أولاً ثـم أعـد الاخـتـيـار.**",
                    );
                    return interaction.update(p);
                }
            }
            if (
                pending.type === "ticket" &&
                !(await db.get(`apply_ticketcat_${gid}`))
            ) {
                pending.type = null;
                const p = buildPublishPrompt(
                    pending,
                    "**❌ حـدد كـتـاغـوري الـتـكـت أولاً ثـم أعـد الاخـتـيـار.**",
                );
                return interaction.update(p);
            }

            const targetChannel = interaction.guild.channels.cache.get(
                pending.channelId,
            );
            if (!targetChannel) {
                pending.channelId = null;
                const p = buildPublishPrompt(
                    pending,
                    "**❌ الـروم الـمـحـدد غـيـر مـوجـود. اخـتـر روم آخـر.**",
                );
                return interaction.update(p);
            }

            const container = new ContainerBuilder()
                .setAccentColor(await getColor(gid, db, config))
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`# ${pending.title}`),
                    new TextDisplayBuilder().setContent(pending.desc),
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`-# ${interaction.guild.name}`),
                );

            const btn = new ButtonBuilder()
                .setCustomId(
                    pending.type === "ticket"
                        ? "apply_open_ticket"
                        : "apply_open_questions",
                )
                .setLabel(pending.btnlabel)
                .setStyle(ButtonStyle.Primary);
            if (pending.emoji) {
                try {
                    btn.setEmoji(pending.emoji);
                } catch {}
            }
            container.addActionRowComponents(
                new ActionRowBuilder().addComponents(btn),
            );

            await targetChannel.send({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
            });

            pendingPublish.delete(key);
            return interaction.update({
                content: `**✅ تـم نـشـر بـانـل الـتـقـديـم بـنـجـاح فـي <#${targetChannel.id}>.**`,
                components: [],
            });
        }

        // لسا ناقص اختيار واحد (نوع أو روم)
        return interaction.update(buildPublishPrompt(pending));
    });

    //========= apply button: questions =========
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isButton() || !interaction.guild) return;
        if (interaction.customId !== "apply_open_questions") return;
        const gid = interaction.guild.id;

        if (await db.get(`apply_disabled_${gid}`)) {
            return interaction.reply({
                content: "**❌ الـتـقـديـم مـغـلـق حـالـيـاً.**",
                flags: MessageFlags.Ephemeral,
            });
        }

        const qs = (await db.get(`apply_qs_${gid}`)) || {};
        const list = [];
        for (let n = 1; n <= 5; n++) if (qs[n]) list.push({ n, q: qs[n] });
        if (list.length === 0)
            return interaction.reply({
                content: "**❌ لا تـوجـد أسـئـلـة مـعـدّة.**",
                flags: MessageFlags.Ephemeral,
            });

        const modal = new ModalBuilder()
            .setCustomId("apply_qmodal")
            .setTitle("استمارة التقديم");
        for (const item of list) {
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId(`a${item.n}`)
                        .setLabel(item.q.slice(0, 45))
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                        .setMaxLength(1000),
                ),
            );
        }
        await interaction.showModal(modal);
    });

    //========= apply questions modal submit =========
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isModalSubmit() || !interaction.guild) return;
        if (interaction.customId !== "apply_qmodal") return;
        const gid = interaction.guild.id;

        if (await db.get(`apply_disabled_${gid}`)) {
            return interaction.reply({
                content: "**❌ الـتـقـديـم مـغـلـق حـالـيـاً.**",
                flags: MessageFlags.Ephemeral,
            });
        }

        const adminRoom = await db.get(`apply_admin_${gid}`);
        if (!adminRoom)
            return interaction.reply({
                content: "**❌ روم الـتـقـديـمـات غـيـر مـحـدد.**",
                flags: MessageFlags.Ephemeral,
            });
        const adminCh = interaction.guild.channels.cache.get(adminRoom);
        if (!adminCh)
            return interaction.reply({
                content: "**❌ روم الـتـقـديـمـات غـيـر مـوجـود.**",
                flags: MessageFlags.Ephemeral,
            });

        const qs = (await db.get(`apply_qs_${gid}`)) || {};
        const fields = [];
        for (let n = 1; n <= 5; n++) {
            if (!qs[n]) continue;
            let ans;
            try {
                ans = interaction.fields.getTextInputValue(`a${n}`);
            } catch {
                continue;
            }
            fields.push({
                name: `❓ ${qs[n]}`.slice(0, 256),
                value: `${ans}`.slice(0, 1024),
            });
        }

        const userId = interaction.user.id;
        const answersText = fields
            .map((f) => `**${f.name}**\n${f.value}`)
            .join("\n\n");

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`apply_accept_${userId}`)
                .setLabel("قبول")
                .setStyle(ButtonStyle.Success)
                .setEmoji("✅"),
            new ButtonBuilder()
                .setCustomId(`apply_reject_${userId}`)
                .setLabel("رفض")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("❌"),
            new ButtonBuilder()
                .setCustomId(`apply_reasonbtn_${userId}`)
                .setLabel("رفض مع سبب")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("📝"),
        );

        const container = new ContainerBuilder().setAccentColor(
            await getColor(gid, db, config),
        );
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`#  تـقـديـم جـديـد`),
                    new TextDisplayBuilder().setContent(interaction.user.tag),
                )
                .setThumbnailAccessory(
                    new ThumbnailBuilder().setURL(
                        interaction.user.displayAvatarURL(),
                    ),
                ),
        );
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
        );
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**الـمـقـدم:** <@${userId}> \`(${userId})\``,
            ),
        );
        if (answersText) {
            container.addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
            );
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(answersText),
            );
        }
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
        );
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# بـانـتـظـار الـقـرار`),
        );
        container.addActionRowComponents(row);

        await adminCh.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
        await interaction.reply({
            content: "**✅ تـم إرسـال تـقـديـمـك. بـانـتـظـار الـرد.**",
            flags: MessageFlags.Ephemeral,
        });
    });

    //========= apply button: ticket =========
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isButton() || !interaction.guild) return;
        if (interaction.customId !== "apply_open_ticket") return;
        const gid = interaction.guild.id;
        const userId = interaction.user.id;
        const lockKey = `${userId}_${gid}`;

        if (await db.get(`apply_disabled_${gid}`)) {
            return interaction.reply({
                content: "**❌ الـتـقـديـم مـغـلـق حـالـيـاً.**",
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            const cat = await db.get(`apply_ticketcat_${gid}`);
            const adminRoom = await db.get(`apply_admin_${gid}`);
            if (!cat)
                return interaction.reply({
                    content: "**❌ كـتـاغـوري الـتـكـت غـيـر مـحـدد.**",
                    flags: MessageFlags.Ephemeral,
                });

            if (ticketLocks.has(lockKey)) {
                return interaction.reply({
                    content:
                        "**❌ جـاري إنـشـاء تـكـتـك بـالـفـعـل. انـتـظـر لـحـظـة...**",
                    flags: MessageFlags.Ephemeral,
                });
            }
            ticketLocks.add(lockKey);

            try {
                const exist = await db.get(`apply_ticket_${userId}_${gid}`);
                if (exist) {
                    const ch = interaction.guild.channels.cache.get(
                        exist.channelId,
                    );
                    if (ch)
                        return interaction.reply({
                            content: `**❌ لـديـك تـكـت تـقـديـم مـفـتـوح: <#${ch.id}>**`,
                            flags: MessageFlags.Ephemeral,
                        });
                    await db.delete(`apply_ticket_${userId}_${gid}`);
                }

                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const safe =
                    interaction.user.username
                        .replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, "-")
                        .slice(0, 24) || "user";
                let ch;
                try {
                    ch = await interaction.guild.channels.create({
                        name: `apply-${safe}`,
                        type: ChannelType.GuildText,
                        parent: cat,
                        permissionOverwrites: [
                            {
                                id: userId,
                                allow: [
                                    "SendMessages",
                                    "EmbedLinks",
                                    "AttachFiles",
                                    "ViewChannel",
                                    "ReadMessageHistory",
                                ],
                            },
                            {
                                id: interaction.guild.roles.everyone,
                                deny: ["SendMessages", "ViewChannel"],
                            },
                        ],
                    });
                } catch (e) {
                    console.error("apply ticket create error:", e);
                    return interaction.editReply(
                        "**❌ فـشـل إنـشـاء الـتـكـت. تـأكـد مـن صـلاحـيـات الـبـوت.**",
                    );
                }

                await db.set(`apply_ticket_${userId}_${gid}`, {
                    channelId: ch.id,
                });
                await db.set(`apply_ticket_channel_${ch.id}`, {
                    ownerId: userId,
                    guildId: gid,
                });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`apply_accept_${userId}`)
                        .setLabel("قبول")
                        .setStyle(ButtonStyle.Success)
                        .setEmoji("✅"),
                    new ButtonBuilder()
                        .setCustomId(`apply_reject_${userId}`)
                        .setLabel("رفض")
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji("<a:emoji_82:1467168694244212829>"),
                    new ButtonBuilder()
                        .setCustomId(`apply_reasonbtn_${userId}`)
                        .setLabel("رفض مع سبب")
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji("<a:emoji_82:1467168694244212829>"),
                );

                // ملاحظة: Components V2 ما يقبل حقل content مع components،
                // فحطينا المنشن كأول سطر جوا الـ Container بدل ما يكون خارجه
                const container = new ContainerBuilder()
                    .setAccentColor(await getColor(gid, db, config))
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`<@${userId}>`),
                        new TextDisplayBuilder().setContent(`#  تـكـت الـتـقـديـم`),
                        new TextDisplayBuilder().setContent(
                            `**أهـلاً <@${userId}>**\n\nالإدارة سـتـتـواصـل مـعـك هـنـا. اكـتـب أي تـفـاصـيـل تـريـد إضـافـتـهـا.`,
                        ),
                    );
                container.addActionRowComponents(row);

                await ch.send({
                    components: [container],
                    flags: MessageFlags.IsComponentsV2,
                });
                if (adminRoom) {
                    const ach = interaction.guild.channels.cache.get(adminRoom);
                    if (ach)
                        await ach
                            .send({
                                content: ` تـكـت تـقـديـم جـديـد مـن <@${userId}>: <#${ch.id}>`,
                            })
                            .catch(() => {});
                }
                await interaction.editReply(
                    `** تـم فـتـح تـكـت الـتـقـديـم: <#${ch.id}>**`,
                );
            } finally {
                ticketLocks.delete(lockKey);
            }
        } catch (e) {
            console.error("apply_open_ticket error:", e);
            ticketLocks.delete(lockKey);
            await safeReplyError(
                interaction,
                "**❌ حـدث خـطـأ غـيـر مـتـوقـع.**",
            );
        }
    });

    //========= helper: تحديث الـ Container بعد القبول/الرفض =========
    async function markDecisionOnMessage(msg, gid, statusLine) {
        try {
            const oldComponent = msg.components?.[0];
            const oldJSON = oldComponent?.toJSON
                ? oldComponent.toJSON()
                : oldComponent;
            const children = (oldJSON?.components || []).filter(
                (c) => c.type !== ComponentType.ActionRow,
            );
            children.push({
                type: ComponentType.TextDisplay,
                content: statusLine,
            });
            const newContainer = new ContainerBuilder({
                ...oldJSON,
                accent_color: _ec.color(gid),
                components: children,
            });
            await msg.edit({
                components: [newContainer],
                flags: MessageFlags.IsComponentsV2,
            });
        } catch {}
    }

    //========= helper: send accept/reject finalization =========
    async function sendAccept(interaction, applicantId) {
        const gid = interaction.guild.id;
        const member = await interaction.guild.members
            .fetch(applicantId)
            .catch(() => null);
        if (!member) {
            return interaction.reply({
                content: "**❌ الـعـضـو لـم يـعـد فـي الـسـيـرفـر.**",
                flags: MessageFlags.Ephemeral,
            });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const roles = (await db.get(`apply_roles_${gid}`)) || [];
        const givenRoles = [];
        for (const r of roles) {
            try {
                await member.roles.add(r);
                givenRoles.push(r);
            } catch {}
        }

        const acceptType = (await db.get(`apply_type_${gid}`)) || "dm";
        const acceptRoom = await db.get(`apply_room_${gid}`);
        const successText =
            `** مـبـروك <@${applicantId}>! تـم قـبـولـك فـي ${interaction.guild.name}.**` +
            (givenRoles.length
                ? `\nالـرتـب الـمُـعـطـاة: ${givenRoles.map((r) => `<@&${r}>`).join(" ")}`
                : "");

        let delivered = "";
        if (acceptType === "dm") {
            try {
                await member.send(successText);
                delivered = " تـم الإرسـال خـاص.";
            } catch {
                delivered = " لـم أتـمـكـن مـن الإرسـال خـاص.";
            }
        }
        if (acceptType === "channel" || delivered.includes("⚠️")) {
            if (acceptRoom) {
                const ch = interaction.guild.channels.cache.get(acceptRoom);
                if (ch) {
                    try {
                        await ch.send(successText);
                        delivered += " ✅ نُـشـر فـي الـروم.";
                    } catch {
                        delivered += " ❌ فـشـل الـنـشـر.";
                    }
                }
            }
        }

        await markDecisionOnMessage(
            interaction.message,
            gid,
            `-# ✅ تـم الـقـبـول بـواسـطـة ${interaction.user.tag}`,
        );

        await interaction.editReply(
            `**✅ تـم قـبـول <@${applicantId}>.** ${delivered}`,
        );

        // close ticket if this was a ticket channel
        const tmeta = await db.get(
            `apply_ticket_channel_${interaction.channel.id}`,
        );
        if (tmeta) {
            try {
                await interaction.channel.send(
                    "**🔒 سـيُـحـذف الـتـكـت خـلال 10 ثـوانٍ...**",
                );
            } catch {}
            setTimeout(
                () => interaction.channel.delete().catch(() => {}),
                10000,
            );
        }
    }

    async function sendReject(interaction, applicantId, reason) {
        const gid = interaction.guild.id;
        await interaction
            .deferReply({ flags: MessageFlags.Ephemeral })
            .catch(() => {});

        const member = await interaction.guild.members
            .fetch(applicantId)
            .catch(() => null);
        const text = reason
            ? `**❌ تـم رفـض تـقـديـمـك فـي ${interaction.guild.name}.**\n**الـسـبـب:** ${reason}`
            : `**❌ تـم رفـض تـقـديـمـك فـي ${interaction.guild.name}.**`;

        let delivered = "";
        if (member) {
            try {
                await member.send(text);
                delivered = "📨 تـم إعـلام الـعـضـو خـاص.";
            } catch {
                delivered = "⚠️ لـم أتـمـكـن مـن إعـلام الـعـضـو خـاص.";
            }
        }

        await markDecisionOnMessage(
            interaction.message,
            gid,
            `-# ❌ تـم الـرفـض بـواسـطـة ${interaction.user.tag}${reason ? ` — الـسـبـب: ${reason.slice(0, 80)}` : ""}`,
        );

        await interaction.editReply(
            `**❌ تـم رفـض تـقـديـم <@${applicantId}>.** ${delivered}`,
        );

        const tmeta = await db.get(
            `apply_ticket_channel_${interaction.channel.id}`,
        );
        if (tmeta) {
            try {
                await interaction.channel.send(
                    "**🔒 سـيُـحـذف الـتـكـت خـلال 10 ثـوانٍ...**",
                );
            } catch {}
            setTimeout(
                () => interaction.channel.delete().catch(() => {}),
                10000,
            );
        }
    }

    //========= admin buttons: accept / reject / reason =========
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isButton() || !interaction.guild) return;
        const m = interaction.customId.match(
            /^apply_(accept|reject|reasonbtn)_(\d+)$/,
        );
        if (!m) return;
        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.Administrator,
            )
        ) {
            return interaction.reply({
                content:
                    "**❌ يـجـب أن تـكـون لـديـك صـلاحـيـة Administrator.**",
                flags: MessageFlags.Ephemeral,
            });
        }
        const action = m[1];
        const applicantId = m[2];

        if (action === "accept") return sendAccept(interaction, applicantId);
        if (action === "reject")
            return sendReject(interaction, applicantId, null);
        if (action === "reasonbtn") {
            const modal = new ModalBuilder()
                .setCustomId(`apply_reasonmodal_${applicantId}`)
                .setTitle("سبب الرفض")
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId("reason")
                            .setLabel("اكتب سبب الرفض")
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                            .setMaxLength(800),
                    ),
                );
            return interaction.showModal(modal);
        }
    });

    //========= reason modal submit =========
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isModalSubmit() || !interaction.guild) return;
        const m = interaction.customId.match(/^apply_reasonmodal_(\d+)$/);
        if (!m) return;
        const applicantId = m[1];
        const reason = interaction.fields.getTextInputValue("reason").trim();
        return sendReject(interaction, applicantId, reason);
    });

    //========= cleanup ticket on channelDelete =========
    client.on("channelDelete", async (channel) => {
        try {
            const tmeta = await db.get(`apply_ticket_channel_${channel.id}`);
            if (tmeta) {
                await db.delete(`apply_ticket_channel_${channel.id}`);
                if (tmeta.ownerId)
                    await db.delete(
                        `apply_ticket_${tmeta.ownerId}_${channel.guild?.id || ""}`,
                    );
            }
        } catch {}
    });
};
