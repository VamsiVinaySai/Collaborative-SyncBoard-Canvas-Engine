const canvas       = document.getElementById('canvas');
const ctx          = canvas.getContext('2d');
const remoteCanvas = document.getElementById('remoteCanvas');
const remoteCtx    = remoteCanvas.getContext('2d');

function resizeCanvas() {
  const container   = document.querySelector('.canvas-wrap') || document.querySelector('.stage');
  canvas.width      = container.clientWidth;
  canvas.height     = container.clientHeight;
  remoteCanvas.width  = container.clientWidth;
  remoteCanvas.height = container.clientHeight;
  redrawCanvas();
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('load',   resizeCanvas);

let currentTool        = 'brush';
let currentColor       = '#000000';
let currentStrokeWidth = 3;
let isDrawing          = false;
let startX             = 0;
let startY             = 0;

const history   = [];
const redoStack = [];
const MAX_HISTORY = 50;

let currentStrokeId = null;

let currentUser = {
  name:   localStorage.getItem('userName')  || 'Anonymous',
  roomId: localStorage.getItem('roomId')    || 'LOADING',
  isHost: localStorage.getItem('isHost')    === 'true',
  color:  generateUserColor()
};

const remoteUsers = new Map();

let _lastCursorSend = 0;

function initCanvas() {
  console.log('Initializing canvas…', currentUser);

  const nameEl   = document.getElementById('userNameDisplay');
  const roomEl   = document.getElementById('roomIdDisplay');
  if (nameEl) nameEl.textContent = currentUser.name;
  if (roomEl) roomEl.textContent = currentUser.roomId;

  saveHistory();

  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseup',   stopDrawing);
  canvas.addEventListener('mouseout',  stopDrawing);

  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove',  handleTouchMove,  { passive: false });
  canvas.addEventListener('touchend',   stopDrawing);

  patchConnectionDot();

  connectWebSocket();

  console.log(`Canvas ready — user: ${currentUser.name}, room: ${currentUser.roomId}`);
}

async function connectWebSocket() {
  try {
    const SERVER_URL = 'https://real-time-collaborative-drawing-canvas-ni5j.onrender.com';
    await wsManager.connect(SERVER_URL);

    wsManager.joinRoom({
      roomId:   currentUser.roomId,
      roomName: localStorage.getItem('roomName') || 'Room',
      userName: currentUser.name,
      userColor: currentUser.color,
      capacity: localStorage.getItem('roomCapacity') || 5,
      isHost:   currentUser.isHost
    });

    setupWebSocketListeners();

  } catch (error) {
    console.error('WebSocket connection failed:', error);
    const el = document.getElementById('statusDisplay');
    if (el) { el.textContent = 'Connection Failed'; el.classList.add('error'); }
    const dot = document.getElementById('connDot');
    if (dot) { dot.classList.add('error'); }
  }
}

function setupWebSocketListeners() {

  wsManager.on('users-list', (data) => {
    data.users.forEach(user => {
      if (user.id !== wsManager.socket.id) {
        addRemoteUser(user.id, user.name, user.color);
      }
    });
    updateUsersCount();
  });

  wsManager.on('user-joined', (data) => {
    console.log(`${data.userName} joined`);
    addRemoteUser(data.userId, data.userName, data.userColor);
    updateUsersCount();
    showToast(`${data.userName} joined the room`, 'info');
  });

  wsManager.on('user-left', (data) => {
    const user = remoteUsers.get(data.userId);
    const name = user ? user.name : 'Someone';
    removeRemoteUser(data.userId);
    updateUsersCount();
    showToast(`${name} left the room`, 'info');
  });

  wsManager.on('remote-draw', (data) => {
    drawLineRemote(data.fromX, data.fromY, data.toX, data.toY,
                   data.color, data.width, data.tool);
  });

  wsManager.on('remote-draw-line', (data) => {
    drawLineRemote(data.fromX, data.fromY, data.toX, data.toY,
                   data.color, data.width, data.tool);
  });

  wsManager.on('remote-clear-canvas', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    remoteCtx.clearRect(0, 0, remoteCanvas.width, remoteCanvas.height);
    history.length = 0;
    redoStack.length = 0;
    history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  });

  wsManager.on('full-history-update', (data) => {
    console.log('Full history update received');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    remoteCtx.clearRect(0, 0, remoteCanvas.width, remoteCanvas.height);
    history.length  = 0;
    redoStack.length = 0;

    if (data.history && data.history.length > 0) {
      data.history.forEach(stroke => {
        _replayStroke(ctx,       stroke);
        _replayStroke(remoteCtx, stroke);
      });
    }

    history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  });

  wsManager.on('drawing-history', (data) => {
    data.history.forEach(stroke => {
      drawLineRemote(stroke.fromX, stroke.fromY, stroke.toX, stroke.toY,
                     stroke.color, stroke.width, stroke.tool);
    });
  });

  wsManager.on('remote-cursor-move', (data) => {
    updateRemoteCursor(data.userId, data.x, data.y);
    if (remoteUsers.has(data.userId)) {
      remoteUsers.get(data.userId).x = data.x;
      remoteUsers.get(data.userId).y = data.y;
    }
  });

  wsManager.on('room-error', (data) => {
    /* CHANGED: was alert() — now shows a toast then redirects */
    showToast(data.message, 'error');
    setTimeout(() => { window.location.href = 'index.html'; }, 2000);
  });
}

