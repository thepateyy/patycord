import { t, getLanguage, setLanguage, applyStaticTranslations, LANGUAGES } from './i18n.js';
import { enhanceSelect } from './select.js';
import { openMenu, confirmDialog, promptDialog } from './menus.js';
import { loadIdentity, idForKey, isKeyDerivedId, newNonce, signChallenge, verifyChallenge } from './identity.js';

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
const shareActivityToggle = document.getElementById('shareActivityToggle');
const micSelectEl = document.getElementById('micSelect');
const micMeterFillEl = document.getElementById('micMeterFill');
const speakerSelectEl = document.getElementById('speakerSelect');
const speakerTestBtn = document.getElementById('speakerTestBtn');
const pttToggle = document.getElementById('pttToggle');
const closeToTrayToggle = document.getElementById('closeToTrayToggle');
const startWithWindowsToggle = document.getElementById('startWithWindowsToggle');
const notificationsToggle = document.getElementById('notificationsToggle');
const pttKeyRow = document.getElementById('pttKeyRow');
const pttKeyBtn = document.getElementById('pttKeyBtn');
const languageSelectEl = document.getElementById('languageSelect');
const usernameModal = document.getElementById('usernameModal');
const usernameInput = document.getElementById('usernameInput');
const usernameSaveBtn = document.getElementById('usernameSaveBtn');
const copyBtn = document.getElementById('copyBtn');
const peerIdInput = document.getElementById('peerIdInput');
const sendRequestBtn = document.getElementById('sendRequestBtn');
const peerListEl = document.getElementById('peerList');
const pendingListEl = document.getElementById('pendingList');
const muteBtn = document.getElementById('muteBtn');
const deafenBtn = document.getElementById('deafenBtn');
const shareScreenBtn = document.getElementById('shareScreenBtn');
const leaveCallBtn = document.getElementById('leaveCallBtn');
const logToggleBtn = document.getElementById('logToggleBtn');
const logPanel = document.getElementById('logPanel');
const statusEl = document.getElementById('status');
const incomingCallsEl = document.getElementById('incomingCalls');
const toastsEl = document.getElementById('toasts');
const screenGridEl = document.getElementById('screenGrid');
const callTitleEl = document.getElementById('callTitle');
const callParticipantsEl = document.getElementById('callParticipants');
const usernameAvatar = document.getElementById('usernameAvatar');
const mainEl = document.getElementById('main');
const homeBtn = document.getElementById('homeBtn');
const homeBadgeEl = document.getElementById('homeBadge');
const railUnreadEl = document.getElementById('railUnread');
const railAddBtn = document.getElementById('railAddBtn');
const dmSearchEl = document.getElementById('dmSearch');
const friendsNavBtn = document.getElementById('friendsNavBtn');
const friendsNavBadgeEl = document.getElementById('friendsNavBadge');
const dmAddBtn = document.getElementById('dmAddBtn');
const dmListEl = document.getElementById('dmList');
const voicePanelEl = document.getElementById('voicePanel');
const voiceInfoEl = document.getElementById('voiceInfo');
const voiceStatusIconEl = document.getElementById('voiceStatusIcon');
const voiceStatusTextEl = document.getElementById('voiceStatusText');
const voiceSubEl = document.getElementById('voiceSub');
const panelShareBtn = document.getElementById('panelShareBtn');
const panelLeaveBtn = document.getElementById('panelLeaveBtn');
const panelMuteBtn = document.getElementById('panelMuteBtn');
const panelDeafenBtn = document.getElementById('panelDeafenBtn');
const userInfoEl = document.getElementById('userInfo');
const myTagEl = document.getElementById('myTag');
const friendsTabBtns = document.querySelectorAll('.friendsTab');
const pendingTabBadgeEl = document.getElementById('pendingTabBadge');
const noMicBarEl = document.getElementById('noMicBar');
const friendsSearchRowEl = document.getElementById('friendsSearchRow');
const friendsSearchEl = document.getElementById('friendsSearch');
const friendsListLabelEl = document.getElementById('friendsListLabel');
const friendsEmptyEl = document.getElementById('friendsEmpty');
const addFriendPaneEl = document.getElementById('addFriendPane');
const welcomeStepsEl = document.getElementById('welcomeSteps');
const dmHeaderStatusEl = document.getElementById('dmHeaderStatus');
const dmCallBtn = document.getElementById('dmCallBtn');
const callChatToggleBtn = document.getElementById('callChatToggleBtn');
const chatHeaderNameEl = document.getElementById('chatHeaderName');
const attachBtn = document.getElementById('attachBtn');
const fileInputEl = document.getElementById('fileInput');
const typingIndicatorEl = document.getElementById('typingIndicator');
const dropOverlayEl = document.getElementById('dropOverlay');
const chatPaneEl = document.querySelector('.chatPane');
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
let deafened = false; // can't hear anyone, and muted too — see setDeafened
let mutedBeforeDeafen = false;
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
const statusByPeer = new Map(); // peerId -> 'dnd' while a friend has Do Not Disturb on
const voiceStateByPeer = new Map(); // peerId -> { muted, deafened }, for whoever's in the call with us
const peerCaps = new Map(); // peerId -> Set of features their version supports, from their hello (see MY_CAPS)
const typingUntil = new Map(); // peerId -> when their "typing…" runs out
const pendingFriendRequests = new Map(); // peerId -> name, awaiting Accept/Decline
// Populated for real by initSecureStore() before anything else runs (see the bottom
// of this file) — empty here only because loadChatHistories()/loadPendingMessages()
// need secureStore, which is loaded asynchronously and can't be ready yet at the
// point module-level code runs synchronously.
let chatHistories = new Map(); // peerId -> [{ fromId, text }], per-friend DMs — independent of calls, persisted encrypted (see secureStore)
let pendingMessages = new Map(); // peerId -> [{ type, scope, text }], DMs sent while they were offline — flushed once a connection to them opens
let unreadCounts = new Map(); // peerId -> DMs from them not yet seen (their thread wasn't open), persisted like the rest
let openChatPeerId = null; // whichever friend's DM thread is currently showing — set exactly when currentView is 'dm'
let callChatHistory = []; // shared broadcast thread for whoever's in the current call — resets when the call ends, like it always has
let wasInCall = false; // so syncCallState() can detect the moment a call starts or ends

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
  users: icon('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  plus: icon('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
  check: icon('<polyline points="20 6 9 17 4 12"/>'),
  x: icon('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
  at: icon('<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/>'),
  send: icon('<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>'),
  signal: icon('<path d="M2 20h.01"/><path d="M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/><path d="M22 4v16"/>'),
  headphones: icon('<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>'),
  headphonesOff: icon('<path d="M3 18v-6a9 9 0 0 1 14.5-7.1"/><path d="M21 12v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/><line x1="2" y1="2" x2="22" y2="22"/>'),
  pencil: icon('<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>'),
  trash: icon('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
  plusCircle: icon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>'),
  file: icon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'),
  download: icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
  copy: icon('<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  tag: icon('<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>'),
  userMinus: icon('<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/>'),
  upload: icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
  maximize: icon('<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>'),
  minimize: icon('<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>'),
};

// --- secure store --------------------------------------------------
// Everything genuinely sensitive (identity, friends, chat history, queued DMs)
// lives in one encrypted-at-rest blob instead of plain localStorage — see
// secure_store::{load,save}_secure_store in lib.rs. Encrypted with Windows DPAPI,
// which ties the key to the current Windows user account, so a copy of the file
// (or another process reading it directly) can't be decrypted without also being
// that user. Cosmetic prefs (language, noise suppression, screen-share quality,
// ...) aren't worth the complexity and stay in plain localStorage.
const SECURE_STORE_KEYS = ['myId', 'myUsername', 'identityKey', 'friends', 'chatHistories', 'pendingMessages', 'unreadCounts'];
const secureStore = {}; // populated by initSecureStore() before anything else runs
let secureStoreReadOnly = false; // set when the store exists but couldn't be decrypted — see initSecureStore

function readLegacyPlaintextStore() {
  const result = {};
  for (const key of SECURE_STORE_KEYS) {
    const raw = localStorage.getItem(`patycord.${key}`);
    if (raw === null) continue;
    if (key === 'myId' || key === 'myUsername') {
      result[key] = raw; // stored as a bare string, not JSON
    } else {
      try { result[key] = JSON.parse(raw); } catch { /* skip a corrupt entry */ }
    }
  }
  return result;
}

function clearLegacyPlaintextStore() {
  for (const key of SECURE_STORE_KEYS) localStorage.removeItem(`patycord.${key}`);
}

async function initSecureStore() {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) {
    // No Tauri backend to encrypt with (browser-testing via `npm run serve`) — just
    // read the old plaintext keys directly so this path stays testable.
    Object.assign(secureStore, readLegacyPlaintextStore());
    return;
  }
  try {
    Object.assign(secureStore, JSON.parse(await invoke('load_secure_store')));
  } catch (err) {
    // There IS a store, we just couldn't read it — the backend returns "{}" for a
    // genuine first run, so this branch is never that. Carrying on with an empty
    // store would be destructive rather than merely inconvenient: the very next
    // save overwrites the file with {}, and getMyPersistentId() mints a fresh ID,
    // so every friend's saved entry for us goes dead with no way back. Run
    // read-only instead and say so, leaving the file intact for another attempt.
    secureStoreReadOnly = true;
    toast(t('toast.storeUnreadable'));
    log(`secure store load failed: ${err.message || err}`);
    return; // and no legacy migration either — that would write too
  }
  // One-time migration: anything still sitting in plaintext localStorage from
  // before this existed, that the encrypted store doesn't already have, moves over
  // and gets wiped from plaintext.
  const legacy = readLegacyPlaintextStore();
  let migrated = false;
  for (const key of SECURE_STORE_KEYS) {
    if (secureStore[key] !== undefined || legacy[key] === undefined) continue;
    secureStore[key] = legacy[key];
    migrated = true;
  }
  if (migrated) {
    clearLegacyPlaintextStore();
    saveSecureStore();
  }
}

// One invoke in flight at a time, with a single coalesced trailing save behind it.
// saveSecureStore() runs on every chat message, friend change and queued DM, and
// each call hands the backend the whole blob to rewrite — overlapping invokes land
// on Tauri's thread pool and can complete out of order, which would let an older
// snapshot be the one that sticks.
let saveInFlight = null;
let savePending = false;
let secureStoreSaveWarned = false;

function runSecureSave(invoke) {
  const snapshot = JSON.stringify(secureStore); // taken now, so a queued save always persists the latest state rather than a stale one
  saveInFlight = invoke('save_secure_store', { data: snapshot })
    .catch((err) => {
      // A save that never lands is silent data loss, so it's worth surfacing —
      // but once, not on every message.
      if (!secureStoreSaveWarned) {
        secureStoreSaveWarned = true;
        toast(t('toast.storeSaveFailed'));
      }
      log(`secure store save failed: ${err.message || err}`);
    })
    .finally(() => {
      saveInFlight = null;
      if (savePending) { savePending = false; runSecureSave(invoke); }
    });
}

function saveSecureStore() {
  const invoke = window.__TAURI__?.core?.invoke;
  if (invoke) {
    if (secureStoreReadOnly) return; // never overwrite a store we failed to read
    if (saveInFlight) { savePending = true; return; }
    runSecureSave(invoke);
    return;
  }
  // Browser-testing fallback — mirror into plain localStorage.
  for (const key of SECURE_STORE_KEYS) {
    if (secureStore[key] === undefined) continue;
    localStorage.setItem(`patycord.${key}`, key === 'myId' || key === 'myUsername' ? secureStore[key] : JSON.stringify(secureStore[key]));
  }
}

// --- persistent identity & friends list -------------------------------

// initIdentity() sets this up at startup, derived from the identity key; a
// random one is only the fallback if the key couldn't be made.
function getMyPersistentId() {
  if (!secureStore.myId) {
    secureStore.myId = 'p-' + crypto.randomUUID();
    saveSecureStore();
  }
  return secureStore.myId;
}

let myIdentity = null; // { privateKey, publicKey } — see identity.js and "identity verification" below

async function initIdentity() {
  try {
    myIdentity = await loadIdentity(secureStore.identityKey);
    if (myIdentity.stored) secureStore.identityKey = myIdentity.stored;
    // New installs get an ID their key vouches for. Existing ones keep theirs —
    // every friend has it saved.
    if (!secureStore.myId) secureStore.myId = await idForKey(myIdentity.publicKey);
    if (myIdentity.stored) saveSecureStore();
  } catch (err) {
    log(`identity key unavailable: ${err.message || err}`);
  }
}

function getShareActivityEnabled() {
  return localStorage.getItem('patycord.shareActivity') !== 'off'; // on by default, matches getting it in the first place
}

function setShareActivityEnabled(enabled) {
  localStorage.setItem('patycord.shareActivity', enabled ? 'on' : 'off');
  syncActivityDetection();
  broadcastActivity(); // tell anyone already connected right away, rather than waiting for it to next change
}

// Rejects outside the Tauri app (browser testing), like a failed command would.
function tauriInvoke(cmd, args) {
  const invoke = window.__TAURI__?.core?.invoke;
  return invoke ? invoke(cmd, args) : Promise.reject(new Error('not running in the app'));
}

// --- Windows notifications ---------------------------------------------------
// Only while the window isn't in front (in the tray, minimized, or behind a
// game) — otherwise the in-app ringing, banners and toasts already cover it.

function getDesktopNotifications() {
  return localStorage.getItem('patycord.notifications') !== 'off';
}

let flashingForCall = false;

function appInBackground() {
  return document.hidden || !document.hasFocus();
}

function notifyDesktop(title, body) {
  if (!getDesktopNotifications() || getDnd() || !appInBackground()) return;
  tauriInvoke('notify', { title, body }).catch(() => {});
}

// --- Do Not Disturb ----------------------------------------------------------
// No ringing, message sounds, taskbar flashing or Windows notifications — an
// incoming call still pops up, silently — and friends see a red dot.

function getDnd() {
  return localStorage.getItem('patycord.status') === 'dnd';
}

function setDnd(on) {
  if (on) localStorage.setItem('patycord.status', 'dnd');
  else localStorage.removeItem('patycord.status');
  if (on) stopRinging();
  else if (pendingCalls.size) startRinging();
  sendToFriends({ type: 'status', status: outgoingStatus() });
  renderMyStatus();
}

function outgoingStatus() {
  return getDnd() ? 'dnd' : 'online';
}

function renderMyStatus() {
  userInfoEl.querySelector('.dot').className = `dot ${getDnd() ? 'dnd' : 'online'}`;
}

// --- tray ------------------------------------------------------------------
// Closing the window hides it to the tray (lib.rs) unless this is off — you're
// only reachable while patycord runs. On by default.

function getCloseToTray() {
  return localStorage.getItem('patycord.closeToTray') !== 'off';
}

function syncTraySettings() {
  tauriInvoke('set_close_to_tray', { enabled: getCloseToTray() }).catch(() => {});
  tauriInvoke('set_tray_labels', { open: t('tray.open'), quit: t('tray.quit') }).catch(() => {});
}

// The Rust side only scans running processes while sharing is on — see
// set_activity_detection in lib.rs. A no-op outside the Tauri app.
function syncActivityDetection() {
  window.__TAURI__?.core?.invoke('set_activity_detection', { enabled: getShareActivityEnabled() }).catch(() => {});
}

// What to put in outgoing 'hello'/'activity' messages — never the real value
// when sharing is turned off, regardless of what's actually running.
function outgoingActivity() {
  return getShareActivityEnabled() ? myActivity : null;
}

function getNoiseSuppressionEnabled() {
  return localStorage.getItem('patycord.noiseSuppression') !== 'off'; // on by default
}

function setNoiseSuppressionEnabled(enabled) {
  localStorage.setItem('patycord.noiseSuppression', enabled ? 'on' : 'off');
  rnnoiseEnabled = enabled;
  noiseNode?.port.postMessage({ type: 'enabled', value: enabled });
  // Turned on mid-call before RNNoise was ever needed: load it now. Either way
  // re-apply the browser's own suppression, which micConstraints only uses when
  // RNNoise isn't running.
  if (!localStream) return;
  const applyToMic = () => localStream?.getAudioTracks()[0]?.applyConstraints(micConstraints().audio).catch(() => {});
  if (enabled) ensureRnnoise().then(applyToMic);
  else applyToMic();
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
  return secureStore.myUsername || '';
}

function setMyUsername(name) {
  secureStore.myUsername = name;
  saveSecureStore();
  myNameEl.textContent = name;
  myTagEl.textContent = myTagText();
  profileAvatarEl.textContent = initialsFor(name);
  profileAvatarEl.style.background = colorForId(getMyPersistentId());
}

// The "#1234" under your name in the bottom-left corner — the same suffix friends see on your tag.
function myTagText() {
  return `#${getMyPersistentId().slice(-4).toUpperCase()}`;
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
  const friends = Array.isArray(secureStore.friends) ? secureStore.friends : [];
  // Defensively drop any bad entries a past bug might have saved (empty id, etc).
  return friends.filter((f) => f && typeof f.id === 'string' && f.id.trim());
}

function saveFriends(friends) {
  secureStore.friends = friends;
  saveSecureStore();
}

const CHAT_HISTORY_LIMIT = 300; // per peer — plenty for scrollback, bounded so the store can't grow forever

function loadChatHistories() {
  const raw = secureStore.chatHistories && typeof secureStore.chatHistories === 'object' ? secureStore.chatHistories : {};
  return new Map(Object.entries(raw).filter(([id, msgs]) => id && Array.isArray(msgs)));
}

// Files and images are deliberately left out: they only live in memory, for as
// long as patycord is open (see "files" below).
function saveChatHistories() {
  secureStore.chatHistories = Object.fromEntries(
    [...chatHistories].map(([id, msgs]) => [id, msgs.filter((m) => !m.file).slice(-CHAT_HISTORY_LIMIT)])
  );
  saveSecureStore();
}

const PENDING_MESSAGE_LIMIT = 50; // per peer — a permanently-offline/removed friend shouldn't grow this forever

function loadPendingMessages() {
  const raw = secureStore.pendingMessages && typeof secureStore.pendingMessages === 'object' ? secureStore.pendingMessages : {};
  return new Map(Object.entries(raw).filter(([id, msgs]) => id && Array.isArray(msgs)));
}

function savePendingMessages() {
  secureStore.pendingMessages = Object.fromEntries(pendingMessages);
  saveSecureStore();
}

function loadUnreadCounts() {
  const raw = secureStore.unreadCounts && typeof secureStore.unreadCounts === 'object' ? secureStore.unreadCounts : {};
  return new Map(Object.entries(raw).filter(([id, n]) => id && Number.isInteger(n) && n > 0));
}

function setUnread(peerId, count) {
  if ((unreadCounts.get(peerId) || 0) === count) return;
  if (count > 0) unreadCounts.set(peerId, count);
  else unreadCounts.delete(peerId);
  secureStore.unreadCounts = Object.fromEntries(unreadCounts);
  saveSecureStore();
  renderUnreadTitle();
  scheduleRenderPeerList();
}

// "(3) patycord" — visible on the taskbar button and in Alt+Tab.
function renderUnreadTitle() {
  const total = [...unreadCounts.values()].reduce((a, b) => a + b, 0);
  document.title = total ? `(${total}) patycord` : 'patycord';
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
// `key`: their identity key, if a connection from them has already proven it.
function addFriend(id, status = 'accepted', key = null) {
  const friends = loadFriends();
  const existing = friends.find((f) => f.id === id);
  if (existing) {
    if (status === 'accepted' && existing.status === 'pending') {
      existing.status = 'accepted';
      saveFriends(friends);
      renderPeerList();
      probePresence(id); // show them online now, not on the next sweep up to 10s later
    }
    return;
  }
  friends.push({ id, name: remoteNames.get(id) || null, status, ...(key && { key }) });
  saveFriends(friends);
  renderPeerList();
  if (status === 'accepted') probePresence(id);
}

// Someone told us their name (via the data-connection handshake) — update our live
// cache and, if we've saved them as a friend, their stored name too.
function learnName(id, name) {
  // Every presence probe re-announces the same name — only re-render on an actual change.
  if (!name || remoteNames.get(id) === name) return;
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

// Activity strings are already display names ("Counter-Strike 2", not "cs2") —
// lib.rs resolves them against Discord's game list before they ever reach us,
// so there's no 10k-entry lookup table to keep in memory here.
function renderMyActivity() {
  if (myActivity) {
    myActivityEl.textContent = t('friend.playing', { name: myActivity });
    myActivityEl.hidden = false;
  } else {
    myActivityEl.hidden = true;
  }
  myTagEl.hidden = !!myActivity;
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
  sendToFriends({ type: 'activity', activity: outgoingActivity() });
}

// To every friend we have a live, identity-checked connection to.
function sendToFriends(msg) {
  for (const [id, conn] of dataConnections) {
    if (conn.open && isTrusted(conn) && acceptedFriends().some((f) => f.id === id)) conn.send(msg);
  }
}

function removeFriend(id) {
  saveFriends(loadFriends().filter((f) => f.id !== id));
  presence.delete(id); // only ever meaningful for someone on the friends list
  activityByPeer.delete(id);
  chatHistories.delete(id);
  saveChatHistories();
  pendingMessages.delete(id);
  savePendingMessages();
  setUnread(id, 0);
  if (openChatPeerId === id) { openChatPeerId = null; currentView = 'friends'; }
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

// A running AudioContext keeps an output stream open and its render thread
// ticking even while silent, so it's suspended again shortly after the last
// tone instead of idling for the rest of the session after the first blip.
let uiSoundCtx = null;
let uiSoundIdleTimer = null;
function playTone(freq, durationMs, { type = 'sine', gain = 0.15, delayMs = 0 } = {}) {
  try {
    if (!uiSoundCtx) {
      uiSoundCtx = new (window.AudioContext || window.webkitAudioContext)();
      applySpeakerTo(uiSoundCtx);
    }
    if (uiSoundCtx.state === 'suspended') uiSoundCtx.resume();
    clearTimeout(uiSoundIdleTimer);
    uiSoundIdleTimer = setTimeout(() => uiSoundCtx.suspend().catch(() => {}), delayMs + durationMs + 1000);
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

// A soft two-note blip for a message you're not looking at right now.
function playMessageSound() {
  if (getDnd()) return;
  playTone(880, 90, { gain: 0.09 });
  playTone(1320, 140, { gain: 0.09, delayMs: 85 });
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

// Ringback for the caller's side — mirrors startRinging/stopRinging above but for
// calls we placed ourselves that haven't connected yet (falling two-tone, vs. the
// incoming ring's rising one, so the two are distinguishable by ear). Kept in sync
// from wireCall/attachRemoteStream/removeCall, the three places a call's "dialing"
// state (has a `call`, no `audioEl` yet) can change.
let outgoingRingInterval = null;
function playOutgoingRing() {
  playTone(660, 220, { gain: 0.16 });
  playTone(520, 220, { gain: 0.16, delayMs: 220 });
}
function updateOutgoingRingState() {
  const dialing = [...calls.values()].some((entry) => entry.outgoing && entry.call && !entry.audioEl);
  if (dialing && !outgoingRingInterval) {
    playOutgoingRing();
    outgoingRingInterval = setInterval(playOutgoingRing, 2000);
  } else if (!dialing && outgoingRingInterval) {
    clearInterval(outgoingRingInterval);
    outgoingRingInterval = null;
  }
}

// --- UI ------------------------------------------------------------

// Capped so an all-day call doesn't grow this into an unbounded string — old
// entries just fall off the end instead of piling up for the life of the process.
const LOG_LIMIT = 200;
let logLines = [];
function log(msg) {
  logLines.unshift(`[${new Date().toLocaleTimeString()}] ${msg}`);
  if (logLines.length > LOG_LIMIT) logLines.length = LOG_LIMIT;
  if (!logPanel.hidden) renderLog(); // otherwise rendered when the panel is opened
}

function renderLog() {
  statusEl.textContent = logLines.join('\n');
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

// --- views -----------------------------------------------------------------
// Laid out like Discord: a rail, a sidebar with your DMs and yourself, and a
// main panel showing exactly one of the Friends page (Online / All / Pending /
// Add Friend), one friend's DMs, or the call. openChatPeerId is set exactly
// when it's showing DMs.

let currentView = 'friends'; // 'friends' | 'dm' | 'call'
let friendsTab = 'online'; // 'online' | 'all' | 'pending' | 'add' — init() opens on Add Friend until there's someone to list
let viewBeforeCall = null; // the friend whose DMs were open when the call started, to go back to once it ends
let callChatOpen = true;
let dmFilter = '';
let friendsFilter = '';

function showFriends(tab = friendsTab) {
  openChatPeerId = null;
  currentView = 'friends';
  friendsTab = tab;
  renderPeerList();
  if (tab === 'add') peerIdInput.focus();
}

function showCallView() {
  if (calls.size === 0) return;
  enterCallView();
  renderPeerList();
}

// The state change alone, without a render — for syncCallState, which runs mid-render.
function enterCallView() {
  openChatPeerId = null;
  currentView = 'call';
  showCallChat();
}

function renderView() {
  mainEl.dataset.view = currentView;
  mainEl.classList.toggle('callChatHidden', !callChatOpen);
  callChatToggleBtn.classList.toggle('on', callChatOpen);
  friendsNavBtn.classList.toggle('active', currentView === 'friends');
  for (const btn of friendsTabBtns) btn.classList.toggle('active', btn.dataset.tab === friendsTab);
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

// Removing a friend also wipes your chat history with them, so the × asks
// "Remove?" first and only a second click within a few seconds goes through.
// Tracked here rather than on the button because the list re-renders on every
// presence sweep, which would otherwise reset it mid-confirm.
let confirmRemoveId = null;
let confirmRemoveTimer = null;
function requestRemoveFriend(id) {
  clearTimeout(confirmRemoveTimer);
  if (confirmRemoveId === id) {
    confirmRemoveId = null;
    removeFriend(id);
    return;
  }
  confirmRemoveId = id;
  confirmRemoveTimer = setTimeout(() => { confirmRemoveId = null; renderPeerList(); }, 3000);
  renderPeerList();
}

function friendStatusHtml({ inCall, connected, isOnline, activity, dnd }) {
  if (inCall) return `<span class="status online">${connected ? t('status.inCall') : t('status.calling')}</span>`;
  if (activity) return `<span class="activity">${escapeHtml(t('friend.playing', { name: activity }))}</span>`;
  if (dnd) return `<span class="status dnd">${t('status.dnd')}</span>`;
  return `<span class="status${isOnline ? ' online' : ''}">${isOnline ? t('status.online') : t('status.offline')}</span>`;
}

function dotHtml({ isOnline, dnd }) {
  return `<span class="dot${dnd ? ' dnd' : isOnline ? ' online' : ''}"></span>`;
}

function badgeText(n) {
  return n > 99 ? '99+' : String(n);
}

function matchesFilter(name, filter) {
  return name.toLowerCase().includes(filter.trim().toLowerCase());
}

function lastMessageAt(id) {
  return chatHistories.get(id)?.at(-1)?.ts || 0;
}

function friendRows() {
  const rows = acceptedFriends().map((friend) => {
    const inCall = calls.has(friend.id);
    const connected = !!calls.get(friend.id)?.audioEl; // stream actually flowing, not just dialing
    const isOnline = connected || !!presence.get(friend.id);
    return {
      id: friend.id, name: nameFor(friend), inCall, connected, isOnline,
      activity: isOnline ? activityByPeer.get(friend.id) : null,
      dnd: isOnline && statusByPeer.get(friend.id) === 'dnd',
      unread: unreadCounts.get(friend.id) || 0,
    };
  });
  // Whoever you can actually talk to right now goes to the top: in the call,
  // then online, then offline — alphabetical within each.
  const rank = (r) => (r.inCall ? 0 : r.isOnline ? 1 : 2);
  return rows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

function renderPeerList() {
  syncCallState(); // first, so a call starting or ending switches the view before anything draws
  renderTyping();
  const rows = friendRows();
  renderDmList(rows);
  renderRail(rows);
  renderFriendsPage(rows);
  renderDmHeader(rows);
  renderCallPanel();
}

// The sidebar's conversations — most recent first, like Discord.
function renderDmList(rows) {
  dmListEl.innerHTML = '';
  if (!rows.length) {
    dmListEl.innerHTML = `<li class="dmEmpty">${t('nav.noDms')}</li>`;
    return;
  }
  const sorted = [...rows].sort((a, b) => (b.inCall - a.inCall) || lastMessageAt(b.id) - lastMessageAt(a.id)
    || (b.isOnline - a.isOnline) || a.name.localeCompare(b.name));
  for (const r of sorted.filter((row) => matchesFilter(row.name, dmFilter))) {
    const li = document.createElement('li');
    li.className = 'dmRow' + (r.id === openChatPeerId ? ' active' : '') + (r.unread ? ' unread' : '') + (r.isOnline ? '' : ' offline');
    li.title = tagFor(r.id, r.name);
    li.innerHTML = `
      <span class="avatarWrap">${avatarHtml(r.id, r.name)}${dotHtml(r)}</span>
      <span class="who-text">
        <span class="name">${escapeHtml(r.name)}</span>
        ${friendStatusHtml(r)}
      </span>
      ${r.unread ? `<span class="unreadBadge">${badgeText(r.unread)}</span>` : ''}`;
    li.addEventListener('click', () => openChatWith(r.id));
    li.addEventListener('contextmenu', (e) => showFriendMenu(e, r.id));
    dmListEl.appendChild(li);
  }
}

// Friend requests waiting on you badge the rail's home button, the Friends nav
// item and the Pending tab; friends with unread DMs get their own rail button.
function renderRail(rows) {
  const requests = pendingFriendRequests.size;
  for (const el of [homeBadgeEl, friendsNavBadgeEl, pendingTabBadgeEl]) {
    el.hidden = !requests;
    el.textContent = badgeText(requests);
  }
  railUnreadEl.innerHTML = '';
  for (const r of rows.filter((row) => row.unread).slice(0, 5)) {
    const btn = document.createElement('button');
    btn.className = 'railBtn avatarBtn';
    btn.title = r.name;
    btn.innerHTML = `${avatarHtml(r.id, r.name)}<span class="railBadge">${badgeText(r.unread)}</span>`;
    btn.addEventListener('click', () => openChatWith(r.id));
    btn.addEventListener('contextmenu', (e) => showFriendMenu(e, r.id));
    railUnreadEl.appendChild(btn);
  }
}

function renderFriendsPage(rows) {
  const tab = friendsTab;
  const listTab = tab === 'online' || tab === 'all';
  noMicBarEl.hidden = !micAccessFailed;
  if (micAccessFailed) noMicBarEl.innerHTML = `<strong>${t('main.noMicTitle')}</strong> — ${t('main.noMic')}`;
  pendingListEl.hidden = tab !== 'pending';
  addFriendPaneEl.hidden = tab !== 'add';
  friendsSearchRowEl.hidden = !listTab;
  friendsListLabelEl.hidden = tab === 'add';
  renderWelcomeSteps(rows.length === 0);
  peerListEl.innerHTML = '';
  pendingListEl.innerHTML = '';

  let empty = null;
  if (listTab) {
    const inTab = tab === 'online' ? rows.filter((r) => r.isOnline || r.inCall) : rows;
    const shown = inTab.filter((r) => matchesFilter(r.name, friendsFilter));
    friendsListLabelEl.textContent = t(tab === 'online' ? 'friends.onlineCount' : 'friends.allCount', { count: shown.length });
    for (const r of shown) peerListEl.appendChild(friendRowEl(r));
    if (!rows.length) empty = 'noFriends';
    else if (!inTab.length) empty = 'noneOnline';
    else if (!shown.length) empty = 'noMatch';
  } else if (tab === 'pending') {
    const outgoing = pendingOutgoingFriends();
    friendsListLabelEl.textContent = t('friends.pendingCount', { count: pendingFriendRequests.size + outgoing.length });
    for (const [id, name] of pendingFriendRequests) pendingListEl.appendChild(pendingRowEl(id, name || t('unknown'), true));
    for (const friend of outgoing) pendingListEl.appendChild(pendingRowEl(friend.id, nameFor(friend), false));
    if (!pendingFriendRequests.size && !outgoing.length) empty = 'noPending';
  }
  peerListEl.hidden = !listTab || !!empty;
  if (empty) pendingListEl.hidden = true;
  renderFriendsEmpty(empty);
}

function friendRowEl({ id, name, inCall, connected, isOnline, activity, dnd, unread }) {
  const confirming = confirmRemoveId === id;
  const li = document.createElement('li');
  li.className = 'friendRow';
  li.innerHTML = `
    <span class="who">
      <span class="avatarWrap">${avatarHtml(id, name)}${dotHtml({ isOnline, dnd })}</span>
      <span class="who-text">
        <span class="nameLine"><span class="name">${escapeHtml(name)}</span><span class="tagHash">#${escapeHtml(id.slice(-4).toUpperCase())}</span></span>
        ${friendStatusHtml({ inCall, connected, isOnline, activity, dnd })}
      </span>
    </span>
    <span class="actions">
      ${confirming ? '' : `
      <button class="roundBtn chatToggleBtn" title="${isOnline ? t('friends.message') : t('sidebar.chatOffline')}">${ICONS.chat}${unread ? `<span class="unreadBadge">${badgeText(unread)}</span>` : ''}</button>
      ${inCall || isOnline ? `<button class="roundBtn callToggleBtn${inCall ? ' hangupBtn' : ''}" title="${inCall ? (connected ? t('sidebar.hangUp') : t('sidebar.cancel')) : t('sidebar.call')}">${inCall ? ICONS.phoneOff : ICONS.phone}</button>` : ''}`}
      <button class="roundBtn removeBtn${confirming ? ' confirm' : ''}" title="${t('sidebar.remove')}">${confirming ? t('sidebar.removeConfirm') : ICONS.x}</button>
    </span>`;
  li.addEventListener('click', (e) => { if (!e.target.closest('button')) openChatWith(id); });
  li.addEventListener('contextmenu', (e) => showFriendMenu(e, id));
  li.querySelector('.chatToggleBtn')?.addEventListener('click', () => openChatWith(id));
  li.querySelector('.callToggleBtn')?.addEventListener('click', () => {
    if (calls.has(id)) hangUp(id);
    else connectTo(id);
  });
  li.querySelector('.removeBtn').addEventListener('click', () => requestRemoveFriend(id));
  return li;
}

// `incoming`: someone asking us (Accept/Decline), vs. a request we sent that
// they haven't answered yet (Cancel).
function pendingRowEl(id, name, incoming) {
  const li = document.createElement('li');
  li.className = 'friendRow pendingRow' + (incoming ? ' incoming' : '');
  li.innerHTML = `
    <span class="who" title="${escapeHtml(tagFor(id, name))}">
      <span class="avatarWrap">${avatarHtml(id, name)}</span>
      <span class="who-text">
        <span class="nameLine"><span class="name">${escapeHtml(name)}</span><span class="tagHash">#${escapeHtml(id.slice(-4).toUpperCase())}</span></span>
        <span class="status">${incoming ? t('friends.incomingRequest') : t('sidebar.waiting')}</span>
      </span>
    </span>
    <span class="actions">
      ${incoming ? `<button class="roundBtn acceptBtn" title="${t('accept')}">${ICONS.check}</button>` : ''}
      <button class="roundBtn declineBtn" title="${incoming ? t('decline') : t('sidebar.cancelRequest')}">${ICONS.x}</button>
    </span>`;
  if (!incoming) {
    li.querySelector('.declineBtn').addEventListener('click', () => removeFriend(id));
    return li;
  }
  const rawName = pendingFriendRequests.get(id);
  li.querySelector('.acceptBtn').addEventListener('click', () => {
    pendingFriendRequests.delete(id);
    learnName(id, rawName);
    const conn = dataConnections.get(id);
    addFriend(id, 'accepted', conn?.auth === 'verified' ? conn.theirKey : null);
    dataConnections.get(id)?.send({ type: 'friend-accept' });
    toast(t('toast.addedFriend', { name: rawName || t('them') }), 'info');
    renderPeerList();
  });
  li.querySelector('.declineBtn').addEventListener('click', () => {
    pendingFriendRequests.delete(id);
    dataConnections.get(id)?.send({ type: 'friend-decline' });
    renderPeerList();
  });
  return li;
}

// Only rebuilt when what it says changes (renderPeerList runs on every presence
// sweep); applyLanguage resets friendsEmptyKind to force a rebuild in the new language.
let friendsEmptyKind = null;
function renderFriendsEmpty(kind) {
  friendsEmptyEl.hidden = !kind;
  const key = kind === 'noMatch' ? `noMatch:${friendsFilter}` : kind;
  if (!kind || key === friendsEmptyKind) return;
  friendsEmptyKind = key;
  const art = (svg) => `<div class="emptyArt">${svg}</div>`;
  if (kind === 'noFriends') {
    friendsEmptyEl.innerHTML = `${art(ICONS.users)}<h3>${t('friends.noFriends')}</h3><p>${t('friends.noFriendsDesc')}</p>
      <button class="emptyAddBtn">${t('friends.add')}</button>`;
    friendsEmptyEl.querySelector('.emptyAddBtn').addEventListener('click', () => showFriends('add'));
  } else if (kind === 'noneOnline') {
    friendsEmptyEl.innerHTML = `${art(ICONS.users)}<h3>${t('friends.noneOnline')}</h3><p>${t('friends.noneOnlineDesc')}</p>`;
  } else if (kind === 'noPending') {
    friendsEmptyEl.innerHTML = `${art(ICONS.check)}<p>${t('friends.noPending')}</p>`;
  } else {
    friendsEmptyEl.innerHTML = `<p>${escapeHtml(t('friends.noMatch', { query: friendsFilter.trim() }))}</p>`;
  }
}

// Under Add Friend until you have your first friend — how the whole thing works.
function renderWelcomeSteps(show) {
  if (!show) { welcomeStepsEl.innerHTML = ''; return; }
  if (welcomeStepsEl.childElementCount) return;
  const step = (n, title, desc) => `
    <li><span class="stepNum">${n}</span><span>${title}<small>${desc}</small></span></li>`;
  welcomeStepsEl.innerHTML = `
    <h3>${t('friends.howItWorks')}</h3>
    <ol class="steps">
      ${step(1, t('main.step1'), t('main.step1Desc'))}
      ${step(2, t('main.step2'), t('main.step2Desc'))}
      ${step(3, t('main.step3'), t('main.step3Desc'))}
    </ol>`;
}

function renderDmHeader(rows) {
  if (currentView !== 'dm') return;
  const id = openChatPeerId;
  const row = rows.find((r) => r.id === id);
  chatHeaderNameEl.textContent = friendName(id);
  dmHeaderStatusEl.innerHTML = row ? `${dotHtml(row)}${friendStatusHtml(row)}` : '';
  const inCall = calls.has(id);
  dmCallBtn.hidden = !inCall && !row?.isOnline;
  dmCallBtn.classList.toggle('inCall', inCall);
  dmCallBtn.title = inCall ? t('dm.goToCall') : t('sidebar.call');
}

// Notices the moment a call starts or ends, whatever caused it. Starting or
// answering one is always something you just did, so it takes you to the call;
// when it ends you go back to the DMs you were in, or the Friends page.
function syncCallState() {
  const inCall = calls.size > 0;
  if (inCall === wasInCall) return;
  wasInCall = inCall;
  if (inCall) {
    startMic(); startSpeakingWatch(); syncPushToTalk();
    viewBeforeCall = currentView === 'dm' ? openChatPeerId : null;
    enterCallView();
    return;
  }
  stopMic(); stopSpeakingWatch(); syncPushToTalk();
  if (screenStream) stopScreenShare(); // no one left to send it to
  callChatHistory = []; // call chat ends with the call, like it always has
  if (currentView === 'call') {
    if (viewBeforeCall && acceptedFriends().some((f) => f.id === viewBeforeCall)) enterDm(viewBeforeCall);
    else currentView = 'friends';
  }
  viewBeforeCall = null;
}

function tileColorForId(id) {
  return `hsl(${hashHue(id)}, 32%, 20%)`;
}

// The call view's tiles, one per person (you first), plus the sidebar's
// "Voice connected" panel that gets you back here from anywhere.
function renderCallPanel() {
  syncCallState();
  closeVolumePopover(); // tile buttons are about to be torn down and rebuilt
  const inCall = calls.size > 0;
  callTitleEl.hidden = !inCall;
  callTitleEl.textContent = t('main.inCall', { count: calls.size + 1 }); // +1 for us
  callParticipantsEl.innerHTML = '';

  if (inCall) {
    const me = document.createElement('div');
    me.className = 'participant' + (speakingNow.has(SELF) ? ' speaking' : '');
    me.dataset.peerId = SELF;
    me.style.setProperty('--tile', tileColorForId(getMyPersistentId()));
    me.innerHTML = `
      ${avatarHtml(getMyPersistentId(), getMyUsername())}
      <span class="tileLabel">
        ${voiceIconsHtml({ muted, deafened })}
        <span class="pname">${escapeHtml(getMyUsername())}</span>
        <span class="sub">${deafened ? t('main.deafened') : muted ? t('main.muted') : pushToTalkActive() ? t('main.pttHint', { key: escapeHtml(getPttKey().label) }) : t('main.you')}</span>
      </span>`;
    callParticipantsEl.appendChild(me);
  }

  for (const [id, entry] of calls) {
    const name = friendName(id);
    const div = document.createElement('div');
    div.className = 'participant' + (entry.audioEl ? '' : ' dialing') + (speakingNow.has(id) ? ' speaking' : '');
    div.dataset.peerId = id;
    div.style.setProperty('--tile', tileColorForId(id));
    div.innerHTML = `
      ${avatarHtml(id, name)}
      <span class="tileLabel">
        ${voiceIconsHtml(voiceStateByPeer.get(id) || {})}
        <span class="pname">${escapeHtml(name)}</span>
        ${!entry.audioEl ? `<span class="sub">${t('main.calling')}</span>`
          : voiceStateByPeer.get(id)?.deafened ? `<span class="sub">${t('main.deafened')}</span>`
          : voiceStateByPeer.get(id)?.muted ? `<span class="sub">${t('main.muted')}</span>` : ''}
      </span>
      ${entry.audioEl ? `<button class="volumeBtn" title="${t('main.volume')}"></button>` : ''}`;
    if (entry.audioEl) {
      const volumeBtn = div.querySelector('.volumeBtn');
      updateVolumeIcon(volumeBtn, entry.audioEl.volume);
      volumeBtn.addEventListener('click', () => toggleVolumePopover(id, entry.audioEl, volumeBtn));
    }
    callParticipantsEl.appendChild(div);
  }

  voicePanelEl.hidden = !inCall;
  if (inCall) {
    const anyConnected = [...calls.values()].some((entry) => entry.audioEl);
    voicePanelEl.classList.toggle('dialing', !anyConnected);
    voiceStatusTextEl.textContent = anyConnected ? t('voice.connected') : t('status.calling');
    voiceSubEl.textContent = [...calls.keys()].map(friendName).join(', ');
  }
  renderView();
}

function voiceIconsHtml({ muted: isMuted, deafened: isDeafened }) {
  if (isDeafened) return `<span class="voiceIcons">${ICONS.headphonesOff}</span>`;
  return isMuted ? `<span class="voiceIcons">${ICONS.micOff}</span>` : '';
}

function renderMuteButtons() {
  for (const btn of [muteBtn, panelMuteBtn]) {
    btn.title = muted ? t('main.unmute') : t('main.mute');
    btn.classList.toggle('active', muted);
    btn.innerHTML = muted ? ICONS.micOff : ICONS.mic;
  }
  for (const btn of [deafenBtn, panelDeafenBtn]) {
    btn.title = deafened ? t('main.undeafen') : t('main.deafen');
    btn.classList.toggle('active', deafened);
    btn.innerHTML = deafened ? ICONS.headphonesOff : ICONS.headphones;
  }
}

// Deafening silences everyone else (calls and screen-share audio) and mutes
// you too, like Discord; undeafening puts your mute back how it was.
function setDeafened(on) {
  if (on === deafened) return;
  deafened = on;
  if (on) { mutedBeforeDeafen = muted; muted = true; }
  else muted = mutedBeforeDeafen;
  applyTransmitState();
  applyDeafen();
  renderMuteButtons();
  playMuteSound(on);
  renderCallPanel();
  sendVoiceState();
}

function applyDeafen() {
  for (const entry of calls.values()) if (entry.audioEl) entry.audioEl.muted = deafened;
  for (const tile of screenTiles.values()) tile.videoEl.muted = deafened;
}

// Lets everyone in the call show whether we're muted or deafened.
function sendVoiceState(onlyTo = null) {
  const msg = { type: 'voice-state', muted, deafened };
  for (const id of onlyTo ? [onlyTo] : calls.keys()) {
    const conn = dataConnections.get(id);
    if (conn?.open && isTrusted(conn)) conn.send(msg);
  }
}

function renderShareButtons() {
  for (const btn of [shareScreenBtn, panelShareBtn]) {
    btn.title = screenStream ? t('main.stopSharing') : t('main.shareScreen');
    btn.classList.toggle('sharing', !!screenStream);
  }
}

// --- who's talking ------------------------------------------------------
// A green ring around whoever's speaking, ourselves included. Each participant's
// audio (and our own outgoing audio, via micOut) feeds an AnalyserNode that's
// read ten times a second, only while we're in a call. A short hold keeps the
// ring from flickering between words.

const SELF = 'self';
const SPEAKING_THRESHOLD_DB = -50;
const SPEAKING_HOLD_MS = 300;
const speakingAnalysers = new Map(); // peerId (or SELF) -> { analyser, samples }
const speakingNow = new Set();
const lastHeardAt = new Map();
let speakingWatchTimer = null;

function makeAnalyser(sourceNode) {
  const analyser = sourceNode.context.createAnalyser();
  analyser.fftSize = 512;
  sourceNode.connect(analyser);
  return { analyser, samples: new Float32Array(analyser.fftSize) };
}

function levelDb({ analyser, samples }) {
  analyser.getFloatTimeDomainData(samples);
  let sum = 0;
  for (const s of samples) sum += s * s;
  return 20 * Math.log10(Math.sqrt(sum / samples.length) || 1e-6);
}

function startSpeakingWatch() {
  if (speakingWatchTimer) return;
  speakingWatchTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, a] of speakingAnalysers) {
      if (levelDb(a) > SPEAKING_THRESHOLD_DB) lastHeardAt.set(id, now);
      const speaking = now - (lastHeardAt.get(id) || 0) < SPEAKING_HOLD_MS;
      if (speaking === speakingNow.has(id)) continue;
      if (speaking) speakingNow.add(id);
      else speakingNow.delete(id);
      callParticipantsEl.querySelector(`.participant[data-peer-id="${CSS.escape(id)}"]`)?.classList.toggle('speaking', speaking);
    }
  }, 100);
}

function stopSpeakingWatch() {
  clearInterval(speakingWatchTimer);
  speakingWatchTimer = null;
  speakingNow.clear();
  lastHeardAt.clear();
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
  enhanceSelect(resSelect);
  enhanceSelect(fpsSelect);

  resSelect.addEventListener('change', () => setScreenShareResolution(resSelect.value));
  fpsSelect.addEventListener('change', () => setScreenShareFps(fpsSelect.value));
  startBtn.addEventListener('click', () => {
    closeScreenSharePopover();
    startScreenShare();
  });

  const rect = anchorEl.getBoundingClientRect();
  screenSharePopoverEl.hidden = false;
  const popRect = screenSharePopoverEl.getBoundingClientRect();
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - popRect.width / 2), window.innerWidth - popRect.width - 8);
  screenSharePopoverEl.style.left = `${Math.round(left)}px`;
  screenSharePopoverEl.style.top = `${Math.round(rect.top - popRect.height - 8)}px`;
}

document.addEventListener('click', (e) => {
  if (screenSharePopoverEl.hidden) return;
  if (screenSharePopoverEl.contains(e.target) || e.target.closest('.shareScreenTrigger')) return;
  closeScreenSharePopover();
});

function attachRemoteStream(peerId, stream) {
  const audio = new Audio();
  applySpeakerTo(audio);
  audio.srcObject = stream;
  audio.autoplay = true;
  audio.muted = deafened;
  const entry = calls.get(peerId) || {};
  entry.audioEl = audio;
  if (audioCtx) {
    const source = audioCtx.createMediaStreamSource(stream);
    speakingAnalysers.set(peerId, makeAnalyser(source));
    entry.analyserSource = source;
  }
  calls.set(peerId, entry);
  updateOutgoingRingState();
  renderPeerList();
  sendVoiceState(peerId);
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
  entry?.analyserSource?.disconnect();
  speakingAnalysers.delete(peerId);
  speakingNow.delete(peerId);
  voiceStateByPeer.delete(peerId);
  calls.delete(peerId);
  updateOutgoingRingState();
  renderPeerList();
  log(t('log.disconnected', { id: peerId }));
}

function wireCall(call, { outgoing = false } = {}) {
  const entry = calls.get(call.peer) || {};
  entry.call = call;
  if (outgoing) entry.outgoing = true; // so updateOutgoingRingState only rings back for calls *we* placed
  calls.set(call.peer, entry);
  updateOutgoingRingState();
  renderPeerList();

  call.on('stream', (remoteStream) => attachRemoteStream(call.peer, remoteStream));
  call.on('close', () => removeCall(call.peer));
  call.on('error', (err) => { toast(t('toast.callFailed', { name: friendName(call.peer), error: err })); removeCall(call.peer); });
}

// Drops `id`'s entry only if `conn` is still the connection we have on file for
// them. A peer can end up with a second connection replacing the first in the map
// (a presence probe racing a real connection, a reconnect, both sides dialing at
// once) — and then the *older* one closing moments later would otherwise delete
// the live entry, after which every dataConnections.get(id)?.send(...) silently
// no-ops: call chat stops arriving and activity broadcasts stop going out, with
// nothing logged to explain it.
function removeDataConnection(id, conn) {
  if (dataConnections.get(id) === conn) dataConnections.delete(id);
}

// Opens (if needed) the data connection used for roster exchange and chat with `id`.
function ensureDataConnection(id) {
  if (dataConnections.has(id)) return dataConnections.get(id);
  const conn = peer.connect(id);
  wireIdentityCheck(conn, id); // queued DMs go out once it passes — see settleIdentity
  conn.on('open', () => conn.send(myHello(conn)));
  conn.on('error', () => {}); // connectivity errors surface via the call itself
  conn.on('close', () => removeDataConnection(id, conn));
  dataConnections.set(id, conn);
  return conn;
}

// Tells `id` "I added you" so they get an Accept prompt instead of having to
// separately paste your ID back — only one side needs to do the copy/paste dance.
// If they're offline right now it doesn't arrive, but retryFriendRequest keeps
// re-sending it from the presence sweep until it does.
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
  wireCall(call, { outgoing: true });

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

// An accepted friend can act as a discovery hub for whoever joins through their ID:
// when one connects to us, we hand them the list of everyone already in the call
// (our current `calls`), and they take it from there — calling each one directly.
// Existing peers don't need to act on this; they'll just receive an incoming call
// from the new joiner and auto-answer, same as any other call.
//
// Anyone else who connects (an incoming call or friend request, typically) still
// gets a `hello` — so e.g. an incoming call shows a readable name instead of a raw
// ID — but never the roster or activity: peer IDs are unguessable, but there's no
// reason to hand a stranger who's in a call with us, or let them make us auto-dial
// whatever list of IDs they feel like sending. And a friend gets them only once
// they've proven they really are that friend (see settleIdentity).
//
// A presence probe (see probePresence) only gets the `hello`: it's torn down again
// within a second, so it mustn't displace a real connection in dataConnections,
// count as someone joining the call, or be handed queued DMs — the prober only
// reads the hello off it, so anything else sent there would just be lost.
function handleIncomingDataConnection(conn) {
  const isProbe = conn.metadata?.probe === true;
  wireIdentityCheck(conn, conn.peer, {
    probe: isProbe,
    onTrusted: () => {
      if (!acceptedFriends().some((f) => f.id === conn.peer)) return;
      if (isProbe) {
        // Can't hand queued DMs over the probe itself — open a real connection for them instead.
        if (pendingMessages.get(conn.peer)?.length) ensureDataConnection(conn.peer);
        return;
      }
      const roster = [...calls.keys()].filter((id) => id !== conn.peer);
      conn.send({ type: 'roster', peers: roster });
      for (const [otherId, otherConn] of dataConnections) {
        if (otherId !== conn.peer) otherConn.send({ type: 'peer-joined', id: conn.peer });
      }
    },
  });
  conn.on('open', () => {
    conn.send(myHello(conn));
    if (!isProbe) dataConnections.set(conn.peer, conn);
  });
  conn.on('close', () => removeDataConnection(conn.peer, conn));
}

// --- identity verification -----------------------------------------------
// Peer IDs are shared openly (that's how you add a friend), and the signaling
// broker lets whoever's online claim any free ID — so the ID a connection comes
// from proves nothing on its own. Every data connection therefore starts with
// both sides putting their public key and a fresh random challenge in their
// hello, and signing the other side's challenge (see identity.js). Nothing else
// on the connection is acted on until that settles:
//  - 'verified': they hold the key for that ID. A friend's key is remembered the
//    first time we see it — when the friendship starts, or for friends from
//    before keys existed, their first connection since — and from then on only
//    that key will do. IDs minted since keys exist are derived from the key, so
//    even a first contact is checked against the ID itself.
//  - 'legacy': their version predates keys (no key in their hello) — let
//    through as before, so friends who haven't updated yet still work. Never
//    for an ID whose key we already know, or a key-derived ID.
//  - 'failed': anything else. The connection is dropped, and if it claimed to
//    be a friend we're calling, so is the call.

const IDENTITY_TIMEOUT_MS = 10000;

// What this version understands beyond plain messages, so newer features are
// only ever sent to someone who'll know what to do with them.
const MY_CAPS = ['edit', 'files', 'typing', 'status', 'voice'];

function myHello(conn) {
  return { type: 'hello', name: getMyUsername(), acks: true, key: myIdentity?.publicKey, nonce: conn.myNonce, caps: MY_CAPS };
}

function isTrusted(conn) {
  return conn.auth === 'verified' || conn.auth === 'legacy';
}

// The live connection to `id` whose identity check passed, if there is one.
function trustedConn(id) {
  const conn = dataConnections.get(id);
  return conn?.open && isTrusted(conn) ? conn : null;
}

// `onTrusted` runs once the check passes, for what only that kind of
// connection does (an incoming one sends its roster, a probe ends the probe);
// `onFailed` once it doesn't.
function wireIdentityCheck(conn, id, { probe = false, onTrusted = null, onFailed = null } = {}) {
  conn.auth = 'pending';
  conn.backlog = []; // messages that arrive before the check settles, replayed after
  conn.myNonce = newNonce();
  conn.isProbe = probe;
  conn.onTrusted = onTrusted;
  conn.onFailed = onFailed;
  conn.on('open', () => {
    conn.identityTimer = setTimeout(() => settleIdentity(conn, id, 'failed', 'timeout'), IDENTITY_TIMEOUT_MS);
  });
  conn.on('data', (msg) => {
    // Everything here comes straight off the wire from another peer, and PeerJS
    // will happily decode and deliver a bare null or string.
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'hello') { receiveHello(conn, id, msg); return; }
    if (msg.type === 'auth') { receiveAuth(conn, id, msg); return; }
    if (conn.auth === 'pending') { if (conn.backlog.length < 100) conn.backlog.push(msg); return; }
    if (isTrusted(conn)) handleDataMessage(id, msg);
  });
}

async function receiveHello(conn, id, msg) {
  if (conn.helloMsg) return; // only the first one counts
  conn.helloMsg = msg;
  try {
    // Answer their challenge whatever we make of them: the signature is bound to
    // their ID and ours, so it's no use to anyone but them.
    if (myIdentity && typeof msg.nonce === 'string' && msg.nonce.length <= 64) {
      const sig = await signChallenge(myIdentity.privateKey, msg.nonce, getMyPersistentId(), id);
      if (conn.open) conn.send({ type: 'auth', sig });
    }
    const friend = loadFriends().find((f) => f.id === id);
    const key = typeof msg.key === 'string' && msg.key.length <= 400 ? msg.key : null;
    if (!key) {
      if (friend?.key || isKeyDerivedId(id)) settleIdentity(conn, id, 'failed', 'no key');
      else settleIdentity(conn, id, 'legacy');
      return;
    }
    if (isKeyDerivedId(id) && (await idForKey(key)) !== id) { settleIdentity(conn, id, 'failed', "key doesn't match ID"); return; }
    if (friend?.key && friend.key !== key) { settleIdentity(conn, id, 'failed', 'different key'); return; }
    conn.theirKey = key;
    if (conn.pendingSig) {
      const sig = conn.pendingSig;
      conn.pendingSig = null;
      receiveAuth(conn, id, { sig });
    }
  } catch (err) {
    settleIdentity(conn, id, 'failed', err.message || String(err));
  }
}

async function receiveAuth(conn, id, msg) {
  if (conn.auth !== 'pending' || typeof msg.sig !== 'string' || msg.sig.length > 200) return;
  if (!conn.theirKey) { conn.pendingSig = msg.sig; return; } // their hello is still being checked
  try {
    const ok = await verifyChallenge(conn.theirKey, conn.myNonce, id, getMyPersistentId(), msg.sig);
    settleIdentity(conn, id, ok ? 'verified' : 'failed', ok ? '' : 'bad signature');
  } catch (err) {
    settleIdentity(conn, id, 'failed', err.message || String(err));
  }
}

const legacyLogged = new Set();
const identityWarned = new Set();

function settleIdentity(conn, id, result, reason = '') {
  if (conn.auth !== 'pending') return;
  conn.auth = result;
  clearTimeout(conn.identityTimer);
  const backlog = conn.backlog;
  conn.backlog = [];
  if (result === 'failed') {
    identityCheckFailed(conn, id, reason);
    conn.onFailed?.();
    return;
  }
  const hello = conn.helloMsg;
  learnName(id, typeof hello.name === 'string' ? hello.name.slice(0, 40) : '');
  ackSupport.set(id, hello.acks === true);
  peerCaps.set(id, new Set(Array.isArray(hello.caps) ? hello.caps.filter((c) => typeof c === 'string').slice(0, 20) : []));
  if (result === 'verified') {
    pinKey(id, conn.theirKey);
  } else if (!legacyLogged.has(id)) {
    legacyLogged.add(id);
    log(t('log.legacyPeer', { name: friendName(id) }));
  }
  if (acceptedFriends().some((f) => f.id === id)) {
    // They just reached out (or answered), so they're online — no need to wait
    // for our own (deliberately infrequent, for offline friends) sweep to notice.
    markOnline(id);
    if ('activity' in hello) setPeerActivity(id, hello.activity); // older versions send it in their hello
    if (conn.open) {
      conn.send({ type: 'activity', activity: outgoingActivity() });
      conn.send({ type: 'status', status: outgoingStatus() });
    }
  }
  conn.onTrusted?.();
  for (const msg of backlog) handleDataMessage(id, msg);
  flushPendingMessages(id);
  resolveTrustWaiters(id);
}

function identityCheckFailed(conn, id, reason) {
  log(t('log.identityFailed', { tag: tagFor(id, remoteNames.get(id)), reason }));
  try { conn.close(); } catch {}
  removeDataConnection(id, conn);
  if (!loadFriends().some((f) => f.id === id) || reason === 'timeout') return; // a slow network isn't an impostor
  // Whoever answered as them couldn't prove it — don't stay in a call with them either.
  if (calls.has(id)) hangUp(id);
  if (!identityWarned.has(id)) {
    identityWarned.add(id);
    toast(t('toast.identityFailed', { name: friendName(id) }));
  }
}

// Remembers a friend's key the first time they prove they hold one.
function pinKey(id, key) {
  const friends = loadFriends();
  const friend = friends.find((f) => f.id === id);
  if (!friend || friend.key || !key) return;
  friend.key = key;
  saveFriends(friends);
}

// For an incoming call: the caller opens a data connection just before dialing,
// so its identity check is usually still in flight when the call lands.
const trustWaiters = new Map(); // peerId -> [resolve]

function waitForTrust(id, ms) {
  if (trustedConn(id)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const list = trustWaiters.get(id) || [];
    const done = () => { clearTimeout(timer); resolve(true); };
    const timer = setTimeout(() => {
      const remaining = (trustWaiters.get(id) || []).filter((d) => d !== done);
      if (remaining.length) trustWaiters.set(id, remaining);
      else trustWaiters.delete(id);
      resolve(false);
    }, ms);
    list.push(done);
    trustWaiters.set(id, list);
  });
}

function resolveTrustWaiters(id) {
  if (!trustedConn(id)) return; // e.g. a probe passing — the call needs the real connection
  const list = trustWaiters.get(id);
  trustWaiters.delete(id);
  for (const done of list || []) done();
}

// Only called with messages from a connection whose identity check passed.
function handleDataMessage(fromId, msg) {
  if (msg.type === 'activity') {
    setPeerActivity(fromId, msg.activity);
  } else if (msg.type === 'roster') {
    // Only ever act on a roster from an accepted friend — our own send-side already
    // withholds it from anyone else, but don't rely solely on other clients playing
    // by that rule. A connected peer controls this list even then, so still validate
    // it and cap it, so a misbehaving/malicious one can't fan us out into countless
    // outbound calls.
    if (acceptedFriends().some((f) => f.id === fromId) && Array.isArray(msg.peers)) {
      for (const id of msg.peers.slice(0, 50)) {
        if (typeof id === 'string') meshCall(id);
      }
    }
  } else if (msg.type === 'peer-joined') {
    if (typeof msg.id !== 'string') return;
    log(t('log.joining', { name: friendName(msg.id) }));
    // Only an introduction from someone we're actually in a call with counts —
    // see admitIncomingCall.
    if (calls.has(fromId)) introducedPeers.set(msg.id, Date.now());
  } else if (msg.type === 'chat') {
    const text = typeof msg.text === 'string' ? msg.text.slice(0, 2000) : '';
    if (msg.scope === 'dm') {
      if (!acceptedFriends().some((f) => f.id === fromId)) return; // only from accepted friends
      const id = wireMessageId(msg.id);
      const isNew = addChatMessage(fromId, fromId, text, { ts: wireTimestamp(msg.ts), id });
      // Confirm even a duplicate — it means our earlier confirmation got lost.
      if (id) dataConnections.get(fromId)?.send({ type: 'chat-ack', id });
      if (typingUntil.delete(fromId)) renderTyping();
      if (isNew) announceMessage(fromId, text);
    } else {
      // 'call' scope (or unmarked, from an older client) — only from someone actually in the call with us.
      if (!calls.has(fromId)) return;
      addCallChatMessage(fromId, text, wireTimestamp(msg.ts));
      // Only worth a toast if call chat isn't the thing currently on screen.
      if (currentView !== 'call') toast(t('toast.newCallMessage', { name: friendName(fromId) }), 'info');
      if (currentView !== 'call' || appInBackground()) playMessageSound();
    }
  } else if (msg.type === 'chat-ack') {
    const id = wireMessageId(msg.id);
    if (id) markDelivered(fromId, [id]);
  } else if (msg.type === 'chat-edit' || msg.type === 'chat-delete') {
    if (!isFriend(fromId)) return;
    applyRemoteEdit(fromId, msg);
    const id = wireMessageId(msg.id);
    if (id) dataConnections.get(fromId)?.send({ type: 'chat-ack', id });
  } else if (msg.type === 'typing') {
    if (!isFriend(fromId)) return;
    typingUntil.set(fromId, Date.now() + TYPING_SHOWN_MS);
    renderTyping();
    setTimeout(renderTyping, TYPING_SHOWN_MS + 100);
  } else if (msg.type === 'status') {
    if (!isFriend(fromId)) return;
    if (msg.status === 'dnd') statusByPeer.set(fromId, 'dnd');
    else statusByPeer.delete(fromId);
    scheduleRenderPeerList();
  } else if (msg.type === 'voice-state') {
    if (!calls.has(fromId)) return;
    voiceStateByPeer.set(fromId, { muted: msg.muted === true, deafened: msg.deafened === true });
    renderCallPanel();
  } else if (msg.type === 'file-start' || msg.type === 'file-chunk') {
    receiveFilePart(fromId, msg);
  } else if (msg.type === 'friend-request') {
    handleFriendRequest(fromId, typeof msg.name === 'string' ? msg.name.slice(0, 40) : '');
  } else if (msg.type === 'friend-accept') {
    // Only ever promotes an outgoing request we actually sent — same guard
    // handleFriendDecline already has, and for the same reason. Without it,
    // anyone who knows our ID could send an unsolicited 'friend-accept' and land
    // on the friends list as accepted with no prompt ever shown; accepted-friend
    // status is what gates roster and activity disclosure, incoming DMs, and
    // roster-driven auto-dial, so that's the whole trust boundary.
    if (!pendingOutgoingFriends().some((f) => f.id === fromId)) return;
    addFriend(fromId, 'accepted'); // promotes our pending entry for them
    toast(t('toast.friendAccepted', { name: friendName(fromId) }), 'info');
  } else if (msg.type === 'friend-decline') {
    handleFriendDecline(fromId);
  }
}

// --- chat ----------------------------------------------------------
// Two independent kinds of thread share one message pane:
//  - DMs: per-friend (chatHistories), entirely independent of calls — the
//    pane fills the main panel while a friend's DMs are the current view.
//  - Call chat: one shared broadcast thread (callChatHistory) for whoever is
//    in the current call, shown beside the call in the call view and reset
//    when the call ends.

// Today's messages show just the time; anything older gets the date too.
// Entries saved before timestamps existed have no `ts` and show no time
// rather than a made-up one.
function formatChatTime(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  const time = date.toLocaleTimeString(getLanguage(), { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === new Date().toDateString()) return time;
  return `${date.toLocaleDateString(getLanguage(), { month: 'short', day: 'numeric' })} ${time}`;
}

// A timestamp off the wire — the sender's clock, so a queued message keeps the
// time it was actually written rather than when it finally arrived. Clamped to
// now so a skewed (or hostile) clock can't date a message in the future.
function wireTimestamp(ts) {
  const now = Date.now();
  return Number.isFinite(ts) && ts > 1.6e12 ? Math.min(ts, now) : now;
}

function wireMessageId(id) {
  return typeof id === 'string' && id.length <= 64 ? id : null;
}

const GROUP_WINDOW_MS = 7 * 60 * 1000;

// `pending` marks one of our own DMs that hasn't been confirmed delivered yet.
// Like Discord, a run of messages from the same person a few minutes apart
// shares one avatar and name, and a new day gets a divider.
// `pending` marks one of our own DMs that hasn't been confirmed delivered yet.
// Like Discord, a run of messages from the same person a few minutes apart
// shares one avatar and name, and a new day gets a divider.
function renderChatMessage(entry, { pending = false } = {}) {
  const { fromId, ts, id } = entry;
  const isMe = fromId === peer?.id;
  const displayName = isMe ? getMyUsername() || t('chat.you') : friendName(fromId);
  const last = chatMessagesEl.lastElementChild;
  const lastTs = last?.classList.contains('chatMsg') ? Number(last.dataset.ts) : 0;
  const newDay = !!ts && (!lastTs || new Date(lastTs).toDateString() !== new Date(ts).toDateString());
  if (newDay) {
    const divider = document.createElement('div');
    divider.className = 'dateDivider';
    divider.textContent = new Date(ts).toLocaleDateString(getLanguage(), { year: 'numeric', month: 'long', day: 'numeric' });
    chatMessagesEl.appendChild(divider);
  }
  const grouped = !newDay && !!lastTs && !!ts && last.dataset.from === fromId && ts - lastTs < GROUP_WINDOW_MS;
  const div = document.createElement('div');
  div.className = 'chatMsg' + (grouped ? ' grouped' : '') + (pending ? ' pending' : '');
  div.dataset.from = fromId;
  div.dataset.ts = ts || 0;
  if (id) div.dataset.msgId = id;
  if (pending) div.title = t('chat.notDelivered');
  const time = ts ? new Date(ts).toLocaleTimeString(getLanguage(), { hour: '2-digit', minute: '2-digit' }) : '';
  // Your own DMs can be edited (text) and deleted — not call chat, which isn't kept.
  const actions = isMe && id && currentView === 'dm' ? `
    <div class="msgActions">
      ${entry.file ? '' : `<button class="iconBtn editMsgBtn" title="${t('chat.edit')}">${ICONS.pencil}</button>`}
      <button class="iconBtn deleteMsgBtn" title="${t('chat.delete')}">${ICONS.trash}</button>
    </div>` : '';
  div.innerHTML = grouped
    ? `<span class="hoverTime">${time}</span><div class="msgBody">${messageBodyHtml(entry)}</div>${actions}`
    : `${avatarHtml(isMe ? getMyPersistentId() : fromId, displayName)}
      <div class="msgBody">
        <div class="msgHead"><span class="msgAuthor">${escapeHtml(displayName)}</span><span class="time">${formatChatTime(ts)}</span></div>
        ${messageBodyHtml(entry)}
      </div>${actions}`;
  chatMessagesEl.appendChild(div);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

// escapeHtml leaves quotes alone, which is fine for text but not inside an attribute.
function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

// Plain http(s) links become clickable (they open in your browser — see
// openExternal). Runs on already-escaped text, and the pattern can't match a
// quote or angle bracket, so a link can't break out of its own tag.
const LINK_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi;
function linkify(escapedText) {
  return escapedText.replace(LINK_PATTERN, (match) => {
    let url = match;
    let trailing = '';
    while (/[.,;:!?)\]]$/.test(url)) { trailing = url.slice(-1) + trailing; url = url.slice(0, -1); }
    return `<a class="msgLink" href="${url}" title="${url}">${url}</a>${trailing}`;
  });
}

function messageBodyHtml(entry) {
  if (entry.file) return fileHtml(entry.file);
  return `<span class="text">${linkify(escapeHtml(entry.text))}${entry.edited ? `<span class="editedMark">(${t('chat.edited')})</span>` : ''}</span>`;
}

function fileHtml(file) {
  const done = file.state === 'done' && file.url;
  if (done && file.preview) {
    return `<img class="msgImage" src="${file.url}" alt="${escapeAttr(file.name)}" title="${escapeAttr(file.name)}">
      <div class="ephemeralNote">${t('chat.ephemeral')}</div>`;
  }
  const meta = file.state === 'failed' ? `<span class="fileMeta failed">${t('chat.fileFailed')}</span>`
    : done ? `<span class="fileMeta">${formatBytes(file.size)} · ${t('chat.ephemeral')}</span>`
    : `<span class="fileProgress"><span style="width:${Math.round(file.progress * 100)}%"></span></span>`;
  return `<div class="fileCard">
      ${ICONS.file}
      <div class="fileInfo"><span class="fileName" title="${escapeAttr(file.name)}">${escapeHtml(file.name)}</span>${meta}</div>
      ${done ? `<a class="iconBtn downloadBtn" href="${file.url}" download="${escapeAttr(file.name)}" title="${t('chat.download')}">${ICONS.download}</a>` : ''}
    </div>`;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function isQueued(peerId, id) {
  return !!id && !!pendingMessages.get(peerId)?.some((m) => m.id === id);
}

// Records a message in `peerId`'s DM thread (fromId is whoever actually
// sent it — us or them) and renders it live only if that thread is open.
// Returns false for a duplicate: a sender re-sends anything it hasn't had a
// delivery confirmation for, so the same message can legitimately arrive twice.
function addChatMessage(peerId, fromId, text, { ts = Date.now(), id = null } = {}) {
  if (!text) return false;
  const history = chatHistories.get(peerId) || [];
  if (id && history.some((m) => m.id === id && m.fromId === fromId)) return false;
  const entry = { fromId, text, ts, ...(id && { id }) };
  history.push(entry);
  trimHistory(history);
  chatHistories.set(peerId, history);
  saveChatHistories();
  if (peerId === openChatPeerId) renderChatMessage(entry, { pending: isQueued(peerId, id) });
  else if (fromId === peerId) setUnread(peerId, (unreadCounts.get(peerId) || 0) + 1);
  return true;
}

// Drops the oldest messages past the limit, releasing any file among them — a
// received file lives in memory behind its blob URL, and nothing would ever
// revoke it once its message is gone.
function trimHistory(history) {
  if (history.length <= CHAT_HISTORY_LIMIT) return;
  for (const m of history.splice(0, history.length - CHAT_HISTORY_LIMIT)) {
    if (m.file?.url) URL.revokeObjectURL(m.file.url);
  }
}

// Queues a DM for `peerId` so it survives them being offline (or us restarting
// before they come back). It stays queued until they confirm they got it (a
// 'chat-ack') — handing it to a connection isn't enough, since a connection can
// be dying without having noticed yet. See flushPendingMessages.
function queueMessage(peerId, message) {
  const queue = pendingMessages.get(peerId) || [];
  queue.push(message);
  pendingMessages.set(peerId, queue.slice(-PENDING_MESSAGE_LIMIT));
  savePendingMessages();
}

// peerId -> whether their client confirms delivery, learned from their 'hello'.
// Older clients don't, and must not be waited on: they'd never confirm, so
// we'd re-send forever and they — without de-duplication — would show every
// re-send as a new message. Those get the old send-and-forget behavior.
const ackSupport = new Map();

// Sends everything queued for `peerId` if there's an open connection and we know
// (from their hello) which delivery behavior they speak. Runs on their hello —
// i.e. every time a connection to them opens — so anything an earlier connection
// swallowed without a confirmation simply goes out again.
function flushPendingMessages(peerId) {
  const conn = trustedConn(peerId);
  const queue = pendingMessages.get(peerId);
  if (!conn || !queue?.length || !ackSupport.has(peerId)) return;
  // An older version would never confirm an edit or delete it doesn't understand.
  const unsupported = peerCaps.get(peerId)?.has('edit') ? [] : queue.filter((m) => m.type === 'chat-edit' || m.type === 'chat-delete');
  if (unsupported.length) markDelivered(peerId, unsupported.map((m) => m.id));
  const toSend = queue.filter((m) => !unsupported.includes(m));
  for (const message of toSend) conn.send(message);
  if (!ackSupport.get(peerId)) {
    markDelivered(peerId, toSend.map((m) => m.id));
    return;
  }
  // Pre-acknowledgement queue entries have no id to be confirmed by — send-and-forget those.
  const unconfirmable = toSend.filter((m) => !m.id);
  if (unconfirmable.length) markDelivered(peerId, unconfirmable.map(() => undefined));
}

// Drops delivered messages (by id; `undefined` ids drop id-less legacy entries)
// from the queue, and un-dims them if their thread is on screen.
function markDelivered(peerId, ids) {
  const queue = pendingMessages.get(peerId);
  if (!queue) return;
  const remaining = queue.filter((m) => !ids.includes(m.id));
  if (remaining.length === queue.length) return;
  if (remaining.length) pendingMessages.set(peerId, remaining);
  else pendingMessages.delete(peerId);
  savePendingMessages();
  if (peerId !== openChatPeerId) return;
  for (const id of ids) {
    if (!id) continue;
    const el = chatMessagesEl.querySelector(`.chatMsg.pending[data-msg-id="${CSS.escape(id)}"]`);
    if (el) { el.classList.remove('pending'); el.removeAttribute('title'); }
  }
}

function addCallChatMessage(fromId, text, ts = Date.now()) {
  if (!text) return;
  const entry = { fromId, text, ts };
  callChatHistory.push(entry);
  if (callChatHistory.length > CHAT_HISTORY_LIMIT) callChatHistory.splice(0, callChatHistory.length - CHAT_HISTORY_LIMIT);
  if (currentView === 'call') renderChatMessage(entry);
}

// The state change alone, without a render — see openChatWith.
// The state change alone, without a render — see openChatWith.
function enterDm(peerId) {
  ensureDataConnection(peerId); // independent of any call — opens on demand
  openChatPeerId = peerId;
  currentView = 'dm';
  setUnread(peerId, 0);
  fillDmThread(peerId);
  chatInputEl.placeholder = t('dm.placeholder', { name: friendName(peerId) });
  renderTyping();
}

function fillDmThread(peerId) {
  const name = friendName(peerId);
  chatMessagesEl.innerHTML = `
    <div class="chatIntro">
      ${avatarHtml(peerId, name)}
      <h2>${escapeHtml(name)}</h2>
      ${tagHtml(peerId, name)}
      <p>${escapeHtml(t('dm.beginning', { name }))}</p>
    </div>`;
  for (const entry of chatHistories.get(peerId) || []) {
    renderChatMessage(entry, { pending: entry.fromId === peer?.id && isQueued(peerId, entry.id) });
  }
}

// Redraws the open DM thread after an edit, delete or finished file, keeping
// your place in it unless you were already at the bottom.
function rerenderThread() {
  if (currentView !== 'dm') return;
  const atBottom = chatMessagesEl.scrollHeight - chatMessagesEl.scrollTop - chatMessagesEl.clientHeight < 40;
  const top = chatMessagesEl.scrollTop;
  fillDmThread(openChatPeerId);
  chatMessagesEl.scrollTop = atBottom ? chatMessagesEl.scrollHeight : top;
}

function openChatWith(peerId) {
  enterDm(peerId);
  renderPeerList();
  chatInputEl.focus();
}

function showCallChat() {
  chatMessagesEl.innerHTML = `
    <div class="chatIntro callIntro">
      <div class="emptyArt">${ICONS.chat}</div>
      <p>${t('chat.emptyCall')}</p>
    </div>`;
  for (const entry of callChatHistory) renderChatMessage(entry);
  chatInputEl.placeholder = t('call.placeholder');
}

function sendChatMessage() {
  const text = chatInputEl.value.trim();
  if (!text) return;
  if (currentView === 'dm') {
    const peerId = openChatPeerId;
    const message = { type: 'chat', scope: 'dm', text, id: crypto.randomUUID(), ts: Date.now() };
    ensureDataConnection(peerId);
    queueMessage(peerId, message);
    addChatMessage(peerId, peer.id, text, { ts: message.ts, id: message.id }); // before the flush, so an old-client flush can un-dim it
    flushPendingMessages(peerId); // delivers now if already connected; otherwise on their next hello
    lastTypingSentAt = 0; // so the next thing they start typing shows straight away
  } else if (currentView === 'call') {
    const ts = Date.now();
    for (const id of calls.keys()) dataConnections.get(id)?.send({ type: 'chat', scope: 'call', text, ts });
    addCallChatMessage(peer.id, text, ts);
  } else {
    return;
  }
  chatInputEl.value = '';
}

// A DM (or file) that just arrived: toast if you're not looking at that
// conversation, a sound if you're not looking at it or the window, and a
// Windows notification if the window's in the background.
function announceMessage(fromId, preview) {
  const looking = fromId === openChatPeerId && !appInBackground();
  if (fromId !== openChatPeerId) toast(t('toast.newMessage', { name: friendName(fromId) }), 'info');
  if (!looking) playMessageSound();
  notifyDesktop(friendName(fromId), preview.length > 140 ? preview.slice(0, 140) + '…' : preview);
}

// --- typing ----------------------------------------------------------------
// A 'typing' ping at most every few seconds while you type in a DM; theirs
// shows under the message box until it runs out or their message arrives.

const TYPING_PING_MS = 3000;
const TYPING_SHOWN_MS = 6000;
let lastTypingSentAt = 0;

function sendTyping() {
  if (currentView !== 'dm' || !chatInputEl.value.trim() || Date.now() - lastTypingSentAt < TYPING_PING_MS) return;
  const conn = trustedConn(openChatPeerId);
  if (!conn || !peerCaps.get(openChatPeerId)?.has('typing')) return;
  conn.send({ type: 'typing' });
  lastTypingSentAt = Date.now();
}

function renderTyping() {
  const typing = currentView === 'dm' && (typingUntil.get(openChatPeerId) || 0) > Date.now();
  typingIndicatorEl.innerHTML = typing
    ? `<span class="typingDots"><i></i><i></i><i></i></span><span>${t('chat.typing', { name: `<b>${escapeHtml(friendName(openChatPeerId))}</b>` })}</span>`
    : '';
}

// --- editing and deleting your messages ------------------------------------
// Both go to the other side like messages do — queued while they're offline,
// re-sent until confirmed — unless the message itself hasn't gone out yet, in
// which case the queued copy is simply changed or dropped.

function startEditing(msgId) {
  const entry = (chatHistories.get(openChatPeerId) || []).find((m) => m.id === msgId && m.fromId === peer?.id && !m.file);
  const div = chatMessagesEl.querySelector(`.chatMsg[data-msg-id="${CSS.escape(msgId)}"]`);
  if (!entry || !div || div.classList.contains('editing')) return;
  div.classList.add('editing');
  const textEl = div.querySelector('.text');
  const box = document.createElement('div');
  box.innerHTML = `<input type="text" class="msgEditInput" maxlength="2000"><div class="msgEditHint">${t('chat.editHint')}</div>`;
  textEl.replaceWith(box);
  const input = box.querySelector('input');
  input.value = entry.text;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); saveEdit(msgId, input.value); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); rerenderThread(); chatInputEl.focus(); }
  });
}

