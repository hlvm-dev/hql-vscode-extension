import { minusguys } from "./macro-c.hql";
import { say } from "./utils2.js";

export function double(x) {
  return x * 2;
}

export function minus(x) {
  return minusguys(x);
}

export function hello(msg) {
  console.log(say(msg));
}
