const {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus
} = require('@discordjs/voice');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

class MusicQueue {
  constructor(guildId) {
    this.guildId = guildId;
    this.songs = [];
    this.currentSong = null;
    this.connection = null;
    this.player = createAudioPlayer();
    this.isPlaying = false;
    this.isPaused = false;
    this.volume = 0.5;
    this.loop = false;
    this.lastMessage = null;

    this.player.on(AudioPlayerStatus.Playing, () => {
      this.isPlaying = true;
      this.isPaused = false;
    });

    this.player.on(AudioPlayerStatus.Paused, () => {
      this.isPaused = true;
    });

    this.player.on(AudioPlayerStatus.Idle, () => {
      this.handleIdle().catch(console.error);
    });
  }

  async playSong(song) {
    this.currentSong = song;
    this.isPlaying = true;
    this.isPaused = false;

    try {
      if (this.lastMessage) {
        await this.updateEmbed(this.lastMessage, false);
      }

      console.log('Playing:', song.title);
      const ytdlStream = ytdl(song.url, {
        filter: 'audioonly',
        quality: 'highestaudio',
        highWaterMark: 1 << 25,
        requestOptions: {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        },
        // Attempt to avoid signature extraction issues
        dlChunkSize: 0
      });

      const ffmpeg = spawn(ffmpegPath, [
        '-i', 'pipe:0',
        '-acodec', 'libopus',
        '-f', 'opus',
        '-ar', '48000',
        '-ac', '2',
        'pipe:1'
      ]);

      ytdlStream.on('error', err => {
        console.error('YouTube error:', err);
        this.playNext().catch(console.error);
      });

      ffmpeg.on('error', err => {
        console.error('FFMPEG error:', err);
        this.playNext().catch(console.error);
      });

      ffmpeg.stderr.on('data', data => {
        console.warn('FFMPEG:', data.toString());
      });

      ytdlStream.pipe(ffmpeg.stdin);

      const resource = createAudioResource(ffmpeg.stdout, {
        inputType: 'opus',
        inlineVolume: true
      });

      if (!resource) {
        throw new Error('Failed to create audio resource');
      }
      resource.volume.setVolume(this.volume);

      this.player.play(resource);
      if (this.connection) this.connection.subscribe(this.player);

      resource.playStream.on('end', () => {
        ffmpeg.kill();
      });

      resource.playStream.on('error', err => {
        console.error('Playback error:', err);
        ffmpeg.kill();
      });

    } catch (err) {
      console.error('Play error:', err);
      this.playNext().catch(e => console.error('PlayNext error:', e));
    }
  }

  async handleIdle() {
    try {
      if (this.loop && this.currentSong) {
        await this.playSong(this.currentSong);
        return;
      }

      const hasNext = await this.playNext();
      if (!hasNext) {
        this.currentSong = null;
        this.isPlaying = false;
        this.isPaused = false;
        if (this.lastMessage) {
          await this.updateEmbed(this.lastMessage, true);
        }
      }
    } catch (err) {
      console.error('Idle handling error:', err);
      this.currentSong = null;
      this.isPlaying = false;
      this.isPaused = false;
    }
  }

  async playNext() {
    if (this.songs.length === 0) {
      this.isPlaying = false;
      this.currentSong = null;
      return false;
    }
    const next = this.songs.shift();
    await this.playSong(next);
    return true;
  }

  async add(song) {
    this.songs.push(song);
    if (!this.isPlaying && !this.currentSong) await this.playNext();
  }

  pause() {
    this.player.pause();
    this.isPaused = true;
  }

  resume() {
    this.player.unpause();
    this.isPaused = false;
  }

  skip() {
    this.player.stop();
  }

  stop() {
    this.songs = [];
    this.currentSong = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.player.stop();
    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
    }
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(2, vol));
  }

  toggleLoop() {
    this.loop = !this.loop;
    return this.loop;
  }

  async updateEmbed(message, disabled = false) {
    if (!message) return;

    try {
      this.lastMessage = message;
      const embed = createMusicEmbed(this);
      const buttons = createControlButtons(disabled, this.isPlaying);
      
      if (!message.editable) {
        console.warn('Message no longer editable');
        return;
      }
      
      await message.edit({ embeds: [embed], components: [buttons] });
    } catch (err) {
      console.error('Update embed error:', err);
    }
  }
}

