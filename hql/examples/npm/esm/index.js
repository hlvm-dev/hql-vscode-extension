var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all) {
    __defProp(target, name, { get: all[name], enumerable: true });
  }
};

// lib/other3.js
var other3_exports = {};
__export(other3_exports, {
  default: () => other3_default,
  js_add: () => js_add,
});
function js_add(a, b) {
  console.log(`JS module: Adding ${a} and ${b}`);
  return a + b;
}
var other3_default = {
  js_add,
};

// examples/.build/sample.js
import * as chalkModule from "jsr:@nothing628/chalk@1.0.0";
import * as lodashModule from "npm:lodash@4.17.21";
var other3 = function () {
  const wrapper = other3_default !== void 0 ? other3_default : {};
  for (const [key, value] of Object.entries(other3_exports)) {
    if (key !== "default") {
      wrapper[key] = value;
    }
  }
  return wrapper;
}();
var chalk = function () {
  const wrapper = chalkModule.default !== void 0 ? chalkModule.default : {};
  for (const [key, value] of Object.entries(chalkModule)) {
    if (key !== "default") {
      wrapper[key] = value;
    }
  }
  return wrapper;
}();
console.log(chalk.red("chalk!"));
var lodash = function () {
  const wrapper = lodashModule.default !== void 0 ? lodashModule.default : {};
  for (const [key, value] of Object.entries(lodashModule)) {
    if (key !== "default") {
      wrapper[key] = value;
    }
  }
  return wrapper;
}();
console.log(lodash.capitalize("is it working?"));
console.log(10 * 10 + 1);
console.log("js-adder : ", other3.js_add(10, 20));
