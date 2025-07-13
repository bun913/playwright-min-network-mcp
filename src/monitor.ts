/**
 * Network monitoring functions for CDP integration
 */

import type { FilterConfig, NetworkRequest } from './types.js';

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
 * Check if a request should be included based on early filtering (URL and method)
 * @param url Request URL
 * @param method Request method
 * @param filter Filter configuration
 */
export function shouldIncludeRequestEarly(
  url: string,
  method: string,
  filter: FilterConfig
): boolean {
  // Check URL exclude patterns
  if (filter.urlExcludePatterns) {
    for (const pattern of filter.urlExcludePatterns) {
      try {
        const regex = new RegExp(pattern);
        if (regex.test(url)) {
          return false;
        }
      } catch (error) {
        console.error(`Invalid URL exclude pattern: ${pattern}`, error);
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
  maxBufferSize = 200
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
        if (!shouldIncludeRequestEarly(request.url, request.method, filter)) {
          return; // Skip this request entirely
        }

        // Create network request object
        const networkRequest: NetworkRequest = {
          id: requestId,
          url: request.url,
          method: request.method,
          headers: request.headers,
          timestamp,
          type: 'request',
          body: request.postData,
        };

        // Store temporarily to apply content-type filtering after response is received
        buffer.push(networkRequest);

        // Maintain buffer size limit
        if (buffer.length > maxBufferSize) {
          buffer.shift();
        }
      }

      // Handle Network.responseReceived events
      if (message.method === 'Network.responseReceived') {
        const { requestId, response, timestamp } = message.params;

        // Find existing request and add response data
        const existingRequest = buffer.find((req) => req.id === requestId);
        if (existingRequest) {
          existingRequest.response = {
            status: response.status,
            headers: response.headers,
            mimeType: response.mimeType,
          };
          existingRequest.responseTimestamp = timestamp;

          // Apply filtering now that we have response data
          const shouldInclude = shouldIncludeRequest(response.mimeType, filter);

          if (!shouldInclude) {
            // Remove from buffer if it doesn't pass filter
            const index = buffer.findIndex((req) => req.id === requestId);
            if (index !== -1) {
              buffer.splice(index, 1);
            }
          } else {
            // Get response body for included requests
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
