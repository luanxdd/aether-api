// Aether DL — Loading and validating environment variables via Zod. Fails immediately if anything is incorrect.

import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SchemaEnv = z.object({
  NODE_ENV:                z.enum(['development', 'production', 'test']).default('development'),
  PORT:                    z.coerce.number().int().positive().default(3333),

  JWT_SECRET:              z.string().min(32, 'JWT_SECRET deve ter no mínimo 32 caracteres'),
  JWT_EXPIRES_IN:          z.string().default('7d'),

  ADMIN_USERNAME:          z.string().min(3).default('admin'),
  ADMIN_PASSWORD:          z.string().min(8),

  RATE_LIMIT_WINDOW_MS:    z.coerce.number().default(900_000),
  RATE_LIMIT_MAX:          z.coerce.number().default(100),
  DOWNLOAD_RATE_LIMIT_MAX: z.coerce.number().default(10),

  DOWNLOADS_DIR:           z.string().default('./downloads'),
  MAX_DOWNLOAD_SIZE_MB:    z.coerce.number().default(150),

  CORS_ORIGINS:            z.string().default('*'),
});

const resultado = SchemaEnv.safeParse(process.env);

if (!resultado.success) {
  console.error('❌  Configuração de ambiente inválida:');
  resultado.error.issues.forEach((issue) => {
    console.error(`   • ${issue.path.join('.')} — ${issue.message}`);
  });
  process.exit(1);
}

export const env = resultado.data;
export type Env = typeof env;
