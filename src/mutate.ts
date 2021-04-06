//
// using any and null: implementing the mutate functionality in plan JS make more sense.
// so, only the library interface functions actually use typescript. the rest is casted to 'any'.
//

/* eslint-disable no-null/no-null */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-use-before-define */

const cycleDetector = new Set<unknown>();


const neverFunc = (_nop: unknown) => { throw new Error("Immutable object cannot be changed"); };

function isObject(value: unknown): boolean {
  return (value !== null && typeof value === "object");
}


function mergeArrays<T extends any[]>(dst: T, src: T): void {
  src.forEach((val: any, idx: number) => {
    // skip a value that is undefined to allow growing an array
    if (val !== undefined) {
      dst[idx] = copyDeep(dst[idx], val);
      if (isObject(val) && Object.isFrozen(val)) {
        freeze(dst[idx], false);
      }
    }
  });
}


function mergeSets<T extends Set<T>>(dst: T, src: T): void {
  src.forEach((val) => {
    // we canot really merge things here...
    const param = copyVal(val);
    dst.add(param);
    if (isObject(val) && Object.isFrozen(val)) {
      freeze(param, false);
    }
  });
}


function mergeMaps<T extends Map<T, V>, V extends object>(dst: Map<T, V>, src: Map<T, V>): void {
  src.forEach((val, key) => {
    let param;
    const dstVal = dst.get(key);
    if (dstVal !== undefined) {
      param = copyDeep(dstVal, val);
    } else {
      param = copyVal(val);
    }

    dst.set(key, param);
    if (isObject(val) && Object.isFrozen(val)) {
      freeze(param, false);
    }
  });
}


function createObj(obj: object): object {
  let rc;

  if (isObject(obj)) {
    if ((Array.isArray(obj))) {
      rc = [];
    } else if (typeof obj.constructor === "function") {
      rc = new (obj.constructor as { new(): typeof obj })();
    } else {
      rc = Object.create(obj as object);
    }

    Object.setPrototypeOf(rc, Object.getPrototypeOf(obj));
  }

  return rc;
}


function copyDeep(first: object, second?: object): object {

  let rc;
  const firstIsObject = isObject(first);
  const toFreeze = (firstIsObject && Object.isFrozen(first));

  // primitives and primitive-wrappers we override (copy-over)
  // other objects need deep-copying
  if (!firstIsObject || [Date, Number, String, Boolean, BigInt].indexOf(Object(first).constructor) >= 0) {
    rc = copyVal(second);

  } else {
    // create a new object and copy the frozen first into it then copy the second ontop.
    // we don't call copyParam here, so that rc does not get frozen and can be merged.
    const rcRef = mergeDeep(createObj(first), first);
    rc = mergeDeep(rcRef, second);
  }

  if (toFreeze) {
    freeze(rc, false);
  }

  return rc;
}


function arrConcat(items: []): [] {
  const arr = (Array.isArray(items)) ? items : [items];
  const rc: any = [];
  this.forEach((val: any) => rc.push(copyVal(val)));
  arr.forEach((val: any) => rc.push(copyVal(val)));
  return rc;
}


function knownTypesFreezer<T extends object>(obj: T): boolean {

  let iteratable = false;
  const me = obj as any;

  // clear the mutating functions of the iteratable objects

  if (obj instanceof Set) {

    ["delete", "add", "clear"].forEach((fn) => { me[fn] = neverFunc; });
    iteratable = true;

  } else if (obj instanceof Map) {

    ["delete", "set", "clear"].forEach((fn) => { me[fn] = neverFunc; });
    iteratable = true;

  } else if (obj instanceof Array) {

    ["copyWithin", "fill", "push", "shift", "unshift", "pop", "reverse"].forEach((fn) => { me[fn] = neverFunc; });
    me.concat = arrConcat.bind(me); // special case: the array is not changed and a new array is returned
    iteratable = true;

  } else if (obj instanceof Date) {

    const funcs = ["setDate", "setFullYear", "setHours", "setMilliseconds", "setMinutes", "setMonth", "setSeconds", "setTime", "setFullYear", "setUTCDate", "setUTCFullYear"];
    funcs.forEach((fn) => { me[fn] = neverFunc; });
  }

  return iteratable;
}


// flies, errors, blobs and react elements are immutable objects
function isKnownImmutable(obj: unknown): boolean {

  // https://github.com/facebook/react/blob/v15.0.1/src/isomorphic/classic/element/ReactElement.js#L21
  const REACT_ELEMENT_TYPE = typeof Symbol === "function" && Symbol.for && Symbol.for("react.element");
  const REACT_ELEMENT_TYPE_FALLBACK = 0xEAC7;

  return (Object(obj).$$typeof === REACT_ELEMENT_TYPE_FALLBACK)
    || (Object(obj).$$typeof === REACT_ELEMENT_TYPE)
    // || obj instanceof File
    // || obj instanceof Blob
    || obj instanceof Error;
}


