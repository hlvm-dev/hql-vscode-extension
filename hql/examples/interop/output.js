var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all) {
    __defProp(target, name, { get: all[name], enumerable: true });
  }
};

// examples/interop/test.js
var test_exports = {};
__export(test_exports, {
  hqlUnless: () => hqlUnless,
});

// hql:/Users/seoksoonjang/Desktop/hql/doc/hql_spec.hql
var hql_spec_exports = {};
__export(hql_spec_exports, {
  showcase: () => showcase,
  square: () => square,
  unless: () => hql_unless,
});
import * as pathModule from "https://deno.land/std@0.170.0/path/mod.ts";
import * as fileModule from "https://deno.land/std@0.170.0/fs/mod.ts";
import * as expressModule from "npm:express";
function get(obj, key, notFound = null) {
  if (obj == null) {
    return notFound;
  }
  if (Array.isArray(obj)) {
    return typeof key === "number" && key >= 0 && key < obj.length
      ? obj[key]
      : notFound;
  }
  if (obj instanceof Set) {
    return obj.has(key) ? key : notFound;
  }
  return key in obj ? obj[key] : notFound;
}
var numbers = new Array();
numbers.push(1);
numbers.push(2);
numbers.push(3);
numbers.push(4);
numbers.push(5);
numbers.push(6);
numbers.push(7);
var json = {
  items: [1, 2, 3, 4, 5],
};
json.items;
var data = {
  items: [5, 10, 15, 20, 25, 30, 35, 40],
  factor: 2,
  prefix: "Value: ",
};
data.items;
var user = {
  name: "John",
  age: 30,
};
var vec_item = get(numbers, 2);
var map_value = get(user, "name");
var first_item = get(numbers, 0);
var second_item = get(numbers, 1);
var my_vector = [1, 2, 3, 4, 5];
var element2 = get(my_vector, 2);
var element3 = get(my_vector, 2);
var element4 = get(my_vector, 2);
var square = function (x) {
  return x * x;
};
var factorial = function (n) {
  return n <= 1 ? 1 : n * get(factorial, n - 1);
};
console.log("square : ", get(square, 10));
var log_all = function (...items) {
  return console.log(items);
};
var with_prefix = function (prefix, ...rest) {
  return console.log(prefix, rest);
};
log_all(1, 2, 3, 4, 5);
with_prefix("Numbers:", 1, 2, 3);
var showcase = function (n) {
  return function () {
    const result = n < 0
      ? "Cannot compute for negative numbers"
      : "Identity element for factorial";
    return result ? result : function () {
      const fact = get(factorial, n);
      const msg = "Factorial of " + (n + " is " + fact);
      console.log(msg);
      return list(n, fact);
    }([]);
  }([]);
};
numbers.push(8);
console.log(numbers);
var max_int_value = Number.MAX_SAFE_INTEGER;
var current_timestamp = Date.now;
console.log("Hello from HQL!");
console.warn("This is a warning");
var date = /* @__PURE__ */ new Date();
var current_year = date.getFullYear;
var month = date.getMonth;
var formatted_date = date.toLocaleDateString;
var abs_value = Math.abs(-42);
var rounded = Math.round(3.7);
var max_value = Math.max(1, 2, 3, 4, 5);
var path = function () {
  const wrapper = pathModule.default !== void 0 ? pathModule.default : {};
  for (const [key, value] of Object.entries(pathModule)) {
    if (key !== "default") {
      wrapper[key] = value;
    }
  }
  return wrapper;
}();
var joined_path = path.join("folder", "file.txt");
var file = function () {
  const wrapper = fileModule.default !== void 0 ? fileModule.default : {};
  for (const [key, value] of Object.entries(fileModule)) {
    if (key !== "default") {
      wrapper[key] = value;
    }
  }
  return wrapper;
}();
var exists = file.existsSync("example-dir");
var express = function () {
  const wrapper = expressModule.default !== void 0 ? expressModule.default : {};
  for (const [key, value] of Object.entries(expressModule)) {
    if (key !== "default") {
      wrapper[key] = value;
    }
  }
  return wrapper;
}();
var app = express();
var router = express.Router;
app.use(express.json);
var message = "Hello, World!";
var upper_message = message.toUpperCase;
var message_parts = message.split(" ");
var array = [1, 2, 3];
array.push(4);
array.push(5);
console.log(array);
var year = date.getFullYear;
var date_string = date.toISOString;
var nums = [1, 2, 3, 4, 5];
var filtered = nums.filter(function (x) {
  return x > 2;
});
var doubled = filtered.map(function (x) {
  return x * 2;
});
var sum = nums.reduce(function (a, b) {
  return a + b;
}, 0);
var max_sum = Math.max(sum, 10);
var config = {
  db: {
    user: {
      name: "admin",
    },
  },
};
var db_part = config.db;
var user_part = db_part.user;
var admin_name = user_part.name;
var get_user = function () {
  return {
    id: 1,
    name: "John",
  };
};
var user_obj = get_user();
var user_name = user_obj.name;
var window_width = window.innerWidth;
var array_length = array.length;
var string_upper = message.toUpperCase;
var substring = message.substring(0, 5);
var replaced = message.replace("Hello", "Hi");
var even_numbers = numbers.filter(function (n) {
  return n % 2 === 0;
});
var doubled_evens = even_numbers.map(function (n) {
  return n * 2;
});
console.log("Doubled evens (step by step):", doubled_evens);
[1, 2, 3, 4, 5, 6, 7, 8].filter(function (n) {
  return n > 5;
}).length;
var chained_result = function () {
  const filtered2 = numbers.filter(function (n) {
    return n > 5;
  });
  const mapped = filtered2.map(function (n) {
    return n * 2;
  });
  return mapped.reduce(function (acc, n) {
    return acc + n;
  }, 0);
}([]);
console.log("Sum of doubled numbers > 5:", chained_result);
var direct_chain = numbers.filter(function (n) {
  return n % 2 === 0;
}).map(function (n) {
  return n * 2;
});
console.log("Direct chain result:", direct_chain);
console.log("\\n----- Test 5: Complex Method Chaining -----");
var complex_chain = numbers.filter(function (n) {
  return n > 3;
}).map(function (n) {
  return n * 3;
}).slice(0, 3);
console.log("Complex chain result:", complex_chain);
var sum_chain = numbers.filter(function (n) {
  return n > 5;
}).map(function (n) {
  return n * 2;
}).filter(function (n) {
  return n % 4 === 0;
}).reduce(function (acc, n) {
  return acc + n;
}, 0);
console.log("Sum from complex chain:", sum_chain);
var macro_x = 10;
macro_x > 5
  ? function () {
    return console.log("macro_x is greater than 5");
  }([])
  : null;
