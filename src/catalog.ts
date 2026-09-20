import type { BlocklyNodeContribution } from './contracts.js';

/** Host-scoped; import never registers global contributions. Empty by construction. */
export class BlocklyContributionCatalog {
  private entries = new Map<string, readonly BlocklyNodeContribution[]>();
  private listeners = new Set<() => void>();
  private disposed = false;
  list(): readonly BlocklyNodeContribution[] {
    return structuredClone([...this.entries.values()].flat());
  }
  register(owner: string, contributions: readonly BlocklyNodeContribution[]): () => void {
    if (this.disposed) throw new Error('catalog-disposed');
    if (!owner.trim() || this.entries.has(owner)) throw new Error('duplicate-owner');
    const all = [...this.list(), ...contributions];
    if (new Set(all.map(c => c.id)).size !== all.length) throw new Error('duplicate-contribution');
    if (new Set(all.map(c => `${c.dialectId}\0${c.nodeType}`)).size !== all.length) throw new Error('duplicate-node-projection');
    for (const c of contributions) {
      if (!c.id || !c.nodeType || !c.dialectId) throw new Error('invalid-contribution');
      if (new Set(c.fields?.map(f => f.configKey)).size !== (c.fields?.length ?? 0)) throw new Error('duplicate-field');
    }
    const lease = structuredClone(contributions);
    this.entries.set(owner, lease);
    this.notify();
    return () => {
      if (this.entries.get(owner) !== lease) return;
      this.entries.delete(owner);
      this.notify();
    };
  }
  subscribe(listener: () => void): () => void {
    if (this.disposed) throw new Error('catalog-disposed');
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.entries.clear();
    this.notify();
    this.listeners.clear();
  }
  private notify(): void { for (const listener of [...this.listeners]) listener(); }
}
