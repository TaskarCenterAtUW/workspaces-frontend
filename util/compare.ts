export function compareStringAsc<T>(propFn: (t: T) => string): (a: T, b: T) => number {
  return (a, b) => propFn(a).localeCompare(propFn(b));
}

export function compareStringDesc<T>(propFn: (t: T) => string): (a: T, b: T) => number {
  return (a, b) => propFn(b).localeCompare(propFn(a));
}
