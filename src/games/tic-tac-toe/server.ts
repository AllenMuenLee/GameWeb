import { Room, TicTacToeMark } from "@/lib/multiplayer/types";

function calculateWinner(board: Array<TicTacToeMark | null>): TicTacToeMark | "draw" | null {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) {
      return board[a];
    }
  }

  if (board.every((cell) => cell !== null)) {
    return "draw";
  }

  return null;
}

export function initializeTicTacToeRoom(room: Room) {
  room.ticTacToe = {
    board: Array.from({ length: 9 }, () => null),
    winner: null,
  };
}

export function onJoinTicTacToe(room: Room) {
  room.status = "playing";
  room.currentTurnPlayerId = room.players[0].id;
}

export function applyTicTacToeAction(room: Room, playerId: string, action: Record<string, unknown>) {
  if (!room.ticTacToe) {
    throw new Error("INVALID_ROOM_STATE");
  }

  if (action.type === "restart-game") {
    room.ticTacToe.board = Array.from({ length: 9 }, () => null);
    room.ticTacToe.winner = null;
    room.winnerPlayerId = null;
    room.status = room.players.length === 2 ? "playing" : "waiting";
    room.currentTurnPlayerId = room.players.length === 2 ? room.players[0].id : null;
    return;
  }

  if (action.type !== "place-mark") {
    throw new Error("UNKNOWN_ACTION");
  }

  if (room.status !== "playing") {
    throw new Error("GAME_NOT_PLAYING");
  }

  if (room.players.length < 2) {
    throw new Error("WAITING_FOR_OPPONENT");
  }

  if (room.currentTurnPlayerId !== playerId) {
    throw new Error("NOT_YOUR_TURN");
  }

  const index = Number(action.index);
  if (!Number.isInteger(index) || index < 0 || index > 8) {
    throw new Error("INVALID_INDEX");
  }

  if (room.ticTacToe.board[index] !== null) {
    throw new Error("CELL_ALREADY_USED");
  }

  const playerIndex = room.players.findIndex((p) => p.id === playerId);
  const mark: TicTacToeMark = playerIndex === 0 ? "X" : "O";
  room.ticTacToe.board[index] = mark;

  const winner = calculateWinner(room.ticTacToe.board);
  room.ticTacToe.winner = winner;

  if (winner === "X" || winner === "O") {
    const winnerIndex = winner === "X" ? 0 : 1;
    room.winnerPlayerId = room.players[winnerIndex]?.id ?? null;
    room.status = "finished";
    room.currentTurnPlayerId = null;
    return;
  }

  if (winner === "draw") {
    room.status = "finished";
    room.currentTurnPlayerId = null;
    return;
  }

  const nextPlayer = room.players.find((p) => p.id !== playerId);
  room.currentTurnPlayerId = nextPlayer?.id ?? null;
}
