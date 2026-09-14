const myIdEl = document.getElementById('myId');
const copyBtn = document.getElementById('copyBtn');
const friendNameInput = document.getElementById('friendNameInput');
const peerIdInput = document.getElementById('peerIdInput');
const callBtn = document.getElementById('callBtn');
const peerListEl = document.getElementById('peerList');
const peerCountEl = document.getElementById('peerCount');
const muteBtn = document.getElementById('muteBtn');
const retryMicBtn = document.getElementById('retryMicBtn');
const statusEl = document.getElementById('status');
const incomingCallsEl = document.getElementById('incomingCalls');

let localStream = null;
let muted = false;
let peer = null;
const calls = new Map(); // peerId -> { call, audioEl }
const dataConnections = new Map(); // peerId -> DataConnection, for peers who joined *through* us
const presence = new Map(); // peerId -> boolean, from lightweight background probes
const pendingCalls = new Map(); // peerId -> MediaConnection, awaiting Accept/Decline

// --- persistent identity & friends list -------------------------------

function getMyPersistentId() {
  let id = localStorage.getItem('patycord.myId');
  if (!id) {
    id = 'p-' + crypto.randomUUID();
    localStorage.setItem('patycord.myId', id);
  }
  return id;
}

function loadFriends() {
  try {
    return JSON.parse(localStorage.getItem('patycord.friends') || '[]');
  } catch {
    return [];
  }
}

function saveFriends(friends) {
  localStorage.setItem('patycord.friends', JSON.stringify(friends));
}

function addFriend(name, id) {
  const friends = loadFriends();
  const existing = friends.find((f) => f.id === id);
  if (existing) {
    existing.name = name;
  } else {
    friends.push({ id, name });
  }
  saveFriends(friends);
  renderPeerList();
}

function removeFriend(id) {
  saveFriends(loadFriends().filter((f) => f.id !== id));
  renderPeerList();
}

// --- UI ------------------------------------------------------------

function log(msg) {
  statusEl.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + statusEl.textContent;
}

function renderPeerList() {
  const friends = loadFriends();
  peerListEl.innerHTML = '';

  if (friends.length === 0 && calls.size === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No friends added yet — add one above.';
    peerListEl.appendChild(li);
  }

  for (const friend of friends) {
    const inCall = calls.has(friend.id);
    const connected = !!calls.get(friend.id)?.audioEl; // stream actually flowing, not just dialing
    const isOnline = connected || presence.get(friend.id);
    const li = document.createElement('li');
    const buttonLabel = inCall ? (connected ? 'Hang up' : 'Cancel') : 'Call';
    li.innerHTML = `
      <span class="status"><span class="dot ${isOnline ? 'online' : ''}"></span>
        <span class="name">${friend.name}</span> <span class="id">${friend.id}</span></span>
      <span class="status">
        <button class="callToggleBtn secondary" data-id="${friend.id}">${buttonLabel}</button>
        <button class="removeBtn" data-id="${friend.id}" title="Remove">×</button>
      </span>`;
    li.querySelector('.callToggleBtn').addEventListener('click', () => {
      if (calls.has(friend.id)) hangUp(friend.id);
      else connectTo(friend.id);
    });
    li.querySelector('.removeBtn').addEventListener('click', () => removeFriend(friend.id));
    peerListEl.appendChild(li);
  }

  // Anyone connected who isn't a saved friend (e.g. joined via mesh discovery)
  const friendIds = new Set(friends.map((f) => f.id));
  for (const id of calls.keys()) {
    if (friendIds.has(id)) continue;
    const li = document.createElement('li');
    li.innerHTML = `<span class="status"><span class="dot online"></span>
      <span class="id">${id}</span> (not saved)</span>`;
    peerListEl.appendChild(li);
  }

  peerCountEl.textContent = calls.size;
}

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
}

function removeCall(peerId) {
  const entry = calls.get(peerId);
  if (entry && entry.audioEl) {
    entry.audioEl.srcObject = null;
  }
  calls.delete(peerId);
  renderPeerList();
  log(`disconnected from ${peerId}`);
}

function wireCall(call) {
  const entry = calls.get(call.peer) || {};
  entry.call = call;
  calls.set(call.peer, entry);
  renderPeerList();

  call.on('stream', (remoteStream) => attachRemoteStream(call.peer, remoteStream));
  call.on('close', () => removeCall(call.peer));
  call.on('error', (err) => { log(`call error (${call.peer}): ${err}`); removeCall(call.peer); });
}

// Connect audio to a peer we've just learned about, unless we're already connected to them.
function meshCall(id) {
  if (!peer || id === peer.id || calls.has(id)) return;
  const call = peer.call(id, localStream);
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
  if (!dataConnections.has(id)) {
    const conn = peer.connect(id);
    conn.on('data', (msg) => handleDataMessage(msg));
    conn.on('error', () => {}); // connectivity errors surface via the call itself
    dataConnections.set(id, conn);
  }
  meshCall(id);
}

