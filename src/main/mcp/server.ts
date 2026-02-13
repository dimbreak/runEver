import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/registry.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'runEver-mcp',
  version: '0.1.0',
});

server.tool(
  'ping',
  { message: z.string().optional() },
  async ({ message }) => {
    return {
      content: [
        {
          type: 'text',
          text: message ? `pong: ${message}` : 'pong',
        },
      ],
    };
  }
);

server.resource(
  'about',
  new ResourceTemplate('runEver://about', { list: undefined }),
  async (uri) => {
    return {
      contents: [
        {
          uri: uri.href,
          text: 'runEver MCP server is running.',
        },
      ],
    };
  }
);

async function start() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('MCP server failed to start:', error);
  process.exit(1);
});
