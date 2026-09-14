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

let localStream = null;
let muted = false;
let peer = null;
const calls = new Map(); // peerId -> { call, audioEl }
const dataConnections = new Map(); // peerId -> DataConnection, for peers who joined *through* us

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
    const online = calls.has(friend.id);
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="status"><span class="dot ${online ? 'online' : ''}"></span>
        <span class="name">${friend.name}</span> <span class="id">${friend.id}</span></span>
      <button class="removeBtn" data-id="${friend.id}" title="Remove">×</button>`;
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

function connectToAllFriends() {
  for (const friend of loadFriends()) connectTo(friend.id);
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
    log('ready — connecting to saved friends who are online…');
    connectToAllFriends();
    renderPeerList();
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    wireCall(call);
    log(`incoming call from ${call.peer}`);
  });

  peer.on('connection', (conn) => handleIncomingDataConnection(conn));

  peer.on('error', (err) => log(`peer error: ${err}`));
  peer.on('disconnected', () => log('lost connection to signaling broker, reconnecting…'));

  callBtn.addEventListener('click', () => {
    const name = friendNameInput.value.trim() || 'friend';
    const id = peerIdInput.value.trim();
    if (!id || id === peer.id) return;
    addFriend(name, id);
    connectTo(id);
    friendNameInput.value = '';
    peerIdInput.value = '';
    log(`added ${name} — connecting…`);
  });

  peerIdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') callBtn.click();
  });

  // Friends who were offline when we launched might come online later — keep trying.
  setInterval(connectToAllFriends, 15000);
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
