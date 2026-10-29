import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { authRoutes, sessionMiddleware } from './routes/auth.js';
import { compositionRoutes } from './routes/compositions.js';
import { learnRoutes } from './routes/learn.js';
import { adminRoutes } from './routes/admin.js';

export { MAQAM_IDS, LESSON_IDS } from './shared.js';

export function createApp(db, { clientDist } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'microphone=(self), camera=()',
    });
    next();
  });
  app.use(sessionMiddleware(db));

  const api = express.Router();
  authRoutes(api, db);
  compositionRoutes(api, db);
  learnRoutes(api, db);
  adminRoutes(api, db);
  app.use('/api', api);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'غير موجود' }));

  if (clientDist && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, {
      index: false,
      setHeaders: (res, file) => {
        // hashed assets are immutable; the shell and service worker must revalidate
        if (file.includes(`${path.sep}assets${path.sep}`)) res.set('Cache-Control', 'public, max-age=31536000, immutable');
        else res.set('Cache-Control', 'no-cache');
      },
    }));
    app.get('*', (_req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(clientDist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'بيانات غير صالحة' });
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ في الخادم' });
  });
  return app;
}
