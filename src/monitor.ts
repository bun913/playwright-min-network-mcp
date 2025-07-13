/**
 * Network monitoring functions for CDP integration
 */

import { randomUUID } from 'node:crypto';
import type { FilterConfig, NetworkRequest } from './types.js';

/**
 * Check if filter configuration is too permissive and show warnings
 * @param filter Filter configuration to validate
 */
export function validateAndWarnFilter(filter: FilterConfig): void {
  const warnings: string[] = [];

  // Check if content types are too permissive
  if (filter.contentTypes === 'all') {
    warnings.push(
      '⚠️  Content-type filter is set to "all" - this may capture many large static files'
    );
    warnings.push('   Consider using specific content types: ["application/json", "text/html"]');
  }

  // Check if URL filtering is too permissive
  if (filter.urlIncludePatterns === 'all') {
    warnings.push(
      '⚠️  URL include patterns is set to "all" - this may capture many unnecessary requests'
    );
    warnings.push(
      '   Consider filtering specific patterns: ["api/", "/graphql", "/v1/"] to capture only API endpoints'
    );
  }

  // Check if no method filtering
  if (!filter.methods || filter.methods.length === 0) {
    warnings.push('⚠️  No HTTP method filtering - capturing all request methods');
    warnings.push('   Consider limiting to specific methods: ["GET", "POST"]');
  }

  // Show warnings if any
  if (warnings.length > 0) {
    console.warn('🚨 Network Monitor Filter Recommendations:');
    for (const warning of warnings) {
      console.warn(warning);
    }
    console.warn('   Re-run start_or_update_capture with new filter settings to adjust filters');
  }
}

/**
 * Connect to Chrome DevTools Protocol WebSocket
 * @param cdpUrl WebSocket URL for CDP connection
 * @returns Promise<WebSocket> Connected WebSocket instance
 */
export async function connectToCdp(cdpUrl: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(cdpUrl);

    ws.addEventListener('open', () => {
      resolve(ws);
    });

    ws.addEventListener('error', () => {
      reject(new Error('Failed to connect to CDP'));
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.close();
        reject(new Error('Failed to connect to CDP'));
      }
    }, 5000);
  });
}

/**
 * Check if a request should be included based on URL and method filtering
 * @param url Request URL
 * @param method Request method
 * @param filter Filter configuration
 */