macro_x < 5 ? null : function () {
  return console.log("macro_x is not less than 5");
}([]);
var hql_unless = function (x) {
  return x ? null : function () {
    return x ? 0 : 1;
  }([]);
};
var x_plus_one = macro_x + 1;
var x_minus_one = macro_x - 1;
console.log(x_plus_one);
console.log(x_minus_one);

// examples/interop/test.js
function hqlUnless(bool) {
  return hql_unless(bool);
}

// examples/interop/test2.js
var test2_exports = {};
__export(test2_exports, {
  hqlSquare: () => hqlSquare,
});
function hqlSquare(a) {
  return square(a);
}

// examples/interop/output.js
console.log("ya11");
var module = function () {
  const wrapper = void 0 !== void 0 ? void 0 : {};
  for (const [key, value] of Object.entries(test_exports)) {
    if (key !== "default") {
      wrapper[key] = value;
    }
  }
  return wrapper;
}();
console.log("ya22");
var spec = function () {
  const wrapper = void 0 !== void 0 ? void 0 : {};
  for (const [key, value] of Object.entries(hql_spec_exports)) {
    if (key !== "default") {
      wrapper[key] = value;
    }
  }
  return wrapper;
}();
console.log("do spec square : ", spec.square(10));
var module2 = function () {
  const wrapper = void 0 !== void 0 ? void 0 : {};
  for (const [key, value] of Object.entries(test2_exports)) {
    if (key !== "default") {
      wrapper[key] = value;
    }
  }
  return wrapper;
}();
console.log("module2.hqlSquare wrong : ", module2.hqlSquare(3));
var module1 = function () {
  const wrapper = void 0 !== void 0 ? void 0 : {};
  for (const [key, value] of Object.entries(test_exports)) {
    if (key !== "default") {
      wrapper[key] = value;
    }
  }
  return wrapper;
}();
console.log("module1.hqlUnless : ", module1.hqlUnless(true));
