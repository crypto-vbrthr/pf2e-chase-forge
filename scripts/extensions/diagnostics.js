import { cloneData } from "../data/utils.js";

export const EXTENSION_DIAGNOSTIC_LIMIT = 200;

export class ExtensionDiagnosticJournal {
  #entries = [];
  #limit;
  #sequence = 0;

  constructor({ limit = EXTENSION_DIAGNOSTIC_LIMIT } = {}) {
    this.#limit = Math.max(1, Number(limit) || EXTENSION_DIAGNOSTIC_LIMIT);
  }

  record(entry = {}) {
    this.#sequence += 1;
    const diagnostic = Object.freeze({
      id: entry.id ?? `chase-extension-diagnostic-${Date.now()}-${this.#sequence}`,
      timestamp: entry.timestamp ?? new Date().toISOString(),
      sourceModule: entry.sourceModule ?? null,
      resourceType: entry.resourceType ?? "extension",
      action: entry.action ?? "operation",
      status: entry.status ?? "info",
      code: entry.code ?? "CHASE_EXTENSION_OPERATION",
      message: entry.message ?? "",
      resourceIds: Object.freeze([...(entry.resourceIds ?? [])].map(String)),
      data: Object.freeze(cloneData(entry.data ?? {}))
    });
    this.#entries.push(diagnostic);
    if (this.#entries.length > this.#limit) this.#entries.splice(0, this.#entries.length - this.#limit);
    return diagnostic;
  }

  list({ sourceModule = null, status = null, resourceType = null } = {}) {
    return this.#entries
      .filter(entry => !sourceModule || entry.sourceModule === sourceModule)
      .filter(entry => !status || entry.status === status)
      .filter(entry => !resourceType || entry.resourceType === resourceType)
      .map(entry => cloneData(entry));
  }

  clear({ sourceModule = null } = {}) {
    if (!sourceModule) {
      const count = this.#entries.length;
      this.#entries = [];
      return count;
    }
    const before = this.#entries.length;
    this.#entries = this.#entries.filter(entry => entry.sourceModule !== sourceModule);
    return before - this.#entries.length;
  }
}

export const chaseExtensionDiagnostics = new ExtensionDiagnosticJournal();

export function recordExtensionSuccess({ sourceModule, resourceType, action, code, message, resourceIds = [], data = {} }) {
  return chaseExtensionDiagnostics.record({
    sourceModule,
    resourceType,
    action,
    status: "success",
    code,
    message,
    resourceIds,
    data
  });
}

export function recordExtensionFailure(error, { sourceModule, resourceType, action, code = "CHASE_EXTENSION_OPERATION_FAILED", resourceIds = [], data = {} }) {
  const diagnostic = chaseExtensionDiagnostics.record({
    sourceModule,
    resourceType,
    action,
    status: "error",
    code: error?.code ?? code,
    message: error?.message ?? String(error),
    resourceIds,
    data: {
      ...data,
      details: cloneData(error?.details ?? null)
    }
  });
  if (error && typeof error === "object") error.extensionDiagnostic = diagnostic;
  return diagnostic;
}