export function shouldIncludeRequestByUrlAndMethod(
  url: string,
  method: string,
  filter: FilterConfig
): boolean {
  // Check URL include patterns
  if (filter.urlIncludePatterns !== 'all') {
    if (Array.isArray(filter.urlIncludePatterns)) {
      let matched = false;
      for (const pattern of filter.urlIncludePatterns) {
        try {
          const regex = new RegExp(pattern);
          if (regex.test(url)) {
            matched = true;
            break;
          }
        } catch (error) {
          console.error(`Invalid URL include pattern: ${pattern}`, error);
        }
      }
      if (!matched) {
        return false;
      }
    }
  }

  // Check allowed methods
  if (filter.methods && filter.methods.length > 0) {
    if (!filter.methods.includes(method)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a request should be included based on content type filtering
 * @param contentType Response content type
 * @param filter Filter configuration
 */
export function shouldIncludeRequest(
  contentType: string | undefined,
  filter: FilterConfig
): boolean {
  // Handle special "all" value - include everything
  if (filter.contentTypes === 'all') {
    return true;
  }

  // Handle empty array - include nothing
  if (Array.isArray(filter.contentTypes) && filter.contentTypes.length === 0) {
    return false;
  }

  // Handle content type array filtering
  if (Array.isArray(filter.contentTypes) && contentType) {
    return filter.contentTypes.some((ct) => contentType.includes(ct));
  }

  // If no content type provided, exclude by default
  return false;
}

/**
 * Start network monitoring by enabling Network domain and setting up event listeners
 * @param ws Connected WebSocket to CDP
 * @param buffer Array to store captured network requests
 * @param filter Filter configuration
 * @param maxBufferSize Maximum buffer size
 */
export async function startNetworkMonitoring(
  ws: WebSocket,
  buffer: NetworkRequest[],
  filter: FilterConfig,
  maxBufferSize = 200,
  pendingRequests?: Map<string, NetworkRequest>
): Promise<void> {
  // Enable Network domain
  ws.send(
    JSON.stringify({
      id: 1,
      method: 'Network.enable',
      params: {},
    })
  );

  // Set up event listener for network events
  ws.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data);

      // Handle command responses
      if (message.id === 1) {
        if (message.error) {
          console.error('Network.enable command failed:', message.error);
        }
        return;
      }

      // Handle Network.requestWillBeSent events
      if (message.method === 'Network.requestWillBeSent') {
        const { requestId, request, timestamp } = message.params;

        // Apply early filtering (URL and method) before storing
        if (!shouldIncludeRequestByUrlAndMethod(request.url, request.method, filter)) {
          return; // Skip this request entirely
        }

        // Skip content-type filtering at request stage - will filter at response stage

        // Create network request object
        const networkRequest: NetworkRequest = {
          id: requestId,
          uuid: randomUUID(), // Generate UUID v4 for external reference
          url: request.url,
          method: request.method,
          headers: request.headers,
          timestamp,
          type: 'request',
          body: request.postData,
        };

        // Store in pending requests map for response-stage filtering
        if (pendingRequests) {
          pendingRequests.set(requestId, networkRequest);
        } else {
          // Fallback to old behavior if pendingRequests not provided
          buffer.push(networkRequest);
          if (buffer.length > maxBufferSize) {
            buffer.shift();
          }
        }
      }

      // Handle Network.responseReceived events
      if (message.method === 'Network.responseReceived') {
        const { requestId, response, timestamp } = message.params;

        // Find existing request and add response data
        let existingRequest: NetworkRequest | undefined;

        if (pendingRequests) {
          // New pending requests pattern
          existingRequest = pendingRequests.get(requestId);
          if (existingRequest) {
            existingRequest.response = {
              status: response.status,
              headers: response.headers,
              mimeType: response.mimeType,
            };
            existingRequest.responseTimestamp = timestamp;

            // Apply content-type filtering at response stage
            const shouldInclude = shouldIncludeRequest(response.mimeType, filter);

            if (shouldInclude) {
              // Add to final buffer with FIFO control
              buffer.push(existingRequest);
              if (buffer.length > maxBufferSize) {
                buffer.shift();
              }

              // Get response body for included requests
              ws.send(
                JSON.stringify({
                  id: Math.floor(Math.random() * 1000000),
                  method: 'Network.getResponseBody',
                  params: { requestId },
                })
              );
            }

            // Clean up pending request
            pendingRequests.delete(requestId);
          }
        } else {
          // Fallback to old behavior
          existingRequest = buffer.find((req) => req.id === requestId);
          if (existingRequest) {
            existingRequest.response = {
              status: response.status,
              headers: response.headers,
              mimeType: response.mimeType,
            };
            existingRequest.responseTimestamp = timestamp;

            const shouldInclude = shouldIncludeRequest(response.mimeType, filter);

            if (!shouldInclude) {
              const index = buffer.findIndex((req) => req.id === requestId);
              if (index !== -1) {
                buffer.splice(index, 1);
              }
            } else {
              ws.send(
                JSON.stringify({
                  id: Math.floor(Math.random() * 1000000),
                  method: 'Network.getResponseBody',
                  params: { requestId },
                })
              );
            }
          }
        }
      }

      // Handle Network.getResponseBody responses
      if (message.result && message.result.body !== undefined) {
        // Find the request that matches this response (we don't have the requestId in the response)
        // This is a limitation - we'll need to match by timing or other means
        // For now, we'll add the body to the most recent request without a body
        const recentRequest = buffer
          .slice()
          .reverse()
          .find((req) => req.response && !req.response.body);
        if (recentRequest?.response) {
          recentRequest.response.body = message.result.body;
        }
      }
    } catch (error) {
      console.error('Error parsing CDP message:', error);
    }
  });

  // Add error and close handlers
  ws.addEventListener('error', (error) => {
    console.error('WebSocket error:', error);
  });

  ws.addEventListener('close', (event) => {
    console.error('WebSocket closed:', event.code, event.reason);
  });
}