function saveEdit(msgId, newText) {
  const peerId = openChatPeerId;
  const text = newText.trim();
  if (!text) { rerenderThread(); requestDeleteMessage(msgId, false); return; }
  const entry = (chatHistories.get(peerId) || []).find((m) => m.id === msgId && m.fromId === peer?.id);
  if (!entry || entry.text === text) { rerenderThread(); chatInputEl.focus(); return; }
  entry.text = text;
  entry.edited = true;
  saveChatHistories();
  const queued = pendingMessages.get(peerId)?.find((m) => m.id === msgId);
  if (queued) {
    queued.text = text; // hasn't gone out yet — it'll just go out like this
    savePendingMessages();
  } else {
    queueMessage(peerId, { type: 'chat-edit', id: crypto.randomUUID(), target: msgId, text, ts: Date.now() });
    flushPendingMessages(peerId);
  }
  rerenderThread();
  chatInputEl.focus();
}

async function requestDeleteMessage(msgId, skipConfirm) {
  const peerId = openChatPeerId;
  if (!skipConfirm) {
    const ok = await confirmDialog({ title: t('chat.deleteTitle'), message: t('chat.deleteBody'), confirmLabel: t('chat.delete'), danger: true });
    if (!ok) return;
  }
  deleteMessage(peerId, msgId);
}