function _replayStroke(context, stroke) {
  if (stroke.tool === 'eraser') {
    context.clearRect(stroke.fromX - stroke.width / 2,
                      stroke.fromY - stroke.width / 2, stroke.width, stroke.width);
    context.clearRect(stroke.toX  - stroke.width / 2,
                      stroke.toY  - stroke.width / 2, stroke.width, stroke.width);
  } else if (stroke.tool === 'rectangle') {
    context.strokeStyle = stroke.color;
    context.lineWidth   = stroke.width;
    context.strokeRect(stroke.fromX, stroke.fromY,
                       stroke.toX - stroke.fromX, stroke.toY - stroke.fromY);
  } else if (stroke.tool === 'circle') {
    const radius = Math.sqrt(Math.pow(stroke.toX - stroke.fromX, 2) +
                             Math.pow(stroke.toY - stroke.fromY, 2));
    context.strokeStyle = stroke.color;
    context.lineWidth   = stroke.width;
    context.beginPath();
    context.arc(stroke.fromX, stroke.fromY, radius, 0, 2 * Math.PI);
    context.stroke();
  } else {
    context.beginPath();
    context.moveTo(stroke.fromX, stroke.fromY);
    context.lineTo(stroke.toX,   stroke.toY);
    context.strokeStyle = stroke.color;
    context.lineWidth   = stroke.width;
    context.lineCap     = 'round';
    context.lineJoin    = 'round';
    context.stroke();
    context.closePath();
  }
}

function startDrawing(e) {
  isDrawing = true;
  const rect = canvas.getBoundingClientRect();
  startX = e.clientX - rect.left;
  startY = e.clientY - rect.top;
  currentStrokeId = `s-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  if (currentTool === 'line' || currentTool === 'rectangle' || currentTool === 'circle') {
    saveHistory();
  }
}

function handleMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  const x    = e.clientX - rect.left;
  const y    = e.clientY - rect.top;

  const posEl = document.getElementById('posDisplay');
  if (posEl) posEl.textContent = `${Math.round(x)}, ${Math.round(y)}`;

  const now = Date.now();
  if (wsManager && wsManager.isSocketConnected() && now - _lastCursorSend > 33) {
    wsManager.sendCursorMove(x, y);
    _lastCursorSend = now;
  }

  if (!isDrawing) return;

  if (currentTool === 'brush') {
    drawLine(startX, startY, x, y, currentColor, currentStrokeWidth);

    if (wsManager && wsManager.isSocketConnected()) {
      wsManager.sendDraw({
        fromX: startX, fromY: startY, toX: x, toY: y,
        color: currentColor, width: currentStrokeWidth,
        tool: 'brush', strokeId: currentStrokeId
      });
    }
    startX = x; startY = y;

  } else if (currentTool === 'eraser') {
    erase(x, y, currentStrokeWidth);

    if (wsManager && wsManager.isSocketConnected()) {
      wsManager.sendDraw({
        fromX: startX, fromY: startY, toX: x, toY: y,
        color: 'transparent', width: currentStrokeWidth,
        tool: 'eraser', strokeId: currentStrokeId
      });
    }
    startX = x; startY = y;

  } else if (currentTool === 'line' || currentTool === 'rectangle' || currentTool === 'circle') {
    if (history.length > 0) {
      ctx.putImageData(history[history.length - 1], 0, 0);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (currentTool === 'line')      drawLine(startX, startY, x, y, currentColor, currentStrokeWidth);
    if (currentTool === 'rectangle') drawRectangle(startX, startY, x, y, currentColor, currentStrokeWidth);
    if (currentTool === 'circle')    drawCircle(startX, startY, x, y, currentColor, currentStrokeWidth);
  }
}

function stopDrawing(e) {
  if (!isDrawing) return;
  isDrawing = false;

  if ((currentTool === 'line' || currentTool === 'rectangle' || currentTool === 'circle')
      && wsManager && wsManager.isSocketConnected()) {

    let endX = startX, endY = startY;

    if (e) {
      const rect = canvas.getBoundingClientRect();
      if (e.clientX !== undefined) {
        endX = e.clientX - rect.left;
        endY = e.clientY - rect.top;
      } else if (e.touches && e.touches.length > 0) {
        endX = e.touches[0].clientX - rect.left;
        endY = e.touches[0].clientY - rect.top;
      }
    }

    wsManager.sendDrawLine({
      fromX: startX, fromY: startY, toX: endX, toY: endY,
      color: currentColor, width: currentStrokeWidth,
      tool: currentTool,
      strokeId: `s-${Date.now()}-${Math.floor(Math.random() * 100000)}`
    });
  }

  saveHistory();
  currentStrokeId = null;
}

function handleTouchStart(e) {
  const touch = e.touches[0];
  const rect  = canvas.getBoundingClientRect();
  startX = touch.clientX - rect.left;
  startY = touch.clientY - rect.top;
  isDrawing = true;
  currentStrokeId = `s-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  if (currentTool === 'line' || currentTool === 'rectangle' || currentTool === 'circle') {
    saveHistory();
  }
}

