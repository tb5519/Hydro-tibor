/** Keep profile playback and AC celebrations on the same saved badge volume. */
export function normalizeBadgeSoundVolume(value: unknown): number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100 ? value : 25;
}
