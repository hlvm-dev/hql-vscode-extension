import { TextDocument, Position, Range } from 'vscode';

/** 
 * Fallback: Expand outward until whitespace is encountered.
 */
function fallbackToSymbolRange(text: string, offset: number): { start: number; end: number } {
  let left = offset;
  while (left > 0 && /\S/.test(text[left - 1])) left--;
  let right = offset;
  while (right < text.length && /\S/.test(text[right])) right++;
  return { start: left, end: right };
}

/**
 * Returns a balanced range for an s-expression starting at '('.
 */
export function getBalancedRange(text: string, offset: number): { start: number; end: number } | null {
  if (offset >= text.length) {
    offset = text.length - 1;
    if (offset < 0) return null;
  }
  while (offset > 0 && /[\s\)]/.test(text[offset])) offset--;
  let start = offset;
  let balance = 0;
  for (let i = offset; i >= 0; i--) {
    if (text[i] === ')') balance++;
    else if (text[i] === '(') {
      if (balance === 0) { start = i; break; }
      else { balance--; }
    }
  }
  let end = offset;
  balance = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '(') balance++;
    else if (text[i] === ')') {
      balance--;
      if (balance === 0) { end = i + 1; break; }
    }
  }
  return end <= start ? fallbackToSymbolRange(text, offset) : { start, end };
}

/**
 * Get balanced bracket ranges for JSON-style object literals {...}
 */
function getBracedRange(text: string, offset: number): { start: number; end: number } | null {
  if (offset >= text.length) {
    offset = text.length - 1;
    if (offset < 0) return null;
  }
  
  // Scan back to find the opening brace
  let balance = 0;
  let start = offset;
  for (let i = offset; i >= 0; i--) {
    const char = text[i];
    if (char === '}') balance++;
    else if (char === '{') {
      balance--;
      if (balance < 0) {
        start = i;
        break;
      }
    }
  }
  
  // Scan forward to find the closing brace
  balance = 0; 
  let end = offset;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (char === '{') balance++;
    else if (char === '}') {
      balance--;
      if (balance === 0) {
        end = i + 1;
        break;
      }
    }
  }
  
  return end <= start ? null : { start, end };
}

/**
 * Get balanced bracket ranges for array literals [...]
 */
function getBracketRange(text: string, offset: number): { start: number; end: number } | null {
  if (offset >= text.length) {
    offset = text.length - 1;
    if (offset < 0) return null;
  }
  
  // Scan back to find the opening bracket
  let balance = 0;
  let start = offset;
  for (let i = offset; i >= 0; i--) {
    const char = text[i];
    if (char === ']') balance++;
    else if (char === '[') {
      balance--;
      if (balance < 0) {
        start = i;
        break;
      }
    }
  }
  
  // Scan forward to find the closing bracket
  balance = 0; 
  let end = offset;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (char === '[') balance++;
    else if (char === ']') {
      balance--;
      if (balance === 0) {
        end = i + 1;
        break;
      }
    }
  }
  
  return end <= start ? null : { start, end };
}

/**
 * Get balanced range for a set literal #[...]
 */
function getSetLiteralRange(text: string, offset: number): { start: number; end: number } | null {
  if (offset >= text.length) {
    offset = text.length - 1;
    if (offset < 0) return null;
  }
  
  // First, check if we're in a set literal by looking for the # prefix
  let setStart = -1;
  for (let i = offset; i >= 1; i--) {
    if (text[i] === '[' && text[i-1] === '#') {
      setStart = i - 1;
      break;
    }
  }
  
  if (setStart === -1) return null;
  
  // Find the matching closing bracket
  let balance = 1; // We already found the opening bracket
  let setEnd = -1;
  
  for (let i = setStart + 2; i < text.length; i++) {
    if (text[i] === '[') balance++;
    else if (text[i] === ']') {
      balance--;
      if (balance === 0) {
        setEnd = i + 1;
        break;
      }
    }
  }
  
  return setEnd === -1 ? null : { start: setStart, end: setEnd };
}

