/* eslint-disable @typescript-eslint/interface-name-prefix */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { mutate, freeze, mergeDeep, IFreezeMutate, IFreezeMutateCtor } from "./mutate";

it("jest is working", () => {
  expect(1).toBe(1);
});

interface IndexSig {
  [key: string]: any;
}

describe("primitive objects", () => {
  it("native object", () => {
    const a = 0;
    const a1 = freeze(a);
    const a2 = mutate(a1, 2 as any);

    expect(Object.isFrozen(a1)).toBe(true);
    expect(Object.isFrozen(a2)).toBe(true);
    expect(a2).toBe(2);
  });

  it("freeze array", () => {
    const arr = [0, 1, 2];
    const arr1 = freeze(arr);
    expect(arr1).toEqual(arr);
    expect(Object.isFrozen(arr1)).toBe(true);

    expect(() => {
      (arr1 as any)[1] = 111;
    }).toThrow();
  });

  it("mutate frozen array", () => {
    const arr = [0, 1, 2];
    const arr1 = freeze(arr);
    const arr2 = mutate(arr1, [undefined, 111, undefined, 333]);

    expect(JSON.stringify(arr2)).toEqual("[0,111,2,333]");
    expect(Object.isFrozen(arr2)).toBe(true);

    expect(() => {
      (arr2 as any)[1] = 1111;
    }).toThrow();

    expect(() => {
      (arr2 as any).push(1111);
    }).toThrow();
  });

  it("add elements to frozen array", () => {
    const arr = [0, 1, 2];
    const arr1 = freeze(arr);
    const arr2 = mutate(arr1, [...(arr1 as any), 333]);

    expect(JSON.stringify(arr2)).toEqual("[0,1,2,333]");
    expect(Object.isFrozen(arr2)).toBe(true);

    expect(() => {
      (arr2 as any)[1] = 1111;
    }).toThrow();
  });

  it("mutate prop that is array", () => {
    const arr1 = freeze({ arr: [0, 1, 2] });

    expect(JSON.stringify(arr1)).toEqual('{"arr":[0,1,2]}');
    expect(Object.isFrozen(arr1)).toBe(true);

    const arr2 = mutate(arr1, { arr: [undefined, 111, undefined, 333] as any });

    expect(JSON.stringify(arr2)).toEqual('{"arr":[0,111,2,333]}');
    expect(Object.isFrozen(arr2)).toBe(true);

    expect(() => {
      arr2.arr[1] = 1111;
    }).toThrow();
  });

  it("array concat object deep", () => {
    const obj0 = {},
      obj1 = {},
      obj2 = {},
      obj3 = {};
    let arr = freeze([obj0, obj1, obj2]);

    expect(Object.isFrozen(arr[1])).toBeTruthy();
    expect(() => {
      (arr as any).push({});
    }).toThrow();
    expect(() => {
      (obj0 as any).param = 0;
    }).toThrow();

    arr = arr.concat(obj3);
    expect(arr).toStrictEqual([obj0, obj1, obj2, obj3]);

    // if we called out overwritten concat than objects should have been copied.
    (obj3 as any).param = 0;
    expect(arr[3]).not.toStrictEqual(obj3);
    delete (obj3 as any).param;

    expect(Object.isFrozen(arr)).toBeFalsy();
    expect(Object.isFrozen(arr[1])).toBeTruthy(); // obj1 was frozen before the concat
  });

  it("array concat array deep", () => {
    const obj0 = {},
      obj1 = {},
      obj2 = {},
      obj3 = {},
      obj4 = {},
      obj5 = {};
    let arr = freeze([obj0, obj1, obj2]);

    arr = arr.concat([obj3, obj4]);
    expect(arr).toStrictEqual([obj0, obj1, obj2, obj3, obj4]);

    // did we copy obj4 ?
    (obj4 as any).param = 0;
    expect(arr[4]).not.toStrictEqual(obj4);
    delete (obj4 as any).param;

    expect(Object.isFrozen(arr[4])).toBeFalsy(); // obj4 was not frozen before the concat
    expect(() => {
      (arr as any).push(obj5);
    }).not.toThrow();
  });

  it("Date is frozen", () => {
    const d1 = freeze(new Date(0));

    expect(Object.isFrozen(d1)).toBeTruthy();
    expect(() => {
      d1.setHours(1);
    }).toThrow();
  });
});

