export class ChaseDataError extends Error {
  constructor(message, { code = "CHASE_DATA_ERROR", path = "", details = null } = {}) {
    super(message);
    this.name = "ChaseDataError";
    this.code = code;
    this.path = path;
    this.details = details;
  }
}

export class ChaseValidationError extends ChaseDataError {
  constructor(message, options = {}) {
    super(message, { code: "CHASE_VALIDATION_ERROR", ...options });
    this.name = "ChaseValidationError";
  }
}

export class ChaseRegistryError extends ChaseDataError {
  constructor(message, options = {}) {
    super(message, { code: "CHASE_REGISTRY_ERROR", ...options });
    this.name = "ChaseRegistryError";
  }
}

export class ChaseExtensionError extends ChaseDataError {
  constructor(message, options = {}) {
    super(message, { code: "CHASE_EXTENSION_ERROR", ...options });
    this.name = "ChaseExtensionError";
  }
}