export function mergeDeep<T extends object>(me: T, changeSet?: Partial<T>): T {

  const dst = me as any;
  const chs = changeSet as any;

  if (!dst || (isObject(dst) && Object.isFrozen(dst)) || typeof chs === "undefined") {
    console.error("mergeDeep: dst cannot be changed");
    return dst as T;
  }

  if (!isObject(chs)) {
    return chs as T;
  }

  if (cycleDetector.has(chs)) {
    // this change was already merged
    return dst as T;
  }

  cycleDetector.add(chs);

  // if IFreezeMutate.merge is implemented call it
  if (typeof dst.merge === "function" && chs !== undefined) {
    return dst.merge(chs) as T;
  }

  if (typeof dst[Symbol.iterator] === "function"
    && typeof chs[Symbol.iterator] === "function") {

    // if both src and dst are arrays we merge the arrays. same for set and map.
    if (dst instanceof Array && chs instanceof Array) {
      mergeArrays(dst, chs);
    }

    if (dst instanceof Set && chs instanceof Set) {
      mergeSets(dst, chs);
    }

    if (dst instanceof Map && chs instanceof Map) {
      mergeMaps(dst, chs);
    }

    return dst as T;
  }

  // deep-copy properties from src object into dst
  // if the src property is frozen the resulting propery should be frozen as well.
  // do not override a value with an undefined
  // if the proprty key is an integer we keep the propery as a number
  Object.keys(chs).forEach((key: string) => {

    const prop = chs[key];
    const toFreeze = (typeof prop === "object" && dst[key] !== undefined && Object.isFrozen(dst[key]));

    if (typeof prop !== "function" && prop !== undefined) {

      // if the keys are numerical keep them as such
      const intKey = parseInt(key, 10);
      if (Number.isNaN(intKey)) {
        dst[key] = copyDeep(dst[key], prop);
      } else {
        dst[intKey] = copyDeep(dst[intKey], prop);
      }

      if (toFreeze) {
        freeze(dst[key], false);
      }
    }
  });

  return dst as T;
}


function copyVal(param: any): any {

  if (typeof param !== "object" || cycleDetector.has(param)) {
    return param;
  }

  let rc;

  if (param === null) {
    rc = null;
  } else if (Array.isArray(param)) {
    rc = mergeDeep([], param);
  } else if (param instanceof String) {
    rc = String(param.valueOf());
  } else if (param instanceof Number) {
    rc = Number(param.valueOf());
  } else if (param instanceof BigInt) {
    rc = BigInt(param.valueOf());
  } else if (param instanceof Boolean) {
    rc = Boolean(param.valueOf());
  } else if (param instanceof Date) {
    rc = new Date(param.valueOf());
  } else {
    // object
    rc = mergeDeep(createObj(param), param);
  }

  if (Object.isFrozen(param)) freeze(rc as object, false);
  return rc;
}


export function freeze<T extends object>(me: T, deep = true): Readonly<T> {

  if (!isObject(me) || isKnownImmutable(me) || Object.isFrozen(me)) {
    return me;
  }

  const obj = me as any;

  // call IFreezeMutate.freeze() if it exists
  if (typeof obj.freeze === "function") {
    obj.freeze();
  } else {
    const iteratable = knownTypesFreezer(obj);
    Object.freeze(obj);

    if (deep) {
      if (iteratable) {
        // eslint-disable-next-line no-restricted-syntax
        for (const prop of obj) {
          if (typeof prop === "object") {
            freeze(prop);
          }
        }
      } else {
        Object.keys(obj)
          .filter((key) => (typeof obj[key] === "object"))
          .forEach((key: string) => {
            freeze(obj[key]);
          });
      }
    }
  }

  return obj as Readonly<T>;
}


// take an object and a change-set on the object and return a new object that is a merge of both.
// this is done deep: merges keys, arrays, sets etc.
export function mutate<T extends object, S extends Partial<T>>(me: T, changeSet?: Partial<T | S>): T & S {
  console.assert(!cycleDetector.size);
  // cycleDetector.add(me);
  const rc = copyDeep(me, changeSet);
  cycleDetector.clear();
  return rc as Readonly<T & S>;
}

// interface for CTor and class that implements IFreezeMutate
// methods: ctor(), freeze() and mutate();
export interface IFreezeMutateCtor<T extends object> {
  new (src?: Partial<T>): IFreezeMutate<T>;
}

// interface to implement if you want to have a custom freeze and merge functions calls on your objects
// when it is mutated.
export interface IFreezeMutate<T extends object> {
  freeze(): void;
  merge(changeSet: Partial<T>): Readonly<T>;
}

// make changes inside a callback function (similar to immer/produce)
export function produce<T extends object, S extends Partial<T>>(first: T, cb: (darft: S) => void) {
  const temp = copyDeep(first);
  cb(temp as S);
  return temp as unknown as Readonly<T & S>;

}
