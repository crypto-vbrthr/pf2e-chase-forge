import test from "node:test";
import assert from "node:assert/strict";
import { createPublicApi } from "../scripts/api/public-api.js";
import { sampleBlueprint, sampleCard } from "./helpers.js";

function pack(id = "street") {
  return {
    id,
    label: "Street Chases",
    version: "1.2.0",
    cards: [sampleCard({ id: "cart" })],
    templates: [],
    imageProviders: []
  };
}

test("extension compatibility reports supported API, contract, schemas, and capabilities", () => {
  const api = createPublicApi();
  const report = api.extensions.checkCompatibility({
    apiVersion: ">=2",
    extensionContractVersion: ">=1",
    schemas: { card: ">=1", pack: "1" },
    capabilities: ["registries.cards", "extensions.transactionalRegistration"]
  });
  assert.equal(report.compatible, true);
});

test("extension compatibility rejects unavailable requirements before registration", () => {
  const api = createPublicApi();
  const extension = api.extensions.forModule("future-addon", {
    requirements: { capabilities: ["rulesEngine.finished"] }
  });

  assert.throws(() => extension.registerPack(pack()), error => error?.code === "CHASE_EXTENSION_INCOMPATIBLE");
  assert.equal(api.packs.list().length, 0);
});

test("bound extension controller registers content without allowing ownership spoofing", () => {
  const api = createPublicApi();
  const extension = api.extensions.forModule("street-addon", {
    version: "1.2.0",
    requirements: { apiVersion: ">=2" }
  });

  const registered = extension.registerPack(pack());
  assert.equal(registered.id, "street-addon:street");
  assert.equal(extension.listCards()[0].id, "street-addon:cart");
  assert.equal(api.cards.list()[0].id, "street-addon:cart");

  assert.throws(
    () => extension.registerPack({ ...pack("bad"), cards: [sampleCard({ id: "other-addon:cart" })] }),
    error => error?.code === "CHASE_NAMESPACE_OWNERSHIP"
  );
});

test("unregisterAll removes only resources owned by the bound module", () => {
  const api = createPublicApi();
  const first = api.extensions.forModule("first-addon");
  const second = api.extensions.forModule("second-addon");
  first.registerPack(pack("one"));
  second.registerPack(pack("two"));

  first.unregisterAll();
  assert.equal(first.listPacks().length, 0);
  assert.equal(second.listPacks().length, 1);
  assert.equal(api.packs.list().length, 1);
});

test("extension diagnostics record successful and failed registrations", () => {
  const api = createPublicApi();
  api.extensions.diagnostics.clear();
  const extension = api.extensions.forModule("diag-addon");
  extension.registerPack(pack());
  assert.throws(() => extension.registerPack(pack()));

  const entries = extension.diagnostics.list();
  assert.ok(entries.some(entry => entry.status === "success" && entry.action === "register"));
  assert.ok(entries.some(entry => entry.status === "error" && entry.action === "register"));
  assert.ok(entries.every(entry => entry.sourceModule === "diag-addon"));
});

test("synthetic add-on can register after receiving the public API", () => {
  const api = createPublicApi();

  function initializeSyntheticAddOn(forge) {
    const extension = forge.extensions.forModule("synthetic-chase-addon", {
      version: "0.0.1",
      requirements: {
        extensionContractVersion: ">=1",
        capabilities: ["registries.packs", "registries.templates"]
      }
    });
    extension.assertCompatible();
    extension.registerPack({
      id: "demo",
      label: "Synthetic Demo",
      cards: [sampleCard({ id: "synthetic-obstacle" })],
      templates: [{
        id: "synthetic-template",
        name: "Synthetic Template",
        settings: {
          chaseType: "pursuit",
          length: "short",
          difficulty: "easy",
          routeComplexity: "linear",
          imageMode: "none"
        }
      }],
      imageProviders: []
    });
  }

  initializeSyntheticAddOn(api);
  assert.equal(api.cards.has("synthetic-chase-addon:synthetic-obstacle"), true);
  assert.equal(api.templates.has("synthetic-chase-addon:synthetic-template"), true);
});


test("add-ons can publish prepared read-only Chases through the public library API", () => {
  const api = createPublicApi();
  const extension = api.extensions.forModule("scenario-addon", {
    version: "1.4.0",
    requirements: { capabilities: ["registries.libraryBlueprints"] }
  });

  extension.registerPack({
    id: "prepared",
    label: "Prepared Pursuits",
    cards: [],
    templates: [],
    blueprints: [sampleBlueprint(undefined, { id: "clocktower-run", name: "Clocktower Run" })],
    imageProviders: []
  });

  assert.equal(extension.listLibraryBlueprints().length, 1);
  assert.equal(api.library.has("scenario-addon:clocktower-run"), true);
  const libraryChase = api.library.get("scenario-addon:clocktower-run");
  assert.equal(libraryChase.name, "Clocktower Run");
  assert.equal(libraryChase.metadata.library.readOnly, true);
  assert.equal(libraryChase.source.moduleId, "scenario-addon");
});


test("extension version is inherited by packs that omit their own version", () => {
  const api = createPublicApi();
  const extension = api.extensions.forModule("versioned-addon", { version: "2.3.4" });
  extension.registerPack({ id: "pack", label: "Pack", cards: [sampleCard({ id: "card" })], templates: [], imageProviders: [] });
  assert.equal(api.packs.get("versioned-addon:pack").version, "2.3.4");
  assert.equal(api.cards.get("versioned-addon:card").source.version, "2.3.4");
});

test("dev.5 exposes route, rules, and consequence capabilities to compatibility checks", () => {
  const api = createPublicApi();
  const report = api.extensions.checkCompatibility({
    apiVersion: ">=3",
    schemas: { session: ">=2" },
    capabilities: ["routing.traversal", "routing.conditions", "routing.multiGroup"]
  });
  assert.equal(report.compatible, true, JSON.stringify(report.issues));
});

test("starting from a Library Blueprint creates an independent Session snapshot", async () => {
  const api = createPublicApi();
  const extension = api.extensions.forModule("library-session-addon");
  extension.registerPack({
    id: "scenarios",
    label: "Scenario Library",
    cards: [],
    templates: [],
    blueprints: [sampleBlueprint(undefined, { id: "roof-run", name: "Roof Run" })],
    imageProviders: []
  });

  const library = api.library.get("library-session-addon:roof-run");
  const session = await api.sessionManager.createSession(library, { sessionId: "library-session" });
  session.blueprintSnapshot.name = "Changed Runtime Copy";
  await api.sessionManager.saveSession(session);

  assert.equal(api.library.get("library-session-addon:roof-run").name, "Roof Run");
  assert.equal((await api.sessionManager.getSession("library-session")).blueprintSnapshot.name, "Changed Runtime Copy");
});
