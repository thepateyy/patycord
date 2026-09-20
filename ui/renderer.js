import createRNNWasmModule from './rnnoise.js';
import { t, getLanguage, setLanguage, applyStaticTranslations, LANGUAGES } from './i18n.js';

const myIdEl = document.getElementById('myId');
const myNameEl = document.getElementById('myName');
const myActivityEl = document.getElementById('myActivityEl');
const profileAvatarEl = document.getElementById('profileAvatar');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const settingsNameInput = document.getElementById('settingsNameInput');
const settingsSaveNameBtn = document.getElementById('settingsSaveNameBtn');
const noiseSuppressionToggle = document.getElementById('noiseSuppressionToggle');
const languageSelectEl = document.getElementById('languageSelect');
const usernameModal = document.getElementById('usernameModal');
const usernameInput = document.getElementById('usernameInput');
const usernameSaveBtn = document.getElementById('usernameSaveBtn');
const copyBtn = document.getElementById('copyBtn');
const peerIdInput = document.getElementById('peerIdInput');
const callBtn = document.getElementById('callBtn');
const peerListEl = document.getElementById('peerList');
const friendsCountLabelEl = document.getElementById('friendsCountLabel');
const pendingCardEl = document.getElementById('pendingCard');
const pendingListEl = document.getElementById('pendingList');
const muteBtn = document.getElementById('muteBtn');
const shareScreenBtn = document.getElementById('shareScreenBtn');
const logToggleBtn = document.getElementById('logToggleBtn');
const logPanel = document.getElementById('logPanel');
const statusEl = document.getElementById('status');
const incomingCallsEl = document.getElementById('incomingCalls');
const friendRequestsEl = document.getElementById('friendRequests');
const toastsEl = document.getElementById('toasts');
const screenGridEl = document.getElementById('screenGrid');
const callParticipantsEl = document.getElementById('callParticipants');
const callEmptyStateEl = document.getElementById('callEmptyState');
const usernameAvatar = document.getElementById('usernameAvatar');
const chatPanelEl = document.getElementById('chatPanel');
const chatHeaderNameEl = document.getElementById('chatHeaderName');
const chatCloseBtn = document.getElementById('chatCloseBtn');
const chatMessagesEl = document.getElementById('chatMessages');
const chatInputEl = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');
const volumePopoverEl = document.getElementById('volumePopover');
const screenSharePopoverEl = document.getElementById('screenSharePopover');
const updateBannerEl = document.getElementById('updateBanner');
const updateBannerTextEl = document.getElementById('updateBannerText');
const updateBannerNotesBtn = document.getElementById('updateBannerNotesBtn');
const updateBannerBtn = document.getElementById('updateBannerBtn');
const whatsNewBannerEl = document.getElementById('whatsNewBanner');
const whatsNewTextEl = document.getElementById('whatsNewText');
const whatsNewNotesBtn = document.getElementById('whatsNewNotesBtn');
const whatsNewBtn = document.getElementById('whatsNewBtn');
const releaseNotesModalEl = document.getElementById('releaseNotesModal');
const releaseNotesTitleEl = document.getElementById('releaseNotesTitle');
const releaseNotesBodyEl = document.getElementById('releaseNotesBody');
const closeReleaseNotesBtn = document.getElementById('closeReleaseNotesBtn');
const appVersionEl = document.getElementById('appVersion');

let localStream = null; // raw mic capture — mute toggles this track's .enabled
let processedStream = null; // what actually goes out over WebRTC (RNNoise'd, if available)
let muted = false;
let peer = null;
let screenStream = null;
let presenceProbeInterval = null;
let currentUpdate = null; // the Update object once checkForUpdates() finds one, so a language switch can re-render its (version-specific) banner text correctly instead of clobbering it back to the generic placeholder
let micAccessFailed = false; // so a language switch can keep showing the right message instead of "connecting…"
let justUpdatedInfo = null; // { version, notes } once the "what's new" banner is showing, for the same reason as currentUpdate above
let reconnectTimer = null;
let reconnectAttempts = 0;
let myActivity = null; // process name of whatever's in the foreground, from Tauri's window-focus watcher
const calls = new Map(); // peerId -> { call, audioEl }
const dataConnections = new Map(); // peerId -> DataConnection, for peers who joined *through* us
const presence = new Map(); // peerId -> boolean, from lightweight background probes
const activityByPeer = new Map(); // peerId -> activity string or null, learned via 'hello'/'activity' messages
const pendingCalls = new Map(); // peerId -> MediaConnection, awaiting Accept/Decline
const outgoingScreenCalls = new Map(); // peerId -> MediaConnection, us sharing our screen to them
const screenTiles = new Map(); // peerId -> { call, tileEl }, someone else's screen we're viewing
const remoteNames = new Map(); // peerId -> name they told us about themselves, live
const pendingFriendRequests = new Map(); // peerId -> name, awaiting Accept/Decline
const chatHistories = new Map(); // peerId -> [{ fromId, text }], per-friend DMs — independent of calls, in-memory only
let openChatPeerId = null; // whichever friend's DM thread is currently showing, or null (showing call chat / nothing)
let callChatHistory = []; // shared broadcast thread for whoever's in the current call — resets when the call ends, like it always has
let wasInCall = false; // so renderCallPanel() can detect the moment a call actually ends, to reset callChatHistory

// Peer IDs and call metadata come from whoever is calling us — including strangers,
// not just saved friends — so they must never go into innerHTML unescaped.
// One reusable scratch element rather than a fresh document.createElement() on
// every call — this runs for every name/tag/message in every single render.
const escapeHtmlScratch = document.createElement('div');
function escapeHtml(str) {
  escapeHtmlScratch.textContent = String(str);
  return escapeHtmlScratch.innerHTML;
}

// --- avatars -----------------------------------------------------------

function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}

function colorForId(id) {
  return `hsl(${hashHue(id)}, 60%, 42%)`;
}

function initialsFor(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[1][0]).toUpperCase();
}

function avatarHtml(id, name, extraClass = '') {
  return `<div class="avatar ${extraClass}" style="background:${colorForId(id)}">${escapeHtml(initialsFor(name))}</div>`;
}

// A Discord-style "Name#1234" tag, purely for display — the real connection
// ID underneath never changes and is what Copy buttons actually put on the
// clipboard, so nobody ever has to read or retype the ugly part.
function tagFor(id, name) {
  const suffix = id.slice(-4).toUpperCase();
  return `${name || t('anonymous')}#${suffix}`;
}

function tagHtml(id, name) {
  const suffix = id.slice(-4).toUpperCase();
  return `<span class="tag"><span class="tagName">${escapeHtml(name || t('anonymous'))}</span><span class="tagHash">#${escapeHtml(suffix)}</span></span>`;
}

// --- icons (inline SVG, no icon font/library needed) --------------------

function icon(paths) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

const ICONS = {
  mic: icon('<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>'),
  micOff: icon('<line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>'),
  monitor: icon('<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>'),
  list: icon('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>'),
  gear: icon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  volumeHigh: icon('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>'),
  volumeLow: icon('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>'),
  volumeMute: icon('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>'),
  phone: icon('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>'),
  phoneOff: icon('<path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"/>'),
  chat: icon('<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>'),
};

// --- persistent identity & friends list -------------------------------

function getMyPersistentId() {
  let id = localStorage.getItem('patycord.myId');
  if (!id) {
    id = 'p-' + crypto.randomUUID();
    localStorage.setItem('patycord.myId', id);
  }
  return id;
}

function getNoiseSuppressionEnabled() {
  return localStorage.getItem('patycord.noiseSuppression') !== 'off'; // on by default
}

function setNoiseSuppressionEnabled(enabled) {
  localStorage.setItem('patycord.noiseSuppression', enabled ? 'on' : 'off');
  rnnoiseEnabled = enabled;
  if (!rnnoiseModule) {
    // RNNoise didn't load — fall back to toggling the browser's own built-in suppression.
    localStream?.getAudioTracks()[0]?.applyConstraints({ noiseSuppression: enabled, voiceIsolation: enabled }).catch(() => {});
  }
}

