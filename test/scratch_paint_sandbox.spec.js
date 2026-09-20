const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const patchPaper = require('../build/scratch/paper-sandbox-loader.cjs');

const root = path.resolve(__dirname, '..');
const upstream = require('../build/scratch/upstream.json');
const workspaces = [
    process.env.SCRATCH_BUILD_DIR,
    path.join(root, '.cache/scratch-player-build'),
    path.join(os.tmpdir(), `onebyone-turbowarp-${upstream.commit}`),
    path.join(os.tmpdir(), 'onebyone-scratch-build'),
].filter(Boolean);
const paperPath = workspaces.map((workspace) => path.join(workspace,
    'node_modules/@turbowarp/paper/dist/paper-full.js')).find((file) => fs.existsSync(file));
const source = paperPath && fs.readFileSync(paperPath, 'utf8');

function harness(code) {
    const dom = new JSDOM('<!doctype html><body></body>', {
        url: 'https://classroom.example.test/scratch-editor/editor.html', runScripts: 'outside-only',
    });
    const { window } = dom;
    const { document } = window;
    // Paper enables its Node adapter for JSDOM's user agent. Test its browser path.
    Object.defineProperty(window.navigator, 'userAgent', { value: 'Chrome/130.0' });
    window.HTMLCanvasElement.prototype.getContext = function getContext() {
        // The assertions exercise Paper's real SVG parsing and vector geometry,
        // not pixel rendering. Only the incidental canvas APIs are stubbed.
        return new Proxy({
            canvas: this,
            measureText: (value) => ({ width: value.length * 8 }),
            getImageData: () => ({ data: new Uint8ClampedArray(4) }),
            createImageData: () => ({ data: new Uint8ClampedArray(4) }),
        }, { get: (target, key) => key in target ? target[key] : () => {} });
    };
    const frames = [];
    const createElement = document.createElement.bind(document);
    document.createElement = (name, ...args) => {
        const element = createElement(name, ...args);
        if (name.toLowerCase() === 'iframe') {
            // Reproduce the browser's inherited opaque sandbox boundary.
            Object.defineProperty(element, 'contentDocument', { get: () => null });
            frames.push(element);
        }
        return element;
    };
    const inertDocuments = [];
    const createHTMLDocument = document.implementation.createHTMLDocument.bind(document.implementation);
    document.implementation.createHTMLDocument = (...args) => {
        const inert = createHTMLDocument(...args);
        inertDocuments.push(inert);
        return inert;
    };
    vm.runInContext(code, dom.getInternalVMContext(), { filename: 'paper-full.js' });
    const paper = window.paper;
    paper.setup(new paper.Size(480, 360));
    return { window, document, paper, frames, inertDocuments, close: () => window.close() };
}

const svg = (content) => `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80" viewBox="0 0 100 80">${content}</svg>`;

describe('Scratch paint SVG isolation', () => {
    it('fails closed when the pinned dependency no longer contains the reviewed sandbox', () => {
        assert.throws(() => patchPaper('const differentImplementation = true;'), /Pinned Paper SVG sandbox/);
    });

    describe('real pinned Paper importer', { skip: !source && 'Install the pinned local Scratch build dependencies first.' }, () => {
        it('reproduces the unpatched null.open crash at the inherited opaque iframe boundary', () => {
            const editor = harness(source);
            try {
                assert.throws(() => editor.paper.project.importSVG(svg('<rect width="20" height="30"/>')),
                    /Cannot read properties of null \(reading 'open'\)/);
                assert.equal(editor.frames.length, 1);
                assert.equal(editor.frames[0].sandbox, 'allow-same-origin');
            } finally {
                editor.close();
            }
        });

        it('imports editable geometry, inherited attributes, inline styles and gradients without a child iframe', () => {
            const editor = harness(patchPaper(source));
            try {
                const item = editor.paper.project.importSVG(svg(`
                    <defs><linearGradient id="gradient"><stop offset="0" stop-color="#ff0000"/>
                        <stop offset="1" stop-color="#0000ff"/></linearGradient></defs>
                    <g fill="#345678"><rect id="attribute-shape" x="5" y="6" width="20" height="30"/></g>
                    <path id="inline-shape" d="M 30 10 L 50 10 L 50 30 Z"
                        style="fill: #22aa55; stroke: #112233; stroke-width: 3"/>
                    <rect id="gradient-shape" x="55" y="10" width="20" height="30" fill="url(#gradient)"/>
                `), { insert: false, expandShapes: true });
                const paths = item.getItems({ class: editor.paper.Path });
                const attribute = paths.find((shape) => shape.bounds.x === 5);
                assert.equal(attribute.className, 'Path');
                assert.equal(attribute.bounds.width, 20);
                assert.equal(attribute.bounds.height, 30);
                assert.equal(attribute.fillColor.toCSS(true), '#345678');
                const inline = paths.find((shape) => shape.bounds.x === 30);
                assert.equal(inline.fillColor.toCSS(true), '#22aa55');
                assert.equal(inline.strokeColor.toCSS(true), '#112233');
                assert.equal(inline.strokeWidth, 3);
                const gradient = paths.find((shape) => shape.bounds.x === 55).fillColor.gradient;
                assert.equal(gradient.stops.length, 2);
                assert.equal(gradient.stops[0].color.toCSS(true), '#ff0000');
                assert.equal(gradient.stops[1].color.toCSS(true), '#0000ff');
                attribute.fillColor = '#aabbcc';
                assert.match(item.exportSVG({ asString: true }), /#aabbcc/);
                assert.equal(editor.frames.length, 0);
                assert.equal(editor.inertDocuments.length, 1);
                assert.equal(editor.inertDocuments[0].defaultView, null);
                assert.equal(editor.inertDocuments[0].body.children.length, 0);
            } finally {
                editor.close();
            }
        });

        it('keeps imported nodes outside the live DOM, reuses the inert document and cleans up failed imports', () => {
            const editor = harness(patchPaper(source));
            try {
                let inspected = false;
                const liveMarkup = editor.document.body.innerHTML;
                editor.paper.project.importSVG(svg(`
                    <style>body { display: none }</style>
                    <script>window.untrustedSvgExecuted = true</script>
                    <rect id="untrusted" onload="window.untrustedSvgExecuted = true" width="20" height="30"/>
                `), {
                    insert: false,
                    onImport(node) {
                        if (node.getAttribute && node.getAttribute('id') === 'untrusted') {
                            inspected = true;
                            assert.notEqual(node.ownerDocument, editor.document);
                            assert.equal(node.ownerDocument.defaultView, null);
                            assert.equal(editor.document.contains(node), false);
                        }
                    },
                });
                assert.equal(inspected, true);
                assert.equal(editor.window.untrustedSvgExecuted, undefined);
                assert.equal(editor.document.body.innerHTML, liveMarkup);
                assert.throws(() => editor.paper.project.importSVG(svg('<rect width="1" height="1"/>'), {
                    insert: false, onImport() { throw new Error('intentional import failure'); },
                }), /intentional import failure/);
                assert.equal(editor.inertDocuments.length, 1);
                assert.equal(editor.inertDocuments[0].body.children.length, 0);
                assert.equal(editor.frames.length, 0);
            } finally {
                editor.close();
            }
        });
    });
});
