export type PlayerStatus = "idle" | "attacking" | "parrying" | "dashing" | "feinting" | "stunned";

export type FacingDirection = "up" | "down" | "left" | "right";

export type PlayerSlot = "player1" | "player2";

export type PlayerState = {
  id: string;
  slot: PlayerSlot;
  name: string;
  x: number;
  y: number;
  hp: number;
  stamina: number;
  momentum: number;
  status: PlayerStatus;
  facing: FacingDirection;
  lastProcessedInputSeq: number;
  windupTimerTicks: number;
  attackTimerTicks: number;
  attackCooldownTicks: number;
  dashTimerTicks: number;
  parryTimerTicks: number;
  stunTimerTicks: number;
  feintTimerTicks: number;
  momentumBoostTimerTicks: number;
  counterStreak: number;
  counterWindowTicks: number;
  attackToken: number;
  attackConnectedOnToken: number | null;
  stats: PlayerMatchStats;
};

export type PlayerMatchStats = {
  attacksThrown: number;
  hitsLanded: number;
  parryAttempts: number;
  parrySuccess: number;
  gotFeinted: number;
  bestCombo: number;
  currentCombo: number;
  lastHitTick: number | null;
};

export type GameState = {
  roomId: string;
  tick: number;
  status: "waiting" | "countdown" | "playing" | "finished";
  createdAt: number;
  updatedAt: number;
  lastTickAt: number;
  durationSeconds: number;
  countdownTicks: number;
  remainingTicks: number;
  winnerPlayerId: string | null;
  endReason: "hp" | "time" | "draw" | null;
  width: number;
  height: number;
  playerIds: string[];
  players: Record<string, PlayerState>;
};

export type InputCommand = {
  seq: number;
  timestamp: number;
  up?: boolean;
  down?: boolean;
  left?: boolean;
  right?: boolean;
  attack?: boolean;
  dash?: boolean;
  parry?: boolean;
  feint?: boolean;
};

export type Snapshot = {
  serverTime: number;
  tickRate: number;
  state: GameState;
};

export type CreateRoomResponse = {
  roomId: string;
  playerId: string;
  slot: PlayerSlot;
  snapshot: Snapshot;
};

export type JoinRoomResponse = {
  roomId: string;
  playerId: string;
  slot: PlayerSlot;
  snapshot: Snapshot;
};

export type SyncRequest = {
  roomId: string;
  playerId: string;
  inputs: InputCommand[];
  clientRttMs?: number;
};

export type SyncResponse = {
  acceptedInputSeq: number;
  snapshot: Snapshot;
  suggestedSyncHz: 10 | 20;
  serverProcessingMs: number;
};

export type RestartRequest = {
  roomId: string;
  playerId: string;
};
