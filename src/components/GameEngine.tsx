"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { applyInput, getAttackHitbox } from "@/lib/phantom-read/sim";
import {
  CreateRoomResponse,
  GameState,
  InputCommand,
  JoinRoomResponse,
  PlayerState,
  Snapshot,
  SyncResponse,
} from "@/types/game";

const INPUT_TICK_MS = 50;
const FAST_SYNC_HZ = 20 as const;
const DEGRADED_SYNC_HZ = 10 as const;

function hzToPollMs(hz: number): number {
  return Math.max(40, Math.floor(1000 / hz));
}

type TrailFx = { x: number; y: number; ttl: number; color: string };
type GhostFx = { x: number; y: number; ttl: number; color: string };
type ApiError = { error: string };

function deepCloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function hasActiveInput(input: InputCommand): boolean {
  return Boolean(
    input.up ||
      input.down ||
      input.left ||
      input.right ||
      input.attack ||
      input.dash ||
      input.parry ||
      input.feint,
  );
}

function toUiError(errorCode: string, fallback: string): string {
  if (errorCode === "ROOM_NOT_FOUND") {
    return "Room not found or expired. Please create a new room.";
  }

  if (errorCode === "STORAGE_NOT_CONFIGURED") {
    return "Server storage is not configured. Contact admin to set Redis env vars.";
  }

  return fallback;
}

