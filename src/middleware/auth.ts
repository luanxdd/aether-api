// Aether DL — Authentication Middleware. Accepts Bearer JWT or x-api-key header/query param.

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/environment.js';
import { store } from '../config/store.js';
import { JwtPayload } from '../types/index.js';
import { sendError } from '../utils/response.js';

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      const user = await store.findUserById(payload.sub);
      if (!user) { sendError(res, 'INVALID_TOKEN', 'Usuário não encontrado', 401); return; }
      req.user = user;
      return next();
    } catch (err) {
      const code = (err as Error).name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
      const msg  = code === 'TOKEN_EXPIRED' ? 'O token de acesso expirou' : 'O token de acesso é inválido';
      sendError(res, code, msg, 401);
      return;
    }
  }

  const rawKey = (req.headers['x-api-key'] as string | undefined) ?? (req.query.api_key as string | undefined);

  if (rawKey) {
    const apiKey = await store.findApiKey(rawKey);

    if (!apiKey)                                          { sendError(res, 'INVALID_KEY',  'A chave de API é inválida', 401); return; }
    if (!apiKey.isActive)                                 { sendError(res, 'REVOKED_KEY',  'A chave de API foi revogada', 403); return; }
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) { sendError(res, 'EXPIRED_KEY',  'A chave de API expirou', 403); return; }

    const user = await store.findUserById(apiKey.userId);
    if (!user) { sendError(res, 'INVALID_KEY', 'Usuário associado não encontrado', 401); return; }

    store.registerKeyUsage(rawKey).catch(console.error);
    req.apiKey = apiKey;
    req.user   = user;
    return next();
  }

  sendError(res, 'NO_AUTHENTICATION', 'Forneça um Bearer token ou o header x-api-key', 401);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') { sendError(res, 'ACCESS_DENIED', 'Acesso restrito a administradores', 403); return; }
  next();
}
