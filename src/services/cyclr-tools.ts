import type { LLMTool } from './llm';
import { QUICKBOOKS_METHODS, QUICKBOOKS_CATEGORIES } from '../data/quickbooks-methods';
import { callCyclrMethod, type CyclrConfig } from './cyclr';

// Build a concise catalog string for the LLM to reference
function buildMethodCatalog(): string {
  const lines: string[] = [];
  for (const [category, methods] of Object.entries(QUICKBOOKS_CATEGORIES)) {
    const methodList = methods.map((m) => `${m.name} (id:${m.id})`).join(', ');
    lines.push(`${category}: ${methodList}`);
  }
  return lines.join('\n');
}

const METHOD_CATALOG = buildMethodCatalog();

export function getCyclrToolsForLLM(): LLMTool[] {
  return [
    {
      name: 'qb_list_methods',
      description: `List available QuickBooks methods. Returns the full catalog of methods organized by category. Use this first to find the right method ID before calling qb_call_method.`,
      input_schema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: `Optional: filter by category name. Available categories: ${Object.keys(QUICKBOOKS_CATEGORIES).join(', ')}`,
          },
        },
      },
    },
    {
      name: 'qb_call_method',
      description: `Call a QuickBooks method by its ID. Use qb_list_methods first to find the correct method ID. Common methods: List Customers (1571298), Create Customer (1571385), List Invoices (1571407), Create Invoice (1571378), List Payments (1571246), Get Balance Sheet Report (1571238).`,
      input_schema: {
        type: 'object',
        properties: {
          method_id: {
            type: 'number',
            description: 'The numeric method ID from the catalog (e.g. 1571298 for List Customers)',
          },
          body: {
            type: 'object',
            description: 'Request body fields for create/update methods. Field names use the format from the method schema.',
          },
        },
        required: ['method_id'],
      },
    },
  ];
}

export async function handleCyclrToolCall(
  toolName: string,
  args: Record<string, unknown>,
  cyclrConfig: {
    accountId: string;
    clientId: string;
    clientSecret: string;
    connectorId: string;
    bearerToken?: string;
    tokenExpiresAt?: string;
  },
  db: D1Database
): Promise<string> {
  // Handle list methods tool
  if (toolName === 'qb_list_methods') {
    const category = args.category as string | undefined;
    if (category) {
      const methods = QUICKBOOKS_CATEGORIES[category];
      if (!methods) {
        return `Category "${category}" not found. Available: ${Object.keys(QUICKBOOKS_CATEGORIES).join(', ')}`;
      }
      return methods.map((m) => `${m.name} (id:${m.id}) - ${m.description}`).join('\n');
    }
    return METHOD_CATALOG;
  }

  // Handle call method tool
  if (toolName === 'qb_call_method') {
    const methodId = args.method_id as number;
    if (!methodId || isNaN(methodId)) {
      return 'Error: method_id is required. Use qb_list_methods to find the correct ID.';
    }

    const method = QUICKBOOKS_METHODS.find((m) => m.id === methodId);
    if (!method) {
      return `Error: Method ID ${methodId} not found in catalog.`;
    }

    const config: CyclrConfig = {
      accountId: cyclrConfig.accountId,
      clientId: cyclrConfig.clientId,
      clientSecret: cyclrConfig.clientSecret,
      connectorId: cyclrConfig.connectorId,
      bearerToken: cyclrConfig.bearerToken,
      tokenExpiresAt: cyclrConfig.tokenExpiresAt,
    };

    try {
      const body = args.body as Record<string, unknown> | undefined;
      const result = await callCyclrMethod(config, methodId, body, db);
      let resultStr = JSON.stringify(result, null, 2);
      if (resultStr.length > 40000) {
        resultStr = resultStr.slice(0, 40000) + '\n... [truncated, showing partial results]';
      }
      return `${method.name} result:\n${resultStr}`;
    } catch (e: unknown) {
      return `Error calling ${method.name} (${methodId}): ${e}`;
    }
  }

  // Legacy: handle old qb_XXXXXXX format
  const methodIdStr = toolName.replace('qb_', '');
  const methodId = parseInt(methodIdStr, 10);
  if (!isNaN(methodId)) {
    const config: CyclrConfig = {
      accountId: cyclrConfig.accountId,
      clientId: cyclrConfig.clientId,
      clientSecret: cyclrConfig.clientSecret,
      connectorId: cyclrConfig.connectorId,
      bearerToken: cyclrConfig.bearerToken,
      tokenExpiresAt: cyclrConfig.tokenExpiresAt,
    };
    try {
      const body = args.body as Record<string, unknown> | undefined;
      const result = await callCyclrMethod(config, methodId, body, db);
      return JSON.stringify(result, null, 2);
    } catch (e: unknown) {
      return `Error calling method ${methodId}: ${e}`;
    }
  }

  return `Unknown tool: ${toolName}`;
}
