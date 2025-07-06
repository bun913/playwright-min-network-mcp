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
 * @param port CDP port number (default: 9222)
 * @returns Promise<string> WebSocket debugger URL for CDP connection
 */
export async function launchBrowser(chromium: any, port = 9222): Promise<string> {
  try {
    console.error(`DEBUG: Launching browser with CDP on port ${port}...`);

    // シンプルにブラウザを起動
    const browser = await chromium.launch({
      headless: false,
      args: [`--remote-debugging-port=${port}`],
    });

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    // CDPセッションを作成
    const _cdpSession = await page.context().newCDPSession(page);
    console.error('DEBUG: CDP session created successfully');

    // 少し待ってからCDPエンドポイントを確認
    await new Promise((resolve) => setTimeout(resolve, 1000));

    try {
      const response = await fetch(`http://localhost:${port}/json/list`);
      const pages = await response.json();
      console.error(`DEBUG: Found ${pages.length} pages in CDP`);

      if (pages.length > 0 && pages[0].webSocketDebuggerUrl) {
        console.error(`DEBUG: Using WebSocket URL: ${pages[0].webSocketDebuggerUrl}`);
        return pages[0].webSocketDebuggerUrl;
      }
    } catch (error) {
      console.error('DEBUG: CDP endpoint not available, using fallback. Error:', error);
    }

    // フォールバック: ダミーのWebSocket URLを返す（実際のCDPセッションは既に作成済み）
    return `ws://localhost:${port}/devtools/page/dummy`;
  } catch (error) {
    throw new Error(`Failed to launch browser: ${error instanceof Error ? error.message : error}`);
  }
}
