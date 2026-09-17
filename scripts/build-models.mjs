// Asset preparation: generate reusable, editable 3D meshes before the app consumes them.
import * as T from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mkdir, writeFile } from 'node:fs/promises';

globalThis.FileReader = class {
  async readAsArrayBuffer(blob) { this.result = await blob.arrayBuffer(); this.onloadend?.(); }
  async readAsDataURL(blob) { this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`; this.onloadend?.(); }
};
const output = new URL('../public/models/', import.meta.url);
await mkdir(output, { recursive: true });
const cream = new T.MeshPhysicalMaterial({ name: 'ivory-porcelain', color: '#fff0d5', roughness: .34, metalness: 0, clearcoat: .32, clearcoatRoughness: .30 });
const detail = new T.MeshStandardMaterial({ name: 'detail', color: '#8b6d53', roughness: .65 });
const groups = [];
function add(group, geo, x=0, y=0, z=0, rotation=null, material=cream) {
  const mesh = new T.Mesh(geo, material); mesh.position.set(x,y,z); if(rotation) mesh.rotation.set(...rotation); group.add(mesh); return mesh;
}
function sphere(group,r,x,y,z,sx=1,sy=1,sz=1,material=cream) {
  const mesh=add(group,new T.SphereGeometry(r,24,16),x,y,z,null,material); mesh.scale.set(sx,sy,sz); return mesh;
}
function lathe(group, points) {
  const curve=new T.SplineCurve(points.map(([x,y])=>new T.Vector2(x,y)));
  const ps=curve.getPoints(points.length*3).map(p=>new T.Vector2(Math.max(.001,p.x),p.y));
  return add(group,new T.LatheGeometry(ps,32));
}
function roundedLoft(group, sections) {
  // Full elliptical cross-sections replace an extruded silhouette: every
  // visible cheek and neck surface curves continuously around the piece.
  const centers=new T.CatmullRomCurve3(sections.map(([x,y])=>new T.Vector3(x,y,0)),false,'catmullrom',.35);
  const radii=new T.CatmullRomCurve3(sections.map(([, ,rx,rz])=>new T.Vector3(rx,rz,0)),false,'catmullrom',.35);
  const positions=[],uvs=[],indices=[],rings=48,sides=32;
  for(let row=0;row<=rings;row++){
    const t=row/rings,c=centers.getPoint(t),r=radii.getPoint(t);
    for(let col=0;col<=sides;col++){
      const a=col/sides*Math.PI*2;
      positions.push(c.x+Math.max(.001,r.x)*Math.cos(a),c.y,Math.max(.001,r.y)*Math.sin(a));
      uvs.push(col/sides,t);
    }
  }
  for(let row=0;row<rings;row++)for(let col=0;col<sides;col++){
    const a=row*(sides+1)+col,b=a+1,c=a+sides+1,d=c+1;
    indices.push(a,c,b,b,c,d);
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();
  // Weld the seam normals without turning any of the smooth cheeks flat.
  const normals=geo.getAttribute('normal');
  for(let row=0;row<=rings;row++){
    const a=row*(sides+1),b=a+sides;
    const n=new T.Vector3().fromBufferAttribute(normals,a).add(new T.Vector3().fromBufferAttribute(normals,b)).normalize();
    normals.setXYZ(a,n.x,n.y,n.z);normals.setXYZ(b,n.x,n.y,n.z);
  }
  return add(group,geo);
}
function base(group, size=1) {
  size*=1.08;
  // One softly turned foot and a small rounded collar, without stacked sharp rings.
  lathe(group,[[.01,.006],[.20*size,.006],[.276*size,.022],[.301*size,.062],[.298*size,.108],[.274*size,.145],[.235*size,.174],[.221*size,.207],[.234*size,.238],[.231*size,.264],[.205*size,.287]]);
}
function stem(group, top=.68, radius=.19) {
  lathe(group,[[.211,.235],[.209,.30],[.164,.373],[.115,.465],[.116,top-.115],[radius*.91,top-.062],[radius+.012,top-.030],[radius,top],[.01,top]]);
}
function unified(group) {
  group.updateMatrixWorld(true);
  const byMat=new Map();
  group.traverse(o=>{if(!o.isMesh)return; const a=byMat.get(o.material)||[]; const g=o.geometry.clone().applyMatrix4(o.matrixWorld); a.push(g.index?g.toNonIndexed():g);byMat.set(o.material,a);});
  const result=new T.Group();result.name=group.name;
  for(const [mat,geos]of byMat){const g=mergeVertices(mergeGeometries(geos));g.computeBoundingBox();g.computeBoundingSphere();const m=new T.Mesh(g,mat);m.name=`${group.name}-${mat.name}`; result.add(m);}
  return result;
}
function piece(type) {
  const g=new T.Group();g.name=type;base(g,type==='pawn'?.83:1);
  if(type==='pawn') {
    lathe(g,[[.181,.225],[.183,.273],[.137,.328],[.093,.416],[.106,.494],[.157,.533],[.159,.570],[.01,.588]]);
    sphere(g,.164,0,.703,0);
  }
  if(type==='rook') {
    lathe(g,[[.22,.255],[.22,.31],[.18,.39],[.175,.69],[.212,.747],[.251,.786],[.253,.887],[.215,.932],[.01,.932]]);
    for(let i=0;i<4;i++){const a=i*Math.PI/2;const block=add(g,new RoundedBoxGeometry(.174,.142,.174,3,.050),Math.sin(a)*.185,.947,Math.cos(a)*.185);block.rotation.y=a;}
  }
  if(type==='bishop') {
    stem(g,.81,.20);
    // Rounded teardrop mitre, with a small dark inset visible from either side.
    lathe(g,[[.001,.78],[.08,.801],[.168,.855],[.205,.930],[.178,1.017],[.116,1.111],[.041,1.218],[.007,1.253]]);
    for(const z of [-.200,.200])sphere(g,.029,0,.957,z,.70,1.12,.22,detail);
    sphere(g,.043,0,1.275,0);
  }
  if(type==='queen') {
    stem(g,.87,.22);
    lathe(g,[[.01,.85],[.19,.86],[.17,.94],[.22,1.09],[.18,1.14],[.01,1.15]]);
    for(let i=0;i<7;i++) {const a=i*Math.PI*2/7;const x=Math.sin(a),z=Math.cos(a); const tip=add(g,new T.CylinderGeometry(.038,.057,.175,20),x*.207,1.15,z*.207);tip.rotation.z=-x*.32;tip.rotation.x=z*.32;sphere(g,.055,x*.232,1.257,z*.232);}
    sphere(g,.072,0,1.18,0);
  }
  if(type==='king') {
    stem(g,.93,.24);
    lathe(g,[[.01,.91],[.21,.91],[.24,.95],[.21,1.015],[.14,1.045],[.07,1.12],[.01,1.13]]);
    add(g,new RoundedBoxGeometry(.105,.35,.10,3,.026),0,1.25,0);
    add(g,new RoundedBoxGeometry(.29,.105,.10,3,.026),0,1.29,0);
  }
  if(type==='knight') {
    lathe(g,[[.01,.25],[.225,.25],[.223,.294],[.181,.341],[.153,.384],[.01,.403]]);
    roundedLoft(g,[[.03,.325,.001,.001],[.040,.368,.183,.169],[.073,.446,.182,.183],[.107,.582,.141,.162],[.092,.734,.146,.164],[.012,.852,.239,.185],[-.070,.926,.285,.200],[-.053,1.016,.242,.185],[-.055,1.099,.146,.126],[-.057,1.141,.054,.057],[-.057,1.149,.001,.001]]);
    // A pair of soft short ears and inset eyes give a clear horse identity
    // from the oblique playing camera as well as the overhead view.
    for(const z of [-.073,.073]){
      const ear=sphere(g,.078,.008,1.142,z,.43,1.23,.65);ear.rotation.z=.21;
      sphere(g,.019,-.132,1.020,Math.sign(z)*.178,1,1.08,.44,detail);
      sphere(g,.011,-.318,.931,Math.sign(z)*.105,.9,1,.40,detail);
    }
  }
  // Keep the royal pieces legible while avoiding oversized silhouettes over
  // the next rank. The footprint is unchanged across the two material teams.
  g.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(g);
  const targetHeight={pawn:.72,rook:.90,knight:1.04,bishop:1.05,queen:1.11,king:1.16}[type];
  g.scale.y=targetHeight/(bounds.max.y-bounds.min.y);
  g.position.y=-bounds.min.y*g.scale.y;
  return unified(g);
}
const exporter=new GLTFExporter();const manifest=[];
async function save(scene,file,slot) {
  const glb=await exporter.parseAsync(scene,{binary:true,trs:true,copyright:'Original star-chess-party model assets, 2026'});
  await writeFile(new URL(file,output),Buffer.from(glb));
  let tris=0;scene.traverse(o=>{if(o.isMesh)tris+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
  manifest.push({file:`models/${file}`,slot,bytes:glb.byteLength,triangles:tris,bounds:new T.Box3().setFromObject(scene).getSize(new T.Vector3()).toArray(),source:'scripts/build-models.mjs',visualTarget:'design/approved-cloud-party.png'});
}
for(const type of ['pawn','rook','knight','bishop','queen','king']){const g=piece(type);await save(g,`${type}.glb`,`${type}: 8x8 board, ivory/navy material variant`);groups.push(g);}

const board=new T.Group();board.name='cloud-chessboard';
const frameMat=new T.MeshStandardMaterial({name:'cream-stone-frame',color:'#f4e3c9',roughness:.87});
// The surrounding stone is supplied by the approved island artwork. Keep only
// a flush narrow setting around the live squares, not a second tabletop.
add(board,new RoundedBoxGeometry(8.09,.072,8.09,3,.035),0,-.062,0,null,frameMat);
const tileMats=[new T.MeshPhysicalMaterial({name:'blue-square',color:'#8daee1',roughness:.45,metalness:0,clearcoat:.16,clearcoatRoughness:.47}),new T.MeshPhysicalMaterial({name:'ivory-square',color:'#fff0d7',roughness:.48,metalness:0,clearcoat:.14,clearcoatRoughness:.48})];
// A minute rounded edge catches light without making separate raised blocks.
const roundedTile=new RoundedBoxGeometry(.998,.070,.998,2,.031);
// Replace only the flat top with a finely sampled enamel crown. Rounded-box
// subdivision adds edge vertices but no centre vertices to its large faces.
const tileShell=new T.BufferGeometry(),shellValues={position:[],normal:[],uv:[]};
const sourceNormal=roundedTile.getAttribute('normal');
for(let i=0;i<sourceNormal.count;i+=3){
  if([0,1,2].every(n=>sourceNormal.getY(i+n)>.9999))continue;
  for(const name of Object.keys(shellValues)){
    const a=roundedTile.getAttribute(name);
    for(let n=0;n<3;n++)for(let axis=0;axis<a.itemSize;axis++)shellValues[name].push(a.array[(i+n)*a.itemSize+axis]);
  }
}
for(const name of Object.keys(shellValues))tileShell.setAttribute(name,new T.Float32BufferAttribute(shellValues[name],name==='uv'?2:3));
const tileTop=new T.PlaneGeometry(.936,.936,8,8).rotateX(-Math.PI/2);
const tilePositions=tileTop.getAttribute('position');
for(let i=0;i<tilePositions.count;i++){
  const x=tilePositions.getX(i)/.468,z=tilePositions.getZ(i)/.468;
  tilePositions.setY(i,.035+.018*(1-x*x)*(1-z*z));
}
tileTop.computeVertexNormals();
const tileGeometry=mergeGeometries([tileShell,tileTop.toNonIndexed()]);
for(let x=0;x<8;x++)for(let z=0;z<8;z++)add(board,tileGeometry,x-3.5,-.053,z-3.5,null,tileMats[(x+z+1)%2]);
await save(unified(board),'board.glb','Main interactive board. x = file - 3.5; z = 3.5 - rank. Top surface y=0.');
await writeFile(new URL('manifest.json',output),JSON.stringify({units:'one square = 1 unit',camera:'Calibrated oblique perspective, elevation capped at 48 degrees with vertical projection correction; top view height-fit.',files:manifest},null,2));
console.log(JSON.stringify(manifest.map(({file,bytes,triangles})=>({file,bytes,triangles})),null,2));
