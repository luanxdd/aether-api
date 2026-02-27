// Aether DL — Authentication Controller: Login, JWT signing, and API key CRUD.

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/environment.js';
import { store } from '../config/store.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { JwtPayload } from '../types/index.js';

function signToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export const AuthController = {
  async login(req: Request, res: Response): Promise<void> {
    const { username, password } = req.body as { username: string; password: string };

    const user = await store.findUserByUsername(username);
    if (!user) {
      sendError(res, 'INVALID_CREDENTIALS', 'Usuário ou senha incorretos', 401);
      return;
    }

    const isValid = await store.verifyPassword(password, user.passwordHash);
    if (!isValid) {
      sendError(res, 'INVALID_CREDENTIALS', 'Usuário ou senha incorretos', 401);
      return;
    }

    const token = signToken({ sub: user.id, username: user.username, role: user.role });

    sendSuccess(res, {
      accessToken: token,
      tokenType:   'Bearer',
      expiresIn:   env.JWT_EXPIRES_IN,
      user:        { id: user.id, username: user.username, role: user.role },
    }, 200, req);
  },

  async me(req: Request, res: Response): Promise<void> {
    sendSuccess(res, req.user, 200, req);
  },

  async createKey(req: Request, res: Response): Promise<void> {
    const { label, expiresInDays } = req.body as { label: string; expiresInDays: number | null };
    const key = await store.createApiKey(label, req.user!.id, expiresInDays);
    sendSuccess(res, key, 201, req);
  },

  async listKeys(req: Request, res: Response): Promise<void> {
    const keys = (await store.listApiKeys()).filter(
      (k) => req.user!.role === 'admin' || k.userId === req.user!.id
    );
    sendSuccess(res, keys, 200, req);
  },

  async revokeKey(req: Request, res: Response): Promise<void> {
    const ok = await store.revokeApiKey(req.params.id);
    if (!ok) { sendError(res, 'NOT_FOUND', 'Chave de API não encontrada', 404); return; }
    sendSuccess(res, { revoked: true, id: req.params.id }, 200, req);
  },


  async renewKey(req: Request, res: Response): Promise<void> {
    const { expiresInDays } = req.body as { expiresInDays?: number | null };
    const updated = await store.renewApiKey(req.params.id, expiresInDays ?? null);
    if (!updated) {
      sendError(res, 'NOT_FOUND', 'Chave de API não encontrada', 404);
      return;
    }
    sendSuccess(res, updated, 200, req);
  },
  async deleteKey(req: Request, res: Response): Promise<void> {
    const ok = await store.deleteApiKey(req.params.id);
    if (!ok) { sendError(res, 'NOT_FOUND', 'Chave de API não encontrada', 404); return; }
    sendSuccess(res, { deleted: true, id: req.params.id }, 200, req);
  },
};

export async function renewKey(req: import('express').Request, res: import('express').Response): Promise<void> {
  const { expiresInDays } = req.body as { expiresInDays?: number | null };
  const updated = await store.renewApiKey(req.params.id, expiresInDays ?? null);
  if (!updated) { sendError(res, 'NOT_FOUND', 'Chave não encontrada', 404); return; }
  sendSuccess(res, updated, 200, req);
}
