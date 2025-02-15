// // src/helpers/getOutermostExpressionRange.ts
// import { TextDocument, Position, Range } from "vscode";
// import { parseHQL, HQLValue } from "../lspServer";

// function findNodesEnclosingOffset(ast: HQLValue[], offset: number): HQLValue[] {
//   const found: HQLValue[] = [];
//   function visit(node: HQLValue) {
//     if (node.start !== undefined && node.end !== undefined) {
//       if (offset >= node.start && offset < node.end) {
//         found.push(node);
//       }
//     }
//     if (node.type === "list") {
//       for (const c of node.value) {
//         visit(c);
//       }
//     }
//   }
//   for (const form of ast) {
//     visit(form);
//   }
//   return found;
// }

// /**
//  * getOutermostNode: pick the node with the smallest start (or largest end) among
//  * those that enclose offset, so that we get the top-level node.
//  */
// function getOutermostNode(ast: HQLValue[], offset: number): HQLValue | null {
//   const nodes = findNodesEnclosingOffset(ast, offset);
//   if (nodes.length === 0) return null;
//   let best = nodes[0];
//   for (const n of nodes) {
//     if (n.start! < best.start!) {
//       best = n;
//     } else if (n.start === best.start && n.end! > best.end!) {
//       best = n;
//     }
//   }
//   return best;
// }

// export function getOutermostExpressionRange(document: TextDocument, position: Position): Range {
//   const text = document.getText();
//   if (!text.trim()) {
//     return new Range(position, position);
//   }
//   const offset = document.offsetAt(position);
//   const ast = parseHQL(text);
//   const node = getOutermostNode(ast, offset);
//   if (node && node.start !== undefined && node.end !== undefined) {
//     return new Range(
//       document.positionAt(node.start),
//       document.positionAt(node.end)
//     );
//   }
//   // fallback to current
//   return new Range(position, position);
// }
