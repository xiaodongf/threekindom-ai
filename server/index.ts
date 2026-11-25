import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiRouter } from './api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', createApiRouter());

  // Serve built frontend in production if dist/ exists
  const distCandidates = [
    path.resolve(__dirname, '../dist'),
    path.resolve(__dirname, '../../dist'),
  ];
  const distDir = distCandidates.find((d) => fs.existsSync(path.join(d, 'index.html')));

  if (distDir) {
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return app;
}

function getLanAddress(): string | null {
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const info of list ?? []) {
      if (info.family === 'IPv4' && !info.internal) {
        return info.address;
      }
    }
  }
  return null;
}

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';

const app = createApp();
app.listen(PORT, HOST, () => {
  const lan = getLanAddress();
  console.log(`[Three Kingdoms AI] Server running on http://localhost:${PORT}`);
  if (lan && HOST === '0.0.0.0') {
    console.log(`[Three Kingdoms AI] Network access:   http://${lan}:${PORT}`);
  }
});
