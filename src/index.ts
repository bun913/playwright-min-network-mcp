#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Tool schemas
const StartMonitorSchema = z.object({
  max_buffer_size: z.number().optional().default(200),
  auto_filter: z.boolean().optional().default(true),
  custom_filter: z
    .object({
      include_url_patterns: z.array(z.string()).optional(),
      exclude_url_patterns: z.array(z.string()).optional(),
      content_types: z.array(z.string()).optional(),
    })
    .optional(),
});

const GetRecentRequestsSchema = z.object({
  count: z.number().optional().default(30),
  filter: z
    .object({
      methods: z.array(z.string()).optional(),
      url_pattern: z.string().optional(),
      content_type: z.array(z.string()).optional(),
    })
    .optional(),
  include_body: z.boolean().optional().default(true),
});

class NetworkMonitorMCP {
  private server: Server;
  private isMonitoring = false;

  constructor() {
    this.server = new Server(
      {
        name: 'network-monitor',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'start_monitor',
            description: 'Start network monitoring with auto-launched browser',
            inputSchema: {
              type: 'object',
              properties: {
                max_buffer_size: {
                  type: 'number',
                  description: 'Maximum buffer size for storing requests',
                  default: 200,
                },
                auto_filter: {
                  type: 'boolean',
                  description: 'Enable automatic filtering of requests',
                  default: true,
                },
                custom_filter: {
                  type: 'object',
                  description: 'Custom filtering options',
                  properties: {
                    include_url_patterns: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'URL patterns to include',
                    },
                    exclude_url_patterns: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'URL patterns to exclude',
                    },
                    content_types: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Content types to include',
                    },
                  },
                },
              },
            },
          },
          {
            name: 'stop_monitor',
            description: 'Stop network monitoring',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_recent_requests',
            description: 'Get recent network requests',
            inputSchema: {
              type: 'object',
              properties: {
                count: {
                  type: 'number',
                  description: 'Number of requests to return',
                  default: 30,
                },
                filter: {
                  type: 'object',
                  description: 'Filter options',
                  properties: {
                    methods: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'HTTP methods to include',
                    },
                    url_pattern: {
                      type: 'string',
                      description: 'URL pattern to match',
                    },
                    content_type: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Content types to include',
                    },
                  },
                },
                include_body: {
                  type: 'boolean',
                  description: 'Include request/response bodies',
                  default: true,
                },
              },
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'start_monitor':
          return this.startMonitor(args);
        case 'stop_monitor':
          return this.stopMonitor();
        case 'get_recent_requests':
          return this.getRecentRequests(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private async startMonitor(args: any) {
    try {
      const options = StartMonitorSchema.parse(args || {});

      // TODO: Implement actual browser launch and monitoring
      this.isMonitoring = true;

      return {
        content: [
          {
            type: 'text',
            text: `Network monitoring started with buffer size: ${options.max_buffer_size}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to start monitor: ${error}`);
    }
  }

  private async stopMonitor() {
    // TODO: Implement actual monitoring stop
    this.isMonitoring = false;

    return {
      content: [
        {
          type: 'text',
          text: 'Network monitoring stopped',
        },
      ],
    };
  }

  private async getRecentRequests(args: any) {
    try {
      const _options = GetRecentRequestsSchema.parse(args || {});

      // TODO: Implement actual request retrieval
      const mockResponse = {
        total_captured: 0,
        showing: 0,
        requests: [],
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(mockResponse, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get recent requests: ${error}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Network Monitor MCP server running on stdio');
  }
}

// Start the server
const server = new NetworkMonitorMCP();
server.run().catch(console.error);
