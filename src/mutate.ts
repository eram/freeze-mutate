import { S_IFREG } from "constants";

// tslint:disable:no-any

function copyVal<T>(param: T): T {

    if (typeof param !== "object") {
        return param;
    }

    let rc: any;

    if (param === null) {
        rc = null;
    } else if (param instanceof Array) {
        rc = [];
        const ref = { byRef: rc };
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
        const ref = { byRef: createObj(param) };
        mergeDeep(ref, param);
        rc = ref.byRef;
    }

    if (Object.isFrozen(param)) freeze(rc, false);
    return rc;
}

function isObject(value: any): boolean {
    return (value !== null && typeof value === 'object');
}


function mergeArrays<T>(dst: T[], src: T[]): void {
    src.forEach((val, key/*, me*/) => {
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

function mergeDeep<T>(dst: { byRef: T }, src?: Partial<T>): void {

    do {
        if (!dst || !isObject(dst)) break;

        if (isObject(dst.byRef) && Object.isFrozen(dst.byRef)) {
            console.error("mergeDeep: dst object is frozen");
            break;
        };

        if (!isObject(src)) {
            dst.byRef = <T>src;
            break;
        }

        if (cycleDetector.has(<Object>src)) {
            // this object was already merged
            dst.byRef = <T>src;
            break;
        }
        cycleDetector.add(<Object>src);

        // IfreezeMutate.merge
        if (typeof (<any>dst.byRef).merge === "function") {
            dst.byRef = (<any>dst.byRef).merge(src);
            break;
        }

        // if both src and dst are arrays we have a special case: we merge the
        // arrays by their indexes instead of by their key names.
        // do not override a value with an undefined
        // copy into existing src indexes and push the rest
        // typeof me[Symbol.iterator] === "function"

        else if (typeof (<any>dst.byRef)[Symbol.iterator] === "function" && typeof (<any>src)[Symbol.iterator] === "function") {

            if (dst.byRef instanceof Array && src instanceof Array) {
                mergeArrays(dst.byRef, src);
                break;
            }

            if (dst.byRef instanceof Set && src instanceof Set) {
                mergeSets(dst.byRef, src);
                break;
            }

            if (dst.byRef instanceof Map && src instanceof Map) {
                mergeMaps(dst.byRef, src);
                break;
            }

            // FALLTHROUGH
        }

        // deep-copy properties from src object into dst
        // if the src property is frozen the resulting propery should be frozen as well.
        // do not override a value with an undefined
        // if the proprty key is an integer we keep the propery as a number

        Object.keys(<{}>src).forEach((key: string) => {
            const prop = (<any>src)[key];
            const toFreeze = (typeof prop === "object" && (<any>dst)[key] !== undefined && Object.isFrozen((<any>dst)[key]));

            if (typeof prop !== "function" && prop !== undefined) {

                // if the keys are numerical keep them as such
                const intKey = parseInt(key);
                if (isNaN(intKey)) {
                    (<any>(dst.byRef))[key] = copyDeep((<any>(dst.byRef))[key], prop);
                } else {
                    (<any>(dst.byRef))[intKey] = copyDeep((<any>(dst.byRef))[intKey], prop);
                }

                if (toFreeze) {
                    freeze((<any>(dst.byRef))[key], false);
                }
            }
        });

    } while (0);

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
        rc = Object.create(Object.getPrototypeOf(obj));
    }

    return rc;
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
        const rcRef = { byRef: createObj(first) };
        mergeDeep(rcRef, first);
        mergeDeep(rcRef, second);
        rc = rcRef.byRef;
    }

    if (toFreeze) {
        freeze(rc, false);
    }

    return rc as T;
}

const neverFunc = (_p: any) => { throw ("Immutable object cannot be changed"); };

function freeze<T>(me: T, deep = true): Readonly<T> {

    if (isObject(me)) {

        // call IFreezeMutate.freeze() if it exists
        if (typeof (<any>me).freeze === "function") {
            return (<any>me).freeze();

        } else if (!Object.isFrozen(me)) {

            if (typeof (<any>me)[Symbol.iterator] === "function") {

                // clear the "set" functions of the objects
                if (me instanceof Set || me instanceof Map) {
                    if (typeof (<any>me).set === "function") (<any>me).set = neverFunc;
                    if (typeof (<any>me).clear === "function") (<any>me).clear = neverFunc;
                    if (typeof (<any>me).delete === "function") (<any>me).delete = neverFunc;
                    if (typeof (<any>me).add === "function") (<any>me).add = neverFunc;
                }
                else if (me instanceof Array) {
                    if (typeof (<any>me).copyWithin === "function") (<any>me).copyWithin = neverFunc;
                    if (typeof (<any>me).concat === "function") (<any>me).concat = neverFunc;
                    if (typeof (<any>me).fill === "function") (<any>me).fill = neverFunc;
                    if (typeof (<any>me).join === "function") (<any>me).join = neverFunc;
                    if (typeof (<any>me).pop === "function") (<any>me).pop = neverFunc;
                    if (typeof (<any>me).push === "function") (<any>me).push = neverFunc;
                    if (typeof (<any>me).unshift === "function") (<Array<T>>me).unshift = neverFunc;
                }

                Object.freeze(me);

                if (deep) for (const prop of <any>me) {
                    if (typeof prop === "object") {
                        freeze(prop);
                    }
                }

            } else {

                Object.freeze(me);

                if (deep) Object.keys(me).forEach((key: string) => {
                    const prop = (<any>me)[key];
                    if (typeof prop === "object") {
                        freeze(prop);
                    }
                });
            }

        }
    }
    return me;
}


function mutate<T>(first: T, second?: Partial<T | undefined>): Readonly<T> {
    const rc = copyDeep(first, second);
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
    merge(src: Partial<T>): Readonly<T>;
}


export { freeze, mutate, mergeDeep, IFreezeMutate, IFreezeMutateCtor };

