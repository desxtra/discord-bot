const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { 
    getQueue, 
    deleteQueue,
    searchYouTube, 
    getVideoInfo, 
    isYouTubeUrl,
    createMusicEmbed,
    createControlButtons,
    createQueueEmbed
} = require('../utils/music');

// Play Command
const playCommand = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play music from YouTube')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Song name or YouTube URL')
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.editReply('❌ Join a voice channel first!');
        }

        const query = interaction.options.getString('query');
        let songInfo;

        if (isYouTubeUrl(query)) {
            songInfo = await getVideoInfo(query);
        } else {
            songInfo = await searchYouTube(query);
        }

        if (!songInfo) {
            return interaction.editReply('❌ Could not find that song!');
        }

        const queue = getQueue(interaction.guildId);

        if (!queue.connection) {
            queue.connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guildId,
                adapterCreator: interaction.guild.voiceAdapterCreator,
            });
            await entersState(queue.connection, VoiceConnectionStatus.Ready, 30_000);
        }

        await queue.add(songInfo);

        if (queue.songs.length === 0 && queue.currentSong) {
            try {
                const embed = createMusicEmbed(queue);
                const buttons = createControlButtons(false, queue.isPlaying);
                await interaction.editReply({ embeds: [embed], components: [buttons] });
            } catch (error) {
                if (error.code === 50001) {
                    // If we can't update the message, just send a simple response
                    await interaction.editReply(`✅ Playing **${songInfo.title}**`);
                } else {
                    throw error;
                }
            }
        } else {
            await interaction.editReply(`✅ **${songInfo.title}** added to queue!`);
        }
    }
};

// Skip Command
const skipCommand = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip current song'),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);
        
        if (!queue.isPlaying) {
            return interaction.reply({ content: '❌ Nothing is playing!', ephemeral: true });
        }

        queue.skip();
        await interaction.reply('⏭️ Skipped!');
    }
};

// Stop Command
const stopCommand = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop music and clear queue'),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);
        
        if (!queue.isPlaying) {
            return interaction.reply({ content: '❌ Nothing is playing!', ephemeral: true });
        }

        queue.stop();
        deleteQueue(interaction.guildId);
        await interaction.reply('⏹️ Stopped and cleared queue!');
    }
};

// Queue Command
const queueCommand = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show music queue'),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);
        const embed = createQueueEmbed(queue);
        await interaction.reply({ embeds: [embed] });
    }
};

// Now Playing Command
const nowPlayingCommand = {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show currently playing song'),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);
        
        if (!queue.currentSong) {
            return interaction.reply({ content: '❌ Nothing is playing!', ephemeral: true });
        }

        const embed = createMusicEmbed(queue);
        const buttons = createControlButtons(false, queue.isPlaying);
        await interaction.reply({ embeds: [embed], components: [buttons] });
    }
};

// Volume Command
const volumeCommand = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Set volume level')
        .addIntegerOption(option =>
            option.setName('level')
                .setDescription('Volume (0-200)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(200)
        ),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);
        const level = interaction.options.getInteger('level');
        
        queue.setVolume(level / 100);
        await interaction.reply(`🔊 Volume: ${level}%`);
    }
};

// Loop Command
const loopCommand = {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Toggle loop mode'),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);
        
        if (!queue.isPlaying) {
            return interaction.reply({ content: '❌ Nothing is playing!', ephemeral: true });
        }

        const status = queue.toggleLoop();
        await interaction.reply(`🔁 Loop ${status ? 'ON' : 'OFF'}!`);
    }
};

// Pause Command
const pauseCommand = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause current song'),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);
        
        if (!queue.isPlaying) {
            return interaction.reply({ content: '❌ Nothing is playing!', ephemeral: true });
        }

        if (queue.isPaused) {
            return interaction.reply({ content: '❌ Already paused!', ephemeral: true });
        }

        queue.pause();
        await interaction.reply('⏸️ Paused!');
    }
};

// Resume Command
const resumeCommand = {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resume paused song'),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);
        
        if (!queue.isPaused) {
            return interaction.reply({ content: '❌ Not paused!', ephemeral: true });
        }

        queue.resume();
        await interaction.reply('▶️ Resumed!');
    }
};

module.exports = [
    playCommand,
    skipCommand,
    stopCommand,
    queueCommand,
    nowPlayingCommand,
    volumeCommand,
    loopCommand,
    pauseCommand,
    resumeCommand
];