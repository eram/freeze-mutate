/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable @typescript-eslint/interface-name-prefix */
/* eslint-disable @typescript-eslint/no-explicit-any */

// I use IndexSig to convert any to a workable type
interface IndexSig {
  [key: string]: any;
}

function copyVal<T>(param: T): T {
  if (typeof param !== "object") {
    return param;
  }

  let rc: any;

  if (param === null) {
    rc = null;
  } else if (param instanceof Array) {
    rc = [];
    const ref = { me: rc };
    mergeDeep(ref, param);
  } else if (param instanceof String) {
    // tslint:disable-next-line:no-construct
    rc = new String(param.valueOf());
  } else if (param instanceof Number) {
    // tslint:disable-next-line:no-construct
    rc = new Number(param.valueOf());
  } else if (param instanceof Boolean) {
    // tslint:disable-next-line:no-construct
    rc = new Boolean(param.valueOf());
  } else if (param instanceof Date) {
    rc = new Date(param.valueOf());
  } else {
    // Object
    const ref = { me: createObj(param) };
    mergeDeep(ref, param);
    rc = ref.me;
  }

  if (Object.isFrozen(param)) freeze(rc, false);
  return rc as T;
}

function isObject(value: any): boolean {
  return value !== null && typeof value === "object";
}

function mergeArrays<T>(dst: T[], src: T[]): void {
  src.forEach((val, key /*, me*/) => {
    // skip a value that is undefined to allow growing an array
    if (val !== undefined) {
      dst[key] = copyDeep(dst[key], val);

      if (isObject(val) && Object.isFrozen(val)) {
        freeze(dst[key], false);
      }
    }
  });
}

function mergeSets<T>(dst: Set<T>, src: Set<T>): void {
  src.forEach((val /*, key, me*/) => {
    // we canot really merge things here...
    const param = copyVal(val);
    dst.add(param);
    if (isObject(val) && Object.isFrozen(val)) {
      freeze(param, false);
    }
  });
}

