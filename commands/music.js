const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const yts = require('yt-search');

// Store search command reference for the play command
const searchCommand = {
    async execute(interaction, client) {
        // Defer the reply first to avoid timeout
        await interaction.deferReply();
        
        const query = interaction.options.getString('query');
        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            return interaction.editReply('You need to be in a voice channel to play music!');
        }

        const permissions = voiceChannel.permissionsFor(interaction.client.user);
        if (!permissions.has('Connect') || !permissions.has('Speak')) {
            return interaction.editReply('I need permissions to join and speak in your voice channel!');
        }

        try {
            const results = await yts(query);
            if (!results.videos.length) {
                return interaction.editReply('No results found!');
            }

            const song = {
                title: results.videos[0].title,
                url: results.videos[0].url,
                duration: results.videos[0].duration,
                thumbnail: results.videos[0].thumbnail
            };

            let queue = client.musicQueues.get(interaction.guildId);

            if (!queue) {
                queue = {
                    voiceChannel: voiceChannel,
                    connection: null,
                    songs: [],
                    playing: false,
                    player: createAudioPlayer()
                };

                client.musicQueues.set(interaction.guildId, queue);
            }

            queue.songs.push(song);

            if (!queue.connection) {
                try {
                    queue.connection = joinVoiceChannel({
                        channelId: voiceChannel.id,
                        guildId: interaction.guildId,
                        adapterCreator: interaction.guild.voiceAdapterCreator,
                    });

                    queue.connection.on('stateChange', (oldState, newState) => {
                        if (newState.status === VoiceConnectionStatus.Disconnected) {
                            if (newState.reason === VoiceConnectionDisconnectReason.WebSocketClose && newState.closeCode === 4014) {
                                // If the bot was moved to a different channel
                                try {
                                    entersState(queue.connection, VoiceConnectionStatus.Connecting, 5_000);
                                } catch {
                                    queue.connection.destroy();
                                    client.musicQueues.delete(interaction.guildId);
                                }
                            }
                        }
                    });

                    await playSong(queue, interaction.guild, client);
                } catch (error) {
                    client.musicQueues.delete(interaction.guildId);
                    console.error(error);
                    return interaction.editReply('There was an error connecting to the voice channel!');
                }
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('Added to Queue')
                    .setDescription(`[${song.title}](${song.url})`)
                    .setThumbnail(song.thumbnail)
                    .setColor('#00ff00');
                await interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error in search command:', error);
            return interaction.editReply('There was an error while searching for the song!');
        }
    }
};

