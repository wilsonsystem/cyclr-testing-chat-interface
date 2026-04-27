import type { LLMTool } from './llm';
import { QUICKBOOKS_METHODS, QUICKBOOKS_CATEGORIES } from '../data/quickbooks-methods';
import { NETSUITE_METHODS, NETSUITE_CATEGORIES } from '../data/netsuite-methods';
import { callCyclrMethod, type CyclrConfig } from './cyclr';

interface ConnectorMethod {
  id: number;
  name: string;
  description: string;
  category: string;
  methodType: string;
}

interface ConnectorRegistry {
  id: string;
  name: string;
  methods: ConnectorMethod[];
  categories: Record<string, ConnectorMethod[]>;
  hints: string;
}

const CONNECTORS: Record<string, ConnectorRegistry> = {
  '88534': {
    id: '88534',
    name: 'QuickBooks',
    methods: QUICKBOOKS_METHODS,
    categories: QUICKBOOKS_CATEGORIES,
    hints: 'Common methods: List Customers (1571298), Create Customer (1571385), List Invoices (1571407), Create Invoice (1571378), List Payments (1571246), Get Balance Sheet Report (1571238).',
  },
  '88934': {
    id: '88934',
    name: 'Oracle NetSuite',
    methods: NETSUITE_METHODS,
    categories: NETSUITE_CATEGORIES,
    hints: 'Common methods: List Customers (1601504). Use cyclr_list_methods first to discover the right ID for other operations.',
  },
};

const DEFAULT_CONNECTOR_ID = '88534';

function getConnector(connectorId: string | undefined): ConnectorRegistry {
  return CONNECTORS[connectorId || DEFAULT_CONNECTOR_ID] || CONNECTORS[DEFAULT_CONNECTOR_ID];
}

function buildMethodCatalog(connector: ConnectorRegistry): string {
  const lines: string[] = [];
  for (const [category, methods] of Object.entries(connector.categories)) {
    const methodList = methods.map((m) => `${m.name} (id:${m.id})`).join(', ');
    lines.push(`${category}: ${methodList}`);
  }
  return lines.join('\n');
}

export function getCyclrToolsForLLM(connectorId?: string): LLMTool[] {
  const connector = getConnector(connectorId);
  const categoriesList = Object.keys(connector.categories).join(', ');

  return [
    {
      name: 'cyclr_list_methods',
      description: `List available ${connector.name} methods via Cyclr. Returns the catalog organized by category. Use this first to find the right method ID before calling cyclr_call_method. Pass a category to narrow the list when the catalog is large.`,
      input_schema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: `Optional: filter by category name. Available categories for ${connector.name}: ${categoriesList}`,
          },
        },
      },
    },
    {
      name: 'cyclr_call_method',
      description: `Call a ${connector.name} method via Cyclr by its numeric method ID. Use cyclr_list_methods first to find the correct ID. ${connector.hints}`,
      input_schema: {
        type: 'object',
        properties: {
          method_id: {
            type: 'number',
            description: `The numeric Cyclr method ID from the ${connector.name} catalog.`,
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
  const connector = getConnector(cyclrConfig.connectorId);

  // List methods (generic + legacy qb_ name)
  if (toolName === 'cyclr_list_methods' || toolName === 'qb_list_methods') {
    const category = args.category as string | undefined;
    if (category) {
      const methods = connector.categories[category];
      if (!methods) {
        return `Category "${category}" not found in ${connector.name}. Available: ${Object.keys(connector.categories).join(', ')}`;
      }
      return methods.map((m) => `${m.name} (id:${m.id}) - ${m.description}`).join('\n');
    }
    return buildMethodCatalog(connector);
  }

  // Call method (generic + legacy qb_ name)
  if (toolName === 'cyclr_call_method' || toolName === 'qb_call_method') {
    const methodId = args.method_id as number;
    if (!methodId || isNaN(methodId)) {
      return `Error: method_id is required. Use cyclr_list_methods to find the correct ID for ${connector.name}.`;
    }

    const method = connector.methods.find((m) => m.id === methodId);
    if (!method) {
      return `Error: Method ID ${methodId} not found in ${connector.name} catalog.`;
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

  // Legacy: handle old qb_<id> direct format
  const legacyMethodIdStr = toolName.replace(/^(qb|cyclr)_/, '');
  const legacyMethodId = parseInt(legacyMethodIdStr, 10);
  if (!isNaN(legacyMethodId)) {
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
      const result = await callCyclrMethod(config, legacyMethodId, body, db);
      return JSON.stringify(result, null, 2);
    } catch (e: unknown) {
      return `Error calling method ${legacyMethodId}: ${e}`;
    }
  }

  return `Unknown tool: ${toolName}`;
}
