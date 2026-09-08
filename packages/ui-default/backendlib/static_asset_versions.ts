// These assets can change independently, even when the package version stays the same.
export function getStaticAssetVersions(manifest: unknown, uiVersion: string) {
  const assets = manifest && typeof manifest === 'object' && !Array.isArray(manifest)
    ? manifest as Record<string, unknown> : {};
  const hash = (name: string) => {
    const asset = assets[name];
    if (typeof asset !== 'string') return undefined;
    const queryIndex = asset.indexOf('?');
    if (queryIndex < 0) return undefined;
    const version = asset.slice(queryIndex + 1);
    return version && /^[a-f0-9]{6,64}$/i.test(version) ? version : undefined;
  };
  return {
    staticVersion: hash(`hydro-${uiVersion}.js`),
    themeVersion: hash('theme.css'),
    defaultThemeVersion: hash('default.theme.js'),
  };
}
