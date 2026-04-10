import {
  PhantomReadAction,
  PhantomReadFighter,
  PhantomReadMove,
  PhantomReadState,
  Room,
} from "@/lib/multiplayer/types";

const MAX_HP = 100;
const MAX_STAMINA = 3;
const MAX_MOMENTUM = 100;
const MAX_ROUNDS = 30;

function createFighter(): PhantomReadFighter {
  return {
    hp: MAX_HP,
    stamina: MAX_STAMINA,
    momentum: 0,
    position: 0,
    readStreak: 0,
    pendingBonusDamage: 0,
    lastAction: null,
  };
}

function ensureState(room: Room): PhantomReadState {
  if (!room.phantomRead) {
    room.phantomRead = {
      fighters: {},
      round: 1,
      submissions: {},
      logs: [],
    };
  }
  return room.phantomRead;
}

function isAction(value: unknown): value is PhantomReadAction {
  return value === "strike" || value === "parry" || value === "dash" || value === "feint" || value === "focus";
}

function isMove(value: unknown): value is PhantomReadMove {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PhantomReadMove>;
  return isAction(candidate.action) && isAction(candidate.read);
}

function addLog(room: Room, lines: string[]) {
  const state = ensureState(room);
  state.logs.push({
    round: state.round,
    lines,
    at: Date.now(),
  });
  state.logs = state.logs.slice(-8);
}

function beginRound(room: Room) {
  const state = ensureState(room);
  for (const player of room.players) {
    state.submissions[player.id] = null;
  }
}

function resolveReadBonus(reader: PhantomReadFighter, targetMove: PhantomReadMove): number {
  if (targetMove.action === targetMove.read) {
    reader.readStreak += 1;
  } else {
    reader.readStreak = 0;
  }

  if (reader.readStreak >= 2) {
    reader.pendingBonusDamage = 2;
  }

  const bonus = reader.pendingBonusDamage;
  reader.pendingBonusDamage = 0;
  return bonus;
}

function applyMomentum(fighter: PhantomReadFighter, delta: number) {
  fighter.momentum = Math.max(0, Math.min(MAX_MOMENTUM, fighter.momentum + delta));
}

function normalizeRoundResources(fighter: PhantomReadFighter) {
  if (fighter.stamina < MAX_STAMINA) {
    fighter.stamina += 1;
  }
}

function resolveRound(room: Room, firstId: string, secondId: string) {
  const state = ensureState(room);
  const firstMove = state.submissions[firstId];
  const secondMove = state.submissions[secondId];
  if (!firstMove || !secondMove) return;

  const first = state.fighters[firstId];
  const second = state.fighters[secondId];

  const firstBonus = resolveReadBonus(first, secondMove);
  const secondBonus = resolveReadBonus(second, firstMove);

  let firstDamage = 0;
  let secondDamage = 0;

  if (firstMove.action === "strike" && secondMove.action !== "parry" && secondMove.action !== "dash") {
    secondDamage += 12 + firstBonus;
    applyMomentum(first, 8);
  }
  if (secondMove.action === "strike" && firstMove.action !== "parry" && firstMove.action !== "dash") {
    firstDamage += 12 + secondBonus;
    applyMomentum(second, 8);
  }

  if (firstMove.action === "strike" && secondMove.action === "parry") {
    firstDamage += 10 + secondBonus;
    applyMomentum(second, 12);
  }
  if (secondMove.action === "strike" && firstMove.action === "parry") {
    secondDamage += 10 + firstBonus;
    applyMomentum(first, 12);
  }

  if (firstMove.action === "feint" && secondMove.action === "parry") {
    second.stamina = Math.max(0, second.stamina - 1);
  }
  if (secondMove.action === "feint" && firstMove.action === "parry") {
    first.stamina = Math.max(0, first.stamina - 1);
  }

  if (firstMove.action === "dash") {
    first.stamina = Math.max(0, first.stamina - 1);
  }
  if (secondMove.action === "dash") {
    second.stamina = Math.max(0, second.stamina - 1);
  }

  first.hp = Math.max(0, first.hp - firstDamage);
  second.hp = Math.max(0, second.hp - secondDamage);
  first.lastAction = firstMove.action;
  second.lastAction = secondMove.action;

  normalizeRoundResources(first);
  normalizeRoundResources(second);

  addLog(room, [
    `${room.players[0]?.name ?? "P1"} used ${firstMove.action}; ${room.players[1]?.name ?? "P2"} used ${secondMove.action}.`,
    `Damage: ${firstDamage} -> ${room.players[0]?.name ?? "P1"}, ${secondDamage} -> ${room.players[1]?.name ?? "P2"}.`,
  ]);

  const finishedByHp = first.hp <= 0 || second.hp <= 0;
  const finishedByRound = state.round >= MAX_ROUNDS;

  if (finishedByHp || finishedByRound) {
    room.status = "finished";
    if (first.hp === second.hp) {
      room.winnerPlayerId = first.momentum === second.momentum ? null : first.momentum > second.momentum ? firstId : secondId;
    } else {
      room.winnerPlayerId = first.hp > second.hp ? firstId : secondId;
    }
    return;
  }

  state.round += 1;
  beginRound(room);
}

function restart(room: Room) {
  const state = ensureState(room);
  state.round = 1;
  state.logs = [];
  state.fighters = {};
  state.submissions = {};
  for (const player of room.players) {
    state.fighters[player.id] = createFighter();
    state.submissions[player.id] = null;
  }
  room.status = room.players.length < 2 ? "waiting" : "playing";
  room.winnerPlayerId = null;
}

export function initializePhantomReadRoom(room: Room) {
  const state = ensureState(room);
  state.round = 1;
  state.logs = [];
  state.fighters = {};
  state.submissions = {};

  for (const player of room.players) {
    state.fighters[player.id] = createFighter();
    state.submissions[player.id] = null;
  }

  room.currentTurnPlayerId = null;
  room.status = room.players.length < 2 ? "waiting" : "playing";
}

export function onJoinPhantomRead(room: Room, playerId: string) {
  const state = ensureState(room);
  if (!state.fighters[playerId]) {
    state.fighters[playerId] = createFighter();
  }
  if (!(playerId in state.submissions)) {
    state.submissions[playerId] = null;
  }
  if (room.players.length >= 2) {
    room.status = "playing";
    room.currentTurnPlayerId = null;
    beginRound(room);
  }
}

export function applyPhantomReadAction(room: Room, playerId: string, action: Record<string, unknown>) {
  const state = ensureState(room);
  if (!state.fighters[playerId]) {
    throw new Error("PLAYER_NOT_IN_ROOM");
  }

  const actionType = action.type;
  if (actionType === "restart-game") {
    restart(room);
    return;
  }

  if (room.status !== "playing") {
    throw new Error("ROOM_NOT_PLAYING");
  }

  const moveCandidate = action.move ?? action;
  if (!isMove(moveCandidate)) {
    throw new Error("INVALID_MOVE");
  }

  state.submissions[playerId] = moveCandidate;
  const allSubmitted = room.players.every((player) => state.submissions[player.id] !== null);
  if (!allSubmitted || room.players.length < 2) {
    return;
  }

  const firstId = room.players[0].id;
  const secondId = room.players[1].id;
  resolveRound(room, firstId, secondId);
}

