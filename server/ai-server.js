const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const app = express();
app.use(bodyParser.json());

const PROGRESSIVE_CHESS_RULES = `
You are an expert AI for Progressive Realms, a hexagonal multi-player chess variant.

=== BOARD GEOMETRY ===
- 384 triangular cells arranged in a hexagonal grid.
- Each cell has: id (e.g. "a1".."o8"), color type: "white" (colorless), "red", "green", or "yellow" (colored).
- "Colored" area = red, green, or yellow cells. "Colorless" area = white cells.

=== PIECES (per player, 14 total) ===
Each player has: 1 King, 1 Vizier, 2 Castles, 2 Officers, 2 Horses (Princess), 7 Warriors.
Player colors: red1, green1, yellow1, red2, green2, yellow2.

=== MOVEMENT RULES ===
- Warrior:  1 step in all 12 directions (along corners and sides of triangles).
- King:     1 step in 6 directions (corners + sides). Can cross area barriers.
- Vizier:   Unlimited steps in 6 directions (union of Castle + Officer directions).
- Castle:   Unlimited steps in 3 directions along triangle sides.
- Officer:  Unlimited steps in 3 directions along triangle corners/angles.
- Horse:    Exactly 3 steps in a curved/circular path; can jump over other pieces.

=== AREA BARRIER (critical rule) ===
- Pieces CANNOT capture or defend across area types (colored <-> colorless).
- Exception: The King can move, capture, and defend across BOTH area types freely.
- A Warrior captures only on cells of the same area type as its current position.
- Pieces can physically move through any area, but captures are restricted.

=== WINNING CONDITIONS ===
- Win A: Capture 10 pieces from a single opponent.
- Win B: "Dull the horn" — put the opponent's King in a position with no legal escape (analogous to checkmate).

=== CURRENT PLAYER TURN ORDER ===
red1 → green1 → yellow1 → red2 → green2 → yellow2 → repeat.
Determine the current player from the "currentPlayer" field in the board state.
`;

app.post('/ai-move', async (req, res) => {
  const { board, currentPlayer, legalMoves } = req.body;

  // If legal moves are provided by the frontend, pick the best one directly
  const movesInfo = legalMoves && legalMoves.length > 0
    ? `\nThe following legal moves are available (pieceId -> [targetNodeIds]):\n${JSON.stringify(legalMoves, null, 2)}`
    : '';

  const prompt = `${PROGRESSIVE_CHESS_RULES}

=== CURRENT BOARD STATE ===
Current player: ${currentPlayer || 'red1'}
Pieces (JSON array, each: {id, type, color, nodeId}):
${JSON.stringify(board, null, 2)}
${movesInfo}

=== YOUR TASK ===
Choose the best legal move for player "${currentPlayer || 'red1'}".
Strategy priorities:
1. If you can win by capturing the 10th enemy piece, do it.
2. Capture high-value enemy pieces (King > Vizier > Castle/Officer > Horse > Warrior).
3. Protect your own King from capture.
4. Respect the area barrier rule — non-King pieces cannot capture across area types.
5. Advance Warriors toward enemy territory.

Respond with ONLY a single JSON object in this exact format, nothing else:
{"pieceId":"<id>","from":"<nodeId>","to":"<nodeId>"}
`;

  try {
    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'llama3',
      prompt,
      stream: false
    });

    const raw = response.data.response.trim();
    // Extract JSON from response (model may add extra text)
    const match = raw.match(/\{[^}]*"pieceId"[^}]*\}/);
    const move = match ? match[0] : raw;
    res.json({ move });
  } catch (err) {
    res.status(500).json({ error: 'AI error', details: err.message });
  }
});

app.listen(3001, () => console.log('AI server running on http://localhost:3001'));
