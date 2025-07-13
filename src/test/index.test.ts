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

      public async testGetRequestDetail(args: any) {
        return this.getRequestDetail(args);
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
          uuid: '123e4567-e89b-12d3-a456-426614174000',
          url: 'https://api.example.com/old',
          method: 'GET',
          headers: {},
          timestamp: 1000,
          type: 'request',
        },
        {
          id: '2',
          uuid: '123e4567-e89b-12d3-a456-426614174001',
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
        uuid: `123e4567-e89b-12d3-a456-42661417400${i}`,
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

    it('should exclude bodies when include_body is false', async () => {
      const mockRequests: NetworkRequest[] = [
        {
          id: '1',
          uuid: '123e4567-e89b-12d3-a456-426614174000',
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
          uuid: '123e4567-e89b-12d3-a456-426614174000',
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

    it('should return compact format with body preview and metadata', async () => {
      const mockRequests: NetworkRequest[] = [
        {
          id: '1',
          uuid: '123e4567-e89b-12d3-a456-426614174000',
          url: 'https://api.example.com/data',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timestamp: 1000,
          type: 'request',
          body: 'request body data',
          response: {
            status: 200,
            headers: { Server: 'nginx' },
            mimeType: 'application/json',
            body: 'response body data',
          },
          responseTimestamp: 1001,
        },
      ];

      networkMonitor.setNetworkBuffer(mockRequests);
      const result = await networkMonitor.testGetRecentRequests({});
      const response = JSON.parse(result.content[0].text);

      expect(response.requests[0]).toEqual({
        uuid: '123e4567-e89b-12d3-a456-426614174000',
        method: 'POST',
        url: 'https://api.example.com/data',
        timestamp: 1000,
        status: 200,
        mimeType: 'application/json',
        bodyPreview: 'response body data',
        bodySize: 18,
        responseTimestamp: 1001,
      });
    });

    it('should truncate body preview to 512 bytes for large responses', async () => {
      // Create 1KB (1024 bytes) test string
      const largeBody = 'A'.repeat(1024);
      const expected512B = 'A'.repeat(512);

      const mockRequests: NetworkRequest[] = [
        {
          id: '1',
          uuid: '123e4567-e89b-12d3-a456-426614174000',
          url: 'https://api.example.com/large-data',
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          timestamp: 1000,
          type: 'request',
          response: {
            status: 200,
            headers: { Server: 'nginx' },
            mimeType: 'application/json',
            body: largeBody,
          },
          responseTimestamp: 1001,
        },
      ];

      networkMonitor.setNetworkBuffer(mockRequests);
      const result = await networkMonitor.testGetRecentRequests({});
      const response = JSON.parse(result.content[0].text);

      expect(response.requests[0].bodyPreview).toEqual(expected512B);
      expect(response.requests[0].bodySize).toEqual(1024);
      expect(response.requests[0].bodyPreview.length).toEqual(512);
    });
  });

  describe('getRequestDetail', () => {
    it('should return full request details without headers by default', async () => {
      const mockRequest: NetworkRequest = {
        id: '1',
        uuid: '123e4567-e89b-12d3-a456-426614174000',
        url: 'https://api.example.com/data',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timestamp: 1000,
        type: 'request',
        body: 'request body',
        response: {
          status: 200,
          headers: { Server: 'nginx' },
          mimeType: 'application/json',
          body: 'response body',
        },
      };

      const expectedResponse = {
        id: '1',
        uuid: '123e4567-e89b-12d3-a456-426614174000',
        url: 'https://api.example.com/data',
        method: 'POST',
        headers: undefined,
        timestamp: 1000,
        type: 'request',
        body: 'request body',
        response: {
          status: 200,
          headers: undefined,
          mimeType: 'application/json',
          body: 'response body',
        },
      };

      networkMonitor.setNetworkBuffer([mockRequest]);
      const result = await networkMonitor.testGetRequestDetail({
        uuid: '123e4567-e89b-12d3-a456-426614174000',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response).toEqual(expectedResponse);
    });

    it('should include headers when include_headers is true', async () => {
      const mockRequest: NetworkRequest = {
        id: '1',
        uuid: '123e4567-e89b-12d3-a456-426614174000',
        url: 'https://api.example.com/data',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timestamp: 1000,
        type: 'request',
        body: 'request body',
        response: {
          status: 200,
          headers: { Server: 'nginx' },
          mimeType: 'application/json',
          body: 'response body',
        },
      };

      networkMonitor.setNetworkBuffer([mockRequest]);
      const result = await networkMonitor.testGetRequestDetail({
        uuid: '123e4567-e89b-12d3-a456-426614174000',
        include_headers: true,
      });
      const response = JSON.parse(result.content[0].text);

      expect(response).toEqual(mockRequest);
    });

    it('should return error for non-existent UUID', async () => {
      networkMonitor.setNetworkBuffer([]);
      const result = await networkMonitor.testGetRequestDetail({
        uuid: '123e4567-e89b-12d3-a456-426614174999',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe('Request not found');
      expect(response.uuid).toBe('123e4567-e89b-12d3-a456-426614174999');
    });

    it('should return error for invalid UUID format', async () => {
      await expect(networkMonitor.testGetRequestDetail({ uuid: 'invalid-uuid' })).rejects.toThrow();
    });
  });
});
