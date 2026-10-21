export class MobilePause {
  constructor({pad,audio,onState=()=>{},onError=()=>{}}){
    this.pad=pad;this.audio=audio;this.onState=onState;this.onError=onError;
    this.hidden=false;this.disposed=false;this.chain=Promise.resolve();
  }
  update(hidden){
    if(this.disposed)return this.chain;
    this.hidden=hidden;Atomics.store(this.pad,4,1);this.onState(true);
    this.chain=this.chain.catch(()=>{}).then(async()=>{
      if(this.disposed)return;
      if(this.hidden){await this.audio.suspend();return;}
      await this.audio.resume();
      if(!this.disposed&&!this.hidden){Atomics.store(this.pad,4,0);Atomics.notify(this.pad,4);this.onState(false);}
    }).catch(error=>{if(!this.disposed)this.onError(error);});
    return this.chain;
  }
  dispose(){this.disposed=true;Atomics.store(this.pad,4,0);Atomics.notify(this.pad,4);}
}
