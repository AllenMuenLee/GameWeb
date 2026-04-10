export type GameType = "1a2b" | "tic-tac-toe";

export type Player = {
  id: string;
  name: string;
};

export type GuessResult = {
  guess: string;
  a: number;
  b: number;
  byPlayerId: string;
  at: number;
};

export type OneATwoBState = {
  secrets: Record<string, string | null>;
  guesses: GuessResult[];
};

export type TicTacToeMark = "X" | "O";

export type TicTacToeState = {
  board: Array<TicTacToeMark | null>;
  winner: TicTacToeMark | "draw" | null;
};

export type Room = {
  roomCode: string;
  gameType: GameType;
  players: Player[];
  hostId: string;
  currentTurnPlayerId: string | null;
  createdAt: number;
  updatedAt: number;
  status: "waiting" | "setup" | "playing" | "finished";
  oneATwoB?: OneATwoBState;
  ticTacToe?: TicTacToeState;
  winnerPlayerId: string | null;
};

export type PublicRoomState = {
  roomCode: string;
  gameType: GameType;
  players: Player[];
  currentTurnPlayerId: string | null;
  createdAt: number;
  updatedAt: number;
  status: Room["status"];
  winnerPlayerId: string | null;
  oneATwoB?: {
    guesses: GuessResult[];
    hasSecret: Record<string, boolean>;
  };
  ticTacToe?: TicTacToeState;
};
