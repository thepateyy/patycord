const myIdEl = document.getElementById('myId');
const copyBtn = document.getElementById('copyBtn');
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

function log(msg) {
  statusEl.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + statusEl.textContent;
}

function renderPeerList() {
  peerListEl.innerHTML = '';
  for (const id of calls.keys()) {
    const li = document.createElement('li');
    li.innerHTML = `<span>${id}</span><span>🔊</span>`;
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
  if (id === peer.id || calls.has(id)) return;
  const call = peer.call(id, localStream);
  wireCall(call);
  log(`connecting to ${id}…`);
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

  peer = new Peer(); // uses PeerJS's free public cloud broker for signaling only

  peer.on('open', (id) => {
    myIdEl.textContent = id;
    log('ready — share your ID, or join someone else\'s call with theirs');
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
    const id = peerIdInput.value.trim();
    if (!id || id === peer.id) return;
    if (calls.has(id)) { log('already connected to that peer'); return; }

    // Ask them (as our entry point into the call) who else is already in it.
    const conn = peer.connect(id);
    conn.on('data', (msg) => handleDataMessage(msg));
    dataConnections.set(id, conn);

    meshCall(id);
    peerIdInput.value = '';
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

main();
