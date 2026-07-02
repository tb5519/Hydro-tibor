import system from '../model/system';

export const HOME_POSTER_CONFIG_KEY = 'ui.homePoster';

export interface HomePosterConfig {
    image: string;
    storagePath?: string;
    updatedAt?: string;
}

export function getHomePosterConfig(): HomePosterConfig {
    const raw = system.get(HOME_POSTER_CONFIG_KEY) as any;
    if (!raw) return { image: '' };
    if (typeof raw === 'string') return { image: raw };
    if (typeof raw !== 'object') return { image: '' };
    return {
        image: `${raw.image || ''}`,
        storagePath: raw.storagePath ? `${raw.storagePath}` : undefined,
        updatedAt: raw.updatedAt ? `${raw.updatedAt}` : undefined,
    };
}