function deleteMessage(peerId, msgId) {
  const history = chatHistories.get(peerId) || [];
  const index = history.findIndex((m) => m.id === msgId && m.fromId === peer?.id);
  if (index < 0) return;
  const [entry] = history.splice(index, 1);
  if (entry.file) {
    entry.file.cancelled = true; // stops a send that's still going
    if (entry.file.url) URL.revokeObjectURL(entry.file.url);
  }
  saveChatHistories();
  const queue = pendingMessages.get(peerId);
  if (queue?.some((m) => m.id === msgId)) {
    // Never went out — nothing to tell them.
    const remaining = queue.filter((m) => m.id !== msgId);
    if (remaining.length) pendingMessages.set(peerId, remaining);
    else pendingMessages.delete(peerId);
    savePendingMessages();
  } else {
    queueMessage(peerId, { type: 'chat-delete', id: crypto.randomUUID(), target: msgId });
    flushPendingMessages(peerId);
  }
  if (peerId === openChatPeerId) rerenderThread();
}

// Only ever touches a message that same friend sent.
function applyRemoteEdit(fromId, msg) {
  const target = wireMessageId(msg.target);
  const history = chatHistories.get(fromId) || [];
  const index = target ? history.findIndex((m) => m.id === target && m.fromId === fromId) : -1;
  if (index < 0) return;
  if (msg.type === 'chat-edit') {
    const text = typeof msg.text === 'string' ? msg.text.slice(0, 2000).trim() : '';
    if (!text || history[index].file) return;
    history[index].text = text;
    history[index].edited = true;
  } else {
    const [entry] = history.splice(index, 1);
    if (entry.file?.url) URL.revokeObjectURL(entry.file.url);
  }
  saveChatHistories();
  if (fromId === openChatPeerId) rerenderThread();
}

