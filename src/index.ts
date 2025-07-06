#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { chromium } from 'playwright';
import { checkExistingBrowser, launchBrowser } from './browser.js';
import {
  GetRecentRequestsSchema,
  type MonitorStatus,
  type NetworkRequest,
  type StartMonitorOptions,
  StartMonitorSchema,
} from './types.js';

class NetworkMonitorMCP {
  private server: Server;
  private isMonitoring = false;
  private cdpWebSocketUrl: string | null = null;
  private cdpPort = 9222;
  private networkBuffer: NetworkRequest[] = [];

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
            description:
              'Start network monitoring with auto-launched browser. Smart filtering excludes static files/CDN/analytics, includes API communications.',
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
                  description:
                    'Enable smart default filtering (excludes static files, CDN assets, analytics; includes JSON, form data, plain text)',
                  default: true,
                },
                headless: {
                  type: 'boolean',
                  description: 'Run browser in headless mode (false = visible browser)',
                  default: false,
                },
                cdp_port: {
                  type: 'number',
                  description: 'Chrome DevTools Protocol port number',
                  default: 9222,
                },
                custom_filter: {
                  type: 'object',
                  description: 'Custom filtering rules. Works with auto_filter when both enabled. Example: {"include_url_patterns": ["api\\\\.github\\\\.com"], "content_types": ["application/json"]}',
                  properties: {
                    include_url_patterns: {
                      type: 'array',
                      items: { type: 'string' },
                      description:
                        'Regex patterns for URLs to include (whitelist). Takes precedence over exclude patterns. Example: ["api\\\\.github\\\\.com", "graphql", ".*\\\\.amazonaws\\\\.com"]',
                    },
                    exclude_url_patterns: {
                      type: 'array',
                      items: { type: 'string' },
                      description:
                        'Regex patterns for URLs to exclude (blacklist). Applied after include patterns. Example: ["google-analytics", "\\\\.(css|js|png)$", "tracking"]',
                    },
                    content_types: {
                      type: 'array',
                      items: { type: 'string' },
                      description:
                        'Content-Type headers to include (exact match). Replaces default content types when specified. Example: ["application/json", "text/plain", "application/xml"]',
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
      const options: StartMonitorOptions = StartMonitorSchema.parse(args || {});
      this.cdpPort = options.cdp_port;

      // Check if browser is already running
      const browserExists = await checkExistingBrowser(this.cdpPort);

      if (browserExists) {
        console.error(`Browser already running on port ${this.cdpPort}, skipping launch`);
        // Get existing WebSocket URL
        const response = await fetch(`http://localhost:${this.cdpPort}/json/version`);
        const data = await response.json();
        this.cdpWebSocketUrl = data.webSocketDebuggerUrl;
      } else {
        console.error('Launching new browser instance...');
        // Launch new browser
        this.cdpWebSocketUrl = await launchBrowser(chromium, options.headless, this.cdpPort);
        console.error(`Browser launched with CDP endpoint: ${this.cdpWebSocketUrl}`);
      }

      this.isMonitoring = true;

      const status: MonitorStatus = {
        status: 'started',
        buffer_size: options.max_buffer_size,
        auto_filter: options.auto_filter,
        cdp_endpoint: this.cdpWebSocketUrl,
        cdp_port: this.cdpPort,
        browser_already_running: browserExists,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(status, null, 2),
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