function getScreenShareResolution() {
  return localStorage.getItem('patycord.screenShareRes') || '1080';
}

function setScreenShareResolution(res) {
  localStorage.setItem('patycord.screenShareRes', res);
}

function getScreenShareFps() {
  return localStorage.getItem('patycord.screenShareFps') || '30';
}

function setScreenShareFps(fps) {
  localStorage.setItem('patycord.screenShareFps', fps);
}

function getMyUsername() {
  return localStorage.getItem('patycord.myUsername') || '';
}

function setMyUsername(name) {
  localStorage.setItem('patycord.myUsername', name);
  myNameEl.textContent = name;
  profileAvatarEl.textContent = initialsFor(name);
  profileAvatarEl.style.background = colorForId(getMyPersistentId());
}

// Blocks until the user has set a username — shown once on first launch, and
// again any time they click Edit.
function promptForUsername() {
  return new Promise((resolve) => {
    usernameInput.value = getMyUsername();
    usernameModal.hidden = false;
    usernameInput.focus();

    const submit = () => {
      const name = usernameInput.value.trim();
      if (!name) return;
      setMyUsername(name);
      usernameModal.hidden = true;
      usernameSaveBtn.removeEventListener('click', submit);
      usernameInput.removeEventListener('keydown', onKeydown);
      resolve(name);
    };
    const onKeydown = (e) => { if (e.key === 'Enter') submit(); };

    usernameSaveBtn.addEventListener('click', submit);
    usernameInput.addEventListener('keydown', onKeydown);
  });
}

function loadFriends() {
  try {
    const friends = JSON.parse(localStorage.getItem('patycord.friends') || '[]');
    // Defensively drop any bad entries a past bug might have saved (empty id, etc).
    return friends.filter((f) => f && typeof f.id === 'string' && f.id.trim());
  } catch {
    return [];
  }
}

function saveFriends(friends) {
  localStorage.setItem('patycord.friends', JSON.stringify(friends));
}

// Entries saved before the pending/accepted split have no `status` field —
// treat that as 'accepted' so existing friends don't vanish.
function acceptedFriends() {
  return loadFriends().filter((f) => f.status !== 'pending');
}

function pendingOutgoingFriends() {
  return loadFriends().filter((f) => f.status === 'pending');
}

// status 'pending' is a request we sent that hasn't been accepted yet — it shows
// in the sidebar's separate Pending list, not the real Friends list. Calling this
// again with 'accepted' on an existing pending entry promotes it once the other
// side accepts.
function addFriend(id, status = 'accepted') {
  const friends = loadFriends();
  const existing = friends.find((f) => f.id === id);
  if (existing) {
    if (status === 'accepted' && existing.status === 'pending') {
      existing.status = 'accepted';
      saveFriends(friends);
      renderPeerList();
    }
    return;
  }
  friends.push({ id, name: remoteNames.get(id) || null, status });
  saveFriends(friends);
  renderPeerList();
}

// Someone told us their name (via the data-connection handshake) — update our live
// cache and, if we've saved them as a friend, their stored name too.
function learnName(id, name) {
  if (!name) return;
  remoteNames.set(id, name);
  const friends = loadFriends();
  const friend = friends.find((f) => f.id === id);
  if (friend && friend.name !== name) {
    friend.name = name;
    saveFriends(friends);
  }
  renderPeerList();
  renderIncomingCalls();
}

function renderMyActivity() {
  if (myActivity) {
    myActivityEl.textContent = t('friend.playing', { name: myActivity });
    myActivityEl.hidden = false;
  } else {
    myActivityEl.hidden = true;
  }
}

function setPeerActivity(id, activity) {
  const clean = typeof activity === 'string' ? activity.slice(0, 60) : null;
  if (activityByPeer.get(id) === clean) return;
  if (clean) activityByPeer.set(id, clean);
  else activityByPeer.delete(id);
  scheduleRenderPeerList();
}

// Pushes our current activity to everyone we already have a live data connection
// to — friends we're mid-call or mid-chat with get it instantly; everyone else picks
// it up on their next presence probe (see probePresence).
function broadcastActivity() {
  for (const conn of dataConnections.values()) {
    if (conn.open) conn.send({ type: 'activity', activity: myActivity });
  }
}

function removeFriend(id) {
  saveFriends(loadFriends().filter((f) => f.id !== id));
  presence.delete(id); // only ever meaningful for someone on the friends list
  activityByPeer.delete(id);
  chatHistories.delete(id);
  if (openChatPeerId === id) closeChat();
  if (!calls.has(id)) { dataConnections.get(id)?.close(); dataConnections.delete(id); } // keep it if still mid-call
  renderPeerList();
}

// The other side declined an outgoing request of ours — drop our pending
// entry for them. Guarded to a pending entry specifically so a stray/late
// decline can't rip out an already-accepted friend.
function handleFriendDecline(id) {
  const friends = loadFriends();
  const friend = friends.find((f) => f.id === id);
  if (!friend || friend.status !== 'pending') return;
  toast(t('toast.friendDeclined', { name: friendName(id) }), 'info');
  saveFriends(friends.filter((f) => f.id !== id));
  renderPeerList();
}

// --- UI sounds -------------------------------------------------------
// Short synthesized blips for action feedback — no audio files to ship,
// just a couple of oscillator tones with a quick fade so they don't click.

let uiSoundCtx = null;
function playTone(freq, durationMs, { type = 'sine', gain = 0.15, delayMs = 0 } = {}) {
  try {
    if (!uiSoundCtx) uiSoundCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (uiSoundCtx.state === 'suspended') uiSoundCtx.resume();
    const start = uiSoundCtx.currentTime + delayMs / 1000;
    const osc = uiSoundCtx.createOscillator();
    const env = uiSoundCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(gain, start + 0.008); // quick fade in, avoids a click
    env.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000);
    osc.connect(env).connect(uiSoundCtx.destination);
    osc.start(start);
    osc.stop(start + durationMs / 1000 + 0.02);
  } catch {} // sound is a nicety, never worth breaking the app over
}

function playMuteSound(isMuted) {
  // Muting steps down in pitch, unmuting steps up — same shape Discord/Zoom use.
  if (isMuted) playTone(600, 90);
  else { playTone(440, 70); playTone(660, 90, { delayMs: 70 }); }
}

function playScreenShareSound(isSharing) {
  if (isSharing) { playTone(520, 80); playTone(780, 120, { delayMs: 80 }); }
  else playTone(400, 100);
}

// Repeating two-tone ring for as long as at least one call is waiting on us
// to accept/decline — started/stopped from renderIncomingCalls, which already
// runs on every change to pendingCalls.
let ringInterval = null;
function playRing() {
  playTone(520, 260, { gain: 0.18 });
  playTone(660, 260, { gain: 0.18, delayMs: 260 });
}
function startRinging() {
  if (ringInterval) return;
  playRing();
  ringInterval = setInterval(playRing, 2000);
}
function stopRinging() {
  clearInterval(ringInterval);
  ringInterval = null;
}

// --- UI ------------------------------------------------------------

function log(msg) {
  statusEl.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + statusEl.textContent;
}

