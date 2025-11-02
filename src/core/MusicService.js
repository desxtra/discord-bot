const {
    createAudioPlayer,
    createAudioResource,
    joinVoiceChannel,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState
} = require('@discordjs/voice');
const { EmbedBuilder } = require('discord.js');
const play = require('play-dl'); // Using play-dl instead of ytdl-core for better stability
const { bot } = require('../core/config');

class MusicService {
    constructor(guild) {
        this.guild = guild;
        this.queue = [];
        this.player = createAudioPlayer();
        this.connection = null;
        this.currentSong = null;
        this.volume = bot.defaultVolume;
        this.setupPlayerEvents();
    }

    setupPlayerEvents() {
        this.player.on(AudioPlayerStatus.Idle, () => {
            this.currentSong = null;
            this.playNext();
        });

        this.player.on('error', error => {
            console.error('Player error:', error);
            this.playNext();
        });
    }

    async play(interaction, query) {
        try {
            if (this.queue.length >= bot.maxQueueSize) {
                await interaction.editReply('Queue is full! Please wait before adding more songs.');
                return;
            }

            const songInfo = await this.getSongInfo(query);
            if (!songInfo) {
                await interaction.editReply('Could not find that song or the video is unavailable.');
                return;
            }

            this.queue.push({
                title: songInfo.title,
                url: songInfo.url,
                duration: songInfo.duration,
                requester: interaction.user,
                thumbnail: songInfo.thumbnail
            });

            await interaction.editReply({
                embeds: [this.createSongEmbed('Added to Queue', songInfo)],
            });

            if (!this.connection) {
                await this.connectToVoice(interaction);
            }

            if (!this.currentSong) {
                await this.playNext();
            }
        } catch (error) {
            console.error('Error in play command:', error);
            await interaction.editReply('There was an error playing the song.');
        }
    }

    async getSongInfo(query) {
        try {
            let songInfo;
            
            if (play.yt_validate(query) === 'video') {
                const videoInfo = await play.video_info(query);
                songInfo = {
                    title: videoInfo.video_details.title,
                    url: videoInfo.video_details.url,
                    duration: videoInfo.video_details.durationInSec,
                    thumbnail: videoInfo.video_details.thumbnail.url
                };
            } else {
                const searchResults = await play.search(query, { limit: 1 });
                if (!searchResults.length) return null;
                
                const video = searchResults[0];
                songInfo = {
                    title: video.title,
                    url: video.url,
                    duration: video.durationInSec,
                    thumbnail: video.thumbnails[0].url
                };
            }

            return songInfo;
        } catch (error) {
            console.error('Error getting song info:', error);
            return null;
        }
    }

    async connectToVoice(interaction) {
        try {
            const channel = interaction.member.voice.channel;
            this.connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: this.guild.id,
                adapterCreator: this.guild.voiceAdapterCreator,
                selfDeaf: true,
                selfMute: false
            });

            this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(this.connection, VoiceConnectionStatus.Signalling, 5000),
                        entersState(this.connection, VoiceConnectionStatus.Connecting, 5000),
                    ]);
                } catch (error) {
                    this.connection.destroy();
                    this.connection = null;
                    this.queue = [];
                    this.currentSong = null;
                }
            });

            this.connection.subscribe(this.player);
        } catch (error) {
            console.error('Error connecting to voice:', error);
            throw error;
        }
    }

    async playNext() {
        if (this.queue.length === 0) {
            this.currentSong = null;
            return;
        }

        this.currentSong = this.queue.shift();
        try {
            console.log('Attempting to play song with URL:', this.currentSong.url); // Debugging line
            if (!this.currentSong.url) {
                console.error('Song URL is undefined');
            this.currentSong = null;
            this.playNext();
            return;
        }

            const stream = await play.stream(this.currentSong.url);
            const resource = createAudioResource(stream.stream, {
                inputType: stream.type,
                inlineVolume: true
            });

            resource.volume.setVolume(this.volume / 100);
            this.player.play(resource);
        } catch (error) {
            console.error('Error playing next song:', error);
        this.currentSong = null;
            this.playNext();
    }
    }

    async skip(interaction) {
        if (!this.currentSong) {
            await interaction.editReply('No song is currently playing!');
            return;
        }

        this.player.stop();
        await interaction.editReply('Skipped the current song!');
        }
        
    async stop(interaction) {
        this.queue = [];
        this.player.stop();
        if (this.connection) {
            this.connection.destroy();
            this.connection = null;
        }
        this.currentSong = null;
        await interaction.editReply('Stopped the music player!');
    }

    async setVolume(interaction, volume) {
        if (volume < 0 || volume > 100) {
            await interaction.editReply('Volume must be between 0 and 100!');
            return;
        }

        this.volume = volume;
        if (this.player.state.resource) {
            this.player.state.resource.volume.setVolume(volume / 100);
        }

        await interaction.editReply(`Volume set to ${volume}%`);
    }

    async showQueue(interaction) {
        if (!this.currentSong && this.queue.length === 0) {
            await interaction.editReply('The queue is empty!');
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('Music Queue')
            .setColor('#FF0000');

        if (this.currentSong) {
            embed.addFields({
                name: '🎵 Now Playing',
                value: `${this.currentSong.title} [${this.formatDuration(this.currentSong.duration)}]\nRequested by: ${this.currentSong.requester.tag}`,
            })
            .setThumbnail(this.currentSong.thumbnail);
        }

        if (this.queue.length > 0) {
            const queueList = this.queue
                .slice(0, 10)
                .map((song, index) => 
                    `${index + 1}. ${song.title} [${this.formatDuration(song.duration)}] • ${song.requester.tag}`)
                .join('\n');

            embed.addFields({ 
                name: '📋 Queue',
                value: queueList + (this.queue.length > 10 ? '\n...and more' : '')
            });
        }

        embed.setFooter({ text: `Volume: ${this.volume}% | Queue length: ${this.queue.length}` });
        await interaction.editReply({ embeds: [embed] });
    }

    createSongEmbed(title, songInfo) {
        return new EmbedBuilder()
            .setTitle(title)
            .setColor('#FF0000')
            .setThumbnail(songInfo.thumbnail)
            .addFields(
                { name: '🎵 Title', value: songInfo.title },
                { name: '⏱️ Duration', value: this.formatDuration(songInfo.duration) }
            );
    }

    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
}

module.exports = { MusicService };