/**
 * Uses a regex to match a complete double-quoted string literal.
 * Returns its full range (including quotes) if the caret offset falls within.
 */
function getFullStringRange(text: string, offset: number): { start: number; end: number } | null {
  const regex = /"((\\.)|[^"\\])*"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (offset >= start && offset < end) {
      return { start, end };
    }
  }
  return null;
}

/**
 * getCurrentExpressionRange (used for innermost evaluation):
 *
 * If the caret is inside a string literal:
 *   - If the caret falls inside an interpolation group \( ... ), return just that inner expression (without \() and ).
 *   - Otherwise, return the entire inner text (i.e. the literal value without the quotes).
 * If inside a JSON-style object literal {}, return the entire object
 * If inside an array literal [], return the entire array
 * If inside a set literal #[], return the entire set
 * For other non-string content, use balanced parentheses / symbol fallback.
 */
export function getCurrentExpressionRange(document: TextDocument, position: Position): Range {
  const text = document.getText();
  const caretOffset = document.offsetAt(position);
  
  // Check for string literals
  const strRange = getFullStringRange(text, caretOffset);
  if (strRange) {
    // Extract the inner text (without quotes)
    const literalText = text.slice(strRange.start, strRange.end);
    const innerText = literalText.slice(1, literalText.length - 1);
    const caretInLiteral = caretOffset - strRange.start - 1;
    // Look for an interpolation group: \( ... )
    const interpolationRegex = /\\\(([^)]*)\)/g;
    let match: RegExpExecArray | null;
    while ((match = interpolationRegex.exec(innerText)) !== null) {
      const groupStart = match.index;
      const groupEnd = groupStart + match[0].length;
      if (caretInLiteral >= groupStart && caretInLiteral < groupEnd) {
        // Return only the inner expression (exclude "\(" and ")")
        const exprStart = strRange.start + 1 + groupStart + 2; // skip opening quote and "\("
        const exprEnd = strRange.start + 1 + groupEnd - 1;     // skip trailing ")"
        return new Range(document.positionAt(exprStart), document.positionAt(exprEnd));
      }
    }
    // If caret is not inside any interpolation group, return the entire inner text.
    return new Range(document.positionAt(strRange.start + 1), document.positionAt(strRange.end - 1));
  }
  
  // Check for object literals
  const objectRange = getBracedRange(text, caretOffset);
  if (objectRange) {
    return new Range(
      document.positionAt(objectRange.start),
      document.positionAt(objectRange.end)
    );
  }
  
  // Check for array literals
  const arrayRange = getBracketRange(text, caretOffset);
  if (arrayRange) {
    return new Range(
      document.positionAt(arrayRange.start),
      document.positionAt(arrayRange.end)
    );
  }
  
  // Check for set literals
  const setRange = getSetLiteralRange(text, caretOffset);
  if (setRange) {
    return new Range(
      document.positionAt(setRange.start),
      document.positionAt(setRange.end)
    );
  }
  
  // Not in any special structure: fallback to scanning current line for a balanced form.
  const line = document.lineAt(position);
  const lineStart = document.offsetAt(new Position(position.line, 0));
  const lineText = line.text;
  const localOffset = caretOffset - lineStart;
  const candidates: { start: number; end: number }[] = [];
  for (let i = 0; i < lineText.length; i++) {
    if (lineText[i] === '(') {
      const globalIdx = lineStart + i;
      const candidate = getBalancedRange(text, globalIdx);
      if (candidate && candidate.start <= caretOffset && caretOffset <= candidate.end) {
        candidates.push(candidate);
      }
    }
  }
  if (candidates.length > 0) {
    // Find the innermost (smallest) candidate containing the caret
    const innermost = candidates.reduce((prev, curr) => {
      // If current start is greater (more to the right) than prev, it's more inner
      // If they have same start, the one with the earlier end is more inner
      const prevLength = prev.end - prev.start;
      const currLength = curr.end - curr.start;
      return currLength < prevLength ? curr : prev;
    });
    
    return new Range(document.positionAt(innermost.start), document.positionAt(innermost.end));
  }
  
  // Last resort: get the current symbol the cursor is on
  const localRange = fallbackToSymbolRange(lineText, localOffset);
  return new Range(
    document.positionAt(lineStart + localRange.start),
    document.positionAt(lineStart + localRange.end)
  );
}

