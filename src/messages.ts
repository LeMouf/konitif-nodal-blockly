import type * as Blockly from 'blockly/core';
const leases = new WeakMap<object, { count: number; added: Record<string,string> }>();
/** Blockly owns a shared message table. Fill only missing defaults on mount and restore our additions on last release. */
export function acquireBlocklyMessages(api: typeof Blockly, defaults: Record<string,string>): () => void {
  let lease=leases.get(api.Msg);
  if(!lease){
    const added:Record<string,string>={};
    for(const [key,value] of Object.entries(defaults)) if(typeof value==='string' && !(key in api.Msg)){ api.Msg[key]=value;added[key]=value; }
    lease={count:0,added};leases.set(api.Msg,lease);
  }
  lease.count++;let released=false;
  return()=>{
    if(released)return;released=true;
    if(--lease.count!==0)return;
    for(const [key,value] of Object.entries(lease.added)) if(api.Msg[key]===value)delete api.Msg[key];
    leases.delete(api.Msg);
  };
}