// --- files -----------------------------------------------------------------
// Sent straight to the friend over the same connection as messages, in
// numbered chunks (the connection may deliver them out of order). Kept in
// memory only — never saved, never queued for later — so they're gone once
// patycord closes, on both ends, and can only be sent while the friend is
// online. Images show inline; anything else gets a card with a download button.

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const FILE_CHUNK_BYTES = 64 * 1024;
const PREVIEW_TYPES = /^image\/(png|jpeg|gif|webp)$/;
const incomingFiles = new Map(); // `${peerId}:${fileId}` -> transfer in progress

function safeMime(mime) {
  return typeof mime === 'string' && mime.length <= 100 && /^[\w.+-]+\/[\w.+-]+$/.test(mime) ? mime.toLowerCase() : 'application/octet-stream';
}

function safeFileName(name) {
  const clean = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 120);
  return clean || 'file';
}

function addFileEntry(peerId, entry) {
  const history = chatHistories.get(peerId) || [];
  history.push(entry);
  trimHistory(history);
  chatHistories.set(peerId, history);
  if (peerId === openChatPeerId) renderChatMessage(entry);
  else if (entry.fromId === peerId) setUnread(peerId, (unreadCounts.get(peerId) || 0) + 1);
  scheduleRenderPeerList(); // most recent conversation moves to the top
}

