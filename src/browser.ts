/**
 * Browser management functions for Network Monitor MCP
 */

/**
 * Launch a new browser server with CDP enabled on specified port
 * @param chromium Playwright chromium launcher (injected for testability)
 * @param port CDP port number (default: 9222)
 * @returns Promise<BrowserServer> Browser server instance for proper cleanup
 */
export async function launchBrowserServer(chromium: any, port = 9222): Promise<any> {
  const browserServer = await chromium.launchServer({
    headless: false,
    args: [`--remote-debugging-port=${port}`],
  });

  // Create a page to ensure browser is visible
  const browser = await chromium.connect(browserServer.wsEndpoint());
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('about:blank');

  return browserServer;
}
