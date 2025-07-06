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
 * Check if a request should be included based on filtering rules
 * @param url Request URL
 * @param contentType Response content type
 * @param autoFilter Enable default filtering
 * @param customFilter Custom filter configuration
 */
export function shouldIncludeRequest(
  url: string,
  contentType: string | undefined,
  _autoFilter: boolean,
  _customFilter?: FilterConfig
): boolean {
  // DEBUG: Always return true to bypass all filtering
  console.error(`DEBUG: Including request: ${url} (contentType: ${contentType})`);
  return true;
}

/**
 * Start network monitoring by enabling Network domain and setting up event listeners
 * @param ws Connected WebSocket to CDP
 * @param buffer Array to store captured network requests
 * @param autoFilter Enable default filtering
 * @param customFilter Custom filter configuration
 * @param maxBufferSize Maximum buffer size
 */
export async function startNetworkMonitoring(
  ws: WebSocket,
  buffer: NetworkRequest[],
  _autoFilter = true,
  _customFilter?: FilterConfig,
  maxBufferSize = 200
): Promise<void> {
  console.error('DEBUG: Starting network monitoring...');

  // Enable Network domain
  console.error('DEBUG: Sending Network.enable command...');
  ws.send(
    JSON.stringify({
      id: 1,
      method: 'Network.enable',
      params: {},
    })
  );

  // Set up event listener for network events
  ws.addEventListener('message', (event) => {
    console.error('DEBUG: Received CDP message length:', event.data.length);

    try {
      const message = JSON.parse(event.data);

      // Handle command responses
      if (message.id === 1) {
        if (message.result) {
          console.error('DEBUG: Network.enable command succeeded');
        } else if (message.error) {
          console.error('DEBUG: Network.enable command failed:', message.error);
        }
        return;
      }

      // Log all methods for debugging
      if (message.method) {
        console.error(`DEBUG: Received method: ${message.method}`);
      }

      // Handle Network.requestWillBeSent events
      if (message.method === 'Network.requestWillBeSent') {
        const { requestId, request, timestamp } = message.params;
        console.error(`DEBUG: Request detected: ${request.method} ${request.url}`);

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

        // Always add to buffer (no filtering for debugging)
        buffer.push(networkRequest);
        console.error(`DEBUG: Added request to buffer. Buffer size: ${buffer.length}`);

        // Maintain buffer size limit
        if (buffer.length > maxBufferSize) {
          buffer.shift();
          console.error('DEBUG: Removed oldest request due to buffer limit');
        }
      }

      // Handle Network.responseReceived events
      if (message.method === 'Network.responseReceived') {
        const { requestId, response, timestamp } = message.params;
        console.error(`DEBUG: Response received for request ${requestId}: ${response.status}`);

        // Find existing request and add response data
        const existingRequest = buffer.find((req) => req.id === requestId);
        if (existingRequest) {
          existingRequest.response = {
            status: response.status,
            headers: response.headers,
            mimeType: response.mimeType,
          };
          existingRequest.responseTimestamp = timestamp;
          console.error(`DEBUG: Updated request ${requestId} with response data`);
        } else {
          console.error(`DEBUG: Could not find request ${requestId} in buffer`);
        }
      }
    } catch (error) {
      console.error('DEBUG: Error parsing CDP message:', error);
    }
  });

  // Add error and close handlers
  ws.addEventListener('error', (error) => {
    console.error('DEBUG: WebSocket error:', error);
  });

  ws.addEventListener('close', (event) => {
    console.error('DEBUG: WebSocket closed:', event.code, event.reason);
  });

  console.error('DEBUG: Network monitoring setup complete');
}
