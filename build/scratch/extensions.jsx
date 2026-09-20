// Classroom-approved built-ins only; no extension gallery or arbitrary URLs.
import extensions from './index.jsx';
export default extensions.filter(extension => ['pen', 'music', 'makeymakey'].includes(extension.extensionId));
export const galleryError = null;
export const galleryLoading = null;
export const galleryMore = null;
