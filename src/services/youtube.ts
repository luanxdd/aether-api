// Aether DL — YouTube Service: Metadata, MP3 stream, and disk download via yt-dlp + ffmpeg.

import { spawn, execFile } from 'child_process';
import { PassThrough } from 'stream';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { VideoMetadata } from '../types/index.js';

const execFileAsync = promisify(execFile);

function resolveBinary(name: string): string {
  const envKey = name.toUpperCase().replace('-', '_') + '_PATH';
  if (process.env[envKey]) return process.env[envKey]!;

  const candidates = [
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`,
    path.join(os.homedir(), `.local/bin/${name}`),
    name,
  ];

  for (const c of candidates) {
    try { fs.accessSync(c, fs.constants.X_OK); return c; } catch {}
  }
  return name;
}

const YTDLP  = resolveBinary('yt-dlp');
const ARIA2C = resolveBinary('aria2c');
const FFMPEG = resolveBinary('ffmpeg');

const HAS_ARIA2C = (() => {
  try { fs.accessSync(ARIA2C, fs.constants.X_OK); return true; } catch { return false; }
})();

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function formatFileName(metadata: VideoMetadata): string {
  const clean = (s: string) =>
    s
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 60);

  const artist = clean(metadata.author);
  const title  = clean(metadata.title);

  if (artist && title && !title.toLowerCase().includes(artist.toLowerCase())) {
    return `${artist} - ${title}`;
  }
  return title || metadata.videoId;
}

function baseArgs(): string[] {
  return [
    '--no-warnings', '--quiet', '--no-playlist',
    '--socket-timeout', '15',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ];
}

export class YouTubeService {
  static validateUrl(url: string): boolean {
    return /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)[A-Za-z0-9_-]{11}/.test(url);
  }

  static async getInfo(url: string): Promise<VideoMetadata> {
    const { stdout } = await execFileAsync(YTDLP, [...baseArgs(), '--dump-json', '--no-download', url], {
      timeout:   20_000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const raw = JSON.parse(stdout.trim());

    return {
      title:             raw.title ?? 'Unknown',
      author:            raw.uploader ?? raw.channel ?? 'Unknown',
      channelId:         raw.channel_id ?? '',
      duration:          raw.duration ?? 0,
      durationFormatted: formatDuration(raw.duration ?? 0),
      thumbnail:         raw.thumbnail ?? '',
      url:               raw.webpage_url ?? url,
      videoId:           raw.id ?? '',
      views:             raw.view_count ?? null,
      uploadedAt:        raw.upload_date
                           ? `${raw.upload_date.slice(0, 4)}-${raw.upload_date.slice(4, 6)}-${raw.upload_date.slice(6, 8)}`
                           : null,
      formats: (raw.formats ?? [])
        .filter((f: any) => f.acodec && f.acodec !== 'none')
        .slice(0, 4)
        .map((f: any) => ({
          itag:     f.format_id,
          quality:  f.quality ?? 'unknown',
          bitrate:  f.abr ? Math.round(f.abr * 1000) : 0,
          mimeType: f.ext ?? 'unknown',
        })),
    };
  }

  static async streamAsMp3(url: string, metadata: VideoMetadata): Promise<{ stream: PassThrough; fileName: string }> {
    const passThrough  = new PassThrough();
    const fileName  = formatFileName(metadata);

    const ytdlp = spawn(YTDLP, [
      ...baseArgs(),
      '--format', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
      '--output', '-',
      url,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    const ff = spawn(FFMPEG, [
      '-hide_banner', '-loglevel', 'error',
      '-i', 'pipe:0', '-vn',
      '-acodec', 'libmp3lame', '-ab', '192k', '-ar', '44100', '-ac', '2',
      '-metadata', `title=${metadata.title}`,
      '-metadata', `artist=${metadata.author}`,
      '-id3v2_version', '3',
      '-f', 'mp3', 'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    ytdlp.stdout.pipe(ff.stdin);
    ff.stdout.pipe(passThrough);

    let stderrYtdlp = '';
    ytdlp.stderr?.on('data', (d: Buffer) => { stderrYtdlp += d.toString(); });
    ytdlp.on('error', (err) => passThrough.destroy(new Error(`Error starting yt-dlp: ${err.message}`)));
    ytdlp.on('close', (code) => {
      if (code !== 0 && !passThrough.destroyed)
        passThrough.destroy(new Error(`yt-dlp exited with code ${code}: ${stderrYtdlp.slice(-300)}`));
    });

    let stderrFf = '';
    ff.stderr?.on('data', (d: Buffer) => { stderrFf += d.toString(); });
    ff.on('error', (err) => passThrough.destroy(new Error(`Error starting ffmpeg: ${err.message}`)));
    ff.on('close', (code) => {
      if (code !== 0 && !passThrough.destroyed)
        passThrough.destroy(new Error(`ffmpeg exited with code ${code}: ${stderrFf.slice(-300)}`));
    });

    return { stream: passThrough, fileName };
  }

  static async downloadToFile(
    url: string,
    metadata: VideoMetadata,
    outputDir: string,
  ): Promise<{ filePath: string; fileSize: number; fileName: string }> {
    const fileName    = formatFileName(metadata);
    const outputTemplate = path.join(outputDir, `${fileName}.%(ext)s`);
    const finalPath   = path.join(outputDir, `${fileName}.mp3`);

    const args: string[] = [
      ...baseArgs(),
      '--format', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
      '--extract-audio', '--audio-format', 'mp3', '--audio-quality', '192K',
      '--embed-metadata', '--add-metadata',
      '--output', outputTemplate,
    ];

    if (HAS_ARIA2C) {
      args.push('--external-downloader', ARIA2C, '--external-downloader-args', 'aria2c:-x 16 -k 1M --min-split-size=1M');
    } else {
      args.push('--concurrent-fragments', '4');
    }

    args.push('--ffmpeg-location', FFMPEG, url);

    await execFileAsync(YTDLP, args, { timeout: 300_000, maxBuffer: 5 * 1024 * 1024 });

    if (!fs.existsSync(finalPath)) throw new Error(`Output file not found: ${finalPath}`);

    const stat = fs.statSync(finalPath);
    return { filePath: finalPath, fileSize: stat.size, fileName };
  }

  static async checkDependencies(): Promise<{ ytdlp: string | null; ffmpeg: string | null; aria2c: string | null }> {
    async function version(bin: string, args: string[]): Promise<string | null> {
      try {
        const { stdout } = await execFileAsync(bin, args, { timeout: 5000 });
        return stdout.trim().split('\n')[0];
      } catch { return null; }
    }
    return {
      ytdlp:  await version(YTDLP,  ['--version']),
      ffmpeg: await version(FFMPEG, ['-version']),
      aria2c: HAS_ARIA2C ? await version(ARIA2C, ['--version']) : null,
    };
  }
}
