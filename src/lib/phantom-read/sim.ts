import { GameState, InputCommand, PlayerSlot, PlayerState, Snapshot } from "@/types/game";

export const SERVER_TICK_RATE = 20;
export const SERVER_TICK_MS = Math.floor(1000 / SERVER_TICK_RATE);

const ARENA_WIDTH = 960;
const ARENA_HEIGHT = 540;
const PLAYER_SIZE = 34;

const MOVE_SPEED_PER_TICK = 9;
const DASH_SPEED_PER_TICK = 18;
const DASH_DURATION_TICKS = 3;

const ATTACK_WINDUP_TICKS = 5;
const ATTACK_DURATION_TICKS = 4;
const ATTACK_COOLDOWN_TICKS = 8;
const ATTACK_RANGE = 46;
const ATTACK_DAMAGE = 8;

const PARRY_WINDOW_TICKS = 5;
const STUN_DURATION_TICKS = 8;
const FEINT_RECOVERY_TICKS = 3;
const COUNTER_WINDOW_TICKS = 20;

const MAX_STAMINA = 3;
const STAMINA_REGEN_INTERVAL_TICKS = 40;
const MOMENTUM_MAX = 100;
const MOMENTUM_BOOST_TICKS = 60;
const COUNTDOWN_TICKS = 60;
const COMBO_WINDOW_TICKS = 20;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createPlayer(id: string, slot: PlayerSlot, name: string): PlayerState {
  return {
    id,
    slot,
    name,
    x: slot === "player1" ? ARENA_WIDTH * 0.25 : ARENA_WIDTH * 0.75,
    y: ARENA_HEIGHT * 0.5,
    hp: 100,
    stamina: 3,
    momentum: 0,
    status: "idle",
    facing: slot === "player1" ? "right" : "left",
    lastProcessedInputSeq: 0,
    windupTimerTicks: 0,
    attackTimerTicks: 0,
    attackCooldownTicks: 0,
    dashTimerTicks: 0,
    parryTimerTicks: 0,
    stunTimerTicks: 0,
    feintTimerTicks: 0,
    momentumBoostTimerTicks: 0,
    counterStreak: 0,
    counterWindowTicks: 0,
    attackToken: 0,
    attackConnectedOnToken: null,
    stats: {
      attacksThrown: 0,
      hitsLanded: 0,
      parryAttempts: 0,
      parrySuccess: 0,
      gotFeinted: 0,
      bestCombo: 0,
      currentCombo: 0,
      lastHitTick: null,
    },
  };
}

export function createInitialGameState(roomId: string, hostPlayerId: string, hostName: string): GameState {
  const now = Date.now();
  const host = createPlayer(hostPlayerId, "player1", hostName);

  return {
    roomId,
    tick: 0,
    status: "waiting",
    createdAt: now,
    updatedAt: now,
    lastTickAt: now,
    durationSeconds: 90,
    countdownTicks: COUNTDOWN_TICKS,
    remainingTicks: 90 * SERVER_TICK_RATE,
    winnerPlayerId: null,
    endReason: null,
    width: ARENA_WIDTH,
    height: ARENA_HEIGHT,
    playerIds: [host.id],
    players: { [host.id]: host },
  };
}

export function addSecondPlayer(state: GameState, playerId: string, playerName: string): PlayerState {
  if (state.playerIds.length >= 2) {
    throw new Error("ROOM_FULL");
  }

  const player = createPlayer(playerId, "player2", playerName);
  state.playerIds.push(player.id);
  state.players[player.id] = player;
  if (state.playerIds.length === 2 && state.status === "waiting") {
    state.status = "countdown";
    state.countdownTicks = COUNTDOWN_TICKS;
  }
  state.updatedAt = Date.now();
  return player;
}

function normalize(dx: number, dy: number): [number, number] {
  const length = Math.hypot(dx, dy);
  if (length === 0) return [0, 0];
  return [dx / length, dy / length];
}

function resolveFacing(player: PlayerState, input: InputCommand) {
  if (input.left) player.facing = "left";
  else if (input.right) player.facing = "right";
  else if (input.up) player.facing = "up";
  else if (input.down) player.facing = "down";
}

