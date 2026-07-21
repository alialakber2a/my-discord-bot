const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const schedulePath = './schedule.json';

let scheduledData = { ads: {}, giveaways: {} };
if (fs.existsSync(schedulePath)) {
    try {
        const parsed = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
        scheduledData.ads = parsed.ads || {};
        scheduledData.giveaways = parsed.giveaways || {};
    } catch (e) {
        scheduledData = { ads: {}, giveaways: {} };
    }
}

function saveSchedule() {
    fs.writeFileSync(schedulePath, JSON.stringify(scheduledData, null, 2));
}

async function setupAdRole(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: '❌ هذا الأمر للأدوار الإدارية العليا (Administrator) فقط.', ephemeral: true });
    }
    const role = interaction.options.getRole('role');
    let config = fs.existsSync('./serverConfig.json') ? JSON.parse(fs.readFileSync('./serverConfig.json')) : {};
    
    config[interaction.guild.id] = {
        ...(config[interaction.guild.id] || {}),
        adAdminRole: role.id
    };

    fs.writeFileSync('./serverConfig.json', JSON.stringify(config, null, 2));
    return interaction.reply({ content: `✅ تم تسجيل رتبة الإدارة بنجاح: ${role}`, ephemeral: true });
}

// 1. واجهة إدخال معلومات الإعلان
async function showAdModalDirect(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('ad_modal_step1')
        .setTitle('إعداد معلومات الإعلان المدفوع');

    const roomNameInput = new TextInputBuilder()
        .setCustomId('ad_room_name')
        .setLabel('اسم الروم الجديد (مثال: ad-1)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const contentInput = new TextInputBuilder()
        .setCustomId('ad_content')
        .setLabel('محتوى رسالة الإعلان')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

    const durationInput = new TextInputBuilder()
        .setCustomId('ad_duration')
        .setLabel('مدة حفل/روم الإعلان (مثال: 1m, 1h, 1d)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(roomNameInput),
        new ActionRowBuilder().addComponents(contentInput),
        new ActionRowBuilder().addComponents(durationInput)
    );

    return interaction.showModal(modal);
}

// 2. استقبال بيانات الإعلان وحفظها مؤقتاً، ثم سؤال المستخدم عن الكيفواي مباشرة
async function handleAdModalSubmit(interaction) {
    const roomName = interaction.fields.getTextInputValue('ad_room_name');
    const content = interaction.fields.getTextInputValue('ad_content');
    const durationStr = interaction.fields.getTextInputValue('ad_duration');

    global.tempAdData = global.tempAdData || {};
    global.tempAdData[interaction.user.id] = {
        roomName, content, durationStr
    };

    const gwText = `🎁 **إعداد مسابقة كيفواي مع الإعلان**\n\nهل تريد إضافة مسابقة كيفواي داخلية مع هذا الإعلان؟`;

    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ad_gw_yes_${roomName}`).setLabel('نعم، اريد كيفواي').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`ad_gw_no_${roomName}`).setLabel('لا، بدون كيفواي').setStyle(ButtonStyle.Secondary)
    );

    return interaction.reply({ content: gwText, components: [buttonRow], ephemeral: true });
}

// 3. معالجة اختيار الكيفواي
async function handleGiveawayChoice(interaction) {
    const action = interaction.customId.startsWith('ad_gw_yes') ? 'yes' : 'no';

    if (action === 'no') {
        return finalizeAndCreateAd(interaction, false);
    } else {
        const modal = new ModalBuilder()
            .setCustomId('ad_gw_modal')
            .setTitle('تفاصيل مسابقة الكيفواي');

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('gw_prize').setLabel('الجائزة').setStyle(TextInputStyle.Short).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('gw_winners').setLabel('عدد الفائزين (رقم)').setStyle(TextInputStyle.Short).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('gw_duration').setLabel('مدة الكيفواي (مثال: 30m أو 1h)').setStyle(TextInputStyle.Short).setRequired(true)
            )
        );

        return interaction.showModal(modal);
    }
}

async function handleGwModalSubmit(interaction) {
    const prize = interaction.fields.getTextInputValue('gw_prize');
    const winners = interaction.fields.getTextInputValue('gw_winners');
    const gwDuration = interaction.fields.getTextInputValue('gw_duration');

    return finalizeAndCreateAd(interaction, true, { prize, winners, gwDuration });
}

// 4. الدالة المركزية لإنشاء الروم، قفله، ونشر الإعلان والكيفواي
async function finalizeAndCreateAd(interaction, hasGiveaway, gwData = null) {
    await interaction.update({ content: '⏳ جاري إنشاء روم الإعلان وتجهيز التفاصيل...', components: [] });

    const userId = interaction.user.id;
    const adData = global.tempAdData?.[userId];
    if (!adData) return interaction.editReply({ content: '❌ حدث خطأ، انتهت صلاحية الجلسة. أعد المحاولة.' });

    const guild = interaction.guild;
    const { roomName, content, durationStr } = adData;

    try {
        const newChannel = await guild.channels.create({
            name: roomName,
            type: ChannelType.GuildText,
        });

        await newChannel.permissionOverwrites.edit(guild.roles.everyone, {
            SendMessages: false
        }).catch(() => {});

        await newChannel.permissionOverwrites.edit(interaction.client.user.id, {
            SendMessages: true,
            MentionEveryone: true,
            ViewChannel: true,
            EmbedLinks: true,
            AddReactions: true
        }).catch(() => {});

        const durationMs = parseDuration(durationStr);
        const deleteAtTime = Date.now() + durationMs;

        const fullContent = `${content}\n\n-# ملاحظه هذا اعلان مدفوع ونحن غير مسؤولين عما يحدث داخل السيرفر تريد مثله ؟ افتح تكت <#1481106993644310599> @everyone `;

        await newChannel.send({ 
            content: fullContent,
            allowedMentions: { parse: [] }
        });

        if (hasGiveaway && gwData) {
            const gwDurationMs = parseDuration(gwData.gwDuration);
            const endsAt = Date.now() + gwDurationMs;
            const endsTimestamp = Math.floor(endsAt / 1000);
            const winnersCount = parseInt(gwData.winners) || 1;

            const embed = new EmbedBuilder()
                .setTitle('🎉 مسابقة جديدة!')
                .setDescription('اضغط على الزر أدناه للمشاركة في الكيفواي!')
                .addFields(
                    { name: '🎁 الجائزة', value: `**${gwData.prize}**`, inline: false },
                    { name: '🏆 الفائزين', value: `**${winnersCount}**`, inline: true },
                    { name: '👑 برعاية (المقدم)', value: `${interaction.user}`, inline: true },
                    { name: '⏳ تنتهي في', value: `<t:${endsTimestamp}:R> (<t:${endsTimestamp}:f>)`, inline: false }
                )
                .setColor(0xf1c40f)
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ad_join_giveaway').setLabel('المشاركة (0)').setStyle(ButtonStyle.Success).setEmoji('🎉'),
                new ButtonBuilder().setCustomId('ad_list_participants').setLabel('المشاركون').setStyle(ButtonStyle.Secondary).setEmoji('📋')
            );

            const gwMessage = await newChannel.send({ embeds: [embed], components: [row] });

            const gwInfo = {
                messageId: gwMessage.id,
                channelId: newChannel.id,
                guildId: guild.id,
                prize: gwData.prize,
                winnersCount: winnersCount,
                hostId: interaction.user.id,
                participants: [],
                endsAt: endsAt,
                ended: false
            };

            global.adGiveaways = global.adGiveaways || {};
            global.adGiveaways[gwMessage.id] = gwInfo;
            scheduledData.giveaways[gwMessage.id] = gwInfo;
        }

        scheduledData.ads[newChannel.id] = {
            channelId: newChannel.id,
            guildId: guild.id,
            deleteAt: deleteAtTime
        };
        saveSchedule();

        return interaction.editReply({ content: `✅ تم إنشاء روم الإعلان مقفلاً ونشر الإعلان بنجاح: ${newChannel}\n⏱️ سيتم حذف الروم والكيفواي في موعدها تلقائياً.`, components: [] });

    } catch (e) {
        console.error(e);
        return interaction.editReply({ content: '❌ حدث خطأ أثناء إنشاء روم الإعلان.' });
    }
}

