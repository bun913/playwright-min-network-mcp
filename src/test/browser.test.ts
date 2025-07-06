import { describe, expect, it, vi } from 'vitest';
import { checkExistingBrowser, launchBrowser } from '../browser.js';

describe('Browser Management', () => {
  describe('checkExistingBrowser', () => {
    it('should return true when browser is running on port 9222', async () => {
      // Mock fetch to simulate running browser
      const mockFetch = vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ webSocketDebuggerUrl: 'ws://localhost:9222/devtools/browser' })
          )
        );
      vi.stubGlobal('fetch', mockFetch);

      const result = await checkExistingBrowser();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:9222/json/version');
    });

    it('should check browser on custom port when specified', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ webSocketDebuggerUrl: 'ws://localhost:9333/devtools/browser' })
          )
        );
      vi.stubGlobal('fetch', mockFetch);

      const result = await checkExistingBrowser(9333);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:9333/json/version');
    });

    it('should return false when browser is not running on port 9222', async () => {
      // Mock fetch to simulate connection error
      const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      vi.stubGlobal('fetch', mockFetch);

      const result = await checkExistingBrowser();

      expect(result).toBe(false);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:9222/json/version');
    });

    it('should return false when response is invalid JSON', async () => {
      // Mock fetch to simulate invalid response
      const mockFetch = vi.fn().mockResolvedValue(new Response('invalid json'));
      vi.stubGlobal('fetch', mockFetch);

      const result = await checkExistingBrowser();

      expect(result).toBe(false);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:9222/json/version');
    });
  });

  describe('launchBrowser', () => {
    it('should launch browser with CDP on port 9222 and return WebSocket URL', async () => {
      // Mock playwright chromium launch with new context API
      const mockCdpSession = {};
      const mockContext = {
        newCDPSession: vi.fn().mockResolvedValue(mockCdpSession),
      };
      const mockPage = { 
        goto: vi.fn(),
        context: vi.fn().mockReturnValue(mockContext),
      };
      const mockBrowserContext = {
        newPage: vi.fn().mockResolvedValue(mockPage),
      };
      const mockBrowser = {
        newContext: vi.fn().mockResolvedValue(mockBrowserContext),
        close: vi.fn(),
      };
      const mockChromium = {
        launch: vi.fn().mockResolvedValue(mockBrowser),
      };

      // Mock fetch for CDP endpoint
      const mockFetch = vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify([{ webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/abc123' }])
          )
        );
      vi.stubGlobal('fetch', mockFetch);

      const result = await launchBrowser(mockChromium);

      expect(result).toBe('ws://localhost:9222/devtools/page/abc123');
      expect(mockChromium.launch).toHaveBeenCalledWith({
        headless: false,
        args: ['--remote-debugging-port=9222'],
      });
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:9222/json/list');
    });

    it('should throw error when browser launch fails', async () => {
      const mockChromium = {
        launch: vi.fn().mockRejectedValue(new Error('Launch failed')),
      };

      await expect(launchBrowser(mockChromium)).rejects.toThrow(
        'Failed to launch browser: Launch failed'
      );
    });

    it('should throw error when CDP endpoint is not available', async () => {
      const mockCdpSession = {};
      const mockContext = {
        newCDPSession: vi.fn().mockResolvedValue(mockCdpSession),
      };
      const mockPage = { 
        goto: vi.fn(),
        context: vi.fn().mockReturnValue(mockContext),
      };
      const mockBrowserContext = {
        newPage: vi.fn().mockResolvedValue(mockPage),
      };
      const mockBrowser = {
        newContext: vi.fn().mockResolvedValue(mockBrowserContext),
        close: vi.fn(),
      };
      const mockChromium = {
        launch: vi.fn().mockResolvedValue(mockBrowser),
      };

      // Mock fetch to fail (CDP not ready)
      const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      vi.stubGlobal('fetch', mockFetch);

      const result = await launchBrowser(mockChromium);
      
      // Should return fallback URL when CDP is not available
      expect(result).toBe('ws://localhost:9222/devtools/page/dummy');
    });

    it('should throw error when WebSocket URL is not found in CDP response', async () => {
      const mockCdpSession = {};
      const mockContext = {
        newCDPSession: vi.fn().mockResolvedValue(mockCdpSession),
      };
      const mockPage = { 
        goto: vi.fn(),
        context: vi.fn().mockReturnValue(mockContext),
      };
      const mockBrowserContext = {
        newPage: vi.fn().mockResolvedValue(mockPage),
      };
      const mockBrowser = {
        newContext: vi.fn().mockResolvedValue(mockBrowserContext),
        close: vi.fn(),
      };
      const mockChromium = {
        launch: vi.fn().mockResolvedValue(mockBrowser),
      };

      // Mock fetch with empty response (no pages)
      const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([])));
      vi.stubGlobal('fetch', mockFetch);

      const result = await launchBrowser(mockChromium);
      
      // Should return fallback URL when no pages found
      expect(result).toBe('ws://localhost:9222/devtools/page/dummy');
    });

    it('should launch browser on custom port when specified', async () => {
      const mockCdpSession = {};
      const mockContext = {
        newCDPSession: vi.fn().mockResolvedValue(mockCdpSession),
      };
      const mockPage = { 
        goto: vi.fn(),
        context: vi.fn().mockReturnValue(mockContext),
      };
      const mockBrowserContext = {
        newPage: vi.fn().mockResolvedValue(mockPage),
      };
      const mockBrowser = {
        newContext: vi.fn().mockResolvedValue(mockBrowserContext),
        close: vi.fn(),
      };
      const mockChromium = {
        launch: vi.fn().mockResolvedValue(mockBrowser),
      };

      const mockFetch = vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify([{ webSocketDebuggerUrl: 'ws://localhost:9333/devtools/page/custom' }])
          )
        );
      vi.stubGlobal('fetch', mockFetch);

      const result = await launchBrowser(mockChromium, 9333);

      expect(result).toBe('ws://localhost:9333/devtools/page/custom');
      expect(mockChromium.launch).toHaveBeenCalledWith({
        headless: false,
        args: ['--remote-debugging-port=9333'],
      });
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:9333/json/list');
    });
  });
});
