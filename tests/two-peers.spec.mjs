// Two (or three) real instances of the app, each in its own browser context
// (so their own storage and identity), talking through a local PeerJS
// signaling server. Audio is Chromium's fake microphone, checked end to end via
// WebRTC stats on the receiving side.
import { test, expect } from '@playwright/test';
import { PeerServer } from 'peer';

const SIGNALING_PORT = 9123;
let signalingServer;

test.beforeAll(async () => {
  await new Promise((resolve) => {
    PeerServer({ port: SIGNALING_PORT, path: '/' }, (server) => {
      signalingServer = server;
      resolve();
    });
  });
});

test.afterAll(() => signalingServer?.close());

// Runs in the page before any app code: points the app at the local signaling
// server, and keeps hold of every peer connection and mic capture so the test
// can inspect them.
function instrument(port) {
  // No STUN/TURN — both ends are on this machine, and the test shouldn't need the internet.
  window.__patycordTestPeerOptions = { host: 'localhost', port, path: '/', secure: false, config: { iceServers: [] } };
  window.__pcs = [];
  window.__mics = [];
  const RealRTCPeerConnection = window.RTCPeerConnection;
  window.RTCPeerConnection = class extends RealRTCPeerConnection {
    constructor(...args) {
      super(...args);
      window.__pcs.push(this);
    }
  };
  const realGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    const stream = await realGetUserMedia(constraints);
    window.__mics.push(stream);
    return stream;
  };
}

async function openApp(browser, name) {
  const context = await browser.newContext();
  await context.addInitScript(instrument, SIGNALING_PORT);
  const page = await context.newPage();
  await page.goto('/');
  await page.fill('#usernameInput', name);
  await page.click('#usernameSaveBtn');
  await expect(page.locator('#myId')).toContainText(`${name}#`); // connected to signaling
  const id = await page.evaluate(() => localStorage.getItem('patycord.myId'));
  return { context, page, id, name };
}

// Reopens an app instance in its existing context — same storage, same identity.
async function reopen(app) {
  app.page = await app.context.newPage();
  await app.page.goto('/');
  await expect(app.page.locator('#myId')).toContainText(`${app.name}#`);
}

async function befriend(a, b) {
  await showFriendsTab(a, 'add');
  await a.page.fill('#peerIdInput', b.id);
  await a.page.click('#sendRequestBtn');
  await showFriendsTab(b, 'pending');
  const request = b.page.locator('#pendingList li.incoming', { hasText: a.name });
  await request.locator('.acceptBtn').click();
  await expect(a.page.locator('#pendingList li', { hasText: b.name })).toHaveCount(0);
  await expect(dmRow(a, b)).toContainText('Online');
  await expect(dmRow(b, a)).toContainText('Online');
}

async function showFriendsTab(app, tab) {
  await app.page.click('#friendsNavBtn');
  await app.page.click(`.friendsTab[data-tab="${tab}"]`);
}

// Their row on the Friends page, where the call and message buttons are.
async function friendRow(viewer, friend) {
  await showFriendsTab(viewer, 'all');
  return viewer.page.locator('#peerList li', { hasText: friend.name });
}

// Their conversation in the sidebar — always on screen, with their status and unread count.
function dmRow(viewer, friend) {
  return viewer.page.locator('#dmList li', { hasText: friend.name });
}

// Total audio energy received so far, over every live peer connection.
function inboundEnergy(page) {
  return page.evaluate(async () => {
    let energy = 0;
    for (const pc of window.__pcs) {
      if (pc.connectionState === 'closed') continue;
      (await pc.getStats()).forEach((s) => {
        if (s.type === 'inbound-rtp' && s.kind === 'audio') energy += s.totalAudioEnergy || 0;
      });
    }
    return energy;
  });
}

async function energyOver(page, ms) {
  const before = await inboundEnergy(page);
  await page.waitForTimeout(ms);
  return (await inboundEnergy(page)) - before;
}

function liveMicTracks(page) {
  return page.evaluate(() => window.__mics.flatMap((s) => s.getTracks()).filter((t) => t.readyState === 'live').length);
}

