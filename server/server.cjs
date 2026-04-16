const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");

const wss = new WebSocket.Server({ port: 8080 });

// Turn order matching the game's PieceColor enum
const PLAYER_COLORS = ["red1", "green1", "yellow1", "red2", "green2", "yellow2"];

const rooms = {};

wss.on("connection", (ws) => {
  ws.id = uuidv4();
  ws.roomId = null;
  ws.playerIndex = -1;

  ws.on("message", (message) => {
    let data;
    try { data = JSON.parse(message); } catch { return; }

    switch (data.type) {
      case "create_room":  handleCreateRoom(ws, data);  break;
      case "join_room":    handleJoinRoom(ws, data);    break;
      case "move":         handleMove(ws, data);         break;
    }
  });

  ws.on("close", () => handleDisconnect(ws));
});

function handleCreateRoom(ws, data) {
  const roomId = uuidv4().slice(0, 6).toUpperCase();
  ws.roomId = roomId;
  ws.playerIndex = 0;

  rooms[roomId] = {
    players: [ws],
    board: data.board || null,
    currentPlayerIndex: 0,
    maxPlayers: Math.min(Math.max(parseInt(data.maxPlayers) || 2, 2), 6),
    started: false
  };

  ws.send(JSON.stringify({
    type: "room_created",
    roomId,
    yourColor: PLAYER_COLORS[0]
  }));
  console.log(`Room ${roomId} created`);
}

function handleJoinRoom(ws, data) {
  const room = rooms[data.roomId];
  if (!room) {
    ws.send(JSON.stringify({ type: "error", message: "Room not found." }));
    return;
  }
  if (room.started) {
    ws.send(JSON.stringify({ type: "error", message: "Game already started." }));
    return;
  }
  if (room.players.length >= room.maxPlayers) {
    ws.send(JSON.stringify({ type: "error", message: "Room is full." }));
    return;
  }

  const playerIndex = room.players.length;
  ws.roomId = data.roomId;
  ws.playerIndex = playerIndex;
  room.players.push(ws);

  const allColors = room.players.map((_, i) => PLAYER_COLORS[i]);

  ws.send(JSON.stringify({
    type: "joined_room",
    roomId: data.roomId,
    yourColor: PLAYER_COLORS[playerIndex],
    allColors
  }));

  if (room.players.length >= room.maxPlayers) {
    room.started = true;
    broadcast(room, {
      type: "game_start",
      playerCount: room.players.length,
      allColors,
      currentPlayer: PLAYER_COLORS[0],
      board: room.board
    });
    console.log(`Game started in room ${data.roomId}`);
  }
}

function handleMove(ws, data) {
  const room = rooms[ws.roomId];
  if (!room || !room.started) return;

  if (room.currentPlayerIndex !== ws.playerIndex) {
    ws.send(JSON.stringify({ type: "error", message: "Not your turn." }));
    return;
  }

  room.board = data.board;
  room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;

  broadcast(room, {
    type: "board_update",
    board: room.board,
    currentPlayer: PLAYER_COLORS[room.currentPlayerIndex],
    moveBy: PLAYER_COLORS[ws.playerIndex]
  });
}

function handleDisconnect(ws) {
  if (!ws.roomId) return;
  const room = rooms[ws.roomId];
  if (!room) return;

  const color = PLAYER_COLORS[ws.playerIndex] || "unknown";
  room.players = room.players.filter((p) => p !== ws);
  console.log(`Player ${color} left room ${ws.roomId}`);

  if (room.players.length === 0) {
    delete rooms[ws.roomId];
  } else {
    room.currentPlayerIndex = room.currentPlayerIndex % room.players.length;
    broadcast(room, {
      type: "player_disconnected",
      playerColor: color,
      remaining: room.players.length
    });
  }
}

function broadcast(room, data) {
  const msg = JSON.stringify(data);
  room.players.forEach((player) => {
    if (player.readyState === WebSocket.OPEN) player.send(msg);
  });
}

console.log("Multiplayer server running on ws://localhost:8080");
