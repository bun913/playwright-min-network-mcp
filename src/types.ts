import { z } from 'zod';

/**
 * Network monitoring configuration schema
 */
export const StartMonitorSchema = z.object({
  max_buffer_size: z.number().max(50).optional().default(30),
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
      url_include_patterns: z
        .union([z.array(z.string()), z.literal('all')])
        .optional()
        .default('all'),
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
      url_include_patterns: 'all',
    }),
});

export const GetRecentRequestsSchema = z.object({
  count: z.number().optional().default(10),
  include_headers: z.boolean().optional().default(false),
});

export const GetRequestDetailSchema = z.object({
  uuid: z.string().uuid('Must be a valid UUID v4'),
  include_headers: z.boolean().optional().default(false),
});

/**
 * Infer TypeScript types from schemas
 */
export type StartMonitorOptions = z.infer<typeof StartMonitorSchema>;
export type GetRecentRequestsOptions = z.infer<typeof GetRecentRequestsSchema>;
export type GetRequestDetailOptions = z.infer<typeof GetRequestDetailSchema>;

/**
 * Network request data structure
 */
export interface NetworkRequest {
  id: string;
  uuid: string; // UUID v4 for external reference
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
  urlIncludePatterns: string[] | 'all';
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
  status: 'started' | 'stopped' | 'updated';
  buffer_size: number;
  filter: FilterConfig;
  cdp_endpoint: string | null;
  cdp_port: number;
  total_captured?: number;
}

/**
 * Compact network request for overview display (512B body preview)
 */
export interface CompactNetworkRequest {
  uuid: string;
  method: string;
  status?: number;
  url: string;
  mimeType?: string;
  requestBodyPreview?: string; // First 512 bytes of request body
  requestBodySize?: number; // Full request body size in bytes
  responseBodyPreview?: string; // First 512 bytes of response body
  responseBodySize?: number; // Full response body size in bytes
  timestamp: number;
  responseTimestamp?: number;
}

/**
 * Network requests response
 */
export interface NetworkRequestsResponse {
  total_captured: number;
  showing: number;
  requests: CompactNetworkRequest[];
}
