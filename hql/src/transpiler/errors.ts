// src/errors.ts
export class ParseError extends Error {
    constructor(message: string, public position: { line: number; column: number; offset: number; }) {
      super(message);
      this.name = "ParseError";
    }
  }
  