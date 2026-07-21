const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType } = require('discord.js');
const fs = require('fs');

// 1. أمر إعداد وتحديد روم الاقتراحات (Forum)
async function sendSuggestionPanel(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: '❌ هذا الأمر للأدوار الإدارية فقط.', ephemeral: true });
    }

    const channel = interaction.options.getChannel('channel');
    if (!channel || channel.type !== ChannelType.GuildForum) {
        return interaction.reply({ content: '❌ يجب أن يكون الروم المختار من نوع منتدى (Forum Channel) لكي يدعم نظام المنشورات!', ephemeral: true });
    }

    let config = fs.existsSync('./serverConfig.json') ? JSON.parse(fs.readFileSync('./serverConfig.json')) : {};
    config[interaction.guild.id] = {
        ...(config[interaction.guild.id] || {}),
        suggestionChannelId: channel.id
    };
    fs.writeFileSync('./serverConfig.json', JSON.stringify(config, null, 2));

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('open_suggestion_modal')
            .setLabel('اكتب اقتراحك 💡')
            .setStyle(ButtonStyle.Primary)
    );

    const embed = new EmbedBuilder()
        .setTitle('💡 نظام الاقتراحات')
        .setDescription(`اضغط على الزر أدناه لتقديم اقتراحك الجديد ليتم نشره في الروم: ${channel}`)
        .setColor(0x3498db);

    await interaction.reply({ content: `✅ تم ربط نظام الاقتراحات بنجاح بروم المنتدى: ${channel}`, ephemeral: true });
    return interaction.channel.send({ embeds: [embed], components: [row] });
}

// 2. فتح نموذج إدخال الاقتراح (Modal)
async function showSuggestionModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('suggestion_modal')
        .setTitle('تقديم اقتراح جديد');

    const suggestionInput = new TextInputBuilder()
        .setCustomId('suggestion_text')
        .setLabel('ما هو اقتراحك للسيرفر؟')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(suggestionInput));
    return interaction.showModal(modal);
}

// 3. استقبال الاقتراح ونشره في روم المنتدى المحدد وتحويله إلى منشور (Thread)
async function handleSuggestionSubmit(interaction) {
    const suggestionText = interaction.fields.getTextInputValue('suggestion_text');
    const guild = interaction.guild;

    let config = fs.existsSync('./serverConfig.json') ? JSON.parse(fs.readFileSync('./serverConfig.json')) : {};
    const guildData = config[guild.id] || {};
    const suggestionChannelId = guildData.suggestionChannelId;

    if (!suggestionChannelId) {
        return interaction.reply({ content: '❌ لم يتم تحديد روم الاقتراحات من قبل الإدارة بعد! يرجى استخدام أمر الإعداد.', ephemeral: true });
    }

    const forumChannel = guild.channels.cache.get(suggestionChannelId);
    if (!forumChannel || forumChannel.type !== ChannelType.GuildForum) {
        return interaction.reply({ content: '❌ روم الاقتراحات المحدد غير موجود أو تم حذفه أو ليس من نوع منتدى.', ephemeral: true });
    }

    await interaction.reply({ content: '⏳ جاري نشر اقتراحك...', ephemeral: true });

    try {
        // إنشاء منشور جديد داخل المنتدى
        const thread = await forumChannel.threads.create({
            name: `suggest-${interaction.user.username}`.slice(0, 100),
            message: {
                content: `User: <@${interaction.user.id}>`,
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Warner suggest System')
                        .setDescription(suggestionText)
                        .setColor(0x2f3136)
                ]
            }
        });

        // إضافة تفاعلات الإعجاب والرفض للرسالة الأولى
        const starterMessage = await thread.fetchStarterMessage();
        if (starterMessage) {
            await starterMessage.react('✅').catch(() => {});
            await starterMessage.react('❌').catch(() => {});
        }

        // إضافة أزرار التحكم الإدارية داخل المنشور
        const adminRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('sug_delete').setLabel('حذف').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
            new ButtonBuilder().setCustomId('sug_call').setLabel('استدعاء').setStyle(ButtonStyle.Secondary).setEmoji('📢'),
            new ButtonBuilder().setCustomId('sug_remind').setLabel('تذكير').setStyle(ButtonStyle.Primary).setEmoji('⏰')
        );

        await thread.send({ content: `**تحكم الإدارة بالاقتراح:**`, components: [adminRow] });

        return interaction.editReply({ content: `✅ تم نشر اقتراحك بنجاح في المنشور: ${thread}` });
    } catch (e) {
        console.error(e);
        return interaction.editReply({ content: '❌ حدث خطأ أثناء نشر الاقتراح.' });
    }
}

// 4. معالجة أزرار التحكم الإدارية (حذف، استدعاء، تذكير) داخل المنشور
async function handleSuggestionButtons(interaction) {
    if (!interaction.isButton()) return;
    const thread = interaction.channel;

    if (!thread.isThread()) {
        return interaction.reply({ content: '❌ هذه الأزرار تعمل داخل منشورات الاقتراحات فقط.', ephemeral: true });
    }

    if (interaction.customId === 'sug_delete') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ هذا الزر للإدارة فقط.', ephemeral: true });
        }
        await interaction.reply({ content: '🗑️ جاري حذف الاقتراح...' });
        setTimeout(async () => {
            await thread.delete().catch(() => {});
        }, 1500);
    } 
    else if (interaction.customId === 'sug_call') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ هذا الزر للإدارة فقط.', ephemeral: true });
        }
        return interaction.reply({ content: `📢 **تنبيه إداري:** تم استدعاء صاحب الاقتراح لمناقشة التفاصيل.` });
    } 
    else if (interaction.customId === 'sug_remind') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ هذا الزر للإدارة فقط.', ephemeral: true });
        }
        return interaction.reply({ content: `⏰ **تذكير:** تم تسجيل تذكير بخصوص هذا الاقتراح.` });
    }
}

module.exports = { 
    sendSuggestionPanel, 
    showSuggestionModal, 
    handleSuggestionSubmit, 
    handleSuggestionButtons 
};