function applyMovement(player: PlayerState, state: GameState, input: InputCommand) {
  let dx = 0;
  let dy = 0;

  if (input.left) dx -= 1;
  if (input.right) dx += 1;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;

  const [nx, ny] = normalize(dx, dy);
  if (nx === 0 && ny === 0) return;

  const speed =
    player.dashTimerTicks > 0
      ? DASH_SPEED_PER_TICK
      : player.momentumBoostTimerTicks > 0
        ? MOVE_SPEED_PER_TICK * 1.1
        : MOVE_SPEED_PER_TICK;

  player.x = clamp(player.x + nx * speed, PLAYER_SIZE / 2, state.width - PLAYER_SIZE / 2);
  player.y = clamp(player.y + ny * speed, PLAYER_SIZE / 2, state.height - PLAYER_SIZE / 2);
}

function getAttackCenter(player: PlayerState): { x: number; y: number } {
  if (player.facing === "left") return { x: player.x - ATTACK_RANGE, y: player.y };
  if (player.facing === "right") return { x: player.x + ATTACK_RANGE, y: player.y };
  if (player.facing === "up") return { x: player.x, y: player.y - ATTACK_RANGE };
  return { x: player.x, y: player.y + ATTACK_RANGE };
}

function testAttackHit(attacker: PlayerState, defender: PlayerState): boolean {
  const hit = getAttackCenter(attacker);
  const dx = Math.abs(hit.x - defender.x);
  const dy = Math.abs(hit.y - defender.y);
  const size = PLAYER_SIZE / 2 + 16;
  return dx <= size && dy <= size;
}

function resolveCombat(state: GameState) {
  if (state.playerIds.length < 2) return;

  const a = state.players[state.playerIds[0]];
  const b = state.players[state.playerIds[1]];

  const applyCounter = (parryer: PlayerState, attacker: PlayerState) => {
    attacker.stunTimerTicks = STUN_DURATION_TICKS;
    attacker.status = "stunned";
    attacker.windupTimerTicks = 0;
    attacker.attackTimerTicks = 0;
    attacker.attackConnectedOnToken = attacker.attackToken;

    parryer.counterStreak = parryer.counterWindowTicks > 0 ? parryer.counterStreak + 1 : 1;
    parryer.counterWindowTicks = COUNTER_WINDOW_TICKS;

    let counterDamage = 6;
    if (parryer.counterStreak >= 3) {
      counterDamage = Math.floor(counterDamage * 1.1);
      parryer.counterStreak = 0;
      parryer.counterWindowTicks = 0;
    }

    attacker.hp = Math.max(0, attacker.hp - counterDamage);
    parryer.momentum = Math.min(MOMENTUM_MAX, parryer.momentum + 14);
    attacker.momentum = Math.max(0, attacker.momentum - 8);
    parryer.stats.parrySuccess += 1;
  };

  const applyAttackDamage = (attacker: PlayerState, defender: PlayerState) => {
    const base = attacker.momentumBoostTimerTicks > 0 ? ATTACK_DAMAGE * 1.1 : ATTACK_DAMAGE;
    const damage = Math.round(base);
    defender.hp = Math.max(0, defender.hp - damage);
    attacker.attackConnectedOnToken = attacker.attackToken;
    attacker.momentum = Math.min(MOMENTUM_MAX, attacker.momentum + 8);
    defender.momentum = Math.max(0, defender.momentum - 5);
    attacker.stats.hitsLanded += 1;

    if (attacker.stats.lastHitTick === null || state.tick - attacker.stats.lastHitTick > COMBO_WINDOW_TICKS) {
      attacker.stats.currentCombo = 1;
    } else {
      attacker.stats.currentCombo += 1;
    }
    attacker.stats.lastHitTick = state.tick;
    attacker.stats.bestCombo = Math.max(attacker.stats.bestCombo, attacker.stats.currentCombo);
    defender.stats.currentCombo = 0;
  };

  if (
    a.attackTimerTicks > 0 &&
    a.attackConnectedOnToken !== a.attackToken &&
    testAttackHit(a, b) &&
    b.hp > 0
  ) {
    if (b.parryTimerTicks > 0) applyCounter(b, a);
    else applyAttackDamage(a, b);
  }

  if (
    b.attackTimerTicks > 0 &&
    b.attackConnectedOnToken !== b.attackToken &&
    testAttackHit(b, a) &&
    a.hp > 0
  ) {
    if (a.parryTimerTicks > 0) applyCounter(a, b);
    else applyAttackDamage(b, a);
  }
}

function setEndByHP(state: GameState) {
  const first = state.players[state.playerIds[0]];
  const second = state.players[state.playerIds[1]];
  state.status = "finished";
  state.endReason = "hp";
  state.winnerPlayerId = first.hp === second.hp ? null : first.hp > second.hp ? first.id : second.id;
}

