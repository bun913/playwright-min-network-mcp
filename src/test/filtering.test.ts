import { describe, expect, it } from 'vitest';
import { shouldIncludeRequest } from '../monitor.js';

describe('Network Filtering', () => {
  describe('shouldIncludeRequest', () => {
    it('should include all requests when auto_filter is false and no custom filters', () => {
      const result = shouldIncludeRequest('https://example.com/test.css', 'text/css', false);
      expect(result).toBe(true);
    });

    it('should exclude static files when auto_filter is true', () => {
      const result = shouldIncludeRequest('https://example.com/style.css', 'text/css', true);
      expect(result).toBe(false);
    });

    it('should include JSON responses when auto_filter is true', () => {
      const result = shouldIncludeRequest('https://api.github.com/users', 'application/json', true);
      expect(result).toBe(true);
    });

    it('should respect custom include patterns (whitelist)', () => {
      const result = shouldIncludeRequest(
        'https://api.github.com/users',
        'application/json',
        true,
        { includeUrlPatterns: ['api\\.github\\.com'] }
      );
      expect(result).toBe(true);
    });

    it('should exclude URLs not matching custom include patterns', () => {
      const result = shouldIncludeRequest('https://example.com/api', 'application/json', true, {
        includeUrlPatterns: ['api\\.github\\.com'],
      });
      expect(result).toBe(false);
    });

    it('should exclude URLs matching custom exclude patterns', () => {
      const result = shouldIncludeRequest(
        'https://google-analytics.com/collect',
        'application/json',
        false,
        { excludeUrlPatterns: ['google-analytics'] }
      );
      expect(result).toBe(false);
    });

    it('should respect custom content types', () => {
      const result = shouldIncludeRequest('https://example.com/api', 'application/xml', false, {
        contentTypes: ['application/xml'],
      });
      expect(result).toBe(true);
    });

    it('should handle invalid regex patterns gracefully', () => {
      const result = shouldIncludeRequest('https://example.com/api', 'application/json', false, {
        includeUrlPatterns: ['[invalid'],
      });
      expect(result).toBe(false);
    });

    it('should apply exclude patterns after include patterns', () => {
      // Include patterns are applied first, then exclude patterns are applied
      const result = shouldIncludeRequest(
        'https://api.github.com/users',
        'application/json',
        false,
        {
          includeUrlPatterns: ['api\\.github\\.com'],
          excludeUrlPatterns: ['github'], // This should exclude even after include matches
        }
      );
      expect(result).toBe(false); // Should be excluded
    });

    it('should apply include patterns first, then exclude patterns', () => {
      const result = shouldIncludeRequest(
        'https://github.com/analytics',
        'application/json',
        false,
        {
          includeUrlPatterns: ['github\\.com'],
          excludeUrlPatterns: ['analytics'],
        }
      );
      expect(result).toBe(false);
    });
  });
});
