const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, getVoiceConnection } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const yts = require('yt-search');

// Global music queues
const musicQueues = new Map();

// Helper function to create music control buttons
function createMusicControls(guildId) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`pause_${guildId}`)
                .setLabel('⏸️ Pause')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`resume_${guildId}`)
                .setLabel('▶️ Resume')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`skip_${guildId}`)
                .setLabel('⏭️ Skip')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`stop_${guildId}`)
                .setLabel('⏹️ Stop')
                .setStyle(ButtonStyle.Danger)
        );
}

// Helper function to handle music playback
async function createStream(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`Attempt ${i + 1} to create stream for ${url}`);
            
            const info = await ytdl.getInfo(url);
            const format = ytdl.chooseFormat(info.formats, { filter: 'audioonly', quality: 'highestaudio' });
            
            if (!format) {
                throw new Error('No suitable audio format found');
            }

            return ytdl.downloadFromInfo(info, {
                format: format,
                highWaterMark: 1 << 25,
                requestOptions: {
                    headers: {
                        cookie: process.env.YOUTUBE_COOKIE || '',
                        'x-youtube-identity-token': process.env.YOUTUBE_IDENTITY || '',
                        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                        'accept-language': 'en-US,en;q=0.9'
                    }
                }
            });
        } catch (error) {
            console.error(`Attempt ${i + 1} failed:`, error);
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i))); // Exponential backoff
        }
    }
    throw new Error('All attempts to create stream failed');
}

async function playSong(queue, guild, interaction) {
    if (!queue.songs.length) {
        queue.playing = false;
        const connection = getVoiceConnection(guild.id);
        if (connection) {
            connection.destroy();
        }
        musicQueues.delete(guild.id);
        return;
    }

    const song = queue.songs[0];
    try {
        if (!queue.connection) {
            console.error('No connection available');
            return;
        }

        console.log('Creating stream for:', song.title);
        const stream = await createStream(song.url);
        
        if (!stream) {
            console.error('Failed to create stream for:', song.title);
            queue.songs.shift();
            return playSong(queue, guild, interaction);
        }

        stream.on('error', error => {
            console.error('Stream error:', error);
            queue.songs.shift();
            playSong(queue, guild, interaction);
        });

        const resource = createAudioResource(stream, { 
            inlineVolume: true,
            inputType: 'opus'
        });

        resource.volume.setVolume(queue.volume || 0.5);
        queue.player.removeAllListeners();
        queue.player.play(resource);
        console.log('Playing:', song.title);

        queue.player.on(AudioPlayerStatus.Playing, () => {
            console.log('Player status: Playing');
            queue.playing = true;
        });

        queue.player.once(AudioPlayerStatus.Idle, () => {
            console.log('Song finished:', song.title);
            queue.songs.shift();
            playSong(queue, guild, interaction);
        });

        queue.player.on('error', error => {
            console.error('Player error:', error);
            queue.songs.shift();
            playSong(queue, guild, interaction);
        });

        queue.connection.subscribe(queue.player);
    } catch (error) {
        console.error('Error playing song:', song.title, error);
        queue.songs.shift();
        playSong(queue, guild, interaction);
    }
}

// Helper function to handle music commands
async function handleMusicCommand(interaction, client) {
    const query = interaction.options.getString('query');
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
        throw new Error('You need to be in a voice channel to play music!');
    }

    const permissions = voiceChannel.permissionsFor(interaction.client.user);
    if (!permissions.has('Connect') || !permissions.has('Speak')) {
        throw new Error('I need permissions to join and speak in your voice channel!');
    }

    await interaction.deferReply();

    let songInfo;
    
    try {
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
                throw new Error('No results found!');
            }
            const videoResult = searchResults.videos[0];
            songInfo = {
                title: videoResult.title,
                url: videoResult.url,
                thumbnail: videoResult.thumbnail,
                duration: videoResult.duration.seconds
            };
        }

        let queue = musicQueues.get(interaction.guildId);

        if (!queue) {
            queue = {
                voiceChannel: voiceChannel,
                connection: null,
                songs: [],
                playing: false,
                player: createAudioPlayer(),
                volume: 0.5
            };
            musicQueues.set(interaction.guildId, queue);
        }

        queue.songs.push(songInfo);

        const embed = new EmbedBuilder()
            .setColor('#00ff00');

        if (!queue.playing) {
            try {
                queue.connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: interaction.guildId,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                });

                queue.connection.on('stateChange', (oldState, newState) => {
                    if (newState.status === VoiceConnectionStatus.Disconnected) {
                        if (queue.connection) {
                            queue.connection.destroy();
                        }
                        musicQueues.delete(interaction.guildId);
                    }
                });

                await playSong(queue, interaction.guild, interaction);

                embed.setTitle('Now Playing')
                    .setDescription(`[${songInfo.title}](${songInfo.url})`);
                
                if (songInfo.thumbnail) {
                    embed.setThumbnail(songInfo.thumbnail);
                }
            } catch (error) {
                musicQueues.delete(interaction.guildId);
                throw error;
            }
        } else {
            embed.setTitle('Added to Queue')
                .setDescription(`[${songInfo.title}](${songInfo.url})`);
            
            if (songInfo.thumbnail) {
                embed.setThumbnail(songInfo.thumbnail);
            }
        }

        const row = createMusicControls(interaction.guildId);
        
        await interaction.editReply({ 
            embeds: [embed],
            components: [row]
        });

    } catch (error) {
        throw error;
    }
}

const commands = [
    {
        data: new SlashCommandBuilder()
            .setName('play')
            .setDescription('Play music from YouTube')
            .addStringOption(option =>
                option.setName('query')
                    .setDescription('The song to search for or YouTube URL')
                    .setRequired(true)),
        async execute(interaction, client) {
            try {
                await handleMusicCommand(interaction, client);
            } catch (error) {
                console.error('Error in play command:', error);
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ 
                        content: error.message || 'There was an error while processing your request!' 
                    });
                } else {
                    await interaction.reply({ 
                        content: error.message || 'There was an error while processing your request!',
                        ephemeral: true 
                    });
                }
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('pause')
            .setDescription('Pause the current song'),
        async execute(interaction, client) {
            await interaction.deferReply();
            
            const queue = musicQueues.get(interaction.guildId);
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
            
            const queue = musicQueues.get(interaction.guildId);
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
            
            const queue = musicQueues.get(interaction.guildId);
            if (!queue) {
                return interaction.editReply('There is nothing playing!');
            }
            
            queue.songs = [];
            queue.player.stop();
            
            if (queue.connection) {
                queue.connection.destroy();
            }
            
            musicQueues.delete(interaction.guildId);
            await interaction.editReply('Stopped the music and cleared the queue!');
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('skip')
            .setDescription('Skip the current song'),
        async execute(interaction, client) {
            await interaction.deferReply();
            
            const queue = musicQueues.get(interaction.guildId);
            if (!queue || !queue.songs.length) {
                return interaction.editReply('There is nothing to skip!');
            }

            const skippedSong = queue.songs[0];
            queue.player.stop();
            
            await interaction.editReply(`Skipped **${skippedSong.title}**`);
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('queue')
            .setDescription('Display the current music queue'),
        async execute(interaction, client) {
            await interaction.deferReply();
            
            const queue = musicQueues.get(interaction.guildId);
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
            
            const queue = musicQueues.get(interaction.guildId);
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

            const row = createMusicControls(interaction.guildId);

            await interaction.editReply({ 
                embeds: [embed],
                components: [row]
            });
        }
    }
];

module.exports = commands;