function handleTouchMove(e) {
  if (!isDrawing) return;
  const touch = e.touches[0];
  const rect  = canvas.getBoundingClientRect();
  const x     = touch.clientX - rect.left;
  const y     = touch.clientY - rect.top;

  if (currentTool === 'brush') {
    drawLine(startX, startY, x, y, currentColor, currentStrokeWidth);
    if (wsManager && wsManager.isSocketConnected()) {
      wsManager.sendDraw({
        fromX: startX, fromY: startY, toX: x, toY: y,
        color: currentColor, width: currentStrokeWidth,
        tool: 'brush', strokeId: currentStrokeId
      });
    }
    startX = x; startY = y;
  } else if (currentTool === 'eraser') {
    erase(x, y, currentStrokeWidth);
    if (wsManager && wsManager.isSocketConnected()) {
      wsManager.sendDraw({
        fromX: startX, fromY: startY, toX: x, toY: y,
        color: 'transparent', width: currentStrokeWidth,
        tool: 'eraser', strokeId: currentStrokeId
      });
    }
    startX = x; startY = y;
  }
  e.preventDefault();
}

function drawLine(fromX, fromY, toX, toY, color, width) {
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.strokeStyle = color;
  ctx.lineWidth   = width;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.stroke();
  ctx.closePath();
}

function drawLineRemote(fromX, fromY, toX, toY, color, width, tool) {
  if (tool === 'eraser') {
    remoteCtx.clearRect(fromX - width / 2, fromY - width / 2, width, width);
    remoteCtx.clearRect(toX  - width / 2, toY  - width / 2, width, width);
  } else if (tool === 'rectangle') {
    remoteCtx.strokeStyle = color; remoteCtx.lineWidth = width;
    remoteCtx.strokeRect(fromX, fromY, toX - fromX, toY - fromY);
  } else if (tool === 'circle') {
    const radius = Math.sqrt(Math.pow(toX - fromX, 2) + Math.pow(toY - fromY, 2));
    remoteCtx.strokeStyle = color; remoteCtx.lineWidth = width;
    remoteCtx.beginPath();
    remoteCtx.arc(fromX, fromY, radius, 0, 2 * Math.PI);
    remoteCtx.stroke();
  } else {
    remoteCtx.beginPath();
    remoteCtx.moveTo(fromX, fromY);
    remoteCtx.lineTo(toX, toY);
    remoteCtx.strokeStyle = color; remoteCtx.lineWidth = width;
    remoteCtx.lineCap = 'round'; remoteCtx.lineJoin = 'round';
    remoteCtx.stroke(); remoteCtx.closePath();
  }
}

function erase(x, y, size) {
  ctx.clearRect(x - size / 2, y - size / 2, size, size);
}

function drawRectangle(fromX, fromY, toX, toY, color, width) {
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.strokeRect(fromX, fromY, toX - fromX, toY - fromY);
}

