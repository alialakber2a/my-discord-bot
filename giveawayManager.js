const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = './giveaways.json';

let giveaways = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : {};

function saveGiveaways() {
    fs.writeFileSync(path, JSON.stringify(giveaways, null, 2));
}

function parseDuration(timeStr) {
    const regex = /^(\d+)([smhd])$/;
    const match = timeStr.match(regex);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2];
    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return null;
    }
}

// بدء المسابقة
async function startGiveaway(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: '❌ هذا الأمر للأدوار الإدارية فقط.', ephemeral: true });
    }

    const prize = interaction.options.getString('prize') || 'جائزة قيمة';
    const durationStr = interaction.options.getString('duration') || '1m';
    const winnersCount = interaction.options.getInteger('winners') || 1;
    const giveawayType = interaction.options.getString('type') || 'button';

    const durationMs = parseDuration(durationStr);
    if (!durationMs) {
        return interaction.reply({ content: '❌ صيغة الوقت غير صحيحة! استخدم مثلاً: `1m`، `1h`، أو `1d`.', ephemeral: true });
    }

    const endsAt = Date.now() + durationMs;
    const endsTimestamp = Math.floor(endsAt / 1000);

    const descriptionText = giveawayType === 'button' 
        ? 'اضغط على الزر أدناه للمشاركة في الكيفواي!' 
        : 'اضغط على تفاعل الـ **🎉** أدناه للمشاركة في الكيفواي!';

    const embed = new EmbedBuilder()
        .setTitle('🎉 مسابقة جديدة!')
        .setDescription(descriptionText)
        .addFields(
            { name: '🎁 الجائزة', value: `**${prize}**`, inline: false },
            { name: '🏆 الفائزون', value: `**${winnersCount}**`, inline: true },
            { name: '👑 برعاية (المقدم)', value: `${interaction.user}`, inline: true },
            { name: '⏳ تنتهي في', value: `<t:${endsTimestamp}:R> (<t:${endsTimestamp}:f>)`, inline: false }
        )
        .setColor(0xf1c40f)
        .setTimestamp();

    await interaction.reply({ content: '✅ تم بدء المسابقة بنجاح!', ephemeral: true });

    let msg;
    if (giveawayType === 'button') {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('join_giveaway').setLabel('المشاركة (0)').setStyle(ButtonStyle.Success).setEmoji('🎉'),
            new ButtonBuilder().setCustomId('list_participants').setLabel('المشاركون').setStyle(ButtonStyle.Secondary).setEmoji('📋')
        );
        msg = await interaction.channel.send({ embeds: [embed], components: [row] });
    } else {
        msg = await interaction.channel.send({ embeds: [embed] });
        await msg.react('🎉');
    }

    giveaways[msg.id] = {
        messageId: msg.id,
        channelId: interaction.channel.id,
        guildId: interaction.guild.id,
        prize: prize,
        winnersCount: winnersCount,
        hostId: interaction.user.id,
        endsAt: endsAt,
        type: giveawayType,
        participants: []
    };
    saveGiveaways();

    scheduleGiveaway(msg.client, msg.id, durationMs);
}

function scheduleGiveaway(client, messageId, delay) {
    setTimeout(async () => {
        await checkAndEndGiveaway(client, messageId);
    }, delay);
}

async function checkAndEndGiveaway(client, messageId) {
    const data = giveaways[messageId];
    if (!data) return;

    try {
        const guild = await client.guilds.fetch(data.guildId);
        const channel = await guild.channels.fetch(data.channelId);
        const message = await channel.messages.fetch(data.messageId);

        let usersArray = [];

        if (data.type === 'button') {
            usersArray = data.participants || [];
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('join_giveaway').setLabel('انتهت المسابقة').setStyle(ButtonStyle.Danger).setDisabled(true),
                new ButtonBuilder().setCustomId('list_participants').setLabel(`المشاركون (${usersArray.length})`).setStyle(ButtonStyle.Secondary).setDisabled(true)
            );
            await message.edit({ components: [disabledRow] }).catch(() => {});
        } else {
            const reaction = message.reactions.cache.get('🎉');
            if (reaction) {
                const fetchedUsers = await reaction.users.fetch();
                usersArray = fetchedUsers.filter(user => !user.bot).map(user => user.id);
            }
        }

        if (usersArray.length === 0) {
            const endedEmbed = EmbedBuilder.from(message.embeds[0])
                .setTitle('🎉 انتهت المسابقة')
                .setDescription(`❌ لم يشارك أحد في المسابقة.\n👑 **الكيفواي برعاية:** <@${data.hostId}>`)
                .setColor(0xe74c3c);

            await message.edit({ embeds: [endedEmbed] });
            delete giveaways[messageId];
            saveGiveaways();
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

        await message.edit({ embeds: [endedEmbed] });
        await channel.send(`🎊 مبروك ${winnersMentions}! لقد فزتم بـ **${data.prize}**!\n👑 الكيفواي برعاية: <@${data.hostId}>`);

        delete giveaways[messageId];
        saveGiveaways();
    } catch (e) {
        console.error('Error ending giveaway:', e);
        delete giveaways[messageId];
        saveGiveaways();
    }
}

async function initGiveaways(client) {
    const now = Date.now();
    for (const messageId in giveaways) {
        const data = giveaways[messageId];
        const timeLeft = data.endsAt - now;

        if (timeLeft <= 0) {
            await checkAndEndGiveaway(client, messageId);
        } else {
            scheduleGiveaway(client, messageId, timeLeft);
        }
    }
}

async function handleGiveawayButton(interaction) {
    if (!interaction.isButton()) return;
    const messageId = interaction.message.id;

    if (!giveaways[messageId]) return;

    const data = giveaways[messageId];

    if (interaction.customId === 'join_giveaway') {
        const index = data.participants.indexOf(interaction.user.id);
        if (index > -1) {
            data.participants.splice(index, 1);
            saveGiveaways();
            await interaction.reply({ content: '❌ تم إزالة مشاركتك من الكيفواي.', ephemeral: true });
        } else {
            data.participants.push(interaction.user.id);
            saveGiveaways();
            await interaction.reply({ content: '✅ تمت إضافة مشاركتك بنجاح!', ephemeral: true });
        }

        try {
            const message = interaction.message;
            const oldRow = message.components[0];
            const newBtn1 = ButtonBuilder.from(oldRow.components[0]).setLabel(`المشاركة (${data.participants.length})`);
            const newBtn2 = ButtonBuilder.from(oldRow.components[1]);
            const newRow = new ActionRowBuilder().addComponents(newBtn1, newBtn2);
            await message.edit({ components: [newRow] });
        } catch (e) {}
    } 
    else if (interaction.customId === 'list_participants') {
        if (data.participants.length === 0) {
            return interaction.reply({ content: '📭 لا يوجد مشاركون مسجلون حتى الآن.', ephemeral: true });
        }
        const list = data.participants.map(id => `<@${id}>`).join(', ');
        const text = list.length > 1900 ? list.slice(0, 1900) + '...' : list;
        return interaction.reply({ content: `📋 **المشاركون (${data.participants.length}):**\n${text}`, ephemeral: true });
    }
}

async function endGiveawayManual(message, client) {
    if (giveaways[message.id]) {
        await checkAndEndGiveaway(client, message.id);
    } else {
        await message.reply('❌ هذه المسابقة غير مسجلة أو انتهت مسبقاً.');
    }
}

module.exports = { startGiveaway, endGiveawayManual, handleGiveawayButton, initGiveaways };