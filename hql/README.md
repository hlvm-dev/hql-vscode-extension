# HQL VS Code Extension

This extension provides basic language support for HQL using a VS Code client that communicates with a macOS-hosted nREPL server. Features include:
- Syntax configuration (comments, brackets, auto-closing pairs, etc.)
- A command (bound to Cmd+Return) that extracts the current HQL expression, sends it to the nREPL server for evaluation, and displays the result inline.
- A modular helper function for auto-grabbing balanced expressions, designed to be reusable in a self-hosted macOS app.

## Installation

1. Clone this repository.
2. Run `npm install` to install dependencies.
3. Run `npm run compile` to compile the TypeScript code.
4. Press F5 in VS Code to launch the Extension Development Host.

## Usage

Open a file with the `.hql` extension, then press Cmd+Return to evaluate the current expression.