function setEndByTime(state: GameState) {
  const first = state.players[state.playerIds[0]];
  const second = state.players[state.playerIds[1]];
  state.status = "finished";
  state.endReason = "time";

  if (first.hp !== second.hp) {
    state.winnerPlayerId = first.hp > second.hp ? first.id : second.id;
    return;
  }
  if (first.momentum !== second.momentum) {
    state.winnerPlayerId = first.momentum > second.momentum ? first.id : second.id;
    return;
  }
  state.winnerPlayerId = null;
  state.endReason = "draw";
}

function advanceOneTick(state: GameState) {
  if (state.status === "waiting") {
    state.tick += 1;
    state.lastTickAt += SERVER_TICK_MS;
    state.updatedAt = Date.now();
    return;
  }

  if (state.status === "countdown") {
    state.countdownTicks = Math.max(0, state.countdownTicks - 1);
    if (state.countdownTicks === 0) {
      state.status = "playing";
    }
    state.tick += 1;
    state.lastTickAt += SERVER_TICK_MS;
    state.updatedAt = Date.now();
    return;
  }

  if (state.status === "finished") {
    state.tick += 1;
    state.lastTickAt += SERVER_TICK_MS;
    state.updatedAt = Date.now();
    return;
  }

  for (const id of state.playerIds) {
    const player = state.players[id];
    if (!player) continue;

    if (player.stunTimerTicks > 0) player.stunTimerTicks -= 1;
    if (player.windupTimerTicks > 0) {
      player.windupTimerTicks -= 1;
      player.status = "attacking";
      if (player.windupTimerTicks === 0 && player.attackTimerTicks === 0) {
        player.attackTimerTicks = ATTACK_DURATION_TICKS;
      }
    }
    if (player.attackCooldownTicks > 0) player.attackCooldownTicks -= 1;
    if (player.attackTimerTicks > 0) {
      player.attackTimerTicks -= 1;
      player.status = "attacking";
    }
    if (player.parryTimerTicks > 0) player.parryTimerTicks -= 1;
    if (player.dashTimerTicks > 0) player.dashTimerTicks -= 1;
    if (player.feintTimerTicks > 0) player.feintTimerTicks -= 1;
    if (player.momentumBoostTimerTicks > 0) player.momentumBoostTimerTicks -= 1;
    if (player.counterWindowTicks > 0) {
      player.counterWindowTicks -= 1;
      if (player.counterWindowTicks === 0) player.counterStreak = 0;
    }
    if (player.stats.lastHitTick !== null && state.tick - player.stats.lastHitTick > COMBO_WINDOW_TICKS) {
      player.stats.currentCombo = 0;
    }

    if (state.tick % STAMINA_REGEN_INTERVAL_TICKS === 0 && player.stamina < MAX_STAMINA) {
      player.stamina += 1;
    }
    if (player.momentum >= MOMENTUM_MAX && player.momentumBoostTimerTicks === 0) {
      player.momentumBoostTimerTicks = MOMENTUM_BOOST_TICKS;
      player.momentum = 60;
    }

    if (player.stunTimerTicks > 0) player.status = "stunned";
    else if (player.feintTimerTicks > 0) player.status = "feinting";
    else if (player.parryTimerTicks > 0) player.status = "parrying";
    else if (player.dashTimerTicks > 0) player.status = "dashing";
    else if (player.windupTimerTicks === 0 && player.attackTimerTicks === 0) player.status = "idle";
  }

  resolveCombat(state);

  state.remainingTicks = Math.max(0, state.durationSeconds * SERVER_TICK_RATE - state.tick - 1);
  if (state.playerIds.length === 2) {
    const first = state.players[state.playerIds[0]];
    const second = state.players[state.playerIds[1]];
    if (first.hp <= 0 || second.hp <= 0) setEndByHP(state);
    else if (state.remainingTicks <= 0) setEndByTime(state);
  }

  state.tick += 1;
  state.lastTickAt += SERVER_TICK_MS;
  state.updatedAt = Date.now();
}

export function advanceToNow(state: GameState, now: number, maxTicks = 6) {
  let safety = 0;
  while (now - state.lastTickAt >= SERVER_TICK_MS && safety < maxTicks) {
    advanceOneTick(state);
    safety += 1;
  }
}

