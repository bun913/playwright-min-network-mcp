#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { chromium } from 'playwright';
import { checkExistingBrowser, launchBrowser } from './browser.js';
import { connectToCdp, startNetworkMonitoring } from './monitor.js';
import {
  GetRecentRequestsSchema,
  type MonitorStatus,
  type NetworkRequest,
  type StartMonitorOptions,
  StartMonitorSchema,
} from './types.js';

export class NetworkMonitorMCP {
  private server: Server;
  private isMonitoring = false;
  private cdpWebSocketUrl: string | null = null;
  private cdpPort = 9222;
  private networkBuffer: NetworkRequest[] = [];
  private cdpWebSocket: WebSocket | null = null;

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
              'Start network monitoring with auto-launched browser. Default: captures API and form data only (JSON, form submissions). Use "all" to include static files.',
            inputSchema: {
              type: 'object',
              properties: {
                max_buffer_size: {
                  type: 'number',
                  description: 'Maximum buffer size for storing requests',
                  default: 200,
                },
                cdp_port: {
                  type: 'number',
                  description: 'Chrome DevTools Protocol port number',
                  default: 9222,
                },
                filter: {
                  type: 'object',
                  description:
                    'Content-type filtering configuration. Controls which types of network requests to capture.',
                  properties: {
                    content_types: {
                      oneOf: [
                        {
                          type: 'array',
                          items: { type: 'string' },
                          description:
                            'Array of content-type patterns to include. Example: ["application/json", "text/css"] to capture JSON and CSS files.',
                        },
                        {
                          type: 'string',
                          enum: ['all'],
                          description:
                            'Special value "all" to capture all content types including static files (CSS, JS, images).',
                        },
                      ],
                      default: [
                        'application/json',
                        'application/x-www-form-urlencoded',
                        'multipart/form-data',
                        'text/plain',
                      ],
                      description:
                        'Content types to capture. Default: API and form data only. Use "all" for everything including static files, or [] to capture nothing.',
                    },
                    url_exclude_patterns: {
                      type: 'array',
                      items: { type: 'string' },
                      description:
                        'Array of URL patterns to exclude. Example: ["\\.js$", "\\.css$", "\\.png$"] to exclude static assets.',
                    },
                    methods: {
                      type: 'array',
                      items: { type: 'string' },
                      description:
                        'Array of HTTP methods to include. Example: ["GET", "POST"] to only capture GET and POST requests.',
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
                  default: 10,
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
                include_headers: {
                  type: 'boolean',
                  description: 'Include request/response headers',
                  default: false,
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
      console.error(`DEBUG: Checking for existing browser on port ${this.cdpPort}...`);
      const browserExists = await checkExistingBrowser(this.cdpPort);

      if (browserExists) {
        console.error(`DEBUG: Browser already running on port ${this.cdpPort}, skipping launch`);
        // Get existing page WebSocket URL
        const listResponse = await fetch(`http://localhost:${this.cdpPort}/json/list`);
        const pages = await listResponse.json();

        if (Array.isArray(pages) && pages.length > 0) {
          this.cdpWebSocketUrl = pages[0].webSocketDebuggerUrl;
          console.error(`DEBUG: Using existing page WebSocket: ${this.cdpWebSocketUrl}`);
        } else {
          console.error(
            `DEBUG: Browser running on port ${this.cdpPort} but no active pages found. Cleaning up and launching new instance...`
          );
          // Clean up any existing monitoring state
          await this.stopMonitor();
          // Launch new browser
          this.cdpWebSocketUrl = await launchBrowser(chromium, this.cdpPort);
          console.error(`DEBUG: Browser launched with CDP endpoint: ${this.cdpWebSocketUrl}`);
        }
      } else {
        console.error('DEBUG: No existing browser found, launching new instance...');
        // Launch new browser (always visible)
        this.cdpWebSocketUrl = await launchBrowser(chromium, this.cdpPort);
        console.error(`DEBUG: Browser launched with CDP endpoint: ${this.cdpWebSocketUrl}`);
      }

      // Connect to CDP and start monitoring
      if (this.cdpWebSocketUrl) {
        try {
          console.error(`DEBUG: Connecting to CDP WebSocket: ${this.cdpWebSocketUrl}`);
          this.cdpWebSocket = await connectToCdp(this.cdpWebSocketUrl);
          console.error('DEBUG: CDP WebSocket connected successfully');

          await startNetworkMonitoring(
            this.cdpWebSocket,
            this.networkBuffer,
            {
              contentTypes: options.filter.content_types,
              urlExcludePatterns: options.filter.url_exclude_patterns,
              methods: options.filter.methods,
            },
            options.max_buffer_size
          );
          this.isMonitoring = true;
          console.error('DEBUG: Network monitoring started successfully');
        } catch (error) {
          throw new Error(`Failed to start network monitoring: ${error}`);
        }
      } else {
        throw new Error('CDP WebSocket URL not available');
      }

      const status: MonitorStatus = {
        status: 'started',
        buffer_size: options.max_buffer_size,
        filter: {
          contentTypes: options.filter.content_types,
        },
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
    if (this.cdpWebSocket) {
      this.cdpWebSocket.close();
      this.cdpWebSocket = null;
      console.error('CDP WebSocket connection closed');
    }

    this.isMonitoring = false;
    this.cdpWebSocketUrl = null;

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
      const options = GetRecentRequestsSchema.parse(args || {});

      // Apply additional filtering if specified
      let filteredRequests = [...this.networkBuffer];

      if (options.filter) {
        filteredRequests = filteredRequests.filter((req) => {
          // Filter by HTTP methods
          if (options.filter?.methods && options.filter.methods.length > 0) {
            if (!options.filter.methods.includes(req.method)) {
              return false;
            }
          }

          // Filter by URL pattern
          if (options.filter?.url_pattern) {
            try {
              const regex = new RegExp(options.filter.url_pattern);
              if (!regex.test(req.url)) {
                return false;
              }
            } catch (error) {
              console.error(`Invalid URL pattern: ${options.filter.url_pattern}`, error);
              return false;
            }
          }

          // Filter by content type
          if (options.filter?.content_type && options.filter.content_type.length > 0) {
            const responseMimeType = req.response?.mimeType;
            if (!responseMimeType) {
              return false;
            }

            const matchesContentType = options.filter.content_type.some((ct) =>
              responseMimeType.includes(ct)
            );
            if (!matchesContentType) {
              return false;
            }
          }

          return true;
        });
      }

      // Sort by timestamp (newest first) and limit count
      filteredRequests.sort((a, b) => b.timestamp - a.timestamp);
      const limitedRequests = filteredRequests.slice(0, options.count);

      // Remove request/response bodies and headers if not requested
      const requestsToReturn = limitedRequests.map((req) => {
        const requestCopy = { ...req };

        if (!options.include_body) {
          delete requestCopy.body;
          if (requestCopy.response) {
            requestCopy.response = {
              ...requestCopy.response,
            };
            delete requestCopy.response.body;
          }
        }

        if (!options.include_headers) {
          (requestCopy as any).headers = undefined;
          if (requestCopy.response) {
            (requestCopy.response as any).headers = undefined;
          }
        }

        return requestCopy;
      });

      const response = {
        total_captured: this.networkBuffer.length,
        showing: requestsToReturn.length,
        requests: requestsToReturn,
      };

      // Log filtering suggestions if result size is large
      const resultSize = JSON.stringify(response).length;
      if (resultSize > 20000) {
        // ~20KB threshold
        console.warn(
          `💡 Large result size (${Math.round(resultSize / 1024)}KB). Consider filtering to reduce output:`
        );
        console.warn(
          `   • URL filtering: { "filter": { "url_pattern": "collector|_private|analytics|avatar" } }`
        );
        console.warn(`   • Method filtering: { "filter": { "methods": ["POST", "PUT"] } }`);
        console.warn(
          `   • Content type filtering: { "filter": { "content_type": ["application/json"] } }`
        );
        console.warn(`   • Reduce count: { "count": 5 }`);
        console.warn(`   • Exclude bodies: { "include_body": false }`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
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
