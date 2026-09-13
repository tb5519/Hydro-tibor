/** Teacher-managed learning levels. MAX is stored as 9; RP levels are unrelated. */
export const STUDENT_LEVELS = Array.from({ length: 9 }, (_, index) => ({
    value: index + 1,
    label: index === 8 ? 'MAX' : `${index + 1} 级`,
}));

export function isStudentLevel(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 9;
}

/** Older accounts and invalid stored values retain the default level 1. */
export function normalizeStudentLevel(value: unknown): number {
    const parsed = typeof value === 'string' && /^[1-9]$/.test(value) ? +value : value;
    return isStudentLevel(parsed) ? parsed : 1;
}
