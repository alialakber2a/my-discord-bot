const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');
const { token } = require('./config.json');
const fs = require('fs');

// --- نظام تسجيل الأخطاء التلقائي في ملف error.log ---
process.on('uncaughtException', (error) => {
    fs.appendFileSync('./error.log', `[Uncaught Exception] ${error.stack}\n\n`);
});
process.on('unhandledRejection', (error) => {
    fs.appendFileSync('./error.log', `[Unhandled Rejection] ${error.stack || error}\n\n`);
});
// ----------------------------------------------------

const { showAdModalDirect, handleAdModalSubmit, handleGiveawayChoice, handleGwModalSubmit, setupAdRole, handleAdGiveawayButton, initAdSchedules } = require('./adManager');
const { handleReplies, addReply, saveNewReply, listReplies, deleteReply } = require('./repliesManager');
const { startGiveaway, endGiveaway, handleGiveawayButton, initGiveaways } = require('./giveawayManager');
const { handleVoiceCommands } = require('./voiceManager');
const { showLeaveModal, handleLeaveSubmit, handleLeaveButton } = require('./leaveManager');
const { handleKtMessage } = require('./ktManager'); 
const { playSong, skipSong, stopMusic, showQueue } = require('./musicManager'); 
const { sendCustomEmbed } = require('./embedManager');
const { sendSuggestionPanel, showSuggestionModal, handleSuggestionSubmit, handleSuggestionButtons } = require('./suggestionManager');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildVoiceStates
    ]
});

let config = fs.existsSync('./serverConfig.json') ? JSON.parse(fs.readFileSync('./serverConfig.json')) : {};
let history = fs.existsSync('./history.json') ? JSON.parse(fs.readFileSync('./history.json')) : {};

