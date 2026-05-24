function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 12; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

function showError(msg) {
  const el = document.getElementById('formError');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
}

function clearError() {
  const el = document.getElementById('formError');
  if (el) el.classList.remove('show');
}

function switchMode(mode) {
  clearError();

  const createFields = document.getElementById('createFields');
  const joinFields   = document.getElementById('joinFields');
  const btnCreate    = document.getElementById('modeCreate');
  const btnJoin      = document.getElementById('modeJoin');
  const roomResult   = document.getElementById('roomResult');

  if (roomResult) roomResult.classList.remove('show');

  if (mode === 'create') {
    createFields.classList.add('active');
    joinFields.classList.remove('active');
    btnCreate.classList.add('active');
    btnJoin.classList.remove('active');
  } else {
    joinFields.classList.add('active');
    createFields.classList.remove('active');
    btnJoin.classList.add('active');
    btnCreate.classList.remove('active');
  }
}

function createRoom() {
  clearError();

  const userName = document.getElementById('createName').value.trim();
  const roomName = document.getElementById('createRoomName').value.trim();
  const capacity = document.getElementById('createCapacity').value;

  if (!userName) {
    showError('Please enter your name.');
    document.getElementById('createName').focus();
    return;
  }
  if (!roomName) {
    showError('Please enter a room name.');
    document.getElementById('createRoomName').focus();
    return;
  }

  const roomId = generateRoomId();

  const idSpan  = document.getElementById('createRoomId');
  const result  = document.getElementById('roomResult');
  if (idSpan) idSpan.textContent = roomId;
  if (result) result.classList.add('show');

  localStorage.setItem('userName',     userName);
  localStorage.setItem('roomId',       roomId);
  localStorage.setItem('roomName',     roomName);
  localStorage.setItem('roomCapacity', capacity);
  localStorage.setItem('isHost',       'true');

  console.log(`Room created: ${roomName} (${roomId})`);

  setTimeout(() => { window.location.href = 'canvas.html'; }, 2000);
}

function joinRoom() {
  clearError();

  const userName = document.getElementById('joinName').value.trim();
  const roomId   = document.getElementById('joinRoomId').value.trim().toUpperCase();

  if (!userName) {
    showError('Please enter your name.');
    document.getElementById('joinName').focus();
    return;
  }
  if (!roomId) {
    showError('Please enter a Room ID.');
    document.getElementById('joinRoomId').focus();
    return;
  }
  if (roomId.length !== 12) {
    showError('Room ID must be exactly 12 characters.');
    document.getElementById('joinRoomId').focus();
    return;
  }

  localStorage.setItem('userName', userName);
  localStorage.setItem('roomId',   roomId);
  localStorage.setItem('isHost',   'false');

  console.log(`Joining room: ${roomId} as ${userName}`);
  window.location.href = 'canvas.html';
}

function copyRoomId() {
  const roomId = document.getElementById('createRoomId').textContent;
  if (!roomId || roomId === '—') return;

  const btn  = document.querySelector('.result-copy');

  const done = () => {
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = '✓ Copied';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  };

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(roomId).then(done).catch(() => fallback(roomId, done));
  } else {
    fallback(roomId, done);
  }
}

function fallback(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); cb(); } catch (e) { /**/ }
  document.body.removeChild(ta);
}

document.addEventListener('DOMContentLoaded', () => {
  const isCreateMode = () =>
    document.getElementById('modeCreate').classList.contains('active');

  ['createName', 'createRoomName', 'createCapacity'].forEach(id => {
    document.getElementById(id)?.addEventListener('keypress', e => {
      if (e.key === 'Enter') createRoom();
    });
  });

  ['joinName', 'joinRoomId'].forEach(id => {
    document.getElementById(id)?.addEventListener('keypress', e => {
      if (e.key === 'Enter') joinRoom();
    });
  });

  const roomIdInput = document.getElementById('joinRoomId');
  if (roomIdInput) {
    roomIdInput.addEventListener('input', function () {
      const pos   = this.selectionStart;
      this.value  = this.value.toUpperCase();
      this.setSelectionRange(pos, pos);
    });
  }
});