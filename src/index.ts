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
                cdp_port: {
                  type: 'number',
                  description: 'Chrome DevTools Protocol port number',
                  default: 9222,
                },
                custom_filter: {
                  type: 'object',
                  description:
                    'Custom filtering rules. Works with auto_filter when both enabled. Example: {"include_url_patterns": ["api\\\\.github\\\\.com"], "content_types": ["application/json"]}',
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
          throw new Error('No pages found in existing browser');
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
            options.auto_filter,
            options.custom_filter
              ? {
                  includeUrlPatterns: options.custom_filter.include_url_patterns,
                  excludeUrlPatterns: options.custom_filter.exclude_url_patterns,
                  contentTypes: options.custom_filter.content_types,
                }
              : undefined,
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

      // Remove request/response bodies if not requested
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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Network Monitor MCP server running on stdio');
  }
}

// Start the server
const server = new NetworkMonitorMCP();
server.run().catch(console.error);
