const { EmbedBuilder } = require('discord.js');

async function sendCustomEmbed(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: '❌ هذا الأمر للأدوار الإدارية فقط.', ephemeral: true });
    }

    const channel = interaction.options.getChannel('channel');
    const content = interaction.options.getString('content');
    const colorInput = interaction.options.getString('color') || '#3498db';

    // تنظيق وفحص كود اللون (Hex Color)
    let embedColor = 0x3498db;
    let cleanedColor = colorInput.replace('#', '').trim();
    if (/^[0-9A-Fa-f]{6}$/.test(cleanedColor)) {
        embedColor = parseInt(cleanedColor, 16);
    }

    const embed = new EmbedBuilder()
        .setDescription(content)
        .setColor(embedColor)
        .setTimestamp();

    try {
        // إرسال الإيمبد للروم المحدد مرة واحدة ولن يتم حفظه في الملفات
        await channel.send({ embeds: [embed] });
        
        return interaction.reply({ content: `✅ تم إرسال الإيمبد بنجاح إلى الروم ${channel} ولن يتم حفظه في الردود التلقائية.`, ephemeral: true });
    } catch (e) {
        return interaction.reply({ content: '❌ حدث خطأ أثناء إرسال الإيمبد، تأكد من صلاحيات البوت في ذلك الروم.', ephemeral: true });
    }
}

module.exports = { sendCustomEmbed };