// Errors people actually need to notice — brief on-screen banner, not just the log.
function toast(msg, type = 'error') {
  log(msg);
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  toastsEl.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

// Outgoing friend requests we've sent that the other side hasn't accepted
// (or declined) yet — kept separate from the real Friends list below.
function renderPendingList() {
  const pending = pendingOutgoingFriends();
  pendingCardEl.hidden = pending.length === 0;
  pendingListEl.innerHTML = '';
  for (const friend of pending) {
    const name = nameFor(friend);
    const li = document.createElement('li');
    li.className = 'friendRow';
    li.innerHTML = `
      <span class="who">
        <span class="avatarWrap">${avatarHtml(friend.id, name)}</span>
        <span class="who-text">
          <span class="name">${escapeHtml(name)}</span>
          ${tagHtml(friend.id, name)}
        </span>
      </span>
      <span class="actions">
        <span class="pendingLabel">${t('sidebar.waiting')}</span>
        <button class="removeBtn ghost" title="${t('sidebar.cancelRequest')}">×</button>
      </span>`;
    li.querySelector('.removeBtn').addEventListener('click', () => removeFriend(friend.id));
    pendingListEl.appendChild(li);
  }
}

// A presence sweep (probeAllFriends) settles up to one probe per friend within
// milliseconds of each other — calling renderPeerList() straight from each one
// would tear down and rebuild the whole list once per friend instead of once
// per sweep. This collapses a burst of settlements into a single render.
let renderPeerListTimer = null;
function scheduleRenderPeerList() {
  if (renderPeerListTimer) return;
  renderPeerListTimer = setTimeout(() => {
    renderPeerListTimer = null;
    renderPeerList();
  }, 50);
}

function renderPeerList() {
  renderPendingList();
  const friends = acceptedFriends();
  peerListEl.innerHTML = '';

  if (friends.length === 0 && calls.size === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = t('sidebar.noFriends');
    peerListEl.appendChild(li);
  }

  for (const friend of friends) {
    const inCall = calls.has(friend.id);
    const connected = !!calls.get(friend.id)?.audioEl; // stream actually flowing, not just dialing
    const isOnline = connected || presence.get(friend.id);
    const activity = isOnline ? activityByPeer.get(friend.id) : null;
    const name = nameFor(friend);
    const li = document.createElement('li');
    li.className = 'friendRow';
    li.innerHTML = `
      <span class="who">
        <span class="avatarWrap">
          ${avatarHtml(friend.id, name)}
          <span class="dot ${isOnline ? 'online' : ''}"></span>
        </span>
        <span class="who-text">
          <span class="name">${escapeHtml(name)}</span>
          ${activity ? `<span class="activity">${escapeHtml(t('friend.playing', { name: activity }))}</span>` : tagHtml(friend.id, name)}
        </span>
      </span>
      <span class="actions">
        ${inCall || isOnline ? `<button class="callToggleBtn ${inCall ? 'hangupBtn' : 'callBtnIcon'}" title="${inCall ? (connected ? t('sidebar.hangUp') : t('sidebar.cancel')) : t('sidebar.call')}"></button>` : ''}
        ${isOnline ? `<button class="chatToggleBtn${friend.id === openChatPeerId ? ' active' : ''}" title="${t('sidebar.chat')}"></button>` : ''}
        <button class="removeBtn ghost" title="${t('sidebar.remove')}">×</button>
      </span>`;
    const callToggleBtn = li.querySelector('.callToggleBtn');
    if (callToggleBtn) {
      callToggleBtn.innerHTML = inCall ? ICONS.phoneOff : ICONS.phone;
      callToggleBtn.addEventListener('click', () => {
        if (calls.has(friend.id)) hangUp(friend.id);
        else connectTo(friend.id);
      });
    }
    const chatToggleBtn = li.querySelector('.chatToggleBtn');
    if (chatToggleBtn) {
      chatToggleBtn.innerHTML = ICONS.chat;
      chatToggleBtn.addEventListener('click', () => {
        if (openChatPeerId === friend.id) closeChat();
        else openChatWith(friend.id);
      });
    }
    li.querySelector('.removeBtn').addEventListener('click', () => removeFriend(friend.id));
    peerListEl.appendChild(li);
  }

  // Anyone connected who isn't a saved friend (e.g. joined via mesh discovery, or
  // someone who called us but we haven't added) — still needs a way to hang up.
  const friendIds = new Set(friends.map((f) => f.id));
  for (const id of calls.keys()) {
    if (friendIds.has(id)) continue;
    const name = friendName(id);
    const li = document.createElement('li');
    li.className = 'friendRow';
    li.innerHTML = `
      <span class="who">
        <span class="avatarWrap">${avatarHtml(id, name)}<span class="dot online"></span></span>
        <span class="who-text">
          <span class="name">${escapeHtml(name)}</span>
          ${tagHtml(id, name)}
        </span>
      </span>
      <span class="actions">
        <button class="callToggleBtn hangupBtn" title="${t('sidebar.hangUp')}"></button>
      </span>`;
    const hangupBtn = li.querySelector('.callToggleBtn');
    hangupBtn.innerHTML = ICONS.phoneOff;
    hangupBtn.addEventListener('click', () => hangUp(id));
    peerListEl.appendChild(li);
  }

  friendsCountLabelEl.textContent = t('sidebar.friends', { count: calls.size });
  renderCallPanel();
}

// The main panel's "who's in this call right now" view — separate from the
// sidebar's friends list, which is about who you *know*, not who's connected.
function renderCallPanel() {
  closeVolumePopover(); // chip buttons are about to be torn down and rebuilt
  callEmptyStateEl.hidden = calls.size > 0;
  callParticipantsEl.innerHTML = '';
  for (const [id, entry] of calls) {
    const name = friendName(id);
    const div = document.createElement('div');
    div.className = 'participant' + (entry.audioEl ? '' : ' dialing');
    div.innerHTML = `
      ${avatarHtml(id, name)}
      <span class="pname">${escapeHtml(name)}</span>
      ${entry.audioEl
        ? `<button class="volumeBtn ghost" title="${t('main.volume')}"></button>`
        : `<span class="pname" style="color:var(--text-muted)">${t('main.connecting')}</span>`}`;
    if (entry.audioEl) {
      const volumeBtn = div.querySelector('.volumeBtn');
      updateVolumeIcon(volumeBtn, entry.audioEl.volume);
      volumeBtn.addEventListener('click', () => toggleVolumePopover(id, entry.audioEl, volumeBtn));
    }
    callParticipantsEl.appendChild(div);
  }

  // Mute/share are call-specific — hide them the rest of the time, and drop
  // any in-progress screen share once there's no one left to send it to.
  const inCall = calls.size > 0;
  muteBtn.hidden = !inCall;
  shareScreenBtn.hidden = !inCall;
  if (!inCall && screenStream) stopScreenShare();

  if (wasInCall && !inCall) callChatHistory = []; // call chat ends with the call, like it always has
  wasInCall = inCall;
  updateChatView();
}

// --- per-participant volume popover -------------------------------

let openVolumePopoverId = null;

function updateVolumeIcon(btn, volume) {
  btn.innerHTML = volume === 0 ? ICONS.volumeMute : volume < 0.5 ? ICONS.volumeLow : ICONS.volumeHigh;
}

function styleSliderFill(slider) {
  const pct = slider.value;
  slider.style.background = `linear-gradient(to right, var(--accent) ${pct}%, var(--bg-elev-2) ${pct}%)`;
}

function closeVolumePopover() {
  if (!openVolumePopoverId) return;
  openVolumePopoverId = null;
  volumePopoverEl.hidden = true;
  volumePopoverEl.innerHTML = '';
}

function toggleVolumePopover(id, audioEl, anchorEl) {
  if (openVolumePopoverId === id) { closeVolumePopover(); return; }
  closeVolumePopover();
  openVolumePopoverId = id;

  const pct = Math.round(audioEl.volume * 100);
  volumePopoverEl.innerHTML = `
    <div class="volumePopoverTop">
      <button class="volumePopoverIcon ghost" title="${t('main.mute')}"></button>
      <span class="volumePct">${pct}%</span>
    </div>
    <input type="range" class="volumePopoverSlider" min="0" max="100" value="${pct}">`;

  const slider = volumePopoverEl.querySelector('.volumePopoverSlider');
  const pctLabel = volumePopoverEl.querySelector('.volumePct');
  const iconBtn = volumePopoverEl.querySelector('.volumePopoverIcon');
  updateVolumeIcon(iconBtn, audioEl.volume);
  styleSliderFill(slider);

  slider.addEventListener('input', () => {
    audioEl.volume = slider.value / 100;
    pctLabel.textContent = `${slider.value}%`;
    updateVolumeIcon(iconBtn, audioEl.volume);
    updateVolumeIcon(anchorEl, audioEl.volume);
    styleSliderFill(slider);
  });

  iconBtn.addEventListener('click', () => {
    if (audioEl.volume > 0) {
      audioEl.dataset.lastVolume = audioEl.volume;
      audioEl.volume = 0;
    } else {
      audioEl.volume = Number(audioEl.dataset.lastVolume) || 1;
    }
    slider.value = Math.round(audioEl.volume * 100);
    pctLabel.textContent = `${slider.value}%`;
    updateVolumeIcon(iconBtn, audioEl.volume);
    updateVolumeIcon(anchorEl, audioEl.volume);
    styleSliderFill(slider);
  });

  const rect = anchorEl.getBoundingClientRect();
  volumePopoverEl.hidden = false;
  const popRect = volumePopoverEl.getBoundingClientRect();
  volumePopoverEl.style.left = `${Math.round(rect.left + rect.width / 2 - popRect.width / 2)}px`;
  volumePopoverEl.style.top = `${Math.round(rect.bottom + 8)}px`;
}

document.addEventListener('click', (e) => {
  if (!openVolumePopoverId) return;
  if (volumePopoverEl.contains(e.target) || e.target.closest('.volumeBtn')) return;
  closeVolumePopover();
});

function closeScreenSharePopover() {
  screenSharePopoverEl.hidden = true;
  screenSharePopoverEl.innerHTML = '';
}

function toggleScreenSharePopover(anchorEl) {
  if (!screenSharePopoverEl.hidden) { closeScreenSharePopover(); return; }

  screenSharePopoverEl.innerHTML = `
    <div class="screenSharePopoverTitle">${t('main.shareScreen')}</div>
    <div class="screenSharePopoverRow">
      <select class="screenSharePopoverRes">
        <option value="1080">1080p</option>
        <option value="720">720p</option>
      </select>
      <select class="screenSharePopoverFps">
        <option value="60">60 fps</option>
        <option value="30">30 fps</option>
      </select>
    </div>
    <button class="screenSharePopoverStart">${t('main.startSharing')}</button>`;

  const resSelect = screenSharePopoverEl.querySelector('.screenSharePopoverRes');
  const fpsSelect = screenSharePopoverEl.querySelector('.screenSharePopoverFps');
  const startBtn = screenSharePopoverEl.querySelector('.screenSharePopoverStart');
  resSelect.value = getScreenShareResolution();
  fpsSelect.value = getScreenShareFps();

  resSelect.addEventListener('change', () => setScreenShareResolution(resSelect.value));
  fpsSelect.addEventListener('change', () => setScreenShareFps(fpsSelect.value));
  startBtn.addEventListener('click', () => {
    closeScreenSharePopover();
    startScreenShare();
  });

  const rect = anchorEl.getBoundingClientRect();
  screenSharePopoverEl.hidden = false;
  const popRect = screenSharePopoverEl.getBoundingClientRect();
  screenSharePopoverEl.style.left = `${Math.round(rect.left + rect.width / 2 - popRect.width / 2)}px`;
  screenSharePopoverEl.style.top = `${Math.round(rect.top - popRect.height - 8)}px`;
}

document.addEventListener('click', (e) => {
  if (screenSharePopoverEl.hidden) return;
  if (screenSharePopoverEl.contains(e.target) || e.target.closest('#shareScreenBtn')) return;
  closeScreenSharePopover();
});

function attachRemoteStream(peerId, stream) {
  const audio = new Audio();
  audio.srcObject = stream;
  audio.autoplay = true;
  const entry = calls.get(peerId) || {};
  entry.audioEl = audio;
  calls.set(peerId, entry);
  renderPeerList();
}

function hangUp(peerId) {
  const entry = calls.get(peerId);
  if (entry && entry.call) entry.call.close();
  removeCall(peerId);
  // Hanging up on someone also ends any screen sharing between you and them —
  // but NOT the data connection: that's now shared, general-purpose infrastructure
  // (chat, roster, friend requests), independent of the call's lifecycle.
  const outgoingScreen = outgoingScreenCalls.get(peerId);
  if (outgoingScreen) { outgoingScreen.close(); outgoingScreenCalls.delete(peerId); }
  removeScreenTile(peerId);
}

function removeCall(peerId) {
  const entry = calls.get(peerId);
  if (entry && entry.audioEl) {
    entry.audioEl.srcObject = null;
  }
  calls.delete(peerId);
  renderPeerList();
  log(t('log.disconnected', { id: peerId }));
}

function wireCall(call) {
  const entry = calls.get(call.peer) || {};
  entry.call = call;
  calls.set(call.peer, entry);
  renderPeerList();

  call.on('stream', (remoteStream) => attachRemoteStream(call.peer, remoteStream));
  call.on('close', () => removeCall(call.peer));
  call.on('error', (err) => { toast(t('toast.callFailed', { name: friendName(call.peer), error: err })); removeCall(call.peer); });
}

// Opens (if needed) the data connection used for roster exchange and chat with `id`.
function ensureDataConnection(id) {
  if (dataConnections.has(id)) return dataConnections.get(id);
  const conn = peer.connect(id);
  conn.on('open', () => conn.send({ type: 'hello', name: getMyUsername(), activity: myActivity }));
  conn.on('data', (msg) => handleDataMessage(id, msg));
  conn.on('error', () => {}); // connectivity errors surface via the call itself
  conn.on('close', () => dataConnections.delete(id));
  dataConnections.set(id, conn);
  return conn;
}

// Tells `id` "I added you" so they get an Accept prompt instead of having to
// separately paste your ID back — only one side needs to do the copy/paste dance.
// Best-effort: if they're offline right now it just silently doesn't arrive, same
// as it always has for anyone not currently online.
function sendFriendRequest(id) {
  const conn = ensureDataConnection(id);
  const send = () => conn.send({ type: 'friend-request', name: getMyUsername() });
  if (conn.open) send();
  else conn.on('open', send);
}

// Connect audio (+ a data channel, for chat) to a peer we've just learned about,
// unless we're already connected to them.
function meshCall(id) {
  if (!peer || id === peer.id || calls.has(id)) return;
  ensureDataConnection(id);
  const call = peer.call(id, processedStream);
  wireCall(call);

  // If they're offline (or never accept), the call just hangs — give up after a while
  // instead of leaving a permanently "connecting" entry.
  setTimeout(() => {
    if (!calls.get(id)?.audioEl) {
      presence.set(id, false);
      hangUp(id);
    }
  }, 15000);
}

// Ask `id` (our entry point into a call) who else is already there, then call everyone
// they mention directly. Also works as a plain "call this ID" when nobody answers with a roster.
function connectTo(id) {
  if (!peer || id === peer.id || calls.has(id)) return;
  ensureDataConnection(id);
  meshCall(id);
}

// Anyone can act as a discovery hub for whoever joins through their ID: when a new
// peer connects to us, we hand them the list of everyone already in the call (our
// current `calls`), and they take it from there — calling each one directly. Existing
// peers don't need to act on this; they'll just receive an incoming call from the
// new joiner and auto-answer, same as any other call.
function handleIncomingDataConnection(conn) {
  conn.on('open', () => {
    conn.send({ type: 'hello', name: getMyUsername(), activity: myActivity });
    const roster = [...calls.keys()].filter((id) => id !== conn.peer);
    conn.send({ type: 'roster', peers: roster });
    for (const [otherId, otherConn] of dataConnections) {
      if (otherId !== conn.peer) otherConn.send({ type: 'peer-joined', id: conn.peer });
    }
    dataConnections.set(conn.peer, conn);
  });
  conn.on('data', (msg) => handleDataMessage(conn.peer, msg));
  conn.on('close', () => dataConnections.delete(conn.peer));
}

function handleDataMessage(fromId, msg) {
  if (msg.type === 'hello') {
    learnName(fromId, typeof msg.name === 'string' ? msg.name.slice(0, 40) : '');
    setPeerActivity(fromId, msg.activity);
  } else if (msg.type === 'activity') {
    setPeerActivity(fromId, msg.activity);
  } else if (msg.type === 'roster') {
    // A connected peer controls this list — validate before trusting it, and cap
    // it so a misbehaving/malicious one can't fan us out into countless outbound calls.
    if (Array.isArray(msg.peers)) {
      for (const id of msg.peers.slice(0, 50)) {
        if (typeof id === 'string') meshCall(id);
      }
    }
  } else if (msg.type === 'peer-joined') {
    if (typeof msg.id === 'string') log(t('log.joining', { name: friendName(msg.id) }));
  } else if (msg.type === 'chat') {
    const text = typeof msg.text === 'string' ? msg.text.slice(0, 2000) : '';
    if (msg.scope === 'dm') {
      if (!acceptedFriends().some((f) => f.id === fromId)) return; // only from accepted friends
      addChatMessage(fromId, fromId, text);
      if (fromId !== openChatPeerId) toast(t('toast.newMessage', { name: friendName(fromId) }), 'info');
    } else {
      // 'call' scope (or unmarked, from an older client) — only from someone actually in the call with us.
      if (!calls.has(fromId)) return;
      addCallChatMessage(fromId, text);
      // Only worth a toast if call chat isn't the thing currently on screen — e.g. a DM is open instead.
      if (openChatPeerId !== null) toast(t('toast.newCallMessage', { name: friendName(fromId) }), 'info');
    }
  } else if (msg.type === 'friend-request') {
    handleFriendRequest(fromId, typeof msg.name === 'string' ? msg.name.slice(0, 40) : '');
  } else if (msg.type === 'friend-accept') {
    addFriend(fromId, 'accepted'); // promotes our pending entry for them, if any
    toast(t('toast.friendAccepted', { name: friendName(fromId) }), 'info');
  } else if (msg.type === 'friend-decline') {
    handleFriendDecline(fromId);
  }
}

// --- chat ----------------------------------------------------------
// Two independent kinds of thread share one panel:
//  - DMs: per-friend (chatHistories), available any time a friend is
//    online, entirely independent of calls. Opened via a friend's chat
//    button; openChatPeerId tracks which one (if any) is showing.
//  - Call chat: one shared broadcast thread (callChatHistory) for whoever
//    is in the current call — the original behavior, auto-shown/hidden
//    with the call and reset when it ends. Shown whenever no DM is open.
// A DM being open always takes visual priority over call chat; closing it
// falls back to call chat if a call is still active, rather than just
// hiding the panel.

function renderChatMessage(fromId, text) {
  const displayName = fromId === peer.id ? t('chat.you') : friendName(fromId);
  const div = document.createElement('div');
  div.className = 'chatMsg';
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  div.innerHTML = `<span class="who" style="color:${colorForId(fromId)}">${escapeHtml(displayName)}</span><span class="time">${time}</span><span class="text">${escapeHtml(text)}</span>`;
  chatMessagesEl.appendChild(div);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

// Records a message in `peerId`'s DM thread (fromId is whoever actually
// sent it — us or them) and renders it live only if that thread is open.
function addChatMessage(peerId, fromId, text) {
  if (!text) return;
  const history = chatHistories.get(peerId) || [];
  history.push({ fromId, text });
  chatHistories.set(peerId, history);
  if (peerId === openChatPeerId) renderChatMessage(fromId, text);
}

function addCallChatMessage(fromId, text) {
  if (!text) return;
  callChatHistory.push({ fromId, text });
  if (openChatPeerId === null && calls.size > 0) renderChatMessage(fromId, text);
}

function openChatWith(peerId) {
  ensureDataConnection(peerId); // independent of any call — opens on demand
  openChatPeerId = peerId;
  chatHeaderNameEl.textContent = friendName(peerId);
  chatCloseBtn.hidden = false;
  chatMessagesEl.innerHTML = '';
  for (const { fromId, text } of chatHistories.get(peerId) || []) renderChatMessage(fromId, text);
  chatPanelEl.hidden = false;
  chatInputEl.focus();
  renderPeerList(); // so the right friend's chat button shows as active
}

// The call-chat view has no close button of its own — like before, it's
// purely driven by being in a call or not (see renderCallPanel).
function showCallChat() {
  chatHeaderNameEl.textContent = t('chat.title');
  chatCloseBtn.hidden = true;
  chatMessagesEl.innerHTML = '';
  for (const { fromId, text } of callChatHistory) renderChatMessage(fromId, text);
  chatPanelEl.hidden = false;
}

// Re-decides what the chat panel should show given current state — call
// this after anything that could change either side of that (DM open/close,
// call start/end). A DM wins if one's open; otherwise call chat while in a
// call; otherwise hide the panel entirely.
function updateChatView() {
  if (openChatPeerId !== null) {
    chatPanelEl.hidden = false;
    return;
  }
  if (calls.size > 0) showCallChat();
  else chatPanelEl.hidden = true;
}

function closeChat() {
  openChatPeerId = null;
  updateChatView();
  renderPeerList();
}

function sendChatMessage() {
  const text = chatInputEl.value.trim();
  if (!text) return;
  if (openChatPeerId !== null) {
    const peerId = openChatPeerId;
    const conn = ensureDataConnection(peerId);
    const send = () => conn.send({ type: 'chat', scope: 'dm', text });
    if (conn.open) send();
    else conn.on('open', send);
    addChatMessage(peerId, peer.id, text);
  } else if (calls.size > 0) {
    for (const id of calls.keys()) dataConnections.get(id)?.send({ type: 'chat', scope: 'call', text });
    addCallChatMessage(peer.id, text);
  } else {
    return;
  }
  chatInputEl.value = '';
}

// A silent, no-audio connection attempt just to check whether a friend's app is
// currently open — doesn't ring anything on their end.
function probePresence(id) {
  if (!peer || !id || calls.has(id)) return;
  let settled = false;
  const probe = peer.connect(id, { reliable: false });
  const finish = (online) => {
    if (settled) return;
    settled = true;
    presence.set(id, online);
    if (!online) setPeerActivity(id, null); // stale activity shouldn't outlive them going offline
    scheduleRenderPeerList();
  };
  const timer = setTimeout(() => { finish(false); try { probe.close(); } catch {} }, 4000);
  probe.on('open', () => {
    clearTimeout(timer);
    finish(true);
    probe.send({ type: 'hello', name: getMyUsername(), activity: myActivity });
    // Give their reply (sent back from handleIncomingDataConnection on their end) a
    // moment to arrive before tearing the probe connection back down.
    setTimeout(() => { try { probe.close(); } catch {} }, 800);
  });
  probe.on('data', (msg) => {
    if (msg.type !== 'hello') return;
    learnName(id, typeof msg.name === 'string' ? msg.name.slice(0, 40) : '');
    setPeerActivity(id, msg.activity);
  });
  probe.on('error', () => { clearTimeout(timer); finish(false); try { probe.close(); } catch {} });
}

function probeAllFriends() {
  for (const friend of acceptedFriends()) probePresence(friend.id);
}

// Like friendName(id), but for call sites that already have the friend record in
// hand (e.g. mid-loop over loadFriends()) — skips redoing the full reload+scan
// friendName() would otherwise repeat for every single row.
function nameFor(friend) {
  return remoteNames.get(friend.id) || friend.name || t('unknown');
}

function friendName(id) {
  return remoteNames.get(id) || loadFriends().find((f) => f.id === id)?.name || t('unknown');
}

function renderIncomingCalls() {
  if (pendingCalls.size > 0) startRinging();
  else stopRinging();
  incomingCallsEl.innerHTML = '';
  for (const [id, call] of pendingCalls) {
    const name = friendName(id);
    const div = document.createElement('div');
    div.className = 'incomingCall';
    div.innerHTML = `
      <span class="who">
        ${avatarHtml(id, name)}
        <span class="who-text">
          <span class="callLabel">${t('incomingCall.label')}</span>
          <span class="callName">${escapeHtml(name)}</span>
        </span>
      </span>
      <span class="actions">
        <button class="acceptBtn">${t('accept')}</button>
        <button class="declineBtn">${t('decline')}</button>
      </span>`;
    div.querySelector('.acceptBtn').addEventListener('click', () => {
      pendingCalls.delete(id);
      call.answer(processedStream);
      wireCall(call);
      renderIncomingCalls();
    });
    div.querySelector('.declineBtn').addEventListener('click', () => {
      pendingCalls.delete(id);
      call.close();
      renderIncomingCalls();
    });
    incomingCallsEl.appendChild(div);
  }
}

// --- friend requests -------------------------------------------------

function handleFriendRequest(fromId, name) {
  const existing = loadFriends().find((f) => f.id === fromId);
  if (existing?.status === 'accepted') return; // already friends, nothing to do
  if (existing?.status === 'pending') {
    // We'd also sent *them* a request (added each other around the same time) —
    // no need to make either side click Accept, just treat it as mutual.
    addFriend(fromId, 'accepted');
    dataConnections.get(fromId)?.send({ type: 'friend-accept' });
    toast(t('toast.mutualAdd', { name: name || t('them') }), 'info');
    return;
  }
  if (pendingFriendRequests.has(fromId)) return; // already showing one from them
  pendingFriendRequests.set(fromId, name);
  renderFriendRequests(); // the banner itself is the notice — no need for a toast too
}

function renderFriendRequests() {
  friendRequestsEl.innerHTML = '';
  for (const [id, name] of pendingFriendRequests) {
    const div = document.createElement('div');
    div.className = 'incomingCall';
    div.innerHTML = `
      <span class="who">
        ${avatarHtml(id, name)}
        <span class="who-text">
          <span class="callLabel">${t('friendRequest.label')}</span>
          <span class="callName">${escapeHtml(name || t('unknown'))}</span>
        </span>
      </span>
      <span class="actions">
        <button class="acceptBtn">${t('accept')}</button>
        <button class="declineBtn">${t('decline')}</button>
      </span>`;
    div.querySelector('.acceptBtn').addEventListener('click', () => {
      pendingFriendRequests.delete(id);
      learnName(id, name);
      addFriend(id);
      dataConnections.get(id)?.send({ type: 'friend-accept' });
      toast(t('toast.addedFriend', { name: name || t('them') }), 'info');
      renderFriendRequests();
    });
    div.querySelector('.declineBtn').addEventListener('click', () => {
      pendingFriendRequests.delete(id);
      dataConnections.get(id)?.send({ type: 'friend-decline' });
      renderFriendRequests();
    });
    friendRequestsEl.appendChild(div);
  }
}

// --- screen sharing --------------------------------------------------

function addScreenTile(peerId, call) {
  removeScreenTile(peerId); // replace any existing tile from them

  const tile = document.createElement('div');
  tile.className = 'screenTile';
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  // Not muted — if the sharer included system audio, we want to actually hear it.
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = t('screen.label', { name: friendName(peerId) });
  tile.appendChild(video);
  tile.appendChild(label);
  screenGridEl.appendChild(tile);
  screenTiles.set(peerId, { call, tileEl: tile });

  call.on('stream', (stream) => { video.srcObject = stream; });
  call.on('close', () => removeScreenTile(peerId));
  call.on('error', () => removeScreenTile(peerId));
}

function removeScreenTile(peerId) {
  const entry = screenTiles.get(peerId);
  if (!entry) return;
  entry.call.close(); // no-op if it's already closing/closed — this is often called from that path
  entry.tileEl.remove();
  screenTiles.delete(peerId);
}

// Only accept a screen share from someone we're already voice-connected to — an
// unsolicited video call from a stranger just gets dropped, no prompt needed since
// the trust boundary is "already in a call with them".
function handleIncomingScreenShare(call) {
  if (!calls.has(call.peer)) { call.close(); return; }
  call.answer();
  addScreenTile(call.peer, call);
  toast(t('toast.screenShareStarted', { name: friendName(call.peer) }), 'info');
}

async function startScreenShare() {
  try {
    // audio: true captures system/app audio alongside the video when supported (typically
    // only when sharing the whole screen, not a single window) — falls back to video-only
    // silently if the OS/selection doesn't support it, no error either way.
    // Resolution/fps are "ideal", not "exact" — the browser still picks the closest it can
    // do rather than failing the capture if the source doesn't match exactly.
    const height = Number(getScreenShareResolution());
    const fps = Number(getScreenShareFps());
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { height: { ideal: height }, width: { ideal: height * 16 / 9 }, frameRate: { ideal: fps, max: fps } },
      audio: true,
    });
  } catch (err) {
    toast(t('toast.screenShareFailed', { error: err.message }));
    return;
  }
  screenStream.getVideoTracks()[0].addEventListener('ended', stopScreenShare);

  for (const id of calls.keys()) {
    const call = peer.call(id, screenStream, { metadata: { type: 'screen' } });
    outgoingScreenCalls.set(id, call);
    call.on('close', () => outgoingScreenCalls.delete(id));
    call.on('error', () => outgoingScreenCalls.delete(id));
  }

  shareScreenBtn.title = t('main.stopSharing');
  shareScreenBtn.classList.add('sharing');
  playScreenShareSound(true);
  log(t('log.sharingScreen'));
}

