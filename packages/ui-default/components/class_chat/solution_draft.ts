/** A separate recovery slot; never use the student's normal problem draft key. */
export interface SolutionDraftBackup<T> {
  version: 1;
  revision: number;
  base: string;
  pending?: string;
  content: T;
}

export function recoverSolutionDraft<T>(raw: string | null, revision: number, server: T): T | null {
  if (!raw) return null;
  try {
    const backup = JSON.parse(raw) as SolutionDraftBackup<T>;
    if (backup.version !== 1 || !backup.content || typeof (backup.content as any).code !== 'string'
      || typeof (backup.content as any).lang !== 'string' || (backup.content as any).annotations?.version !== 1) return null;
    const fingerprint = JSON.stringify(server);
    // A response can be lost when navigating. Recover edits made after that
    // request only if the saved server version is exactly the pending payload.
    if (backup.revision === revision && backup.base === fingerprint
      || backup.revision + 1 === revision && backup.pending === fingerprint) return backup.content;
  } catch { /* Malformed or obsolete local recovery data cannot replace a draft. */ }
  return null;
}
