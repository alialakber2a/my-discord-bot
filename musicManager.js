const { createAudioPlayer, createAudioResource, joinVoiceChannel, AudioPlayerStatus } = require('@discordjs/voice');
const play = require('play-dl');
const yts = require('yt-search');

const players = new Map();

async function playSong(interaction) {
    if (!interaction.member.voice.channel) {
        return interaction.reply({ content: '❌ يجب أن تكون متصلاً بروم صوتي أولاً!', ephemeral: true });
    }

    const query = interaction.options.getString('query');
    const voiceChannel = interaction.member.voice.channel;

    await interaction.deferReply();

    try {
        const searchResult = await yts(query);
        if (!searchResult || searchResult.videos.length === 0) {
            return interaction.editReply({ content: '❌ لم يتم العثور على نتائج مطابقة لهذا الاسم.' });
        }

        const song = searchResult.videos[0];
        
        // استخدام رابط احتياطي آمن أو دفق متوافق
        const streamData = await play.stream(song.url, { discordPlayerCompatibility: true }).catch(async () => {
            return await play.stream(song.url);
        });

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });

        const player = createAudioPlayer();
        const resource = createAudioResource(streamData.stream, {
            inputType: streamData.type
        });

        connection.subscribe(player);
        player.play(resource);
        players.set(voiceChannel.guild.id, { connection, player });

        player.on(AudioPlayerStatus.Playing, () => {
            return interaction.editReply({ content: `🎶 **تم التشغيل بنجاح:** \`${song.title}\`` });
        });

        player.on('error', error => {
            console.error('Player Error:', error);
            interaction.editReply({ content: '❌ حدث خطأ أثناء تشغيل المقطع.' }).catch(() => {});
        });

    } catch (e) {
        console.error('Play Command Error:', e);
        return interaction.editReply({ content: '❌ عذراً، تعذر تشغيل هذا المقطع. جرب اسماً آخر.' });
    }
}

async function skipSong(interaction) {
    return interaction.reply({ content: 'ℹ️ النظام يعمل بالتشغيل المباشر.', ephemeral: true });
}

async function stopMusic(interaction) {
    const serverPlayer = players.get(interaction.guildId);
    if (!serverPlayer) {
        return interaction.reply({ content: '❌ البوت ليس متصلاً بروم صوتي!', ephemeral: true });
    }

    try {
        serverPlayer.player.stop();
        serverPlayer.connection.destroy();
        players.delete(interaction.guildId);
        return interaction.reply({ content: '⏹️ تم إيقاف الصوت ومغادرة الفويز.' });
    } catch (e) {
        return interaction.reply({ content: '❌ حدث خطأ أثناء إيقاف المشغل.', ephemeral: true });
    }
}

async function showQueue(interaction) {
    return interaction.reply({ content: 'ℹ️ نظام التشغيل الفوري.', ephemeral: true });
}

module.exports = { playSong, skipSong, stopMusic, showQueue };