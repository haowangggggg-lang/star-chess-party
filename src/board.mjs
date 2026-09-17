import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const TYPES={p:'pawn',r:'rook',n:'knight',b:'bishop',q:'queen',k:'king'};
const NAMES={p:'兵',r:'车',n:'马',b:'象',q:'后',k:'王'};
const pos=s=>new T.Vector3(s.charCodeAt(0)-100.5,0,4.5-Number(s[1]));
const square=(x,z)=>`${String.fromCharCode(97+x)}${8-z}`;
const ease=t=>1-(1-t)**3;

export class GameBoard {
  constructor(stage,{baseUrl,onSquare,onError=()=>{}}) {
    this.stage=stage;this.canvas=stage.querySelector('canvas');this.grid=stage.querySelector('#hit-grid');this.coordinates=stage.querySelector('#coordinates');
    this.onSquare=onSquare;this.onError=onError;this.baseUrl=baseUrl;this.pieces=new Map();this.templates=new Map();this.buttons=new Map();this.tweens=[];this.frame=0;this.topView=false;this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;this.disposed=false;
    this.renderer=new T.WebGLRenderer({canvas:this.canvas,antialias:true,alpha:true,powerPreference:'low-power'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.setClearColor(0,0);this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFShadowMap;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.03;
    this.scene=new T.Scene();this.camera=new T.PerspectiveCamera(34,1,.1,100);
    this.scene.add(new T.HemisphereLight('#fff9ed','#637caa',1.15));
    const sun=new T.DirectionalLight('#fff0d6',3.25);sun.position.set(-5,12,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:1,far:35});sun.shadow.normalBias=.025;sun.shadow.bias=-.00012;sun.shadow.radius=3;this.scene.add(sun);
    const fill=new T.DirectionalLight('#d7eaff',1.0);fill.position.set(5,5,-5);this.scene.add(fill);
    this.markerLayer=new T.Group();this.scene.add(this.markerLayer);
    this.geometries={tile:new T.PlaneGeometry(.97,.97),dot:new T.CircleGeometry(.105,28),ring:new T.RingGeometry(.32,.385,40),capture:new T.RingGeometry(.38,.425,40)};
    this.materials={selected:new T.MeshBasicMaterial({color:'#32deb6',transparent:true,opacity:.30,depthWrite:false}),dot:new T.MeshBasicMaterial({color:'#38cfae',transparent:true,opacity:.9,depthWrite:false}),ring:new T.MeshBasicMaterial({color:'#24e4bc',transparent:true,opacity:.95,depthWrite:false}),last:new T.MeshBasicMaterial({color:'#ffe698',transparent:true,opacity:.34,depthWrite:false}),suggested:new T.MeshBasicMaterial({color:'#fa849b',transparent:true,opacity:.82,depthWrite:false}),check:new T.MeshBasicMaterial({color:'#f27579',transparent:true,opacity:.48,depthWrite:false})};
    for(let z=0;z<8;z++)for(let x=0;x<8;x++){
      const sq=square(x,z),button=document.createElement('button');button.type='button';button.dataset.square=sq;button.className='board-cell';button.setAttribute('role','gridcell');button.setAttribute('aria-label',sq);button.tabIndex=sq==='e2'?0:-1;
      button.addEventListener('click',event=>{
        // A tall 3D piece extends visually over the square behind it. Resolve
        // physical pointer clicks against the meshes before the ground grid.
        const target=event.detail?this.pieceAt(event.clientX,event.clientY)||sq:sq;
        this.focusSquare=target;this.onSquare(target);
      });
      button.addEventListener('keydown',event=>{const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(!d)return;event.preventDefault();const a=x+d[0],b=z+d[1];if(a>=0&&a<8&&b>=0&&b<8){for(const el of this.buttons.values())el.tabIndex=-1;const next=this.buttons.get(square(a,b));next.tabIndex=0;next.focus();}});
      this.grid.append(button);this.buttons.set(sq,button);
    }
    this.canvas.addEventListener('click',event=>{const sq=this.pieceAt(event.clientX,event.clientY);if(sq)this.onSquare(sq);});
    this.labels=[];
    for(let i=0;i<8;i++)for(const [text,p]of [[String.fromCharCode(97+i),new T.Vector3(i-3.5,.01,4.27)],[String(8-i),new T.Vector3(-4.27,.01,i-3.5)]]){const label=document.createElement('span');label.textContent=text;label.className='board-coordinate';this.coordinates.append(label);this.labels.push({label,p});}
    this.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.onError(new Error('画面暂时休息了，棋局已保留。重新打开即可继续。'));});
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(stage);
    this.revision=0;this.ready=this.load();
  }
  async load() {
    const loader=new GLTFLoader();const models=await Promise.all(['board',...Object.values(TYPES)].map(async name=>({name,scene:(await loader.loadAsync(new URL(`models/${name}.glb`,this.baseUrl).href)).scene})));
    for(const {name,scene}of models){
      if(name==='board'){scene.traverse(o=>{if(o.isMesh)o.receiveShadow=true;});this.scene.add(scene);continue;}
      for(const color of ['w','b']){
        const template=scene.clone(true);template.traverse(o=>{if(!o.isMesh)return;o.material=o.material.clone();o.material.color.set(color==='b'?(o.material.name==='detail'?'#accde6':'#203d62'):(o.material.name==='detail'?'#896137':'#f3d9b0'));o.castShadow=true;o.receiveShadow=true;});
        template.scale.setScalar(.87);this.templates.set(`${color}${name}`,template);
      }
    }
    this.resize();this.invalidate();return this;
  }
  sync(board) {
    this.revision++;
    this.finishAnimations();
    for(const m of this.pieces.values())this.scene.remove(m);
    this.pieces.clear();this.boardState=board;
    for(const piece of board){const model=this.templates.get(`${piece.color}${TYPES[piece.type]}`).clone(true);model.position.copy(pos(piece.square));model.userData={...piece};if(piece.color==='b'&&piece.type==='n')model.rotation.y=Math.PI;this.scene.add(model);this.pieces.set(piece.square,model);}
    this.updateAccessible();this.invalidate();
  }
  updateAccessible() {
    for(const [sq,b]of this.buttons){const p=this.boardState?.find(p=>p.square===sq);const legal=this.selection?.legal?.includes(sq);b.setAttribute('aria-label',`${sq}${p?`，${p.color==='w'?'白':'黑'}${NAMES[p.type]}`:'，空格'}${legal?'，可到达':''}`);b.setAttribute('aria-selected',String(sq===this.selection?.selected));}
  }
  highlight(selection={}) {
    this.selection=selection;this.markerLayer.clear();
    const mark=(sq,geometry,material,y=.017)=>{if(!sq)return;const m=new T.Mesh(this.geometries[geometry],this.materials[material]);m.rotation.x=-Math.PI/2;m.position.copy(pos(sq));m.position.y=y;this.markerLayer.add(m);};
    for(const sq of selection.lastMove||[])mark(sq,'tile','last');
    mark(selection.check,'tile','check');
    if(selection.selected){mark(selection.selected,'tile','selected',.021);mark(selection.selected,'ring','ring',.027);}
    for(const sq of selection.legal||[])mark(sq,this.pieces.has(sq)?'capture':'dot','dot',.029);
    for(const sq of selection.suggested||[])mark(sq,'capture','suggested',.033);
    this.updateAccessible();this.invalidate();
  }
  async animate(move,after) {
    const revision=this.revision;
    const model=this.pieces.get(move.from);if(!model||this.reducedMotion){this.sync(after);return;}
    this.highlight({lastMove:[move.from,move.to]});
    const from=model.position.clone(),to=pos(move.to);const duration=move.piece==='n'?520:420;
    const captureSquare=move.flags?.includes('e')?`${move.to[0]}${move.from[1]}`:move.to;
    const captured=this.pieces.get(captureSquare);const initialScale=captured?.scale.x;
    let rook=null,rookFrom=null,rookTo=null;
    if(move.flags?.includes('k')||move.flags?.includes('q')){const side=move.flags.includes('k');rook=this.pieces.get(`${side?'h':'a'}${move.from[1]}`);if(rook){rookFrom=rook.position.clone();rookTo=pos(`${side?'f':'d'}${move.from[1]}`);}}
    await this.tween(duration,t=>{const e=ease(t);model.position.lerpVectors(from,to,e);model.position.y=Math.sin(Math.PI*t)*(move.piece==='n'?.60:.16);if(captured){const c=Math.max(0,(t-.40)/.60);captured.scale.setScalar(initialScale*(1-c));captured.position.y=-c*.12;}if(rook)rook.position.lerpVectors(rookFrom,rookTo,e);});
    if(revision===this.revision)this.sync(after);
  }
  tween(duration,update) {return new Promise(resolve=>{this.tweens.push({start:performance.now(),duration,update,resolve});this.invalidate();});}
  finishAnimations(){for(const t of this.tweens)t.resolve();this.tweens=[];}
  setView(topView) {this.topView=topView;this.resize();}
  resize() {
    const width=this.stage.clientWidth,height=this.stage.clientHeight;if(!width||!height)return;
    this.width=width;this.height=height;this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();
    const angle=(this.topView?86:width<500?58:50)*Math.PI/180;
    const direction=new T.Vector3(0,Math.sin(angle),Math.cos(angle));
    let distance=13;
    const fit=[];for(const x of [-4.53,4.53])for(const z of [-4.53,4.53])for(const y of [-.3,1.3])fit.push(new T.Vector3(x,y,z));
    for(let i=0;i<80;i++){
      this.camera.position.copy(direction).multiplyScalar(distance);this.camera.lookAt(0,.15,0);this.camera.updateMatrixWorld();
      const ps=fit.map(p=>p.clone().project(this.camera));
      if(ps.every(p=>Math.abs(p.x)<.985&&Math.abs(p.y)<.95))break;
      distance+=.22;
    }
    this.positionTargets();this.invalidate();
  }
  project(p){const v=p.clone().project(this.camera);return{x:(v.x+1)*this.width/2,y:(1-v.y)*this.height/2};}
  pieceAt(clientX,clientY){
    const rect=this.canvas.getBoundingClientRect();
    const pointer=new T.Vector2((clientX-rect.left)/rect.width*2-1,1-(clientY-rect.top)/rect.height*2);
    this.scene.updateMatrixWorld(true);
    const ray=new T.Raycaster();ray.setFromCamera(pointer,this.camera);
    const hit=ray.intersectObjects([...this.pieces.values()],true)[0];
    if(!hit)return null;
    let object=hit.object;
    while(object&&!object.userData.square)object=object.parent;
    return object?.userData.square||null;
  }
  positionTargets(){
    if(!this.width)return;
    for(const [sq,button]of this.buttons){
      const p=pos(sq),cs=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([x,z])=>this.project(p.clone().add(new T.Vector3(x,.01,z))));
      const left=Math.min(...cs.map(p=>p.x)),top=Math.min(...cs.map(p=>p.y)),w=Math.max(...cs.map(p=>p.x))-left,h=Math.max(...cs.map(p=>p.y))-top;
      Object.assign(button.style,{left:`${left}px`,top:`${top}px`,width:`${w}px`,height:`${h}px`,clipPath:`polygon(${cs.map(p=>`${(p.x-left)/w*100}% ${(p.y-top)/h*100}%`).join(',')})`});
    }
    for(const {label,p}of this.labels){const xy=this.project(p);label.style.left=`${xy.x}px`;label.style.top=`${xy.y}px`;}
  }
  invalidate(){if(!this.frame&&!this.disposed)this.frame=requestAnimationFrame(t=>this.draw(t));}
  draw(now){
    this.frame=0;const remaining=[];for(const t of this.tweens){const v=Math.min(1,(now-t.start)/t.duration);t.update(v);if(v===1)t.resolve();else remaining.push(t);}this.tweens=remaining;
    this.renderer.render(this.scene,this.camera);if(this.tweens.length)this.invalidate();
  }
  dispose(){this.disposed=true;cancelAnimationFrame(this.frame);this.finishAnimations();this.observer.disconnect();this.renderer.dispose();}
}
