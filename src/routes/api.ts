import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { metricsCollector } from '../middleware/context.js';
import { AuthController } from '../controllers/auth.js';
import { DownloadController } from '../controllers/download.js';
import { UsersController } from '../controllers/users.js';
import { validate, schemas } from '../utils/validation.js';
import { env } from '../config/environment.js';

const router: Router = Router();
router.use(metricsCollector);

const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS, max: env.RATE_LIMIT_MAX,
  standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Muitas requisições.' } },
});
const downloadLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS, max: env.DOWNLOAD_RATE_LIMIT_MAX,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
  message: { success: false, error: { code: 'DOWNLOAD_LIMIT_EXCEEDED', message: 'Limite de downloads atingido.' } },
});
router.use(globalLimiter);

router.post('/auth/login', validate(schemas.login), AuthController.login);
router.get('/auth/me', authenticate, AuthController.me);

router.get('/users',        authenticate, requireAdmin, UsersController.list);
router.post('/users',       authenticate, requireAdmin, UsersController.create);
router.patch('/users/:id',  authenticate, requireAdmin, UsersController.update);
router.delete('/users/:id', authenticate, requireAdmin, UsersController.remove);

router.post('/keys',                authenticate, validate(schemas.createApiKey), AuthController.createKey);
router.get('/keys',                 authenticate, AuthController.listKeys);
router.patch('/keys/:id/revoke',    authenticate, AuthController.revokeKey);
router.patch('/keys/:id/renew',     authenticate, AuthController.renewKey);   // ← NEW
router.delete('/keys/:id',          authenticate, requireAdmin, AuthController.deleteKey);

router.get('/info',      authenticate, validate(schemas.videoUrl, 'query'), DownloadController.getInfo);
router.get('/stream',    authenticate, downloadLimiter, validate(schemas.videoUrl, 'query'), DownloadController.streamMp3);
router.post('/download', authenticate, downloadLimiter, validate(schemas.videoUrl, 'body'), DownloadController.downloadOnServer);
router.get('/downloads', authenticate, DownloadController.listDownloads);
router.get('/stats',     authenticate, DownloadController.getStats);

export default router;
