import { describe, expect, it, vi } from 'vitest';
import { connectToCdp, shouldIncludeRequest, startNetworkMonitoring } from '../monitor.js';

describe('Network Monitor', () => {
  describe('connectToCdp', () => {
    it('should connect to CDP WebSocket and enable Network domain', async () => {
      let openHandler: ((event: Event) => void) | null = null;

      const mockWebSocket = {
        send: vi.fn(),
        addEventListener: vi
          .fn()
          .mockImplementation((event: string, handler: (event: Event) => void) => {
            if (event === 'open') {
              openHandler = handler;
            }
          }),
        readyState: 1, // OPEN
        close: vi.fn(),
      };

      // Mock WebSocket constructor
      const mockWebSocketConstructor = vi.fn().mockImplementation(() => {
        // Simulate immediate connection
        setTimeout(() => {
          if (openHandler) {
            openHandler(new Event('open'));
          }
        }, 0);
        return mockWebSocket;
      });
      vi.stubGlobal('WebSocket', mockWebSocketConstructor);

      const cdpUrl = 'ws://localhost:9222/devtools/browser/test123';
      const connection = await connectToCdp(cdpUrl);

      expect(mockWebSocketConstructor).toHaveBeenCalledWith(cdpUrl);
      expect(connection).toBe(mockWebSocket);
    });

    it('should throw error when WebSocket connection fails', async () => {
      let errorHandler: ((event: Event) => void) | null = null;

      const mockWebSocket = {
        send: vi.fn(),
        addEventListener: vi
          .fn()
          .mockImplementation((event: string, handler: (event: Event) => void) => {
            if (event === 'error') {
              errorHandler = handler;
            }
          }),
        readyState: 3, // CLOSED
        close: vi.fn(),
      };

      const mockWebSocketConstructor = vi.fn().mockImplementation(() => {
        // Simulate connection error
        setTimeout(() => {
          if (errorHandler) {
            errorHandler(new Event('error'));
          }
        }, 0);
        return mockWebSocket;
      });
      vi.stubGlobal('WebSocket', mockWebSocketConstructor);

      const cdpUrl = 'ws://localhost:9222/devtools/browser/test123';

      await expect(connectToCdp(cdpUrl)).rejects.toThrow('Failed to connect to CDP');
    });
  });

  describe('startNetworkMonitoring', () => {
    it('should enable Network domain and set up event listeners', async () => {
      const mockWebSocket = {
        send: vi.fn(),
        addEventListener: vi.fn(),
        readyState: 1, // OPEN
        close: vi.fn(),
      };

      const mockBuffer = [];

      await startNetworkMonitoring(mockWebSocket, mockBuffer, {
        contentTypes: ['application/json'],
      });

      // Should enable Network domain
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          id: 1,
          method: 'Network.enable',
          params: {},
        })
      );

      // Should set up message event listener
      expect(mockWebSocket.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('should handle network request events and add to buffer', async () => {
      const mockWebSocket = {
        send: vi.fn(),
        addEventListener: vi.fn(),
        readyState: 1,
        close: vi.fn(),
      };

      const mockBuffer = [];
      let messageHandler: ((event: MessageEvent) => void) | null = null;

      // Capture the message handler
      mockWebSocket.addEventListener.mockImplementation(
        (event: string, handler: (event: MessageEvent) => void) => {
          if (event === 'message') {
            messageHandler = handler;
          }
        }
      );

      await startNetworkMonitoring(mockWebSocket, mockBuffer, {
        contentTypes: ['application/json'],
      });

      // Simulate network request event
      const mockEvent = {
        data: JSON.stringify({
          method: 'Network.requestWillBeSent',
          params: {
            requestId: 'test-request-123',
            request: {
              url: 'https://api.example.com/data',
              method: 'GET',
              headers: { 'Content-Type': 'application/json' },
            },
            timestamp: 1234567890,
          },
        }),
      } as MessageEvent;

      if (messageHandler) {
        messageHandler(mockEvent);
      }

      expect(mockBuffer).toHaveLength(1);
      expect(mockBuffer[0]).toMatchObject({
        id: 'test-request-123',
        url: 'https://api.example.com/data',
        method: 'GET',
      });
    });
  });

  describe('shouldIncludeRequest', () => {
    it('should include all requests when filter is "all"', () => {
      const filter = { contentTypes: 'all' as const };

      expect(shouldIncludeRequest('application/json', filter)).toBe(true);
      expect(shouldIncludeRequest('text/css', filter)).toBe(true);
      expect(shouldIncludeRequest('image/png', filter)).toBe(true);
      expect(shouldIncludeRequest(undefined, filter)).toBe(true);
    });

    it('should include nothing when filter is empty array', () => {
      const filter = { contentTypes: [] };

      expect(shouldIncludeRequest('application/json', filter)).toBe(false);
      expect(shouldIncludeRequest('text/css', filter)).toBe(false);
      expect(shouldIncludeRequest('image/png', filter)).toBe(false);
      expect(shouldIncludeRequest(undefined, filter)).toBe(false);
    });

    it('should include requests matching content type array', () => {
      const filter = { contentTypes: ['application/json', 'text/plain'] };

      expect(shouldIncludeRequest('application/json', filter)).toBe(true);
      expect(shouldIncludeRequest('text/plain', filter)).toBe(true);
      expect(shouldIncludeRequest('application/json; charset=utf-8', filter)).toBe(true);
      expect(shouldIncludeRequest('text/css', filter)).toBe(false);
      expect(shouldIncludeRequest('image/png', filter)).toBe(false);
    });

    it('should exclude requests with no content type when using array filter', () => {
      const filter = { contentTypes: ['application/json'] };

      expect(shouldIncludeRequest(undefined, filter)).toBe(false);
      expect(shouldIncludeRequest('', filter)).toBe(false);
    });

    it('should match content type substrings', () => {
      const filter = { contentTypes: ['json'] };

      expect(shouldIncludeRequest('application/json', filter)).toBe(true);
      expect(shouldIncludeRequest('text/json', filter)).toBe(true);
      expect(shouldIncludeRequest('application/json; charset=utf-8', filter)).toBe(true);
      expect(shouldIncludeRequest('text/plain', filter)).toBe(false);
    });
  });
});
