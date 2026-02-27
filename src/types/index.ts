// Aether DL — Shared TypeScript interfaces and Express Request augmentation.

export interface ApiUser {
  id:        string;
  username:  string;
  role:      'admin' | 'user';
  createdAt: Date;
}

export interface ApiKey {
  id:            string;
  key:           string;
  label:         string;
  userId:        string;
  createdAt:     Date;
  expiresAt:     Date | null;
  lastUsedAt:    Date | null;
  totalRequests: number;
  isActive:      boolean;
  rateLimit:     number;
}

export interface JwtPayload {
  sub:      string;
  username: string;
  role:     'admin' | 'user';
  iat?:     number;
  exp?:     number;
}

export interface VideoMetadata {
  title:             string;
  author:            string;
  channelId:         string;
  duration:          number;
  durationFormatted: string;
  thumbnail:         string;
  url:               string;
  videoId:           string;
  views:             number | null;
  uploadedAt:        string | null;
  formats:           AudioFormat[];
}

export interface AudioFormat {
  itag:     number | string;
  quality:  string;
  bitrate:  number;
  mimeType: string;
}

export interface DownloadRecord {
  id:          string;
  videoId:     string;
  title:       string;
  author:      string;
  duration:    number;
  requestedBy: string;
  requestedAt: Date;
  completedAt: Date | null;
  status:      'pending' | 'processing' | 'completed' | 'failed';
  fileSize:    number | null;
  fileName:    string | null;
  error:       string | null;
}

export interface ApiStats {
  totalRequests:      number;
  totalDownloads:     number;
  activeKeys:         number;
  totalFailures:      number;
  avgResponseTime:    number;
  topVideos:          Array<{ videoId: string; title: string; count: number }>;
  requestsTimeline:   Array<{ timestamp: string; count: number }>;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?:   T;
  error?:  { code: string; message: string; details?: unknown };
  meta?:   { requestId: string; timestamp: string; processingTime: number };
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
      user?:     ApiUser;
      apiKey?:   ApiKey;
    }
  }
}
