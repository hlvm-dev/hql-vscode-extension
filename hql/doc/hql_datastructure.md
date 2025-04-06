# HQL Data Structures

This document outlines the data structures available in HQL, focusing on their literal syntax, the canonical S-expression forms they represent, and the mechanism by which the parser transforms the literal syntax into these S-expressions.

## Overview

HQL provides syntactic sugar for common data structures like vectors (arrays), hash maps (objects), and hash sets. This familiar literal syntax is recognized by the HQL parser and transformed into corresponding canonical S-expressions during the parsing phase. This allows for a more user-friendly syntax without complicating the core language, which remains based on S-expressions.

## Transformation Mechanism

The HQL parser, implemented in `src/s-exp/parser.ts`, uses a tokenizer to identify special characters that denote literal data structures. When the tokenizer encounters `[`, `{`, or `#[`, the parser invokes specific functions (`parseVector`, `parseMap`, `parseSet`) to read the elements within the structure and construct the appropriate S-expression list. Commas (`,`) within vectors, maps, and sets are treated as whitespace and ignored during parsing.

---

## 1. Vectors (Arrays)

* **Purpose:** Represents ordered collections of elements, similar to JavaScript arrays.

* **Literal Syntax:** Uses square brackets `[]`, with elements separated by whitespace or commas.
    ```hql
    [1, 2, 3, 4]
    [ "apple" "banana" "cherry" ]
    [] ; Empty vector
    ```

* **Canonical S-expression:** The parser transforms the literal syntax into a list starting with the symbol `vector`. An empty literal `[]` is transformed into `(empty-array)`.
    ```hql
    (vector 1 2 3 4)
    (vector "apple" "banana" "cherry")
    (empty-array) ; Canonical form for []
    ```

* **Parsing Mechanism (`src/s-exp/parser.ts` -> `parseVector`)**:
    1.  When the parser encounters a `[` token (`TokenType.LeftBracket`), it calls `parseVector`.
    2.  It reads subsequent expressions until it finds the closing `]` token (`TokenType.RightBracket`).
    3.  Commas (`TokenType.Comma`) encountered between elements are skipped.
    4.  It constructs an `SList` with `vector` as the first element, followed by the parsed elements.
    5.  If no elements are found between `[` and `]`, it returns `(empty-array)`.

---

## 2. Hash Maps (Objects)

* **Purpose:** Represents key-value pairs, similar to JavaScript objects or dictionaries.

* **Literal Syntax:** Uses curly braces `{}`, with key-value pairs separated by a colon `:`, and pairs separated by whitespace or commas. Keys can be strings or keywords (represented as symbols).
    ```hql
    { "name": "Alice", "age": 30 }
    { :host "localhost", :port 8080 } ; Using keywords (symbols) as keys
    {} ; Empty map
    ```

* **Canonical S-expression:** The parser transforms the literal syntax into a list starting with the symbol `hash-map`, followed by alternating key and value expressions. An empty literal `{}` is transformed into `(empty-map)`.
    ```hql
    (hash-map "name" "Alice" "age" 30)
    (hash-map (keyword "host") "localhost" (keyword "port") 8080) ; Keywords are often handled this way, though the parser code itself uses literals/symbols directly
    (empty-map) ; Canonical form for {}
    ```
    *(Note: The exact representation of keyword keys like `:host` might involve a specific `keyword` function or simply use the symbol directly in the parsed S-expression, depending on later transformation stages. The parser itself creates literal or symbol nodes for keys.)*

* **Parsing Mechanism (`src/s-exp/parser.ts` -> `parseMap`)**:
    1.  When the parser encounters a `{` token (`TokenType.LeftBrace`), it calls `parseMap`.
    2.  It reads expressions in pairs (key, value) until it finds the closing `}` token (`TokenType.RightBrace`).
    3.  It expects a `:` token (`TokenType.Colon`) between the key and value, throwing an error if it's missing.
    4.  Commas (`TokenType.Comma`) encountered between pairs are skipped.
    5.  It constructs an `SList` with `hash-map` as the first element, followed by the parsed key-value pairs.
    6.  If no key-value pairs are found, it returns `(empty-map)`.

---

## 3. Hash Sets

* **Purpose:** Represents unordered collections of unique values.

* **Literal Syntax:** Uses `#[ ]`, with elements separated by whitespace or commas.
    ```hql
    #[1, 2, 3, 1] ; Duplicates are implicitly handled by the Set data structure itself
    #["red" "green" "blue"]
    #[] ; Empty set
    ```

* **Canonical S-expression:** The parser transforms the literal syntax into a list starting with the symbol `hash-set`. An empty literal `#[]` is transformed into `(empty-set)`.
    ```hql
    (hash-set 1 2 3 1)
    (hash-set "red" "green" "blue")
    (empty-set) ; Canonical form for #[]
    ```

* **Parsing Mechanism (`src/s-exp/parser.ts` -> `parseSet`)**:
    1.  When the parser encounters a `#[` token (`TokenType.HashLeftBracket`), it calls `parseSet`.
    2.  It reads subsequent expressions until it finds the closing `]` token (`TokenType.RightBracket`).
    3.  Commas (`TokenType.Comma`) encountered between elements are skipped.
    4.  It constructs an `SList` with `hash-set` as the first element, followed by the parsed elements.
    5.  If no elements are found between `#[` and `]`, it returns `(empty-set)`.

---

## Summary

HQL uses its parser to translate intuitive literal syntax for vectors, maps, and sets into their underlying S-expression representations (`(vector ...)`, `(hash-map ...)`, `(hash-set ...)`, or their empty counterparts). This allows developers to use familiar notations while the core language processing operates consistently on S-expressions.
 No newline at end of file