/* YouTube Helpers */
function isYouTubeUrl(url) {
  try { return ytdl.validateURL(url); } catch { return false; }
}

async function searchYouTube(query) {
  const result = await ytSearch(query);
  if (!result || !result.videos.length) return null;
  const video = result.videos[0];
  return {
    title: video.title,
    url: video.url,
    id: video.videoId,
    duration: video.timestamp,
    thumbnail: video.thumbnail,
    author: video.author.name
  };
}

async function getVideoInfo(url) {
  const info = await ytdl.getInfo(url, {
    requestOptions: {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    },
    // Attempt to avoid signature extraction issues
    dlChunkSize: 0
  });
  const v = info.videoDetails;
  return {
    title: v.title,
    url: v.video_url,
    id: v.videoId,
    duration: formatDuration(parseInt(v.lengthSeconds || 0)),
    thumbnail: (v.thumbnails && v.thumbnails[0]) ? v.thumbnails[0].url : null,
    author: v.author ? v.author.name : 'Unknown'
  };
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/* Embeds */
function createMusicEmbed(queue) {
  const s = queue.currentSong;
  if (!s || !queue.isPlaying) {
    return new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('Not Playing')
      .setDescription('No song is currently playing')
      .setTimestamp();
  }

  return new EmbedBuilder()
    .setColor(queue.isPaused ? '#FFA500' : '#00FF00')
    .setTitle(queue.isPaused ? 'Paused' : 'Now Playing')
    .setDescription(`**${s.title}**`)
    .addFields(
      { name: 'Artist', value: s.author || 'Unknown', inline: true },
      { name: 'Duration', value: s.duration || 'Live', inline: true },
      { name: 'Volume', value: `${Math.round(queue.volume * 100)}%`, inline: true },
      { name: 'Loop', value: queue.loop ? 'ON' : 'OFF', inline: true },
      { name: 'Queue', value: `${queue.songs.length} songs`, inline: true }
    )
    .setThumbnail(s.thumbnail || null)
    .setFooter({ text: 'Music Bot' })
    .setTimestamp();
}

function createControlButtons(disabled = false, isPlaying = true) {
  const playbackStyle = isPlaying ? ButtonStyle.Success : ButtonStyle.Secondary;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music_pause')
      .setEmoji('⏸️')
      .setLabel(isPlaying ? 'Pause' : 'Resume')
      .setStyle(playbackStyle)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('music_skip')
      .setEmoji('⏭️')
      .setLabel('Skip')
      .setStyle(playbackStyle)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('music_stop')
      .setEmoji('⏹️')
      .setLabel('Stop')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('music_loop')
      .setEmoji('🔁')
      .setLabel('Loop')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('music_queue')
      .setEmoji('📝')
      .setLabel('Queue')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled)
  );
}

/* Queue Management */
const queues = new Map();

function getQueue(guildId) {
  if (!queues.has(guildId)) {
    queues.set(guildId, new MusicQueue(guildId));
  }
  return queues.get(guildId);
}

function deleteQueue(guildId) {
  queues.delete(guildId);
}

function createQueueEmbed(q) {
  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('Music Queue')
    .setTimestamp();
    
  if (q.currentSong) {
    embed.addFields({
      name: 'Now Playing',
      value: `**${q.currentSong.title}** - ${q.currentSong.author}`
    });
  }
  
  if (q.songs.length > 0) {
    const list = q.songs
      .slice(0, 10)
      .map((s, i) => `${i + 1}. **${s.title}** - ${s.author}`)
      .join('\n');
    embed.addFields({ name: `Up Next (${q.songs.length})`, value: list });
    if (q.songs.length > 10) {
      embed.setFooter({ text: `+${q.songs.length - 10} more songs` });
    }
  } else {
    embed.addFields({ name: 'Queue', value: 'Empty' });
  }
  
  return embed;
}

module.exports = {
  getQueue,
  deleteQueue,
  isYouTubeUrl,
  searchYouTube,
  getVideoInfo,
  createMusicEmbed,
  createControlButtons,
  createQueueEmbed
};