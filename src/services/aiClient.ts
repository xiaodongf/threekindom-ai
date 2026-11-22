import type {
  AIProviderStatus,
  AITurnDecisionRequest,
  AITurnDecisionResponse,
  AdvisorRequest,
  AdvisorResponse,
  DiplomacyRequest,
  DiplomacyResponse,
} from '../game/types.js';

export interface ProvidersListResponse {
  defaultMode: string;
  providers: AIProviderStatus[];
}

async function postJson<TReq, TRes>(url: string, body: TReq): Promise<TRes> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${url} failed (${res.status}): ${text}`);
  }
  return (await res.json()) as TRes;
}

export async function fetchProviders(): Promise<ProvidersListResponse> {
  const res = await fetch('/api/ai/providers');
  if (!res.ok) {
    throw new Error(`Failed to fetch providers (${res.status})`);
  }
  return (await res.json()) as ProvidersListResponse;
}

export function requestAdvisorCounsel(payload: AdvisorRequest): Promise<AdvisorResponse> {
  return postJson<AdvisorRequest, AdvisorResponse>('/api/ai/advisor', payload);
}

export function requestDiplomacyNegotiation(
  payload: DiplomacyRequest
): Promise<DiplomacyResponse> {
  return postJson<DiplomacyRequest, DiplomacyResponse>('/api/ai/diplomacy', payload);
}

export function requestAITurnDecision(
  payload: AITurnDecisionRequest
): Promise<AITurnDecisionResponse> {
  return postJson<AITurnDecisionRequest, AITurnDecisionResponse>('/api/ai/turn', payload);
}