function drawCircle(fromX, fromY, toX, toY, color, width) {
  const radius = Math.sqrt(Math.pow(toX - fromX, 2) + Math.pow(toY - fromY, 2));
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(fromX, fromY, radius, 0, 2 * Math.PI);
  ctx.stroke();
}
function selectTool(tool) {
  currentTool = tool;

  document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));

  const toolBtn = document.getElementById(tool + 'Tool');
  if (toolBtn) toolBtn.classList.add('active');

  const labels = { brush: 'Brush', eraser: 'Eraser', line: 'Line', rectangle: 'Rectangle', circle: 'Circle' };
  const cursors = { brush: 'crosshair', eraser: 'cell', line: 'crosshair', rectangle: 'crosshair', circle: 'crosshair' };

  const toolDisplay = document.getElementById('toolDisplay');
  if (toolDisplay) toolDisplay.textContent = labels[tool] || tool;
  canvas.style.cursor = cursors[tool] || 'crosshair';
}

function changeColor(color) {
  currentColor = color;
  const preview = document.getElementById('colorPreview');
  if (preview) preview.style.background = color;
}

function pickPreset(el, color) {
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
  el.classList.add('selected');

  const picker = document.getElementById('colorPicker');
  if (picker) picker.value = color;

  changeColor(color);
}

function handleCustomColor(color) {
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));

  const mobilePicker = document.getElementById('mobileColor');
  if (mobilePicker) mobilePicker.value = color;

  changeColor(color);
}

function changeStrokeWidth(width) {
  currentStrokeWidth = parseInt(width);

  const display = document.getElementById('strokeDisplay');
  if (display) display.textContent = width + 'px';

  const dot = document.getElementById('sizeDotPreview');
  if (dot) {
    const capped = Math.min(parseInt(width), 36); /* cap visual at 36px so it fits */
    dot.style.width  = capped + 'px';
    dot.style.height = capped + 'px';
  }
}

function saveHistory() {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  history.push(imageData);
  if (history.length > MAX_HISTORY) history.shift();
  redoStack.length = 0;
}

function undoAction() {
  console.log('=== UNDO ===');
  if (!wsManager || !wsManager.isSocketConnected()) return;

  if (undoAction._last && Date.now() - undoAction._last < 500) return;
  undoAction._last = Date.now();

  try { wsManager.sendUndo(); } catch (e) { console.error('Undo failed:', e); }
}

function redoAction() {
  console.log('=== REDO ===');
  if (!wsManager || !wsManager.isSocketConnected()) return;

  if (redoAction._last && Date.now() - redoAction._last < 500) return;
  redoAction._last = Date.now();

  try { wsManager.sendRedo(); } catch (e) { console.error('Redo failed:', e); }
}

function redrawCanvas() {
  if (history.length > 0) ctx.putImageData(history[history.length - 1], 0, 0);
}

function clearCanvas() {
  if (confirm('Clear the entire canvas for everyone in this room?')) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    remoteCtx.clearRect(0, 0, remoteCanvas.width, remoteCanvas.height);
    saveHistory();
    if (wsManager && wsManager.isSocketConnected()) wsManager.clearCanvas();
    showToast('Canvas cleared', 'info');
  }
}

function downloadCanvas() {
  const merge  = document.createElement('canvas');
  merge.width  = canvas.width;
  merge.height = canvas.height;
  const mctx   = merge.getContext('2d');
  mctx.fillStyle = '#ffffff';
  mctx.fillRect(0, 0, merge.width, merge.height);
  mctx.drawImage(canvas, 0, 0);
  mctx.drawImage(remoteCanvas, 0, 0);

  const link      = document.createElement('a');
  link.href       = merge.toDataURL('image/png');
  link.download   = `sketchboard-${currentUser.roomId}-${Date.now()}.png`;
  link.click();

  showToast('Canvas downloaded as PNG', 'success');
}

function toggleFullscreen() {
  const el = document.querySelector('.canvas-area');
  if (!document.fullscreenElement) {
    el.requestFullscreen().catch(err => console.warn('Fullscreen error:', err));
  } else {
    document.exitFullscreen();
  }
}

function leaveRoom() {
  if (confirm('Leave this room?')) {
    if (wsManager) wsManager.disconnect();
    localStorage.removeItem('userName');
    localStorage.removeItem('roomId');
    localStorage.removeItem('isHost');
    window.location.href = 'index.html';
  }
}

function generateUserColor() {
  const colors = ['#7c3aed','#1d4ed8','#b45309','#be123c','#0f766e','#c2410c'];
  return colors[Math.floor(Math.random() * colors.length)];
}

function addRemoteUser(userId, name, color) {
  remoteUsers.set(userId, { name, color, x: 0, y: 0 });
  updateUsersCount();
}