function parseDuration(str) {
    if (!str) return 60000;
    const match = str.toLowerCase().trim().match(/^(\d+)([smhd])$/);
    if (!match) return 60000;
    const value = parseInt(match[1]);
    const unit = match[2];
    if (unit === 's') return value * 1000;
    if (unit === 'm') return value * 60 * 1000;
    if (unit === 'h') return value * 60 * 60 * 1000;
    if (unit === 'd') return value * 24 * 60 * 60 * 1000;
    return 60000;
}

// حلقة الفحص لحذف الروم وإنهاء الكيفواي بدقة تامة
let isCheckingSchedules = false;
function initAdSchedules(client) {
    setInterval(async () => {
        if (isCheckingSchedules) return;
        isCheckingSchedules = true;

        const now = Date.now();

        // 1. فحص حذف الرومات المنتهية
        for (const channelId in scheduledData.ads) {
            const adInfo = scheduledData.ads[channelId];
            if (!adInfo) continue;

            if (now >= adInfo.deleteAt) {
                try {
                    const channel = await client.channels.fetch(channelId).catch(() => null);
                    if (channel) await channel.delete('انتهت مدة الإعلان.');
                } catch (e) {}
                delete scheduledData.ads[channelId];
                saveSchedule();
            }
        }

        // 2. فحص إنهاء الكيفواي وسحب الفائزين لمرة واحدة
        global.adGiveaways = global.adGiveaways || {};
        for (const messageId in scheduledData.giveaways) {
            const gwInfo = scheduledData.giveaways[messageId];
            if (!gwInfo || gwInfo.ended) continue;

            global.adGiveaways[messageId] = gwInfo;

            if (now >= gwInfo.endsAt) {
                gwInfo.ended = true;
                saveSchedule();
                await checkAndEndAdGiveaway(client, messageId);
            }
        }

        isCheckingSchedules = false;
    }, 1000);
}

