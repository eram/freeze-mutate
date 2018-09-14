import { mutate, freeze, mergeDeep, IFreezeMutate, IFreezeMutateCtor } from "./mutate";

it("jest is working", () => {
    expect(1).toBe(1);
});

describe("primitive objects", () => {

    test("native object", () => {
        const a = 0;
        const a1 = freeze(a);
        const a2 = mutate(a1, 2 as any)

        expect(Object.isFrozen(a1)).toBe(true);
        expect(Object.isFrozen(a2)).toBe(true);
        expect(a2).toBe(2);
    });

    test("freeze array", () => {
        const arr = [0, 1, 2];
        const arr1 = freeze(arr);
        expect(arr1).toEqual(arr);
        expect(Object.isFrozen(arr1)).toBe(true);

        expect(() => {
            (<any>arr1)[1] = 111;
        }).toThrow();
    });

    test("mutate frozen array", () => {
        const arr = [0, 1, 2];
        const arr1 = freeze(arr);
        const arr2 = mutate(arr1, <any>[undefined, 111, undefined, 333]);

        expect(JSON.stringify(arr2)).toEqual("[0,111,2,333]");
        expect(Object.isFrozen(arr2)).toBe(true);

        expect(() => {
            (<any>arr2)[1] = 1111;
        }).toThrow();
    });

    test("add elements to frozen array", () => {
        const arr = [0, 1, 2];
        const arr1 = freeze(arr);
        const arr2 = mutate(arr1, [...<any>arr1, 333]);

        expect(JSON.stringify(arr2)).toEqual("[0,1,2,333]");
        expect(Object.isFrozen(arr2)).toBe(true);

        expect(() => {
            (<any>arr2)[1] = 1111;
        }).toThrow();
    });

    test("mutate prop that is array", () => {
        const arr1 = freeze({ arr: [0, 1, 2] });

        expect(JSON.stringify(arr1)).toEqual("{\"arr\":[0,1,2]}");
        expect(Object.isFrozen(arr1)).toBe(true);

        const arr2 = mutate(arr1, { arr: <any>[undefined, 111, undefined, 333] });

        expect(JSON.stringify(arr2)).toEqual("{\"arr\":[0,111,2,333]}");
        expect(Object.isFrozen(arr2)).toBe(true);

        expect(() => {
            arr2.arr[1] = 1111;
        }).toThrow();
    });

});

describe("class object", () => {

    class Todo implements IFreezeMutate<Todo> {

        private static autoId = 0;
        id: number = ++Todo.autoId;
        created = new Date();
        done: boolean = false;

        // IFreezeMutateCtor
        private static _: IFreezeMutateCtor<Todo> = Todo;
        constructor(todo?: Partial<Todo>) {
            if (todo) Object.keys(todo).forEach((key) => {
                if (this[key] !== undefined) this[key] = todo[key];
            });
            // dont freeze in ctor! ctor is called as part of mutation.
        }

        // IfreezeMutate.freeze
        freeze(): void {
            Object.freeze(this);
            Object.freeze(this.created);
        }

        // IfreezeMutate.merge
        merge(todo: Partial<Todo>): Readonly<Todo> {

            const todo2 = new Todo({
                id: (todo["id"] !== undefined) ? todo.id : this.id,
                created: (todo["created"] !== undefined) ? todo.created : this.created,
                done: (todo["done"] !== undefined) ? todo.done : this.done
            });

            // dont freeze in merge. the function is called multiple times during mutate().
            return todo2;
        }

        toString(): string {
            return `${this.id}: ${this.done ? "done" : "todo"}`;
        }
    }

    test("instance and props are immutable", () => {

        const todo1 = new Todo._({ done: true });
        console.dir(todo1);
        console.log(todo1.toString());

        // freeze with default freezer function
        (<any>todo1).freeze = undefined;
        freeze(todo1);

        expect(todo1 instanceof Todo).toBeTruthy();
        expect(Object.isFrozen(todo1)).toBeTruthy();
        expect(() => { todo1.id = 111; }).toThrow();
        expect(Object.isFrozen(todo1.created)).toBeTruthy();;
        expect(() => { todo1.created = new Date(0); }).toThrow();
    });

    test("class instance mutation", () => {

        const todo1 = new Todo({ done: true });

        // run with the default merge function
        let todo3 = new Todo(todo1);
        (<any>todo3).merge = undefined;
        todo3.freeze();

        todo3 = mutate(todo3, { id: 2, created: new Date(0) });

        expect(todo3 instanceof Todo).toBeTruthy();
        expect(todo3.created).toBeInstanceOf(Date);

        expect(Object.isFrozen(todo3)).toBeTruthy();
        expect(Object.isFrozen(todo3.created)).toBeTruthy();
        expect(() => { (<any>todo3).created = new Date("2000-01-01T00:00Z"); }).toThrow();

        expect(todo3.toString()).toBe("2: done");
    });

    test("IfreezeMutate.freeze is called", () => {

        const todo1 = new Todo({ done: true });

        // make sure IfreezeMutate.freeze is called
        (<any>todo1).freeze = jest.fn(() => { void 0; });
        freeze(todo1);
        expect(todo1.freeze).toHaveBeenCalled();
    });

    test("IfreezeMutate.merge is called", () => {

        const todo1 = new Todo({ done: true });

        // make sure IfreezeMutate.merge is called
        Todo.prototype.merge = jest.fn(p => p);
        todo1.freeze();
        let todo2 = mutate(todo1, { id: 2, created: new Date(0) });
        expect(Todo.prototype.merge).toHaveBeenCalled();
        (todo2);
    });
});


