import {
  PhantomReadAction,
  PhantomReadDashDirection,
  PhantomReadFighter,
  PhantomReadMove,
  Room,
} from "@/lib/multiplayer/types";

const MAX_HP = 100;
const MAX_STAMINA = 5;
const MAX_MOMENTUM = 6;
const ARENA_MIN = 0;
const ARENA_MAX = 4;
const MAX_ROUNDS = 20;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function baseFighter(position: number): PhantomReadFighter {
  return {
    hp: MAX_HP,
    stamina: 3,
    momentum: 0,
    position,
    readStreak: 0,
    pendingBonusDamage: 0,
    lastAction: null,
  };
}

function ensurePhantomRead(room: Room) {
  if (!room.phantomRead) {
    throw new Error("INVALID_ROOM_STATE");
  }
  return room.phantomRead;
}

function defaultActionForLowStamina(): PhantomReadAction {
  return "focus";
}

function actionCost(action: PhantomReadAction): number {
  if (action === "focus") return 0;
  return 1;
}

function validateMove(action: Record<string, unknown>): PhantomReadMove {
  if (action.type !== "submit-move") {
    throw new Error("UNKNOWN_ACTION");
  }

  const move = action.move;
  if (!move || typeof move !== "object") {
    throw new Error("INVALID_MOVE");
  }

  const candidate = move as Record<string, unknown>;
  const validActions: PhantomReadAction[] = ["strike", "parry", "dash", "feint", "focus"];
  const chosenAction = String(candidate.action ?? "") as PhantomReadAction;
  const read = String(candidate.read ?? "") as PhantomReadAction;

  if (!validActions.includes(chosenAction)) {
    throw new Error("INVALID_ACTION");
  }

  if (!validActions.includes(read)) {
    throw new Error("INVALID_READ");
  }

  const parsed: PhantomReadMove = {
    action: chosenAction,
    read,
  };

  if (chosenAction === "dash") {
    const dir = String(candidate.dashDirection ?? "") as PhantomReadDashDirection;
    if (dir !== "left" && dir !== "right") {
      throw new Error("INVALID_DASH_DIRECTION");
    }
    parsed.dashDirection = dir;
  }

  return parsed;
}

function fighterName(room: Room, playerId: string): string {
  return room.players.find((p) => p.id === playerId)?.name ?? "Player";
}

function spendStamina(fighter: PhantomReadFighter, action: PhantomReadAction): PhantomReadAction {
  const cost = actionCost(action);
  if (fighter.stamina < cost) {
    return defaultActionForLowStamina();
  }

  fighter.stamina -= cost;
  return action;
}

function gainMomentum(fighter: PhantomReadFighter, amount: number) {
  fighter.momentum = clamp(fighter.momentum + amount, 0, MAX_MOMENTUM);
}

function applyDamage(target: PhantomReadFighter, amount: number) {
  target.hp = clamp(target.hp - amount, 0, MAX_HP);
}

function addLog(lines: string[], line: string) {
  lines.push(line);
}