describe("class object", () => {
  class Todo implements IFreezeMutate<Todo> {
    private static autoId = 0;
    id: number = ++Todo.autoId;
    created = new Date();
    done = false;

    // IFreezeMutateCtor
    private static ctor: IFreezeMutateCtor<Todo> = Todo;
    constructor(todo?: Partial<Todo>) {
      if (todo && Todo.ctor) {
        Object.keys(todo).forEach((key) => {
          const t = todo as IndexSig;
          const me = this as IndexSig;
          if (me[key] !== undefined) me[key] = t[key];
        });
      }
      // dont freeze in ctor! ctor is called as part of mutation.
    }

    // IfreezeMutate.freeze
    freeze(): void {
      Object.freeze(this);
      Object.freeze(this.created);
    }

    // IfreezeMutate.merge
    merge(todo: Partial<Todo>): Readonly<Todo> {
      const t = todo;
      const todo2 = new Todo({
        id: t.id !== undefined ? t.id : this.id,
        created: t.created !== undefined ? t.created : this.created,
        done: t.done !== undefined ? t.done : this.done,
      });

      // dont freeze in merge. the function is called multiple times during mutate().
      return todo2;
    }

    // func overload - to make sure this is passing tru the mutattion
    toString(): string {
      return `${this.id}: ${this.done ? "done" : "todo"}`;
    }
  }

  it("instance and props are immutable", () => {
    const todo1 = new Todo({ done: true });
    console.dir(todo1);
    console.log(todo1.toString());

    // freeze with default freezer function
    (todo1 as any).freeze = undefined;
    freeze(todo1);

    expect(todo1 instanceof Todo).toBeTruthy();
    expect(Object.isFrozen(todo1)).toBeTruthy();
    expect(() => {
      todo1.id = 111;
    }).toThrow();
    expect(Object.isFrozen(todo1.created)).toBeTruthy();
    expect(() => {
      todo1.created = new Date(0);
    }).toThrow();
  });

  it("class instance mutation", () => {
    const todo1 = new Todo({ done: true });

    // run with the default merge function
    let todo3 = new Todo(todo1);
    (todo3 as any).merge = undefined;
    todo3.freeze();

    todo3 = mutate(todo3, { id: 2, created: new Date(0) });

    expect(todo3 instanceof Todo).toBeTruthy();
    expect(todo3.created).toBeInstanceOf(Date);

    expect(Object.isFrozen(todo3)).toBeTruthy();
    expect(Object.isFrozen(todo3.created)).toBeTruthy();
    expect(() => {
      (todo3 as any).created = new Date("2000-01-01T00:00Z");
    }).toThrow();

    expect(todo3.toString()).toBe("2: done");
  });

  it("IfreezeMutate.freeze is called", () => {
    const todo1 = new Todo({ done: true });

    // make sure IfreezeMutate.freeze is called
    (todo1 as any).freeze = jest.fn(() => {
      /* */
    });
    freeze(todo1);
    expect(todo1.freeze).toHaveBeenCalled();
  });

  it("IfreezeMutate.merge is called", () => {
    const todo1 = new Todo({ done: true });

    // make sure IfreezeMutate.merge is called
    // tslint:disable-next-line:no-unsafe-any
    (Todo.prototype.merge as any) = jest.fn((p) => p);
    todo1.freeze();

    mutate(todo1, { id: 2, created: new Date(0) });
    expect(Todo.prototype.merge).toHaveBeenCalled();
  });
});

