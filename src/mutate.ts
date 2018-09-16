// tslint:disable:no-any

// I use IndexSig to convert any to a workable type
interface IndexSig { [key: string]: any; }

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
    } else { // Object
        const ref = { me: createObj(param) };
        mergeDeep(ref, param);
        rc = ref.me;
    }

    if (Object.isFrozen(param)) freeze(rc, false);
    return rc as T;
}

function isObject(value: any): boolean {
    return (value !== null && typeof value === "object");
}


function mergeArrays<T>(dst: T[], src: T[]): void {

    src.forEach((val, key/*, me*/) => {
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

    src.forEach((val/*, key, me*/) => {

        // we canot really merge things here...
        const param = copyVal(val);
        dst.add(param);
        if (isObject(val) && Object.isFrozen(val)) {
            freeze(param, false);
        }
    });
}

function mergeMaps<K, V>(dst: Map<K, V>, src: Map<K, V>): void {

    src.forEach((val, key/*, me*/) => {

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

const cycleDetector = new Set<Object>();

function mergeDeep<T>(ref: { me: T }, changeSet?: Partial<T>): void {

    if (!ref || !isObject(ref)) return;

    if (isObject(ref.me) && Object.isFrozen(ref.me)) {
        console.error("mergeDeep: dst object is frozen");
        return;
    }

    let me = ref.me as IndexSig;
    do {

        if (!isObject(changeSet)) {
            (<T>me) = <T>changeSet;
            break;
        }

        if (cycleDetector.has(<Object>changeSet)) {
            // this object was already merged
            (<T>me) = <T>changeSet;
            break;
        }

        cycleDetector.add(<Object>changeSet);

        // if IfreezeMutate.merge is implemented call it 
        if (typeof me.merge === "function" && changeSet !== undefined) {
            me = (<IFreezeMutate<T>>me).merge(changeSet);
            break;

        } else if (typeof (<any>me)[Symbol.iterator] === "function"
            && typeof (<any>changeSet)[Symbol.iterator] === "function") {

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
            const toFreeze = (typeof prop === "object" && me[key] !== undefined && Object.isFrozen(me[key]));

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
    } else if ((obj instanceof Array)) {
        rc = [];
    } else if (typeof obj.constructor === "function") {
        rc = new (obj.constructor as { new(): T })();
    } else {
        rc = Object.create(obj as Object);
    }

    return rc as T;
}

const primitiveWrappers = [Date, Number, String, Boolean];

function copyDeep<T>(first: T, second?: Partial<T>): T {

    const firstIsObject = isObject(first);
    const toFreeze = (firstIsObject && Object.isFrozen(first));
    let rc: any;

    // primitives and primitive-wrappers we override (copy-over)
    // other objects need deep-copying
    if (!firstIsObject || primitiveWrappers.indexOf(<any>first.constructor) >= 0) {
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
    throw Error("Immutable object cannot be changed");
    // tslint:disable-next-line:no-unused-expression
    (nop);
}

function freeze<T>(me: T, deep = true): Readonly<T> {

    if (!isObject(me) || Object.isFrozen(me)) return me;

    const obj = me as IndexSig;

    // call IFreezeMutate.freeze() if it exists
    if (typeof obj.freeze === "function") {
        (<IFreezeMutate<T>>obj).freeze();

    } else {

        let iteratable = false;

        // clear the "set" functions of the iteratable objects
        if (obj instanceof Set) {

            const me3 = obj as Set<1>;
            me3.delete = me3.add = neverFunc;
            me3.clear = <any>neverFunc;
            iteratable = true;

        } else if (obj instanceof Map) {

            const me3 = obj as Map<1, 1>;
            me3.set = me3.delete = neverFunc;
            me3.clear = <any>neverFunc;
            iteratable = true;

        } else if (obj instanceof Array) {
            const me3 = obj as 1[];
            me3.copyWithin = me3.concat = me3.fill = me3.join = me3.push = me3.unshift = neverFunc;
            me3.pop = <any>neverFunc;
            iteratable = true;
        }

        Object.freeze(obj);

        if (deep && iteratable) {
            for (const prop of <any>obj) {
                if (typeof prop === "object") {
                    freeze(prop);
                }
            }
        }

        if (deep && !iteratable) {
            Object.keys(obj)
                .filter((key) => (typeof obj[key] === "object"))
                .forEach((key: string) => {
                    freeze(obj[key]);
                });
        }
    }

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
    new(src?: Partial<T>): T;
}

interface IFreezeMutate<T> {
    freeze(): void;
    merge(changeSet: Partial<T>): Readonly<T>;
}


export { freeze, mutate, mergeDeep, IFreezeMutate, IFreezeMutateCtor };

