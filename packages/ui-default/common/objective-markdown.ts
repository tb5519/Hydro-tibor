import MarkdownIt from 'markdown-it';
import Katex from '../backendlib/markdown-it-katex';

/** Keep numeric Python powers in imported prose from becoming Markdown emphasis. */
export function preserveNumericPowerOperators(markdown: MarkdownIt) {
  markdown.inline.ruler.before('emphasis', 'numeric_power_operator', (state, silent) => {
    const position = state.pos;
    if (state.src.slice(position, position + 2) !== '**'
      || !/[0-9]/.test(state.src.charAt(position - 1))
      || !/^[+-]?(?:[0-9]|\.[0-9])/.test(state.src.slice(position + 2, state.posMax))) return false;
    // Preserve a closed numeric bold span after a number: 4**2**. Another
    // numeric operand after the closing pair makes it a chain instead: 2**3**2.
    if (/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)\*\*(?![+-]?(?:[0-9]|\.[0-9]))/
      .test(state.src.slice(position + 2, state.posMax))) return false;
    const [first, second] = state.delimiters.slice(-2);
    const sinceOpening = second && state.tokens.slice(second.token + 1);
    // A real numeric bold span can touch another number: **2**3. Its opening
    // delimiters exist as tokens; a previous power in 2**3**2 has no delimiters.
    if (first?.marker === 0x2A && second?.marker === 0x2A && first.open && second.open
      && second.token === first.token + 1 && sinceOpening.every((token) => token.type === 'text')
      && /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(sinceOpening.map((token) => token.content).join('') + state.pending)) return false;
    // Backticks, fenced code and KaTeX are handled by their own rules before this one.
    // Recognize only numeric operands; ordinary **bold**, **2** and ***bold italic*** retain their meaning.
    if (!silent) state.pending += '**';
    state.pos += 2;
    return true;
  });
}

export function createObjectiveMarkdown() {
  return new MarkdownIt({ html: false, linkify: true }).use(Katex).use(preserveNumericPowerOperators);
}