async function checkAndEndAdGiveaway(client, messageId) {
    const data = (global.adGiveaways && global.adGiveaways[messageId]) || (scheduledData.giveaways ? scheduledData.giveaways[messageId] : null);
    if (!data) return;

    try {
        const guild = await client.guilds.fetch(data.guildId);
        const channel = await guild.channels.fetch(data.channelId);
        const message = await channel.messages.fetch(data.messageId);

        const usersArray = data.participants || [];
        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ad_join_giveaway').setLabel('انتهت المسابقة').setStyle(ButtonStyle.Danger).setDisabled(true),
            new ButtonBuilder().setCustomId('ad_list_participants').setLabel(`المشاركون (${usersArray.length})`).setStyle(ButtonStyle.Secondary).setDisabled(true)
        );
        await message.edit({ components: [disabledRow] }).catch(() => {});

        if (usersArray.length === 0) {
            const endedEmbed = EmbedBuilder.from(message.embeds[0])
                .setTitle('🎉 انتهت المسابقة')
                .setDescription(`❌ لم يشارك أحد في المسابقة.\n👑 **الكيفواي برعاية:** <@${data.hostId}>`)
                .setColor(0xe74c3c);

            await message.edit({ embeds: [endedEmbed] }).catch(() => {});
            if (global.adGiveaways) delete global.adGiveaways[messageId];
            if (scheduledData.giveaways) delete scheduledData.giveaways[messageId];
            saveSchedule();
            return;
        }

        const winners = [];
        const pool = [...usersArray];
        for (let i = 0; i < data.winnersCount && pool.length > 0; i++) {
            const index = Math.floor(Math.random() * pool.length);
            winners.push(pool.splice(index, 1)[0]);
        }

        const winnersMentions = winners.map(id => `<@${id}>`).join(', ');

        const endedEmbed = EmbedBuilder.from(message.embeds[0])
            .setTitle('🎉 انتهت المسابقة!')
            .setDescription(`🏆 **الفائزون:** ${winnersMentions}\n🎁 **الجائزة:** ${data.prize}\n👑 **الكيفواي برعاية:** <@${data.hostId}>`)
            .setColor(0x2ecc71);

        await message.edit({ embeds: [endedEmbed] }).catch(() => {});
        await channel.send(`🎊 مبروك ${winnersMentions}! لقد فزتم بـ **${data.prize}**!\n👑 الكيفواي برعاية: <@${data.hostId}>`).catch(() => {});

        if (global.adGiveaways) delete global.adGiveaways[messageId];
        if (scheduledData.giveaways) delete scheduledData.giveaways[messageId];
        saveSchedule();
    } catch (e) {
        if (global.adGiveaways) delete global.adGiveaways[messageId];
        if (scheduledData.giveaways) delete scheduledData.giveaways[messageId];
        saveSchedule();
    }
}

async function handleAdGiveawayButton(interaction) {
    if (!interaction.isButton()) return;
    const messageId = interaction.message.id;
    
    global.adGiveaways = global.adGiveaways || {};
    scheduledData.giveaways = scheduledData.giveaways || {};

    let data = global.adGiveaways[messageId] || scheduledData.giveaways[messageId];
    if (!data) return;

    if (interaction.customId === 'ad_join_giveaway') {
        const index = data.participants.indexOf(interaction.user.id);
        if (index > -1) {
            data.participants.splice(index, 1);
            await interaction.reply({ content: '❌ تم إزالة مشاركتك من الكيفواي.', ephemeral: true });
        } else {
            data.participants.push(interaction.user.id);
            await interaction.reply({ content: '✅ تمت إضافة مشاركتك بنجاح!', ephemeral: true });
        }

        global.adGiveaways[messageId] = data;
        scheduledData.giveaways[messageId] = data;
        saveSchedule();

        try {
            const message = interaction.message;
            const oldRow = message.components[0];
            const newBtn1 = ButtonBuilder.from(oldRow.components[0]).setLabel(`المشاركة (${data.participants.length})`);
            const newBtn2 = ButtonBuilder.from(oldRow.components[1]);
            const newRow = new ActionRowBuilder().addComponents(newBtn1, newBtn2);
            await message.edit({ components: [newRow] });
        } catch (e) {}
    } 
    else if (interaction.customId === 'ad_list_participants') {
        if (data.participants.length === 0) {
            return interaction.reply({ content: '📭 لا يوجد مشاركون مسجلون حتى الآن.', ephemeral: true });
        }
        const list = data.participants.map(id => `<@${id}>`).join(', ');
        const text = list.length > 1900 ? list.slice(0, 1900) + '...' : list;
        return interaction.reply({ content: `📋 **المشاركون (${data.participants.length}):**\n${text}`, ephemeral: true });
    }
}

module.exports = { 
    setupAdRole, 
    showAdModalDirect, 
    handleAdModalSubmit, 
    handleGiveawayChoice, 
    handleGwModalSubmit, 
    handleAdGiveawayButton, 
    initAdSchedules 
};