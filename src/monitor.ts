/**
 * Network monitoring functions for CDP integration
 */

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
 * Start network monitoring by enabling Network domain and setting up event listeners
 * @param ws Connected WebSocket to CDP
 * @param buffer Array to store captured network requests
 */
export async function startNetworkMonitoring(ws: WebSocket, buffer: any[]): Promise<void> {
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

      // Handle Network.requestWillBeSent events
      if (message.method === 'Network.requestWillBeSent') {
        const { requestId, request, timestamp } = message.params;

        // Add request to buffer
        buffer.push({
          id: requestId,
          url: request.url,
          method: request.method,
          headers: request.headers,
          timestamp,
          type: 'request',
        });
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
        }
      }
    } catch (error) {
      console.error('Error parsing CDP message:', error);
    }
  });
}
