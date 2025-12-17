const quoteRx = /^(['"])[\w\W]+?\1$/;

export const querySelectAll = (
  selector: string,
  args: Record<string, string> = {},
  root: HTMLElement = document.body,
) => {
  if (selector.includes(':html_contains(')) {
    const matches = findAllHtmlContains(selector);
    let toSplit = selector;
    let elements: Element[] = [root];
    matches.forEach((match) => {
      if (elements.length === 0) return;
      const splitted = toSplit.split(match.full);
      toSplit = splitted.slice(1).join(match.full);
      elements = elements.flatMap((element) =>
        Array.from(element.querySelectorAll(splitted[0])),
      );
      if (elements.length === 0) {
        return;
      }
      let search = match.argRaw;
      if (search.includes('${args.')) {
        search = replaceJsTpl(search, args);
      }
      if (quoteRx.test(search)) search = search.slice(1, -1);

      console.log('elements', elements, search, args);
      elements = elements.filter((element) => {
        return element.innerHTML.includes(search);
      });
    });
    return elements;
  }
  let querySelector = selector;
  if (querySelector.includes('${args.')) {
    querySelector = replaceJsTpl(querySelector, args);
  }
  return Array.from(root.querySelectorAll(querySelector));
};

type Match = {
  full: string; // ":html_contains(...)"
  argRaw: string; // inside the parens, not trimmed
  start: number; // index in selector where match starts
  end: number; // index right after the match
};
const TOKEN = ':html_contains(';
const findAllHtmlContains: (arg0: string) => Match[] = (selector: string) => {
  const parts = selector.split(TOKEN);
  if (parts.length === 1) return [];

  const matches: Match[] = [];
  let thisMatches: Match[] = [];

  // running index at the start of the current part in the original string
  let cursor = 0;

  // parts[0] is before the first token; each next part starts right after a token
  cursor += parts[0].length;

  for (let partIndex = 1, c = parts.length; partIndex < c; partIndex++) {
    const start = cursor; // this points at where TOKEN begins

    const openParen = start + (TOKEN.length - 1); // index of '('

    // Scan forward starting right after '('
    const scanStart = openParen + 1;

    thisMatches = loopAndFind(selector, scanStart, TOKEN.length, ')');

    if (thisMatches.length) {
      matches.push(thisMatches[0]);
    }

    // advance cursor past TOKEN + this part's text in the original string
    cursor += TOKEN.length + parts[partIndex].length;
  }

  return matches;
};

const loopAndFind = (
  input: string,
  startPos: number,
  offset: number,
  endCh: string,
  endIfFind: boolean = true,
) => {
  const matches: Match[] = [];
  const scanStart = startPos;
  let i = scanStart;

  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;

  let escape = false;

  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;

  let inTemplateExpr = false;
  const checkEnd = (ch: string) => {
    if (
      ch === endCh &&
      braceDepth === 0 &&
      bracketDepth === 0 &&
      !inTemplateExpr
    ) {
      const argRaw = input.slice(scanStart, i);
      const end = i + 1;
      const start = scanStart - offset;
      matches.push({
        full: input.slice(start, end),
        argRaw,
        start,
        end,
      });
      return true;
    }
    return false;
  };
  for (const c = input.length; i < c; i++) {
    const ch = input[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }

    if (!inDouble && !inBacktick && ch === "'" && !inSingle) {
      inSingle = true;
      continue;
    } else if (inSingle && ch === "'") {
      inSingle = false;
      continue;
    }

    if (!inSingle && !inBacktick && ch === `"` && !inDouble) {
      inDouble = true;
      continue;
    } else if (inDouble && ch === `"`) {
      inDouble = false;
      continue;
    }

    if (!inSingle && !inDouble && ch === '`') {
      inBacktick = !inBacktick;
      continue;
    }

    if (inSingle || inDouble) continue;

    if (ch === '$' && input[i + 1] === '{') {
      inTemplateExpr = true;
      braceDepth++;
      i++; // skip "{"
      continue;
    }

    if (ch === '(') {
      parenDepth++;
      continue;
    }
    if (ch === ')') {
      if (parenDepth > 0) {
        parenDepth--;
      } else if (checkEnd(ch) && endIfFind) {
        return matches;
      }
      continue;
    }

    if (ch === '{') {
      braceDepth++;
      continue;
    }
    if (ch === '}') {
      if (braceDepth > 0) {
        braceDepth--;
      }
      if (braceDepth === 0) {
        inTemplateExpr = false;
        if (checkEnd(ch) && endIfFind) {
          return matches;
        }
      }
      continue;
    }

    if (ch === '[') {
      bracketDepth++;
      continue;
    }
    if (ch === ']') {
      if (bracketDepth > 0) {
        bracketDepth--;
      } else if (checkEnd(ch) && endIfFind) {
        return matches;
      }
      continue;
    }
  }

  return matches;
};

export const replaceJsTpl = (
  tpl: string,
  args: Record<string, string>,
): string => {
  if (tpl.includes('${')) {
    let js = tpl;
    if (tpl[0] !== '`') {
      js = `\`${js}\``;
    }
    // eslint-disable-next-line no-eval
    return eval(`((args)=>${js})(${JSON.stringify(args)})`) as string;
  }
  return tpl;
};
