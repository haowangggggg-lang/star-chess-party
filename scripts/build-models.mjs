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
const cream = new T.MeshPhysicalMaterial({ name: 'ivory-porcelain', color: '#fff1d2', roughness: .31, metalness: .02, clearcoat: .25, clearcoatRoughness: .42 });
const detail = new T.MeshStandardMaterial({ name: 'detail', color: '#88684d', roughness: .55 });
const groups = [];
function add(group, geo, x=0, y=0, z=0, rotation=null, material=cream) {
  const mesh = new T.Mesh(geo, material); mesh.position.set(x,y,z); if(rotation) mesh.rotation.set(...rotation); group.add(mesh); return mesh;
}
function sphere(group,r,x,y,z,sx=1,sy=1,sz=1,material=cream) {
  const mesh=add(group,new T.SphereGeometry(r,16,10),x,y,z,null,material); mesh.scale.set(sx,sy,sz); return mesh;
}
function lathe(group, points) {
  const curve=new T.SplineCurve(points.map(([x,y])=>new T.Vector2(x,y)));
  const ps=curve.getPoints(points.length*2).map(p=>new T.Vector2(Math.max(.001,p.x),p.y));
  return add(group,new T.LatheGeometry(ps,24));
}
function base(group, size=1) {
  lathe(group,[[.01,0],[.27*size,0],[.31*size,.035],[.32*size,.09],[.30*size,.14],[.26*size,.18],[.25*size,.22],[.29*size,.25],[.29*size,.28],[.24*size,.31]]);
}
function stem(group, top=.68, radius=.19) {
  lathe(group,[[.23,.26],[.23,.33],[.18,.39],[.12,.49],[.12,top-.10],[radius,top-.055],[radius+.025,top-.025],[radius,top],[.01,top]]);
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
    lathe(g,[[.20,.23],[.20,.28],[.15,.32],[.095,.43],[.10,.50],[.17,.53],[.17,.58],[.01,.60]]);
    sphere(g,.177,0,.705,0);
  }
  if(type==='rook') {
    lathe(g,[[.24,.29],[.23,.35],[.19,.40],[.18,.72],[.24,.75],[.27,.80],[.27,.91],[.22,.95],[.01,.95]]);
    for(let i=0;i<6;i++){const a=i*Math.PI/3;const block=add(g,new RoundedBoxGeometry(.145,.15,.15,2,.025),Math.sin(a)*.22,.98,Math.cos(a)*.22);block.rotation.y=a;}
  }
  if(type==='bishop') {
    stem(g,.81,.20);
    // The cut-out in the mitre is part of the mesh silhouette.
    const s=new T.Shape();s.moveTo(-.02,.81);s.bezierCurveTo(-.34,.90,-.18,1.08,.00,1.25);s.bezierCurveTo(.04,1.22,.10,1.18,.13,1.13);s.lineTo(-.055,1.00);s.lineTo(-.012,.95);s.lineTo(.165,1.075);s.bezierCurveTo(.28,.93,.15,.83,-.02,.81);
    const geo=new T.ExtrudeGeometry(s,{depth:.20,bevelEnabled:true,bevelThickness:.055,bevelSize:.042,bevelSegments:3,steps:1,curveSegments:12});geo.translate(0,0,-.10);add(g,geo);
    sphere(g,.055,.003,1.28,0);
  }
  if(type==='queen') {
    stem(g,.87,.22);
    lathe(g,[[.01,.85],[.19,.86],[.17,.94],[.22,1.09],[.18,1.14],[.01,1.15]]);
    for(let i=0;i<7;i++) {const a=i*Math.PI*2/7;const x=Math.sin(a),z=Math.cos(a); const tip=add(g,new T.CylinderGeometry(.038,.06,.19,12),x*.207,1.16,z*.207);tip.rotation.z=-x*.32;tip.rotation.x=z*.32;sphere(g,.059,x*.235,1.27,z*.235);}
    sphere(g,.072,0,1.18,0);
  }
  if(type==='king') {
    stem(g,.93,.24);
    lathe(g,[[.01,.91],[.21,.91],[.24,.95],[.21,1.015],[.14,1.045],[.07,1.12],[.01,1.13]]);
    add(g,new RoundedBoxGeometry(.105,.35,.10,3,.026),0,1.25,0);
    add(g,new RoundedBoxGeometry(.29,.105,.10,3,.026),0,1.29,0);
  }
  if(type==='knight') {
    lathe(g,[[.01,.27],[.24,.27],[.24,.31],[.19,.36],[.16,.40],[.01,.42]]);
    const s=new T.Shape();
    s.moveTo(-.20,.36);s.bezierCurveTo(-.14,.51,-.22,.63,-.10,.78);
    s.bezierCurveTo(-.04,.83,-.015,.88,-.04,.93);
    s.bezierCurveTo(-.16,.88,-.29,.83,-.36,.88);
    s.bezierCurveTo(-.42,.91,-.43,1.00,-.36,1.06);
    s.lineTo(-.23,1.16);s.lineTo(-.10,1.24);s.lineTo(-.11,1.40);
    s.bezierCurveTo(-.01,1.42,.02,1.27,.07,1.24);
    s.bezierCurveTo(.30,1.08,.31,.92,.28,.73);
    s.bezierCurveTo(.24,.55,.28,.45,.25,.36);s.closePath();
    const geo=new T.ExtrudeGeometry(s,{depth:.20,bevelEnabled:true,bevelThickness:.085,bevelSize:.055,bevelSegments:3,curveSegments:12,steps:1});geo.translate(0,0,-.10);add(g,geo);
    // Small recessed-looking eyes and muzzle detail, not a painted silhouette.
    for(const z of [-.185,.185])sphere(g,.021,-.18,1.085,z,1,1,.5,detail);
    sphere(g,.016,-.36,.99,.168,1,1,.5,detail);
  }
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
const frameMat=new T.MeshStandardMaterial({name:'cream-stone-frame',color:'#ecdbc0',roughness:.62});
const frame=add(board,new RoundedBoxGeometry(9.05,.28,9.05,3,.13),0,-.18,0,null,frameMat);
const tileMats=[new T.MeshStandardMaterial({name:'blue-square',color:'#90abd3',roughness:.65}),new T.MeshStandardMaterial({name:'ivory-square',color:'#fff0d8',roughness:.69})];
for(let x=0;x<8;x++)for(let z=0;z<8;z++)add(board,new T.BoxGeometry(.996,.036,.996),x-3.5,-.025,z-3.5,null,tileMats[(x+z+1)%2]);
await save(unified(board),'board.glb','Main interactive board. x = file - 3.5; z = 3.5 - rank. Top surface y=0.');
await writeFile(new URL('manifest.json',output),JSON.stringify({units:'one square = 1 unit',camera:'Perspective: desktop 50 degrees, phone 58 degrees, top view 86 degrees',files:manifest},null,2));
console.log(JSON.stringify(manifest.map(({file,bytes,triangles})=>({file,bytes,triangles})),null,2));
