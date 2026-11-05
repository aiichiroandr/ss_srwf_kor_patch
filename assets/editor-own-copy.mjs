// A plain-object snapshot of every own DATA property of a caller's object. It sits beside editor-own.mjs rather
// than inside it so that module keeps the export set it was published with: a browser that still caches the
// published editor-own.mjs under the current asset revision then links against every importer. Pure, no imports.

const hasOwn = Object.prototype.hasOwnProperty;

// String and symbol keys alike. Accessors are skipped without being invoked, so a getter can neither run nor answer
// differently on a later read. A null or undefined `object` throws a TypeError, as Reflect.ownKeys does.
export function ownDataCopy(object) {
  return Object.fromEntries(Reflect.ownKeys(object).flatMap((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    return descriptor !== undefined && hasOwn.call(descriptor, "value") ? [[key, descriptor.value]] : [];
  }));
}