export default function GameEngine() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncHz, setSyncHz] = useState<10 | 20>(FAST_SYNC_HZ);
  const [rttMs, setRttMs] = useState<number>(0);
  const [serverMs, setServerMs] = useState<number>(0);

  const stateRef = useRef<GameState | null>(null);
  const inputSeqRef = useRef(0);
  const unackedInputsRef = useRef<InputCommand[]>([]);
  const isSyncingRef = useRef(false);

  const movementRef = useRef({ up: false, down: false, left: false, right: false });
  const actionRef = useRef({ attack: false, dash: false, parry: false, feint: false });
  const drawPositionsRef = useRef(new Map<string, { x: number; y: number }>());
  const previousPlayersRef = useRef(
    new Map<string, { dash: number; feint: number; stun: number; x: number; y: number }>(),
  );
  const dashTrailRef = useRef<TrailFx[]>([]);
  const feintGhostRef = useRef<GhostFx[]>([]);
  const parryFlashRef = useRef(0);
  const syncHzRef = useRef<10 | 20>(FAST_SYNC_HZ);
  const rttRef = useRef(0);

  const me = useMemo(() => {
    if (!state || !playerId) return null;
    return state.players[playerId] ?? null;
  }, [state, playerId]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    syncHzRef.current = syncHz;
  }, [syncHz]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "w") movementRef.current.up = true;
      if (key === "a") movementRef.current.left = true;
      if (key === "s") movementRef.current.down = true;
      if (key === "d") movementRef.current.right = true;
      if (key === "j") actionRef.current.attack = true;
      if (key === "k") actionRef.current.dash = true;
      if (key === "l") actionRef.current.parry = true;
      if (key === "i") actionRef.current.feint = true;
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "w") movementRef.current.up = false;
      if (key === "a") movementRef.current.left = false;
      if (key === "s") movementRef.current.down = false;
      if (key === "d") movementRef.current.right = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    if (!roomId || !playerId) return;

    const timer = window.setInterval(() => {
      const current = stateRef.current;
      if (!current || current.status === "finished") return;

      const cmd: InputCommand = {
        seq: inputSeqRef.current + 1,
        timestamp: Date.now(),
        ...movementRef.current,
        ...actionRef.current,
      };

      actionRef.current.attack = false;
      actionRef.current.dash = false;
      actionRef.current.parry = false;
      actionRef.current.feint = false;

      if (!hasActiveInput(cmd)) return;

      inputSeqRef.current = cmd.seq;
      unackedInputsRef.current.push(cmd);

      const next = deepCloneState(current);
      applyInput(next, playerId, cmd);
      stateRef.current = next;
      setState(next);
    }, INPUT_TICK_MS);

    return () => window.clearInterval(timer);
  }, [roomId, playerId]);

  useEffect(() => {
    if (!roomId || !playerId) return;

    let timer: number | null = null;
    let cancelled = false;

    const sync = async () => {
      if (cancelled) return;
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      const syncStartedAt = performance.now();

      try {
        const res = await fetch("/api/game/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId,
            playerId,
            inputs: unackedInputsRef.current,
            clientRttMs: Math.round(rttRef.current),
          }),
          cache: "no-store",
        });

        const data = (await res.json()) as SyncResponse | ApiError;
        const measuredRtt = performance.now() - syncStartedAt;
        rttRef.current = measuredRtt;
        setRttMs(Math.round(measuredRtt));
        if (!res.ok || "error" in data) {
          setError("error" in data ? toUiError(data.error, "Sync failed") : "Sync failed");
          return;
        }

        unackedInputsRef.current = unackedInputsRef.current.filter(
          (input) => input.seq > data.acceptedInputSeq,
        );

        const reconciled = deepCloneState(data.snapshot.state);
        for (const pending of unackedInputsRef.current) {
          applyInput(reconciled, playerId, pending);
        }

        stateRef.current = reconciled;
        setState(reconciled);
        setServerMs(data.serverProcessingMs);
        if (data.suggestedSyncHz !== syncHzRef.current) {
          setSyncHz(data.suggestedSyncHz);
        }
        setError(null);
      } catch {
        setError("Network error while syncing");
      } finally {
        isSyncingRef.current = false;
        if (!cancelled) {
          timer = window.setTimeout(() => void sync(), hzToPollMs(syncHzRef.current));
        }
      }
    };

    void sync();
    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [roomId, playerId]);

  useEffect(() => {
    let raf = 0;

    const drawPlayer = (
      ctx: CanvasRenderingContext2D,
      player: PlayerState,
      color: string,
      isLocalPlayer: boolean,
    ) => {
      const map = drawPositionsRef.current;
      const prev = map.get(player.id) ?? { x: player.x, y: player.y };
      const degraded = syncHzRef.current === DEGRADED_SYNC_HZ;
      const smoothing = isLocalPlayer ? (degraded ? 0.14 : 0.22) : degraded ? 0.1 : 0.18;
      const next = {
        x: prev.x + (player.x - prev.x) * smoothing,
        y: prev.y + (player.y - prev.y) * smoothing,
      };
      map.set(player.id, next);

      const fxColor = player.slot === "player1" ? "#31c7ff" : "#ff8f2d";
      if (player.dashTimerTicks > 0) {
        dashTrailRef.current.push({ x: next.x, y: next.y, ttl: 10, color: fxColor });
      }

      const prevState = previousPlayersRef.current.get(player.id);
      if (prevState) {
        if (prevState.feint === 0 && player.feintTimerTicks > 0) {
          feintGhostRef.current.push({ x: next.x, y: next.y, ttl: 14, color: fxColor });
        }
        if (prevState.stun === 0 && player.stunTimerTicks > 0) {
          parryFlashRef.current = 0.65;
        }
      }
      previousPlayersRef.current.set(player.id, {
        dash: player.dashTimerTicks,
        feint: player.feintTimerTicks,
        stun: player.stunTimerTicks,
        x: next.x,
        y: next.y,
      });

      const size = 34;
      ctx.fillStyle = color;
      ctx.fillRect(next.x - size / 2, next.y - size / 2, size, size);

      if (player.parryTimerTicks > 0) {
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(next.x, next.y, size * 0.7, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = "#ffffff";
      ctx.font = "12px monospace";
      ctx.fillText(`${player.name} HP:${player.hp} ST:${player.stamina} M:${player.momentum}`, next.x - 66, next.y - 24);

      const hitbox = getAttackHitbox(player);
      if (hitbox) {
        ctx.fillStyle = "rgba(255, 80, 80, 0.45)";
        ctx.fillRect(hitbox.x, hitbox.y, hitbox.w, hitbox.h);
      }
    };

    const render = () => {
      const canvas = canvasRef.current;
      const game = stateRef.current;
      if (!canvas || !game) {
        raf = window.requestAnimationFrame(render);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        raf = window.requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, "#06112f");
      gradient.addColorStop(1, "#10203e");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = "rgba(112, 213, 255, 0.1)";
      for (let x = 0; x <= canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y <= canvas.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      feintGhostRef.current = feintGhostRef.current.filter((fx) => fx.ttl > 0);
      for (const ghost of feintGhostRef.current) {
        ctx.fillStyle = `${ghost.color}33`;
        ctx.fillRect(ghost.x - 18, ghost.y - 18, 36, 36);
        ghost.ttl -= 1;
      }

      dashTrailRef.current = dashTrailRef.current.filter((fx) => fx.ttl > 0);
      for (const trail of dashTrailRef.current) {
        ctx.fillStyle = `${trail.color}22`;
        const s = 20 - trail.ttl;
        ctx.fillRect(trail.x - s / 2, trail.y - s / 2, s, s);
        trail.ttl -= 1;
      }

      game.playerIds.forEach((id, index) => {
        const player = game.players[id];
        if (!player) return;
        drawPlayer(ctx, player, index === 0 ? "#31c7ff" : "#ff8f2d", id === playerId);
      });

      ctx.fillStyle = "#d7efff";
      ctx.font = "13px monospace";
      const seconds = Math.ceil(game.remainingTicks / 20);
      ctx.fillText(`Room:${game.roomId} Tick:${game.tick} Time:${seconds}s`, 12, 20);

      if (game.status === "countdown") {
        const countdown = Math.ceil(game.countdownTicks / 20);
        ctx.fillText(`Match starts in ${countdown}`, 12, 40);
      } else if (game.status === "finished") {
        const winnerName = game.winnerPlayerId ? game.players[game.winnerPlayerId]?.name : "Draw";
        ctx.fillText(`Finished (${game.endReason}) Winner: ${winnerName}`, 12, 40);
      } else if (game.playerIds.length < 2) {
        ctx.fillText("Waiting for Player 2...", 12, 40);
      }

      if (parryFlashRef.current > 0) {
        ctx.fillStyle = `rgba(255,255,255,${parryFlashRef.current})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        parryFlashRef.current = Math.max(0, parryFlashRef.current - 0.08);
      }

      raf = window.requestAnimationFrame(render);
    };

    raf = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(raf);
  }, [playerId]);

  const applyFreshSnapshot = (snapshot: Snapshot) => {
    inputSeqRef.current = 0;
    unackedInputsRef.current = [];
    drawPositionsRef.current.clear();
    previousPlayersRef.current.clear();
    dashTrailRef.current = [];
    feintGhostRef.current = [];
    parryFlashRef.current = 0;
    setSyncHz(FAST_SYNC_HZ);
    setRttMs(0);
    setServerMs(0);
    rttRef.current = 0;
    syncHzRef.current = FAST_SYNC_HZ;
    stateRef.current = snapshot.state;
    setState(snapshot.state);
  };

  async function onCreateRoom() {
    setError(null);
    try {
      const res = await fetch("/api/room/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName }),
      });
      const data = (await res.json()) as CreateRoomResponse | ApiError;
      if (!res.ok || "error" in data) {
        setError("error" in data ? toUiError(data.error, "Failed to create room") : "Failed to create room");
        return;
      }
      setRoomId(data.roomId);
      setPlayerId(data.playerId);
      applyFreshSnapshot(data.snapshot);
    } catch {
      setError("Failed to create room");
    }
  }

  async function onJoinRoom(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const res = await fetch("/api/room/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: joinCode, playerName }),
      });
      const data = (await res.json()) as JoinRoomResponse | ApiError;
      if (!res.ok || "error" in data) {
        setError("error" in data ? toUiError(data.error, "Failed to join room") : "Failed to join room");
        return;
      }
      setRoomId(data.roomId);
      setPlayerId(data.playerId);
      applyFreshSnapshot(data.snapshot);
    } catch {
      setError("Failed to join room");
    }
  }

  async function onPlayAgain() {
    if (!roomId || !playerId) return;
    setError(null);
    try {
      const res = await fetch("/api/game/restart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, playerId }),
      });
      const data = (await res.json()) as { snapshot: Snapshot } | ApiError;
      if (!res.ok || "error" in data) {
        setError("error" in data ? toUiError(data.error, "Failed to restart match") : "Failed to restart match");
        return;
      }
      applyFreshSnapshot(data.snapshot);
    } catch {
      setError("Failed to restart match");
    }
  }

  function onViewReport() {
    if (!roomId || !playerId) return;
    router.push(`/phantom-read/report?roomId=${roomId}&playerId=${playerId}`);
  }

  return (
    <section className="space-y-4 rounded-2xl border border-cyan-300/30 bg-slate-950/70 p-5 text-cyan-50 shadow-xl">
      <div className="space-y-3">
        <p className="text-sm text-cyan-100/90">
          Controls: <span className="font-semibold">WASD</span> move, <span className="font-semibold">J</span>{" "}
          attack, <span className="font-semibold">K</span> dash, <span className="font-semibold">L</span> parry,{" "}
          <span className="font-semibold">I</span> feint
        </p>
        <input
          value={playerName}
          onChange={(event) => setPlayerName(event.target.value)}
          placeholder="Your nickname"
          className="w-full rounded-md border border-cyan-300/30 bg-slate-900 px-3 py-2 text-cyan-50"
        />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onCreateRoom}
            className="rounded-md bg-cyan-500 px-4 py-2 font-semibold text-slate-950 hover:bg-cyan-400"
          >
            Create Room
          </button>
          <form onSubmit={onJoinRoom} className="flex flex-wrap gap-2">
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="Room code"
              className="rounded-md border border-cyan-300/30 bg-slate-900 px-3 py-2 uppercase text-cyan-50"
            />
            <button className="rounded-md border border-cyan-200/40 px-4 py-2 text-cyan-100 hover:bg-cyan-900/30">
              Join
            </button>
          </form>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-cyan-300/20">
        <canvas ref={canvasRef} width={960} height={540} className="h-auto w-full bg-slate-900" />
      </div>

      <div className="text-sm text-cyan-100/90">
        <p>
          Room: <span className="font-semibold">{roomId ?? "-"}</span>
        </p>
        <p>
          Player: <span className="font-semibold">{me?.name ?? "-"}</span>
        </p>
        <p>
          State: <span className="font-semibold">{state?.status ?? "-"}</span>
        </p>
        <p>
          HP / ST / Momentum:{" "}
          <span className="font-semibold">{me ? `${me.hp} / ${me.stamina} / ${me.momentum}` : "-"}</span>
        </p>
        <p>
          Net:{" "}
          <span className="font-semibold">
            {syncHz}Hz sync | RTT {rttMs}ms | Server {serverMs}ms
          </span>
        </p>
      </div>

      {state?.status === "finished" && roomId && playerId ? (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onViewReport}
            className="rounded-md bg-amber-400 px-4 py-2 font-semibold text-slate-950 hover:bg-amber-300"
          >
            View Battle Report
          </button>
          <button
            onClick={onPlayAgain}
            className="rounded-md border border-cyan-200/40 px-4 py-2 text-cyan-100 hover:bg-cyan-900/30"
          >
            Play Again (Same Room)
          </button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
    </section>
  );
}
