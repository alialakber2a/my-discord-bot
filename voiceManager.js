const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');

function handleVoiceCommands(interaction) {
    if (interaction.commandName === 'join') {
        const channel = interaction.member.voice.channel;
        if (!channel) return interaction.reply('❌ يجب أن تكون في قناة صوتية!');
        
        joinVoiceChannel({ 
            channelId: channel.id, 
            guildId: interaction.guild.id, 
            adapterCreator: interaction.guild.voiceAdapterCreator, 
            selfDeaf: true 
        });
        interaction.reply(' ### تِسمحولنا نكعد وياكم لولا ؟ <a:AK61:1501966186966159530> ');
    }

    if (interaction.commandName === 'leave') {
        const connection = getVoiceConnection(interaction.guild.id);
        
        if (connection) {
            connection.destroy();
            interaction.reply('### الكعدة وياكم حلوة بس انه انامن من وكت <:AK297:1522413155698085968>');
        } else {
            // هذا الجزء هو المهم: إذا لم يجد الاتصال، نحاول إجبار البوت على المغادرة بالقوة
            try {
                interaction.guild.members.me.voice.disconnect();
                interaction.reply('👋 **تم إخراج البوت من القناة .**');
            } catch (e) {
                interaction.reply('❌ البوت ليس في قناة صوتية أو لا أملك صلاحية إخراجه.');
            }
        }
    }
}

module.exports = { handleVoiceCommands };