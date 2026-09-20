// Paper's nested iframe cannot be read from OneByOne's opaque-origin iframe.
// Keep SVG parsing inert without granting either frame a same-origin capability.
module.exports = function onebyonePaperSandbox(source) {
    const sandbox = /\tvar iframe;\n\tfunction getSandbox\(\) \{[\s\S]*?\n\t\}\n(?=\n\tfunction getValue\()/g;
    const matches = source.match(sandbox);
    if (!matches || matches.length !== 1 || !matches[0].includes('iframe.contentDocument.open();')) {
        throw new Error('Pinned Paper SVG sandbox no longer matches. Review the isolated SVG import patch.');
    }
    return source.replace(sandbox, `\tvar importDocument;
\tfunction getSandbox() {
\t\tif (!importDocument) {
\t\t\t// No browsing context: imported SVG never enters the live editor DOM,
\t\t\t// cannot execute scripts, and does not require a readable child iframe.
\t\t\t// Paper reads presentation attributes and inline styles directly.
\t\t\timportDocument = document.implementation.createHTMLDocument('');
\t\t}
\t\treturn importDocument.body;
\t}
`);
};
