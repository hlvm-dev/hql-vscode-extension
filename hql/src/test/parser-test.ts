import { parse, ParseError } from '../parser';

// Test unclosed lists with tolerant parsing
console.log("Testing tolerant parsing with unclosed expressions...");

// Unclosed list
const unclosedList = "(defn my-function [x y]";
try {
  console.log("Test 1: Unclosed list - Regular parsing");
  parse(unclosedList, false);
  console.log("❌ Expected error but parsing succeeded");
} catch (e) {
  if (e instanceof ParseError) {
    console.log("✅ Error caught as expected:", e.message);
  } else {
    console.log("❌ Unexpected error type:", e);
  }
}

try {
  console.log("\nTest 2: Unclosed list - Tolerant parsing");
  const result = parse(unclosedList, true);
  console.log("✅ Tolerant parsing succeeded:", result.length > 0 ? "Contains expressions" : "Empty result");
} catch (e) {
  console.log("❌ Error during tolerant parsing:", e);
}

// Unclosed vector
const unclosedVector = "[1 2 3";
try {
  console.log("\nTest 3: Unclosed vector - Regular parsing");
  parse(unclosedVector, false);
  console.log("❌ Expected error but parsing succeeded");
} catch (e) {
  if (e instanceof ParseError) {
    console.log("✅ Error caught as expected:", e.message);
  } else {
    console.log("❌ Unexpected error type:", e);
  }
}

try {
  console.log("\nTest 4: Unclosed vector - Tolerant parsing");
  const result = parse(unclosedVector, true);
  console.log("✅ Tolerant parsing succeeded:", result.length > 0 ? "Contains expressions" : "Empty result");
  console.log("Result:", JSON.stringify(result, null, 2));
} catch (e) {
  console.log("❌ Error during tolerant parsing:", e);
}

// Unclosed map
const unclosedMap = "{:a 1 :b 2";
try {
  console.log("\nTest 5: Unclosed map - Regular parsing");
  parse(unclosedMap, false);
  console.log("❌ Expected error but parsing succeeded");
} catch (e) {
  if (e instanceof ParseError) {
    console.log("✅ Error caught as expected:", e.message);
  } else {
    console.log("❌ Unexpected error type:", e);
  }
}

try {
  console.log("\nTest 6: Unclosed map - Tolerant parsing");
  const result = parse(unclosedMap, true);
  console.log("✅ Tolerant parsing succeeded:", result.length > 0 ? "Contains expressions" : "Empty result");
  console.log("Result:", JSON.stringify(result, null, 2));
} catch (e) {
  console.log("❌ Error during tolerant parsing:", e);
}

// Partially complete expression with nested unclosed elements
const complexExpression = "(let [x (fn [a b] (+ a";
try {
  console.log("\nTest 7: Complex unclosed expression - Regular parsing");
  parse(complexExpression, false);
  console.log("❌ Expected error but parsing succeeded");
} catch (e) {
  if (e instanceof ParseError) {
    console.log("✅ Error caught as expected:", e.message);
  } else {
    console.log("❌ Unexpected error type:", e);
  }
}

try {
  console.log("\nTest 8: Complex unclosed expression - Tolerant parsing");
  const result = parse(complexExpression, true);
  console.log("✅ Tolerant parsing succeeded:", result.length > 0 ? "Contains expressions" : "Empty result");
} catch (e) {
  console.log("❌ Error during tolerant parsing:", e);
}

console.log("\nTesting completed!"); 