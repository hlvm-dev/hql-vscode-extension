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

console["log"]("Hello, " + "hql" + "!");
