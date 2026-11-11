export type CppEditorMode = 'beginner' | 'preset' | 'proficient';

export function getCppEditorMode(account: {
    cppEditorMode?: unknown; _dudoc?: { cppEditorMode?: unknown; cppStarterTemplate?: unknown };
}): CppEditorMode {
    const modes = ['beginner', 'preset', 'proficient'];
    if (modes.includes(account.cppEditorMode as string)) return account.cppEditorMode as CppEditorMode;
    // Preserve the membership setting used before this became an account-wide preference.
    const legacy = account._dudoc || {};
    if (modes.includes(legacy.cppEditorMode as string)) return legacy.cppEditorMode as CppEditorMode;
    return legacy.cppStarterTemplate === true ? 'preset' : 'proficient';
}
