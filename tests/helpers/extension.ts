import { chromium, firefox, type BrowserContext } from '@playwright/test';
import { withExtension } from 'playwright-webextext';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const EXTENSION_PATH = path.resolve(__dirname, '../../dist/chrome');
export const FIREFOX_EXTENSION_PATH = path.resolve(__dirname, '../../dist/firefox');
const EXTENSION_PAGE = 'src/app/index.html';

const GECKO_ID = 'financial-finger@extension';
const FIREFOX_FIXED_UUID = '11111111-1111-1111-1111-111111111111';

export interface ExtensionContext {
  context: BrowserContext;
  extensionId: string;
  extUrl: string;
  cleanup: () => Promise<void>;
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// ── Firefox extension context ─────────────────────────────────────────────────

async function launchFirefoxExtensionContext(): Promise<ExtensionContext> {
  if (!fs.existsSync(FIREFOX_EXTENSION_PATH)) {
    throw new Error(
      `Firefox extension not built. Run "npm run build:firefox" first.\nExpected: ${FIREFOX_EXTENSION_PATH}`,
    );
  }

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-firefox-test-'));
  const rdpPort = await findFreePort();

  // Launch Firefox directly so we control the RDP port and prefs without
  // triggering playwright-webextext's buggy overridePermissions() path
  // (v0.0.5 crashes when manifest.optional_permissions is absent).
  const context = await firefox.launchPersistentContext(profileDir, {
    // Headless by default. Set HEADED=1 to show the browser window for debugging.
    headless: process.env['HEADED'] !== '1',
    args: ['-start-debugger-server', String(rdpPort)],
    firefoxUserPrefs: {
      'xpinstall.signatures.required': false,
      'extensions.webextensions.uuids': JSON.stringify({ [GECKO_ID]: FIREFOX_FIXED_UUID }),
      'devtools.debugger.remote-enabled': true,
      'devtools.debugger.prompt-connection': false,
      'extensions.manifestV3.enabled': true,
      // Suppress background network activity and update checks that can
      // interfere with automation and cause the browser to stall.
      'app.update.auto': false,
      'browser.search.update': false,
      'datareporting.healthreport.uploadEnabled': false,
      'toolkit.telemetry.enabled': false,
      'toolkit.telemetry.unified': false,
      'browser.newtabpage.activity-stream.feeds.telemetry': false,
      'browser.ping-centre.telemetry': false,
      'network.captive-portal-service.enabled': false,
      'network.connectivity-service.enabled': false,
    },
  });

  // Use playwright-webextext's RDP addon installer. Retry briefly to allow
  // the Firefox debugger server to become ready after launch.
  const installer = withExtension(firefox, FIREFOX_EXTENSION_PATH);
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await installer.installAddons(rdpPort);
      break;
    } catch {
      if (attempt === 19) {
        await context.close();
        throw new Error(`Failed to install Firefox addon via RDP on port ${rdpPort}`);
      }
      await new Promise<void>(r => setTimeout(r, 250));
    }
  }

  const extUrl = `moz-extension://${FIREFOX_FIXED_UUID}/${EXTENSION_PAGE}`;

  // moz-extension:// navigation works normally after the omni.ja patch applied
  // by tests/global-setup.ts removes Juggler's extension-page guard.

  const cleanup = async () => {
    try { await context.close(); } catch { /* already closed */ }
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  };

  return { context, extensionId: FIREFOX_FIXED_UUID, extUrl, cleanup };
}

// ── Chrome extension context (default) ───────────────────────────────────────

export async function launchExtensionContext(): Promise<ExtensionContext> {
  if (process.env['BROWSER'] === 'firefox') {
    return launchFirefoxExtensionContext();
  }

  if (!fs.existsSync(EXTENSION_PATH)) {
    throw new Error(
      `Extension not built. Run "npm run build:chrome" first.\nExpected: ${EXTENSION_PATH}`,
    );
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-test-'));

  const context = await chromium.launchPersistentContext(userDataDir, {
    // Chrome requires headless:false when using --headless=new (new headless is
    // a full Chrome renderer with no window, not the legacy headless mode that
    // lacks extension support). HEADED=1 disables the flag for debugging.
    headless: false,
    args: [
      ...(process.env['HEADED'] !== '1' ? ['--headless=new'] : []),
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  });

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
    } catch { /* best-effort */ }
  };

  return { context, extensionId, extUrl, cleanup };
}
