const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const yts = require('yt-search');

const commands = [
    {
        data: new SlashCommandBuilder()
            .setName('search')
            .setDescription('Search and play music from YouTube')
            .addStringOption(option =>
                option.setName('query')
                    .setDescription('The song to search for')
                    .setRequired(true)),
        async execute(interaction, client) {
            const query = interaction.options.getString('query');
            const voiceChannel = interaction.member.voice.channel;

            if (!voiceChannel) {
                return interaction.editReply('You need to be in a voice channel to use this command!');
            }

            const permissions = voiceChannel.permissionsFor(interaction.client.user);
            if (!permissions.has('Connect') || !permissions.has('Speak')) {
                return interaction.editReply('I need permissions to join and speak in your voice channel!');
            }

            try {
                let songInfo;
                
                if (ytdl.validateURL(query)) {
                    const info = await ytdl.getInfo(query);
                    songInfo = {
                        title: info.videoDetails.title,
                        url: info.videoDetails.video_url,
                        thumbnail: info.videoDetails.thumbnails[0]?.url || null,
                        duration: parseInt(info.videoDetails.lengthSeconds)
                    };
                } else {
                    const searchResults = await yts(query);
                    if (!searchResults.videos.length) {
                        return interaction.editReply('No results found!');
                    }
                    const videoResult = searchResults.videos[0];
                    songInfo = {
                        title: videoResult.title,
                        url: videoResult.url,
                        thumbnail: videoResult.thumbnail,
                        duration: videoResult.duration.seconds
                    };
                }
                    
                    const song = {
                        title: songInfo.title,
                        url: songInfo.url,
                        thumbnail: songInfo.thumbnail,
                        duration: songInfo.duration
                    };

                // Get or create queue for the guild
                if (!client.musicQueues.has(interaction.guildId)) {
                    const queueConstruct = {
                        voiceChannel,
                        connection: null,
                        songs: [],
                        player: createAudioPlayer(),
                        playing: false
                    };
                    client.musicQueues.set(interaction.guildId, queueConstruct);
                }

                const queue = client.musicQueues.get(interaction.guildId);
                queue.songs.push(song);

                if (!queue.playing) {
                    queue.playing = true;
                    queue.connection = joinVoiceChannel({
                        channelId: voiceChannel.id,
                        guildId: interaction.guildId,
                        adapterCreator: interaction.guild.voiceAdapterCreator,
                    });
                    queue.connection.subscribe(queue.player);
                    playSong(queue, interaction.guild, client);
                }

                const embed = new EmbedBuilder()
                    .setTitle('Added to queue')
                    .setDescription(`[${song.title}](${song.url})`);

                if (song.thumbnail) {
                    embed.setThumbnail(song.thumbnail);
                }
                
                embed.setColor('#00ff00');

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('pause')
                            .setLabel('⏸️ Pause')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('resume')
                            .setLabel('▶️ Resume')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('skip')
                            .setLabel('⏭️ Skip')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('stop')
                            .setLabel('⏹️ Stop')
                            .setStyle(ButtonStyle.Danger)
                    );

                await interaction.editReply({ embeds: [embed], components: [row] });
            } catch (error) {
                console.error(error);
                await interaction.editReply('An error occurred while trying to play the song!');
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('pause')
            .setDescription('Pause the current song'),
        async execute(interaction, client) {
            const queue = client.musicQueues.get(interaction.guildId);
            if (!queue || !queue.playing) {
                return interaction.reply('There is nothing playing!');
            }
            queue.player.pause();
            await interaction.reply('Paused the music!');
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('resume')
            .setDescription('Resume the current song'),
        async execute(interaction, client) {
            const queue = client.musicQueues.get(interaction.guildId);
            if (!queue || !queue.playing) {
                return interaction.reply('There is nothing to resume!');
            }
            queue.player.unpause();
            await interaction.reply('Resumed the music!');
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('stop')
            .setDescription('Stop playing and clear the queue'),
        async execute(interaction, client) {
            const queue = client.musicQueues.get(interaction.guildId);
            if (!queue) {
                return interaction.reply('There is nothing playing!');
            }
            queue.songs = [];
            queue.player.stop();
            queue.connection.destroy();
            client.musicQueues.delete(interaction.guildId);
            await interaction.reply('Stopped the music and cleared the queue!');
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('disconnect')
            .setDescription('Disconnect the bot from voice channel'),
        async execute(interaction, client) {
            const queue = client.musicQueues.get(interaction.guildId);
            if (!queue) {
                return interaction.reply('I am not connected to any voice channel!');
            }
            queue.connection.destroy();
            client.musicQueues.delete(interaction.guildId);
            await interaction.reply('Disconnected from the voice channel!');
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('remove')
            .setDescription('Remove a song from the queue')
            .addIntegerOption(option =>
                option.setName('position')
                    .setDescription('The position of the song in the queue')
                    .setRequired(true)),
        async execute(interaction, client) {
            const queue = client.musicQueues.get(interaction.guildId);
            if (!queue) {
                return interaction.reply('There is no queue!');
            }
            
            const position = interaction.options.getInteger('position');
            if (position < 1 || position > queue.songs.length) {
                return interaction.reply('Invalid position!');
            }

            const removed = queue.songs.splice(position - 1, 1)[0];
            await interaction.reply(`Removed **${removed.title}** from the queue!`);
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('queue')
            .setDescription('Display the current music queue'),
        async execute(interaction, client) {
            const queue = client.musicQueues.get(interaction.guildId);
            if (!queue || !queue.songs.length) {
                return interaction.reply('There is no queue!');
            }

            const queueList = queue.songs.map((song, index) => 
                `${index + 1}. [${song.title}](${song.url})`
            ).join('\n');

            const embed = new EmbedBuilder()
                .setTitle('Music Queue')
                .setDescription(queueList)
                .setColor('#00ff00');

            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('nowplaying')
            .setDescription('Show the currently playing song'),
        async execute(interaction, client) {
            const queue = client.musicQueues.get(interaction.guildId);
            if (!queue || !queue.songs.length) {
                return interaction.reply('There is nothing playing!');
            }

            const currentSong = queue.songs[0];
            const embed = new EmbedBuilder()
                .setTitle('Now Playing')
                .setDescription(`[${currentSong.title}](${currentSong.url})`)
                .setThumbnail(currentSong.thumbnail)
                .setColor('#00ff00');

            await interaction.reply({ embeds: [embed] });
        }
    }
];

async function playSong(queue, guild, client) {
    if (!queue.songs.length) {
        queue.playing = false;
        queue.connection.destroy();
        client.musicQueues.delete(guild.id);
        return;
    }

    const song = queue.songs[0];
    try {
        const stream = ytdl(song.url, {
            filter: 'audioonly',
            highWaterMark: 1 << 25,
            quality: 'highestaudio'
        });

        const resource = createAudioResource(stream, {
            inlineVolume: true
        });

        queue.player.play(resource);
        console.log('Playing:', song.title);

        // Handle different player states
        queue.player.on(AudioPlayerStatus.Playing, () => {
            console.log('Player status: Playing');
        });

        queue.player.on(AudioPlayerStatus.Buffering, () => {
            console.log('Player status: Buffering');
        });

        queue.player.on(AudioPlayerStatus.AutoPaused, () => {
            console.log('Player status: AutoPaused');
        });

        queue.player.once(AudioPlayerStatus.Idle, () => {
            console.log('Song finished:', song.title);
            queue.songs.shift();
            playSong(queue, guild, client);
        });

        queue.player.on('error', error => {
            console.error('Player error:', error);
            queue.songs.shift();
            playSong(queue, guild, client);
        });
    } catch (error) {
        console.error('Error playing song:', song.title, error);
        queue.songs.shift();
        playSong(queue, guild, client);
    }
}

module.exports = commands;