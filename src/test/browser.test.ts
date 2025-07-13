import { describe, expect, it, vi } from 'vitest';
import { launchBrowserServer } from '../browser.js';

describe('Browser Management', () => {
  describe('launchBrowserServer', () => {
    it('should launch browser server with CDP on specified port', async () => {
      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
      };

      const mockContext = {
        newPage: vi.fn().mockResolvedValue(mockPage),
      };

      const mockBrowser = {
        newContext: vi.fn().mockResolvedValue(mockContext),
      };

      const mockBrowserServer = {
        wsEndpoint: vi.fn().mockReturnValue('ws://localhost:9222/devtools/browser/test'),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const mockChromium = {
        launchServer: vi.fn().mockResolvedValue(mockBrowserServer),
        connect: vi.fn().mockResolvedValue(mockBrowser),
      };

      const result = await launchBrowserServer(mockChromium, 9222);

      expect(mockChromium.launchServer).toHaveBeenCalledWith({
        headless: false,
        args: ['--remote-debugging-port=9222'],
      });
      expect(mockChromium.connect).toHaveBeenCalledWith(
        'ws://localhost:9222/devtools/browser/test'
      );
      expect(mockBrowser.newContext).toHaveBeenCalled();
      expect(mockContext.newPage).toHaveBeenCalled();
      expect(mockPage.goto).toHaveBeenCalledWith('about:blank');
      expect(result).toBe(mockBrowserServer);
    });

    it('should throw error when browser server launch fails', async () => {
      const mockChromium = {
        launchServer: vi.fn().mockRejectedValue(new Error('Launch failed')),
      };

      await expect(launchBrowserServer(mockChromium)).rejects.toThrow('Launch failed');
    });

    it('should launch browser server on custom port when specified', async () => {
      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
      };

      const mockContext = {
        newPage: vi.fn().mockResolvedValue(mockPage),
      };

      const mockBrowser = {
        newContext: vi.fn().mockResolvedValue(mockContext),
      };

      const mockBrowserServer = {
        wsEndpoint: vi.fn().mockReturnValue('ws://localhost:9333/devtools/browser/test'),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const mockChromium = {
        launchServer: vi.fn().mockResolvedValue(mockBrowserServer),
        connect: vi.fn().mockResolvedValue(mockBrowser),
      };

      await launchBrowserServer(mockChromium, 9333);

      expect(mockChromium.launchServer).toHaveBeenCalledWith({
        headless: false,
        args: ['--remote-debugging-port=9333'],
      });
    });
  });
});
