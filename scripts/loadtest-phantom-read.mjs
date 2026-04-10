const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const CONCURRENCY = Number(process.env.CONCURRENCY ?? "10");
const DURATION_SECONDS = Number(process.env.DURATION_SECONDS ?? "20");

function randomInput(seq) {
  const r = Math.random();
  return {
    seq,
    timestamp: Date.now(),
    up: Math.random() > 0.65,
    down: Math.random() > 0.65,
    left: Math.random() > 0.65,
    right: Math.random() > 0.65,
    attack: r > 0.8,
    dash: r > 0.92,
    parry: r > 0.9 && r <= 0.95,
    feint: r > 0.95,
  };
}

async function requestJson(path, init) {
  const res = await fetch(`${BASE_URL}${path}`, init);
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`${path} ${res.status} ${JSON.stringify(json)}`);
  }
  return json;
}

async function setupRoom(pairId) {
  const host = await requestJson("/api/room/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerName: `Host-${pairId}` }),
  });
  const guest = await requestJson("/api/room/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId: host.roomId, playerName: `Guest-${pairId}` }),
  });
  return {
    roomId: host.roomId,
    hostId: host.playerId,
    guestId: guest.playerId,
  };
}

async function runPair(pairId) {
  const room = await setupRoom(pairId);
  const endAt = Date.now() + DURATION_SECONDS * 1000;

  let hostSeq = 0;
  let guestSeq = 0;
  let requests = 0;

  while (Date.now() < endAt) {
    hostSeq += 1;
    guestSeq += 1;

    await Promise.all([
      requestJson("/api/game/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: room.roomId,
          playerId: room.hostId,
          inputs: [randomInput(hostSeq)],
          clientRttMs: 80,
        }),
      }),
      requestJson("/api/game/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: room.roomId,
          playerId: room.guestId,
          inputs: [randomInput(guestSeq)],
          clientRttMs: 80,
        }),
      }),
    ]);

    requests += 2;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return requests;
}

async function main() {
  const started = Date.now();
  const jobs = Array.from({ length: CONCURRENCY }, (_, i) => runPair(i + 1));
  const requestsPerPair = await Promise.all(jobs);
  const totalRequests = requestsPerPair.reduce((sum, n) => sum + n, 0);
  const elapsedSec = Math.max(1, (Date.now() - started) / 1000);

  console.log("Phantom Read load test complete");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Pairs: ${CONCURRENCY}`);
  console.log(`Duration: ${DURATION_SECONDS}s`);
  console.log(`Total sync requests: ${totalRequests}`);
  console.log(`Approx req/s: ${(totalRequests / elapsedSec).toFixed(1)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

