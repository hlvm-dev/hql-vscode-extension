;;;;;;;;;;;;;;;;;;;;;; inc 

The issue is that the function call

(x_plus_one2 1)
is being transformed not into a normal function invocation but into a collection access, namely into

get(x_plus_one2, 1)
which returns null (since functions don’t have an indexed property "1").

What’s Happening
In the transformation phase, there’s a rule that automatically rewrites any two‑element list that isn’t recognized as a special form into a call to the get function (to support Clojure‑style collection access). For example, this rule says:

If a list has exactly two elements, and the first element is not a kernel primitive, not a known operator, and does not start with "js-" (and isn’t one of a few special names like "new"), then treat the form as a collection access:
(collection index)  ⟶  (get collection index)
Because (x_plus_one2 1) meets those criteria, it gets transformed into get(x_plus_one2, 1) instead of a proper function call.

How to Fix It
You have a couple of options:

Refine the Transformation Rule:
Adjust the logic in your list transformation so that it distinguishes between a function call and collection access. For example, you might require that collection access be explicit (such as starting with a dot or using a specific syntax) rather than the default for any two‑element list.
Use a Different Syntax for Collection Access:
Reserve the simple two‑element list form for function calls. Then, if you need collection access, you could introduce a different marker (for example, prefix the property name with a dot or use a dedicated form).
For a quick fix, you might modify the rule in your transformList function so that it does not transform a form into (get collection index) if the first element is a symbol that should be treated as a function. For example, if you have a way to tell that x_plus_one2 is defined as a function (perhaps by consulting a symbol table or by checking naming conventions), then you can skip that transformation.

In Summary
The reason you get null is that (x_plus_one2 1) is being rewritten as (get x_plus_one2 1), and get returns null because the function object x_plus_one2 doesn’t have a property "1".
To resolve this, you need to adjust your IR transformation logic so that function invocations are preserved as calls rather than misinterpreted as collection accesses.
Would you like to explore how to adjust that transformation rule further?

(fn x_plus_one2 (x) (inc x))
(console.log (x_plus_one2 1))    ;; null