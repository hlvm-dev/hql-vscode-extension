"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parse = parse;
const type_1 = require("../modules/type");
/**
 * Parse the HQL source `input` into an array of HQLValue AST nodes.
 * Each node now includes `.start` and `.end` offsets.
 */
function parse(input) {
    const result = [];
    let i = 0;
    const len = input.length;
    /**
     * Skip whitespace and line comments (starting with `;`)
     */
    function skipWs() {
        while (i < len) {
            const ch = input[i];
            if (ch === ";") {
                // skip comment until newline
                while (i < len && input[i] !== "\n") {
                    i++;
                }
            }
            else if (/\s/.test(ch)) {
                i++;
            }
            else {
                break;
            }
        }
    }
    /**
     * Read a double-quoted string. Also handles `\( ... )` interpolation.
     */
    function readString() {
        // Remember the position of the opening quote
        const startPos = i;
        i++; // skip opening quote
        let buf = "";
        const parts = [];
        let interpolation = false;
        while (i < len) {
            if (input[i] === '"') {
                i++; // consume closing quote
                break;
            }
            // detect \(
            if (input[i] === "\\" && i + 1 < len && input[i + 1] === "(") {
                interpolation = true;
                if (buf !== "") {
                    // push the accumulated text so far as a string node
                    const strNode = (0, type_1.makeString)(buf);
                    // (Optionally assign start/end for partial segments, if you want)
                    parts.push(strNode);
                }
                buf = "";
                i += 2; // skip "\("
                // read until matching ")"
                let exprStr = "";
                let parenCount = 1;
                while (i < len && parenCount > 0) {
                    const c = input[i];
                    if (c === "(") {
                        parenCount++;
                    }
                    else if (c === ")") {
                        parenCount--;
                        if (parenCount === 0) {
                            i++;
                            break;
                        }
                    }
                    exprStr += c;
                    i++;
                }
                const subAST = parse(exprStr);
                if (subAST.length > 0) {
                    parts.push(subAST[0]);
                }
            }
            else {
                buf += input[i];
                i++;
            }
        }
        // position after the closing quote
        const endPos = i;
        // If no interpolation, return a single string node
        if (!interpolation) {
            const node = (0, type_1.makeString)(buf);
            node.start = startPos;
            node.end = endPos;
            return node;
        }
        else {
            // we had interpolation, so we store the final segment as well
            if (buf !== "") {
                parts.push((0, type_1.makeString)(buf));
            }
            // wrap the parts in a list (str ...)
            const listNode = (0, type_1.makeList)([(0, type_1.makeSymbol)("str"), ...parts]);
            listNode.start = startPos;
            listNode.end = endPos;
            return listNode;
        }
    }
    /**
     * Read either a symbol, a number, a boolean, nil, or an enum case (.foo).
     */
    function readSymbolOrNumber() {
        const startPos = i;
        // read until whitespace or bracket/paren
        while (i < len &&
            !/\s/.test(input[i]) &&
            !["(", ")", "[", "]", ";"].includes(input[i])) {
            i++;
        }
        const endPos = i;
        const token = input.slice(startPos, endPos);
        // If it starts with ".", treat it as an enum case
        if (token.startsWith(".")) {
            // e.g. ".hlvm" => name = "hlvm"
            const node = (0, type_1.makeEnumCase)(token.slice(1));
            node.start = startPos;
            node.end = endPos;
            return node;
        }
        // If numeric
        if (/^[+\-]?\d+(\.\d+)?$/.test(token)) {
            const node = (0, type_1.makeNumber)(parseFloat(token));
            node.start = startPos;
            node.end = endPos;
            return node;
        }
        // If boolean
        if (token === "true") {
            const node = (0, type_1.makeBoolean)(true);
            node.start = startPos;
            node.end = endPos;
            return node;
        }
        if (token === "false") {
            const node = (0, type_1.makeBoolean)(false);
            node.start = startPos;
            node.end = endPos;
            return node;
        }
        // If nil
        if (token === "nil") {
            const node = (0, type_1.makeNil)();
            node.start = startPos;
            node.end = endPos;
            return node;
        }
        // Otherwise a normal symbol
        const symNode = (0, type_1.makeSymbol)(token);
        symNode.start = startPos;
        symNode.end = endPos;
        return symNode;
    }
    /**
     * Read a list (either parenthesized or bracketed).
     * e.g. "(...)" or "[...]"
     */
    function readList() {
        const startPos = i;
        const openChar = input[i]; // "(" or "["
        i++; // skip the '(' or '['
        const items = [];
        while (true) {
            skipWs();
            if (i >= len) {
                // reached end of input with no closing
                break;
            }
            const ch = input[i];
            // check matching closing
            if ((openChar === "(" && ch === ")") || (openChar === "[" && ch === "]")) {
                i++; // consume the closing char
                const listNode = (0, type_1.makeList)(items);
                listNode.start = startPos;
                listNode.end = i; // position after closing paren/bracket
                return listNode;
            }
            items.push(readForm());
        }
        // If we exit loop, we never found a matching closing paren/bracket
        const listNode = (0, type_1.makeList)(items);
        listNode.start = startPos;
        listNode.end = i;
        return listNode;
    }
    /**
     * Read one form (string, symbol, number, list, etc.).
     */
    function readForm() {
        skipWs();
        if (i >= len) {
            // No more input => return nil
            return (0, type_1.makeNil)();
        }
        const ch = input[i];
        if (ch === "(" || ch === "[") {
            return readList();
        }
        if (ch === '"') {
            return readString();
        }
        if (ch === ")" || ch === "]") {
            i++; // consume extra closing
            return (0, type_1.makeNil)();
        }
        return readSymbolOrNumber();
    }
    // Main parse loop
    while (true) {
        skipWs();
        if (i >= len) {
            break;
        }
        result.push(readForm());
    }
    return result;
}
//# sourceMappingURL=parser.js.map