function stopScreenShare() {
  if (screenStream) {
    screenStream.getTracks().forEach((track) => track.stop());
    screenStream = null;
  }
  for (const call of outgoingScreenCalls.values()) call.close();
  outgoingScreenCalls.clear();
  shareScreenBtn.title = t('main.shareScreen');
  shareScreenBtn.classList.remove('sharing');
  playScreenShareSound(false);
  log(t('log.stoppedSharing'));
}

// --- RNNoise (open-source ML noise suppression, runs locally, no account needed) ---

const RNNOISE_FRAME_SIZE = 480; // required by RNNoise, at 48kHz
let rnnoiseModule = null;
let rnnoiseState = 0;
let rnnoiseInPtr = 0;
let rnnoiseOutPtr = 0;
let rnnoiseEnabled = true;
let audioCtx = null;
let scriptProcessorNode = null; // held onto so it isn't garbage-collected mid-call

async function loadRNNoise() {
  if (rnnoiseModule) return rnnoiseModule;
  try {
    rnnoiseModule = await createRNNWasmModule();
    rnnoiseState = rnnoiseModule._rnnoise_create(0);
    const bytes = RNNOISE_FRAME_SIZE * 4;
    rnnoiseInPtr = rnnoiseModule._malloc(bytes);
    rnnoiseOutPtr = rnnoiseModule._malloc(bytes);
  } catch (err) {
    log(t('log.rnnoiseFailed', { error: err.message }));
    rnnoiseModule = null;
  }
  return rnnoiseModule;
}

