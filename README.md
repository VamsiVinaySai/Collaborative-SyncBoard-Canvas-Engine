<div align="center">

# ✏️ Sketchboard

### Real-Time Collaborative Drawing Canvas

**Draw together. Think together. Build together.**

A lightweight, full-stack collaborative whiteboard where multiple users can draw, sketch, and brainstorm in real-time — no account required.

<br>

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-010101?style=flat-square&logo=socket.io&logoColor=white)](https://socket.io)
[![Express](https://img.shields.io/badge/Express-4.21-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6%2B-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License: MIT](https://img.shields.io/badge/License-MIT-7c3aed?style=flat-square)](LICENSE)

<br>

[🚀 Live Demo](#-live-demo) · [📸 Screenshots](#-screenshots) · [⚡ Quick Start](#-quick-start) · [🏗 Architecture](#-architecture)

</div>

---

## 📌 Table of Contents

- [Overview](#-overview)
- [Live Demo](#-live-demo)
- [Screenshots](#-screenshots)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Real-Time Collaboration](#-how-real-time-collaboration-works)
- [Project Structure](#-project-structure)
- [Quick Start](#-quick-start)
- [Deployment](#-deployment)
- [Future Improvements](#-future-improvements)
- [What I Learned](#-what-i-learned)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 Overview

Sketchboard is a **real-time collaborative whiteboard** built from scratch using Node.js, Socket.IO, and the HTML5 Canvas API. Multiple users can join a shared room and draw simultaneously — every stroke is broadcast instantly to all connected participants.

This project was built to deeply understand how **WebSocket-based real-time systems** work, how to manage shared state across multiple clients, and how to architect a full-stack application without relying on heavyweight frameworks.

**Core problem it solves:** Remote teams need a lightweight, zero-friction shared canvas — no downloads, no sign-ups, just share a Room ID and start drawing together.

---

## 🚀 Live Demo

> 🔗 **https://collaborative-syncboard-canvas-engine.onrender.com**

**How to test real-time sync:**
1. Open the link in two browser tabs (or share it with a friend)
2. Enter a name and create a room in one tab
3. Copy the Room ID and join from the second tab
4. Draw in one tab — watch it appear instantly in the other

---

## 📸 Screenshots

### 🏠 Landing Page
> *(Add a screenshot of your landing page here)*
```
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/ae8893d0-9fb5-47cb-b970-f4f8af6a7cbc" />

```
Modern dark-themed landing page with animated gradient background, room creation and joining interface, and feature highlights.

---

### 🎨 Canvas Interface
> *(Add a screenshot of the canvas interface here)*
```
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/2340db94-e8d9-4d7b-a60b-32fc1639a491" />

```
Full-featured drawing workspace with a dark sidebar toolbar, color presets, brush size control, and the main drawing area with a dot-grid background.

---

### 👥 Live Collaboration
> *(Add a screenshot showing multiple users drawing together)*
```
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/d9a9f2b6-dcad-47fa-85d1-fd485c1b8b97" />

```
Two or more users drawing simultaneously. Each user's cursor is visible with their name label, color-coded for easy identification.

> **Tip:** Use the [ShareX](https://getsharex.com/) or macOS Screenshot tool to capture your screens, then add images to a `/screenshots` folder in your repo.

---

## ✨ Features

### 🖌️ Drawing Tools
| Tool | Description |
|------|-------------|
| **Brush** | Freehand drawing with smooth round-capped strokes |
| **Eraser** | Removes pixels from the canvas at adjustable size |
| **Line** | Straight lines with real-time preview while dragging |
| **Rectangle** | Outlined rectangles with live drag preview |
| **Circle** | Radius-based circles drawn from center point |
| **Color Picker** | 12 preset swatches + full custom color input |
| **Brush Size** | Slider from 1px to 50px with live size preview dot |

### ⚡ Real-Time Collaboration
- Instant stroke synchronization across all connected users
- Live cursor tracking — see exactly where teammates are drawing
- User join/leave notifications via toast messages
- Full canvas state sync for users who join mid-session
- Room capacity control (2–20 users, set by the host)

### ↩️ Undo / Redo System
- **Per-user undo** — you only undo your own strokes, never a teammate's
- Stroke groups tracked by unique `strokeId` so a full drag = one undo step
- Server maintains the authoritative history; all clients redraw from it
- Redo stack preserved per user until a new stroke is drawn

### 🎯 User Experience
- No sign-up or login required — just a name and a Room ID
- Room IDs are 12-character alphanumeric codes (e.g. `ABC123DEF456`)
- Copy Room ID to clipboard with one click
- Download the canvas as a merged PNG (both layers combined)
- Keyboard shortcuts: `Ctrl+Z` undo, `Ctrl+Y` redo
- Fullscreen mode for distraction-free drawing
- Responsive layout with a mobile toolbar for touch devices
- Toast notifications replace browser `alert()` dialogs

### 🔐 Room Management
- Host creates a named room with configurable capacity
- Guests join using the 12-character Room ID
- Rooms are cleaned up automatically when the last user leaves
- `/stats` endpoint shows active rooms and user counts

---

## 🛠️ Tech Stack

### Backend
| Technology | Role |
|------------|------|
| **Node.js** | JavaScript runtime — handles all server-side logic |
| **Express.js** | HTTP server — serves static files and API endpoints |
| **Socket.IO 4.x** | WebSocket library — manages real-time bidirectional events |
| **CORS** | Middleware to allow cross-origin connections |

### Frontend
| Technology | Role |
|------------|------|
| **HTML5 Canvas API** | Native browser drawing surface — two stacked canvases |
| **Vanilla JavaScript** | All client logic — no React, no Vue, no build step |
| **CSS3** | Dark theme, animations, glassmorphism, responsive layout |
| **Google Fonts** | Bricolage Grotesque + DM Sans + JetBrains Mono |

### Infrastructure
| Technology | Role |
|------------|------|
| **Render / Railway** | Cloud platform for deploying the Node.js server |
| **Socket.IO transport** | WebSocket with polling fallback for compatibility |

> **Why no database?** Room state and drawing history are stored in-memory on the server (`Map` data structure). This keeps the architecture simple and eliminates setup complexity. The tradeoff: history resets if the server restarts. A future improvement would add SQLite or Redis persistence.

> **Why no framework?** This project intentionally uses vanilla HTML/CSS/JS on the frontend to demonstrate a strong understanding of fundamentals — the browser APIs, DOM manipulation, and event handling — without abstracting them away.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                 │
│                                                     │
│  index.html + style.css + main.js                   │
│  └── Landing page: room creation and joining        │
│                                                     │
│  canvas.html + canvas-style.css                     │
│  ├── canvas.js    (drawing engine)                  │
│  └── websocket.js (Socket.IO client wrapper)        │
└──────────────────────┬──────────────────────────────┘
                       │  WebSocket (Socket.IO)
                       │  Events: draw, draw-line,
                       │  cursor-move, undo, redo,
                       │  join-room, clear-canvas
                       │
┌──────────────────────▼─────────────────────────────┐
│                    SERVER (Node.js)                │
│                                                    │
│  server.js                                         │
│  ├── Express HTTP server (serves /client files)    │
│  ├── Socket.IO server (handles all WS events)      │
│  └── In-memory state                               │
│       ├── rooms: Map<roomId, RoomObject>           │
│       │    ├── users: Map<socketId, UserObject>    │
│       │    ├── drawingHistory: Stroke[]            │
│       │    └── userRedoStacks: Map<socketId, []>   │
│       └── Auto-cleanup when room is empty          │
└────────────────────────────────────────────────────┘
```

### Key Design Decisions

**Two-canvas layering:** The canvas page uses two stacked `<canvas>` elements — `#canvas` (white background, your local drawings) and `#remoteCanvas` (transparent, remote drawings). This prevents local and remote rendering from interfering during real-time sync.

**Observer pattern in WebSocket client:** `websocket.js` wraps Socket.IO in a custom `WebSocketManager` class with an internal event bus (`on`/`emit`). This means `canvas.js` never calls `socket.emit()` directly — it calls `wsManager.sendDraw()`. The two files are fully decoupled.

**Server as source of truth:** The server holds the complete `drawingHistory` array. When a user joins mid-session, the server sends the full history for replay. When undo happens, the server removes strokes and broadcasts the updated history to everyone — clients redraw from scratch. This guarantees consistency without complex conflict resolution.

**StrokeId grouping:** Every freehand drag generates one `strokeId`. All the individual segment events from that drag share this ID. On undo, the server removes every stroke with that ID as a group — so a full brush stroke disappears as one action, not segment by segment.

---

## ⚡ How Real-Time Collaboration Works

Understanding this is the core of the project. Here is the exact lifecycle of one brushstroke:

```
User A moves mouse
       │
       ▼
canvas.js: mousemove fires → draws locally (instant, no wait)
       │   packages { fromX, fromY, toX, toY, color, width, tool, strokeId }
       ▼
websocket.js: socket.emit('draw', data)
       │
       ──── WebSocket ────►
       │
       ▼
server.js: socket.on('draw', ...)
       │   1. Appends stroke to room.drawingHistory  ← persistence
       │   2. socket.to(roomId).emit('draw', data)   ← relay to OTHERS only
       │      (socket.to() excludes the sender)
       ──── WebSocket ────►
       │
       ▼
websocket.js (User B): receives 'draw' → fires internal 'remote-draw'
       │
       ▼
canvas.js (User B): wsManager.on('remote-draw', ...) → draws on remoteCanvas
       │
       ▼
User B sees User A's stroke appear in real-time
```

**Important detail:** User A's stroke appears on their own canvas *before* it reaches the server — drawn locally on `mousedown/mousemove`. The server relay is only for other users. This is why drawing feels instantaneous even with network latency.

---

## 📁 Project Structure

```
sketchboard/
│
├── client/                      # All frontend files (served as static)
│   ├── index.html               # Landing page — room creation and joining
│   ├── style.css                # Landing page styles
│   ├── main.js                  # Room creation, join logic, localStorage
│   │
│   ├── canvas.html              # Drawing workspace page
│   ├── canvas-style.css         # Canvas page styles — toolbar, sidebar, toasts
│   ├── canvas.js                # Drawing engine + WebSocket coordination
│   └── websocket.js             # Socket.IO client wrapper (Observer pattern)
│
├── server/
│   └── server.js                # Express + Socket.IO server, room state
│
├── screenshots/                 # README screenshots (add your own here)
│
├── package.json                 # Dependencies and npm scripts
├── package-lock.json
└── README.md
```

**File responsibilities at a glance:**

| File | Responsibility |
|------|---------------|
| `main.js` | Generates Room ID, validates form, writes to `localStorage`, redirects to canvas |
| `websocket.js` | Wraps Socket.IO in a class — emits/receives events, manages reconnection |
| `canvas.js` | Drawing logic (mouse/touch events, Canvas API), reads from `websocket.js` |
| `server.js` | Single source of truth — stores rooms, users, history; relays all events |

---

## ⚡ Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v14 or higher
- npm (comes with Node.js)

### 1. Clone the repository

```bash
git clone https://github.com/your-username/Collaborative-SyncBoard-Canvas-Engine.git
cd sketchboard
```

### 2. Install dependencies

```bash
npm install
```

### 3. Update the server URL in `client/canvas.js`

Find this line and update it to `http://localhost:3000` for local development:

```javascript
// client/canvas.js — inside connectWebSocket()
const SERVER_URL = 'http://localhost:3000';
```

### 4. Start the server

```bash
npm start
```

### 5. Open in your browser

```
http://localhost:3000
```

### 6. Test real-time sync

Open `http://localhost:3000` in **two browser tabs**. Create a room in one tab, copy the Room ID, and join from the other tab. Draw in one — watch it appear in the other instantly.

---

## 🌐 Deployment

### Deploy to Render (recommended — free tier)

**1. Push your code to GitHub**
```bash
git add .
git commit -m "Initial commit"
git push origin main
```

**2. Create a Render account at [render.com](https://render.com)**

**3. New Web Service → Connect your GitHub repo**

**4. Configure the service:**

| Field | Value |
|-------|-------|
| **Name** | `sketchboard` (or any name) |
| **Root Directory** | `/` |
| **Environment** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | `Free` |

**5. Deploy**

Render will give you a URL like `https://sketchboard-xxxx.onrender.com`.

**6. Update `SERVER_URL` in `canvas.js`**

```javascript
const SERVER_URL = 'https://sketchboard-xxxx.onrender.com';
```

Commit and push — Render auto-deploys on every push.

> **Note on free tier:** Render's free tier spins down after 15 minutes of inactivity. The first request after inactivity may take 30–60 seconds to wake up. This is normal for free hosting.

### Environment Variables

No environment variables are required for basic deployment. The server uses:
- `PORT` — automatically provided by Render (defaults to `3000` locally)

---

## 🔮 Future Improvements

These are honest, concrete improvements I would make with more time — not speculative features.

**Near-term (realistic for a solo developer)**
- [ ] **Persistent rooms with SQLite** — drawing history survives server restarts. `better-sqlite3` would add ~50 lines of code.
- [ ] **Text tool** — adds a `type: 'text'` stroke variant to the history model on both client and server.
- [ ] **Pan and zoom** — transform the canvas context using `scale()` and `translate()` to navigate large drawings.
- [ ] **Improved mobile layout** — the current mobile toolbar covers the canvas. A slide-in drawer would be cleaner.

**Medium-term**
- [ ] **Room password protection** — a simple hash check on join before adding the user to the room Map.
- [ ] **Exportable room state as JSON** — download the stroke history, re-upload to resume a session.
- [ ] **Rooms list page** — the `/stats` API endpoint already exists; building a UI on top of it would take an afternoon.

**Longer-term (would require architectural changes)**
- [ ] **Operational Transformation or CRDT** for true conflict-free concurrent edits — currently last-write-wins.
- [ ] **Redis pub/sub** to support multiple server instances (horizontal scaling).
- [ ] **User authentication** with sessions so users have persistent identity across rooms.

---

## 📚 What I Learned

This project was built specifically to understand real-time systems from first principles. Key takeaways:

**WebSockets and Socket.IO**
- The difference between `socket.emit()` (send to one), `socket.to(room).emit()` (send to room, exclude sender), and `io.to(room).emit()` (send to everyone including sender), and *when* to use each.
- How Socket.IO handles reconnection, polling fallback, and the connect/disconnect lifecycle.
- Why rooms (namespaces) matter for isolating events between different groups of users.

**Real-time state management**
- How to use the server as the single source of truth and have all clients re-render from history on state changes (the approach used for undo/redo).
- The difference between optimistic updates (draw locally first, then broadcast) vs waiting for server confirmation — and why optimistic updates feel better.
- How to throttle high-frequency events (cursor moves) to reduce bandwidth without noticeable quality loss.

**Full-stack JavaScript architecture**
- How to structure a Node.js project so the backend and frontend are cleanly separated but share the same repository.
- The Observer pattern — implemented in `WebSocketManager` as a lightweight internal event bus that decouples the transport layer from the drawing engine.
- Why keeping files small and single-responsibility makes debugging significantly easier.

**Frontend fundamentals**
- The HTML5 Canvas API — how `getContext('2d')`, drawing primitives, composite operations, and `getImageData`/`putImageData` work.
- How stacking two `<canvas>` elements with CSS `position: absolute` allows clean separation of local and remote drawing layers.
- CSS custom properties (variables) as a design token system for maintaining consistent theming across multiple files.

---

## 🤝 Contributing

Contributions are welcome — especially if you are also learning full-stack development and want to practice working on an existing codebase.

**Getting started**
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes with clear, descriptive commits
4. Test locally with two browser tabs open
5. Open a Pull Request with a description of what you changed and why

**Good first issues to tackle**
- Add a `stroke-color` indicator to the status bar showing the current color
- Improve the mobile experience (the toolbar could be a slide-up panel)
- Add a rooms list page using the existing `/stats` API endpoint
- Write a basic test for the room creation logic in `server.js`

**Before opening a PR, please ensure:**
- Real-time sync still works between two tabs locally
- No new `alert()` calls (use `showToast()` instead)
- The server still starts cleanly with `npm start`

---

## 📄 License

This project is licensed under the **MIT License** — you are free to use, modify, and distribute it for personal or commercial purposes.

See the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built with ❤️ by Vamsi Vinay using Socket.IO, Node.js, and the HTML5 Canvas API**

*If this project helped you understand real-time systems, consider giving it a ⭐ on GitHub*

</div>
