import { z } from 'zod';

/**
 * Network monitoring configuration schema
 */
export const StartMonitorSchema = z.object({
  max_buffer_size: z.number().max(50).optional().default(20),
  cdp_port: z.number().optional().default(9222),
  filter: z
    .object({
      content_types: z
        .union([z.array(z.string()), z.literal('all')])
        .optional()
        .default([
          'application/json',
          'application/x-www-form-urlencoded',
          'multipart/form-data',
          'text/plain',
        ]),
      url_exclude_patterns: z.array(z.string()).optional(),
      methods: z.array(z.string()).optional(),
      max_body_size: z.number().optional(),
    })
    .optional()
    .default({
      content_types: [
        'application/json',
        'application/x-www-form-urlencoded',
        'multipart/form-data',
        'text/plain',
      ],
    }),
});

export const GetRecentRequestsSchema = z.object({
  count: z.number().optional().default(10),
  include_body: z.boolean().optional().default(true),
  include_headers: z.boolean().optional().default(false),
});

/**
 * Infer TypeScript types from schemas
 */
export type StartMonitorOptions = z.infer<typeof StartMonitorSchema>;
export type GetRecentRequestsOptions = z.infer<typeof GetRecentRequestsSchema>;

/**
 * Network request data structure
 */
export interface NetworkRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  timestamp: number;
  type: 'request';
  body?: string;
  response?: {
    status: number;
    headers: Record<string, string>;
    mimeType: string;
    body?: string;
  };
  responseTimestamp?: number;
}

/**
 * CDP WebSocket message types
 */
export interface CdpMessage {
  id?: number;
  method: string;
  params: any;
}

export interface CdpRequestWillBeSent {
  method: 'Network.requestWillBeSent';
  params: {
    requestId: string;
    request: {
      url: string;
      method: string;
      headers: Record<string, string>;
      postData?: string;
    };
    timestamp: number;
    type?: string;
  };
}

export interface CdpResponseReceived {
  method: 'Network.responseReceived';
  params: {
    requestId: string;
    response: {
      status: number;
      headers: Record<string, string>;
      mimeType: string;
    };
    timestamp: number;
  };
}

/**
 * Filter configuration
 */
export interface FilterConfig {
  contentTypes: string[] | 'all';
  urlExcludePatterns?: string[];
  methods?: string[];
}

/**
 * Default content types for SDET monitoring (API and form data)
 */
export const DEFAULT_CONTENT_TYPES = [
  'application/json',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain',
];

/**
 * Browser launch configuration
 */
export interface BrowserConfig {
  cdpPort: number;
}

/**
 * Monitor status response
 */
export interface MonitorStatus {
  status: 'started' | 'stopped';
  buffer_size: number;
  filter: FilterConfig;
  cdp_endpoint: string | null;
  cdp_port: number;
  total_captured?: number;
}

/**
 * Network requests response
 */
export interface NetworkRequestsResponse {
  total_captured: number;
  showing: number;
  requests: NetworkRequest[];
}
