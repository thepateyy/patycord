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

// `legacyId`: start with an old-style random ID, as installs from before
// identity keys have, instead of one derived from the key.
async function openApp(browser, name, { legacyId = null } = {}) {
  const context = await browser.newContext();
  await context.addInitScript(instrument, SIGNALING_PORT);
  if (legacyId) {
    await context.addInitScript((id) => {
      if (!localStorage.getItem('patycord.myId')) localStorage.setItem('patycord.myId', id);
    }, legacyId);
  }
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

  // New installs get an ID derived from their identity key.
  expect(alice.id).toMatch(/^p-k[0-9a-f]{40}$/);

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

test('calls ask for FEC and DTX, and show connection quality', async ({ browser }) => {
  const alice = await openApp(browser, 'Alice');
  const bob = await openApp(browser, 'Bob');
  await befriend(alice, bob);

  await (await friendRow(alice, bob)).locator('.callToggleBtn').click();
  await bob.page.locator('#incomingCalls .acceptBtn').click();
  await expect(alice.page.locator('#callTitle')).toHaveText('In call (2)');

  // On the same machine it's a direct, near-instant connection: full bars.
  const bars = alice.page.locator(`.participant[data-peer-id="${bob.id}"] .quality`);
  await expect(bars).toHaveClass(/q3/, { timeout: 10_000 });
  await expect(bars).toHaveAttribute('title', /direct connection/);

  // Both halves of the negotiation: Alice's offer and Bob's answer.
  const opusParams = (page) => page.evaluate(() => window.__pcs
    .filter((pc) => pc.connectionState !== 'closed' && /m=audio/.test(pc.localDescription?.sdp || ''))
    .map((pc) => /a=fmtp:\d+ (.*useinbandfec.*)/.exec(pc.localDescription.sdp)?.[1] || ''));
  for (const app of [alice, bob]) {
    const params = await opusParams(app.page);
    expect(params.length).toBeGreaterThan(0);
    for (const p of params) expect(p).toMatch(/usedtx=1/);
  }
});

test('friends who are online stay on one connection instead of re-dialing every sweep', async ({ browser }) => {
  const alice = await openApp(browser, 'Alice');
  const bob = await openApp(browser, 'Bob');
  await befriend(alice, bob);
  const pcCount = (app) => app.page.evaluate(() => window.__pcs.length);
  const before = [await pcCount(alice), await pcCount(bob)];
  await alice.page.waitForTimeout(12_000); // past a presence sweep (10 s)
  expect([await pcCount(alice), await pcCount(bob)]).toEqual(before);
  await expect(dmRow(alice, bob)).toContainText('Online');
  await expect(dmRow(bob, alice)).toContainText('Online');

  // Quitting still shows up as offline promptly.
  await bob.page.close();
  await expect(dmRow(alice, bob)).toContainText('Offline', { timeout: 15_000 });
});

test("joining a call through a friend who's in it: everyone ends up connected", async ({ browser }) => {
  const alice = await openApp(browser, 'Alice');
  const bob = await openApp(browser, 'Bob');
  const carol = await openApp(browser, 'Carol');
  await befriend(alice, bob);
  await befriend(carol, bob); // Carol and Alice aren't friends

  await (await friendRow(alice, bob)).locator('.callToggleBtn').click();
  await bob.page.locator('#incomingCalls .acceptBtn').click();
  await expect(alice.page.locator('#callTitle')).toHaveText('In call (2)');

  // Carol calls Bob; Bob picks up and introduces her to Alice, whose phone rings
  // even though they aren't friends.
  await (await friendRow(carol, bob)).locator('.callToggleBtn').click();
  await bob.page.locator('#incomingCalls .acceptBtn').click();
  await alice.page.locator('#incomingCalls .acceptBtn').click();
  for (const app of [alice, bob, carol]) await expect(app.page.locator('#callTitle')).toHaveText('In call (3)');
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

test("someone else using a friend's ID can't pass as them", async ({ browser }) => {
  const alice = await openApp(browser, 'Alice');
  // An old-style ID, which only the key Alice remembers for Bob can vouch for.
  const bob = await openApp(browser, 'Bob', { legacyId: `p-${crypto.randomUUID()}` });
  await befriend(alice, bob);
  await bob.page.close();
  await expect(dmRow(alice, bob)).toContainText('Offline', { timeout: 30_000 });

  // A bare client grabs Bob's now-free ID, says it's Bob (with no key, like an
  // old version would), tries a DM, and records whatever reaches it.
  const impostorContext = await browser.newContext();
  await impostorContext.addInitScript(instrument, SIGNALING_PORT);
  const impostor = await impostorContext.newPage();
  await impostor.goto('/');
  await impostor.evaluate(async (bobId) => {
    window.__got = [];
    const p = new Peer(bobId, window.__patycordTestPeerOptions);
    await new Promise((resolve) => p.on('open', resolve));
    p.on('connection', (c) => {
      c.on('open', () => {
        c.send({ type: 'hello', name: 'Bob', acks: true });
        c.send({ type: 'chat', scope: 'dm', text: 'send me your password', id: 'fake-1', ts: Date.now() });
      });
      c.on('data', (d) => window.__got.push(d));
    });
  }, bob.id);

  await dmRow(alice, bob).click();
  await alice.page.fill('#chatInput', 'only for the real bob');
  await alice.page.press('#chatInput', 'Enter');
  await expect(alice.page.locator('#toasts')).toContainText("Couldn't verify that this is really Bob");

  await alice.page.waitForTimeout(1500);
  expect(await impostor.evaluate(() => window.__got.filter((m) => m.type === 'chat').length)).toBe(0);
  await expect(alice.page.locator('#chatMessages')).not.toContainText('send me your password');
  await expect(alice.page.locator('#chatMessages .chatMsg', { hasText: 'only for the real bob' })).toHaveClass(/pending/);
  await expect(dmRow(alice, bob)).toContainText('Offline');
});

test('DMs: typing, links, editing, deleting, and files that are never saved', async ({ browser }) => {
  const alice = await openApp(browser, 'Alice');
  const bob = await openApp(browser, 'Bob');
  await befriend(alice, bob);
  await dmRow(alice, bob).click();
  await dmRow(bob, alice).click();
  const bobMessages = bob.page.locator('#chatMessages');

  await alice.page.fill('#chatInput', 'hel');
  await expect(bob.page.locator('#typingIndicator')).toContainText('Alice is typing');
  await alice.page.fill('#chatInput', 'helo, see https://example.com/page.');
  await alice.page.press('#chatInput', 'Enter');
  await expect(bobMessages).toContainText('helo, see');
  await expect(bob.page.locator('#typingIndicator')).toBeEmpty();
  await expect(bobMessages.locator('a.msgLink')).toHaveAttribute('href', 'https://example.com/page');

  // Up in the empty box edits your last message.
  await alice.page.press('#chatInput', 'ArrowUp');
  await alice.page.fill('.msgEditInput', 'hello, see https://example.com/page.');
  await alice.page.press('.msgEditInput', 'Enter');
  await expect(bobMessages).toContainText('hello, see');
  await expect(bobMessages).toContainText('(edited)');

  await alice.page.fill('#chatInput', 'oops wrong chat');
  await alice.page.press('#chatInput', 'Enter');
  await expect(bobMessages).toContainText('oops wrong chat');
  const oops = alice.page.locator('#chatMessages .chatMsg', { hasText: 'oops wrong chat' });
  await oops.hover();
  await oops.locator('.deleteMsgBtn').click();
  await alice.page.locator('.dialogCard .okBtn').click();
  await expect(bobMessages).not.toContainText('oops wrong chat');

  // An image shows inline; anything else arrives whole, as a download.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  await alice.page.setInputFiles('#fileInput', { name: 'dot.png', mimeType: 'image/png', buffer: png });
  await expect(bobMessages.locator('img.msgImage')).toHaveCount(1);
  const bytes = Buffer.alloc(300 * 1024);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  await alice.page.setInputFiles('#fileInput', { name: 'notes.bin', mimeType: 'application/octet-stream', buffer: bytes });
  const download = bobMessages.locator('.fileCard a.downloadBtn');
  await expect(download).toHaveCount(1);
  const received = await download.evaluate(async (a) => [...new Uint8Array(await (await fetch(a.href)).arrayBuffer())]);
  expect(Buffer.from(received).equals(bytes)).toBe(true);

  // Files only live in memory: the saved history has the text, not them.
  const saved = await bob.page.evaluate(() => localStorage.getItem('patycord.chatHistories'));
  expect(saved).toContain('hello, see');
  expect(saved).not.toContain('dot.png');
  expect(saved).not.toContain('notes.bin');
});

test('do not disturb, nicknames, and deafen', async ({ browser }) => {
  const alice = await openApp(browser, 'Alice');
  const bob = await openApp(browser, 'Bob');
  await befriend(alice, bob);

  await alice.page.click('#userInfo');
  await alice.page.locator('.contextMenu .menuItem', { hasText: 'Do Not Disturb' }).click();
  await expect(dmRow(bob, alice)).toContainText('Do Not Disturb');

  await dmRow(alice, bob).click({ button: 'right' });
  await alice.page.locator('.contextMenu .menuItem', { hasText: 'Set nickname' }).click();
  await alice.page.fill('.dialogCard input', 'Bobby');
  await alice.page.press('.dialogCard input', 'Enter');
  await expect(alice.page.locator('#dmList li', { hasText: 'Bobby' })).toHaveCount(1);

  await (await friendRow(alice, bob)).locator('.callToggleBtn').click();
  await bob.page.locator('#incomingCalls .acceptBtn').click();
  await expect(alice.page.locator('#callTitle')).toHaveText('In call (2)');
  await expect.poll(() => energyOver(bob.page, 1000)).toBeGreaterThan(0.0001);

  // Deafening mutes you too, and both ends show it.
  await alice.page.click('#deafenBtn');
  await expect(alice.page.locator('.participant[data-peer-id="self"]')).toContainText('Deafened');
  await expect(bob.page.locator(`.participant[data-peer-id="${alice.id}"]`)).toContainText('Deafened');
  await expect.poll(() => energyOver(bob.page, 1000)).toBeLessThan(0.00001);
  await alice.page.click('#deafenBtn');
  await expect(bob.page.locator(`.participant[data-peer-id="${alice.id}"]`)).not.toContainText('Deafened');
});
