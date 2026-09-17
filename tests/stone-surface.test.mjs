import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import calibration from '../design/stone-calibration.json' with { type: 'json' };
import { fitStoneSurface } from '../src/stone-surface.mjs';

test('stone measurements stay tied to the exact shipped artwork',async()=>{
  for(const [file,surface] of Object.entries(calibration.surfaces)){
    const bytes=await readFile(new URL(`../public/art/${file}`,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),surface.sha256,`${file}: remeasure the stone after changing artwork`);
  }
});

test('cover uses the actual 1659px image and preserves the CSS crop origin',()=>{
  const s=calibration.surfaces['cloud-stage-wide-v2.webp'];
  const actual=fitStoneSurface(s,{width:1112,height:639});
  const scale=639/948,dx=(1112-1659*scale)/2;
  for(let i=0;i<4;i++){
    assert.ok(Math.abs(actual[i].x-(s.corners[i][0]*scale+dx))<1e-9);
    assert.ok(Math.abs(actual[i].y-s.corners[i][1]*scale)<1e-9);
  }
});

test('portrait fill maps each source independently, including very tall phones',()=>{
  for(const [name,w,h]of [['cloud-stage-tall-v2.webp',320,844],['cloud-stage-tall.webp',768,1024]]){
    const s=calibration.surfaces[name],actual=fitStoneSurface(s,{width:w,height:h,fit:'fill',position:'50% 45%'});
    for(let i=0;i<4;i++){
      assert.ok(Math.abs(actual[i].x-s.corners[i][0]/s.width*w)<1e-9);
      assert.ok(Math.abs(actual[i].y-s.corners[i][1]/s.height*h)<1e-9);
    }
  }
});
