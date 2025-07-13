/**
 * Browser management functions for Network Monitor MCP
 */

/**
 * Ensures a browser is visible to the user, either by activating existing page or launching new browser
 * @param chromium Playwright chromium launcher
 * @param port CDP port number (default: 9222)
 * @returns Promise<string> WebSocket debugger URL for CDP connection
 */
export async function ensureBrowserVisible(chromium: any, port = 9222): Promise<string> {
  try {
    // Try to activate existing page
    const listResponse = await fetch(`http://localhost:${port}/json/list`);
    const pages = await listResponse.json();
    const targetId = pages[0].id;
    await fetch(`http://localhost:${port}/json/activate/${targetId}`);
    return pages[0].webSocketDebuggerUrl;
  } catch {
    // No browser or pages found, launch new browser
    await launchBrowser(chromium, port);
    const listResponse = await fetch(`http://localhost:${port}/json/list`);
    const pages = await listResponse.json();
    return pages[0].webSocketDebuggerUrl;
  }
}

/**
 * Launch a new browser instance with CDP enabled on specified port
 * @param chromium Playwright chromium launcher (injected for testability)
 * @param port CDP port number (default: 9222)
 */
export async function launchBrowser(chromium: any, port = 9222): Promise<void> {
  const browser = await chromium.launch({
    headless: false,
    args: [`--remote-debugging-port=${port}`],
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('about:blank');
}
