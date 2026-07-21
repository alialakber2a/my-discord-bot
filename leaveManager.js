const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

async function showLeaveModal(interaction) {
    const modal = new ModalBuilder().setCustomId('leave_modal').setTitle('✈️ طلب إجازة رسمي');
    modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('سبب الإجازة').setStyle(TextInputStyle.Paragraph).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('days').setLabel('عدد الأيام (مثال: 3)').setStyle(TextInputStyle.Short).setRequired(true))
    );
    await interaction.showModal(modal);
}

async function handleLeaveSubmit(interaction, guildData) {
    const reason = interaction.fields.getTextInputValue('reason');
    const days = parseInt(interaction.fields.getTextInputValue('days'));
    
    if (isNaN(days)) return interaction.reply({ content: '❌ يجب إدخال رقم صحيح للأيام.', ephemeral: true });
    if (!guildData.adminChannel) return interaction.reply({ content: '❌ لم يتم ضبط روم الإدارة بعد من قبل المشرفين.', ephemeral: true });

    const embed = new EmbedBuilder()
        .setTitle('📢 طلب إجازة جديد')
        .setColor(0x3498db)
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
            { name: '👤 العضو', value: `${interaction.user}`, inline: true },
            { name: '📝 السبب', value: reason, inline: true },
            { name: '⏳ المدة', value: `**${days}** يوم`, inline: true }
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`accept_${interaction.user.id}_${days}`).setLabel('قبول').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`reject_${interaction.user.id}`).setLabel('رفض').setStyle(ButtonStyle.Danger)
    );

    const adminChannel = interaction.client.channels.cache.get(guildData.adminChannel);
    if (adminChannel) {
        await adminChannel.send({ content: 'طلب إجازة جديد للإدارة:', embeds: [embed], components: [row] });
        interaction.reply({ content: '✅ **تم رفع طلبك للإدارة بنجاح.**', ephemeral: true });
    } else {
        interaction.reply({ content: '❌ لم أتمكن من العثور على روم الإدارة.', ephemeral: true });
    }
}

async function handleLeaveButton(interaction, guildData, history, saveFiles) {
    const [action, userId, days] = interaction.customId.split('_');
    const member = await interaction.guild.members.fetch(userId);
    
    const row = ActionRowBuilder.from(interaction.message.components[0]);
    row.components.forEach(c => c.setDisabled(true));
    await interaction.message.edit({ components: [row] });

    if (action === 'accept') {
        history[userId] = (history[userId] || 0) + parseInt(days);
        
        // إعطاء رتبة الإجازة
        if (guildData.leaveRole) {
            try { await member.roles.add(guildData.leaveRole); } catch(e) { console.log('تعذر إعطاء الرتبة'); }
        }
        saveFiles();

        // إرسال السجل لروم الـ Log
        const logChannel = interaction.client.channels.cache.get(guildData.logChannel);
        if (logChannel) {
            logChannel.send(`✅ **تم قبول إجازة ${member.user.tag} لمدة ${days} يوم من قبل ${interaction.user}. وتم منحه رتبة الإجازة.**`);
        }

        // إرسال رسالة للخاص
        try { 
            await member.send({ content: `✅ تم قبول إجازتك لمدة **${days}** يوم. وتم منحك رتبة الإجازة.` }); 
        } catch (e) {}

        interaction.reply(`✅ **تم قبول الإجازة ومنح الرتبة بنجاح.**`);
    } else {
        interaction.reply(`❌ **تم رفض طلب إجازة ${member.user.tag}.**`);
    }
}

module.exports = { showLeaveModal, handleLeaveSubmit, handleLeaveButton };