// frameIn/frameOut: Float32Array(480), samples in [-1, 1] — RNNoise itself expects
// roughly int16-scale values, hence the *32768 / /32768 around the actual call.
function processFrameRNNoise(frameIn, frameOut) {
  const m = rnnoiseModule;
  for (let i = 0; i < RNNOISE_FRAME_SIZE; i++) m.HEAPF32[rnnoiseInPtr / 4 + i] = frameIn[i] * 32768;
  m._rnnoise_process_frame(rnnoiseState, rnnoiseOutPtr, rnnoiseInPtr);
  for (let i = 0; i < RNNOISE_FRAME_SIZE; i++) frameOut[i] = m.HEAPF32[rnnoiseOutPtr / 4 + i] / 32768;
}

// Fixed-capacity circular buffer of samples. The naive way to buffer a stream of
// irregularly-sized chunks is "concat onto a growing array", which reallocates
// and copies the whole thing on every single chunk — wasteful GC churn in an
// audio callback that fires ten-plus times a second for as long as a call lasts.
// This allocates once and never again.
class RingBuffer {
  constructor(capacity) {
    this.buf = new Float32Array(capacity);
    this.capacity = capacity;
    this.readIdx = 0;
    this.length = 0; // samples currently buffered
  }
  write(chunk) {
    for (let i = 0; i < chunk.length; i++) {
      this.buf[(this.readIdx + this.length) % this.capacity] = chunk[i];
      this.length++;
    }
  }
  // Fills `dest` (its full length) with the oldest buffered samples and removes
  // them. Caller checks .length beforehand — this doesn't guard against underrun.
  read(dest) {
    for (let i = 0; i < dest.length; i++) {
      dest[i] = this.buf[this.readIdx];
      this.readIdx = (this.readIdx + 1) % this.capacity;
    }
    this.length -= dest.length;
  }
}