describe("pojo mutations", () => {
  it("instance and props are immutable", () => {
    const obj1 = freeze({
      all: "your bases",
      are: { belong: "to them" },
      arr: ["base1", "base2", "base3"],
    });
    console.log(JSON.stringify(obj1));
    expect(JSON.stringify(obj1)).toEqual(
      '{"all":"your bases","are":{"belong":"to them"},"arr":["base1","base2","base3"]}',
    );
    expect(Object.isFrozen(obj1)).toBeTruthy();
    expect(Object.isFrozen(obj1.are)).toBeTruthy();
    expect(() => {
      obj1.are.belong = "to us";
    }).toThrow();
  });

  it("class instance mutation", () => {
    let obj2 = freeze({
      all: "your bases",
      are: { belong: "to them" },
      arr: ["base1", "base2", "base3"],
    });
    obj2 = mutate(obj2, { are: { belong: "to us" } });
    // tslint:disable-next-line:no-sparse-arrays
    obj2 = mutate(obj2, { arr: [, , , "base4"] as any });
    console.log(JSON.stringify(obj2));
    expect(JSON.stringify(obj2)).toEqual(
      '{"all":"your bases","are":{"belong":"to us"},"arr":["base1","base2","base3","base4"]}',
    );
    expect(Object.isFrozen(obj2)).toBeTruthy();
    expect(Object.isFrozen(obj2.are)).toBeTruthy();
  });
});

