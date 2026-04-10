export type GameType = "1a2b" | "tic-tac-toe" | "phantom-read";

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

export type PhantomReadAction = "strike" | "parry" | "dash" | "feint" | "focus";
export type PhantomReadReadTarget = PhantomReadAction;
export type PhantomReadDashDirection = "left" | "right";

export type PhantomReadMove = {
  action: PhantomReadAction;
  read: PhantomReadReadTarget;
  dashDirection?: PhantomReadDashDirection;
};

export type PhantomReadFighter = {
  hp: number;
  stamina: number;
  momentum: number;
  position: number;
  readStreak: number;
  pendingBonusDamage: number;
  lastAction: PhantomReadAction | null;
};

export type PhantomReadRoundLog = {
  round: number;
  lines: string[];
  at: number;
};

export type PhantomReadState = {
  fighters: Record<string, PhantomReadFighter>;
  round: number;
  submissions: Record<string, PhantomReadMove | null>;
  logs: PhantomReadRoundLog[];
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
  phantomRead?: PhantomReadState;
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
  phantomRead?: {
    round: number;
    fighters: Record<string, PhantomReadFighter>;
    submitted: Record<string, boolean>;
    recentLogs: PhantomReadRoundLog[];
  };
};