// Runs the raw mic stream through RNNoise (when enabled) via a Web Audio graph and
// returns a new MediaStream carrying the processed audio — this is what actually
// goes out over WebRTC. Uses ScriptProcessorNode (deprecated but universally
// supported, and simpler than an AudioWorklet for this scale) with internal ring
// buffers, since RNNoise needs exactly 480-sample frames regardless of the
// browser's own audio callback chunk size.
function buildProcessedStream(rawStream) {
  audioCtx = new AudioContext({ sampleRate: 48000 });
  const source = audioCtx.createMediaStreamSource(rawStream);
  const processor = audioCtx.createScriptProcessor(4096, 1, 1);

  // 3x the callback size is comfortable headroom over the worst-case backlog
  // (well under 2x in practice) with input/output running at the same rate —
  // this is never expected to fill up, let alone overflow.
  const RING_CAPACITY = 4096 * 3;
  const inputRing = new RingBuffer(RING_CAPACITY);
  const outputRing = new RingBuffer(RING_CAPACITY);
  const frameIn = new Float32Array(RNNOISE_FRAME_SIZE);
  const frameOut = new Float32Array(RNNOISE_FRAME_SIZE);

  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    const output = e.outputBuffer.getChannelData(0);

    if (!rnnoiseEnabled || !rnnoiseModule) {
      output.set(input);
      return;
    }

    inputRing.write(input);
    while (inputRing.length >= RNNOISE_FRAME_SIZE) {
      inputRing.read(frameIn);
      processFrameRNNoise(frameIn, frameOut);
      outputRing.write(frameOut);
    }

    if (outputRing.length >= output.length) {
      outputRing.read(output);
    } else {
      // Brief startup underrun — take what's there and leave the rest silent
      // rather than noise. Reading straight into a view over the front of
      // `output` avoids a separate temporary buffer.
      const available = outputRing.length;
      outputRing.read(output.subarray(0, available));
      output.fill(0, available);
    }
  };

  source.connect(processor);
  scriptProcessorNode = processor;
  const dest = audioCtx.createMediaStreamDestination();
  processor.connect(dest);
  return dest.stream;
}