describe("Set and Map", () => {
  // examples from immutablejs website

  it("freeze and mutaue a Map", () => {
    const map1 = new Map<string, number>([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
    const map2 = map1.set("b", 2);
    expect(map1).toEqual(map2);
    expect(map1).toStrictEqual(map2);

    freeze(map2);

    expect(() => {
      map2.set("c", 33);
    }).toThrow();
    expect(map1).toStrictEqual(map2);
    expect(map2.get("c")).toEqual(3);
    expect(map2.size).toEqual(3);

    const map3 = mutate(
      map2,
      new Map([
        ["c", 33],
        ["d", 4],
      ]),
    );

    expect(() => {
      map3.set("z", 22);
    }).toThrow();
    expect(map3.get("c")).toEqual(33);

    expect(map2.size).toEqual(3);
    expect(map3.size).toEqual(4);
  });

  it("freeze and mutate an object with an extended Set", () => {
    class MySet extends Set {
      constructor(arr: string[]) {
        super(arr);

        this.toString = (): string => {
          let rc = "<MySet>{";
          this.forEach((a) => {
            rc += `${a},`;
          });
          rc = `${rc.substr(0, rc.length - 1)}}`;
          return rc;
        };
      }
    }

    const o1 = { set: new MySet(["a", "b", "c"]) };
    const set2 = o1.set.add("b");
    expect(o1.set).toStrictEqual(set2);

    freeze(o1);

    expect(() => {
      o1.set.add("z");
    }).toThrow();
    expect(o1.set).toStrictEqual(set2);
    expect(o1.set.has("c")).toBeTruthy();
    expect(o1.set.size).toEqual(3);

    const o3 = mutate(o1, { set: new MySet(["c", "d"]) });

    expect(() => {
      o3.set.add("z");
    }).toThrow();
    expect(o3.set.has("c")).toBeTruthy();

    expect(o1.set.size).toEqual(3);
    expect(o3.set.size).toEqual(4);
    expect(o3.set.toString()).toEqual("<MySet>{a,b,c,d}");
  });
});

describe("cyclic object", () => {
  it("should freeze ok", () => {
    interface IObjA {
      b: IObjB[];
    }
    interface IObjB {
      a: IObjA[];
    }

    const a: IObjA = { b: [] };
    const b: IObjB = { a: [a, a] };
    a.b.push(b, b);

    freeze(a);

    expect(Object.isFrozen(b)).toBeTruthy();
    expect(() => {
      a.b[0].a = [a];
    }).toThrow();
    expect(() => {
      b.a[1].b[1].a[1].b = [b];
    }).toThrow();
  });

  it("should mutate 1", () => {
    class MapN extends Map<number, IObj> {
      constructor(p?: []) {
        super(p);
      }
    }
    interface IObj {
      m: MapN;
    }

    const a: IObj = { m: new MapN() };
    a.m.set(1, a);
    freeze(a);

    expect(() => {
      a.m.set(4, a);
    }).toThrow();

    let itr = a.m.get(1);
    for (let i = 0; itr && i < 4; i++) {
      itr = itr.m.get(1);
    }

    expect(itr).not.toBeUndefined();

    const b: IObj = { m: new Map<number, IObj>([[2, a]]) };
    const c = mutate(itr, b);
    expect(c && c.m.get(2) === a).toBeTruthy();
  });
});

describe("edge cases behaviour", () => {
  it("numberical properties", () => {
    let a = freeze({ 1: "y1", 2: "y2" });
    a = mutate(a, { 2: "yy22" });

    expect(a).toStrictEqual({ 1: "y1", 2: "yy22" });
    expect(a[2]).toEqual("yy22");

    expect(() => {
      (a as any)["3"] = "3";
    }).toThrow();

    a = mutate(a, { prop: "3" } as any);
    expect((a as any).prop).toEqual("3");
  });

  it("frozen object cannot be assigned", () => {
    const dstRef = { me: freeze({ c: 3 }) };
    const src = { c: 333 };
    mergeDeep(dstRef, src); // this should console-err
    expect(JSON.stringify(dstRef.me)).toEqual('{"c":3}');
  });

  it("frozen prop can be assigned", () => {
    const dst = { a: Number(5), b: Object.freeze({ c: 3 }) };
    const src = { a: Number(7), b: { c: 333 } };
    const dstRef = { me: dst };
    mergeDeep(dstRef, src);
    expect(JSON.stringify(dst)).toEqual('{"a":7,"b":{"c":333}}');
    expect(Object.isFrozen(dst.b)).toBeTruthy();
  });

  it("number over an object", () => {
    const a = mutate({}, { a: Number(2) });
    expect(JSON.stringify(a)).toEqual('{"a":2}');
  });

  it("null object", () => {
    let a = 0;
    a = mutate(a, null as any);
    expect(JSON.stringify(a)).toEqual("null");

    let b = { a: 0 };
    b = mutate(b, null as any);
    expect(JSON.stringify(b)).toEqual("null");
  });

  it("odd types", () => {
    // tslint:disable-next-line:no-construct
    const a = freeze({
      date: new Date(1),
      num: new Number(1),
      str: new String("1"),
      bool: new Boolean(true),
      dontcare1: {},
      dontcare2: 2,
    });
    expect(a.date instanceof Date).toBeTruthy();
    expect(JSON.stringify(a)).toEqual(
      '{"date":"1970-01-01T00:00:00.001Z","num":1,"str":"1","bool":true,"dontcare1":{},"dontcare2":2}',
    );
    expect(a.num instanceof Number).toBeTruthy();
    expect(a.str instanceof String).toBeTruthy();
    expect(a.bool instanceof Boolean).toBeTruthy();

    // tslint:disable-next-line:no-construct
    const b = mutate(a, {
      date: new Date(0),
      num: new Number(0),
      str: new String("0"),
      bool: new Boolean(false),
    });
    expect(b.date instanceof Date).toBeTruthy();
    expect(b.num instanceof Number).toBeTruthy();
    expect(b.str instanceof String).toBeTruthy();
    expect(b.bool instanceof Boolean).toBeTruthy();
    expect(JSON.stringify(b)).toEqual(
      '{"date":"1970-01-01T00:00:00.000Z","num":0,"str":"0","bool":false,"dontcare1":{},"dontcare2":2}',
    );
  });
});
