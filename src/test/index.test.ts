import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkMonitorMCP } from '../index.js';
import type { NetworkRequest } from '../types.js';

// Mock the dependencies
vi.mock('../browser.js', () => ({
  checkExistingBrowser: vi.fn(),
  launchBrowser: vi.fn(),
}));

vi.mock('../monitor.js', () => ({
  connectToCdp: vi.fn(),
  startNetworkMonitoring: vi.fn(),
}));

vi.mock('playwright', () => ({
  chromium: {},
}));

describe('NetworkMonitorMCP', () => {
  let networkMonitor: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create instance with exposed private methods for testing
    networkMonitor = new (class extends NetworkMonitorMCP {
      public async testGetRecentRequests(args: any) {
        return this.getRecentRequests(args);
      }

      public setNetworkBuffer(buffer: NetworkRequest[]) {
        this.networkBuffer = buffer;
      }
    })();
  });

  describe('getRecentRequests', () => {
    it('should return empty response when no requests in buffer', async () => {
      const result = await networkMonitor.testGetRecentRequests({});
      const response = JSON.parse(result.content[0].text);

      expect(response).toEqual({
        total_captured: 0,
        showing: 0,
        requests: [],
      });
    });

    it('should return requests sorted by timestamp (newest first)', async () => {
      const mockRequests: NetworkRequest[] = [
        {
          id: '1',
          url: 'https://api.example.com/old',
          method: 'GET',
          headers: {},
          timestamp: 1000,
          type: 'request',
        },
        {
          id: '2',
          url: 'https://api.example.com/new',
          method: 'GET',
          headers: {},
          timestamp: 2000,
          type: 'request',
        },
      ];

      networkMonitor.setNetworkBuffer(mockRequests);
      const result = await networkMonitor.testGetRecentRequests({});
      const response = JSON.parse(result.content[0].text);

      expect(response.total_captured).toBe(2);
      expect(response.showing).toBe(2);
      expect(response.requests[0].url).toBe('https://api.example.com/new'); // Newest first
      expect(response.requests[1].url).toBe('https://api.example.com/old');
    });

    it('should limit results based on count parameter', async () => {
      const mockRequests: NetworkRequest[] = Array.from({ length: 5 }, (_, i) => ({
        id: `${i + 1}`,
        url: `https://api.example.com/${i + 1}`,
        method: 'GET',
        headers: {},
        timestamp: i + 1000,
        type: 'request',
      }));

      networkMonitor.setNetworkBuffer(mockRequests);
      const result = await networkMonitor.testGetRecentRequests({ count: 2 });
      const response = JSON.parse(result.content[0].text);

      expect(response.total_captured).toBe(5);
      expect(response.showing).toBe(2);
      expect(response.requests).toHaveLength(2);
    });

    it('should filter by HTTP methods', async () => {
      const mockRequests: NetworkRequest[] = [
        {
          id: '1',
          url: 'https://api.example.com/get',
          method: 'GET',
          headers: {},
          timestamp: 1000,
          type: 'request',
        },
        {
          id: '2',
          url: 'https://api.example.com/post',
          method: 'POST',
          headers: {},
          timestamp: 2000,
          type: 'request',
        },
      ];

      networkMonitor.setNetworkBuffer(mockRequests);
      const result = await networkMonitor.testGetRecentRequests({
        filter: { methods: ['POST'] },
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.showing).toBe(1);
      expect(response.requests[0].method).toBe('POST');
    });

    it('should filter by URL pattern', async () => {
      const mockRequests: NetworkRequest[] = [
        {
          id: '1',
          url: 'https://api.example.com/users',
          method: 'GET',
          headers: {},
          timestamp: 1000,
          type: 'request',
        },
        {
          id: '2',
          url: 'https://static.example.com/image.png',
          method: 'GET',
          headers: {},
          timestamp: 2000,
          type: 'request',
        },
      ];

      networkMonitor.setNetworkBuffer(mockRequests);
      const result = await networkMonitor.testGetRecentRequests({
        filter: { url_pattern: 'api\\.example\\.com' },
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.showing).toBe(1);
      expect(response.requests[0].url).toBe('https://api.example.com/users');
    });

    it('should filter by content type', async () => {
      const mockRequests: NetworkRequest[] = [
        {
          id: '1',
          url: 'https://api.example.com/data',
          method: 'GET',
          headers: {},
          timestamp: 1000,
          type: 'request',
          response: {
            status: 200,
            headers: {},
            mimeType: 'application/json',
          },
        },
        {
          id: '2',
          url: 'https://api.example.com/html',
          method: 'GET',
          headers: {},
          timestamp: 2000,
          type: 'request',
          response: {
            status: 200,
            headers: {},
            mimeType: 'text/html',
          },
        },
      ];

      networkMonitor.setNetworkBuffer(mockRequests);
      const result = await networkMonitor.testGetRecentRequests({
        filter: { content_type: ['application/json'] },
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.showing).toBe(1);
      expect(response.requests[0].response?.mimeType).toBe('application/json');
    });

    it('should exclude bodies when include_body is false', async () => {
      const mockRequests: NetworkRequest[] = [
        {
          id: '1',
          url: 'https://api.example.com/data',
          method: 'POST',
          headers: {},
          timestamp: 1000,
          type: 'request',
          body: 'request body',
          response: {
            status: 200,
            headers: {},
            mimeType: 'application/json',
            body: 'response body',
          },
        },
      ];

      networkMonitor.setNetworkBuffer(mockRequests);
      const result = await networkMonitor.testGetRecentRequests({
        include_body: false,
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.requests[0].body).toBeUndefined();
      expect(response.requests[0].response?.body).toBeUndefined();
    });

    it('should exclude headers by default', async () => {
      const mockRequests: NetworkRequest[] = [
        {
          id: '1',
          url: 'https://api.example.com/data',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timestamp: 1000,
          type: 'request',
          response: {
            status: 200,
            headers: { Server: 'nginx' },
            mimeType: 'application/json',
          },
        },
      ];

      networkMonitor.setNetworkBuffer(mockRequests);
      const result = await networkMonitor.testGetRecentRequests({});
      const response = JSON.parse(result.content[0].text);

      expect(response.requests[0].headers).toBeUndefined();
      expect(response.requests[0].response?.headers).toBeUndefined();
    });

    it('should include headers when include_headers is true', async () => {
      const mockRequests: NetworkRequest[] = [
        {
          id: '1',
          url: 'https://api.example.com/data',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timestamp: 1000,
          type: 'request',
          response: {
            status: 200,
            headers: { Server: 'nginx' },
            mimeType: 'application/json',
          },
        },
      ];

      networkMonitor.setNetworkBuffer(mockRequests);
      const result = await networkMonitor.testGetRecentRequests({
        include_headers: true,
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.requests[0].headers).toEqual({ 'Content-Type': 'application/json' });
      expect(response.requests[0].response?.headers).toEqual({ Server: 'nginx' });
    });

    it('should handle invalid URL pattern gracefully', async () => {
      const mockRequests: NetworkRequest[] = [
        {
          id: '1',
          url: 'https://api.example.com/test',
          method: 'GET',
          headers: {},
          timestamp: 1000,
          type: 'request',
        },
      ];

      networkMonitor.setNetworkBuffer(mockRequests);
      const result = await networkMonitor.testGetRecentRequests({
        filter: { url_pattern: '[invalid' },
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.showing).toBe(0); // Should filter out all requests due to invalid pattern
    });
  });
});
