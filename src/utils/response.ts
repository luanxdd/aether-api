// Aether DL — Standardized JSON response helpers.

import { Request, Response } from 'express';
import { ApiResponse } from '../types/index.js';

export function sendSuccess<T>(res: Response, data: T, statusCode = 200, req?: Request): void {
  const body: ApiResponse<T> = {
    success: true,
    data,
    meta: req ? {
      requestId:      req.requestId,
      timestamp:      new Date().toISOString(),
      processingTime: Date.now() - req.startTime,
    } : undefined,
  };
  res.status(statusCode).json(body);
}

export function sendError(res: Response, code: string, message: string, statusCode = 400, details?: unknown): void {
  const body: ApiResponse = { success: false, error: { code, message, details } };
  res.status(statusCode).json(body);
}