function mergeMaps<K, V>(dst: Map<K, V>, src: Map<K, V>): void {
  src.forEach((val, key /*, me*/) => {
    let param: V;
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

const cycleDetector = new Set<Record<string, any>>();

function mergeDeep<T>(ref: { me: T }, changeSet?: Partial<T>): void {
  if (!ref || !isObject(ref)) return;

  if (isObject(ref.me) && Object.isFrozen(ref.me)) {
    console.error("mergeDeep: dst object is frozen");
    return;
  }

  let me = ref.me as IndexSig;
  do {
    if (!isObject(changeSet)) {
      (me as T) = changeSet as T;
      break;
    }

    if (cycleDetector.has(changeSet as Record<string, any>)) {
      // this object was already merged
      (me as T) = changeSet as T;
      break;
    }

    cycleDetector.add(changeSet as Record<string, any>);

    // if IfreezeMutate.merge is implemented call it
    if (typeof me.merge === "function" && changeSet !== undefined) {
      me = (me as IFreezeMutate<T>).merge(changeSet);
      break;
    } else if (
      typeof (me as any)[Symbol.iterator] === "function" &&
      typeof (changeSet as any)[Symbol.iterator] === "function"
    ) {
      // if both src and dst are arrays we merge the arrays. same for set and map.
      if (me instanceof Array && changeSet instanceof Array) {
        mergeArrays(me, changeSet);
        break;
      }

      if (me instanceof Set && changeSet instanceof Set) {
        mergeSets(me, changeSet);
        break;
      }

      if (me instanceof Map && changeSet instanceof Map) {
        mergeMaps(me, changeSet);
        break;
      }

      // FALLTHROUGH
    }

    // deep-copy properties from src object into dst
    // if the src property is frozen the resulting propery should be frozen as well.
    // do not override a value with an undefined
    // if the proprty key is an integer we keep the propery as a number
    const s = changeSet as IndexSig;
    Object.keys(s).forEach((key: string) => {
      const prop = s[key];
      const toFreeze = typeof prop === "object" && me[key] !== undefined && Object.isFrozen(me[key]);

      if (typeof prop !== "function" && prop !== undefined) {
        // if the keys are numerical keep them as such
        const intKey = parseInt(key, 10);
        if (isNaN(intKey)) {
          // tslint:disable-next-line:no-unsafe-any
          me[key] = copyDeep(me[key], prop);
        } else {
          // tslint:disable-next-line:no-unsafe-any
          me[intKey] = copyDeep(me[intKey], prop);
        }

        if (toFreeze) {
          freeze(me[key], false);
        }
      }
    });
  } while (0);

  ref.me = me as T;
}

function createObj<T>(obj: T): T {
  let rc: any;

  if (!isObject(obj)) {
    rc = null;
  } else if (obj instanceof Array) {
    rc = [];
  } else if (typeof (obj as any).constructor === "function") {
    rc = new ((obj as any).constructor as { new (): T })();
  } else {
    rc = Object.create(obj as Record<string, any>);
  }

  return rc as T;
}

const primitiveWrappers = [Date, Number, String, Boolean];

function copyDeep<T>(first: T, second?: Partial<T>): T {
  const firstIsObject = isObject(first);
  const toFreeze = firstIsObject && Object.isFrozen(first);
  let rc: any;

  // primitives and primitive-wrappers we override (copy-over)
  // other objects need deep-copying
  if (!firstIsObject || primitiveWrappers.indexOf((first as any).constructor as any) >= 0) {
    rc = copyVal(second);
  } else {
    // dont call copyParam here so that rc is not frozen and can be merged.
    // create a new object here and copy the frozen first into it
    // then copy the second ontop.
    const rcRef = { me: createObj(first) };
    mergeDeep(rcRef, first);
    mergeDeep(rcRef, second);
    rc = rcRef.me;
  }

  if (toFreeze) {
    freeze(rc, false);
  }

  return rc as T;
}

function neverFunc(nop: any): any {
  const msg = "Immutable object cannot be changed";
  if (process.env.NODE_ENV !== "production") {
    throw Error(msg);
  } else {
    console.error(msg);
  }
  // tslint:disable-next-line:no-unused-expression
  nop;
}

const arrConcat = function <T>(this: T[], ...items: (any | ConcatArray<T>)[]): T[] {
  const rc: T[] = [];

  // tslint:disable-next-line:no-invalid-this
  this.forEach((val) => {
    rc.push(copyVal(val));
  });
  items.forEach((arr) => {
    if (arr instanceof Array) {
      arr.forEach((val: T) => {
        rc.push(copyVal(val));
      });
    } else {
      rc.push(copyVal(arr as T));
    }
  });
  return rc;
};

function knownTypesFreezer<T>(obj: T): boolean {
  let iteratable = false;

  // clear the "set" functions of the iteratable objects
  const me = obj as IndexSig;

  if (obj instanceof Set) {
    ["delete", "add", "clear"].forEach((fn) => {
      me[fn] = neverFunc;
    });
    iteratable = true;
  } else if (obj instanceof Map) {
    ["set", "delete", "clear"].forEach((fn) => {
      me[fn] = neverFunc;
    });
    iteratable = true;
  } else if (obj instanceof Array) {
    ["copyWithin", "fill", "join", "push", "unshift", "pop", "reverse"].forEach((fn) => {
      me[fn] = neverFunc;
    });
    me.concat = arrConcat; // special case: the array is not changed and a new array is returned
    iteratable = true;
  } else if (obj instanceof Date) {
    const funcs = [
      "setDate",
      "setFullYear",
      "setHours",
      "setMilliseconds",
      "setMinutes",
      "setMonth",
      "setSeconds",
      "setTime",
      "setFullYear",
      "setUTCDate",
      "setUTCFullYear",
    ];
    funcs.forEach((fn) => {
      me[fn] = neverFunc;
    });
  }

  return iteratable;
}

// flies", blobs and react elements are immutable objects
function isKnownImmutable(obj: any): boolean {
  // https://github.com/facebook/react/blob/v15.0.1/src/isomorphic/classic/element/ReactElement.js#L21
  const REACT_ELEMENT_TYPE = typeof Symbol === "function" && Symbol.for && Symbol.for("react.element");
  const REACT_ELEMENT_TYPE_FALLBACK = 0xeac7;

  return (
    (obj as IndexSig).$$typeof === REACT_ELEMENT_TYPE_FALLBACK ||
    (obj as IndexSig).$$typeof === REACT_ELEMENT_TYPE ||
    (typeof File === "function" && obj instanceof File) ||
    (typeof Blob === "function" && obj instanceof Blob) ||
    (typeof Error === "function" && obj instanceof Error)
  );
}

function freeze<T>(me: T, deep = true): Readonly<T> {
  if (!isObject(me) || isKnownImmutable(me) || Object.isFrozen(me)) {
    return me;
  }

  const obj = me as IndexSig;

  // call IFreezeMutate.freeze() if it exists
  if (typeof obj.freeze === "function") {
    (obj as IFreezeMutate<T>).freeze();
  } else {
    const iteratable = knownTypesFreezer(obj);

    Object.freeze(obj);

    if (deep && iteratable) {
      for (const prop of obj as any) {
        if (typeof prop === "object") {
          freeze(prop);
        }
      }
    }

    if (deep && !iteratable) {
      Object.keys(obj)
        .filter((key) => typeof obj[key] === "object")
        .forEach((key: string) => {
          freeze(obj[key]);
        });
    }
  }

  Object.setPrototypeOf = neverFunc as any;
  return obj as Readonly<T>;
}

function mutate<T>(me: T, changeSet?: Partial<T | undefined>): Readonly<T> {
  const rc = copyDeep(me, changeSet);
  cycleDetector.clear();
  return rc;
}

// Interface for CTor and class that implements the above
// methods: ctor(), freeze() and mutate();
interface IFreezeMutateCtor<T> {
  new (src?: Partial<T>): T;
}

interface IFreezeMutate<T> {
  freeze(): void;
  merge(changeSet: Partial<T>): Readonly<T>;
}

export { freeze, mutate, mergeDeep, IFreezeMutate, IFreezeMutateCtor };