export function applyInput(state: GameState, playerId: string, input: InputCommand): number {
  const player = state.players[playerId];
  if (!player) {
    throw new Error("PLAYER_NOT_IN_ROOM");
  }

  if (input.seq <= player.lastProcessedInputSeq) {
    return player.lastProcessedInputSeq;
  }

  if (state.status !== "playing" || player.stunTimerTicks > 0) {
    player.lastProcessedInputSeq = input.seq;
    return player.lastProcessedInputSeq;
  }

  resolveFacing(player, input);
  applyMovement(player, state, input);

  if (input.feint && player.windupTimerTicks > 0 && player.stamina > 0) {
    const opponentId = state.playerIds.find((id) => id !== playerId);
    if (opponentId) {
      const opponent = state.players[opponentId];
      if (opponent.parryTimerTicks > 0) {
        opponent.stats.gotFeinted += 1;
      }
    }
    player.stamina -= 1;
    player.windupTimerTicks = 0;
    player.attackTimerTicks = 0;
    player.attackConnectedOnToken = player.attackToken;
    player.feintTimerTicks = FEINT_RECOVERY_TICKS;
    player.status = "feinting";
  } else if (input.attack && player.attackCooldownTicks === 0) {
    player.status = "attacking";
    player.windupTimerTicks = ATTACK_WINDUP_TICKS;
    player.attackTimerTicks = 0;
    player.attackCooldownTicks = ATTACK_COOLDOWN_TICKS;
    player.attackToken += 1;
    player.attackConnectedOnToken = null;
    player.stats.attacksThrown += 1;
  } else if (input.parry) {
    player.parryTimerTicks = PARRY_WINDOW_TICKS;
    player.status = "parrying";
    player.stats.parryAttempts += 1;
  } else if (input.dash && player.stamina > 0) {
    player.stamina -= 1;
    player.dashTimerTicks = DASH_DURATION_TICKS;
    player.status = "dashing";
  } else if (player.attackTimerTicks === 0 && player.windupTimerTicks === 0) {
    player.status = "idle";
  }

  player.lastProcessedInputSeq = input.seq;
  state.updatedAt = Date.now();
  return player.lastProcessedInputSeq;
}

export function toSnapshot(state: GameState): Snapshot {
  return {
    serverTime: Date.now(),
    tickRate: SERVER_TICK_RATE,
    state,
  };
}

export function createRoomId(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 6; i += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

export function createPlayerIdentity() {
  return crypto.randomUUID();
}

export function getAttackHitbox(player: PlayerState) {
  if (player.attackTimerTicks <= 0 && player.windupTimerTicks <= 0) {
    return null;
  }
  const center = getAttackCenter(player);
  const size = 26;
  return {
    x: center.x - size / 2,
    y: center.y - size / 2,
    w: size,
    h: size,
  };
}

export function resetMatchInRoom(state: GameState) {
  const now = Date.now();
  state.tick = 0;
  state.status = state.playerIds.length === 2 ? "countdown" : "waiting";
  state.countdownTicks = COUNTDOWN_TICKS;
  state.remainingTicks = state.durationSeconds * SERVER_TICK_RATE;
  state.winnerPlayerId = null;
  state.endReason = null;
  state.lastTickAt = now;
  state.updatedAt = now;

  for (const id of state.playerIds) {
    const player = state.players[id];
    if (!player) continue;

    player.x = player.slot === "player1" ? ARENA_WIDTH * 0.25 : ARENA_WIDTH * 0.75;
    player.y = ARENA_HEIGHT * 0.5;
    player.hp = 100;
    player.stamina = 3;
    player.momentum = 0;
    player.status = "idle";
    player.facing = player.slot === "player1" ? "right" : "left";
    player.windupTimerTicks = 0;
    player.attackTimerTicks = 0;
    player.attackCooldownTicks = 0;
    player.dashTimerTicks = 0;
    player.parryTimerTicks = 0;
    player.stunTimerTicks = 0;
    player.feintTimerTicks = 0;
    player.momentumBoostTimerTicks = 0;
    player.counterStreak = 0;
    player.counterWindowTicks = 0;
    player.attackToken = 0;
    player.attackConnectedOnToken = null;
    player.lastProcessedInputSeq = 0;
    player.stats = {
      attacksThrown: 0,
      hitsLanded: 0,
      parryAttempts: 0,
      parrySuccess: 0,
      gotFeinted: 0,
      bestCombo: 0,
      currentCombo: 0,
      lastHitTick: null,
    };
  }
}
