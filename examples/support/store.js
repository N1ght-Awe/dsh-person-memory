// Demonstration adapter only. Not a replacement for the host's MemoryStore.
// It writes ONLY the explicitly supplied fixture file. No production discovery.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { keyOf } from '../../src/identity-memory.js';
export class DemoStore {
  constructor(file) {
    this.file = file;
    this.value = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { buckets: {} };
  }
  flush() { fs.writeFileSync(this.file, JSON.stringify(this.value)); }
  bucketOf(cwd) { return this.value.buckets[keyOf(cwd)] || null; }
  entryOf(cwd, id) { return this.bucketOf(cwd)?.entries.find(e => e.id === id) || null; }
  add(cwd, input, origin, sessionId) {
    const bucket = this.value.buckets[keyOf(cwd)] ||= { cwd, enabled: true, entries: [] };
    const at = new Date().toISOString();
    const entry = { ...input, id: randomUUID(), revision: 1, updatedAt: at,
      source: { origin, sessionId, ownerId: input.sourceOwner, personaId: input.sourcePersona },
      tags: input.tags || [], pinned: false };
    bucket.entries.push(entry);
    this.flush();
    return { entry };
  }
  update(cwd, id, patch) {
    const entry = this.entryOf(cwd, id);
    if (!entry) throw Error('missing fixture entry');
    Object.assign(entry, patch, { revision: entry.revision + 1, updatedAt: new Date().toISOString() });
    this.flush();
    return { entry };
  }
  remove(cwd, ids) {
    const bucket = this.bucketOf(cwd);
    const removed = (bucket?.entries || []).filter(e => ids.includes(e.id) && !e.locked).map(e => e.id);
    if (bucket) bucket.entries = bucket.entries.filter(e => !removed.includes(e.id));
    this.flush();
    return { removed };
  }
}
export class DemoVectors {
  constructor() { this.dropped = []; this.dirty = false; }
  drop(cwd, ids) { this.dropped.push(...ids); this.dirty = true; }
  flush() { this.dirty = false; }
  recordOf() { return null; }
  setShallow() {}
  setDeep() {}
}

