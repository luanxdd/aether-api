// Aether DL — Download Controller: Metadata, MP3 stream, async download, history, and stats.

import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { YouTubeService } from '../services/youtube.js';
import { store } from '../config/store.js';
import { env } from '../config/environment.js';
import { sendSuccess, sendError } from '../utils/response.js';

const DOWNLOADS_DIR = path.resolve(env.DOWNLOADS_DIR);

if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

function encodeHeaderValue(value: string): string {
  return encodeURIComponent(value ?? '');
}

export const DownloadController = {
  async getInfo(req: Request, res: Response): Promise<void> {
    const url = req.query.url as string;

    if (!YouTubeService.validateUrl(url)) {
      sendError(res, 'INVALID_URL', 'A URL não corresponde a um vídeo válido do YouTube', 422);
      return;
    }

    try {
      const info = await YouTubeService.getInfo(url);
      sendSuccess(res, info, 200, req);
    } catch (err) {
      sendError(
        res,
        'FETCH_FAILED',
        'Não foi possível obter informações do vídeo: ' + (err as Error).message,
        502
      );
    }
  },

  async streamMp3(req: Request, res: Response): Promise<void> {
    const url = req.query.url as string;

    if (!YouTubeService.validateUrl(url)) {
      sendError(res, 'INVALID_URL', 'A URL não corresponde a um vídeo válido do YouTube', 422);
      return;
    }

    let metadata;
    try {
      metadata = await YouTubeService.getInfo(url);
    } catch {
      sendError(res, 'FETCH_FAILED', 'Não foi possível obter informações do vídeo', 502);
      return;
    }

    const record = await store.registerDownload({
      videoId: metadata.videoId,
      title: metadata.title,
      author: metadata.author,
      duration: metadata.duration,
      requestedBy: req.user?.username ?? 'api-key',
      requestedAt: new Date(),
      completedAt: null,
      status: 'processing',
      fileSize: null,
      fileName: null,
      error: null,
    });

    try {
      const { stream, fileName } = await YouTubeService.streamAsMp3(url, metadata);

      const fullName = `${fileName}.mp3`;
      const asciiFileName = fullName.replace(/[^\x20-\x7E]/g, '');
      const encodedFileName = encodeURIComponent(fullName);

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodedFileName}`
      );

      res.setHeader('X-Video-Title', encodeHeaderValue(metadata.title));
      res.setHeader('X-Video-Author', encodeHeaderValue(metadata.author));
      res.setHeader('X-Video-Duration', String(metadata.duration ?? 0));
      res.setHeader('X-File-Name', encodedFileName);

      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }

      stream.on('error', (err) => {
        store.updateDownload(record.id, {
          status: 'failed',
          error: err.message,
        }).catch(() => {});
        res.destroy();
      });

      stream.on('end', () => {
        store.updateDownload(record.id, {
          status: 'completed',
          completedAt: new Date(),
        }).catch(() => {});
      });

      res.on('close', () => {
        if (!res.writableEnded) {
          stream.destroy();
        }
      });

      res.on('error', () => {
        stream.destroy();
      });

      stream.pipe(res);
    } catch (err) {
      await store.updateDownload(record.id, {
        status: 'failed',
        error: (err as Error).message,
      }).catch(() => {});

      if (!res.headersSent) {
        sendError(res, 'STREAM_FAILED', 'Falha durante o streaming do áudio', 500);
      } else {
        res.destroy();
      }
    }
  },

  async downloadOnServer(req: Request, res: Response): Promise<void> {
    const { url } = req.body as { url: string };

    if (!YouTubeService.validateUrl(url)) {
      sendError(res, 'INVALID_URL', 'A URL não corresponde a um vídeo válido do YouTube', 422);
      return;
    }

    let metadata;
    try {
      metadata = await YouTubeService.getInfo(url);
    } catch {
      sendError(res, 'FETCH_FAILED', 'Não foi possível obter informações do vídeo', 502);
      return;
    }

    const record = await store.registerDownload({
      videoId: metadata.videoId,
      title: metadata.title,
      author: metadata.author,
      duration: metadata.duration,
      requestedBy: req.user?.username ?? 'api-key',
      requestedAt: new Date(),
      completedAt: null,
      status: 'processing',
      fileSize: null,
      fileName: null,
      error: null,
    });

    sendSuccess(
      res,
      { downloadId: record.id, status: 'processing', title: metadata.title },
      202,
      req
    );

    YouTubeService.downloadToFile(url, metadata, DOWNLOADS_DIR)
      .then(({ fileSize, fileName }) => {
        store.updateDownload(record.id, {
          status: 'completed',
          completedAt: new Date(),
          fileSize,
          fileName,
        }).catch(() => {});
      })
      .catch((err) => {
        store.updateDownload(record.id, {
          status: 'failed',
          error: (err as Error).message,
        }).catch(() => {});
      });
  },

  async listDownloads(req: Request, res: Response): Promise<void> {
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const downloads = await store.listRecentDownloads(limit);
    sendSuccess(res, downloads, 200, req);
  },

  async getStats(req: Request, res: Response): Promise<void> {
    const stats = await store.getStats();
    sendSuccess(res, stats, 200, req);
  },
};