function resolveRound(room: Room) {
  const state = ensurePhantomRead(room);
  if (room.players.length < 2) {
    return;
  }

  const [p1, p2] = room.players;
  const move1 = state.submissions[p1.id];
  const move2 = state.submissions[p2.id];

  if (!move1 || !move2) {
    return;
  }

  const f1 = state.fighters[p1.id];
  const f2 = state.fighters[p2.id];
  const lines: string[] = [];

  if (!f1 || !f2) {
    throw new Error("INVALID_ROOM_STATE");
  }

  const action1 = spendStamina(f1, move1.action);
  const action2 = spendStamina(f2, move2.action);

  if (action1 !== move1.action) {
    addLog(lines, `${fighterName(room, p1.id)} lacked stamina and switched to Focus.`);
  }
  if (action2 !== move2.action) {
    addLog(lines, `${fighterName(room, p2.id)} lacked stamina and switched to Focus.`);
  }

  f1.lastAction = action1;
  f2.lastAction = action2;

  if (move1.read === action2) {
    f1.readStreak += 1;
    gainMomentum(f1, 1);
    if (f1.readStreak >= 2) {
      f1.pendingBonusDamage += 6;
      addLog(lines, `${fighterName(room, p1.id)} read correctly and charged +6 bonus damage.`);
    }
  } else {
    f1.readStreak = 0;
  }

  if (move2.read === action1) {
    f2.readStreak += 1;
    gainMomentum(f2, 1);
    if (f2.readStreak >= 2) {
      f2.pendingBonusDamage += 6;
      addLog(lines, `${fighterName(room, p2.id)} read correctly and charged +6 bonus damage.`);
    }
  } else {
    f2.readStreak = 0;
  }

  if (action1 === "dash") {
    const delta = move1.dashDirection === "left" ? -1 : 1;
    f1.position = clamp(f1.position + delta, ARENA_MIN, ARENA_MAX);
  }
  if (action2 === "dash") {
    const delta = move2.dashDirection === "left" ? -1 : 1;
    f2.position = clamp(f2.position + delta, ARENA_MIN, ARENA_MAX);
  }

  const distance = Math.abs(f1.position - f2.position);

  if (action1 === "focus") {
    f1.stamina = clamp(f1.stamina + 1, 0, MAX_STAMINA);
    gainMomentum(f1, 1);
  }
  if (action2 === "focus") {
    f2.stamina = clamp(f2.stamina + 1, 0, MAX_STAMINA);
    gainMomentum(f2, 1);
  }

  if (distance <= 1) {
    if (action1 === "strike" && action2 === "parry") {
      const counter = 18 + f2.pendingBonusDamage;
      applyDamage(f1, counter);
      f2.pendingBonusDamage = 0;
      gainMomentum(f2, 1);
      addLog(lines, `${fighterName(room, p2.id)} parried and countered for ${counter}.`);
    } else if (action2 === "strike" && action1 === "parry") {
      const counter = 18 + f1.pendingBonusDamage;
      applyDamage(f2, counter);
      f1.pendingBonusDamage = 0;
      gainMomentum(f1, 1);
      addLog(lines, `${fighterName(room, p1.id)} parried and countered for ${counter}.`);
    } else {
      if (action1 === "strike") {
        const damage = 16 + f1.pendingBonusDamage;
        applyDamage(f2, damage);
        f1.pendingBonusDamage = 0;
        gainMomentum(f1, 1);
        addLog(lines, `${fighterName(room, p1.id)} landed Strike for ${damage}.`);
      }
      if (action2 === "strike") {
        const damage = 16 + f2.pendingBonusDamage;
        applyDamage(f1, damage);
        f2.pendingBonusDamage = 0;
        gainMomentum(f2, 1);
        addLog(lines, `${fighterName(room, p2.id)} landed Strike for ${damage}.`);
      }
      if (action1 === "feint" && action2 === "parry") {
        applyDamage(f2, 10);
        addLog(lines, `${fighterName(room, p1.id)} baited Parry with Feint for 10.`);
      }
      if (action2 === "feint" && action1 === "parry") {
        applyDamage(f1, 10);
        addLog(lines, `${fighterName(room, p2.id)} baited Parry with Feint for 10.`);
      }
    }
  } else {
    addLog(lines, "Both fighters are out of range after movement.");
  }

  state.submissions[p1.id] = null;
  state.submissions[p2.id] = null;

  state.logs.unshift({ round: state.round, lines: lines.length ? lines : ["No clean hit this round."], at: Date.now() });
  state.logs = state.logs.slice(0, 8);
  state.round += 1;

  if (f1.hp <= 0 || f2.hp <= 0) {
    room.status = "finished";
    room.currentTurnPlayerId = null;
    if (f1.hp === f2.hp) {
      room.winnerPlayerId = null;
    } else {
      room.winnerPlayerId = f1.hp > f2.hp ? p1.id : p2.id;
    }
    return;
  }

  if (state.round > MAX_ROUNDS) {
    room.status = "finished";
    room.currentTurnPlayerId = null;
    if (f1.hp === f2.hp) {
      room.winnerPlayerId = f1.momentum === f2.momentum ? null : f1.momentum > f2.momentum ? p1.id : p2.id;
    } else {
      room.winnerPlayerId = f1.hp > f2.hp ? p1.id : p2.id;
    }
  }
}

export function initializePhantomReadRoom(room: Room) {
  room.phantomRead = {
    fighters: { [room.hostId]: baseFighter(1) },
    round: 1,
    submissions: { [room.hostId]: null },
    logs: [],
  };
}

export function onJoinPhantomRead(room: Room, playerId: string) {
  const state = ensurePhantomRead(room);
  const playerIndex = room.players.findIndex((p) => p.id === playerId);
  const position = playerIndex === 0 ? 1 : 3;

  state.fighters[playerId] = baseFighter(position);
  state.submissions[playerId] = null;

  room.status = room.players.length === 2 ? "playing" : "waiting";
  room.currentTurnPlayerId = null;
}

export function applyPhantomReadAction(room: Room, playerId: string, action: Record<string, unknown>) {
  const state = ensurePhantomRead(room);

  if (action.type === "restart-game") {
    state.round = 1;
    state.logs = [];
    state.fighters = Object.fromEntries(
      room.players.map((p, index) => [p.id, baseFighter(index === 0 ? 1 : 3)]),
    );
    state.submissions = Object.fromEntries(room.players.map((p) => [p.id, null]));

    room.winnerPlayerId = null;
    room.status = room.players.length === 2 ? "playing" : "waiting";
    room.currentTurnPlayerId = null;
    return;
  }

  if (room.status !== "playing") {
    throw new Error("GAME_NOT_PLAYING");
  }

  if (room.players.length < 2) {
    throw new Error("WAITING_FOR_OPPONENT");
  }

  const move = validateMove(action);
  state.submissions[playerId] = move;

  const allSubmitted = room.players.every((p) => Boolean(state.submissions[p.id]));
  if (allSubmitted) {
    resolveRound(room);
  }
}
