import { chromium, type BrowserContext } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const EXTENSION_PATH = path.resolve(__dirname, '../../dist/chrome');
// The main SPA lives under src/app/index.html inside the extension
const EXTENSION_PAGE = 'src/app/index.html';

export interface ExtensionContext {
  context: BrowserContext;
  extensionId: string;
  extUrl: string;
  cleanup: () => Promise<void>;
}

export async function launchExtensionContext(): Promise<ExtensionContext> {
  if (!fs.existsSync(EXTENSION_PATH)) {
    throw new Error(
      `Extension not built. Run "npm run build:chrome" first.\nExpected: ${EXTENSION_PATH}`,
    );
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-test-'));

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      ...(process.env['CI'] ? ['--headless=new'] : []),
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  });

  // Grab the extension ID from the background service worker URL
  let background = context.serviceWorkers()[0];
  if (!background) {
    background = await context.waitForEvent('serviceworker', { timeout: 15_000 });
  }
  const extensionId = background.url().split('/')[2]!;
  const extUrl = `chrome-extension://${extensionId}/${EXTENSION_PAGE}`;

  const cleanup = async () => {
    await context.close();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  };

  return { context, extensionId, extUrl, cleanup };
}
