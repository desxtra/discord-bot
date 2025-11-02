const {
    createAudioPlayer,
    createAudioResource,
    joinVoiceChannel,
    AudioPlayerStatus,
} = require('@discordjs/voice');
const { EmbedBuilder } = require('discord.js');
const ytdl = require('ytdl-core');
const { getInfo } = require('ytdl-core');
const { search } = require('youtube-search-api');

class MusicPlayer {
    constructor(guild) {
        this.guild = guild;
        this.queue = [];
        this.player = createAudioPlayer();
        this.connection = null;
        this.currentSong = null;

        // Handle song finish
        this.player.on(AudioPlayerStatus.Idle, () => {
            this.currentSong = null;
            this.playNext();
        });
    }

    async play(interaction, query) {
        try {
            const songInfo = await this.getSongInfo(query);
            if (!songInfo) {
                await interaction.editReply('Could not find that song!');
                return;
            }

            this.queue.push({
                title: songInfo.title,
                url: songInfo.url,
                duration: songInfo.duration,
                requester: interaction.user,
            });

            await interaction.editReply({
                embeds: [this.createSongEmbed('Added to queue', songInfo)],
            });

            if (!this.connection) {
                this.connectToVoice(interaction);
            }

            if (!this.currentSong) {
                await this.playNext();
            }
        } catch (error) {
            console.error('Error playing song:', error);
            await interaction.editReply('Error playing the song.');
        }
    }

    async getSongInfo(query) {
        try {
            // If it's a URL, get info directly
            if (ytdl.validateURL(query)) {
                const info = await getInfo(query);
                return {
                    title: info.videoDetails.title,
                    url: info.videoDetails.video_url,
                    duration: parseInt(info.videoDetails.lengthSeconds),
                };
            }

            // Otherwise search for it
            const results = await search(query);
            if (!results.items.length) return null;

            const video = results.items[0];
            return {
                title: video.title,
                url: `https://www.youtube.com/watch?v=${video.id}`,
                duration: video.duration,
            };
        } catch (error) {
            console.error('Error getting song info:', error);
            return null;
        }
    }

    connectToVoice(interaction) {
        const channel = interaction.member.voice.channel;
        this.connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: this.guild.id,
            adapterCreator: this.guild.voiceAdapterCreator,
        });
        this.connection.subscribe(this.player);
    }

    async playNext() {
        if (this.queue.length === 0) {
            this.currentSong = null;
            return;
        }

        this.currentSong = this.queue.shift();
        try {
            const stream = ytdl(this.currentSong.url, {
                filter: 'audioonly',
                quality: 'highestaudio',
                highWaterMark: 1 << 25,
            });

            const resource = createAudioResource(stream);
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
        this.connection?.destroy();
        this.connection = null;
        this.currentSong = null;
        await interaction.editReply('Stopped the music player!');
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
                name: 'Now Playing',
                value: `${this.currentSong.title} [${this.formatDuration(this.currentSong.duration)}]`,
            });
        }

        if (this.queue.length > 0) {
            const queueList = this.queue
                .map((song, index) => 
                    `${index + 1}. ${song.title} [${this.formatDuration(song.duration)}]`)
                .join('\n');
            embed.addFields({ name: 'Queue', value: queueList });
        }

        await interaction.editReply({ embeds: [embed] });
    }

    createSongEmbed(title, songInfo) {
        return new EmbedBuilder()
            .setTitle(title)
            .setColor('#FF0000')
            .addFields(
                { name: 'Title', value: songInfo.title },
                { name: 'Duration', value: this.formatDuration(songInfo.duration) }
            );
    }

    formatDuration(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
}

module.exports = { MusicPlayer };