function saveFiles() {
    fs.writeFileSync('./serverConfig.json', JSON.stringify(config, null, 2));
    fs.writeFileSync('./history.json', JSON.stringify(history, null, 2));
}

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.guild) return interaction.reply({ content: '❌ تعمل الأوامر داخل السيرفرات فقط.', ephemeral: true });
    const guildData = config[interaction.guild.id] || {};

    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'join' || interaction.commandName === 'leave') return handleVoiceCommands(interaction);
        if (interaction.commandName === 'gstart') return startGiveaway(interaction);
        if (interaction.commandName === 'g-end') {
            try {
                const msg = await interaction.channel.messages.fetch(interaction.options.getString('msg-id'));
                await endGiveaway(msg);
                return interaction.reply({ content: 'تم إنهاء المسابقة! ✅', ephemeral: true });
            } catch (e) { return interaction.reply({ content: '❌ خطأ.', ephemeral: true }); }
        }
        
        if (interaction.commandName === 'add_reply') return addReply(interaction);
        if (interaction.commandName === 'list_replies') return listReplies(interaction);
        if (interaction.commandName === 'delete_reply') return deleteReply(interaction);
        if (interaction.commandName === 'embed') return sendCustomEmbed(interaction);
        
        // --- أوامر الأغاني ---
        if (interaction.commandName === 'play') return playSong(interaction);
        if (interaction.commandName === 'skip') return skipSong(interaction);
        if (interaction.commandName === 'stop') return stopMusic(interaction);
        if (interaction.commandName === 'queue') return showQueue(interaction);

        // --- أمر إعداد وتحديد روم الاقتراحات ---
        if (interaction.commandName === 'setup_suggestions') {
            return sendSuggestionPanel(interaction);
        }

        // --- أمر فتح نموذج الإعلان المباشر فوراً ---
        if (interaction.commandName === 'ad') {
            return showAdModalDirect(interaction);
        }

        if (interaction.commandName === 'set_ad_role') {
            return setupAdRole(interaction);
        }

        if (interaction.commandName === 'setup_kt') {
            if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ للأدوار الإدارية فقط.', ephemeral: true });
            const ktChannel = interaction.options.getChannel('channel');

            let currentChannels = guildData.ktChannels || (guildData.ktChannel ? [guildData.ktChannel] : []);
            if (!currentChannels.includes(ktChannel.id)) {
                currentChannels.push(ktChannel.id);
            }

            config[interaction.guild.id] = {
                ...guildData,
                ktChannels: currentChannels
            };
            saveFiles();

            return interaction.reply({ content: `✅ تم إضافة الروم ${ktChannel} إلى قائمة رومات الكت المخصصة بنجاح!`, ephemeral: true });
        }
        
        if (interaction.commandName === 'send_leave_panel') {
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_leave_modal').setLabel('تقديم طلب إجازة').setStyle(ButtonStyle.Primary));
            return interaction.reply({ content: 'اضغط الزر أدناه لطلب إجازة:', components: [row] });
        }

        if (interaction.commandName === 'setup_leave') {
            if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ للأدوار الإدارية فقط.', ephemeral: true });
            
            const adminChannel = interaction.options.getChannel('channel');
            const logChannel = interaction.options.getChannel('log');
            const leaveRole = interaction.options.getRole('role');

            config[interaction.guild.id] = {
                ...guildData,
                adminChannel: adminChannel.id,
                logChannel: logChannel.id,
                leaveRole: leaveRole.id
            };
            saveFiles();

            return interaction.reply({ content: `✅ تم ضبط نظام الإجازات بنجاح:\n📌 روم الإدارة: ${adminChannel}\n📁 روم السجلات: ${logChannel}\n🎭 رتبة الإجازة: ${leaveRole}`, ephemeral: true });
        }

        if (interaction.commandName === 'leave_logs') {
            const totalUsed = history[interaction.user.id] || 0;
            const limit = 5;
            const remaining = Math.max(0, limit - totalUsed);

            const profileEmbed = new EmbedBuilder()
                .setTitle(`📊 بروفايل الإجازات: ${interaction.user.username}`)
                .setThumbnail(interaction.user.displayAvatarURL())
                .addFields(
                    { name: '✅ الإجازات المستخدمة', value: `**${totalUsed}** يوم`, inline: true },
                    { name: '⏳ الإجازات المتبقية', value: `**${remaining}** يوم`, inline: true }
                )
                .setColor(0x3498db)
                .setTimestamp();
            return interaction.reply({ embeds: [profileEmbed], ephemeral: true });
        }

        if (interaction.commandName === 'all_leaves') {
            if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ للأدوار الإدارية فقط.', ephemeral: true });
            
            let desc = Object.entries(history).map(([id, days]) => `👤 <@${id}>: **${days}** يوم`).join('\n') || 'لا يوجد إجازات مسجلة حتى الآن.';
            
            const allEmbed = new EmbedBuilder()
                .setTitle('📋 سجل إجازات جميع الأعضاء')
                .setDescription(desc)
                .setColor(0xf1c40f)
                .setTimestamp();
            return interaction.reply({ embeds: [allEmbed] });
        }
    }

    else if (interaction.isButton()) {
        if (interaction.customId === 'open_leave_modal') return showLeaveModal(interaction);
        
        // --- أزرار نظام الاقتراحات ---
        if (interaction.customId === 'open_suggestion_modal') {
            return showSuggestionModal(interaction);
        }
        if (interaction.customId.startsWith('sug_')) {
            return handleSuggestionButtons(interaction);
        }

        // --- أزرار الكيفواي للإعلانات ---
        if (interaction.customId === 'ad_join_giveaway' || interaction.customId === 'ad_list_participants') {
            return handleAdGiveawayButton(interaction);
        }

        // --- أزرار اختيار الكيفواي التابعة لنموذج الإعلان ---
        if (interaction.customId.startsWith('ad_gw_yes_') || interaction.customId.startsWith('ad_gw_no_')) {
            return handleGiveawayChoice(interaction);
        }

        if (interaction.customId.startsWith('accept_') || interaction.customId.startsWith('reject_')) {
            return handleLeaveButton(interaction, guildData, history, saveFiles);
        }
        if (interaction.customId === 'join_giveaway' || interaction.customId === 'list_participants') {
            return handleGiveawayButton(interaction);
        }
    }

    else if (interaction.isModalSubmit()) {
        if (interaction.customId === 'add_reply_modal') return saveNewReply(interaction);
        if (interaction.customId === 'leave_modal') return handleLeaveSubmit(interaction, guildData);
        
        // --- نموذج إرسال الاقتراح ---
        if (interaction.customId === 'suggestion_modal') {
            return handleSuggestionSubmit(interaction);
        }

        // --- نماذج الإعلانات والكيفواي ---
        if (interaction.customId === 'ad_modal_step1') return handleAdModalSubmit(interaction);
        if (interaction.customId === 'ad_gw_modal') return handleGwModalSubmit(interaction);
    }
});

client.on(Events.MessageCreate, async message => {
    if (!message.guild || message.author.bot) return;
    const guildData = config[message.guild.id] || {};

    handleKtMessage(message, guildData);
    handleReplies(message);
});

client.on(Events.GuildMemberAdd, member => {
    const guildData = config[member.guild.id];
    if (guildData?.welcomeChannel) {
        member.guild.channels.cache.get(guildData.welcomeChannel)?.send(guildData.welcomeMessage.replace(/{user}/g, `<@${member.id}>`));
    }
});

client.once('ready', () => { 
    console.log(`✅ البوت يعمل بنجاح تام: ${client.user.tag}`);
    
    initGiveaways(client);
    initAdSchedules(client);

    client.user.setPresence({
        activities: [{ name: 'by : ali_al_akber2', type: 4 }],
        status: 'idle',
    });
});

client.login(token);