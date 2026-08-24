import {
  PF2E_DIFFICULTY_ADJUSTMENTS,
  PF2E_LEVEL_DCS,
  PF2E_PROFICIENCY_RANKS,
  PF2E_SIMPLE_DCS
} from "../core/constants.js";
import { ChaseRulesError } from "../core/errors.js";

function dcError(code, message, details = null) {
  return new ChaseRulesError(message, { code, details });
}

export function getSimpleDc(proficiency) {
  const rank = String(proficiency ?? "").trim().toLowerCase();
  if (!PF2E_PROFICIENCY_RANKS.includes(rank)) {
    throw dcError("UNKNOWN_PROFICIENCY", `Unsupported PF2e proficiency rank '${proficiency ?? ""}'.`, { proficiency });
  }
  return PF2E_SIMPLE_DCS[rank];
}

export function getLevelDc(level) {
  const normalized = Number(level);
  if (!Number.isInteger(normalized) || !Object.hasOwn(PF2E_LEVEL_DCS, normalized)) {
    throw dcError("LEVEL_DC_OUT_OF_RANGE", "PF2e level-based DCs are defined for integer levels 0 through 25.", { level });
  }
  return PF2E_LEVEL_DCS[normalized];
}

export function getDifficultyAdjustment(adjustment = 0) {
  if (typeof adjustment === "string") {
    if (!Object.hasOwn(PF2E_DIFFICULTY_ADJUSTMENTS, adjustment)) {
      throw dcError("UNKNOWN_DIFFICULTY_ADJUSTMENT", `Unsupported PF2e difficulty adjustment '${adjustment}'.`, { adjustment });
    }
    return PF2E_DIFFICULTY_ADJUSTMENTS[adjustment];
  }
  const normalized = Number(adjustment);
  if (!Number.isFinite(normalized)) {
    throw dcError("INVALID_DIFFICULTY_ADJUSTMENT", "Difficulty adjustment must be a known name or finite number.", { adjustment });
  }
  return normalized;
}

export function applyDifficultyAdjustment(dc, adjustment = 0) {
  const base = Number(dc);
  if (!Number.isFinite(base)) throw dcError("INVALID_BASE_DC", "Base DC must be a finite number.", { dc });
  return base + getDifficultyAdjustment(adjustment);
}

export function resolveApproachDc(approach, {
  partyLevel = null,
  gmDc = null,
  difficultyAdjustment = null
} = {}) {
  const dc = approach?.dc ?? {};
  const mode = dc.mode ?? "gm";
  const adjustment = difficultyAdjustment ?? dc.difficultyAdjustment ?? 0;
  let base = null;
  let source = mode;

  switch (mode) {
    case "fixed":
      if (!Number.isFinite(dc.value)) throw dcError("FIXED_DC_REQUIRED", "Fixed chase approach requires a numeric DC.", { approachId: approach?.id ?? null });
      base = Number(dc.value);
      break;
    case "simple":
      base = getSimpleDc(dc.proficiency);
      break;
    case "level": {
      if (partyLevel === null || partyLevel === undefined || !Number.isFinite(Number(partyLevel))) throw dcError("PARTY_LEVEL_REQUIRED", "Level-based chase approach requires a party level.", { approachId: approach?.id ?? null });
      const level = Math.trunc(Number(partyLevel) + Number(dc.levelOffset ?? 0));
      base = getLevelDc(level);
      source = `level:${level}`;
      break;
    }
    case "gm":
      if (gmDc === null || gmDc === undefined || !Number.isFinite(Number(gmDc))) throw dcError("GM_DC_REQUIRED", "This chase approach requires a GM-provided DC.", { approachId: approach?.id ?? null });
      base = Number(gmDc);
      break;
    case "none":
      return Object.freeze({ mode, value: null, base: null, adjustment: 0, source: "none", hidden: dc.hidden !== false });
    default:
      throw dcError("UNKNOWN_DC_MODE", `Unsupported chase DC mode '${mode}'.`, { approachId: approach?.id ?? null, mode });
  }

  const numericAdjustment = getDifficultyAdjustment(adjustment);
  return Object.freeze({
    mode,
    value: base + numericAdjustment,
    base,
    adjustment: numericAdjustment,
    source,
    hidden: dc.hidden !== false
  });
}

export function getPf2eDcTables() {
  return Object.freeze({
    simple: Object.freeze({ ...PF2E_SIMPLE_DCS }),
    level: Object.freeze({ ...PF2E_LEVEL_DCS }),
    adjustments: Object.freeze({ ...PF2E_DIFFICULTY_ADJUSTMENTS })
  });
}
