// Aether DL — Prisma Store for persistent storage of users, API keys, download history, and metrics.

import { ApiKey, ApiUser, DownloadRecord, ApiStats } from '../types/index.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { env } from './environment.js';
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

const MAX_METRICS = 5000;

async function seedAdmin() {
  const existingAdmin = await prisma.user.findUnique({
    where: { username: env.ADMIN_USERNAME }
  });

  if (!existingAdmin) {
    const hash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
    await prisma.user.create({
      data: {
        username: env.ADMIN_USERNAME,
        role: 'admin',
        passwordHash: hash,
      }
    });
  }
}
seedAdmin().catch(console.error);

export const store = {
  async findUserByUsername(username: string): Promise<ApiUser & { passwordHash: string } | null> {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      role: user.role as any,
      createdAt: user.createdAt,
      passwordHash: user.passwordHash
    };
  },

  async findUserById(id: string): Promise<ApiUser | null> {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      role: user.role as any,
      createdAt: user.createdAt
    };
  },

  async listUsers(): Promise<ApiUser[]> {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return users.map(u => ({
      id: u.id,
      username: u.username,
      role: u.role as any,
      createdAt: u.createdAt,
    }));
  },

  async createUser(username: string, password: string, role: 'admin' | 'user'): Promise<ApiUser> {
    const hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { username, role, passwordHash: hash }
    });
    return { id: user.id, username: user.username, role: user.role as any, createdAt: user.createdAt };
  },

  async updateUser(id: string, patch: { password?: string; role?: 'admin' | 'user' }): Promise<ApiUser | null> {
    try {
      const data: Record<string, unknown> = {};
      if (patch.role) data.role = patch.role;
      if (patch.password) data.passwordHash = await bcrypt.hash(patch.password, 12);
      const user = await prisma.user.update({ where: { id }, data });
      return { id: user.id, username: user.username, role: user.role as any, createdAt: user.createdAt };
    } catch {
      return null;
    }
  },

  async deleteUser(id: string): Promise<boolean> {
    try {
      await prisma.apiKey.deleteMany({ where: { userId: id } });
      await prisma.user.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  },

  async verifyPassword(plain: string, hash: string) {
    return bcrypt.compare(plain, hash);
  },

  async createApiKey(label: string, userId: string, expiresInDays: number | null = null): Promise<ApiKey> {
    const key = `aether_${uuidv4().replace(/-/g, '')}`;
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : null;

    const apiKey = await prisma.apiKey.create({
      data: { key, label, userId, expiresAt, isActive: true, rateLimit: 100 }
    });

    return apiKey as unknown as ApiKey;
  },

  async findApiKey(key: string): Promise<ApiKey | null> {
    const apiKey = await prisma.apiKey.findUnique({ where: { key } });
    return apiKey as unknown as ApiKey | null;
  },

  async listApiKeys(): Promise<ApiKey[]> {
    const keys = await prisma.apiKey.findMany({ orderBy: { createdAt: 'desc' } });
    return keys as unknown as ApiKey[];
  },

  async registerKeyUsage(key: string) {
    await prisma.apiKey.update({
      where: { key },
      data: { lastUsedAt: new Date(), totalRequests: { increment: 1 } }
    });
  },

  async revokeApiKey(id: string): Promise<boolean> {
    try {
      await prisma.apiKey.update({ where: { id }, data: { isActive: false } });
      return true;
    } catch { return false; }
  },

  async deleteApiKey(id: string): Promise<boolean> {
    try {
      await prisma.apiKey.delete({ where: { id } });
      return true;
    } catch { return false; }
  },

  async renewApiKey(id: string, expiresInDays: number | null): Promise<import('@prisma/client').ApiKey | null> {
    try {
      const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : null;
      return await prisma.apiKey.update({
        where: { id },
        data: { isActive: true, expiresAt },
      });
    } catch { return null; }
  },

  async registerDownload(record: Omit<DownloadRecord, 'id'>): Promise<DownloadRecord> {
    const download = await prisma.download.create({
      data: { ...record, status: record.status as string }
    });

    const count = await prisma.download.count();
    if (count > 1000) {
      const oldest = await prisma.download.findFirst({
        orderBy: { requestedAt: 'desc' }, skip: 1000,
      });
      if (oldest) {
        await prisma.download.deleteMany({ where: { requestedAt: { lte: oldest.requestedAt } } });
      }
    }

    return download as unknown as DownloadRecord;
  },

  async updateDownload(id: string, patch: Partial<DownloadRecord>) {
    await prisma.download.update({ where: { id }, data: patch as any });
  },

  async listRecentDownloads(limit = 50): Promise<DownloadRecord[]> {
    const downloads = await prisma.download.findMany({
      orderBy: { requestedAt: 'desc' },
      take: limit,
    });
    return downloads as unknown as DownloadRecord[];
  },

  async registerMetric(m: { timestamp: Date; endpoint: string; statusCode: number; responseTime: number; requestedBy: string }) {
    await prisma.metric.create({ data: m });

    const count = await prisma.metric.count();
    if (count > MAX_METRICS) {
      const oldest = await prisma.metric.findFirst({
        orderBy: { id: 'asc' }, skip: count - MAX_METRICS - 1,
      });
      if (oldest) {
        await prisma.metric.deleteMany({ where: { id: { lte: oldest.id } } });
      }
    }
  },

  async getStats(): Promise<ApiStats> {
    const [allMetrics, allDownloads, activeKeysCount] = await Promise.all([
      prisma.metric.findMany(),
      prisma.download.findMany(),
      prisma.apiKey.count({ where: { isActive: true } })
    ]);

    const total = allMetrics.length;
    const failures = allMetrics.filter((m) => m.statusCode >= 400).length;
    const avgTime = total > 0 ? Math.round(allMetrics.reduce((s, m) => s + m.responseTime, 0) / total) : 0;
    const now = Date.now();

    const buckets = new Map<string, number>();
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now - i * 3_600_000);
      const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}:00Z`;
      buckets.set(k, 0);
    }

    allMetrics.forEach((m) => {
      if (now - m.timestamp.getTime() < 86_400_000) {
        const k = `${m.timestamp.getUTCFullYear()}-${String(m.timestamp.getUTCMonth() + 1).padStart(2, '0')}-${String(m.timestamp.getUTCDate()).padStart(2, '0')}T${String(m.timestamp.getUTCHours()).padStart(2, '0')}:00Z`;
        if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
      }
    });

    const videoCount = new Map<string, { title: string; count: number }>();
    allDownloads.forEach((d) => {
      const entry = videoCount.get(d.videoId);
      if (entry) entry.count++;
      else videoCount.set(d.videoId, { title: d.title, count: 1 });
    });

    const topVideos = Array.from(videoCount.entries())
      .map(([videoId, v]) => ({ videoId, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalRequests: total,
      totalDownloads: allDownloads.length,
      activeKeys: activeKeysCount,
      totalFailures: failures,
      avgResponseTime: avgTime,
      topVideos,
      requestsTimeline: Array.from(buckets.entries()).map(([timestamp, count]) => ({ timestamp, count })),
    };
  },
};

export async function renewApiKey(id: string, expiresInDays: number | null): Promise<import('@prisma/client').ApiKey | null> {
  try {
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : null;
    return await prisma.apiKey.update({
      where: { id },
      data: { isActive: true, expiresAt },
    });
  } catch { return null; }
}
