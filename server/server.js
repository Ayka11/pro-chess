const rooms = {};
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
	cors: {
		origin: "*"
	}
});

		console.log("Game server running");

io.on("connection", socket => {

	console.log("Player connected");

	socket.on("createGame", ({ playerName }) => {
		const roomId = uuidv4();
		rooms[roomId] = {
			id: roomId,
			players: [{
				id: socket.id,
				name: playerName,
				color: "white"
			}],
			board: createInitialBoard(),
			turn: 0,
			started: false,
			turnTimer: 60
		};
		socket.join(roomId);
		socket.emit("gameCreated", roomId);
	});

	socket.on("joinGame", ({ roomId, playerName }) => {
		const room = rooms[roomId];
		if (!room) return;
		room.players.push({
			id: socket.id,
			name: playerName,
			color: getPlayerColor(room.players.length)
		});
		socket.join(roomId);
		io.to(roomId).emit("roomUpdate", room);
	});

	socket.on("startGame", (roomId) => {
		const room = rooms[roomId];
		if (!room) return;
		room.started = true;
		io.to(roomId).emit("gameStarted", room);
	});

	socket.on("makeMove", ({ roomId, move }) => {
		const room = rooms[roomId];
		if (!room) return;
		if (socket.id !== room.players[room.turn].id) return;
		const valid = validateMove(move, room);
		if (!valid) return;
		applyMove(move, room);
		room.turn = (room.turn + 1) % room.players.length;
		room.turnTimer = 60;
		io.to(roomId).emit("gameState", room);
	});

	socket.on("reconnectPlayer", ({ roomId }) => {
		socket.join(roomId);
		io.to(socket.id).emit("gameState", rooms[roomId]);
	});

	socket.on("disconnect", () => {
		console.log("disconnect");
		// Optionally handle player removal or reconnection grace period here
	});
});

// Turn timer interval
setInterval(() => {
	Object.values(rooms).forEach(room => {
		if (!room.started) return;
		room.turnTimer--;
		if (room.turnTimer <= 0) {
			room.turn = (room.turn + 1) % room.players.length;
			room.turnTimer = 60;
			io.to(room.id).emit("gameState", room);
		}
	});
}, 1000);

server.listen(3001, () => {
	console.log("Game server running");
});

function createInitialBoard() {
	// TODO: Implement your initial board state
	return {};
}

function validateMove(move, room) {
	// TODO: Call your real move validation engine here
	return true;
}

function applyMove(move, room) {
	room.board = move;
}

function getPlayerColor(numPlayers) {
	// Alternate colors, expand as needed
	return numPlayers % 2 === 0 ? "white" : "black";
}
