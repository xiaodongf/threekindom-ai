import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiRouter } from './api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '1mb' }));

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

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => {
  console.log(`[Three Kingdoms AI] Server running on http://localhost:${PORT}`);
});
