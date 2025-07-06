import { describe, expect, it } from 'vitest';
import { shouldIncludeRequest } from '../monitor.js';

describe('Network Filtering', () => {
  describe('shouldIncludeRequest', () => {
    it('should include all requests when filter is "all"', () => {
      const filter = { contentTypes: 'all' as const };

      expect(shouldIncludeRequest('text/css', filter)).toBe(true);
      expect(shouldIncludeRequest('application/javascript', filter)).toBe(true);
      expect(shouldIncludeRequest('image/png', filter)).toBe(true);
      expect(shouldIncludeRequest('application/json', filter)).toBe(true);
      expect(shouldIncludeRequest(undefined, filter)).toBe(true);
    });

    it('should include nothing when filter is empty array', () => {
      const filter = { contentTypes: [] };

      expect(shouldIncludeRequest('application/json', filter)).toBe(false);
      expect(shouldIncludeRequest('text/css', filter)).toBe(false);
      expect(shouldIncludeRequest('image/png', filter)).toBe(false);
      expect(shouldIncludeRequest(undefined, filter)).toBe(false);
    });

    it('should include only matching content types when array is specified', () => {
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

    it('should match partial content type strings', () => {
      const filter = { contentTypes: ['json'] };

      expect(shouldIncludeRequest('application/json', filter)).toBe(true);
      expect(shouldIncludeRequest('text/json', filter)).toBe(true);
      expect(shouldIncludeRequest('application/json; charset=utf-8', filter)).toBe(true);
      expect(shouldIncludeRequest('text/plain', filter)).toBe(false);
    });

    it('should handle default content types for API monitoring', () => {
      const filter = {
        contentTypes: [
          'application/json',
          'application/x-www-form-urlencoded',
          'multipart/form-data',
          'text/plain',
        ],
      };

      expect(shouldIncludeRequest('application/json', filter)).toBe(true);
      expect(shouldIncludeRequest('application/x-www-form-urlencoded', filter)).toBe(true);
      expect(shouldIncludeRequest('multipart/form-data', filter)).toBe(true);
      expect(shouldIncludeRequest('text/plain', filter)).toBe(true);
      expect(shouldIncludeRequest('text/css', filter)).toBe(false);
      expect(shouldIncludeRequest('application/javascript', filter)).toBe(false);
      expect(shouldIncludeRequest('image/png', filter)).toBe(false);
    });

    it('should handle complex content type headers', () => {
      const filter = { contentTypes: ['application/json'] };

      expect(shouldIncludeRequest('application/json; charset=utf-8', filter)).toBe(true);
      expect(shouldIncludeRequest('application/json;charset=utf-8', filter)).toBe(true);
      expect(shouldIncludeRequest('application/json; boundary=something', filter)).toBe(true);
    });
  });
});
