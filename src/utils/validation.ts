// Aether DL — Zod schemas and request validation middleware factory.

import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { sendError } from './response.js';

const YOUTUBE_URL_RE = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)[A-Za-z0-9_-]{11}/;

export const schemas = {
  videoUrl: z.object({
    url: z
      .string({ required_error: 'O campo url é obrigatório' })
      .trim()
      .regex(YOUTUBE_URL_RE, 'URL não é um vídeo válido do YouTube'),
  }),

  login: z.object({
    username: z.string().min(1, 'O campo username é obrigatório'),
    password: z.string().min(1, 'O campo password é obrigatório'),
  }),

  createApiKey: z.object({
    label:        z.string().min(1, 'O campo label é obrigatório').max(64, 'Máximo de 64 caracteres'),
    expiresInDays: z.number().int().positive().nullable().default(null),
  }),
};

export function validate(schema: z.ZodTypeAny, source: 'body' | 'query' = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(source === 'query' ? req.query : req.body);
    if (!result.success) {
      sendError(res, 'VALIDATION_ERROR', 'Falha na validação da requisição', 422, result.error.flatten());
      return;
    }
    if (source === 'query') req.query = result.data as typeof req.query;
    else req.body = result.data;
    next();
  };
}