function removeRemoteUser(userId) {
  remoteUsers.delete(userId);
  const cursor = document.getElementById(`cursor-${userId}`);
  if (cursor) cursor.remove();
  updateUsersCount();
}


function updateUsersCount() {
  const total = remoteUsers.size + 1; /* +1 for self */

  const countEl = document.getElementById('usersCount');
  if (countEl) countEl.textContent = total;

  const listEl = document.getElementById('usersList');
  if (!listEl) return;
  listEl.innerHTML = '';

  function makeAvatar(name, color, isSelf) {
    const div = document.createElement('div');
    div.className = 'user-avatar';
    div.style.background   = color;
    div.style.borderColor  = color;
    div.setAttribute('data-tooltip', isSelf ? `${name} (You)` : name);
    div.textContent = name.charAt(0).toUpperCase();
    return div;
  }

  listEl.appendChild(makeAvatar(currentUser.name, currentUser.color, true));
  remoteUsers.forEach(user => listEl.appendChild(makeAvatar(user.name, user.color, false)));
}

function updateRemoteCursor(userId, x, y) {
  let cursor = document.getElementById(`cursor-${userId}`);

  if (!cursor) {
    const user = remoteUsers.get(userId);
    const color = user ? user.color : '#7c3aed';

    cursor = document.createElement('div');
    cursor.id        = `cursor-${userId}`;
    cursor.className = 'remote-cursor';

    const pointer = document.createElement('div');
    pointer.className   = 'cursor-pointer';
    pointer.style.color = color;
    pointer.style.borderColor = color;

    const label = document.createElement('div');
    label.className      = 'cursor-label';
    label.textContent    = user ? user.name : 'User';
    label.style.background = color;

    cursor.appendChild(pointer);
    cursor.appendChild(label);
    document.getElementById('cursorsContainer').appendChild(cursor);
  }

  cursor.style.left = (x - 6) + 'px';
  cursor.style.top  = (y - 6) + 'px';
}



/**
 * showToast — displays a self-dismissing notification at the bottom of the screen.
 * Replaces all alert() calls that were in the original file.
 * @param {string} msg   — message to display
 * @param {string} type  — 'info' | 'success' | 'error'
 */
function showToast(msg, type = 'info') {
  const wrap  = document.getElementById('toastWrap');
  if (!wrap) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  wrap.appendChild(toast);

  /* Remove the element after its CSS animation finishes (3s) */
  setTimeout(() => toast.remove(), 3100);
}

/**
 * copyRoomCode — copies the room ID to the clipboard.
 * Called by the "Copy" button in the navbar room badge.
 */
function copyRoomCode() {
  const roomId = currentUser.roomId;
  if (!roomId || roomId === 'LOADING') return;

  const done = () => showToast('Room ID copied to clipboard', 'success');

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(roomId).then(done).catch(() => _fallbackCopy(roomId, done));
  } else {
    _fallbackCopy(roomId, done);
  }
}

function _fallbackCopy(text, onSuccess) {
  const ta       = document.createElement('textarea');
  ta.value       = text;
  ta.style.position = 'fixed';
  ta.style.opacity  = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); onSuccess(); } catch (e) { console.warn('Copy failed', e); }
  document.body.removeChild(ta);
}

/**
 * patchConnectionDot — makes the status bar dot reflect websocket state.
 * websocket.js sets text + .error class on #statusDisplay; we mirror that
 * to the #connDot element without touching websocket.js.
 */
function patchConnectionDot() {
  const orig = wsManager.updateStatus.bind(wsManager);
  wsManager.updateStatus = function (connected) {
    orig(connected);
    const dot = document.getElementById('connDot');
    if (!dot) return;
    if (connected) {
      dot.classList.remove('error');
    } else {
      dot.classList.add('error');
    }
  };
}

/**
 * mobileSelect — keeps the mobile toolbar active state in sync.
 * Called alongside selectTool() on mobile buttons.
 */
function mobileSelect(btn) {
  document.querySelectorAll('.mobile-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

/* ════════════════════════════════════════════
   KEYBOARD SHORTCUTS  (NEW — interview talking point)
   Ctrl+Z → undo, Ctrl+Y / Ctrl+Shift+Z → redo
   ════════════════════════════════════════════ */
document.addEventListener('keydown', (e) => {
  const ctrl = e.ctrlKey || e.metaKey; /* metaKey = Cmd on Mac */
  if (!ctrl) return;

  if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoAction(); }
  if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redoAction(); }
});

document.addEventListener('DOMContentLoaded', () => { initCanvas(); });