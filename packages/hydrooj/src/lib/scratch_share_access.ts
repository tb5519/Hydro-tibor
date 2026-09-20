// Only the token-scoped player and its one project file are public. This must
// not make /scratch, work IDs, or the ordinary private file endpoint public.
export function isScratchShareRequest(path: string, method: string) {
    return ['GET', 'HEAD'].includes(method.toUpperCase())
        && /^\/scratch\/share\/[a-f0-9]{64}(?:\/project)?$/.test(path);
}
