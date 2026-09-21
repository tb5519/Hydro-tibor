import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let editorVersion: string;

/** The prepared HTML includes the hashed runtime and its asset base. Releases
 * restart Hydro, so its content version only needs to be read once per process. */
export function getScratchEditorVersion() {
    if (editorVersion) return editorVersion;
    try {
        const entry = readFileSync(resolve(__dirname, '../../../ui-default/public/scratch-editor/editor.html'));
        editorVersion = createHash('sha256').update(entry).digest('hex');
        return editorVersion;
    } catch {
        // Keep an unbuilt local checkout usable; do not cache a missing bundle.
        return 'unavailable';
    }
}