test('two friends: add by ID, call, hear each other, mute, call chat, hang up', async ({ browser }) => {
  const alice = await openApp(browser, 'Alice');
  const bob = await openApp(browser, 'Bob');

  // The mic is only checked at launch, then released until a call.
  await expect.poll(() => liveMicTracks(alice.page)).toBe(0);

  await befriend(alice, bob);

  await (await friendRow(alice, bob)).locator('.callToggleBtn').click();
  await bob.page.locator('#incomingCalls .acceptBtn').click();
  await expect(alice.page.locator('#callTitle')).toHaveText('In call (2)');
  await expect(bob.page.locator('#callTitle')).toHaveText('In call (2)');

  // Audio actually arrives on both ends (through noise suppression, on by default).
  await expect.poll(() => energyOver(bob.page, 1000)).toBeGreaterThan(0.0001);
  await expect.poll(() => energyOver(alice.page, 1000)).toBeGreaterThan(0.0001);
  expect(await liveMicTracks(alice.page)).toBe(1);
  await expect(bob.page.locator(`.participant[data-peer-id="${alice.id}"]`)).toHaveClass(/speaking/);

  // Muting stops it.
  await alice.page.click('#muteBtn');
  await expect.poll(() => energyOver(bob.page, 1000)).toBeLessThan(0.00001);
  await expect(alice.page.locator('.participant[data-peer-id="self"]')).toContainText('Muted');
  await alice.page.click('#muteBtn');

  await alice.page.fill('#chatInput', 'hello from the call');
  await alice.page.press('#chatInput', 'Enter');
  await expect(bob.page.locator('#chatMessages')).toContainText('hello from the call');

  // Hanging up ends it for both, and both mics are released again.
  await alice.page.click('#leaveCallBtn');
  await expect(bob.page.locator('#callTitle')).toBeHidden();
  await expect.poll(() => liveMicTracks(alice.page)).toBe(0);
  await expect.poll(() => liveMicTracks(bob.page)).toBe(0);
});

test('a message to an offline friend is delivered once they come back', async ({ browser }) => {
  const alice = await openApp(browser, 'Alice');
  const bob = await openApp(browser, 'Bob');
  await befriend(alice, bob);

  await (await friendRow(alice, bob)).locator('.chatToggleBtn').click();
  await bob.page.close();
  await expect(dmRow(alice, bob)).toContainText('Offline', { timeout: 30_000 });

  await alice.page.fill('#chatInput', 'see this when you are back');
  await alice.page.press('#chatInput', 'Enter');
  const sent = alice.page.locator('#chatMessages .chatMsg', { hasText: 'see this when you are back' });
  await expect(sent).toHaveClass(/pending/); // queued, shown as not delivered yet

  await reopen(bob);
  await expect(sent).not.toHaveClass(/pending/, { timeout: 30_000 }); // Bob confirmed it
  await expect(dmRow(bob, alice).locator('.unreadBadge')).toHaveText('1');
  const copies = await bob.page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('patycord.chatHistories')))
    .flat().filter((m) => m.text === 'see this when you are back').length);
  expect(copies).toBe(1);
});

test('a call from someone who isn\'t a friend never rings', async ({ browser }) => {
  const alice = await openApp(browser, 'Alice');

  // A bare PeerJS client that isn't anyone's friend, dialing Alice's ID directly.
  const strangerContext = await browser.newContext();
  await strangerContext.addInitScript(instrument, SIGNALING_PORT);
  const stranger = await strangerContext.newPage();
  await stranger.goto('/');
  await stranger.evaluate(async (target) => {
    const p = new Peer(window.__patycordTestPeerOptions);
    await new Promise((resolve) => p.on('open', resolve));
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    p.call(target, stream);
  }, alice.id);

  await alice.page.waitForTimeout(4000);
  await expect(alice.page.locator('#incomingCalls .incomingCall')).toHaveCount(0);
  const log = await alice.page.evaluate(() => {
    document.getElementById('logToggleBtn').click();
    return document.getElementById('status').textContent;
  });
  expect(log).toContain('declined a call from');
});
