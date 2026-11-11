/** A separate recovery slot; never use the student's normal problem draft key. */
export interface SolutionDraftBackup<T> {
  version: 1;
  revision: number;
  base: string;
  pending?: string;
  content: T;
}

// The server validates and reconstructs annotation objects. Its property order
// can differ from the editor's (especially ink labels) without any data change.
function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort()
    .filter((key) => value[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

export function recoverSolutionDraft<T>(raw: string | null, revision: number, server: T): T | null {
  if (!raw) return null;
  try {
    const backup = JSON.parse(raw) as SolutionDraftBackup<T>;
    if (backup.version !== 1 || !backup.content || typeof (backup.content as any).code !== 'string'
      || typeof (backup.content as any).lang !== 'string' || (backup.content as any).annotations?.version !== 1) return null;
    const fingerprint = canonical(server);
    const matches = (value: unknown) => typeof value === 'string' && canonical(JSON.parse(value)) === fingerprint;
    // A response can be lost when navigating. Recover edits made after that
    // request only if the saved server version is exactly the pending payload.
    if (backup.revision === revision && matches(backup.base)
      || backup.revision + 1 === revision && matches(backup.pending)) return backup.content;
  } catch { /* Malformed or obsolete local recovery data cannot replace a draft. */ }
  return null;
}
