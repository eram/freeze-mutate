[![Build Status](https://travis-ci.org/eram/freeze-mutate.svg?branch=master)](https://travis-ci.org/eram/freeze-mutate)
<img src="https://forthebadge.com/images/badges/winter-is-coming.svg" 
alt="be prepared!" height="20"/>  [![npm package](https://badge.fury.io/js/freeze-mutate.png)](https://www.npmjs.com/package/freeze-mutate)

# Freeze-Mutate - A KISS immutable utility library for JS and TS.

Welcome!
I was looking for a nice little module that would help me get my DTOs immutable. The libraries I found were either an overkill (immutable.js), lacking support for deep merging of objects during mutations, or they were making my code ugly with lots of function calls for each change. So that's how freeze-mutate came to life: a Javascript/Typescript-based npm module that helps me keep things simple and neat.
* **Freeze** any object and it becomes **immutable**: all its properties and child-objects in the process. This is done using Javascript native Object.freeze.
* **Mutate** a frozen object with a **change-set** and you get a new frozen object that is a merge, or an overlay,  of the the change-set on top of the original object. Again, this is a deep-merge that also works with **Arrays**, **Sets**, **Maps**, and your own custom **classes**. For the brave: you can provide custom freeze and merge functions.
* Using **Typescript** you get all the goodies of **generics**, enforcing the validity of the change-set, **Readonly** returned types and interfaces for the custom functions.

Enough talking. Let's see some action…

## Deep-freezing and merging of objects during mutation:

```javascript
const { mutate, freeze } = require("freeze-mutate");
const assert = console.assert;

// freeze and mutate a pojo with a couple of child objects and a child array
const obj1 = freeze({ 
    all: "your bases", 
    are: { belong: "to them" }, 
    arr: ["base1"] });

try {
    obj1.are.belong = "to us";
} catch(e) {
    // we are frozen!
}

// 2 mutations with different chanage sets...
var obj2 = mutate(obj1, { are: { belong: "to us" } });
obj2 = mutate(obj2, { arr: [, "base2"] });

assert( JSON.stringify(obj2) === JSON.stringify({
    all:"your bases",
    are:{belong:"to us"},
    arr:["base1","base2"]}) );
assert( Object.isFrozen(obj2.arr) );
```
## Support for Set and Map and class objects
(aka you might want to skip immutable.js)

```javascript
// freeze and mutate an object with an extended Set

class MySet extends Set {
    constructor(arr) {
        super(arr);
        this.toString = () => {
            var rc = "<MySet>{";
            this.forEach(a => { rc += `${a},`; });
            rc = `${rc.substr(0, rc.length - 1)}}`;
            return rc;
        };
    }
}

const o1 = { set: new MySet(["a", "b", "c"]) };
const set2 = o1.set.add("b");

assert( o1.set === set2 );

// time to freeze and mutate with a change-set
freeze(o1);
try { 
    // functions that enable mutation of the Set/Map/Array are now throwing. 
    o1.set.add("z"); 
} catch (e){
    // we're good!
}

const o3 = mutate(o1, { set: new MySet(["c", "d"]) });

assert( o3.set.has("c") );
assert( o1.set.size < o3.set.size );
assert( o3.set.toString() === "<MySet>{a,b,c,d}" );
```
## Support for cyclic objects 

```javascript
// freeze and mutate a cyclic pojo
const a = { a: undefined };
a.a = a;
freeze(a);

assert( a.a.a.a !== undefined );
assert( Object.isFrozen(a.a.a) );

const b = mutate(a, { b: a });
assert( b.b.a !== undefined );
assert( b.a.a === a );
assert( Object.isFrozen(b.a) );
```
## An even more interesting cyclic object...

```javascript
// a complex cyclic inside a Map

const m1 = { map: new Map() };
m1.map.set(1, m1);
freeze(m1);

let itr = m1.map.get(1);
for (let i = 0; (itr) && (i < 4); i++, itr = itr.map.get(1));

assert( itr !== undefined );
assert( Object.isFrozen(itr) );

const m2 = { map: new Map([[2, m1]]) };
const m3 = mutate(itr, m2);

assert( m3 && m3.map.get(2) === m1 );
assert( Object.isFrozen(m3.map) );
```
## For **Typescript** we have here some more goodies!

```typescript
import { mutate, freeze, IFreezeMutate, IFreezeMutateCtor } from "freeze-mutate";

class Todo implements IFreezeMutate<Todo> {

    private static autoId = 0;
    id: number = ++Todo.autoId;
    created = new Date();
    done: boolean = false;

    // IFreezeMutateCtor - constructor interface 
    // the object is 'new'ed on mutation to create the un-frozen empty object that is 
    // then returen from the mutation. 
    // the ctor enforces the change-set to be a valid subset of the existing properties.
    
    private static ctor: IFreezeMutateCtor<Todo> = Todo;
    constructor(todo?: Partial<Todo>) {
        if (todo && Todo.ctor) {
            Object.keys(todo).forEach(key => {
                const t = todo as any;
                const me = this as any;
                if (me[key] !== undefined) me[key] = t[key];
            });
        }
        // don't freeze in ctor! ctor is called as part of mutation.
    }

    // IfreezeMutate.freeze - interface
    // the function is called during freeze()
    // 'this' object and all object properties should be frozen in the function.
    freeze(): void {
        Object.freeze(this);
        Object.freeze(this.created);
    }

    // IfreezeMutate.merge - interface 
    // the function is called 2-3 times during mutate() to construct the returned object.
    merge(todo: Partial<Todo>): Readonly<Todo> {

        const todo2 = new Todo({
            id: (todo.id !== undefined) ? todo.id : this.id,
            created: (todo.created !== undefined) ? new Date(todo.created.valueOf()) : this.created,
            done: (todo.done !== undefined) ? todo.done : this.done
        });

        // don't freeze in merge!
        return todo2;
    }

    // just a function overload to see it's working too
    toString(): string {
        return `${this.id}: ${this.done ? "done" : "todo"}`;
    }
}

// note that you absolutely don't _have to_ extened and implement these interfaces. 
// it works just fine in most cases using just freeze and merge!
// let's see a usage example:

const todo1 = freeze(new Todo({ done: true }));

// you can mutate any existing prop using a change-set. 
// TS will complain if you try to add a new prop or change a prop's type!
const todo2 = mutate(todo1, { id: 2, created: new Date(0) });

assert( todo2 instanceof Todo );
assert( todo2.created instanceof Date );
assert( Object.isFrozen(todo2) );
try { 
    todo2.created = new Date("2000-01-01T00:00Z"); 
} catch(e) {
    // todo2 is immutable too!
}

assert( todo2.toString() === "2: done" );
```
## More features:
1. Zero dependencies and just 2 KB pkg.
1. Can be loaded in a browser.
1. Be careful with mutating large objects, arrays and Maps - this is heavy!
1. Code is fully covered with jest tests.

To get the source running locally:
```sh
> git clone https://github.com/eram/freeze-mutate.git freeze-mutate
> cd freeze-mutate
> npm install
> npm test
```
Pls open bugs and send me pull requests. You are welcome to star/clap/like/share to show me how awesome you are and help others find this lib. ;-)

Cheers!

eram
