// examples/dependency-test2/e.js
function minus(x, y) {
  return x + y + 200;
}

// examples/dependency-test2/b.js
function add(x, y) {
  return minus(x, y);
}
export {
  add as add3
};
