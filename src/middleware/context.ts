// Aether DL — Context Middleware: Request UUID generation and metrics collection.

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../config/store.js';

export function requestContext(req: Request, _res: Response, next: NextFunction): void {
  req.requestId = uuidv4();
  req.startTime = Date.now();
  next();
}

export function metricsCollector(req: Request, res: Response, next: NextFunction): void {
  res.on('finish', () => {
    store.registerMetric({
      timestamp:      new Date(),
      endpoint:       `${req.method} ${req.route?.path ?? req.path}`,
      statusCode:     res.statusCode,
      responseTime:   Date.now() - (req.startTime ?? Date.now()),
      requestedBy:    req.user?.username ?? req.apiKey?.label ?? 'anonymous',
    }).catch(console.error);
  });
  next();
}
