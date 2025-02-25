"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeNil = makeNil;
exports.makeSymbol = makeSymbol;
exports.makeList = makeList;
exports.makeNumber = makeNumber;
exports.makeString = makeString;
exports.makeBoolean = makeBoolean;
exports.makeEnumCase = makeEnumCase;
function makeNil() { return { type: "nil" }; }
function makeSymbol(name) { return { type: "symbol", name }; }
function makeList(value) { return { type: "list", value }; }
function makeNumber(n) { return { type: "number", value: n }; }
function makeString(s) { return { type: "string", value: s }; }
function makeBoolean(b) { return { type: "boolean", value: b }; }
function makeEnumCase(name) { return { type: "enum-case", name }; }
//# sourceMappingURL=type.js.map