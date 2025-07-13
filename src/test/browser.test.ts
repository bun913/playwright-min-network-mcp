import { describe, expect, it, vi } from 'vitest';
import { ensureBrowserVisible, launchBrowser } from '../browser.js';

describe('Browser Management', () => {
  describe('ensureBrowserVisible', () => {
    it('should activate existing page when browser is running', async () => {
      // Mock fetch to simulate existing pages
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              {
                id: 'page-123',
                webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/page-123',
              },
            ])
          )
        )
        .mockResolvedValueOnce(new Response('Target activated'));

      vi.stubGlobal('fetch', mockFetch);

      const mockChromium = {};
      const result = await ensureBrowserVisible(mockChromium, 9222);

      expect(result).toBe('ws://localhost:9222/devtools/page/page-123');
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:9222/json/list');
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:9222/json/activate/page-123');
    });

    it('should launch new browser when no existing browser', async () => {
      // Mock fetch to simulate no browser initially, then pages after launch
      const mockFetch = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              {
                id: 'new-page-123',
                webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/new-page-123',
              },
            ])
          )
        );

      vi.stubGlobal('fetch', mockFetch);

      const mockChromium = {
        launch: vi.fn().mockResolvedValue({
          newContext: vi.fn().mockResolvedValue({
            newPage: vi.fn().mockResolvedValue({
              goto: vi.fn().mockResolvedValue(undefined),
            }),
          }),
        }),
      };

      const result = await ensureBrowserVisible(mockChromium, 9222);

      expect(result).toBe('ws://localhost:9222/devtools/page/new-page-123');
      expect(mockChromium.launch).toHaveBeenCalledWith({
        headless: false,
        args: ['--remote-debugging-port=9222'],
      });
    });

    it('should launch new browser when pages list is empty', async () => {
      // Mock fetch to return empty pages array
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify([])))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              {
                id: 'new-page-456',
                webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/new-page-456',
              },
            ])
          )
        );

      vi.stubGlobal('fetch', mockFetch);

      const mockChromium = {
        launch: vi.fn().mockResolvedValue({
          newContext: vi.fn().mockResolvedValue({
            newPage: vi.fn().mockResolvedValue({
              goto: vi.fn().mockResolvedValue(undefined),
            }),
          }),
        }),
      };

      const result = await ensureBrowserVisible(mockChromium, 9222);

      expect(result).toBe('ws://localhost:9222/devtools/page/new-page-456');
      expect(mockChromium.launch).toHaveBeenCalled();
    });

    it('should launch new browser when page activation fails', async () => {
      // Mock fetch to simulate activation failure
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              {
                id: 'page-789',
                webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/page-789',
              },
            ])
          )
        )
        .mockRejectedValueOnce(new Error('Activation failed'))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              {
                id: 'fallback-page',
                webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/fallback-page',
              },
            ])
          )
        );

      vi.stubGlobal('fetch', mockFetch);

      const mockChromium = {
        launch: vi.fn().mockResolvedValue({
          newContext: vi.fn().mockResolvedValue({
            newPage: vi.fn().mockResolvedValue({
              goto: vi.fn().mockResolvedValue(undefined),
            }),
          }),
        }),
      };

      const result = await ensureBrowserVisible(mockChromium, 9222);

      expect(result).toBe('ws://localhost:9222/devtools/page/fallback-page');
      expect(mockChromium.launch).toHaveBeenCalled();
    });

    it('should launch new browser when JSON parsing fails', async () => {
      // Mock fetch to return invalid JSON
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(new Response('invalid json'))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              {
                id: 'recovery-page',
                webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/recovery-page',
              },
            ])
          )
        );

      vi.stubGlobal('fetch', mockFetch);

      const mockChromium = {
        launch: vi.fn().mockResolvedValue({
          newContext: vi.fn().mockResolvedValue({
            newPage: vi.fn().mockResolvedValue({
              goto: vi.fn().mockResolvedValue(undefined),
            }),
          }),
        }),
      };

      const result = await ensureBrowserVisible(mockChromium, 9222);

      expect(result).toBe('ws://localhost:9222/devtools/page/recovery-page');
      expect(mockChromium.launch).toHaveBeenCalled();
    });
  });

  describe('launchBrowser', () => {
    it('should launch browser with CDP on specified port', async () => {
      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
      };

      const mockContext = {
        newPage: vi.fn().mockResolvedValue(mockPage),
      };

      const mockBrowser = {
        newContext: vi.fn().mockResolvedValue(mockContext),
      };

      const mockChromium = {
        launch: vi.fn().mockResolvedValue(mockBrowser),
      };

      await launchBrowser(mockChromium, 9222);

      expect(mockChromium.launch).toHaveBeenCalledWith({
        headless: false,
        args: ['--remote-debugging-port=9222'],
      });
      expect(mockBrowser.newContext).toHaveBeenCalled();
      expect(mockContext.newPage).toHaveBeenCalled();
      expect(mockPage.goto).toHaveBeenCalledWith('about:blank');
    });

    it('should throw error when browser launch fails', async () => {
      const mockChromium = {
        launch: vi.fn().mockRejectedValue(new Error('Launch failed')),
      };

      await expect(launchBrowser(mockChromium)).rejects.toThrow('Launch failed');
    });

    it('should launch browser on custom port when specified', async () => {
      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
      };

      const mockContext = {
        newPage: vi.fn().mockResolvedValue(mockPage),
      };

      const mockBrowser = {
        newContext: vi.fn().mockResolvedValue(mockContext),
      };

      const mockChromium = {
        launch: vi.fn().mockResolvedValue(mockBrowser),
      };

      await launchBrowser(mockChromium, 9333);

      expect(mockChromium.launch).toHaveBeenCalledWith({
        headless: false,
        args: ['--remote-debugging-port=9333'],
      });
    });
  });
});
