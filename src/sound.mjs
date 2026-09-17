export class Sound {
  constructor(){this.enabled=false;this.context=null;}
  play(kind='move'){
    if(!this.enabled)return;
    try{
      this.context??=new(window.AudioContext||window.webkitAudioContext)();void this.context.resume();
      const tones=kind==='win'?[523,659,784,1046]:kind==='check'?[440,523]:kind==='capture'?[330,660]:[587];
      tones.forEach((f,i)=>{const o=this.context.createOscillator(),g=this.context.createGain(),start=this.context.currentTime+i*.10;o.type='sine';o.frequency.setValueAtTime(f,start);o.frequency.exponentialRampToValueAtTime(f*.92,start+.14);g.gain.setValueAtTime(0,start);g.gain.linearRampToValueAtTime(.065,start+.006);g.gain.exponentialRampToValueAtTime(.0001,start+.21);o.connect(g);g.connect(this.context.destination);o.start(start);o.stop(start+.22);});
    }catch{this.enabled=false;}
  }
}
