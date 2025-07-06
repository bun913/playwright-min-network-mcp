/**
 * Network monitoring functions for CDP integration
 */

import type { FilterConfig, NetworkRequest } from './types.js';
import { DEFAULT_EXCLUDE_PATTERNS, DEFAULT_INCLUDE_CONTENT_TYPES } from './types.js';

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
  autoFilter: boolean,
  customFilter?: FilterConfig
): boolean {
  // Step 1: Apply custom include patterns first (whitelist)
  if (customFilter?.includeUrlPatterns && customFilter.includeUrlPatterns.length > 0) {
    const matchesIncludePattern = customFilter.includeUrlPatterns.some((pattern) => {
      try {
        const regex = new RegExp(pattern);
        return regex.test(url);
      } catch (error) {
        console.error(`Invalid include pattern: ${pattern}`, error);
        return false;
      }
    });

    // If custom include patterns are specified but URL doesn't match, exclude
    if (!matchesIncludePattern) {
      return false;
    }
  }

  // Step 2: Apply exclude patterns (custom first, then auto-filter defaults)
  const excludePatterns = [];

  // Add custom exclude patterns
  if (customFilter?.excludeUrlPatterns) {
    excludePatterns.push(...customFilter.excludeUrlPatterns);
  }

  // Add default exclude patterns if auto-filter is enabled
  if (autoFilter) {
    excludePatterns.push(...DEFAULT_EXCLUDE_PATTERNS);
  }

  // Check if URL matches any exclude pattern
  for (const pattern of excludePatterns) {
    try {
      const regex = new RegExp(pattern);
      if (regex.test(url)) {
        return false;
      }
    } catch (error) {
      console.error(`Invalid exclude pattern: ${pattern}`, error);
    }
  }

  // Step 3: Apply content type filtering
  if (contentType) {
    const contentTypesToInclude = [];

    // Use custom content types if specified
    if (customFilter?.contentTypes && customFilter.contentTypes.length > 0) {
      contentTypesToInclude.push(...customFilter.contentTypes);
    }
    // Otherwise use defaults if auto-filter is enabled
    else if (autoFilter) {
      contentTypesToInclude.push(...DEFAULT_INCLUDE_CONTENT_TYPES);
    }

    // If content type filtering is active, check if current content type matches
    if (contentTypesToInclude.length > 0) {
      const matchesContentType = contentTypesToInclude.some((ct) => contentType.includes(ct));
      if (!matchesContentType) {
        return false;
      }
    }
  }

  // If we reach here, the request should be included
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
  autoFilter = true,
  customFilter?: FilterConfig,
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

        // Store temporarily to apply filtering after response is received
        buffer.push(networkRequest);
        console.error(
          `DEBUG: Added request to buffer (before filtering). Buffer size: ${buffer.length}`
        );

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

          // Apply filtering now that we have response data
          const shouldInclude = shouldIncludeRequest(
            existingRequest.url,
            response.mimeType,
            autoFilter,
            customFilter
          );


          if (!shouldInclude) {
            // Remove from buffer if it doesn't pass filter
            const index = buffer.findIndex((req) => req.id === requestId);
            if (index !== -1) {
              buffer.splice(index, 1);
              console.error(`DEBUG: Filtered out request ${requestId}: ${existingRequest.url}`);
            }
          } else {
            console.error(`DEBUG: Request ${requestId} passed filtering: ${existingRequest.url}`);
          }
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