async function requestMic() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      // Browser-level suppression stays on as a safety net until we know whether
      // RNNoise actually loaded — if it does, we turn this off below to avoid
      // double-processing the same audio through two different denoisers.
      audio: { noiseSuppression: true, voiceIsolation: true, echoCancellation: true, autoGainControl: true },
      video: false,
    });
    const settings = localStream.getAudioTracks()[0]?.getSettings();
    log(t('log.micSettings', { json: JSON.stringify(settings) }));

    rnnoiseEnabled = getNoiseSuppressionEnabled();
    await loadRNNoise();
    if (rnnoiseModule) {
      localStream.getAudioTracks()[0].applyConstraints({ noiseSuppression: false, voiceIsolation: false }).catch(() => {});
      processedStream = buildProcessedStream(localStream);
      log(t('log.rnnoiseActive'));
    } else {
      processedStream = localStream;
    }

    return true;
  } catch (err) {
    toast(t('toast.micFailed', { error: err.message }));
    micAccessFailed = true;
    myIdEl.textContent = t('myId.micNeeded');
    myIdEl.removeAttribute('data-i18n'); // same reasoning as the peer.on('open') case above
    return false;
  }
}

// PeerJS doesn't retry on its own after losing the signaling connection — we have
// to call reconnect() ourselves. Back off a bit on repeated failures so a prolonged
// outage doesn't hammer the broker.
function scheduleReconnect() {
  if (reconnectTimer) return; // already have one pending
  const delay = Math.min(3000 * 2 ** reconnectAttempts, 30000);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectAttempts++;
    if (peer && !peer.destroyed) peer.reconnect();
  }, delay);
}

async function main() {
  if (!getMyUsername()) await promptForUsername();
  if (!(await requestMic())) return;

  // A stable ID (saved locally) means friends you've added stay valid across restarts.
  peer = new Peer(getMyPersistentId()); // uses PeerJS's free public cloud broker for signaling only

  peer.on('open', (id) => {
    myIdEl.innerHTML = tagHtml(id, getMyUsername());
    myIdEl.removeAttribute('data-i18n'); // it's showing real content now — a static-translation sweep must never clobber it back to "connecting…"
    log(t('log.ready'));
    renderPeerList();
    probeAllFriends();
    reconnectAttempts = 0; // a successful (re)connect resets the backoff
    if (!presenceProbeInterval) presenceProbeInterval = setInterval(probeAllFriends, 10000);
  });

  peer.on('call', (call) => {
    if (call.metadata?.type === 'screen') {
      handleIncomingScreenShare(call);
      return;
    }
    pendingCalls.set(call.peer, call);
    renderIncomingCalls();
    log(t('log.incomingCall', { name: friendName(call.peer) }));
    call.on('close', () => { pendingCalls.delete(call.peer); renderIncomingCalls(); });
  });

  peer.on('connection', (conn) => handleIncomingDataConnection(conn));

  peer.on('error', (err) => {
    // "Could not connect to peer <id>" from the broker means they're not online right
    // now — clean up the dialing state immediately instead of waiting for the timeout,
    // and show a plain-English toast instead of the raw broker error.
    if (err.type === 'peer-unavailable') {
      const match = /peer\s+(\S+)/.exec(err.message || '');
      const id = match?.[1];
      if (id && calls.has(id) && !calls.get(id).audioEl) {
        presence.set(id, false);
        hangUp(id);
        toast(t('toast.notOnline', { name: friendName(id) }));
      } else {
        log(t('log.peerError', { error: err }));
      }
      return;
    }
    toast(t('toast.connectionError', { error: err.message || err }));
  });
  peer.on('disconnected', () => {
    toast(t('toast.reconnecting'), 'info');
    scheduleReconnect();
  });

  callBtn.addEventListener('click', () => {
    const id = peerIdInput.value.trim();
    if (!id || id === peer.id) return;
    addFriend(id, 'pending');
    sendFriendRequest(id);
    peerIdInput.value = '';
    log(t('log.friendRequestSent', { name: friendName(id) }));
  });

  peerIdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') callBtn.click();
  });
}

copyBtn.addEventListener('click', () => {
  if (!peer) return;
  navigator.clipboard.writeText(peer.id); // the real connection ID, not the pretty tag shown on screen
  copyBtn.textContent = t('settings.copied');
  setTimeout(() => (copyBtn.textContent = t('settings.copy')), 1200);
});

