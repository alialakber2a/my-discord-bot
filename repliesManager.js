const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const fs = require('fs');
const staticReplies = require('./staticReplies.js');

// 1. معالجة الردود الواردة في الشات
function handleReplies(message) {
    if (message.author.bot) return;

    // الرد على اسم البوت
    const content = message.content;
    const triggers = ["قوري", "<@1528135685066854551>", "𝐐𝐎𝐑𝐘"];
    if (triggers.some(trigger => content.includes(trigger))) {
        const res = staticReplies.replies[Math.floor(Math.random() * staticReplies.replies.length)];
        return message.reply({ content: res, allowedMentions: { repliedUser: true } });
    }

    // الردود المخصصة المخزنة في replies.json
    let replies = fs.existsSync('./replies.json') ? JSON.parse(fs.readFileSync('./replies.json')) : {};

    for (const [trigger, data] of Object.entries(replies)) {
        let isMatch = (data.type === 'exact') 
            ? (content.trim() === trigger.trim()) 
            : (content.toLowerCase().includes(trigger.toLowerCase()));

        if (isMatch) {
            // فحص شروط الرتبة (إن وجدت)
            if (data.requiredRole && data.requiredRole.length > 5) {
                if (!message.member || !message.member.roles.cache.has(data.requiredRole)) continue;
            }

            if (data.deleteUserMsg) {
                try { message.delete(); } catch (e) {}
            }

            let responseText = data.responses[Math.floor(Math.random() * data.responses.length)];
            responseText = responseText.replace(/{user}/g, `<@${message.author.id}>`);

            let sendPayload = { content: responseText };

            if (data.useReply) {
                sendPayload.allowedMentions = { repliedUser: true };
                message.reply(sendPayload);
            } else {
                message.channel.send(sendPayload);
            }

            break;
        }
    }
}

// 2. واجهة الـ Modal لإضافة رد (بعناوين قصيرة ومطابقة لمتطلبات ديسكورد)
async function addReply(interaction) {
    const modal = new ModalBuilder().setCustomId('add_reply_modal').setTitle('إعداد رد تلقائي متطور');
    
    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('trigger')
                .setLabel('الكلمة المفتاحية (Trigger)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('مثال: السلام عليكم')
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('response')
                .setLabel('نص الرد (استخدم {user} للإشارة)')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('مثال: وعليكم السلام أهلاً بك {user}')
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('match_type')
                .setLabel('نوع المطابقة: exact أو contains')
                .setStyle(TextInputStyle.Short)
                .setValue('contains')
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('options')
                .setLabel('الخيارات: (Reply, Delete | أيدي الرتبة)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('مثال: نعم, لا | 123456789 (أو اتركه فارغاً)')
                .setRequired(true)
        )
    );
    
    await interaction.showModal(modal);
}

// 3. حفظ الرد من الـ Modal
function saveNewReply(interaction) {
    const trigger = interaction.fields.getTextInputValue('trigger');
    const response = interaction.fields.getTextInputValue('response');
    const matchType = interaction.fields.getTextInputValue('match_type').toLowerCase().trim() === 'exact' ? 'exact' : 'contains';
    
    const optionsInput = interaction.fields.getTextInputValue('options');
    const parts = optionsInput.split('|').map(p => p.trim());
    const mainOpts = parts[0].split(/[\s,]+/).map(o => o.toLowerCase());

    const useReply = mainOpts[0] === 'نعم' || mainOpts[0] === 'yes' || mainOpts[0] === 'true';
    const deleteUserMsg = mainOpts[1] === 'نعم' || mainOpts[1] === 'yes' || mainOpts[1] === 'true';

    let requiredRole = null;
    if (parts[1] && parts[1].length > 5) {
        requiredRole = parts[1].replace(/[^0-9]/g, '');
    }

    let replies = fs.existsSync('./replies.json') ? JSON.parse(fs.readFileSync('./replies.json')) : {};
    
    replies[trigger] = {
        responses: [response],
        type: matchType,
        useEmbed: false,
        useReply: useReply,
        deleteUserMsg: deleteUserMsg,
        requiredRole: requiredRole
    };

    fs.writeFileSync('./replies.json', JSON.stringify(replies, null, 2));
    
    interaction.reply({ 
        content: `✅ **تم إضافة الرد بنجاح!**\n- الكلمة: \`${trigger}\`\n- النوع: \`${matchType}\`\n- ريبلاي: \`${useReply ? 'نعم' : 'لا'}\`\n- حذف رسالة العضو: \`${deleteUserMsg ? 'نعم' : 'لا'}\`\n- الرتبة المطلوبة: \`${requiredRole ? '<@&' + requiredRole + '>' : 'الكل (بدون رتبة)'}\``, 
        ephemeral: true 
    });
}

// 4. عرض الردود المخزنة
function listReplies(interaction) {
    let replies = fs.existsSync('./replies.json') ? JSON.parse(fs.readFileSync('./replies.json')) : {};
    const keys = Object.keys(replies);

    if (keys.length === 0) {
        return interaction.reply({ content: '❌ لا توجد أي ردود مخزنة حالياً.', ephemeral: true });
    }

    let desc = '';
    keys.forEach((trigger, index) => {
        const data = replies[trigger];
        desc += `**${index + 1}.** الكلمة: \`${trigger}\`\n- النوع: \`${data.type}\` | رتبة مطلوبة: \`${data.requiredRole ? '<@&' + data.requiredRole + '>' : 'الكل'}\`\n`;
    });

    const embed = new EmbedBuilder()
        .setTitle('📋 قائمة الردود التلقائية المخزنة')
        .setDescription(desc)
        .setColor(0xf1c40f)
        .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

// 5. حذف رد معين
function deleteReply(interaction) {
    const trigger = interaction.options.getString('trigger');
    let replies = fs.existsSync('./replies.json') ? JSON.parse(fs.readFileSync('./replies.json')) : {};

    if (!replies[trigger]) {
        return interaction.reply({ content: `❌ لم يتم العثور على رد بالكلمة المفتاحية: \`${trigger}\``, ephemeral: true });
    }

    delete replies[trigger];
    fs.writeFileSync('./replies.json', JSON.stringify(replies, null, 2));

    return interaction.reply({ content: `✅ **تم حذف الرد الخاص بـ:** \`${trigger}\` بنجاح!`, ephemeral: true });
}

module.exports = { handleReplies, addReply, saveNewReply, listReplies, deleteReply };