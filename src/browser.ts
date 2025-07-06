/**
 * Browser management functions for Network Monitor MCP
 */

/**
 * Check if a browser instance is already running on specified CDP port
 * @param port CDP port number (default: 9222)
 * @returns Promise<boolean> true if browser is running, false otherwise
 */
export async function checkExistingBrowser(port = 9222): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/json/version`);
    const data = await response.json();

    // Check if response contains webSocketDebuggerUrl indicating active browser
    return Boolean(data?.webSocketDebuggerUrl);
  } catch (_error) {
    // Any error (connection refused, invalid JSON, etc.) means no browser
    return false;
  }
}

/**
 * Launch a new browser instance with CDP enabled on specified port
 * @param chromium Playwright chromium launcher (injected for testability)
 * @param headless Whether to run in headless mode (default: false)
 * @param port CDP port number (default: 9222)
 * @returns Promise<string> WebSocket debugger URL for CDP connection
 */
export async function launchBrowser(chromium: any, headless = false, port = 9222): Promise<string> {
  try {
    // Launch browser with CDP enabled
    const browser = await chromium.launch({
      headless,
      args: [`--remote-debugging-port=${port}`],
    });

    // Wait a moment for CDP to be ready and get WebSocket URL
    try {
      const response = await fetch(`http://localhost:${port}/json/version`);
      const data = await response.json();

      if (!data?.webSocketDebuggerUrl) {
        throw new Error('WebSocket URL not found in CDP response');
      }

      return data.webSocketDebuggerUrl;
    } catch (_error) {
      await browser.close();
      throw new Error('CDP endpoint not available after browser launch');
    }
  } catch (error) {
    throw new Error(`Failed to launch browser: ${error instanceof Error ? error.message : error}`);
  }
}
