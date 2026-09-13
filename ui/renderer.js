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
const calls = new Map(); // peerId -> { call, audioEl }

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

  const peer = new Peer(); // uses PeerJS's free public cloud broker for signaling only

  peer.on('open', (id) => {
    myIdEl.textContent = id;
    log('ready — share your ID with a friend');
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    wireCall(call);
    log(`incoming call from ${call.peer}`);
  });

  peer.on('error', (err) => log(`peer error: ${err}`));
  peer.on('disconnected', () => log('lost connection to signaling broker, reconnecting…'));

  callBtn.addEventListener('click', () => {
    const id = peerIdInput.value.trim();
    if (!id) return;
    if (calls.has(id)) { log('already connected to that peer'); return; }
    const call = peer.call(id, localStream);
    wireCall(call);
    peerIdInput.value = '';
    log(`calling ${id}…`);
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
