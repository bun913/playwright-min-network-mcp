#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { chromium } from 'playwright';
import { z } from 'zod';
import { launchBrowserServer } from './browser.js';
import { connectToCdp, startNetworkMonitoring } from './monitor.js';
import {
  type CompactNetworkRequest,
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
            name: 'start_monitor',
            description:
              'Start network monitoring with a new browser instance. Default: captures API and form data only (JSON, form submissions). Use "all" to include static files.',
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
                    url_include_patterns: {
                      oneOf: [
                        {
                          type: 'array',
                          items: { type: 'string' },
                          description:
                            'Array of URL patterns to include. Example: ["api/", "/graphql"] to capture only API endpoints.',
                        },
                        {
                          type: 'string',
                          enum: ['all'],
                          description:
                            'Special value "all" to include all URLs (no URL filtering).',
                        },
                      ],
                      default: 'all',
                      description:
                        'URL patterns to include. Default: "all" for no filtering. Use array of patterns to filter specific URLs.',
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
            name: 'update_filter',
            description:
              'Update network monitoring filter settings without restarting the browser. Preserves the current browsing session.',
            inputSchema: {
              type: 'object',
              properties: {
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
                    url_include_patterns: {
                      oneOf: [
                        {
                          type: 'array',
                          items: { type: 'string' },
                          description:
                            'Array of URL patterns to include. Example: ["api/", "/graphql"] to capture only API endpoints.',
                        },
                        {
                          type: 'string',
                          enum: ['all'],
                          description:
                            'Special value "all" to include all URLs (no URL filtering).',
                        },
                      ],
                      default: 'all',
                      description:
                        'URL patterns to include. Default: "all" for no filtering. Use array of patterns to filter specific URLs.',
                    },
                    methods: {
                      type: 'array',
                      items: { type: 'string' },
                      description:
                        'Array of HTTP methods to include. Example: ["GET", "POST"] to only capture GET and POST requests.',
                    },
                  },
                  required: ['content_types'],
                },
              },
              required: ['filter'],
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
              'Get recent network requests compact overview with 512B body previews. Always includes body previews for efficient request identification.',
            inputSchema: {
              type: 'object',
              properties: {
                count: {
                  type: 'number',
                  description: 'Number of requests to return',
                  default: 10,
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
              'Get full details for a specific request by UUID. Returns complete request/response data with 50KB body limit and optional headers to prevent MCP context overflow.',
            inputSchema: {
              type: 'object',
              properties: {
                uuid: {
                  type: 'string',
                  description: 'UUID of the request to retrieve details for',
                  pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
                },
                include_headers: {
                  type: 'boolean',
                  description:
                    'Include request/response headers (default: false for context efficiency)',
                  default: false,
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
        case 'start_monitor':
          return this.startMonitor(args);
        case 'update_filter':
          return this.updateFilter(args);
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
          urlIncludePatterns: options.filter.url_include_patterns,
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
          urlIncludePatterns: options.filter.url_include_patterns,
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

  private async updateFilter(args: any) {
    if (!this.isMonitoring || !this.cdpWebSocket) {
      throw new Error('Network monitoring is not active. Use start_monitor first.');
    }

    // Parse filter options only
    const filterSchema = z.object({
      filter: z.object({
        content_types: z
          .union([z.array(z.string()), z.literal('all')])
          .optional()
          .default([
            'application/json',
            'application/x-www-form-urlencoded',
            'multipart/form-data',
            'text/plain',
          ]),
        url_include_patterns: z
          .union([z.array(z.string()), z.literal('all')])
          .optional()
          .default('all'),
        methods: z.array(z.string()).optional(),
      }),
    });

    const options = filterSchema.parse(args || {});

    // Clear existing buffer
    this.networkBuffer.length = 0;

    // Close existing WebSocket and create new one with updated filter
    this.cdpWebSocket.close();
    this.cdpWebSocket = await connectToCdp(this.cdpWebSocketUrl!);

    await startNetworkMonitoring(
      this.cdpWebSocket,
      this.networkBuffer,
      {
        contentTypes: options.filter.content_types,
        urlIncludePatterns: options.filter.url_include_patterns,
        methods: options.filter.methods,
      },
      20 // Use default buffer size for filter updates
    );

    const status: MonitorStatus = {
      status: 'updated',
      buffer_size: 20,
      filter: {
        contentTypes: options.filter.content_types,
        urlIncludePatterns: options.filter.url_include_patterns,
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
  }

  private async getRecentRequests(args: any) {
    try {
      const options = GetRecentRequestsSchema.parse(args || {});

      // Sort by timestamp (newest first) and limit count
      const sortedRequests = [...this.networkBuffer].sort((a, b) => b.timestamp - a.timestamp);
      const limitedRequests = sortedRequests.slice(0, options.count);

      // Convert to compact format with 512B body previews
      const compactRequests: CompactNetworkRequest[] = limitedRequests.map((req) => {
        const compact: CompactNetworkRequest = {
          uuid: req.uuid,
          method: req.method,
          url: req.url,
          timestamp: req.timestamp,
        };

        // Add response data if available
        if (req.response) {
          compact.status = req.response.status;
          compact.mimeType = req.response.mimeType;
          compact.responseTimestamp = req.responseTimestamp;

          // Add 512B body preview if body exists
          if (req.response.body) {
            compact.bodyPreview = req.response.body.substring(0, 512);
            compact.bodySize = req.response.body.length;
          }
        }

        // Add request body preview if exists
        if (req.body && !compact.bodyPreview) {
          compact.bodyPreview = req.body.substring(0, 512);
          compact.bodySize = req.body.length;
        }

        return compact;
      });

      const response = {
        total_captured: this.networkBuffer.length,
        showing: compactRequests.length,
        requests: compactRequests,
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

      // Return request details (headers optional, body limited to 50KB)
      const requestCopy: any = { ...request };

      if (!options.include_headers) {
        requestCopy.headers = undefined;
        if (requestCopy.response) {
          requestCopy.response = { ...requestCopy.response };
          requestCopy.response.headers = undefined;
        }
      }

      // Limit body sizes to 50KB to prevent MCP context overflow
      const MAX_BODY_SIZE = 50 * 1024; // 50KB

      if (requestCopy.body && requestCopy.body.length > MAX_BODY_SIZE) {
        const originalSize = requestCopy.body.length;
        requestCopy.body =
          requestCopy.body.substring(0, MAX_BODY_SIZE) +
          `\n... [truncated from ${originalSize} bytes]`;
      }

      if (requestCopy.response?.body && requestCopy.response.body.length > MAX_BODY_SIZE) {
        const originalSize = requestCopy.response.body.length;
        requestCopy.response.body =
          requestCopy.response.body.substring(0, MAX_BODY_SIZE) +
          `\n... [truncated from ${originalSize} bytes]`;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(requestCopy, null, 2),
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
