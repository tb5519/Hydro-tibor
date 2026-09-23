// Keep the account's Scratch language authoritative even when the upstream
// editor can read its own localStorage. TurboWarp's URL parser lowercases the
// value, but ja-Hira is a supported locale whose canonical key is mixed case.
module.exports = function patchLocale(source) {
    const start = 'const detectLocale = supportedLocales => {\n';
    const oldQuery = `    const queryParams = queryString.parse(location.search);
    // Flatten potential arrays and remove falsy values
    const potentialLocales = [].concat(queryParams.locale, queryParams.lang).filter(l => l);
    if (!potentialLocales.length) {
        return locale;
    }

    const urlLocale = potentialLocales[0].toLowerCase();
    if (supportedLocales.includes(urlLocale)) {
        return urlLocale;
    }

`;
    if (!source.includes(start) || !source.includes(oldQuery)) {
        throw new Error('Pinned Scratch locale detector no longer matches.');
    }
    const preferred = `    // The authenticated parent supplies lang; preserve the canonical locale key.
    const queryParams = queryString.parse(location.search);
    const requested = [].concat(queryParams.locale, queryParams.lang).find(Boolean);
    if (requested) {
        const supported = supportedLocales.find(item => item.toLowerCase() === String(requested).toLowerCase());
        if (supported) return supported;
    }

`;
    return source.replace(oldQuery, '').replace(start, start + preferred);
};
