// Aether DL — User Management Controller (admin only)

import { Request, Response } from 'express';
import { store } from '../config/store.js';
import { sendSuccess, sendError } from '../utils/response.js';

export const UsersController = {
  async list(req: Request, res: Response): Promise<void> {
    const users = await store.listUsers();
    sendSuccess(res, users, 200, req);
  },

  async create(req: Request, res: Response): Promise<void> {
    const { username, password, role } = req.body as {
      username: string;
      password: string;
      role: 'admin' | 'user';
    };

    const existing = await store.findUserByUsername(username);
    if (existing) {
      sendError(res, 'USERNAME_TAKEN', 'Este nome de usuário já está em uso', 409);
      return;
    }

    const user = await store.createUser(username, password, role ?? 'user');
    sendSuccess(res, user, 201, req);
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { password, role } = req.body as { password?: string; role?: 'admin' | 'user' };

    const updated = await store.updateUser(id, { password, role });
    if (!updated) {
      sendError(res, 'NOT_FOUND', 'Usuário não encontrado', 404);
      return;
    }
    sendSuccess(res, updated, 200, req);
  },

  async remove(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    if (id === req.user!.id) {
      sendError(res, 'FORBIDDEN', 'Você não pode remover sua própria conta', 403);
      return;
    }

    const ok = await store.deleteUser(id);
    if (!ok) {
      sendError(res, 'NOT_FOUND', 'Usuário não encontrado', 404);
      return;
    }
    sendSuccess(res, { deleted: true, id }, 200, req);
  },
};
