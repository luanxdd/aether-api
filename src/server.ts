// Aether DL — Server bootstrap, middleware stack, and graceful shutdown.

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/environment.js';
import { requestContext } from './middleware/context.js';
import apiRoutes from './routes/api.js';
import { sendError } from './utils/response.js';
import { YouTubeService } from './services/youtube.js';

const app: express.Application = express();

app.set('trust proxy', 1);
app.use(helmet());

const allowedOrigins = env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',');
app.use(
  cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    exposedHeaders: ['X-Request-ID'],
  })
);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(requestContext);

if (env.NODE_ENV !== 'test') {
  app.use(
    morgan(':method :url :status :res[content-length] - :response-time ms', {
      skip: (req) => req.path === '/health',
    })
  );
}

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

app.use('/api/v1', apiRoutes);

app.get('/health', (_req, res) => {
  res.json({
    status: 'operational',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

app.use((_req: Request, res: Response) => {
  sendError(res, 'NOT_FOUND', 'Rota não encontrada', 404);
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Unhandled Error]', err);
  sendError(res, 'INTERNAL_ERROR', 'Ocorreu um erro inesperado no servidor', 500);
});

const server = app.listen(env.PORT, async () => {
  const deps = await YouTubeService.checkDependencies();

  const lines = [
    '',
    '  ╔══════════════════════════════════════════╗',
    '  ║           Aether DL  v2.0.0              ║',
    '  ╠══════════════════════════════════════════╣',
    `  ║  API     →  http://localhost:${env.PORT}/api/v1  ║`,
    `  ║  Health  →  http://localhost:${env.PORT}/health    ║`,
    `  ║  Mode    →  ${env.NODE_ENV.padEnd(29)}║`,
    '  ╠══════════════════════════════════════════╣',
    '  ║  Dependencies:                           ║',
    `  ║  yt-dlp  ${(deps.ytdlp  ?? 'NOT FOUND').substring(0, 33).padEnd(33)}║`,
    `  ║  ffmpeg  ${(deps.ffmpeg ?? 'NOT FOUND').substring(0, 33).padEnd(33)}║`,
    `  ║  aria2c  ${(deps.aria2c ?? 'not installed — using built-in').substring(0, 33).padEnd(33)}║`,
    '  ╚══════════════════════════════════════════╝',
    '',
  ];
  console.log(lines.join('\n'));

  if (!deps.ytdlp)  console.error('  ⚠️  yt-dlp not found. Install with: pip install yt-dlp\n');
  if (!deps.ffmpeg) console.error('  ⚠️  ffmpeg not found. Install with: sudo apt install ffmpeg\n');
});

const shutdown = (signal: string) => {
  console.log(`\n[${signal}] Shutting down server…`);
  server.close(() => { console.log('Server closed.'); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

export default app;