/**
 * getOutermostExpressionRange (used for outermost evaluation):
 *
 * If the caret is inside a string literal, return the entire literal (with quotes).
 * If inside a JSON-style object literal {}, return the entire object
 * If inside an array literal [], return the entire array
 * If inside a set literal #[], return the entire set
 * Otherwise, scan the entire document for the top-level s-expression containing the caret.
 */
export function getOutermostExpressionRange(document: TextDocument, position: Position): Range {
  const text = document.getText();
  const caretOffset = document.offsetAt(position);
  
  // Check for string literals
  const strRange = getFullStringRange(text, caretOffset);
  if (strRange) {
    return new Range(document.positionAt(strRange.start), document.positionAt(strRange.end));
  }
  
  // Check for object literals (entire object)
  const objectRange = getBracedRange(text, caretOffset);
  if (objectRange) {
    return new Range(
      document.positionAt(objectRange.start),
      document.positionAt(objectRange.end)
    );
  }
  
  // Check for array literals (entire array)
  const arrayRange = getBracketRange(text, caretOffset);
  if (arrayRange) {
    return new Range(
      document.positionAt(arrayRange.start),
      document.positionAt(arrayRange.end)
    );
  }
  
  // Check for set literals (entire set)
  const setRange = getSetLiteralRange(text, caretOffset);
  if (setRange) {
    return new Range(
      document.positionAt(setRange.start),
      document.positionAt(setRange.end)
    );
  }
  
  // Find the top-level expression containing the caret
  let offset = 0;
  let topRange = null;
  while (offset < text.length) {
    while (offset < text.length && /\s/.test(text[offset])) offset++;
    if (offset >= text.length) break;
    
    // Check for parenthesized form
    if (text[offset] === '(') {
      const formRange = getBalancedRange(text, offset);
      if (!formRange) break;
      if (caretOffset >= formRange.start && caretOffset <= formRange.end) {
        topRange = formRange;
        break;
      }
      offset = formRange.end;
      continue;
    }
    
    // Check for object literal
    if (text[offset] === '{') {
      const objectRange = getBracedRange(text, offset);
      if (objectRange && caretOffset >= objectRange.start && caretOffset <= objectRange.end) {
        topRange = objectRange;
        break;
      }
      offset = objectRange ? objectRange.end : offset + 1;
      continue;
    }
    
    // Check for array literal
    if (text[offset] === '[') {
      const arrayRange = getBracketRange(text, offset);
      if (arrayRange && caretOffset >= arrayRange.start && caretOffset <= arrayRange.end) {
        topRange = arrayRange;
        break;
      }
      offset = arrayRange ? arrayRange.end : offset + 1;
      continue;
    }
    
    // Check for set literal
    if (text[offset] === '#' && offset+1 < text.length && text[offset+1] === '[') {
      const setRange = getSetLiteralRange(text, offset);
      if (setRange && caretOffset >= setRange.start && caretOffset <= setRange.end) {
        topRange = setRange;
        break;
      }
      offset = setRange ? setRange.end : offset + 2;
      continue;
    }
    
    // Check for string literal
    if (text[offset] === '"') {
      const stringRange = getFullStringRange(text, offset);
      if (stringRange && caretOffset >= stringRange.start && caretOffset <= stringRange.end) {
        topRange = stringRange;
        break;
      }
      offset = stringRange ? stringRange.end : offset + 1;
      continue;
    }
    
    // Symbol or other token
    const tokenRange = fallbackToSymbolRange(text, offset);
    if (caretOffset >= tokenRange.start && caretOffset <= tokenRange.end) {
      topRange = tokenRange;
      break;
    }
    offset = tokenRange.end;
  }
  
  return topRange ? new Range(document.positionAt(topRange.start), document.positionAt(topRange.end))
                  : getCurrentExpressionRange(document, position);
}