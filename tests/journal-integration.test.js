import test from "node:test";
import assert from "node:assert/strict";
import { createPublicApi } from "../scripts/api/public-api.js";
import {
  CHASE_JOURNAL_CONTRACT_VERSION,
  buildChaseJournalLinkHtml,
  createChaseJournalEnrichers,
  createChaseJournalReference,
  parseChaseJournalReference
} from "../scripts/integrations/journal-bridge.js";
import { sampleBlueprint } from "./helpers.js";

function installGame({ gm = true } = {}) {
  const previous = {
    game: globalThis.game,
    ui: globalThis.ui,
    CONST: globalThis.CONST,
    ChatMessage: globalThis.ChatMessage,
    JournalEntry: globalThis.JournalEntry,
    CONFIG: globalThis.CONFIG,
    document: globalThis.document
  };
  globalThis.game = {
    user: { id: gm ? "gm" : "player", isGM: gm },
    modules: new Map(),
    users: [{ id: "gm", isGM: true }, { id: "player", isGM: false }],
    i18n: { localize: key => key, format: key => key },
    clipboard: null
  };
  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0 }, JOURNAL_ENTRY_PAGE_FORMATS: { HTML: 1 } };
  globalThis.ChatMessage = { async create(data) { return data; }, getSpeaker() { return { alias: "Chase Forge" }; } };
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  };
}

test("Journal reference syntax round-trips world and library chases", () => {
  const world = createChaseJournalReference("blueprint", "blueprint-1", "Rooftop Run");
  const library = createChaseJournalReference("library", "urban:night-run", "Night Run");
  assert.equal(world, "@ChaseBlueprint[blueprint-1]{Rooftop Run}");
  assert.deepEqual(parseChaseJournalReference(world), {
    kind: "blueprint", id: "blueprint-1", label: "Rooftop Run", reference: world
  });
  assert.equal(parseChaseJournalReference(library).kind, "library");
  assert.equal(parseChaseJournalReference("@UUID[Actor.abc]"), null);
});

test("Journal link HTML exposes open/start controls only to the GM", () => {
  const gmHtml = buildChaseJournalLinkHtml({ kind: "blueprint", id: "blueprint-1", label: "Test Chase", gm: true });
  const playerHtml = buildChaseJournalLinkHtml({ kind: "blueprint", id: "blueprint-1", label: "Test Chase", gm: false });
  assert.match(gmHtml, /data-pf2e-chase-action="open"/);
  assert.match(gmHtml, /data-pf2e-chase-action="start"/);
  assert.doesNotMatch(playerHtml, /data-pf2e-chase-action=/);
  assert.match(playerHtml, /pf2e-chase-journal-readonly/);
});

test("Journal enrichers cover both world Blueprints and read-only Library chases", () => {
  const enrichers = createChaseJournalEnrichers();
  assert.equal(enrichers.length, 2);
  assert.equal(enrichers[0].pattern.test("@ChaseBlueprint[abc]{A Chase}"), true);
  enrichers[0].pattern.lastIndex = 0;
  assert.equal(enrichers[1].pattern.test("@ChaseLibrary[addon:abc]{A Library Chase}"), true);
});

test("Journal bridge creates a normal Foundry JournalEntry containing an executable Chase link", async () => {
  const cleanup = installGame();
  const created = [];
  globalThis.JournalEntry = class {
    static async create(data) {
      created.push(structuredClone(data));
      return { id: "journal-1", ...data, sheet: { render() {} } };
    }
  };
  try {
    const api = createPublicApi();
    await api.persistence.blueprints.create(sampleBlueprint());
    const entry = await api.journal.createEntry("blueprint", "blueprint-1");
    assert.equal(entry.id, "journal-1");
    assert.equal(created[0].flags["pf2e-chase-forge"].targetId, "blueprint-1");
    assert.equal(created[0].pages[0].flags["pf2e-chase-forge"].type, "chaseLinkPage");
    assert.match(created[0].pages[0].text.content, /@ChaseBlueprint\[blueprint-1\]\{Test Chase\}/);
    assert.equal(created[0].ownership.default, 0);
  } finally { cleanup(); }
});

test("Journal bridge opens world and Library chases in the correct Builder mode", async () => {
  const cleanup = installGame();
  const opened = [];
  try {
    const api = createPublicApi({ ui: { async openBuilder(options) { opened.push(options); return options; } } });
    await api.persistence.blueprints.create(sampleBlueprint());
    const extension = api.extensions.forModule("journal-addon");
    extension.registerPack({ id: "prepared", label: "Prepared", cards: [], templates: [], imageProviders: [], blueprints: [sampleBlueprint(undefined, { id: "library-one", name: "Library One" })] });
    await api.journal.open("blueprint", "blueprint-1");
    await api.journal.open("library", "journal-addon:library-one");
    assert.deepEqual(opened[0], { blueprintId: "blueprint-1" });
    assert.deepEqual(opened[1], { libraryBlueprintId: "journal-addon:library-one" });
  } finally { cleanup(); }
});

test("starting a world Chase from Journal creates an active independent Session and opens the Runner", async () => {
  const cleanup = installGame();
  const runners = [];
  const synced = [];
  try {
    const api = createPublicApi({
      ui: { async openRunner(options) { runners.push(options); return options; } },
      sync: { async publishSession(session) { synced.push(session.id); return { sent: 0 }; } }
    });
    await api.persistence.blueprints.create(sampleBlueprint());
    const session = await api.journal.start("blueprint", "blueprint-1");
    assert.equal(session.status, "active");
    assert.equal(session.blueprintId, "blueprint-1");
    assert.equal(session.metadata.startedFromJournal, true);
    assert.deepEqual(runners, [{ sessionId: session.id }]);
    assert.deepEqual(synced, [session.id]);
  } finally { cleanup(); }
});

test("starting a Library Chase from Journal snapshots the source and records Library provenance", async () => {
  const cleanup = installGame();
  try {
    const api = createPublicApi({ ui: { async openRunner() {} }, sync: { async publishSession() {} } });
    const extension = api.extensions.forModule("journal-addon");
    extension.registerPack({ id: "prepared", label: "Prepared", cards: [], templates: [], imageProviders: [], blueprints: [sampleBlueprint(undefined, { id: "library-two", name: "Library Two" })] });
    const session = await api.journal.start("library", "journal-addon:library-two");
    assert.equal(session.status, "active");
    assert.equal(session.blueprintSnapshot.name, "Library Two");
    assert.equal(session.metadata.libraryOrigin.blueprintId, "journal-addon:library-two");
    assert.equal(session.metadata.libraryOrigin.startedFromJournal, true);
  } finally { cleanup(); }
});

test("public API exposes Journal Integration Contract v1", () => {
  const api = createPublicApi();
  assert.equal(api.version, 14);
  assert.equal(api.contracts.journalIntegration, CHASE_JOURNAL_CONTRACT_VERSION);
  assert.equal(api.getCapabilities().journalIntegration, true);
  assert.equal(api.getCapabilities().journalLinks, true);
  assert.equal(api.getCapabilities().journalStartActions, true);
  assert.equal(api.integrations.journal, api.journal);
  assert.equal(Object.isFrozen(api.journal), true);
});
