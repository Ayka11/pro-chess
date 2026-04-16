// src/game/ai.ts
// Helper for AI move requests

export async function fetchAIMove(
  board: any,
  currentPlayer?: string,
  legalMoves?: Record<string, string[]>
): Promise<any> {
  const response = await fetch('http://localhost:3001/ai-move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ board, currentPlayer, legalMoves })
  });
  if (!response.ok) throw new Error('AI server error');
  const data = await response.json();
  return data.move;
}
