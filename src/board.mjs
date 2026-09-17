import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const TYPES={p:'pawn',r:'rook',n:'knight',b:'bishop',q:'queen',k:'king'};
const NAMES={p:'兵',r:'车',n:'马',b:'象',q:'后',k:'王'};
const pos=s=>new T.Vector3(s.charCodeAt(0)-100.5,0,4.5-Number(s[1]));
const square=(x,z)=>`${String.fromCharCode(97+x)}${8-z}`;
const ease=t=>1-(1-t)**3;
function ringGlowTexture(){
  const size=96,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const distance=Math.hypot((x+.5)/size-.5,(y+.5)/size-.5)*2;
    const alpha=Math.exp(-(((distance-.65)/.15)**2))*100;
    const i=(y*size+x)*4;data[i]=29;data[i+1]=236;data[i+2]=181;data[i+3]=Math.round(alpha);
  }
  const texture=new T.DataTexture(data,size,size,T.RGBAFormat);texture.colorSpace=T.SRGBColorSpace;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearFilter;texture.needsUpdate=true;return texture;
}

export class GameBoard {
  constructor(stage,{baseUrl,onSquare,onError=()=>{}}) {
    this.stage=stage;this.canvas=stage.querySelector('canvas');this.grid=stage.querySelector('#hit-grid');this.coordinates=stage.querySelector('#coordinates');
    this.onSquare=onSquare;this.onError=onError;this.baseUrl=baseUrl;this.pieces=new Map();this.templates=new Map();this.buttons=new Map();this.tweens=[];this.frame=0;this.topView=false;this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;this.disposed=false;
    this.renderer=new T.WebGLRenderer({canvas:this.canvas,antialias:true,alpha:true,powerPreference:'low-power'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.setClearColor(0,0);this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFShadowMap;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.92;
    this.scene=new T.Scene();this.camera=new T.PerspectiveCamera(34,1,.1,100);
    // A broad studio reflection makes the rounded porcelain read softly. It
    // is generated once; the board still renders only when something changes.
    const room=new RoomEnvironment(),pmrem=new T.PMREMGenerator(this.renderer);
    this.environmentTarget=pmrem.fromScene(room,.07,0.1,100);
    this.scene.environment=this.environmentTarget.texture;this.scene.environmentIntensity=.10;
    room.dispose();pmrem.dispose();
    this.scene.add(new T.HemisphereLight('#fff7e8','#b4c8e5',.32));
    // Back-left sunlight places short shadows in front of the pieces, where
    // the playing camera can see them. Front-left fill lights ivory faces
    // from the same side, preserving warm shaded right sides and undercuts.
    const sun=new T.DirectionalLight('#fff4e0',2.45);sun.position.set(-5,12,-6);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-6,right:6,top:6,bottom:-6,near:1,far:32});sun.shadow.normalBias=.006;sun.shadow.bias=-.00005;sun.shadow.radius=14;sun.shadow.intensity=.70;this.scene.add(sun);
    const fill=new T.DirectionalLight('#fff3e0',1.05);fill.position.set(-7,8,6);this.scene.add(fill);
    this.markerLayer=new T.Group();this.scene.add(this.markerLayer);
    this.geometries={tile:new T.PlaneGeometry(.97,.97),dot:new T.CircleGeometry(.155,32),ring:new T.RingGeometry(.345,.382,64),halo:new T.PlaneGeometry(1.14,1.14),capture:new T.RingGeometry(.38,.425,40)};
    this.haloTexture=ringGlowTexture();
    this.materials={selected:new T.MeshBasicMaterial({color:'#32deb6',transparent:true,opacity:.18,depthWrite:false}),dot:new T.MeshBasicMaterial({color:'#38cfae',transparent:true,opacity:.9,depthWrite:false}),ring:new T.MeshBasicMaterial({color:'#22e5b2',transparent:true,opacity:.90,depthWrite:false,toneMapped:false}),halo:new T.MeshBasicMaterial({map:this.haloTexture,transparent:true,depthWrite:false,toneMapped:false}),last:new T.MeshBasicMaterial({color:'#ffe698',transparent:true,opacity:.34,depthWrite:false}),suggested:new T.MeshBasicMaterial({color:'#fa849b',transparent:true,opacity:.82,depthWrite:false}),check:new T.MeshBasicMaterial({color:'#f27579',transparent:true,opacity:.48,depthWrite:false})};
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
      if(name==='board'){scene.traverse(o=>{if(!o.isMesh)return;o.receiveShadow=true;
        // Keep the cream men distinct from the lighter stone squares. Richer
        // blue also survives the bright sky lighting without turning grey.
        if(o.material.name==='blue-square')o.material.color.set('#7594d4');
        if(o.material.name==='ivory-square')o.material.color.set('#fff0da');
        o.material.roughness=.34;
        if('clearcoat'in o.material){o.material.clearcoat=.26;o.material.clearcoatRoughness=.30;}
      });this.scene.add(scene);continue;}
      for(const color of ['w','b']){
        const template=scene.clone(true);template.traverse(o=>{if(!o.isMesh)return;o.material=o.material.clone();o.material.color.set(color==='b'?(o.material.name==='detail'?'#122840':'#244366'):(o.material.name==='detail'?'#8e7350':'#ffe8c7'));o.material.roughness=.31;if('clearcoat'in o.material){o.material.clearcoat=.28;o.material.clearcoatRoughness=.27;}o.castShadow=true;o.receiveShadow=true;});
        if(color==='w')template.traverse(o=>{if(!o.isMesh)return;o.material.envMapIntensity=2.3;o.material.roughness=.27;o.material.emissive.set('#ffe4b5');o.material.emissiveIntensity=.09;});
        template.scale.setScalar(.92);this.templates.set(`${color}${name}`,template);
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
    if(selection.selected){mark(selection.selected,'tile','selected',.021);mark(selection.selected,'halo','halo',.025);mark(selection.selected,'ring','ring',.027);}
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
    // Calibrate the live plane to the approved scene. A fit-to-canvas camera
    // creates a second, conflicting perspective over the painted stone slab.
    const portrait=width/height<=1.2,tablet=portrait&&width>700;
    let quad=tablet?[[.17,.31],[.826,.31],[.911,.60],[.078,.60]]
      :portrait?[[.109,.311],[.892,.311],[.973,.660],[.028,.660]]
      :[[.281,.160],[.689,.160],[.738,.792],[.232,.792]];
    let points=quad.map(([x,y])=>({x:x*width,y:y*height}));
    if(!portrait){
      const scale=Math.max(width/1660,height/948),dx=(width-1660*scale)/2,dy=(height-948*scale)/2;
      points=quad.map(([x,y])=>({x:x*1660*scale+dx,y:y*948*scale+dy}));
    }
    let topWidth=points[1].x-points[0].x,bottomWidth=points[2].x-points[3].x;
    let boardHeight=points[3].y-points[0].y,topY=points[0].y;
    const centerX=points.reduce((sum,p)=>sum+p.x,0)/4;
    if(this.topView){
      const centerY=topY+boardHeight/2;
      bottomWidth=Math.min(bottomWidth,height*(portrait?.48:.76));
      topWidth=bottomWidth*.978;boardHeight=(topWidth+bottomWidth)/2*.997;
      topY=centerY-boardHeight/2;
    }
    // The trapezoid determines elevation, perspective strength and focal length.
    const targetSine=Math.min(.997,2*boardHeight/(topWidth+bottomWidth));
    // The reference uses an illustrated oblique camera: keep the near pieces
    // readable while the projected floor retains its measured portrait shape.
    const sine=this.topView?targetSine:Math.min(targetSine,Math.sin(48*Math.PI/180));
    const verticalScale=targetSine/sine;
    const cosine=Math.sqrt(1-sine*sine),ratio=(bottomWidth-topWidth)/(bottomWidth+topWidth);
    const distance=4*cosine/Math.max(.005,ratio),focal=bottomWidth*(distance-4*cosine)/8;
    const principalY=topY+verticalScale*focal*4*sine/(distance+4*cosine);
    this.camera.fov=2*Math.atan(height/(2*focal))*180/Math.PI;
    this.camera.far=Math.max(100,distance+30);
    this.camera.position.set(0,distance*sine,distance*cosine);this.camera.lookAt(0,0,0);
    this.camera.updateProjectionMatrix();
    this.camera.projectionMatrix.elements[5]*=verticalScale;
    this.camera.projectionMatrix.elements[8]=1-2*centerX/width;
    this.camera.projectionMatrix.elements[9]=2*principalY/height-1;
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.camera.updateMatrixWorld();
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
  dispose(){this.disposed=true;cancelAnimationFrame(this.frame);this.finishAnimations();this.observer.disconnect();this.haloTexture?.dispose();this.environmentTarget?.dispose();this.renderer.dispose();}
}
