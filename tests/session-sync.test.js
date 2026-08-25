import test from "node:test";
import assert from "node:assert/strict";
import { createChaseSessionSyncService, CHASE_SOCKET_CHANNEL } from "../scripts/sync/chase-session-sync.js";

function fakeSocket() {
  const handlers = new Map();
  const emitted = [];
  return {
    emitted,
    on(channel, handler) { handlers.set(channel, handler); },
    off(channel) { handlers.delete(channel); },
    async emit(channel, payload) { emitted.push({ channel, payload }); },
    async receive(payload) { return handlers.get(CHASE_SOCKET_CHANNEL)?.(payload); }
  };
}

test("GM session synchronization sends only projected player state to active players", async () => {
  const previousGame = globalThis.game;
  const socket = fakeSocket();
  globalThis.game = {
    user: { id: "gm", isGM: true, active: true },
    users: [{ id: "gm", isGM: true, active: true }, { id: "player", isGM: false, active: true }],
    socket
  };
  const projector = { async project(session, { user }) { return { schemaVersion: 1, sessionId: session.id, title: "Safe", status: "active", round: 1, current: null, groups: [], visibleRoutes: [], availableActions: [], personalEffects: [], log: [], metadata: { projectedForUserId: user.id } }; } };
  try {
    const sync = createChaseSessionSyncService({ socket, projector, getApi: () => ({}) });
    const result = await sync.publishSession({ id: "s1" });
    assert.equal(result.sent, 1);
    assert.equal(socket.emitted.length, 1);
    assert.equal(socket.emitted[0].channel, CHASE_SOCKET_CHANNEL);
    assert.equal(socket.emitted[0].payload.type, "state");
    assert.equal(socket.emitted[0].payload.toUserId, "player");
    assert.equal(socket.emitted[0].payload.state.metadata.projectedForUserId, "player");
  } finally {
    if (previousGame === undefined) delete globalThis.game; else globalThis.game = previousGame;
  }
});

test("player intents are addressed to one deterministic active GM", async () => {
  const previousGame = globalThis.game;
  const socket = fakeSocket();
  globalThis.game = {
    user: { id: "player", isGM: false, active: true },
    users: [{ id: "gm-b", isGM: true, active: true }, { id: "gm-a", isGM: true, active: true }, { id: "player", isGM: false, active: true }],
    socket
  };
  try {
    const sync = createChaseSessionSyncService({ socket, getApi: () => ({}) });
    await sync.sendIntent("route", { sessionId: "s1", payload: { edgeId: "e1" } });
    assert.equal(socket.emitted[0].payload.toUserId, "gm-a");
    assert.equal(socket.emitted[0].payload.fromUserId, "player");
    assert.equal(socket.emitted[0].payload.intent, "route");
  } finally {
    if (previousGame === undefined) delete globalThis.game; else globalThis.game = previousGame;
  }
});

test("socket state messages are accepted only by their addressed player client", async () => {
  const previousGame = globalThis.game;
  const socket = fakeSocket();
  const states = [];
  globalThis.game = {
    user: { id: "player", isGM: false, active: true },
    users: [{ id: "gm", isGM: true, active: true }, { id: "player", isGM: false, active: true }],
    socket
  };
  const playerUi = { async receiveState(state) { states.push(state); } };
  try {
    const sync = createChaseSessionSyncService({ socket, playerUi, getApi: () => ({}) });
    assert.equal(sync.start(), true);
    await socket.receive({ type: "state", toUserId: "someone-else", state: { sessionId: "no" } });
    await socket.receive({ type: "state", toUserId: "player", state: { sessionId: "yes" } });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(states.map(state => state.sessionId), ["yes"]);
    assert.equal(sync.stop(), true);
  } finally {
    if (previousGame === undefined) delete globalThis.game; else globalThis.game = previousGame;
  }
});


test("player client acknowledges state delivery after opening the Player View", async () => {
  const previousGame = globalThis.game;
  const socket = fakeSocket();
  const states = [];
  globalThis.game = {
    user: { id: "player", isGM: false, active: true },
    users: { contents: [{ id: "gm", isGM: true, active: true }, { id: "player", isGM: false, active: true }] },
    socket
  };
  const playerUi = { async receiveState(state) { states.push(state); } };
  try {
    const sync = createChaseSessionSyncService({ socket, playerUi, getApi: () => ({}) });
    assert.equal(sync.start(), true);
    await socket.receive({ type: "state", deliveryId: "delivery-1", fromUserId: "gm", toUserId: "player", open: true, state: { sessionId: "s1", status: "active" } });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(states.length, 1);
    const ack = socket.emitted.find(entry => entry.payload.type === "stateAck");
    assert.ok(ack);
    assert.equal(ack.payload.deliveryId, "delivery-1");
    assert.equal(ack.payload.toUserId, "gm");
    assert.equal(ack.payload.ok, true);
    assert.equal(sync.status().receivedStates, 1);
  } finally {
    if (previousGame === undefined) delete globalThis.game; else globalThis.game = previousGame;
  }
});

test("player readiness handshake is addressed to the deterministic GM", async () => {
  const previousGame = globalThis.game;
  const socket = fakeSocket();
  globalThis.game = {
    user: { id: "player", isGM: false, active: true },
    users: { contents: [{ id: "gm", isGM: true, active: true }, { id: "player", isGM: false, active: true }] },
    socket
  };
  try {
    const sync = createChaseSessionSyncService({ socket, getApi: () => ({}) });
    assert.equal(sync.start(), true);
    assert.equal(await sync.announcePlayerReady(), true);
    const ready = socket.emitted.find(entry => entry.payload.type === "playerReady");
    assert.ok(ready);
    assert.equal(ready.payload.toUserId, "gm");
    assert.equal(ready.payload.fromUserId, "player");
  } finally {
    if (previousGame === undefined) delete globalThis.game; else globalThis.game = previousGame;
  }
});
