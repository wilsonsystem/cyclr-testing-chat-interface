import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { LLMTool } from './llm';

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPClient {
  tools: MCPToolDefinition[];
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
  close(): void;
}

export async function connectMCP(serverUrl: string): Promise<MCPClient> {
  const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
  const client = new Client({ name: 'cyclr-chat', version: '1.0' });

  await client.connect(transport);

  // List tools
  let tools: MCPToolDefinition[] = [];
  try {
    const result = await client.listTools();
    tools = (result.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: (t.inputSchema ?? { type: 'object', properties: {} }) as Record<string, unknown>,
    }));
  } catch (e) {
    console.error('[MCP] tools/list failed:', e);
  }

  return {
    tools,
    async callTool(name: string, args: Record<string, unknown>): Promise<string> {
      try {
        const result = await client.callTool({ name, arguments: args });
        const content = result.content as Array<{ type?: string; text?: string }>;
        return content.map((c) => c.text ?? JSON.stringify(c)).join('\n');
      } catch (e) {
        return `Error calling tool ${name}: ${e}`;
      }
    },
    close() {
      client.close().catch(() => {});
    },
  };
}

export function mcpToolsToLLMTools(mcpTools: MCPToolDefinition[]): LLMTool[] {
  return mcpTools.map((t) => ({
    name: t.name,
    description: t.description ?? '',
    input_schema: t.inputSchema ?? { type: 'object', properties: {} },
  }));
}