describe("pojo mutations", () => {

    test("instance and props are immutable", () => {

        const obj1 = freeze({ all: "your bases", are: { belong: "to them" }, arr: ["base1", "base2", "base3"] });
        console.log(JSON.stringify(obj1));
        expect(JSON.stringify(obj1)).toEqual("{\"all\":\"your bases\",\"are\":{\"belong\":\"to them\"},\"arr\":[\"base1\",\"base2\",\"base3\"]}");
        expect(Object.isFrozen(obj1)).toBeTruthy();
        expect(Object.isFrozen(obj1.are)).toBeTruthy();
        expect(() => { obj1.are.belong = "to us"; }).toThrow();
    });

    test("class instance mutation", () => {

        let obj2 = freeze({ all: "your bases", are: { belong: "to them" }, arr: ["base1", "base2", "base3"] });
        obj2 = mutate(obj2, { are: { belong: "to us" } });
        obj2 = mutate(obj2, { arr: <any>[, , , "base4"] });
        console.log(JSON.stringify(obj2));
        expect(JSON.stringify(obj2)).toEqual("{\"all\":\"your bases\",\"are\":{\"belong\":\"to us\"},\"arr\":[\"base1\",\"base2\",\"base3\",\"base4\"]}");
        expect(Object.isFrozen(obj2)).toBeTruthy();
        expect(Object.isFrozen(obj2.are)).toBeTruthy();
    });
});


describe("Set and Map", () => {

    // examples from immutablejs website

    test("freeze and mutaue a Map", () => {

        const map1 = new Map<string, number>([["a", 1], ["b", 2], ["c", 3]]);
        const map2 = map1.set("b", 2);
        expect(map1).toEqual(map2);
        expect(map1).toStrictEqual(map2);

        freeze(map2);

        expect(() => { map2.set("c", 33); }).toThrow();
        expect(map1).toStrictEqual(map2);
        expect(map2.get("c")).toEqual(3);
        expect(map2.size).toEqual(3);

        const map3 = mutate(map2, new Map([["c", 33], ["d", 4]]));

        expect(() => { map3.set("z", 22); }).toThrow();
        expect(map3.get("c")).toEqual(33);

        expect(map2.size).toEqual(3);
        expect(map3.size).toEqual(4);

    });

    test("freeze and mutate an object with an extended Set", () => {

        class MySet extends Set {

            constructor(arr: string[]) {
                super(arr);

                this.toString = () => {
                    let rc = "<MySet>{";
                    this.forEach(a => { rc += `${a},`; });
                    rc = rc.substr(0, rc.length - 1) + "}";
                    return rc;
                }
            }
        }

        const o1 = { set: new MySet(["a", "b", "c"]) };
        const set2 = o1.set.add("b");
        expect(o1.set).toStrictEqual(set2);

        freeze(o1);

        expect(() => { o1.set.add("z"); }).toThrow();
        expect(o1.set).toStrictEqual(set2);
        expect(o1.set.has("c")).toBeTruthy();
        expect(o1.set.size).toEqual(3);

        const o3 = mutate(o1, { set: new MySet(["c", "d"]) });

        expect(() => { o3.set.add("z"); }).toThrow();
        expect(o3.set.has("c")).toBeTruthy();

        expect(o1.set.size).toEqual(3);
        expect(o3.set.size).toEqual(4);
        expect(o3.set.toString()).toEqual("<MySet>{a,b,c,d}");
    });
});

