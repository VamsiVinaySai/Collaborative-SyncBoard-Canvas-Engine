# 🏗️ Architecture Document — Sketchboard

> **Who this document is for:**
> Developers who want to deeply understand how this project works — including how
> real-time sync is achieved, why certain decisions were made, and how to explain
> the system confidently in a technical interview.

---

## Table of Contents

1. [High-Level Overview](#1-high-level-overview)
2. [Folder & File Responsibilities](#2-folder--file-responsibilities)
3. [Technology Choices & Why](#3-technology-choices--why)
4. [Client-Server Communication Model](#4-client-server-communication-model)
5. [WebSocket Lifecycle](#5-websocket-lifecycle)
6. [Room & User Synchronization](#6-room--user-synchronization)
7. [Real-Time Drawing Synchronization](#7-real-time-drawing-synchronization)
8. [The Undo / Redo System](#8-the-undo--redo-system)
9. [Canvas Rendering Architecture](#9-canvas-rendering-architecture)
10. [Frontend Architecture](#10-frontend-architecture)
11. [Backend Architecture](#11-backend-architecture)
12. [Data Structures](#12-data-structures)
13. [Deployment Architecture](#13-deployment-architecture)
14. [Current Limitations](#14-current-limitations)
15. [Scalability Considerations](#15-scalability-considerations)
16. [Interview Cheat Sheet](#16-interview-cheat-sheet)

---

## 1. High-Level Overview

Sketchboard is a **client-server real-time application**. The server acts as a
central relay and source of truth. Every client connects to the server via a
persistent WebSocket connection. When one user draws, their stroke travels to
the server, which stores it and immediately forwards it to every other user in
the same room.

```
┌──────────────────┐         ┌──────────────────┐
│   User A         │         │   User B         │
│   (Browser)      │         │   (Browser)      │
│                  │         │                  │
│  canvas.js       │         │  canvas.js       │
│  websocket.js    │         │  websocket.js    │
└────────┬─────────┘         └────────┬─────────┘
         │  WebSocket                  │  WebSocket
         │  (persistent connection)    │  (persistent connection)
         │                             │
         ▼                             ▼
┌─────────────────────────────────────────────────┐
│                  SERVER (Node.js)                │
│                                                  │
│   Express  ──►  Serves /client files over HTTP   │
│                                                  │
│   Socket.IO ──► Manages WebSocket connections    │
│                 Stores room state in memory      │
│                 Relays drawing events            │
│                                                  │
│   In-Memory State:                               │
│   rooms Map ──► users, drawingHistory,           │
│                 userRedoStacks                   │
└─────────────────────────────────────────────────┘
```

**The golden rule of this architecture:**
The server is the **single source of truth** for what the canvas looks like.
Clients are responsible for rendering. The server is responsible for storage
and relay. These responsibilities never cross.

---

## 2. Folder & File Responsibilities

```
sketchboard/
│
├── client/                  ← Everything the browser downloads and runs
│   │
│   ├── index.html           ← Landing page structure (no logic, just HTML)
│   ├── style.css            ← Landing page visual design (design tokens, layout)
│   ├── main.js              ← Landing page logic ONLY:
│   │                             generateRoomId(), createRoom(), joinRoom()
│   │                             writes to localStorage, redirects to canvas.html
│   │
│   ├── canvas.html          ← Drawing workspace structure (no logic, just HTML)
│   ├── canvas-style.css     ← Canvas page visual design (sidebar, toolbar, toasts)
│   ├── canvas.js            ← Drawing engine + coordinates WebSocket events:
│   │                             startDrawing(), handleMouseMove(), stopDrawing()
│   │                             selectTool(), changeColor(), undoAction()
│   │                             updateUsersCount(), updateRemoteCursor()
│   │                             showToast(), copyRoomCode()
│   │
│   └── websocket.js         ← Transport layer ONLY — wraps Socket.IO:
│                                 WebSocketManager class
│                                 connect(), joinRoom(), sendDraw(), sendUndo()
│                                 Internal event bus: on(), emit()
│
└── server/
    └── server.js            ← The entire backend in one file:
                                  Express HTTP server
                                  Socket.IO event handlers
                                  In-memory room/user state
                                  createRoom(), addUserToRoom(), removeUserFromRoom()
```

### Why is the backend one file?

For a project at this scale, splitting server logic across multiple files would
add navigation overhead without adding clarity. One well-commented `server.js`
is easier to read, debug, and explain in an interview than five files with
unclear boundaries. This is a deliberate tradeoff, not an oversight.

### The single responsibility principle in practice

Every file in this project has exactly one reason to change:

| File | Only changes when... |
|------|---------------------|
| `main.js` | Landing page logic changes (validation, ID generation) |
| `websocket.js` | The transport mechanism changes (e.g. switching from Socket.IO) |
| `canvas.js` | Drawing behaviour or UI interactions change |
| `server.js` | Server logic, room rules, or event handling changes |
| `style.css` | Landing page visual design changes |
| `canvas-style.css` | Canvas page visual design changes |

If you need to change two files for one feature, that is a sign the boundary
between them is in the wrong place.

---

## 3. Technology Choices & Why

### Why Socket.IO instead of raw WebSockets?

Raw WebSockets (`new WebSocket(url)`) work, but you would need to write:
- Reconnection logic (exponential backoff)
- Room/namespace management
- Polling fallback for environments that block WebSockets (some corporate
  proxies and older browsers)
- Event name routing (raw WebSockets send strings, not named events)

Socket.IO provides all of this out of the box. For a real-time drawing app
where connection reliability is critical, Socket.IO's reconnection handling
alone is worth the dependency.

### Why in-memory state instead of a database?

The drawing history only needs to exist while a room is active. When the last
user leaves, the room is deleted automatically. There is no "load a previous
session" feature. For this use case:

- **In-memory is faster** — no I/O, no query round-trip before broadcasting
- **In-memory is simpler** — no schema, no migrations, no connection pooling
- **Tradeoff accepted** — history is lost if the server restarts (documented
  in [Current Limitations](#14-current-limitations))

### Why vanilla JavaScript instead of React/Vue?

Three reasons:
1. The app does not have complex component state. It has one canvas and one
   sidebar. React's reconciliation overhead is wasted on DOM elements that
   never unmount.
2. Vanilla JS makes the architecture transparent. Every DOM operation is
   explicit. There is no framework layer to debug through.
3. It demonstrates that you understand the underlying platform, not just
   how to use an abstraction on top of it.

---

## 4. Client-Server Communication Model

This project uses two communication mechanisms, and it is important to
understand when each is used.

### HTTP (one-time requests)

```
Browser ──► GET / ──────────────────────► Express
Browser ◄── index.html, style.css, main.js ◄── Express
```

HTTP is used only for the initial page load. Express serves the static files
from the `/client` folder. After the page loads, HTTP is no longer involved.

### WebSocket (persistent, bidirectional)

```
Browser ──────── connect ─────────────────► Socket.IO server
         ◄──────────────── connected ──────
         ──────── join-room ──────────────►
         ◄──────────────── users-list ─────
         ──────── draw ──────────────────►  (you draw)
         ◄──────────────── draw ────────── (someone else draws)
         ... persistent for the entire session ...
         ──────── disconnect ─────────────►
```

WebSocket connections stay open for the entire session. This is what makes
real-time possible — the server can push data to clients at any time without
the client asking for it first. This is fundamentally different from regular
HTTP, where the client always has to ask before the server can respond.

**Key distinction:**
- `socket.emit('event', data)` → sends to **one** client (the one who sent it)
- `socket.to(roomId).emit('event', data)` → sends to **all others in the room** (excludes sender)
- `io.to(roomId).emit('event', data)` → sends to **everyone in the room** (includes sender)

Knowing when to use each is one of the most common Socket.IO interview
questions. This project uses all three deliberately:

```javascript
// draw event — only others need to see it, you already drew it locally
socket.to(socket.roomId).emit('draw', data);

// full-history-update after undo — everyone needs the new canvas state
io.to(socket.roomId).emit('full-history-update', { history });

// users-list — only the joining user needs to know who is already here
socket.emit('users-list', { users });
```

---

## 5. WebSocket Lifecycle

This traces the exact sequence of events from opening the app to drawing and
eventually disconnecting.

```
PHASE 1 — PAGE LOAD
──────────────────────────────────────────────
1. User fills in name, creates/joins room on index.html
2. main.js writes { userName, roomId, roomName, isHost } to localStorage
3. Browser redirects to canvas.html

PHASE 2 — CONNECTION
──────────────────────────────────────────────
4. canvas.html loads → canvas.js runs
5. canvas.js reads localStorage, populates navbar displays
6. wsManager.connect(SERVER_URL) is called
7. Socket.IO loads its client library from the server
8. WebSocket handshake completes (HTTP Upgrade → WebSocket)
9. Server fires socket.on('connection') → logs new socket.id

PHASE 3 — JOINING A ROOM
──────────────────────────────────────────────
10. canvas.js calls wsManager.joinRoom({ roomId, userName, ... })
11. websocket.js emits 'join-room' event to server
12. Server receives 'join-room':
    - If isHost: creates the room in the rooms Map
    - Checks if room exists and has capacity
    - Calls addUserToRoom(roomId, socket.id, userName, userColor)
    - socket.join(roomId) — Socket.IO room membership
    - Attaches roomId, userName, userColor to the socket object
    - Emits 'users-list' back to the joining user (who is in the room)
    - Emits 'user-joined' to all OTHER users in the room
    - If room has drawing history: emits 'drawing-history' to the new user

PHASE 4 — ACTIVE SESSION
──────────────────────────────────────────────
13. User draws → see Section 7 for the full drawing flow
14. Cursor moves → throttled to 30fps, broadcast to room
15. Undo/redo → see Section 8 for the full undo flow

PHASE 5 — DISCONNECTION
──────────────────────────────────────────────
16. User closes tab / clicks Leave → socket disconnects
17. Server fires socket.on('disconnect')
18. removeUserFromRoom(socket.roomId, socket.id) is called
19. Server emits 'user-left' to remaining room members
20. If room.users.size === 0: rooms.delete(roomId) — room is cleaned up
```

---

## 6. Room & User Synchronization

### How rooms are identified

Room IDs are 12-character alphanumeric strings generated on the client by
`generateRoomId()` in `main.js`. The server does not generate IDs — it trusts
the client's generated ID. This is fine for a collaborative art tool where the
security concern is low.

```javascript
// main.js — client-side ID generation
function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 12; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id; // e.g. "AB3K9PLMZ2QR"
}
```

The probability of two users independently generating the same 12-character
ID from a 36-character alphabet is 36^12 ≈ 4.7 trillion combinations.
Collision is practically impossible.

### How the server tracks everything

The server uses a single `Map` called `rooms`. Each entry in this Map is a
room object containing everything the server needs to manage that room.

```
rooms (Map)
  │
  └── "AB3K9PLMZ2QR" (roomId as key)
        │
        ├── roomId:        "AB3K9PLMZ2QR"
        ├── roomName:      "Team Sprint"
        ├── capacity:      5
        ├── createdAt:     Date object
        │
        ├── users (Map)    ← who is currently in the room
        │     ├── "socket.id_1" → { id, name, color, x, y }
        │     └── "socket.id_2" → { id, name, color, x, y }
        │
        ├── drawingHistory (Array)  ← every stroke ever drawn in this room
        │     ├── { fromX, fromY, toX, toY, color, width, tool, userId, strokeId }
        │     ├── { ... }
        │     └── { ... }  ← up to 1000 strokes (then oldest is dropped)
        │
        └── userRedoStacks (Map)   ← per-user undo history
              └── "socket.id_1" → [ { strokes: [...] }, { strokes: [...] } ]
```

### Why socket.id is the user identity

Socket.IO assigns a unique ID to every connection. This ID is used as the
key in `room.users`. It is also attached directly to the socket object
(`socket.roomId`, `socket.userName`) so any event handler can access user
info instantly without a Map lookup.

When a user disconnects, `socket.on('disconnect')` fires and the server uses
`socket.roomId` and `socket.id` to clean up — no extra bookkeeping needed.

### New user joining mid-session

When a user joins a room where drawing has already happened:

```
New user emits 'join-room'
         │
         ▼
Server checks: room.drawingHistory.length > 0?
         │
         YES
         ▼
socket.emit('drawing-history', { history: room.drawingHistory })
  (sent ONLY to the new user, not to everyone)
         │
         ▼
canvas.js receives 'drawing-history'
         │
         ▼
Replays every stroke in sequence on remoteCanvas
         │
         ▼
New user sees the full canvas state as it was
```

This is a complete canvas replay — every stroke is re-rendered from the
beginning. It is simple and correct, but has a performance cost for rooms
with very long histories (addressed in the 1000-stroke cap).

---

## 7. Real-Time Drawing Synchronization

This is the core of the project. Understanding this flow completely is what
makes the difference in a technical interview.

### The optimistic update pattern

The most important design decision in the drawing flow:

```
User moves mouse
      │
      ├──► drawLine() on LOCAL canvas immediately  ← happens first, no wait
      │    (instant feedback, no network involved)
      │
      └──► wsManager.sendDraw(data)                ← sent to server in parallel
                   │
                   ▼
             Server stores + relays to OTHERS
                   │
                   ▼
             Other clients draw the stroke
```

The user never waits for the server. Their own strokes appear instantly.
The server relay is only for other users. This is called an **optimistic
update** — you assume the network will succeed and act immediately.

If the connection drops, the local drawing still works. The user just will
not see others' strokes and others will not see theirs — which is handled
by the connection status indicator.

### The full stroke lifecycle

```
MOUSE DOWN
──────────────────────────────────────────
1. startDrawing(e) fires
2. isDrawing = true
3. Record startX, startY from mouse position
4. Generate currentStrokeId = "s-1234567890-98765"
   (timestamp + random suffix = unique per drag)
5. For shape tools (line/rect/circle): saveHistory() immediately
   (needed for shape preview — see below)

MOUSE MOVE (fires ~60 times/second while drawing)
──────────────────────────────────────────
6. Get current x, y from mouse event
7. Update position display in status bar
8. Send cursor position (throttled: max once per 33ms)

IF tool is brush or eraser:
9.  drawLine(startX, startY, x, y, color, width) on LOCAL canvas
10. wsManager.sendDraw({ fromX: startX, fromY: startY, toX: x, toY: y,
                         color, width, tool, strokeId })
11. Update startX = x, startY = y (move origin for next segment)

IF tool is line, rectangle, or circle:
9.  ctx.putImageData(history[last], 0, 0)
    (restore snapshot to erase previous preview)
10. Draw the shape preview from startX/Y to current x/y
    (this is why saveHistory() was called on mousedown — we need a clean snapshot)
11. Do NOT send to server yet (shape is not final until mouse up)

MOUSE UP
──────────────────────────────────────────
12. isDrawing = false
13. IF shape tool: wsManager.sendDrawLine({ fromX: startX, fromY: startY,
                                            toX: endX, toY: endY, ... })
    (the final, committed shape is sent as one event)
14. saveHistory() — snapshot current canvas state for future undos
15. currentStrokeId = null
```

### How a remote user receives and renders

```
Server receives 'draw' event
         │
         ▼
Pushes stroke into room.drawingHistory
Clears user's redo stack (new stroke = can't redo old undos)
         │
         ▼
socket.to(roomId).emit('draw', { ...stroke, userId, userName })
         │
         ▼
Remote user's websocket.js receives 'draw'
         │
         ▼
Fires internal 'remote-draw' event (Observer pattern)
         │
         ▼
canvas.js handler: drawLineRemote(fromX, fromY, toX, toY, color, width, tool)
         │
         ▼
Draws on REMOTE canvas (not the local canvas)
         │
         ▼
Remote user sees the stroke appear
```

### Why two canvases?

```
┌─────────────────────────────────────┐
│  remoteCanvas  (top layer)          │  ← Remote users' strokes
│  position: absolute, z-index: auto │     pointer-events: none
│  background: transparent            │
├─────────────────────────────────────┤
│  canvas  (bottom layer)             │  ← Your own strokes
│  position: absolute                 │     background: #ffffff
│  background: white                  │
└─────────────────────────────────────┘
```

Separating the layers means:
- Shape preview (the ghost shape that follows your mouse) only affects the
  local canvas — remote users do not see your half-drawn rectangle
- Clearing the remote canvas for undo does not affect local work
- When saving as PNG, both canvases are merged onto a third off-screen
  canvas, producing a clean combined image

### Cursor synchronization

```javascript
// canvas.js — inside handleMouseMove()
const now = Date.now();
if (wsManager.isSocketConnected() && now - _lastCursorSend > 33) {
  wsManager.sendCursorMove(x, y);  // max 30 times per second
  _lastCursorSend = now;
}
```

Without throttling, a fast mouse produces 60+ events per second per user.
With 5 users, that is 300+ events/second just for cursors. Throttling to
30fps reduces this to 150/second with no perceptible quality loss — cursors
still feel smooth.

The server stores the last known cursor position in `user.x` and `user.y`
but does not use these for any calculations. They exist only so that a new
user joining could theoretically receive current cursor positions (a future
improvement — currently not sent on join).

---

## 8. The Undo / Redo System

This is the most architecturally interesting part of the project. Most
collaborative tools use simple local undo. This project implements
**server-managed per-user undo** — you can undo only your own strokes,
never a teammate's, and all clients stay in sync.

### The strokeId concept

Every drawing action (one full mouse-drag from down to up) is assigned a
`strokeId` generated at mousedown:

```javascript
currentStrokeId = `s-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
```

A single brush drag from left to right sends dozens of small segment events
to the server (one per mousemove). Each segment carries the same `strokeId`.

```
drawingHistory on server:
[
  { strokeId: "s-111-11", userId: "A", fromX:10, toX:11, ... },
  { strokeId: "s-111-11", userId: "A", fromX:11, toX:12, ... },
  { strokeId: "s-111-11", userId: "A", fromX:12, toX:13, ... },
  ← all same strokeId — one undo removes all three
  { strokeId: "s-222-22", userId: "B", fromX:50, toX:55, ... },
  { strokeId: "s-333-33", userId: "A", fromX:20, toX:25, ... },
]
```

### Undo flow step by step

```
User A clicks Undo
       │
       ▼
canvas.js: undoAction()
  Checks: wsManager connected? (undo requires server)
  Debounces: ignores calls within 500ms of last undo
  Calls: wsManager.sendUndo()
       │
       ▼
websocket.js: socket.emit('undo')
       │
       ▼
server.js: socket.on('undo', ...)
  1. Scans drawingHistory backwards for last stroke where userId === socket.id
  2. Records its strokeId (e.g. "s-333-33")
  3. Removes ALL strokes with userId === "A" AND strokeId === "s-333-33"
     from drawingHistory
  4. Moves removed strokes to room.userRedoStacks.get(socket.id)
     as { strokes: [removed group] }
  5. io.to(roomId).emit('full-history-update', { history: drawingHistory })
     (sent to EVERYONE including the user who undid)
       │
       ▼
ALL clients receive 'full-history-update'
       │
       ▼
canvas.js: wsManager.on('full-history-update', handler)
  1. ctx.clearRect(entire canvas)
  2. remoteCtx.clearRect(entire canvas)
  3. Re-renders every stroke in the updated history from scratch
  4. Saves new canvas snapshot to history[]
       │
       ▼
Result: User A's last stroke group is gone.
        User B's strokes are untouched.
        All clients show identical canvas state.
```

### Why full redraw instead of surgical removal?

You cannot "un-draw" pixels on a canvas. Once a stroke is painted, the
pixels are just pixels — there is no record of which brush stroke produced
which pixel. The only way to remove a specific stroke is to redraw
everything *except* that stroke from the beginning.

This is why `drawingHistory` exists on the server — it is not just for
new users joining. It is the replay source for every undo operation.

### Redo flow

Redo is the reverse: pop from `userRedoStacks`, push strokes back into
`drawingHistory`, broadcast `full-history-update`. If the user draws a new
stroke after undo, their redo stack is cleared (standard undo/redo behaviour).

---

## 9. Canvas Rendering Architecture

### The three rendering contexts

```
┌──────────────────────────────────────────────┐
│  Off-screen merge canvas (temporary)          │
│  Created only during downloadCanvas()         │
│  Merges: white bg + #canvas + #remoteCanvas   │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│  #remoteCanvas  (remoteCtx)                   │
│  All remote users' strokes                    │
│  Cleared and replayed on full-history-update  │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│  #canvas  (ctx)                               │
│  Your local strokes                           │
│  White background                             │
│  Also replayed on full-history-update         │
└──────────────────────────────────────────────┘
```

### Canvas sizing

```javascript
// canvas.js — resizeCanvas()
function resizeCanvas() {
  const container    = document.querySelector('.canvas-container');
  canvas.width       = container.clientWidth;
  canvas.height      = container.clientHeight;
  remoteCanvas.width = container.clientWidth;
  remoteCanvas.height= container.clientHeight;
  redrawCanvas();  // re-renders from history after resize
}
```

Canvas dimensions are set in pixels using JavaScript, not CSS. Setting
canvas dimensions via CSS scales the canvas element visually but does not
change the drawing surface — this would distort all strokes. Setting
`.width` and `.height` properties in JS both sizes the element and resets
the drawing surface to the correct resolution.

`resizeCanvas()` is called on page load and on every `window.resize` event.
After resize, `redrawCanvas()` replays the last saved image snapshot using
`ctx.putImageData()` to restore what was drawn.

### The history[] array (local, client-side)

This is separate from the server's `drawingHistory`. The client's `history[]`
array stores `ImageData` snapshots of the local canvas:

```
history[0]  = blank canvas (initial state, saved on initCanvas)
history[1]  = after first stroke
history[2]  = after second stroke
...
history[MAX_HISTORY - 1] = current state
```

This is used for the **shape preview** system. When the user is dragging
to draw a rectangle, the canvas needs to restore a clean snapshot before
drawing the updated preview ghost each frame:

```javascript
// Restore last clean snapshot, then draw preview shape on top
ctx.putImageData(history[history.length - 1], 0, 0);
drawRectangle(startX, startY, currentX, currentY, color, width);
```

Without this, each frame's preview rectangle would stack on the previous
one, producing a smear effect instead of a clean preview.

---

## 10. Frontend Architecture

### The Observer pattern in websocket.js

`WebSocketManager` implements a simple internal event bus:

```javascript
class WebSocketManager {
  constructor() {
    this.callbacks = {};  // { 'eventName': [fn1, fn2, ...] }
  }

  // Register a listener for an internal event
  on(event, callback) {
    if (!this.callbacks[event]) this.callbacks[event] = [];
    this.callbacks[event].push(callback);
  }

  // Fire all listeners for an internal event
  emit(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach(cb => cb(data));
    }
  }
}
```

When a Socket.IO event arrives, `websocket.js` translates it to an internal
event name and fires the bus:

```javascript
// websocket.js — inside setupListeners()
this.socket.on('draw', (data) => this.emit('remote-draw', data));
```

Then `canvas.js` listens on the internal bus, never touching Socket.IO:

```javascript
// canvas.js — inside setupWebSocketListeners()
wsManager.on('remote-draw', (data) => {
  drawLineRemote(data.fromX, data.fromY, data.toX, data.toY, ...);
});
```

**Why this matters:** If you decide to replace Socket.IO with native
WebSockets, raw WebRTC, or any other transport, you only change `websocket.js`.
The drawing logic in `canvas.js` is completely insulated from the transport
layer. This is the **Adapter pattern** — `websocket.js` adapts the Socket.IO
API to the internal event API that `canvas.js` expects.

### Data flow on the frontend

```
User interaction (mouse/touch event)
         │
         ▼
canvas.js event handler (startDrawing, handleMouseMove, stopDrawing)
         │
         ├──► Draws on LOCAL canvas immediately (no waiting)
         │
         └──► wsManager.sendDraw(data)
                       │
                       ▼
              websocket.js (sends to server via Socket.IO)
                       │
                       ▼
              Server stores + broadcasts
                       │
                       ▼
              websocket.js (receives from Socket.IO)
                       │
                       ▼
              canvas.js handler (draws on REMOTE canvas)
```

---

## 11. Backend Architecture

### The server in a single file

`server.js` has four distinct sections:

**Section 1 — Setup**
```javascript
const app    = express();
const server = http.createServer(app);
const io     = socketIO(server, { cors: { origin: '*' } });
app.use(express.static(path.join(__dirname, '../client')));
```

**Section 2 — State management helpers**
```javascript
const rooms = new Map();
function createRoom(roomId, roomName, capacity) { ... }
function addUserToRoom(roomId, userId, userName, userColor) { ... }
function removeUserFromRoom(roomId, userId) { ... }
function getRoomUsers(roomId) { ... }
```

**Section 3 — Socket.IO event handlers**
```javascript
io.on('connection', (socket) => {
  socket.on('join-room', handler);
  socket.on('draw', handler);
  socket.on('draw-line', handler);
  socket.on('cursor-move', handler);
  socket.on('undo', handler);
  socket.on('redo', handler);
  socket.on('clear-canvas', handler);
  socket.on('disconnect', handler);
});
```

**Section 4 — HTTP API endpoints**
```javascript
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/stats',  (req, res) => res.json({ totalRooms, rooms }));
```

### Event handler responsibilities

| Event received | Server action | Event emitted |
|---------------|---------------|---------------|
| `join-room` | Creates room (if host), adds user, joins Socket.IO room | `users-list` (to joiner), `user-joined` (to others), `drawing-history` (to joiner if history exists) |
| `draw` | Appends stroke to history, clears user's redo stack | `draw` (to others only) |
| `draw-line` | Appends shape stroke to history | `draw-line` (to others only) |
| `cursor-move` | Updates user's x/y in the users Map | `cursor-move` (to others only) |
| `undo` | Removes user's last stroke group, pushes to redo stack | `full-history-update` (to everyone) |
| `redo` | Pops from redo stack, appends strokes back to history | `full-history-update` (to everyone) |
| `clear-canvas` | Clears history array and all redo stacks | `full-history-update` (to everyone) |
| `disconnect` | Removes user from room, deletes room if empty | `user-left` (to remaining users) |

---

## 12. Data Structures

### Stroke object (what travels over the network)

```javascript
{
  fromX:    Number,   // start X position on canvas
  fromY:    Number,   // start Y position
  toX:      Number,   // end X position
  toY:      Number,   // end Y position
  color:    String,   // hex color e.g. "#ef4444"
  width:    Number,   // stroke width in pixels (1–50)
  tool:     String,   // "brush" | "eraser" | "line" | "rectangle" | "circle"
  strokeId: String,   // e.g. "s-1716800000000-42731" (groups a full drag)
  userId:   String,   // socket.id of the drawing user (added by server)
  timestamp: Number,  // Date.now() (added by server)
}
```

### Room object (server-side only)

```javascript
{
  roomId:         String,
  roomName:       String,
  capacity:       Number,
  createdAt:      Date,
  users:          Map,          // socketId → UserObject
  drawingHistory: Array,        // Stroke[] — max 1000 entries
  userRedoStacks: Map,          // socketId → [ { strokes: Stroke[] } ]
}
```

### User object (server-side only)

```javascript
{
  id:    String,   // socket.id
  name:  String,   // display name from localStorage
  color: String,   // hex color assigned to this user
  x:     Number,   // last known cursor X
  y:     Number,   // last known cursor Y
}
```

---

## 13. Deployment Architecture

### Single-server deployment (current)

```
Internet
    │
    ▼
Render / Railway / Fly.io  (one Node.js process)
    │
    ├── Express serves /client files over HTTPS
    │
    └── Socket.IO handles WebSocket connections
             │
             └── In-memory rooms Map
```

The entire application runs as a **single Node.js process**. Express and
Socket.IO share the same HTTP server instance (`http.createServer(app)`).
This is intentional — Socket.IO needs to attach to the HTTP server to handle
the WebSocket upgrade handshake.

```javascript
// server.js — how Express and Socket.IO share one server
const app    = express();
const server = http.createServer(app);   // ← one HTTP server
const io     = socketIO(server, { ... }); // ← Socket.IO attaches to it
server.listen(PORT);                      // ← one process, one port
```

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | HTTP server port (Render sets this automatically) |
| `CORS_ORIGIN` | `*` | Allowed origins for WebSocket connections |

---

## 14. Current Limitations

Understanding limitations honestly is a sign of engineering maturity.
Each limitation listed here has a documented path to resolution.

### 1. No persistence

**Problem:** All rooms and drawing history exist only in the server process's
memory. If the server restarts (Render free tier restarts often), all active
sessions are lost.

**Impact:** Users lose their work. This is acceptable for a demo but not for
a production tool.

**Fix:** Add SQLite via `better-sqlite3`. Store each stroke as a row in a
`strokes` table with `(roomId, strokeId, userId, tool, fromX, fromY, toX,
toY, color, width, timestamp)`. On room join, query for all strokes in that
room instead of using `drawingHistory`. Estimated effort: one afternoon.

### 2. No horizontal scaling

**Problem:** The `rooms` Map lives in one process's memory. If you run two
server instances (for load balancing), Room A's data exists on Server 1 but
User B connecting to Server 2 cannot see it.

**Impact:** You cannot scale beyond one server without breaking sync.

**Fix:** Replace the in-memory Map with Redis. Socket.IO has a first-party
Redis adapter (`@socket.io/redis-adapter`) that routes events across multiple
server instances. Estimated effort: one to two days.

### 3. No authentication

**Problem:** Anyone who knows a Room ID can join. There is no concept of
ownership, passwords, or access control.

**Impact:** Fine for a public drawing tool. Not acceptable for private
sessions.

**Fix:** Add room passwords hashed with `bcrypt`. Store the hash with the
room. Check on `join-room` before adding the user. Estimated effort: a few hours.

### 4. Drawing history size cap

**Problem:** The server caps `drawingHistory` at 1000 strokes by shifting
the oldest entry. This means very long sessions lose their early history,
breaking undo for old strokes.

**Impact:** Undo stops working correctly for sessions with more than ~50
users drawing actively for hours.

**Fix:** Persistence (see limitation 1) makes this irrelevant — the database
stores unlimited history. Alternatively, periodically flatten the history by
taking a canvas snapshot and storing it as a base image.

### 5. No delta compression

**Problem:** On `full-history-update` (after every undo/redo), the server
sends the entire drawing history to every client. For rooms with 900 strokes
and 5 users, this is a large payload sent on every undo click.

**Impact:** Undo feels slower in rooms with long histories.

**Fix:** Send only a diff — which strokes were removed — and let clients
calculate the new state. Requires more complex state management on both sides.

---

## 15. Scalability Considerations

### What "scaling" means for this project

Scaling means handling more concurrent rooms and more users per room without
degrading performance. There are two dimensions:

**Vertical scaling** — give the server more CPU/RAM. Free on most platforms
by upgrading the instance tier. Works up to a point.

**Horizontal scaling** — run multiple server instances behind a load balancer.
Requires solving the shared state problem (see Redis in limitations above).

### Current theoretical limits (single server)

| Resource | Limit | Reason |
|----------|-------|--------|
| Concurrent rooms | ~500 | Memory: each room ~10KB history × 500 = 5MB |
| Users per room | 20 (configurable) | Set by host at creation |
| Strokes per room | 1000 (then rolls) | Array shift cap in server.js |
| Events per second | ~10,000 | Node.js single-thread event loop capacity |
| WebSocket connections | ~10,000 | Operating system file descriptor limits |

For a portfolio project or small team tool, these limits are not a concern.
A typical session has 3–5 users and 200–400 strokes.

### The path to production scale

```
Current (single process, in-memory):
  Node.js + Socket.IO + Map → handles ~500 rooms

Step 1 — Add persistence:
  + SQLite (single-server persistence)
  → survives restarts, unlimited history

Step 2 — Add Redis:
  + Redis Pub/Sub + Socket.IO Redis Adapter
  → supports multiple server instances

Step 3 — Add load balancer:
  + nginx or cloud load balancer with sticky sessions
  → horizontal scaling to N server instances

Step 4 — Separate concerns:
  + Static files → CDN (CloudFront, Cloudflare)
  + WebSocket server → dedicated Node.js cluster
  → each layer scales independently
```

---

## 16. Interview Cheat Sheet

Common interview questions about this project and precise answers:

**"How does real-time sync work?"**
> Each client has a persistent WebSocket connection to the server. When a user draws a stroke, the client sends a `draw` event to the server. The server appends it to the room's drawing history and uses `socket.to(roomId).emit()` to forward it to all other users in that room. The other clients receive the event and render it on their remote canvas layer.

**"What is `socket.to()` vs `io.to()`?"**
> `socket.to(room)` sends to everyone in the room *except* the sender. `io.to(room)` sends to everyone *including* the sender. I use `socket.to()` for draw events because the sender already drew locally. I use `io.to()` for undo/redo because everyone — including the user who triggered it — needs to redraw their canvas from the updated history.

**"How does per-user undo work?"**
> Every drawing action is tagged with a `strokeId` generated at mousedown. All stroke segments from one drag share the same ID. When a user requests undo, the server scans `drawingHistory` backwards to find the last `strokeId` belonging to that user, removes all strokes with that ID, moves them to the user's redo stack, and broadcasts `full-history-update` to all clients. Every client clears and redraws the entire canvas from the updated history. This guarantees consistency — everyone sees the same result.

**"Why not just undo locally?"**
> Because collaborative editing changes what "undo" means. If User A draws, then User B draws on top, User A's local undo would erase User B's work visually on A's screen but not on B's. Server-managed undo means the server decides what to remove and all clients agree. Consistency is more important than keeping undo local.

**"What design pattern does websocket.js use?"**
> The Observer pattern — `WebSocketManager` has an internal event bus with `on()` (subscribe) and `emit()` (publish). Socket.IO events are translated to internal event names and published on this bus. `canvas.js` subscribes to internal events and never touches Socket.IO directly. This is also an Adapter pattern — `websocket.js` adapts the Socket.IO API to the internal API that `canvas.js` expects. The benefit is that swapping Socket.IO for a different transport requires changing only `websocket.js`.

**"What are the limitations of this architecture?"**
> Three main ones: First, no persistence — the in-memory state is lost on server restart. Adding SQLite would fix this. Second, no horizontal scaling — the rooms Map only exists in one process. Adding Redis with Socket.IO's Redis adapter would allow multiple instances. Third, the full-history broadcast on undo is inefficient for long sessions — sending a diff instead of the full history would improve this.

**"How does the two-canvas system work?"**
> The page has two `<canvas>` elements stacked with `position: absolute`. The bottom canvas has a white background and holds the local user's strokes. The top canvas is transparent and holds remote users' strokes. They are visually merged because they are stacked. On undo, both are cleared and replayed from the server's history. On download, both are composited onto a third off-screen canvas to produce a single PNG.

**"Why is the server the source of truth?"**
> Because in a multi-user system, each client can have a different view of the canvas at any moment (due to network latency). If one client were the authority, other clients would have to trust it, creating a security risk and a single point of failure. The server is neutral, receives all events, stores the authoritative history, and redistributes it. Every client renders from the same source, so they all show the same result.

---

<div align="center">

*This document should be read alongside the source code.*
*Every architectural claim maps directly to a specific function or file.*

</div>
