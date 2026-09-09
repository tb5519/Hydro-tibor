export function isDomainAvatarImageRequest(path: string, method: string) {
    return ['GET', 'HEAD'].includes(method.toUpperCase())
        && /^\/domain\/avatar\/avatar-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.png$/.test(path);
}
