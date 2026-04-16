
// ─── State ────────────────────────────────────────────────────────────────────
import { io, Socket } from "socket.io-client";
let socket: Socket | null = null;
let reconnectAttempts = 0;
let myColor: string | null = null;
let currentTurnColor: string | null = null;
let myRoomId: string | null = null;

const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 2000;

export type BoardType = any;

// ─── Event Callbacks ──────────────────────────────────────────────────────────
type RoomCreatedHandler  = (roomId: string, yourColor: string) => void;
type JoinedRoomHandler   = (roomId: string, yourColor: string, allColors: string[]) => void;
type GameStartHandler    = (data: { playerCount: number; allColors: string[]; currentPlayer: string; board: BoardType }) => void;
type BoardUpdateHandler  = (board: BoardType, currentPlayer: string, moveBy: string) => void;
type ErrorHandler        = (message: string) => void;
type DisconnectedHandler = (playerColor: string, remaining: number) => void;

const handlers: {
  room_created:       RoomCreatedHandler[];
  joined_room:        JoinedRoomHandler[];
  game_start:         GameStartHandler[];
  board_update:       BoardUpdateHandler[];
  error:              ErrorHandler[];
  player_disconnected: DisconnectedHandler[];
} = {
  room_created:        [],
  joined_room:         [],
  game_start:          [],
  board_update:        [],
  error:               [],
  player_disconnected: []
};

// ─── Public Event Registration ────────────────────────────────────────────────
export function onRoomCreated(fn: RoomCreatedHandler)   { handlers.room_created.push(fn); }
export function onJoinedRoom(fn: JoinedRoomHandler)     { handlers.joined_room.push(fn); }
export function onGameStart(fn: GameStartHandler)       { handlers.game_start.push(fn); }
export function onBoardUpdate(fn: BoardUpdateHandler)   { handlers.board_update.push(fn); }
export function onSocketError(fn: ErrorHandler)         { handlers.error.push(fn); }
export function onPlayerDisconnected(fn: DisconnectedHandler) { handlers.player_disconnected.push(fn); }

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function getMyColor(): string | null        { return myColor; }
export function getCurrentTurn(): string | null    { return currentTurnColor; }
export function getMyRoomId(): string | null       { return myRoomId; }
export function isMyTurn(): boolean                { return !!myColor && myColor === currentTurnColor; }
export function isConnected(): boolean             { return socket?.connected ?? false; }

// ─── Connect ──────────────────────────────────────────────────────────────────
export function connect() {
  function doConnect() {
    socket = io("http://localhost:3001", {
      reconnection: false,
      transports: ["websocket", "polling"]
    });

    socket.on("connect", () => {
      console.log("[socket] Connected to multiplayer server");
      showStatus("Connected to multiplayer server.", true);
      // Reconnect logic
      if (myRoomId) {
        socket!.emit("reconnectPlayer", { roomId: myRoomId });
      }
    });

    socket.on("gameCreated", (roomId: string) => {
      myRoomId = roomId;
      myColor = "white";
      handlers.room_created.forEach(fn => fn(roomId, myColor!));
      showStatus(`Room created: ${roomId} — you are white`, true);
    });

    socket.on("roomUpdate", (room: any) => {
      myRoomId = room.id;
      // Find my color
      const player = room.players.find((p: any) => p.id === socket!.id);
      if (player) myColor = player.color;
      const allColors = room.players.map((p: any) => p.color);
      handlers.joined_room.forEach(fn => fn(room.id, myColor!, allColors));
      showStatus(`Joined room ${room.id} — you are ${myColor}`, true);
    });

    socket.on("gameStarted", (room: any) => {
      const playerCount = room.players.length;
      const allColors = room.players.map((p: any) => p.color);
      const currentPlayer = room.players[room.turn].color;
      handlers.game_start.forEach(fn => fn({ playerCount, allColors, currentPlayer, board: room.board }));
      showStatus(`Game started — ${currentPlayer} moves first`, true);
    });

    socket.on("gameState", (room: any) => {
      const currentPlayer = room.players[room.turn].color;
      handlers.board_update.forEach(fn => fn(room.board, currentPlayer, ""));
      showStatus(`Now ${currentPlayer}'s turn`, true);
      (window as any).updateBoard?.(room.board);
    });

    socket.on("disconnect", () => {
      console.log("[socket] Disconnected from multiplayer server");
      if (reconnectAttempts === 0) {
        showStatus("Multiplayer unavailable. Playing in single-player mode.", false);
      }
    });

    socket.on("connect_error", (error: Error) => {
      if (reconnectAttempts === 0) {
        console.log("[socket] Backend server not available — single-player mode enabled");
        showStatus("Multiplayer unavailable. Playing in single-player mode.", false);
      }
      reconnectAttempts++;
    });
  }
  doConnect();
}

export function createGame(playerName: string) {
  socket?.emit("createGame", { playerName });
}

export function joinGame(roomId: string, playerName: string) {
  socket?.emit("joinGame", { roomId, playerName });
}

export function startGame(roomId: string) {
  socket?.emit("startGame", roomId);
}

export function makeMove(roomId: string, move: any) {
  socket?.emit("makeMove", { roomId, move });
}

// ─── Internal ─────────────────────────────────────────────────────────────────
function send(data: object) {
  if (!socket?.connected) {
    console.warn("[socket] Cannot send — not connected");
    return;
  }
  socket.emit("message", JSON.stringify(data));
}

function showStatus(message: string, success: boolean) {
  let el = document.getElementById("multiplayer-status");
  if (!el) {
    el = document.createElement("div");
    el.id = "multiplayer-status";
    el.style.cssText = [
      "position:fixed", "bottom:24px", "left:50%", "transform:translateX(-50%)",
      "padding:12px 32px", "border-radius:12px", "font-size:1.1rem",
      "font-family:Segoe UI,system-ui,sans-serif", "z-index:9999",
      "box-shadow:0 2px 16px #0006", "pointer-events:none"
    ].join(";");
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.style.background = success ? "#1e7c3a" : "#7c1e1e";
  el.style.color = "#fff";
  el.style.opacity = "0.97";
  el.style.transition = "opacity 0.3s";
  if (success) {
    setTimeout(() => { if (el) el.style.opacity = "0"; }, 3000);
  }
}
