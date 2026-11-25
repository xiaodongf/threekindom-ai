import type Database from 'better-sqlite3';
import { Router } from 'express';
import {
  ALL_SAVE_SLOT_IDS,
  SAVE_SCHEMA_VERSION,
  isValidSaveSlotId,
  validateAndHydrateSave,
  type SaveSlotSummary,
} from '../src/game/saveSystem.js';
import { requireAuthMiddleware } from './auth.js';

interface SoloSaveRow {
  user_id: string;
  slot_id: string;
  label: string;
  summary_json: string;
  envelope_json: string;
  version: number;
  updated_at: string;
}

export function createSavesRouter(db: Database.Database): Router {
  const router = Router();
  router.use(requireAuthMiddleware);

  router.get('/', (req, res) => {
    const userId = req.authUser!.id;
    const rows = db
      .prepare(
        `SELECT slot_id, summary_json, updated_at
         FROM solo_saves
         WHERE user_id = ?`
      )
      .all(userId) as Array<{ slot_id: string; summary_json: string; updated_at: string }>;

    const bySlot = new Map<string, SaveSlotSummary>();
    for (const row of rows) {
      try {
        const summary = JSON.parse(row.summary_json) as SaveSlotSummary;
        bySlot.set(row.slot_id, summary);
      } catch {
        // Skip malformed summary row
      }
    }

    const saves: SaveSlotSummary[] = [];
    for (const slotId of ALL_SAVE_SLOT_IDS) {
      const found = bySlot.get(slotId);
      if (found) saves.push(found);
    }

    res.json({ saves });
  });

  router.get('/:slotId', (req, res) => {
    const userId = req.authUser!.id;
    const { slotId } = req.params;
    if (!isValidSaveSlotId(slotId)) {
      res.status(400).json({ error: 'Invalid save slot ID' });
      return;
    }

    const row = db
      .prepare(`SELECT * FROM solo_saves WHERE user_id = ? AND slot_id = ?`)
      .get(userId, slotId) as SoloSaveRow | undefined;

    if (!row) {
      res.status(404).json({ error: 'Save slot is empty' });
      return;
    }

    try {
      const parsed = JSON.parse(row.envelope_json) as unknown;
      const envelope = validateAndHydrateSave(parsed, slotId);
      res.json({ save: envelope });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Corrupted save data',
      });
    }
  });

  router.put('/:slotId', (req, res) => {
    const userId = req.authUser!.id;
    const { slotId } = req.params;
    if (!isValidSaveSlotId(slotId)) {
      res.status(400).json({ error: 'Invalid save slot ID' });
      return;
    }

    try {
      const nowIso = new Date().toISOString();
      const envelope = validateAndHydrateSave(
        {
          ...(typeof req.body === 'object' && req.body !== null ? req.body : {}),
          savedAt: nowIso,
        },
        slotId
      );

      db.prepare(
        `INSERT INTO solo_saves (user_id, slot_id, label, summary_json, envelope_json, version, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, slot_id) DO UPDATE SET
           label = excluded.label,
           summary_json = excluded.summary_json,
           envelope_json = excluded.envelope_json,
           version = excluded.version,
           updated_at = excluded.updated_at`
      ).run(
        userId,
        slotId,
        envelope.label,
        JSON.stringify(envelope.summary),
        JSON.stringify(envelope),
        SAVE_SCHEMA_VERSION,
        nowIso
      );

      res.json({ summary: envelope.summary, savedAt: nowIso });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Invalid save payload',
      });
    }
  });

  router.delete('/:slotId', (req, res) => {
    const userId = req.authUser!.id;
    const { slotId } = req.params;
    if (!isValidSaveSlotId(slotId)) {
      res.status(400).json({ error: 'Invalid save slot ID' });
      return;
    }
    db.prepare(`DELETE FROM solo_saves WHERE user_id = ? AND slot_id = ?`).run(userId, slotId);
    res.json({ ok: true });
  });

  return router;
}
