import { Router } from 'express';
import type {
  AITurnDecisionRequest,
  AdvisorRequest,
  DiplomacyRequest,
} from '../src/game/types.js';
import {
  getProviderStatuses,
  handleAITurnRequest,
  handleAdvisorRequest,
  handleDiplomacyRequest,
} from './ai/registry.js';

export function createApiRouter(): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'threekindom-ai' });
  });

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