const commands = [
    {
        data: new SlashCommandBuilder()
            .setName('play')
            .setDescription('Play music from YouTube')
            .addStringOption(option =>
                option.setName('query')
                    .setDescription('The song to search for')
                    .setRequired(true)),
        async execute(interaction, client) {
            // Pass the interaction to the search command's execute function
            return await searchCommand.execute(interaction, client);
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('search')
            .setDescription('Search and play music from YouTube')
            .addStringOption(option =>
                option.setName('query')
                    .setDescription('The song to search for')
                    .setRequired(true)),
        async execute(interaction, client) {
            // Defer the reply first to avoid timeout
            await interaction.deferReply();
            
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
                        playing: false,
                        currentInteraction: interaction
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
                    
                    // Wait for connection to be ready
                    try {
                        await entersState(queue.connection, VoiceConnectionStatus.Ready, 30_000);
                    } catch (error) {
                        console.error('Connection failed:', error);
                        if (queue.connection) {
                            queue.connection.destroy();
                        }
                        return interaction.editReply('Failed to join voice channel within 30 seconds');
                    }
                    
                    queue.connection.subscribe(queue.player);
                    playSong(queue, interaction.guild, client);
                }

                const embed = new EmbedBuilder()
                    .setTitle('Added to queue')
                    .setDescription(`[${song.title}](${song.url})`)
                    .setColor('#00ff00');

                if (song.thumbnail) {
                    embed.setThumbnail(song.thumbnail);
                }

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`pause_${interaction.guildId}`)
                            .setLabel('⏸️ Pause')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId(`resume_${interaction.guildId}`)
                            .setLabel('▶️ Resume')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId(`skip_${interaction.guildId}`)
                            .setLabel('⏭️ Skip')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId(`stop_${interaction.guildId}`)
                            .setLabel('⏹️ Stop')
                            .setStyle(ButtonStyle.Danger)
                    );

                await interaction.editReply({ embeds: [embed], components: [row] });
            } catch (error) {
                console.error('Search command error:', error);
                await interaction.editReply('An error occurred while trying to play the song!');
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('pause')
            .setDescription('Pause the current song'),
        async execute(interaction, client) {
            await interaction.deferReply();
            
            const queue = client.musicQueues.get(interaction.guildId);
            if (!queue || !queue.playing) {
                return interaction.editReply('There is nothing playing!');
            }
            
            if (queue.player.state.status === AudioPlayerStatus.Paused) {
                return interaction.editReply('Music is already paused!');
            }
            
            queue.player.pause();
            await interaction.editReply('Paused the music!');
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('resume')
            .setDescription('Resume the current song'),
        async execute(interaction, client) {
            await interaction.deferReply();
            
            const queue = client.musicQueues.get(interaction.guildId);
            if (!queue || !queue.playing) {
                return interaction.editReply('There is nothing to resume!');
            }
            
            if (queue.player.state.status === AudioPlayerStatus.Playing) {
                return interaction.editReply('Music is already playing!');
            }
            
            queue.player.unpause();
            await interaction.editReply('Resumed the music!');
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('stop')
            .setDescription('Stop playing and clear the queue'),
        async execute(interaction, client) {
            await interaction.deferReply();
            
            const queue = client.musicQueues.get(interaction.guildId);
            if (!queue) {
                return interaction.editReply('There is nothing playing!');
            }
            
            queue.songs = [];
            queue.player.stop();
            
            if (queue.connection && queue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
                queue.connection.destroy();
            }
            
            client.musicQueues.delete(interaction.guildId);
            await interaction.editReply('Stopped the music and cleared the queue!');
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('disconnect')
            .setDescription('Disconnect the bot from voice channel'),
        async execute(interaction, client) {
            await interaction.deferReply();
            
            const queue = client.musicQueues.get(interaction.guildId);
            if (!queue || !queue.connection) {
                return interaction.editReply('I am not connected to any voice channel!');
            }
            
            if (queue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
                queue.connection.destroy();
            }
            
            client.musicQueues.delete(interaction.guildId);
            await interaction.editReply('Disconnected from the voice channel!');
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
            await interaction.deferReply();
            
            const queue = client.musicQueues.get(interaction.guildId);
            if (!queue || !queue.songs.length) {
                return interaction.editReply('There is no queue!');
            }
            
            const position = interaction.options.getInteger('position');
            if (position < 1 || position > queue.songs.length) {
                return interaction.editReply('Invalid position!');
            }

            // Don't remove currently playing song
            if (position === 1) {
                return interaction.editReply('Cannot remove the currently playing song! Use /skip instead.');
            }

            const removed = queue.songs.splice(position - 1, 1)[0];
            await interaction.editReply(`Removed **${removed.title}** from the queue!`);
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('queue')
            .setDescription('Display the current music queue'),
        async execute(interaction, client) {
            await interaction.deferReply();
            
            const queue = client.musicQueues.get(interaction.guildId);
            if (!queue || !queue.songs.length) {
                return interaction.editReply('There is no queue!');
            }

            const queueList = queue.songs.slice(0, 10).map((song, index) => 
                `${index + 1}. [${song.title}](${song.url})`
            ).join('\n');

            const embed = new EmbedBuilder()
                .setTitle('Music Queue')
                .setDescription(queueList)
                .setColor('#00ff00');

            if (queue.songs.length > 10) {
                embed.setFooter({ text: `And ${queue.songs.length - 10} more songs...` });
            }

            await interaction.editReply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('nowplaying')
            .setDescription('Show the currently playing song'),
        async execute(interaction, client) {
            await interaction.deferReply();
            
            const queue = client.musicQueues.get(interaction.guildId);
            if (!queue || !queue.songs.length) {
                return interaction.editReply('There is nothing playing!');
            }

            const currentSong = queue.songs[0];
            const embed = new EmbedBuilder()
                .setTitle('Now Playing')
                .setDescription(`[${currentSong.title}](${currentSong.url})`)
                .setColor('#00ff00');

            if (currentSong.thumbnail) {
                embed.setThumbnail(currentSong.thumbnail);
            }

            await interaction.editReply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('skip')
            .setDescription('Skip the current song'),
        async execute(interaction, client) {
            await interaction.deferReply();
            
            const queue = client.musicQueues.get(interaction.guildId);
            if (!queue || !queue.songs.length) {
                return interaction.editReply('There is nothing to skip!');
            }

            const skippedSong = queue.songs[0];
            queue.player.stop(); // This will trigger the idle event and move to next song
            
            await interaction.editReply(`Skipped **${skippedSong.title}**`);
        }
    }
];

async function playSong(queue, guild, client) {
    if (!queue.songs.length) {
        queue.playing = false;
        if (queue.connection && queue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
            queue.connection.destroy();
        }
        client.musicQueues.delete(guild.id);
        return;
    }

    const song = queue.songs[0];
    try {
        const stream = ytdl(song.url, {
            filter: 'audioonly',
            highWaterMark: 1 << 25,
            quality: 'highestaudio',
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            }
        });

        // Handle stream errors
        stream.on('error', (error) => {
            console.error('Stream error:', error);
            queue.player.removeAllListeners();
            queue.songs.shift();
            playSong(queue, guild, client);
        });

        const resource = createAudioResource(stream, {
            inlineVolume: true
        });

        resource.volume.setVolume(0.5);

        queue.player.play(resource);
        console.log('Playing:', song.title);

        // Remove any existing listeners to prevent duplicates
        queue.player.removeAllListeners();

        queue.player.on(AudioPlayerStatus.Playing, () => {
            console.log('Player status: Playing');
        });

        queue.player.once(AudioPlayerStatus.Idle, () => {
            console.log('Song finished:', song.title);
            queue.player.removeAllListeners();
            queue.songs.shift();
            playSong(queue, guild, client);
        });

        queue.player.on('error', error => {
            console.error('Player error:', error);
            queue.player.removeAllListeners();
            queue.songs.shift();
            playSong(queue, guild, client);
        });

    } catch (error) {
        console.error('Error playing song:', song.title, error);
        queue.player.removeAllListeners();
        queue.songs.shift();
        playSong(queue, guild, client);
    }
}

module.exports = commands;