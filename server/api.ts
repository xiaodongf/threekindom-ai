import type Database from 'better-sqlite3';
import { Router } from 'express';
import type {
  AITurnDecisionRequest,
  AdvisorRequest,
  DiplomacyRequest,
  HeroEncounterRequest,
} from '../src/game/types.js';
import {
  getProviderStatuses,
  handleAITurnRequest,
  handleAdvisorRequest,
  handleDiplomacyRequest,
  handleHeroEncounterRequest,
} from './ai/registry.js';
import { attachAuthMiddleware, createAuthRouter } from './auth.js';
import { getDefaultDb } from './db.js';
import { createRoomsRouter } from './rooms.js';
import { createSavesRouter } from './saves.js';

export function createApiRouter(customDb?: Database.Database): Router {
  const db = customDb ?? getDefaultDb();
  const router = Router();

  router.use(attachAuthMiddleware(db));

  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'threekindom-ai', persistence: 'sqlite' });
  });

  router.use('/auth', createAuthRouter(db));
  router.use('/saves', createSavesRouter(db));
  router.use('/rooms', createRoomsRouter(db));

  router.get('/ai/providers', (_req, res) => {
    res.json({
      defaultMode: process.env.AI_PROVIDER || 'auto',
      providers: getProviderStatuses(),
    });
  });

  router.post('/ai/advisor', async (req, res) => {
    try {
      const body = req.body as AdvisorRequest;
      if (!body?.gameState || !body?.question) {
        res.status(400).json({ error: 'Missing gameState or question' });
        return;
      }
      const response = await handleAdvisorRequest(body);
      res.json(response);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Advisor error' });
    }
  });

  router.post('/ai/diplomacy', async (req, res) => {
    try {
      const body = req.body as DiplomacyRequest;
      if (!body?.gameState || !body?.targetFaction || !body?.proposalType) {
        res.status(400).json({ error: 'Missing diplomacy payload' });
        return;
      }
      const response = await handleDiplomacyRequest(body);
      res.json(response);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Diplomacy error' });
    }
  });

  router.post('/ai/hero-encounter', async (req, res) => {
    try {
      const body = req.body as HeroEncounterRequest;
      if (!body?.gameState || !body?.heroId || !body?.mode) {
        res.status(400).json({ error: 'Missing hero encounter payload' });
        return;
      }
      const response = await handleHeroEncounterRequest(body);
      res.json(response);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Hero encounter error' });
    }
  });

  router.post('/ai/turn', async (req, res) => {
    try {
      const body = req.body as AITurnDecisionRequest;
      if (!body?.gameState || !body?.factionId) {
        res.status(400).json({ error: 'Missing gameState or factionId' });
        return;
      }
      const response = await handleAITurnRequest(body);
      res.json(response);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'AI turn error' });
    }
  });

  return router;
}