// Anyone can act as a discovery hub for whoever joins through their ID: when a new
// peer connects to us, we hand them the list of everyone already in the call (our
// current `calls`), and they take it from there — calling each one directly. Existing
// peers don't need to act on this; they'll just receive an incoming call from the
// new joiner and auto-answer, same as any other call.
function handleIncomingDataConnection(conn) {
  conn.on('open', () => {
    const roster = [...calls.keys()].filter((id) => id !== conn.peer);
    conn.send({ type: 'roster', peers: roster });
    for (const [otherId, otherConn] of dataConnections) {
      if (otherId !== conn.peer) otherConn.send({ type: 'peer-joined', id: conn.peer });
    }
    dataConnections.set(conn.peer, conn);
  });
  conn.on('data', (msg) => handleDataMessage(msg));
  conn.on('close', () => dataConnections.delete(conn.peer));
}

function handleDataMessage(msg) {
  if (msg.type === 'roster') {
    for (const id of msg.peers) meshCall(id);
  } else if (msg.type === 'peer-joined') {
    log(`${msg.id} is joining the call`);
  }
}

// A silent, no-audio connection attempt just to check whether a friend's app is
// currently open — doesn't ring anything on their end.
function probePresence(id) {
  if (!peer || calls.has(id)) return;
  let settled = false;
  const probe = peer.connect(id, { reliable: false });
  const finish = (online) => {
    if (settled) return;
    settled = true;
    presence.set(id, online);
    renderPeerList();
    try { probe.close(); } catch {}
  };
  const timer = setTimeout(() => finish(false), 4000);
  probe.on('open', () => { clearTimeout(timer); finish(true); });
  probe.on('error', () => { clearTimeout(timer); finish(false); });
}

function probeAllFriends() {
  for (const friend of loadFriends()) probePresence(friend.id);
}

function friendName(id) {
  return loadFriends().find((f) => f.id === id)?.name || id;
}

function renderIncomingCalls() {
  incomingCallsEl.innerHTML = '';
  for (const [id, call] of pendingCalls) {
    const div = document.createElement('div');
    div.className = 'incomingCall';
    div.innerHTML = `
      <span>Incoming call from <strong>${friendName(id)}</strong></span>
      <span class="status">
        <button class="acceptBtn">Accept</button>
        <button class="declineBtn">Decline</button>
      </span>`;
    div.querySelector('.acceptBtn').addEventListener('click', () => {
      pendingCalls.delete(id);
      call.answer(localStream);
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

async function requestMic() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    return true;
  } catch (err) {
    log(`microphone access failed: ${err.message} — click "Retry mic access" and allow the prompt`);
    myIdEl.textContent = 'mic access needed';
    return false;
  }
}

async function main() {
  if (!(await requestMic())) return;

  // A stable ID (saved locally) means friends you've added stay valid across restarts.
  peer = new Peer(getMyPersistentId()); // uses PeerJS's free public cloud broker for signaling only

  peer.on('open', (id) => {
    myIdEl.textContent = id;
    log('ready — press Call next to a friend to connect');
    renderPeerList();
    probeAllFriends();
    setInterval(probeAllFriends, 10000);
  });

  peer.on('call', (call) => {
    pendingCalls.set(call.peer, call);
    renderIncomingCalls();
    log(`incoming call from ${friendName(call.peer)}`);
    call.on('close', () => { pendingCalls.delete(call.peer); renderIncomingCalls(); });
  });

  peer.on('connection', (conn) => handleIncomingDataConnection(conn));

  peer.on('error', (err) => {
    log(`peer error: ${err}`);
    // "Could not connect to peer <id>" from the broker means they're not online right
    // now — clean up the dialing state immediately instead of waiting for the timeout.
    if (err.type === 'peer-unavailable') {
      const match = /peer\s+([^\s.]+)/.exec(err.message || '');
      const id = match?.[1];
      if (id && calls.has(id) && !calls.get(id).audioEl) {
        presence.set(id, false);
        hangUp(id);
      }
    }
  });
  peer.on('disconnected', () => log('lost connection to signaling broker, reconnecting…'));

  callBtn.addEventListener('click', () => {
    const name = friendNameInput.value.trim() || 'friend';
    const id = peerIdInput.value.trim();
    if (!id || id === peer.id) return;
    addFriend(name, id);
    friendNameInput.value = '';
    peerIdInput.value = '';
    log(`added ${name} — press Call to connect`);
  });

  peerIdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') callBtn.click();
  });
}

copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(myIdEl.textContent);
  copyBtn.textContent = 'Copied!';
  setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
});

retryMicBtn.addEventListener('click', () => {
  if (localStream) { log('already have mic access'); return; }
  main();
});

muteBtn.addEventListener('click', () => {
  if (!localStream) return;
  muted = !muted;
  localStream.getAudioTracks().forEach((t) => (t.enabled = !muted));
  muteBtn.textContent = muted ? 'Unmute' : 'Mute';
  muteBtn.classList.toggle('muted', muted);
});

renderPeerList();
main();
