import calibration from '../design/stone-calibration.json' with { type: 'json' };

export const STONE_HALF_EXTENT=calibration.planeHalfExtent;

// Use the browser's selected <picture> asset and computed image fit, rather
// than maintaining a second set of viewport breakpoints inside the renderer.
export function stoneSurfaceInStage(image,stage) {
  const file=new URL(image.currentSrc||image.src,document.baseURI).pathname.split('/').pop();
  const surface=calibration.surfaces[file];
  if(!surface)throw new Error(`Missing stone calibration: ${file}`);
  const rect=image.getBoundingClientRect(),stageRect=stage.getBoundingClientRect();
  const style=getComputedStyle(image);
  const fitted=fitStoneSurface(surface,{
    width:rect.width,height:rect.height,fit:style.objectFit,position:style.objectPosition,
  });
  return fitted.map(({x,y})=>({x:x+rect.left-stageRect.left,y:y+rect.top-stageRect.top}));
}

export function fitStoneSurface(surface,{width,height,fit='cover',position='50% 50%'}) {
  let sx=width/surface.width,sy=height/surface.height;
  if(fit==='cover')sx=sy=Math.max(sx,sy);
  else if(fit==='contain')sx=sy=Math.min(sx,sy);
  else if(fit!=='fill')throw new Error(`Unsupported scenery fit: ${fit}`);
  const [horizontal='50%',vertical='50%']=position.trim().split(/\s+/);
  const offset=(value,space)=>value.endsWith('%')?parseFloat(value)*space/100:parseFloat(value)||0;
  const dx=offset(horizontal,width-surface.width*sx),dy=offset(vertical,height-surface.height*sy);
  return surface.corners.map(([x,y])=>({x:x*sx+dx,y:y*sy+dy}));
}
