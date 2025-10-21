// utils/music.js (Cache index, robust detection + atomic finalize)
const {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  demuxProbe
} = require('@discordjs/voice');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ytdl = require('ytdl-core'); // fallback only
const ytSearch = require('yt-search');
const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { PassThrough } = require('stream');

const cacheDir = path.join(__dirname, '../cache');
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

/* CONFIG */
const ENABLE_CACHE = true; // toggle
const CACHE_INDEX_PATH = path.join(cacheDir, 'index.json');

/* detect system yt-dlp binary */
let ytDlpPath = null;
try {
  // First try where command checks both PATH and current directory
  const where = spawnSync('where', ['yt-dlp'], { shell: true });
  if (where.status === 0) {
    ytDlpPath = where.stdout.toString().split('\n')[0].trim();
  }
} catch (e) {}

if (!ytDlpPath) {
  // Windows-specific paths
  if (process.platform === 'win32') {
    const candidates = [
      path.join(process.cwd(), 'yt-dlp.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'yt-dlp/yt-dlp.exe'),
      path.join(process.env.APPDATA || '', 'yt-dlp/yt-dlp.exe')
    ];
    for (const c of candidates) {
      try { if (fs.existsSync(c)) { ytDlpPath = c; break; } } catch {}
    }
  } else {
    // Linux paths
    const candidates = [
      '/usr/local/bin/yt-dlp',
      '/usr/bin/yt-dlp',
      path.join(process.env.HOME || '', '.local/bin/yt-dlp')
    ];
    for (const c of candidates) {
      try { if (fs.existsSync(c)) { ytDlpPath = c; break; } } catch {}
    }
  }
}

/* ---------- CACHE INDEX HELPERS ---------- */
let cacheIndex = {};
function loadCacheIndex() {
  try {
    if (fs.existsSync(CACHE_INDEX_PATH)) {
      const raw = fs.readFileSync(CACHE_INDEX_PATH, 'utf8');
      cacheIndex = JSON.parse(raw || '{}');
      // cleanup entries that point to missing files
      for (const id of Object.keys(cacheIndex)) {
        const f = cacheIndex[id].file;
        if (!f || !fs.existsSync(path.join(cacheDir, f))) {
          delete cacheIndex[id];
        }
      }
      saveCacheIndex();
      return;
    }
    // migrate: scan cache dir for files that contain a youtube-like id
    const files = fs.readdirSync(cacheDir);
    for (const f of files) {
      if (!f.toLowerCase().endsWith('.webm')) continue;
      const maybeId = extractVideoIdFromFilename(f);
      if (maybeId) {
        cacheIndex[maybeId] = { file: f, title: null, createdAt: Date.now() };
      }
    }
    saveCacheIndex();
  } catch (e) {
    console.warn('Failed load cache index:', e && e.message);
    cacheIndex = {};
  }
}
function saveCacheIndex() {
  try {
    fs.writeFileSync(CACHE_INDEX_PATH, JSON.stringify(cacheIndex, null, 2));
  } catch (e) {
    console.warn('Failed save cache index:', e && e.message);
  }
}
function extractVideoIdFromFilename(filename) {
  // find first 11-char YouTube-like id (A-Za-z0-9_-)
  const m = filename.match(/[A-Za-z0-9_-]{11}/);
  return m ? m[0] : null;
}
function getFinalFilenameForId(id) {
  return `${id}.webm`; // canonical name
}
function getFinalPathForId(id) {
  return path.join(cacheDir, getFinalFilenameForId(id));
}
function findCachedFile(videoId) {
  if (!ENABLE_CACHE) return null;
  console.log('Looking for cached file:', videoId);
  
  // 1) index lookup
  if (cacheIndex[videoId] && cacheIndex[videoId].file) {
    const full = path.join(cacheDir, cacheIndex[videoId].file);
    try {
      const st = fs.statSync(full);
      if (st.size > 102400) {
        console.log('Cache hit:', videoId, '->', cacheIndex[videoId].file, '(', Math.round(st.size / 1024), 'KB)');
        return full;
      } else {
        console.log('Cache file exists but too small:', full);
        try { fs.unlinkSync(full); } catch {} // Delete small file
        delete cacheIndex[videoId];
        saveCacheIndex();
      }
    } catch (e) {
      console.log('Cache index entry points to missing file:', full);
      delete cacheIndex[videoId];
      saveCacheIndex();
    }
  }
  // 2) canonical filename
  const canonical = getFinalPathForId(videoId);
  if (fs.existsSync(canonical)) {
    try {
      const st = fs.statSync(canonical);
      if (st.size > 1024) {
        cacheIndex[videoId] = { file: path.basename(canonical), title: null, createdAt: st.mtimeMs || Date.now() };
        saveCacheIndex();
        console.log('Found canonical cache:', canonical);
        return canonical;
      }
    } catch (e) {}
  }
  // 3) scan folder fallback: look for any file that includes id
  const files = fs.readdirSync(cacheDir);
  for (const f of files) {
    if (!f.toLowerCase().endsWith('.webm')) continue;
    if (f.includes(videoId)) {
      const full = path.join(cacheDir, f);
      try {
        const st = fs.statSync(full);
        if (st.size > 1024) {
          cacheIndex[videoId] = { file: f, title: null, createdAt: st.mtimeMs || Date.now() };
          saveCacheIndex();
          console.log('Found cached file by scan:', full);
          return full;
        }
      } catch (e) {}
    }
  }
  return null;
}
function finalizeTmpAtomic(tmpPath, finalPath, videoId, title) {
  try {
    // Wait a bit to ensure file is fully written
    if (!fs.existsSync(tmpPath)) {
      console.log('Temp file not found:', tmpPath);
      return false;
    }

    // Check if file size is reasonable (> 100KB)
    const stats = fs.statSync(tmpPath);
    if (stats.size < 102400) {
      console.log('Temp file too small:', stats.size, 'bytes');
      try { fs.unlinkSync(tmpPath); } catch {}
      return false;
    }

    // ensure finalPath uses canonical name
    const canonical = getFinalPathForId(videoId);
    
    // If target file exists, remove it first
    if (fs.existsSync(canonical)) {
      try { fs.unlinkSync(canonical); } catch {}
    }

    // rename tmp -> canonical final
    fs.renameSync(tmpPath, canonical);
    
    // Update cache index
    cacheIndex[videoId] = { 
      file: path.basename(canonical), 
      title: title || null, 
      createdAt: Date.now(),
      size: stats.size
    };
    saveCacheIndex();
    console.log('Cached file saved:', canonical, '(', Math.round(stats.size / 1024), 'KB)');
    return true;
  } catch (e) {
    console.warn('Failed to finalize cache:', e && e.message);
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
    return false;
  }
}
function clearCache() {
  const files = fs.readdirSync(cacheDir);
  let removed = 0;
  for (const f of files) {
    try { fs.unlinkSync(path.join(cacheDir, f)); removed++; } catch {}
  }
  cacheIndex = {};
  saveCacheIndex();
  return removed;
}

/* ---------- YouTube helpers (unchanged) ---------- */
function sanitizeFilename(s) {
  return s.replace(/[\/\\?%*:|"<>]/g, '').slice(0, 120).trim();
}
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
  const info = await ytdl.getInfo(url);
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

/* ---------- EMBEDS & CONTROLS (same as before) ---------- */
function createMusicEmbed(queue) {
  const s = queue.currentSong;
  if (!s) return new EmbedBuilder().setTitle('Not playing').setColor('#666666');

  return new EmbedBuilder()
    .setColor(queue.isPaused ? '#FFA500' : '#FF0000')
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
      .setStyle(playbackStyle)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('music_skip')
      .setEmoji('⏭️')
      .setStyle(playbackStyle)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('music_stop')
      .setEmoji('⏹️')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('music_loop')
      .setEmoji('🔁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('music_queue')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled)
  );
}

/* ---------- Queue Class (same plumbing as before, but uses new cache helpers) ---------- */
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

    this.player.on(AudioPlayerStatus.Idle, () => {
      if (this.loop && this.currentSong) {
        this.playSong(this.currentSong).catch(e => { console.error('Loop play error:', e); this.playNext(); });
      } else {
        this.playNext().catch(e => { console.error('PlayNext error:', e); });
      }
    });

    this.player.on('error', err => {
      console.error('Player error:', err);
      this.playNext().catch(e => console.error('PlayNext after player error failed:', e));
    });
  }

  async add(song) {
    this.songs.push(song);
    if (!this.isPlaying && !this.currentSong) await this.playNext();
  }

  async playSong(song) {
    try {
      this.currentSong = song;
      this.isPlaying = true;
      this.isPaused = false;

      // 1) check cache index / files
      const cached = ENABLE_CACHE ? findCachedFile(song.id) : null;
      if (cached) {
        console.log('Using cached file:', cached);
        const fileStream = fs.createReadStream(cached);
        const { stream, type } = await demuxProbe(fileStream);
        const resource = createAudioResource(stream, {
          inputType: type,
          inlineVolume: true,
        });
        resource.volume.setVolume(this.volume);
        this.player.play(resource);
        if (this.connection) this.connection.subscribe(this.player);
        return;
      }

      // 2) stream via yt-dlp or ytdl-core and optionally cache
      const tmpPath = path.join(cacheDir, `${song.id}.webm.tmp`);
      const finalPath = getFinalPathForId(song.id);
      const spawnedProcs = [];

      let inputStream = null;
      if (ytDlpPath) {
        console.log('Streaming via system yt-dlp + ffmpeg:', song.title);
        const ytdlpArgs = [
          '-f', 'bestaudio/best',
          '-o', '-',
          '--no-warnings',
          '--no-progress',
          '--extract-audio',
          '--audio-format', 'opus',
          '--audio-quality', '0',
          song.url
        ];
        const ytdlpProc = spawn(ytDlpPath, ytdlpArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
        spawnedProcs.push(ytdlpProc);

        const ffmpeg = spawn(ffmpegPath, [
          '-i', 'pipe:0',
          '-analyzeduration', '0',
          '-loglevel', 'error',
          '-f', 'webm', // produce webm container (contains opus)
          '-ar', '48000',
          '-ac', '2',
          'pipe:1'
        ], { stdio: ['pipe', 'pipe', 'pipe'] });
        spawnedProcs.push(ffmpeg);

        ytdlpProc.stdout.on('error', () => {});
        ffmpeg.stdin.on('error', () => {});
        ytdlpProc.stderr.on('data', () => {});
        ffmpeg.stderr.on('data', () => {});

        ytdlpProc.stdout.pipe(ffmpeg.stdin);
        inputStream = ffmpeg.stdout;

        // Set up caching immediately if enabled
        if (ENABLE_CACHE) {
          try {
            console.log('Setting up cache write for:', song.id);
            // Create write stream to final path directly
            const cacheWrite = fs.createWriteStream(finalPath);
            let totalBytes = 0;

            // Create a PassThrough for both playing and caching
            const playStream = new PassThrough();
            const cacheStream = new PassThrough();
            
            ffmpeg.stdout.pipe(playStream);
            ffmpeg.stdout.pipe(cacheStream);
            
            // Handle caching in parallel with playback
            cacheStream.pipe(cacheWrite);
            
            // Update cache index as soon as we start getting data
            cacheStream.once('data', () => {
              cacheIndex[song.id] = { 
                file: path.basename(finalPath), 
                title: song.title,
                createdAt: Date.now()
              };
              saveCacheIndex();
            });
            
            cacheWrite.on('finish', () => {
              const stats = fs.statSync(finalPath);
              console.log('Cache write complete:', Math.round(stats.size / 1024), 'KB');
              cacheIndex[song.id].size = stats.size;
              saveCacheIndex();
            });

            // Use the playStream for audio
            inputStream = playStream;
          } catch (e) {
            console.warn('Cache setup failed:', e && e.message);
            inputStream = ffmpeg.stdout; // Fallback to direct output
          }
        } else {
          inputStream = ffmpeg.stdout;
        }

        ytdlpProc.on('close', () => { try { ffmpeg.stdin.end(); } catch {} });

      } else {
        console.log('Streaming via ytdl-core + ffmpeg (fallback):', song.title);
        const ytdlStream = ytdl(song.url, {
          filter: 'audioonly',
          quality: 'highestaudio',
          highWaterMark: 1 << 25,
          requestOptions: { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US' } }
        });
        spawnedProcs.push(ytdlStream);

        const ffmpeg = spawn(ffmpegPath, [
          '-i', 'pipe:0',
          '-analyzeduration', '0',
          '-loglevel', 'error',
          '-f', 'webm',
          '-ar', '48000',
          '-ac', '2',
          'pipe:1'
        ], { stdio: ['pipe', 'pipe', 'pipe'] });
        spawnedProcs.push(ffmpeg);

        ytdlStream.on('error', () => {});
        ffmpeg.stdin.on('error', () => {});
        ytdlStream.pipe(ffmpeg.stdin);
        inputStream = ffmpeg.stdout;

        if (ENABLE_CACHE) {
          try {
            const tee = new PassThrough();
            ffmpeg.stdout.pipe(tee);
            const tmpWrite = fs.createWriteStream(tmpPath);
            tee.pipe(tmpWrite).on('error', () => {});
          } catch (e) {
            console.warn('Cache write failed (ytdl fallback):', e && e.message);
          }
        }
      }

      if (!inputStream) throw new Error('No input stream');

      // probe
      let probe;
      try {
        probe = await demuxProbe(inputStream);
      } catch (probeErr) {
        console.warn('demuxProbe failed, fallback to webm raw:', probeErr && probeErr.message);
        const resourceFallback = createAudioResource(inputStream, { inputType: 'webm/opus', inlineVolume: true });
        resourceFallback.volume.setVolume(this.volume);
        this.player.play(resourceFallback);
        if (this.connection) this.connection.subscribe(this.player);

        resourceFallback.playStream.on('end', () => {
          if (ENABLE_CACHE) finalizeTmpAtomic(tmpPath, finalPath, song.id, song.title);
          spawnedProcs.forEach(p => { try { if (p.kill) p.kill(); } catch {} });
        });
        resourceFallback.playStream.on('error', (err) => {
          console.error('Resource error (fallback):', err);
          if (ENABLE_CACHE) finalizeTmpAtomic(tmpPath, finalPath, song.id, song.title);
          spawnedProcs.forEach(p => { try { if (p.kill) p.kill(); } catch {} });
        });
        return;
      }

      const { stream, type } = probe;
      const resource = createAudioResource(stream, { inputType: type, inlineVolume: true });
      resource.volume.setVolume(this.volume);

      this.player.play(resource);
      if (this.connection) this.connection.subscribe(this.player);

      resource.playStream.on('end', () => {
        if (ENABLE_CACHE) finalizeTmpAtomic(tmpPath, finalPath, song.id, song.title);
        spawnedProcs.forEach(p => { try { if (p.kill) p.kill(); } catch {} });
      });
      resource.playStream.on('error', (err) => {
        console.error('Resource stream error:', err);
        if (ENABLE_CACHE) finalizeTmpAtomic(tmpPath, finalPath, song.id, song.title);
        spawnedProcs.forEach(p => { try { if (p.kill) p.kill(); } catch {} });
      });

    } catch (err) {
      console.error('Play error:', err);
      this.playNext().catch(e => console.error('playNext after play error failed:', e));
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

  pause() { this.player.pause(); this.isPaused = true; }
  resume() { this.player.unpause(); this.isPaused = false; }
  skip() { this.player.stop(); }
  stop() {
    this.songs = [];
    this.currentSong = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.player.stop();
    if (this.connection) { this.connection.destroy(); this.connection = null; }
  }
  setVolume(vol) { this.volume = Math.max(0, Math.min(2, vol)); }
  toggleLoop() { this.loop = !this.loop; return this.loop; }

  async updateEmbed(message, disabled = false) {
    try {
      const embed = createMusicEmbed(this);
      const buttons = createControlButtons(disabled, this.isPlaying);
      await message.edit({ embeds: [embed], components: [buttons] });
    } catch (err) { console.error('Update embed error:', err); }
  }
}

/* ---------- initialization: load or migrate index ---------- */
loadCacheIndex();

/* ---------- helpers for exports ---------- */
const queues = new Map();
function getQueue(guildId) {
  if (!queues.has(guildId)) queues.set(guildId, new MusicQueue(guildId));
  return queues.get(guildId);
}
function deleteQueue(guildId) { queues.delete(guildId); }

module.exports = {
  getQueue,
  deleteQueue,
  isYouTubeUrl,
  searchYouTube,
  getVideoInfo,
  createMusicEmbed,
  createControlButtons,
  createQueueEmbed: (q) => {
    const embed = new EmbedBuilder().setColor('#0099ff').setTitle('Music Queue').setTimestamp();
    if (q.currentSong) {
      embed.addFields({ name: 'Now Playing', value: `**${q.currentSong.title}** - ${q.currentSong.author}` });
    }
    if (q.songs.length > 0) {
      const list = q.songs.slice(0, 10).map((s, i) => `${i + 1}. **${s.title}** - ${s.author}`).join('\n');
      embed.addFields({ name: `Up Next (${q.songs.length})`, value: list });
      if (q.songs.length > 10) embed.setFooter({ text: `+${q.songs.length - 10} more songs` });
    } else {
      embed.addFields({ name: 'Queue', value: 'Empty' });
    }
    return embed;
  },
  clearCache
};
