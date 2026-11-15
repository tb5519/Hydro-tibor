const { isDeepStrictEqual } = require('node:util');

// Unit-test storage only. It implements the small Mongo filter/update surface
// used by the lesson model; separate MongoMemoryServer tests remain authoritative
// for real Mongo indexes, wire behavior and TTL expiry.
const copy = (value) => structuredClone(value);
const valuesEqual = (actual, expected) => Array.isArray(actual) && !Array.isArray(expected)
    ? actual.some((item) => isDeepStrictEqual(item, expected)) : isDeepStrictEqual(actual, expected);
function matches(document, query = {}) {
    return Object.entries(query).every(([field, expected]) => {
        if (field === '$or') return expected.some((part) => matches(document, part));
        if (field === '$and') return expected.every((part) => matches(document, part));
        const actual = document[field];
        if (expected && typeof expected === 'object' && !(expected instanceof Date) && !Array.isArray(expected)) {
            return Object.entries(expected).every(([operator, value]) => {
                if (operator === '$in') return value.some((entry) => valuesEqual(actual, entry));
                if (operator === '$ne') return !valuesEqual(actual, value);
                if (operator === '$gt') return actual !== undefined && actual > value;
                if (operator === '$gte') return actual !== undefined && actual >= value;
                if (operator === '$lt') return actual !== undefined && actual < value;
                if (operator === '$lte') return actual !== undefined && actual <= value;
                if (operator === '$exists') return (actual !== undefined) === value;
                throw new Error(`Unsupported memory filter ${operator}`);
            });
        }
        return valuesEqual(actual, expected);
    });
}
function applyUpdate(original, update, inserted = false) {
    const next = copy(original);
    if (inserted && update.$setOnInsert) Object.assign(next, copy(update.$setOnInsert));
    if (update.$set) Object.assign(next, copy(update.$set));
    if (update.$unset) for (const key of Object.keys(update.$unset)) delete next[key];
    if (update.$max) for (const [key, value] of Object.entries(update.$max)) if (next[key] === undefined || next[key] < value) next[key] = copy(value);
    if (update.$inc) for (const [key, value] of Object.entries(update.$inc)) {
        if (typeof value !== 'number' || (next[key] !== undefined && typeof next[key] !== 'number')) throw new Error(`Invalid memory increment ${key}`);
        next[key] = (next[key] ?? 0) + value;
    }
    for (const operator of Object.keys(update)) {
        if (!['$set', '$unset', '$setOnInsert', '$max', '$inc'].includes(operator)) throw new Error(`Unsupported memory update ${operator}`);
    }
    return next;
}
function duplicate() { return Object.assign(new Error('Duplicate _id'), { code: 11000 }); }

class MemoryCollection {
    constructor() { this.documents = new Map(); this.counter = 0; }
    async createIndexes() { return []; }
    async insertOne(document) {
        const next = copy(document); next._id ??= `fixture-${++this.counter}`;
        if (this.documents.has(next._id)) throw duplicate();
        this.documents.set(next._id, next); return { acknowledged: true, insertedId: next._id };
    }
    async insertMany(documents) {
        const insertedIds = {};
        for (let index = 0; index < documents.length; index++) insertedIds[index] = (await this.insertOne(documents[index])).insertedId;
        return { acknowledged: true, insertedCount: documents.length, insertedIds };
    }
    async findOne(query = {}) { return copy([...this.documents.values()].find((document) => matches(document, query)) || null); }
    find(query = {}) {
        let result = [...this.documents.values()].filter((document) => matches(document, query));
        const cursor = {
            sort(specification) {
                result.sort((left, right) => {
                    for (const [key, direction] of Object.entries(specification)) {
                        if (left[key] > right[key]) return direction;
                        if (left[key] < right[key]) return -direction;
                    }
                    return 0;
                }); return cursor;
            },
            limit(count) { result = result.slice(0, count); return cursor; },
            async toArray() { return copy(result); },
        };
        return cursor;
    }
    async countDocuments(query = {}) { return [...this.documents.values()].filter((document) => matches(document, query)).length; }
    async distinct(field, query = {}) {
        const values = [];
        for (const document of this.documents.values()) {
            if (!matches(document, query) || document[field] === undefined) continue;
            for (const value of Array.isArray(document[field]) ? document[field] : [document[field]]) {
                if (!values.some(entry => isDeepStrictEqual(entry, value))) values.push(copy(value));
            }
        }
        return values;
    }
    async findOneAndUpdate(query, update, options = {}) {
        const old = [...this.documents.values()].find((document) => matches(document, query));
        if (old) {
            const next = applyUpdate(old, update); this.documents.set(old._id, next);
            return copy(options.returnDocument === 'after' ? next : old);
        }
        if (!options.upsert) return null;
        const base = Object.fromEntries(Object.entries(query).filter(([key, value]) => !key.startsWith('$')
            && (!value || typeof value !== 'object' || value instanceof Date)));
        const next = applyUpdate(base, update, true); next._id ??= `fixture-${++this.counter}`;
        if (this.documents.has(next._id)) throw duplicate();
        this.documents.set(next._id, next);
        return options.returnDocument === 'after' ? copy(next) : null;
    }
    async updateOne(query, update, options = {}) {
        const old = [...this.documents.values()].find((document) => matches(document, query));
        if (old) {
            const next = applyUpdate(old, update); this.documents.set(old._id, next);
            return { matchedCount: 1, modifiedCount: Number(!isDeepStrictEqual(old, next)) };
        }
        if (options.upsert) {
            const inserted = await this.findOneAndUpdate(query, update, { ...options, returnDocument: 'after' });
            return { matchedCount: 0, modifiedCount: 0, upsertedId: inserted._id };
        }
        return { matchedCount: 0, modifiedCount: 0 };
    }
    async deleteOne(query) {
        const document = [...this.documents.values()].find((item) => matches(item, query));
        if (document) this.documents.delete(document._id);
        return { deletedCount: document ? 1 : 0 };
    }
    async deleteMany(query = {}) {
        let deletedCount = 0;
        for (const [id, document] of this.documents) if (matches(document, query)) { this.documents.delete(id); deletedCount++; }
        return { deletedCount };
    }
}

function makeStore() {
    const collections = new Map();
    return { collection(name) {
        if (!collections.has(name)) collections.set(name, new MemoryCollection());
        return collections.get(name);
    } };
}
module.exports = { makeStore, matches };
