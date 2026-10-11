// Own-property reading for lookup tables that a caller-controlled string indexes and for request objects that arrive
// from outside the module. A plain object answers `table["constructor"]`, `table["toString"]` and `table["__proto__"]`
// from its prototype chain, so a key such as a game id that no table lists would still find "something"; and a request
// array can be sparse or inherit entries from a polluted `Array.prototype`. Pure functions, no imports, no game data.

const hasOwn = Object.prototype.hasOwnProperty;

// The value of an own property of `table`, or undefined. A key that only the prototype chain knows is not an entry.
export function ownEntry(table, key) {
  if (table === null || table === undefined) return undefined;
  const type = typeof table;
  if (type !== "object" && type !== "function") return undefined;
  if (typeof key !== "string" && typeof key !== "number") return undefined;
  return hasOwn.call(table, key) ? table[key] : undefined;
}

// The value of an own DATA property (never an inherited one and never the result of a getter), or undefined.
export function ownData(object, key) {
  if (object === null || (typeof object !== "object" && typeof object !== "function")) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor !== undefined && hasOwn.call(descriptor, "value") ? descriptor.value : undefined;
}

// A snapshot of a request list: `{ list, problem }`. The value must be an array of at most `maximumLength` entries whose
// every index is present as an own data property. `problem` is null for a good list, otherwise
//   "not-a-list"  the value is not an array
//   "too-long"    the array is longer than `maximumLength` (checked before anything is read, so a huge sparse
//                 array costs nothing)
//   "sparse"      an index is a hole, an accessor, or would only be answered by the prototype chain
export function readDenseList(value, maximumLength = Number.MAX_SAFE_INTEGER) {
  if (!Array.isArray(value)) return { list: null, problem: "not-a-list" };
  const length = value.length;
  if (!Number.isSafeInteger(length) || length > maximumLength) return { list: null, problem: "too-long" };
  const list = new Array(length);
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (descriptor === undefined || !hasOwn.call(descriptor, "value")) return { list: null, problem: "sparse" };
    list[index] = descriptor.value;
  }
  return { list, problem: null };
}
