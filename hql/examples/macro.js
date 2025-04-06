function get(obj, key, notFound = null) {
  // Handle null/undefined case
  if (obj == null) return notFound;

  // Handle function case: call the function with key as argument
  if (typeof obj === "function") {
    try {
      return obj(key);
    } catch (e) {
      // If function call fails, fall back to property access
      return (key in obj) ? obj[key] : notFound;
    }
  }

  // Handle arrays (vectors)
  if (Array.isArray(obj)) {
    return (typeof key === "number" && key >= 0 && key < obj.length)
      ? obj[key]
      : notFound;
  }

  // Handle Sets
  if (obj instanceof Set) {
    return obj.has(key) ? key : notFound;
  }

  // Handle objects (maps) - includes handling of numeric keys
  const propKey = typeof key === "number" ? String(key) : key;
  return (propKey in obj) ? obj[propKey] : notFound;
}

(function (temp) {
  return temp();
})(function () {
  console["log"]("Starting process...");
  console["log"]("Executing step 1");
  console["log"]("Executing step 2");
  return 1 + 2;
});
import * as chalkModule from "jsr:@nothing628/chalk@1.0.0";
const chalk = (function () {
  const wrapper = chalkModule.default !== undefined ? chalkModule.default : {};
  for (const [key, value] of Object.entries(chalkModule)) {
    if (key !== "default") {
      wrapper[key] = value;
    }
  }
  return wrapper;
})();
console["log"](chalk["red"]("This should be red!"));
console["log"](chalk["blue"]("This should be blue!"));
console["log"](chalk["yellow"]("This should be yellow!"));
console["log"]("hello " + "world");
console["log"]("hello" + " " + "world");
const my_set = new Set([1, 2, 3, 4, 5]);
console["log"]("Should be true:", my_set["has"](3));
console["log"]("Should be false:", my_set["has"](42));
const my_vector = [10, 20, 30, 40, 50];
console["log"]("Element at index 0 (should be 10):", get(my_vector, 0));
console["log"]("Element at index 2 (should be 30):", get(my_vector, 2));
console["log"]("Element at index 4 (should be 50):", get(my_vector, 4));
const test_cond = function (x) {
  return x < 0
    ? "negative"
    : x === 0
    ? "zero"
    : x < 10
    ? "small positive"
    : x < 100
    ? "medium positive"
    : true
    ? "large positive"
    : null;
};
console["log"]("Testing cond with -5:", get(test_cond, -5));
console["log"]("Testing cond with 0:", get(test_cond, 0));
console["log"]("Testing cond with 5:", get(test_cond, 5));
console["log"]("Testing cond with 50:", get(test_cond, 50));
console["log"]("Testing cond with 500:", get(test_cond, 500));
const test_empty_cond = function () {
  return null;
};
console["log"]("Testing empty cond:", test_empty_cond());
const test_nested_cond = function (x, y) {
  return x < 0
    ? "x is negative"
    : x === 0
    ? y < 0
      ? "x is zero, y is negative"
      : y === 0
      ? "x and y are both zero"
      : true
      ? "x is zero, y is positive"
      : null
    : true
    ? "x is positive"
    : null;
};
console["log"]("Testing nested cond with (0, -5):", test_nested_cond(0, -5));
console["log"]("Testing nested cond with (0, 0):", test_nested_cond(0, 0));
console["log"]("Testing nested cond with (0, 5):", test_nested_cond(0, 5));
console["log"]("\\n=== Testing 'when' macro ===");
const test_when = function (value) {
  console["log"]("Testing when with value:", value);
  return value > 0
    ? function (temp) {
      return temp();
    }(function () {
      console["log"]("Value is positive");
      return console["log"]("Result is:", value * 2);
    })
    : null;
};
get(test_when, 5);
get(test_when, -3);
get(test_when, 0);
console["log"]("\\n=== Testing 'let' macro ===");
const test_let_simple = function () {
  return function (x) {
    return function (temp) {
      return temp();
    }(function () {
      console["log"]("Simple let test:");
      return console["log"]("x =", x);
    });
  }(10);
};
const test_let_multiple = function () {
  return function (x) {
    return function (y) {
      return function (z) {
        return function (temp) {
          return temp();
        }(function () {
          console["log"]("Multiple bindings test:");
          console["log"]("x =", x);
          console["log"]("y =", y);
          console["log"]("z =", z);
          return console["log"]("x + y + z =", x + (y + z));
        });
      }(x + y);
    }(20);
  }(10);
};
const test_let_nested = function () {
  return function (outer) {
    return function (inner) {
      return function (temp) {
        return temp();
      }(function () {
        console["log"]("Nested let test:");
        console["log"]("outer =", outer);
        console["log"]("inner =", inner);
        return console["log"]("outer * inner =", outer * inner);
      });
    }(outer + 2);
  }(5);
};
test_let_simple();
test_let_multiple();
test_let_nested();
console["log"]("\\n=== Testing 'if-let' macro ===");
const test_if_let = function (value) {
  console["log"]("Testing if-let with value:", value);
  return function (x) {
    return x
      ? console["log"]("Value is truthy, doubled:", x * 2)
      : console["log"]("Value is falsy");
  }.value;
};
get(test_if_let, 10);
get(test_if_let, 0);
get(test_if_let, null);
console["log"]("\\nTesting if-let with computed value:");
(function (result) {
  return result
    ? console["log"]("Got result:", result)
    : console["log"]("No result");
})(5 > 3 ? "yes" : null);
console["log"]("\\n=== Combined test ===");
(function (x) {
  return x > 50
    ? function (result) {
      return result
        ? console["log"]("x - 50 =", result)
        : console["log"]("Result was falsy");
    }(x - 50)
    : null;
})(100);
console["log"]("\\n=== Testing 'defn' macro ===");
const multiply = function (a, b) {
  return a * b;
};
console["log"]("multiply(3, 4) =", multiply(3, 4));
const calculate_area = function (radius) {
  const square = radius * radius;
  return 3.14 * square;
};
console["log"]("Area of circle with radius 5:", get(calculate_area, 5));