settingsBtn.addEventListener('click', () => {
  settingsNameInput.value = getMyUsername();
  noiseSuppressionToggle.checked = getNoiseSuppressionEnabled();
  settingsModal.hidden = false;
  appVersionEl.textContent = '';
  window.__TAURI__?.app.getVersion().then((v) => { appVersionEl.textContent = `patycord v${v}`; });
});
closeSettingsBtn.addEventListener('click', () => { settingsModal.hidden = true; });
noiseSuppressionToggle.addEventListener('change', () => {
  setNoiseSuppressionEnabled(noiseSuppressionToggle.checked);
});
settingsSaveNameBtn.addEventListener('click', () => {
  const name = settingsNameInput.value.trim();
  if (!name) return;
  setMyUsername(name);
  settingsModal.hidden = true;
});
settingsNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') settingsSaveNameBtn.click();
});

// --- language switching -------------------------------------------

for (const [code, label] of Object.entries(LANGUAGES)) {
  const opt = document.createElement('option');
  opt.value = code;
  opt.textContent = label;
  languageSelectEl.appendChild(opt);
}
languageSelectEl.value = getLanguage();

languageSelectEl.addEventListener('change', () => {
  setLanguage(languageSelectEl.value);
  applyLanguage();
});

// Re-applies every currently-visible piece of translated UI after a switch —
// both the static, data-i18n-tagged markup and everything renderer.js
// generates dynamically. A couple of spots hold JS-set content a blind
// static sweep would otherwise wipe back to placeholder text (see the
// data-i18n removal comments where they're first set) — those get
// explicitly regenerated here instead.
function applyLanguage() {
  applyStaticTranslations();
  if (peer) myIdEl.innerHTML = tagHtml(peer.id, getMyUsername());
  else if (micAccessFailed) myIdEl.textContent = t('myId.micNeeded');
  if (currentUpdate) {
    updateBannerTextEl.textContent = t('update.available', { version: currentUpdate.version, current: currentUpdate.currentVersion });
  }
  if (justUpdatedInfo) {
    whatsNewTextEl.textContent = t('whatsNew.title', { version: justUpdatedInfo.version });
  }
  muteBtn.title = muted ? t('main.unmute') : t('main.mute');
  shareScreenBtn.title = screenStream ? t('main.stopSharing') : t('main.shareScreen');
  renderMyActivity();
  renderPeerList();
  renderIncomingCalls();
  renderFriendRequests();
}

chatSendBtn.addEventListener('click', sendChatMessage);
chatInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChatMessage();
});
chatCloseBtn.addEventListener('click', closeChat);

muteBtn.addEventListener('click', () => {
  if (!localStream) return;
  muted = !muted;
  localStream.getAudioTracks().forEach((track) => (track.enabled = !muted));
  muteBtn.title = muted ? t('main.unmute') : t('main.mute');
  muteBtn.classList.toggle('active', muted);
  muteBtn.innerHTML = muted ? ICONS.micOff : ICONS.mic;
  playMuteSound(muted);
});

shareScreenBtn.addEventListener('click', () => {
  if (screenStream) stopScreenShare();
  else toggleScreenSharePopover(shareScreenBtn);
});

logToggleBtn.addEventListener('click', () => {
  logPanel.hidden = !logPanel.hidden;
});

usernameInput.addEventListener('input', () => {
  usernameAvatar.textContent = initialsFor(usernameInput.value);
  usernameAvatar.style.background = colorForId(usernameInput.value || getMyPersistentId());
});

muteBtn.innerHTML = ICONS.mic;
shareScreenBtn.innerHTML = ICONS.monitor;
logToggleBtn.innerHTML = ICONS.list;
settingsBtn.innerHTML = ICONS.gear;

// --- release notes popup ------------------------------------------------
// Shared by the "update available" banner and the post-update "what's new"
// banner — a dismissible modal instead of dumping the notes inline in the
// banner itself. Rendered via textContent, never innerHTML: it's remote
// content (a GitHub Release body), never worth trusting as markup.
function openReleaseNotes(title, notes) {
  releaseNotesTitleEl.textContent = title;
  releaseNotesBodyEl.textContent = notes;
  releaseNotesModalEl.hidden = false;
}

function closeReleaseNotes() {
  releaseNotesModalEl.hidden = true;
}

closeReleaseNotesBtn.addEventListener('click', closeReleaseNotes);

// --- auto-update -------------------------------------------------------
// Checks GitHub Releases (via the endpoint in tauri.conf.json) for a newer
// signed build. window.__TAURI__ only exists inside the actual Tauri app
// (not when browser-testing via `npm run serve`), so this is a no-op there.
async function checkForUpdates() {
  const updater = window.__TAURI__?.updater;
  if (!updater) return;
  try {
    const update = await updater.check();
    if (!update) return;
    currentUpdate = update;
    updateBannerTextEl.textContent = t('update.available', { version: update.version, current: update.currentVersion });
    updateBannerTextEl.removeAttribute('data-i18n'); // same reasoning as myIdEl above
    const notes = (update.body || '').trim();
    updateBannerNotesBtn.hidden = !notes;
    updateBannerNotesBtn.onclick = () => openReleaseNotes(t('update.available', { version: update.version, current: update.currentVersion }), notes);
    updateBannerEl.hidden = false;
    updateBannerBtn.addEventListener('click', async () => {
      updateBannerBtn.disabled = true;
      updateBannerBtn.textContent = t('update.updating');
      try {
        await update.downloadAndInstall();
        // Read back on the next launch (a fresh process, this module's state is
        // gone) to show a "what's new" banner once the relaunch actually lands.
        localStorage.setItem('patycord.justUpdated', JSON.stringify({ version: update.version, notes: update.body || '' }));
        await window.__TAURI__.process.relaunch();
      } catch (err) {
        toast(t('update.failed', { error: err.message || err }));
        updateBannerBtn.disabled = false;
        updateBannerBtn.textContent = t('update.button');
      }
    }, { once: true });
  } catch (err) {
    // Quiet — a failed update check (offline, GitHub down, etc.) is never
    // worth interrupting the user over. It'll just try again next launch.
    log(t('log.updateCheckFailed', { error: err.message || err }));
  }
}

// If patycord.justUpdated is set, we just relaunched into a fresh install
// triggered by the button above — this is a brand new process/module
// instance, so that's the only way state carries across the relaunch. Shows
// once, then clears itself so it doesn't reappear on the next ordinary launch.
function showWhatsNewIfJustUpdated() {
  const raw = localStorage.getItem('patycord.justUpdated');
  if (!raw) return;
  localStorage.removeItem('patycord.justUpdated');
  let info;
  try {
    info = JSON.parse(raw);
  } catch {
    return;
  }
  justUpdatedInfo = info;
  whatsNewTextEl.textContent = t('whatsNew.title', { version: info.version });
  const notes = (info.notes || '').trim();
  whatsNewNotesBtn.hidden = !notes;
  whatsNewNotesBtn.onclick = () => openReleaseNotes(t('whatsNew.title', { version: info.version }), notes);
  whatsNewBannerEl.hidden = false;
  whatsNewBtn.addEventListener('click', () => {
    whatsNewBannerEl.hidden = true;
    justUpdatedInfo = null;
  }, { once: true });
}

applyStaticTranslations(); // before anything renders, including the username prompt modal
if (getMyUsername()) setMyUsername(getMyUsername());
saveFriends(loadFriends()); // persist the cleanup of any bad entries from past bugs
renderPeerList();
showWhatsNewIfJustUpdated();

// Rust side watches OS window focus and tells us the foreground process's name
// (or null between/outside games) — only fires in the real Tauri app, never in a
// plain browser. We just relay whatever it says to friends; see lib.rs for the
// actual detection and its denylist of non-game processes.
window.__TAURI__?.event?.listen('active-app-changed', (event) => {
  myActivity = typeof event.payload === 'string' ? event.payload : null;
  renderMyActivity();
  scheduleRenderPeerList();
  broadcastActivity();
});

main();
checkForUpdates();
