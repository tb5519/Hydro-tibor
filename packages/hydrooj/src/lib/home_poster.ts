import system from '../model/system';

export interface HomePosterConfig {
    image: string;
    layout: 'banner' | 'popout';
    storagePath?: string;
    updatedAt?: string;
    video?: string;
    videoPath?: string;
    videoPoster?: string;
    videoPosterPath?: string;
    videoUpdatedAt?: string;
}

export function getHomePosterConfig(domain: { _id?: string, homePoster?: unknown } | null | undefined): HomePosterConfig {
    // Keep the previous global banner visible on the system domain until that
    // domain's administrator saves a per-domain banner. Other domains never
    // inherit it, so their visual identity remains independent.
    const raw = (domain?.homePoster
        ?? (domain?._id === 'system' ? system.get('ui.homePoster') : undefined)) as any;
    if (!raw) return { image: '', layout: 'banner' };
    if (typeof raw === 'string') return { image: raw, layout: 'banner' };
    if (typeof raw !== 'object') return { image: '', layout: 'banner' };
    return {
        image: `${raw.image || ''}`,
        layout: raw.layout === 'popout' ? 'popout' : 'banner',
        storagePath: raw.storagePath ? `${raw.storagePath}` : undefined,
        updatedAt: raw.updatedAt ? `${raw.updatedAt}` : undefined,
        video: raw.video ? `${raw.video}` : undefined,
        videoPath: raw.videoPath ? `${raw.videoPath}` : undefined,
        videoPoster: raw.videoPoster ? `${raw.videoPoster}` : undefined,
        videoPosterPath: raw.videoPosterPath ? `${raw.videoPosterPath}` : undefined,
        videoUpdatedAt: raw.videoUpdatedAt ? `${raw.videoUpdatedAt}` : undefined,
    };
}
