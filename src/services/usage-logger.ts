import type { UsageData } from '../types';
import { estimateCost } from './llm';

export async function logUsage(
  db: D1Database,
  sessionId: string,
  messageId: string | null,
  provider: string,
  usage: UsageData
): Promise<void> {
  try {
    const id = crypto.randomUUID();
    const cost = estimateCost(usage.model_name, usage.input_tokens, usage.output_tokens);
    await db
      .prepare(
        `INSERT INTO usage_logs (id, session_id, message_id, llm_provider, model_name, input_tokens, output_tokens, estimated_cost_usd)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, sessionId, messageId, provider, usage.model_name, usage.input_tokens, usage.output_tokens, cost)
      .run();
  } catch {
    // Logging failures must not block chat — silently ignore
  }
}

export async function getSessionUsage(
  db: D1Database,
  sessionId: string
): Promise<{ total_input_tokens: number; total_output_tokens: number; total_estimated_cost_usd: number }> {
  const result = await db
    .prepare(
      `SELECT
         COALESCE(SUM(input_tokens), 0) as total_input_tokens,
         COALESCE(SUM(output_tokens), 0) as total_output_tokens,
         COALESCE(SUM(estimated_cost_usd), 0) as total_estimated_cost_usd
       FROM usage_logs WHERE session_id = ?`
    )
    .bind(sessionId)
    .first<{ total_input_tokens: number; total_output_tokens: number; total_estimated_cost_usd: number }>();

  return result ?? { total_input_tokens: 0, total_output_tokens: 0, total_estimated_cost_usd: 0 };
}
