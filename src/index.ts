#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { chromium } from 'playwright';
import { launchBrowserServer } from './browser.js';
import { connectToCdp, startNetworkMonitoring } from './monitor.js';
import {
  GetRecentRequestsSchema,
  type GetRequestDetailOptions,
  GetRequestDetailSchema,
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
  private browserServer: any = null;

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
            name: 'start_or_update_capture',
            description:
              'Start network capture or update filter settings with auto-launched browser. Default: captures API and form data only (JSON, form submissions). Use "all" to include static files.',
            inputSchema: {
              type: 'object',
              properties: {
                max_buffer_size: {
                  type: 'number',
                  description: 'Maximum buffer size for storing requests',
                  default: 20,
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
            description:
              'Get recent network requests overview. For MCP context efficiency, use include_body=false (default) and get_request_detail for specific requests.',
            inputSchema: {
              type: 'object',
              properties: {
                count: {
                  type: 'number',
                  description: 'Number of requests to return',
                  default: 10,
                },
                include_body: {
                  type: 'boolean',
                  description:
                    'Include request/response bodies (WARNING: may consume large MCP context)',
                  default: false,
                },
                include_headers: {
                  type: 'boolean',
                  description: 'Include request/response headers',
                  default: false,
                },
              },
            },
          },
          {
            name: 'get_request_detail',
            description:
              'Get full details for a specific request by UUID. Recommended for viewing request/response bodies efficiently.',
            inputSchema: {
              type: 'object',
              properties: {
                uuid: {
                  type: 'string',
                  description: 'UUID of the request to retrieve details for',
                  pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
                },
              },
              required: ['uuid'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'start_or_update_capture':
          return this.startMonitor(args);
        case 'stop_monitor':
          return this.stopMonitor();
        case 'get_recent_requests':
          return this.getRecentRequests(args);
        case 'get_request_detail':
          return this.getRequestDetail(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private async startMonitor(args: any) {
    try {
      const options: StartMonitorOptions = StartMonitorSchema.parse(args || {});
      this.cdpPort = options.cdp_port;

      // Close existing browser server if any
      if (this.browserServer) {
        await this.browserServer.close();
        this.browserServer = null;
      }

      // Launch fresh browser server
      this.browserServer = await launchBrowserServer(chromium, this.cdpPort);

      // Get CDP WebSocket URL from the debugging port
      const listResponse = await fetch(`http://localhost:${this.cdpPort}/json/list`);
      const pages = await listResponse.json();
      this.cdpWebSocketUrl = pages[0].webSocketDebuggerUrl;

      // Connect to CDP and start monitoring
      if (!this.cdpWebSocketUrl) {
        throw new Error('Failed to get WebSocket URL from browser server');
      }
      this.cdpWebSocket = await connectToCdp(this.cdpWebSocketUrl);

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

      const status: MonitorStatus = {
        status: 'started',
        buffer_size: options.max_buffer_size,
        filter: {
          contentTypes: options.filter.content_types,
        },
        cdp_endpoint: this.cdpWebSocketUrl,
        cdp_port: this.cdpPort,
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
    }

    // Close browser server properly
    if (this.browserServer) {
      await this.browserServer.close();
      this.browserServer = null;
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

      // Sort by timestamp (newest first) and limit count
      const sortedRequests = [...this.networkBuffer].sort((a, b) => b.timestamp - a.timestamp);
      const limitedRequests = sortedRequests.slice(0, options.count);

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

  private async getRequestDetail(args: any) {
    try {
      const options: GetRequestDetailOptions = GetRequestDetailSchema.parse(args || {});

      // Find request by UUID
      const request = this.networkBuffer.find((req) => req.uuid === options.uuid);

      if (!request) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: 'Request not found',
                  uuid: options.uuid,
                  message: 'No request found with the specified UUID in the current buffer',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Return full request details
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(request, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get request detail: ${error}`);
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
