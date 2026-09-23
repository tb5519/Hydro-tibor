interface ActivityDomain {
  _id?: unknown;
  name?: unknown;
  domainType?: unknown;
}

interface ActivityProblem {
  docId?: unknown;
  nSubmit?: unknown;
  nAccept?: unknown;
}

export interface ProblemActivityDisplay {
  nSubmit: number;
  nAccept: number;
  seeded: boolean;
}

function normalizeIdentity(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeCount(value: unknown) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

/**
 * The two established teaching banks predate an explicit language-bank flag.
 * Their display names are configurable (the production names are currently
 * "编程训练" and "C++题库"), so target their stable ids. Retain the short ids
 * used by local development fixtures, while excluding Scratch domains.
 */
export function isSeededActivityDomain(domain: ActivityDomain | null | undefined) {
  if (!domain || domain.domainType === 'scratch') return false;
  const id = normalizeIdentity(domain._id);
  return id === 'system'
    || id === 'c0001'
    || id === 'python'
    || id === 'cpp';
}

/** Stable FNV-1a range mapping; identical problems keep identical boosts. */
function stableRange(seed: string, min: number, max: number) {
  let hash = 0x811C9DC5;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return min + ((hash >>> 0) % (max - min + 1));
}

/**
 * Return presentation-only activity counts. Stored statistics are never
 * mutated, and callers should continue using the real counts for difficulty.
 */
export function getProblemActivityDisplay(
  domain: ActivityDomain | null | undefined,
  problem: ActivityProblem | null | undefined,
): ProblemActivityDisplay {
  const nSubmit = normalizeCount(problem?.nSubmit);
  const nAccept = normalizeCount(problem?.nAccept);
  if (!isSeededActivityDomain(domain) || nSubmit >= 10) return { nSubmit, nAccept, seeded: false };

  const identity = `${normalizeIdentity(domain?._id)}/${normalizeIdentity(problem?.docId)}`;
  const displaySubmit = nSubmit + stableRange(`${identity}:submit:v1`, 10, 30);
  const displayAccept = Math.min(nAccept + stableRange(`${identity}:accept:v1`, 3, 9), displaySubmit - 1);
  return { nSubmit: displaySubmit, nAccept: displayAccept, seeded: true };
}
