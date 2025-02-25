"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.baseEnv = exports.Env = void 0;
class Env {
    constructor(bindings = {}, outer = null) {
        this.bindings = bindings;
        this.outer = outer;
    }
    get(key) {
        if (key in this.bindings) {
            return this.bindings[key];
        }
        else if (this.outer) {
            return this.outer.get(key);
        }
        else {
            throw new Error(`Symbol '${key}' not found`);
        }
    }
    set(key, value) {
        this.bindings[key] = value;
    }
}
exports.Env = Env;
exports.baseEnv = new Env();
//# sourceMappingURL=env.js.map