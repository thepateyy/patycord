// End-to-end tests: two real browser instances of the app talking to each other
// through a local PeerJS signaling server (started by the test itself), with
// Chromium's built-in fake microphone. No network access needed. `npm test`.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  webServer: {
    command: 'npm run serve',
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:5173',
    browserName: 'chromium',
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream', // a generated tone instead of a real mic
        '--use-fake-ui-for-media-stream', // and no permission prompt for it
        '--autoplay-policy=no-user-gesture-required', // same as the app's WebView2 flags
        '--disable-features=WebRtcHideLocalIpsWithMdns', // plain local IPs: CI containers often can't resolve mDNS names
      ],
    },
  },
});