describe("cyclic object", () => {

    test('should freeze ok', () => {
        const a = {} as any;
        const b = { a: a };
        a.b = b;

        freeze(a);
        expect(() => { a.b.a.b = {} }).toThrow();
        expect(() => { b.a.b.a = {} }).toThrow();
    });

    test("should mutate 1", () => {
        const a = {} as any;
        a.a = a;
        freeze(a);

        const c = mutate(a.a.a.a, { a: null });

        //TODO: expect(c.a).toBeNull();
        expect(() => { (<any>c).a = {}; }).toThrow();
    });

    test("should mutate 2", () => {

        var obj = {} as any;
        obj["arr"] = [obj, obj];

        obj = freeze(obj);
        expect(obj["arr"][1]["arr"][1]).toEqual(obj);

        obj = mutate(obj["arr"][1]["arr"][1], { me: obj });
        expect(() => { obj["arr"][2] = 1 }).toThrow();
        expect(obj["me"]).not.toBeUndefined();
        expect(obj["arr"][1]["me"]).toBeUndefined();

        obj = mutate(obj, <any>{ arr: [, , 1], me: obj });
        expect(obj["arr"][1]["me"]).toBeUndefined();
        expect(obj["me"]["arr"][1]).not.toBeUndefined();
        expect(obj["me"]["arr"][2]).toBeUndefined();
        expect(obj["arr"][2]).toBe(1);
    });
});


describe("edge cases behaviour", () => {

    test("numberical properties", () => {

        let a = freeze({ 1: "y1", 2: "y2" }) as any;
        a = mutate(a, { 2: "yy22" });

        expect(a).toStrictEqual({ 1: "y1", 2: "yy22" });
        expect(a[2]).toEqual("yy22");

        expect(() => { a["3"] = "3"; }).toThrow();

        a = mutate(a, <any>{ "prop": "3" });
        expect(a["prop"]).toEqual("3");
    });

    test("frozen object cannot be assigned", () => {

        const dst = Object.freeze({ c: 3 });
        const src = { c: 333 };
        const dstRef = { byRef: dst };
        mergeDeep(dstRef, src); // this should console-err
        expect(JSON.stringify(dst)).toEqual("{\"c\":3}");
    })

    test("frozen prop can be assigned", () => {

        const dst = { a: Number(5), b: Object.freeze({ c: 3 }) };
        const src = { a: Number(7), b: { c: 333 } };
        const dstRef = { byRef: dst };
        mergeDeep(dstRef, src);
        expect(JSON.stringify(dst)).toEqual("{\"a\":7,\"b\":{\"c\":333}}");
        expect(Object.isFrozen(dst.b)).toBeTruthy();
    });

    test("number over an object", () => {

        const a = mutate({}, { a: Number(2) });
        expect(JSON.stringify(a)).toEqual("{\"a\":2}");

    });

    test("null object", () => {

        let a = 0;
        a = mutate(a, <any>null);
        expect(JSON.stringify(a)).toEqual("null");

        let b = { a: 0 };
        b = mutate(b, <any>null);
        expect(JSON.stringify(b)).toEqual("null");
    });

    test("odd types", () => {

        const a = freeze({ date: new Date(1), num: new Number(1), str: new String("1"), bool: new Boolean(true), dontcare1: {}, dontcare2: 2 });
        expect(a.date instanceof Date).toBeTruthy();
        expect(JSON.stringify(a)).toEqual("{\"date\":\"1970-01-01T00:00:00.001Z\",\"num\":1,\"str\":\"1\",\"bool\":true,\"dontcare1\":{},\"dontcare2\":2}");
        expect(a.num instanceof Number).toBeTruthy();
        expect(a.str instanceof String).toBeTruthy();
        expect(a.bool instanceof Boolean).toBeTruthy();

        const b = mutate(a, { date: new Date(0), num: new Number(0), str: new String("0"), bool: new Boolean(false) })
        expect(b.date instanceof Date).toBeTruthy();
        expect(b.num instanceof Number).toBeTruthy();
        expect(b.str instanceof String).toBeTruthy();
        expect(b.bool instanceof Boolean).toBeTruthy();
        expect(JSON.stringify(b)).toEqual("{\"date\":\"1970-01-01T00:00:00.000Z\",\"num\":0,\"str\":\"0\",\"bool\":false,\"dontcare1\":{},\"dontcare2\":2}");
    });
});

