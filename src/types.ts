import { z } from 'zod';

/**
 * Network monitoring configuration schema
 */
export const StartMonitorSchema = z.object({
  max_buffer_size: z.number().optional().default(200),
  auto_filter: z.boolean().optional().default(true),
  cdp_port: z.number().optional().default(9222),
  custom_filter: z
    .object({
      include_url_patterns: z.array(z.string()).optional(),
      exclude_url_patterns: z.array(z.string()).optional(),
      content_types: z.array(z.string()).optional(),
    })
    .optional(),
});

export const GetRecentRequestsSchema = z.object({
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
  includeUrlPatterns?: string[];
  excludeUrlPatterns?: string[];
  contentTypes?: string[];
}

/**
 * Default filter patterns
 */
export const DEFAULT_EXCLUDE_PATTERNS = [
  '\\.(css|js|png|jpg|jpeg|gif|svg|woff|woff2|ttf|ico)(\\?|$)',
  'githubassets\\.com.*\\.(css|js|png|svg|woff)',
  'google-analytics\\.com',
  'googletagmanager\\.com',
];

export const DEFAULT_INCLUDE_CONTENT_TYPES = [
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
  auto_filter: boolean;
  cdp_endpoint: string | null;
  cdp_port: number;
  browser_already_running: boolean;
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