function updateFileProgress(peerId, entry) {
  if (peerId !== openChatPeerId) return;
  const bar = chatMessagesEl.querySelector(`.chatMsg[data-msg-id="${CSS.escape(entry.id)}"] .fileProgress span`);
  if (bar) bar.style.width = `${Math.round(entry.file.progress * 100)}%`;
}

function updateFileEntry(peerId) {
  if (peerId === openChatPeerId) rerenderThread();
}

async function sendFiles(peerId, files) {
  for (const file of files) await sendFile(peerId, file);
}

async function sendFile(peerId, file) {
  if (file.size > MAX_FILE_BYTES) { toast(t('toast.fileTooBig', { name: file.name, max: '100 MB' })); return; }
  const conn = trustedConn(peerId);
  if (!conn) { toast(t('toast.fileOffline', { name: friendName(peerId) })); return; }
  if (!peerCaps.get(peerId)?.has('files')) { toast(t('toast.fileUnsupported', { name: friendName(peerId) })); return; }
  const id = crypto.randomUUID();
  const mime = safeMime(file.type);
  const entry = {
    fromId: peer.id, ts: Date.now(), id,
    file: { name: safeFileName(file.name), size: file.size, mime, preview: PREVIEW_TYPES.test(mime), url: URL.createObjectURL(file), state: 'sending', progress: 0 },
  };
  addFileEntry(peerId, entry);
  conn.send({ type: 'file-start', id, name: entry.file.name, size: file.size, mime, ts: entry.ts });
  const count = Math.ceil(file.size / FILE_CHUNK_BYTES);
  for (let seq = 0; seq < count; seq++) {
    if (entry.file.cancelled) return;
    // Don't pile the whole file into memory faster than it can actually go out.
    while (conn.open && (conn.dataChannel?.bufferedAmount || 0) + (conn.bufferSize || 0) * 16300 > 2 * 1024 * 1024) {
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    if (!conn.open) { entry.file.state = 'failed'; updateFileEntry(peerId); return; }
    const data = await file.slice(seq * FILE_CHUNK_BYTES, (seq + 1) * FILE_CHUNK_BYTES).arrayBuffer();
    conn.send({ type: 'file-chunk', id, seq, data });
    entry.file.progress = (seq + 1) / count;
    if (seq % 4 === 0) updateFileProgress(peerId, entry);
  }
  entry.file.state = 'done';
  entry.file.progress = 1;
  updateFileEntry(peerId);
}

function receiveFilePart(fromId, msg) {
  if (!isFriend(fromId)) return;
  const id = wireMessageId(msg.id);
  if (!id) return;
  const key = `${fromId}:${id}`;
  let transfer = incomingFiles.get(key);
  if (!transfer) {
    if ([...incomingFiles.keys()].filter((k) => k.startsWith(`${fromId}:`)).length >= 10) return;
    transfer = { chunks: [], have: 0, received: 0, entry: null, count: null, size: null, timer: null };
    incomingFiles.set(key, transfer);
  }
  // Give up on a transfer that's gone quiet (they closed patycord mid-file, say).
  clearTimeout(transfer.timer);
  transfer.timer = setTimeout(() => {
    incomingFiles.delete(key);
    if (transfer.entry) { transfer.entry.file.state = 'failed'; updateFileEntry(fromId); }
  }, 30000);

  if (msg.type === 'file-start') {
    if (transfer.entry) return;
    const size = msg.size;
    if (!Number.isInteger(size) || size < 0 || size > MAX_FILE_BYTES) { clearTimeout(transfer.timer); incomingFiles.delete(key); return; }
    const mime = safeMime(msg.mime);
    transfer.size = size;
    transfer.count = Math.ceil(size / FILE_CHUNK_BYTES);
    transfer.entry = {
      fromId, ts: wireTimestamp(msg.ts), id,
      file: { name: safeFileName(msg.name), size, mime, preview: PREVIEW_TYPES.test(mime), url: null, state: 'receiving', progress: 0 },
    };
    addFileEntry(fromId, transfer.entry);
    announceMessage(fromId, t('chat.sentFile', { name: transfer.entry.file.name }));
  } else {
    const { seq, data } = msg;
    const isBinary = data instanceof ArrayBuffer || ArrayBuffer.isView(data);
    if (!Number.isInteger(seq) || seq < 0 || seq >= MAX_FILE_BYTES / FILE_CHUNK_BYTES || !isBinary || data.byteLength > FILE_CHUNK_BYTES) return;
    if (transfer.chunks[seq] || (transfer.count !== null && seq >= transfer.count)) return;
    transfer.chunks[seq] = data;
    transfer.have++;
    transfer.received += data.byteLength;
  }
  if (!transfer.entry) return; // chunks that beat the start along — kept until it arrives
  const { entry } = transfer;
  if (transfer.have === transfer.count && transfer.received === transfer.size) {
    clearTimeout(transfer.timer);
    incomingFiles.delete(key);
    entry.file.url = URL.createObjectURL(new Blob(transfer.chunks, { type: entry.file.mime }));
    entry.file.state = 'done';
    entry.file.progress = 1;
    updateFileEntry(fromId);
  } else {
    entry.file.progress = transfer.size ? transfer.received / transfer.size : 0;
    if (transfer.have % 4 === 0) updateFileProgress(fromId, entry);
  }
}

function openLightbox(src, name) {
  const overlay = document.createElement('div');
  overlay.id = 'lightbox';
  overlay.className = 'modalOverlay';
  overlay.innerHTML = `
    <div class="lightboxInner">
      <img class="lightboxImg" src="${src}" alt="${escapeAttr(name)}">
      <div class="lightboxBar">
        <a class="downloadBtn" href="${src}" download="${escapeAttr(name)}"><button>${t('chat.download')}</button></a>
      </div>
    </div>`;
  const close = () => { overlay.remove(); window.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  overlay.addEventListener('click', (e) => { if (!e.target.closest('.lightboxBar')) close(); });
  window.addEventListener('keydown', onKey, true);
  document.body.appendChild(overlay);
}

// Links in messages open in your browser, never inside patycord.
function openExternal(url) {
  if (!/^https?:\/\//i.test(url)) return;
  if (window.__TAURI__) tauriInvoke('open_url', { url }).catch((err) => log(`couldn't open link: ${err}`));
  else window.open(url, '_blank', 'noopener');
}

// --- friend menus and nicknames ----------------------------------------------

function showFriendMenu(e, id) {
  e.preventDefault();
  if (!isFriend(id)) return;
  const inCall = calls.has(id);
  const online = inCall || presence.get(id);
  openMenu([
    { label: t('friends.message'), icon: ICONS.chat, action: () => openChatWith(id) },
    inCall ? { label: t('sidebar.hangUp'), icon: ICONS.phoneOff, action: () => hangUp(id) }
      : online ? { label: t('sidebar.call'), icon: ICONS.phone, action: () => connectTo(id) } : null,
    { separator: true },
    { label: t('menu.nickname'), icon: ICONS.tag, action: () => editNickname(id) },
    { label: t('menu.copyId'), icon: ICONS.copy, action: () => { navigator.clipboard.writeText(id); toast(t('toast.idCopied'), 'info'); } },
    { separator: true },
    { label: t('menu.removeFriend'), icon: ICONS.userMinus, danger: true, action: () => confirmRemoveFriend(id) },
  ], e.clientX, e.clientY);
}

// A nickname is only ever shown to you — friends still see their own name.
async function editNickname(id) {
  const friend = loadFriends().find((f) => f.id === id);
  if (!friend) return;
  const ownName = remoteNames.get(id) || friend.name || t('unknown');
  const value = await promptDialog({
    title: t('menu.nicknameTitle', { name: ownName }), message: t('menu.nicknameDesc'),
    value: friend.nickname || '', placeholder: ownName, confirmLabel: t('settings.save'),
  });
  if (value === null) return;
  const friends = loadFriends();
  const target = friends.find((f) => f.id === id);
  if (!target) return;
  if (value) target.nickname = value.slice(0, 40);
  else delete target.nickname;
  saveFriends(friends);
  if (openChatPeerId === id) enterDm(id);
  renderPeerList();
}

async function confirmRemoveFriend(id) {
  const ok = await confirmDialog({
    title: t('menu.removeTitle', { name: friendName(id) }), message: t('menu.removeBody'),
    confirmLabel: t('menu.remove'), danger: true,
  });
  if (ok) removeFriend(id);
}

// A silent, no-audio connection attempt just to check whether a friend's app is
// currently open — doesn't ring anything on their end.
function probePresence(id) {
  if (!peer || !id || calls.has(id)) return;
  // Already have a live connection (e.g. an open DM) — that's a stronger signal than
  // a fresh probe anyway, and opening one is pure churn: a whole extra WebRTC
  // PeerConnection + DataChannel handshake, held open, then torn down again.
  const existing = dataConnections.get(id);
  const iceState = existing?.peerConnection?.iceConnectionState;
  if (existing?.open && iceState !== 'disconnected' && iceState !== 'failed') {
    markOnline(id);
    return;
  }
  // Still "open" but ICE has lost them: their app crashed or was killed without
  // closing anything. PeerJS only closes the connection once ICE fully fails,
  // ~30 s later — don't keep showing them online until then; drop it and probe.
  if (existing?.open) {
    existing.close();
    dataConnections.delete(id);
  }
  if (activeProbes.has(id)) return; // previous one still in flight
  let settled = false;
  // Tagged so the other end knows it's only a presence check (see
  // handleIncomingDataConnection) — older clients just ignore the metadata.
  const probe = peer.connect(id, { reliable: false, metadata: { probe: true } });
  // Online only once they've proven who they are — anyone could answer to their ID.
  wireIdentityCheck(probe, id, {
    probe: true,
    onTrusted: () => {
      finish(true);
      // Give our activity (sent once the check passes) a moment to arrive before
      // tearing the probe connection back down.
      setTimeout(() => { try { probe.close(); } catch {} }, 800);
    },
    onFailed: () => finish(false),
  });
  const finish = (online) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    activeProbes.delete(id);
    if (online) {
      markOnline(id);
      // Anything we queued for them while they were away goes out now, over a
      // real connection — not on whenever we next happen to open a chat with them.
      if (pendingMessages.get(id)?.length) ensureDataConnection(id);
    } else {
      setPeerActivity(id, null); // stale activity shouldn't outlive them going offline
      statusByPeer.delete(id);
      if (presence.get(id) !== false) { presence.set(id, false); scheduleRenderPeerList(); }
      try { probe.close(); } catch {}
    }
  };
  const timer = setTimeout(() => finish(false), 4000);
  activeProbes.set(id, () => finish(false)); // so a peer-unavailable error that beats the timeout can end it early
  // Older clients flush queued DMs over whatever connection opens first, probes
  // included — wireIdentityCheck hands those to handleDataMessage like any other.
  probe.on('open', () => probe.send(myHello(probe)));
  probe.on('error', () => finish(false));
}

const activeProbes = new Map(); // peerId -> ends that probe as "offline"

function markOnline(id) {
  if (presence.get(id) === true) return;
  presence.set(id, true);
  scheduleRenderPeerList();
}

// Every 10s while the window is visible. Friends already known to be online are
// re-checked every sweep (so going offline shows up promptly); offline friends
// and unanswered friend requests only every third — each attempt sets up a whole
// WebRTC connection (ICE gathering, TURN allocation) just to find nobody home,
// and a friend coming online announces themselves anyway: their own startup
// sweep reaches us (see markOnline in handleIncomingDataConnection).
const PRESENCE_SWEEP_MS = 10000;
let presenceSweepCount = 1; // the sweep on connecting already covered everyone
function probeAllFriends({ everyone = false } = {}) {
  if (document.hidden) return; // nobody's looking at the list — catch up on becoming visible instead
  const includeOffline = everyone || presenceSweepCount++ % 3 === 0;
  for (const friend of acceptedFriends()) {
    if (includeOffline || presence.get(friend.id)) probePresence(friend.id);
  }
  if (includeOffline) {
    for (const friend of pendingOutgoingFriends()) retryFriendRequest(friend.id);
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && peer?.open) probeAllFriends({ everyone: true });
});

// PeerJS reports a connection attempt to someone offline only as a peer-level
// 'peer-unavailable' error — it never closes the DataConnection itself, so
// without this every DM, call or friend request aimed at an offline friend
// would leave a dead RTCPeerConnection behind for the rest of the session.
function dropDeadConnectionsTo(id) {
  activeProbes.get(id)?.();
  const conn = dataConnections.get(id);
  if (conn && !conn.open) {
    conn.close();
    dataConnections.delete(id);
  }
}

// A friend request only arrives if they're online the moment it's sent, so a
// pending one is re-sent on every presence sweep until a connection to them
// actually opens — i.e. as soon as they next start patycord. Goes over the
// regular, long-lived data connection rather than a throwaway presence probe,
// so their Accept/Decline (which could come much later) still has a way back.
// Once that connection is open there's nothing to redo: the request went out
// when it opened, and handleFriendRequest on their end ignores repeats anyway.
function retryFriendRequest(id) {
  const existing = dataConnections.get(id);
  if (existing?.open) return;
  if (existing) { existing.close(); dataConnections.delete(id); } // a dead attempt from while they were offline
  sendFriendRequest(id);
}

// Like friendName(id), but for call sites that already have the friend record in
// hand (e.g. mid-loop over loadFriends()) — skips redoing the full reload+scan
// friendName() would otherwise repeat for every single row.
function nameFor(friend) {
  return friend.nickname || remoteNames.get(friend.id) || friend.name || t('unknown');
}

function friendName(id) {
  const friend = loadFriends().find((f) => f.id === id);
  return friend?.nickname || remoteNames.get(id) || friend?.name || t('unknown');
}

function renderIncomingCalls() {
  if (pendingCalls.size > 0) {
    if (getDnd()) stopRinging(); // still shows, just silently
    else startRinging();
  } else {
    stopRinging();
    if (flashingForCall) { // nothing left to answer
      flashingForCall = false;
      tauriInvoke('request_attention', { urgent: false }).catch(() => {});
    }
  }
  incomingCallsEl.innerHTML = '';
  for (const [id, call] of pendingCalls) {
    const name = friendName(id);
    const div = document.createElement('div');
    div.className = 'incomingCall';
    div.innerHTML = `
      <span class="ringAvatar">${avatarHtml(id, name)}</span>
      <span class="callName">${escapeHtml(name)}</span>
      <span class="callLabel">${t('incomingCall.label')}…</span>
      <span class="actions">
        <button class="roundBtn declineBtn" title="${t('decline')}">${ICONS.phoneOff}</button>
        <button class="roundBtn acceptBtn" title="${t('accept')}">${ICONS.phone}</button>
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

// --- who's allowed to ring us -----------------------------------------
// Anyone who has our ID can place a call to it, but only accepted friends ring;
// everyone else is declined without ringing — with one exception: someone
// joining a call we're already in, through a friend of theirs who's in it with
// us. Joining works by the newcomer calling everyone already in the call
// directly (see 'roster'), and they needn't be friends with all of them; the
// member they joined through vouches for them with a 'peer-joined' message to
// the rest of us.

localStorage.removeItem('patycord.friendsOnlyCalls'); // left over from when this could be switched off

const introducedPeers = new Map(); // peerId -> when a call member said they're joining
const INTRODUCTION_TTL_MS = 60000;

function isFriend(id) {
  return acceptedFriends().some((f) => f.id === id);
}

function mayRing(id) {
  if (isFriend(id)) return !!trustedConn(id); // a friend's ID only counts once they've proven it's them
  const introducedAt = introducedPeers.get(id);
  return calls.size > 0 && !!introducedAt && Date.now() - introducedAt < INTRODUCTION_TTL_MS;
}

function admitIncomingCall(call) {
  let hungUp = false;
  call.on('close', () => { hungUp = true; });
  if (isFriend(call.peer)) {
    // Their identity check is usually still in flight — see waitForTrust.
    waitForTrust(call.peer, IDENTITY_TIMEOUT_MS).then((trusted) => {
      if (hungUp) return;
      if (trusted) ringIncomingCall(call);
      else declineCall(call);
    });
    return;
  }
  if (mayRing(call.peer)) { ringIncomingCall(call); return; }
  if (calls.size === 0) { declineCall(call); return; }
  // Mid-call, a stranger may be a friend-of-a-friend joining: the introduction
  // for them goes out at the same moment they start dialing, and can land just
  // after their call does. Give it a few seconds before deciding.
  setTimeout(() => {
    if (hungUp) return;
    if (mayRing(call.peer)) ringIncomingCall(call);
    else declineCall(call);
  }, 3000);
}

function declineCall(call) {
  call.close();
  log(t('log.callDeclinedStranger', { tag: tagFor(call.peer, remoteNames.get(call.peer)) }));
}

function ringIncomingCall(call) {
  pendingCalls.set(call.peer, call);
  renderIncomingCalls();
  notifyDesktop(t('notify.incomingCall', { name: friendName(call.peer) }), t('notify.incomingCallBody'));
  if (appInBackground() && !getDnd()) {
    flashingForCall = true;
    tauriInvoke('request_attention', { urgent: true }).catch(() => {});
  }
  log(t('log.incomingCall', { name: friendName(call.peer) }));
  call.on('close', () => { pendingCalls.delete(call.peer); renderIncomingCalls(); });
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
  renderPeerList(); // badges the rail, the Friends button and the Pending tab — no need for a toast too
  notifyDesktop(t('notify.friendRequest', { name: name || t('unknown') }), t('notify.friendRequestBody'));
}

// --- screen sharing --------------------------------------------------

function addScreenTile(peerId, call) {
  removeScreenTile(peerId); // replace any existing tile from them

  const tile = document.createElement('div');
  tile.className = 'screenTile';
  const video = document.createElement('video');
  applySpeakerTo(video); // the sharer's system audio, if they included it
  video.muted = deafened;
  video.autoplay = true;
  video.playsInline = true;
  // Not muted — if the sharer included system audio, we want to actually hear it.
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = t('screen.label', { name: friendName(peerId) });

  const fullscreenBtn = document.createElement('button');
  fullscreenBtn.className = 'fullscreenBtn ghost';
  fullscreenBtn.title = t('screen.fullscreen');
  fullscreenBtn.innerHTML = ICONS.maximize;
  const toggleFullscreen = () => {
    if (document.fullscreenElement === tile) document.exitFullscreen();
    else tile.requestFullscreen().catch(() => {});
  };
  fullscreenBtn.addEventListener('click', toggleFullscreen);
  video.addEventListener('dblclick', toggleFullscreen);
  tile.addEventListener('fullscreenchange', () => {
    const isFullscreen = document.fullscreenElement === tile;
    fullscreenBtn.innerHTML = isFullscreen ? ICONS.minimize : ICONS.maximize;
    fullscreenBtn.title = isFullscreen ? t('screen.windowed') : t('screen.fullscreen');
  });

  tile.appendChild(video);
  tile.appendChild(label);
  tile.appendChild(fullscreenBtn);
  screenGridEl.appendChild(tile);
  screenTiles.set(peerId, { call, tileEl: tile, videoEl: video });
  playScreenShareSound(true); // same cue the sharer hears on their end — parity, not just for them

  call.on('stream', (stream) => { video.srcObject = stream; });
  call.on('close', () => removeScreenTile(peerId));
  call.on('error', () => removeScreenTile(peerId));
}

function removeScreenTile(peerId) {
  const entry = screenTiles.get(peerId);
  if (!entry) return;
  if (document.fullscreenElement === entry.tileEl) document.exitFullscreen();
  entry.call.close(); // no-op if it's already closing/closed — this is often called from that path
  entry.videoEl.srcObject = null; // release the remote stream immediately rather than waiting on GC
  entry.tileEl.remove();
  screenTiles.delete(peerId);
  playScreenShareSound(false);
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

  renderShareButtons();
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
  renderShareButtons();
  playScreenShareSound(false);
  log(t('log.stoppedSharing'));
}

// --- mic pipeline ---------------------------------------------------------
// mic -> RNNoise AudioWorklet (see rnnoise-worklet.js) -> MediaStream that goes
// out over WebRTC. The output stream exists for the whole session, so calls can
// be handed it before the mic is even open; the mic itself is only plugged in
// while we're in a call (startMic/stopMic), and the graph is suspended between
// calls. Holding the mic the rest of the time would keep Windows' "using your
// microphone" indicator on and the capture/echo-cancellation pipeline running
// for nothing.

let rnnoiseEnabled = true; // the setting; whether it's actually running is rnnoiseReady
let rnnoiseReady = false; // WASM loaded into the worklet
let audioCtx = null;
let micDest = null; // MediaStreamAudioDestinationNode whose stream is processedStream
let micOut = null; // everything bound for micDest goes through here — see buildProcessedStream
let noiseNode = null; // the AudioWorkletNode, once loaded (first call)
let noiseNodeLoading = null;
let micSourceNode = null;
let micStarting = null;

function buildProcessedStream() {
  audioCtx = new AudioContext({ sampleRate: 48000 }); // RNNoise works on 48 kHz frames
  micDest = audioCtx.createMediaStreamDestination();
  // Tapped by the speaking indicator, so ours lights up for what others actually
  // hear: after noise suppression, and never while muted.
  micOut = audioCtx.createGain();
  micOut.connect(micDest);
  speakingAnalysers.set(SELF, makeAnalyser(micOut));
  audioCtx.suspend().catch(() => {}); // idle until a call starts — see startMic
  return micDest.stream;
}

// Loads the worklet (once) and, if suppression is on, RNNoise into it — on the
// first call rather than at startup, since the WASM module reserves 16 MB. If
// the worklet can't load at all, the mic is wired straight to the output
// instead and the browser's built-in suppression covers for it (micConstraints).
function ensureNoiseNode() {
  if (noiseNode) return ensureRnnoise();
  if (!noiseNodeLoading) {
    noiseNodeLoading = (async () => {
      try {
        await audioCtx.audioWorklet.addModule('rnnoise-worklet.js');
        noiseNode = new AudioWorkletNode(audioCtx, 'rnnoise', {
          numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
          channelCount: 1, channelCountMode: 'explicit',
        });
        noiseNode.connect(micOut);
        noiseNode.port.postMessage({ type: 'muted', value: !isTransmitting() });
        noiseNode.port.postMessage({ type: 'enabled', value: rnnoiseEnabled });
        await ensureRnnoise();
      } catch (err) {
        log(t('log.rnnoiseFailed', { error: err.message || err }));
      }
    })();
  }
  return noiseNodeLoading;
}

let rnnoiseLoading = null;
function ensureRnnoise() {
  if (!noiseNode || !rnnoiseEnabled || rnnoiseReady) return Promise.resolve();
  if (!rnnoiseLoading) {
    rnnoiseLoading = (async () => {
      try {
        const bytes = await (await fetch('rnnoise.wasm')).arrayBuffer();
        const reply = new Promise((resolve) => {
          noiseNode.port.onmessage = (e) => resolve(e.data);
        });
        noiseNode.port.postMessage({ type: 'wasm', bytes }, [bytes]);
        const result = await reply;
        if (result.type !== 'ready') throw new Error(result.error);
        rnnoiseReady = true;
        log(t('log.rnnoiseActive'));
      } catch (err) {
        log(t('log.rnnoiseFailed', { error: err.message || err }));
      } finally {
        rnnoiseLoading = null;
      }
    })();
  }
  return rnnoiseLoading;
}

function micConstraints() {
  // With RNNoise doing the denoising, the browser's own suppression on top would
  // just double-process the same audio through two different denoisers.
  const builtInSuppression = rnnoiseReady ? false : getNoiseSuppressionEnabled();
  const device = getMicDevice();
  return {
    audio: {
      noiseSuppression: builtInSuppression, voiceIsolation: builtInSuppression, echoCancellation: true, autoGainControl: true,
      // "ideal", not "exact": an unplugged headset falls back to the default mic instead of failing the call.
      ...(device && { deviceId: { ideal: device } }),
    },
    video: false,
  };
}

// --- audio devices ---------------------------------------------------------
// Which mic and speakers to use, by deviceId; empty means the Windows default.

function getMicDevice() {
  return localStorage.getItem('patycord.micDevice') || '';
}

function getSpeakerDevice() {
  return localStorage.getItem('patycord.speakerDevice') || '';
}

function setMicDevice(id) {
  localStorage.setItem('patycord.micDevice', id);
  // Mid-call, swap over right away. What goes out over WebRTC is the pipeline's
  // output stream, not the mic itself, so the call never notices the change.
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
    micSourceNode?.disconnect();
    micSourceNode = null;
    startMic();
  }
  if (micMeter) startMicMeter();
}

function setSpeakerDevice(id) {
  localStorage.setItem('patycord.speakerDevice', id);
  for (const entry of calls.values()) applySpeakerTo(entry.audioEl);
  for (const { videoEl } of screenTiles.values()) applySpeakerTo(videoEl);
  applySpeakerTo(uiSoundCtx);
}

// Works on <audio>/<video> elements and AudioContexts alike.
function applySpeakerTo(target) {
  if (target?.setSinkId) target.setSinkId(getSpeakerDevice()).catch(() => {});
}

async function populateDeviceSelects() {
  let devices = [];
  try { devices = await navigator.mediaDevices.enumerateDevices(); } catch {}
  fillDeviceSelect(micSelectEl, devices.filter((d) => d.kind === 'audioinput'), getMicDevice());
  fillDeviceSelect(speakerSelectEl, devices.filter((d) => d.kind === 'audiooutput'), getSpeakerDevice());
}

function fillDeviceSelect(select, devices, selected) {
  select.innerHTML = '';
  const add = (value, label) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    select.appendChild(opt);
  };
  add('', t('settings.systemDefault'));
  // Chromium also lists the Windows default/communications devices as aliases of
  // real ones — our own "System default" entry above covers those.
  const real = devices.filter((d) => d.deviceId !== 'default' && d.deviceId !== 'communications');
  real.forEach((d, i) => add(d.deviceId, d.label || t('settings.deviceN', { n: i + 1 })));
  select.value = real.some((d) => d.deviceId === selected) ? selected : '';
}

// Live input level for the chosen mic while Settings → Audio is open, from a
// short-lived capture of its own — so it works outside calls too, and stops
// (releasing the mic) as soon as you leave that tab.
let micMeter = null;

async function startMicMeter() {
  stopMicMeter();
  const meter = {};
  micMeter = meter;
  try {
    const stream = await navigator.mediaDevices.getUserMedia(micConstraints());
    if (micMeter !== meter) { stream.getTracks().forEach((track) => track.stop()); return; } // closed meanwhile
    meter.stream = stream;
    meter.ctx = new AudioContext();
    const analyser = meter.ctx.createAnalyser();
    analyser.fftSize = 1024;
    meter.ctx.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const tick = () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += s * s;
      const db = 20 * Math.log10(Math.sqrt(sum / samples.length) || 1e-6);
      micMeterFillEl.style.width = `${Math.max(0, Math.min(1, (db + 60) / 60)) * 100}%`; // -60 dB .. 0 dB
      meter.raf = requestAnimationFrame(tick);
    };
    tick();
  } catch {
    if (micMeter === meter) micMeter = null;
  }
}

function stopMicMeter() {
  if (!micMeter) return;
  cancelAnimationFrame(micMeter.raf);
  micMeter.stream?.getTracks().forEach((track) => track.stop());
  micMeter.ctx?.close().catch(() => {});
  micMeter = null;
  micMeterFillEl.style.width = '0%';
}

navigator.mediaDevices?.addEventListener('devicechange', () => {
  if (!settingsModal.hidden) populateDeviceSelects();
});

function startMic() {
  if (localStream || micStarting) return;
  micStarting = (async () => {
    try {
      await ensureNoiseNode();
      const stream = await navigator.mediaDevices.getUserMedia(micConstraints());
      if (calls.size === 0) { // the call already ended while we were waiting on the mic
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      localStream = stream;
      applyTransmitState();
      micSourceNode = audioCtx.createMediaStreamSource(stream);
      micSourceNode.connect(noiseNode || micOut);
      await audioCtx.resume();
    } catch (err) {
      toast(t('toast.micFailed', { error: err.message }));
    } finally {
      micStarting = null;
    }
  })();
}

function stopMic() {
  localStream?.getTracks().forEach((track) => track.stop());
  localStream = null;
  micSourceNode?.disconnect();
  micSourceNode = null;
  noiseNode?.port.postMessage({ type: 'reset' }); // don't open the next call with the tail end of this one
  audioCtx?.suspend().catch(() => {});
}

// Whether our mic should actually be going out right now.
function isTransmitting() {
  return !muted && (!pushToTalkActive() || pttHeld);
}

// --- push to talk ------------------------------------------------------
// With it on, the mic only goes out while the chosen key or mouse button is
// held. lib.rs watches the key system-wide (so it works with a game focused)
// and only while we tell it to: during a call, with push-to-talk on.

let pttHeld = false;
let pttCapturing = false;

function getPttEnabled() {
  return localStorage.getItem('patycord.pttEnabled') === 'on';
}

function getPttKey() {
  try { return JSON.parse(localStorage.getItem('patycord.pttKey')); } catch { return null; } // { vk, label }
}

function pushToTalkActive() {
  return getPttEnabled() && !!getPttKey();
}

function syncPushToTalk() {
  const watching = pushToTalkActive() && calls.size > 0;
  window.__TAURI__?.core?.invoke('set_push_to_talk_key', { vk: watching ? getPttKey().vk : 0 }).catch(() => {});
  if (!watching) pttHeld = false;
  applyTransmitState();
}

function setPttHeld(held) {
  if (held === pttHeld) return;
  pttHeld = held;
  applyTransmitState();
}

function renderPttSettings() {
  pttToggle.checked = getPttEnabled();
  pttKeyRow.hidden = !getPttEnabled();
  pttKeyBtn.textContent = pttCapturing ? t('settings.pttPressKey') : getPttKey()?.label || t('settings.pttNoKey');
}

// Windows virtual-key codes for the mouse buttons worth binding (not left/right).
const MOUSE_BUTTON_VK = { 1: [0x04, 'Mouse 3'], 3: [0x05, 'Mouse 4'], 4: [0x06, 'Mouse 5'] };

function keyLabel(e) {
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
  if (/^Digitd$/.test(e.code)) return e.code.slice(5);
  if (/^Numpad/.test(e.code)) return 'Num ' + e.code.slice(6);
  return e.key.length === 1 ? e.key.toUpperCase() : e.code || e.key;
}

function finishPttCapture(key) {
  pttCapturing = false;
  if (key) localStorage.setItem('patycord.pttKey', JSON.stringify(key));
  renderPttSettings();
  syncPushToTalk();
}

// Capture phase, so Esc cancels the capture rather than also closing Settings.
window.addEventListener('keydown', (e) => {
  if (!pttCapturing) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  // keyCode is deprecated, but on Windows it's exactly the virtual-key code
  // GetAsyncKeyState wants, layout-independent.
  finishPttCapture(e.key === 'Escape' ? null : { vk: e.keyCode, label: keyLabel(e) });
}, true);
window.addEventListener('mousedown', (e) => {
  if (!pttCapturing || !MOUSE_BUTTON_VK[e.button]) return;
  e.preventDefault();
  const [vk, label] = MOUSE_BUTTON_VK[e.button];
  finishPttCapture({ vk, label });
}, true);

pttToggle.addEventListener('change', () => {
  localStorage.setItem('patycord.pttEnabled', pttToggle.checked ? 'on' : 'off');
  pttCapturing = pttToggle.checked && !getPttKey(); // turning it on with no key yet: ask for one straight away
  renderPttSettings();
  syncPushToTalk();
  renderCallPanel();
});
pttKeyBtn.addEventListener('click', () => {
  pttCapturing = true;
  renderPttSettings();
});

window.__TAURI__?.event?.listen('ptt-changed', (event) => setPttHeld(event.payload === true));

// Outside the Tauri app (browser testing) there's no system-wide watcher, so
// fall back to the key while this page has focus.
if (!window.__TAURI__) {
  const matches = (vk) => pushToTalkActive() && calls.size > 0 && vk === getPttKey().vk;
  window.addEventListener('keydown', (e) => { if (!pttCapturing && matches(e.keyCode)) setPttHeld(true); });
  window.addEventListener('keyup', (e) => { if (matches(e.keyCode)) setPttHeld(false); });
}

// Pushes isTransmitting() to both the mic track and the worklet (which then
// skips denoising silence entirely).
function applyTransmitState() {
  const on = isTransmitting();
  localStream?.getAudioTracks().forEach((track) => (track.enabled = on));
  noiseNode?.port.postMessage({ type: 'muted', value: !on });
}

// Run once at launch, only to find out whether there's a usable mic at all — so a
// problem shows up front instead of in the middle of someone's first call. The
// mic is closed again straight away; startMic opens it for real per call.
async function requestMic() {
  try {
    const check = await navigator.mediaDevices.getUserMedia(micConstraints());
    log(t('log.micSettings', { json: JSON.stringify(check.getAudioTracks()[0]?.getSettings()) }));
    check.getTracks().forEach((track) => track.stop());
  } catch (err) {
    toast(t('toast.micFailed', { error: err.message }));
    micAccessFailed = true;
    myIdEl.textContent = t('myId.micNeeded');
    myIdEl.removeAttribute('data-i18n'); // same reasoning as the peer.on('open') case above
    renderPeerList(); // shows the notice bar explaining the mic problem
    return false;
  }
  rnnoiseEnabled = getNoiseSuppressionEnabled();
  processedStream = buildProcessedStream();
  return true;
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
  // Closing cleanly tells everyone we're connected to straight away (their side
  // of each connection closes immediately), rather than leaving them to notice
  // when ICE times out. Quitting from the tray tears the page down the same way.
  window.addEventListener('pagehide', () => peer?.destroy());

  // Uses PeerJS's free public cloud broker for signaling only. The automated
  // browser tests (tests/) inject options pointing at a local one instead —
  // never set inside the app itself.
  const testPeerOptions = window.__TAURI__ ? undefined : window.__patycordTestPeerOptions;
  peer = new Peer(getMyPersistentId(), testPeerOptions);

  peer.on('open', (id) => {
    myIdEl.innerHTML = tagHtml(id, getMyUsername());
    myIdEl.removeAttribute('data-i18n'); // it's showing real content now — a static-translation sweep must never clobber it back to "connecting…"
    log(t('log.ready'));
    renderPeerList();
    probeAllFriends({ everyone: true });
    reconnectAttempts = 0; // a successful (re)connect resets the backoff
    if (!presenceProbeInterval) presenceProbeInterval = setInterval(probeAllFriends, PRESENCE_SWEEP_MS);
  });

  peer.on('call', (call) => {
    if (call.metadata?.type === 'screen') {
      handleIncomingScreenShare(call);
      return;
    }
    admitIncomingCall(call);
  });

  peer.on('connection', (conn) => handleIncomingDataConnection(conn));

  peer.on('error', (err) => {
    // "Could not connect to peer <id>" from the broker means they're not online right
    // now — clean up the dialing state immediately instead of waiting for the timeout,
    // and show a plain-English toast instead of the raw broker error.
    if (err.type === 'peer-unavailable') {
      const match = /peer\s+(\S+)/.exec(err.message || '');
      const id = match?.[1];
      if (id) dropDeadConnectionsTo(id);
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

  sendRequestBtn.addEventListener('click', () => {
    const id = peerIdInput.value.trim();
    if (!id) { peerIdInput.focus(); return; }
    if (id === peer.id) { toast(t('toast.ownId'), 'info'); return; }
    // Real IDs are 'p-<uuid>'; what people see on screen is the Name#1234 tag, so
    // that's the likeliest wrong thing to get pasted here.
    if (!id.startsWith('p-') && /#[0-9a-z]{4}$/i.test(id)) { toast(t('toast.looksLikeTag'), 'info'); return; }
    const existing = loadFriends().find((f) => f.id === id);
    if (existing && existing.status !== 'pending') {
      toast(t('toast.alreadyFriend', { name: nameFor(existing) }), 'info');
      peerIdInput.value = '';
      sendRequestBtn.disabled = true;
      return;
    }
    // Re-adding someone still pending just sends the request again — the way to
    // retry if they weren't online the first time.
    addFriend(id, 'pending');
    sendFriendRequest(id);
    peerIdInput.value = '';
    sendRequestBtn.disabled = true;
    toast(t('toast.requestSent'), 'info');
    log(t('log.friendRequestSent', { name: friendName(id) }));
  });

  peerIdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendRequestBtn.click();
  });
}

// `label` is a function rather than a string so the button reverts to text in
// whatever language is current by then, not the one it was clicked in.
function copyMyId(btn, label) {
  if (!peer) return;
  navigator.clipboard.writeText(peer.id); // the real connection ID, not the pretty tag shown on screen
  btn.textContent = t('settings.copied');
  setTimeout(() => (btn.textContent = label()), 1200);
}

copyBtn.addEventListener('click', () => copyMyId(copyBtn, () => t('settings.copy')));
myIdEl.addEventListener('click', () => copyMyId(copyBtn, () => t('settings.copy')));
// Like Discord, clicking yourself in the bottom-left corner copies who you are.
// Like Discord, clicking yourself in the bottom-left corner is where you set
// your status — and copy who you are.
userInfoEl.addEventListener('click', () => {
  const rect = userInfoEl.getBoundingClientRect();
  openMenu([
    { label: t('status.online'), icon: '<span class="dot online"></span>', checked: !getDnd(), action: () => setDnd(false) },
    { label: t('status.dnd'), desc: t('status.dndDesc'), icon: '<span class="dot dnd"></span>', checked: getDnd(), action: () => setDnd(true) },
    { separator: true },
    peer && { label: t('menu.copyMyId'), icon: ICONS.copy, action: () => {
      copyMyId(myTagEl, myTagText);
      myTagEl.hidden = false;
      myActivityEl.hidden = true;
      setTimeout(renderMyActivity, 1200);
    } },
  ], rect.left, rect.top - 6, { above: true });
});

settingsBtn.addEventListener('click', () => {
  settingsNameInput.value = getMyUsername();
  noiseSuppressionToggle.checked = getNoiseSuppressionEnabled();
  pttCapturing = false;
  renderPttSettings();
  closeToTrayToggle.checked = getCloseToTray();
  notificationsToggle.checked = getDesktopNotifications();
  // The registry entry is the source of truth — it can also be removed from Task Manager's Startup tab.
  tauriInvoke('plugin:autostart|is_enabled').then((on) => { startWithWindowsToggle.checked = !!on; }).catch(() => {});
  shareActivityToggle.checked = getShareActivityEnabled();
  settingsModal.hidden = false;
  showSettingsPane('account');
  appVersionEl.textContent = '';
  window.__TAURI__?.app.getVersion().then((v) => { appVersionEl.textContent = `patycord v${v}`; });
});
closeSettingsBtn.addEventListener('click', closeSettings);

const settingsTabBtns = document.querySelectorAll('.settingsTabBtn');
const settingsPanes = document.querySelectorAll('.settingsPane');
for (const btn of settingsTabBtns) {
  btn.addEventListener('click', () => showSettingsPane(btn.dataset.tab));
}

function showSettingsPane(name) {
  for (const b of settingsTabBtns) b.classList.toggle('active', b.dataset.tab === name);
  for (const pane of settingsPanes) pane.hidden = pane.dataset.pane !== name;
  if (name === 'audio') {
    populateDeviceSelects();
    startMicMeter();
  } else {
    stopMicMeter();
  }
}

function closeSettings() {
  settingsModal.hidden = true;
  stopMicMeter();
}

for (const select of [micSelectEl, speakerSelectEl, languageSelectEl]) enhanceSelect(select);
micSelectEl.addEventListener('change', () => setMicDevice(micSelectEl.value));
speakerSelectEl.addEventListener('change', () => setSpeakerDevice(speakerSelectEl.value));
speakerTestBtn.addEventListener('click', playRing);
// No output-device switching in this webview: hide the picker rather than show one that does nothing.
if (!('setSinkId' in HTMLMediaElement.prototype)) {
  const row = speakerSelectEl.closest('.row');
  row.hidden = true;
  row.previousElementSibling.hidden = true; // its label
}
noiseSuppressionToggle.addEventListener('change', () => {
  setNoiseSuppressionEnabled(noiseSuppressionToggle.checked);
});
shareActivityToggle.addEventListener('change', () => {
  setShareActivityEnabled(shareActivityToggle.checked);
});
notificationsToggle.addEventListener('change', () => {
  localStorage.setItem('patycord.notifications', notificationsToggle.checked ? 'on' : 'off');
});
closeToTrayToggle.addEventListener('change', () => {
  localStorage.setItem('patycord.closeToTray', closeToTrayToggle.checked ? 'on' : 'off');
  syncTraySettings();
});
startWithWindowsToggle.addEventListener('change', async () => {
  try {
    await tauriInvoke(startWithWindowsToggle.checked ? 'plugin:autostart|enable' : 'plugin:autostart|disable');
  } catch (err) {
    log(`start with Windows: ${err.message || err}`);
  }
  startWithWindowsToggle.checked = !!(await tauriInvoke('plugin:autostart|is_enabled').catch(() => false)); // show what actually stuck
});
settingsSaveNameBtn.addEventListener('click', () => {
  const name = settingsNameInput.value.trim();
  if (!name) return;
  setMyUsername(name);
  closeSettings();
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
  renderMuteButtons();
  renderShareButtons();
  renderMyStatus();
  if (currentView === 'dm') enterDm(openChatPeerId);
  else if (currentView === 'call') showCallChat();
  friendsEmptyKind = null; // force renderFriendsEmpty (via renderPeerList below) to rebuild in the new language
  welcomeStepsEl.innerHTML = ''; // same for the Add Friend tab's steps
  syncTraySettings(); // relabels the tray menu
  renderMyActivity();
  renderPeerList();
  renderIncomingCalls();
}

chatSendBtn.addEventListener('click', sendChatMessage);
chatInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChatMessage();
  // Up in an empty box edits your last message, like Discord.
  if (e.key === 'ArrowUp' && !chatInputEl.value && currentView === 'dm') {
    const mine = (chatHistories.get(openChatPeerId) || []).filter((m) => m.fromId === peer?.id && m.id && !m.file);
    if (mine.length) { e.preventDefault(); startEditing(mine[mine.length - 1].id); }
  }
});
chatInputEl.addEventListener('input', sendTyping);
chatInputEl.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (!files.length || currentView !== 'dm') return;
  e.preventDefault();
  sendFiles(openChatPeerId, files);
});
attachBtn.addEventListener('click', () => fileInputEl.click());
fileInputEl.addEventListener('change', () => {
  if (currentView === 'dm') sendFiles(openChatPeerId, [...fileInputEl.files]);
  fileInputEl.value = '';
});
chatMessagesEl.addEventListener('click', (e) => {
  const link = e.target.closest('.msgLink');
  if (link) { e.preventDefault(); openExternal(link.href); return; }
  const image = e.target.closest('.msgImage');
  if (image) { openLightbox(image.src, image.alt); return; }
  const msgEl = e.target.closest('.chatMsg');
  const msgId = msgEl?.dataset.msgId;
  if (!msgId) return;
  if (e.target.closest('.editMsgBtn')) startEditing(msgId);
  else if (e.target.closest('.deleteMsgBtn')) requestDeleteMessage(msgId, e.shiftKey);
});

// Dropping a file onto a DM sends it. Anywhere else, a drop must not make the
// window navigate to the file instead.
let dragDepth = 0;
const draggingFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());
chatPaneEl.addEventListener('dragenter', (e) => {
  if (!draggingFiles(e) || currentView !== 'dm') return;
  dragDepth++;
  document.getElementById('dropText').textContent = t('chat.dropHere', { name: friendName(openChatPeerId) });
  dropOverlayEl.hidden = false;
});
chatPaneEl.addEventListener('dragleave', () => {
  if (dragDepth && --dragDepth === 0) dropOverlayEl.hidden = true;
});
chatPaneEl.addEventListener('drop', (e) => {
  dragDepth = 0;
  dropOverlayEl.hidden = true;
  if (currentView === 'dm' && e.dataTransfer?.files.length) sendFiles(openChatPeerId, [...e.dataTransfer.files]);
});

// The call view and the sidebar's bottom corner each have their own mute,
// share-screen and leave buttons — both sets do the same thing.
for (const btn of [muteBtn, panelMuteBtn]) {
  btn.addEventListener('click', () => {
    // Unmuting while deafened undeafens too, like Discord.
    if (deafened) { deafened = false; muted = false; applyDeafen(); }
    else muted = !muted;
    applyTransmitState(); // startMic applies it too, if the mic isn't open yet
    renderMuteButtons();
    playMuteSound(muted);
    renderCallPanel(); // our own tile shows the muted badge
    sendVoiceState();
  });
}

for (const btn of [deafenBtn, panelDeafenBtn]) {
  btn.addEventListener('click', () => setDeafened(!deafened));
}

for (const btn of [leaveCallBtn, panelLeaveBtn]) {
  btn.addEventListener('click', () => {
    for (const id of [...calls.keys()]) hangUp(id);
  });
}

for (const btn of [shareScreenBtn, panelShareBtn]) {
  btn.addEventListener('click', () => {
    if (screenStream) stopScreenShare();
    else toggleScreenSharePopover(btn);
  });
}

homeBtn.addEventListener('click', () => showFriends());
friendsNavBtn.addEventListener('click', () => showFriends());
railAddBtn.addEventListener('click', () => showFriends('add'));
dmAddBtn.addEventListener('click', () => showFriends('add'));
for (const btn of friendsTabBtns) btn.addEventListener('click', () => showFriends(btn.dataset.tab));
voiceInfoEl.addEventListener('click', showCallView);
dmCallBtn.addEventListener('click', () => {
  if (calls.has(openChatPeerId)) showCallView();
  else connectTo(openChatPeerId);
});
callChatToggleBtn.addEventListener('click', () => {
  callChatOpen = !callChatOpen;
  renderView();
  if (callChatOpen) chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
});
dmSearchEl.addEventListener('input', () => { dmFilter = dmSearchEl.value; renderPeerList(); });
friendsSearchEl.addEventListener('input', () => { friendsFilter = friendsSearchEl.value; renderPeerList(); });
peerIdInput.addEventListener('input', () => { sendRequestBtn.disabled = !peerIdInput.value.trim(); });

logToggleBtn.addEventListener('click', () => {
  logPanel.hidden = !logPanel.hidden;
  logToggleBtn.classList.toggle('open', !logPanel.hidden);
  if (!logPanel.hidden) renderLog();
});

usernameInput.addEventListener('input', () => {
  usernameAvatar.textContent = initialsFor(usernameInput.value);
  usernameAvatar.style.background = colorForId(usernameInput.value || getMyPersistentId());
});

renderMuteButtons();
renderShareButtons();
shareScreenBtn.innerHTML = ICONS.monitor;
panelShareBtn.innerHTML = ICONS.monitor;
leaveCallBtn.innerHTML = ICONS.phoneOff;
panelLeaveBtn.innerHTML = ICONS.phoneOff;
logToggleBtn.innerHTML = ICONS.list;
settingsBtn.innerHTML = ICONS.gear;
railAddBtn.innerHTML = ICONS.plus;
dmAddBtn.innerHTML = ICONS.plus;
friendsNavBtn.querySelector('.navIcon').innerHTML = ICONS.users;
document.getElementById('friendsHeaderIcon').innerHTML = ICONS.users;
document.getElementById('dmHeaderIcon').innerHTML = ICONS.at;
document.getElementById('callHeaderIcon').innerHTML = ICONS.volumeHigh;
document.getElementById('chatPaneIcon').innerHTML = ICONS.chat;
voiceStatusIconEl.innerHTML = ICONS.signal;
dmCallBtn.innerHTML = ICONS.phone;
callChatToggleBtn.innerHTML = ICONS.chat;
chatSendBtn.innerHTML = ICONS.send;
attachBtn.innerHTML = ICONS.plusCircle;
document.getElementById('dropIcon').innerHTML = ICONS.upload;
chatHeaderNameEl.addEventListener('contextmenu', (e) => { if (openChatPeerId) showFriendMenu(e, openChatPeerId); });
renderMyStatus();

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

// Esc, or a click on the dimmed backdrop, closes whichever dismissible modal or
// popover is open — but never the first-run name prompt, which needs an answer.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!releaseNotesModalEl.hidden) closeReleaseNotes();
  else if (!settingsModal.hidden) closeSettings();
  closeVolumePopover();
  closeScreenSharePopover();
});
settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettings(); });
releaseNotesModalEl.addEventListener('click', (e) => { if (e.target === releaseNotesModalEl) closeReleaseNotes(); });

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
    const notesTitle = t('update.available', { version: update.version, current: update.currentVersion });
    updateBannerNotesBtn.hidden = !notes;
    updateBannerNotesBtn.onclick = () => openReleaseNotes(notesTitle, notes);
    updateBannerEl.hidden = false;
    if (notes) openReleaseNotes(notesTitle, notes); // shown up front — the button above just reopens it if dismissed
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
  const notesTitle = t('whatsNew.title', { version: info.version });
  whatsNewTextEl.textContent = notesTitle;
  const notes = (info.notes || '').trim();
  whatsNewNotesBtn.hidden = !notes;
  whatsNewNotesBtn.onclick = () => openReleaseNotes(notesTitle, notes);
  whatsNewBannerEl.hidden = false;
  if (notes) openReleaseNotes(notesTitle, notes); // shown up front — the button above just reopens it if dismissed
  whatsNewBtn.addEventListener('click', () => {
    whatsNewBannerEl.hidden = true;
    justUpdatedInfo = null;
  }, { once: true });
}

// Everything below depends on secureStore being loaded first (friends, chat
// history, the persistent ID) — wrapped in one async entry point rather than
// scattering awaits through what used to be plain top-level statements.
async function init() {
  applyStaticTranslations(); // before anything renders, including the username prompt modal
  await initSecureStore();
  await initIdentity();
  chatHistories = loadChatHistories();
  pendingMessages = loadPendingMessages();
  unreadCounts = loadUnreadCounts();
  renderUnreadTitle();
  if (getMyUsername()) setMyUsername(getMyUsername());
  saveFriends(loadFriends()); // persist the cleanup of any bad entries from past bugs
  if (!acceptedFriends().length) friendsTab = 'add'; // nobody to list yet — start where you add someone
  renderPeerList();
  showWhatsNewIfJustUpdated();

  // Rust side polls running processes and tells us if a known game is open —
  // focused or just running in the background (or null if none is) — only fires in
  // the real Tauri app, never in a plain browser. We just relay whatever it says to
  // friends; see lib.rs for the actual detection against src-tauri/game-names.json.
  syncActivityDetection(); // the Rust side starts with detection off until told otherwise
  syncTraySettings();
  window.__TAURI__?.event?.listen('active-app-changed', (event) => {
    myActivity = typeof event.payload === 'string' ? event.payload : null;
    renderMyActivity();
    scheduleRenderPeerList();
    broadcastActivity();
  });

  main();
  checkForUpdates();
}

init();
