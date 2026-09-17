import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Box3, Matrix4, Plane, PerspectiveCamera, Raycaster, Vector2, Vector3, Vector4 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { configureBoardCamera } from '../src/board-plane.mjs';
import { fitStoneSurface } from '../src/stone-surface.mjs';

const source = {
  desktop: { width: 1659, height: 948, corners: [[417, 120], [1231, 120], [1347, 812], [305, 812]] },
  phone: { width: 830, height: 1894, corners: [[90, 524], [727, 524], [822, 1298], [9, 1298]] },
};
function fixture(width, height, phone = false) {
  const asset = phone ? source.phone : source.desktop;
  const scale = Math.max(width / asset.width, height / asset.height);
  const sx = phone ? width / asset.width : scale, sy = phone ? height / asset.height : scale;
  const dx = phone ? 0 : (width - asset.width * scale) / 2;
  const dy = phone ? 0 : (height - asset.height * scale) / 2;
  return { width, height, stoneCorners: asset.corners.map(([x, y]) => ({ x: x * sx + dx, y: y * sy + dy })) };
}
const scenes = [fixture(1440, 900), fixture(1140, 600), fixture(390, 844, true), fixture(320, 844, true)];
const pixel = (point, camera, { width, height }) => {
  const p = point.clone().project(camera);
  return { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2 };
};

test('both views preserve all four measured corners, including shifted upper/lower centres', () => {
  for (const scene of scenes) {
    const camera = new PerspectiveCamera();
    const { stoneCorners } = scene;
    const targetCentreShift = (stoneCorners[2].x + stoneCorners[3].x - stoneCorners[0].x - stoneCorners[1].x) / 2;
    assert.ok(Math.abs(targetCentreShift) > 0.1, 'fixture must expose the old single-centre assumption');
    for (const topView of [false, true, false, true]) {
      const result = configureBoardCamera(camera, { ...scene, topView });
      assert.equal(result.angleDegrees, topView ? 88 : 48);
      assert.ok(result.maxCornerErrorPx < 1e-7);
      assert.ok(result.minPlaneDepth > camera.near);
      const p = result.projectedCorners;
      const actualShift = (p[2].x + p[3].x - p[0].x - p[1].x) / 2;
      assert.ok(Math.abs(actualShift - targetCentreShift) < 1e-7);
    }
  }
});

test('narrow tall displays keep the full lower edge instead of clipping the required plane height', () => {
  const scene = fixture(320, 844, true), c = scene.stoneCorners;
  const planeHeight = c[3].y - c[0].y;
  const meanWidth = (c[1].x - c[0].x + c[2].x - c[3].x) / 2;
  assert.ok(planeHeight / meanWidth > 1, 'fixture must exceed the former sine clamp');
  for (const topView of [false, true]) {
    const result = configureBoardCamera(new PerspectiveCamera(), { ...scene, topView });
    assert.ok(Math.abs(result.projectedCorners[3].y - c[3].y) < 1e-7);
    assert.ok(Math.abs(result.projectedCorners[2].y - c[2].y) < 1e-7);
  }
});

test('artwork taper determines the viewing distance and the top view never moves closer', () => {
  for (const scene of scenes) {
    const c = scene.stoneCorners;
    const rearWidth = c[1].x - c[0].x, frontWidth = c[2].x - c[3].x;
    const ratio = (frontWidth - rearWidth) / (frontWidth + rearWidth);
    const expectedDistance = 4.4 * Math.cos(48 * Math.PI / 180) / ratio;
    // Real artwork calls for about 24 units. The former fixed 17.6-unit
    // camera exaggerated back-rank pieces even with an exactly fitted floor.
    assert.ok(expectedDistance > 23 && expectedDistance < 25);
    const camera = new PerspectiveCamera();
    for (const topView of [false, true, false]) {
      const result = configureBoardCamera(camera, { ...scene, topView });
      assert.ok(Math.abs(result.distance - expectedDistance) < 1e-9);
      assert.ok(Math.abs(camera.position.length() - expectedDistance) < 1e-9);
      assert.ok(result.maxCornerErrorPx < 1e-7);
    }
  }
  // Parallel, slightly reversed and unusually tapered artwork still produces
  // a finite camera safely outside the board, with an invertible projection.
  for (const rearWidth of [800, 800.000001, 80]) {
    const scene = { width: 1000, height: 1000, stoneCorners: [
      { x: 500 - rearWidth / 2, y: 150 }, { x: 500 + rearWidth / 2, y: 150 },
      { x: 900, y: 850 }, { x: 100, y: 850 },
    ] };
    for (const topView of [false, true]) {
      const camera = new PerspectiveCamera();
      const result = configureBoardCamera(camera, { ...scene, topView });
      assert.ok(Number.isFinite(result.distance) && result.distance >= 17.6 && result.distance < 74);
      assert.ok(result.minPlaneDepth > camera.near && result.maxCornerErrorPx < 1e-7);
      assert.ok(camera.projectionMatrixInverse.elements.every(Number.isFinite));
    }
  }
});

test('Three.js raycasting still selects every square using the calibrated inverse', () => {
  const floor = new Plane(new Vector3(0, 1, 0), -0.01);
  for (const scene of scenes) for (const topView of [false, true]) {
    const camera = new PerspectiveCamera();
    configureBoardCamera(camera, { ...scene, topView });
    const identity = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.projectionMatrixInverse);
    const expected = new Matrix4().elements;
    assert.ok(identity.elements.every((entry, i) => Math.abs(entry - expected[i]) < 1e-9));
    for (let file = 0; file < 8; file++) for (let rank = 0; rank < 8; rank++) {
      const original = new Vector3(file - 3.5, 0.01, rank - 3.5);
      const p = pixel(original, camera, scene), ray = new Raycaster();
      ray.setFromCamera(new Vector2(2 * p.x / scene.width - 1, 1 - 2 * p.y / scene.height), camera);
      const hit = ray.ray.intersectPlane(floor, new Vector3());
      assert.ok(hit && hit.distanceTo(original) < 1e-8, `Ray missed square ${file},${rank}`);
      assert.equal(Math.floor(hit.x + 4), file);
      assert.equal(Math.floor(hit.z + 4), rank);
    }
  }
});

test('the whole playing envelope, including a jumping knight, remains inside the depth range', () => {
  // 1.75 units covers the current tallest pieces plus their hop. The horizontal
  // envelope covers a 0.7-unit piece footprint on every square, including edges.
  for (const scene of scenes) for (const topView of [false, true]) {
    const camera = new PerspectiveCamera();
    configureBoardCamera(camera, { ...scene, topView });
    for (let file = 0; file < 8; file++) for (let rank = 0; rank < 8; rank++) {
      for (const dx of [-0.35, 0.35]) for (const dz of [-0.35, 0.35]) for (const y of [0, 1.75]) {
        const clip = new Vector4(file - 3.5 + dx, y, rank - 3.5 + dz, 1)
          .applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
        assert.ok(clip.w > 0, 'geometry must remain in front of the projective camera');
        assert.ok(clip.z >= -clip.w && clip.z <= clip.w, 'homography must not cause depth clipping');
      }
    }
    // Rebuilding Z must also preserve occlusion order along a viewing ray.
    const ray = new Raycaster();
    const centre = new Vector3(0, 0, 0).project(camera);
    ray.setFromCamera(new Vector2(centre.x, centre.y), camera);
    const distance = camera.position.length();
    const depths = [distance / 2, distance, distance * 2].map(d => ray.ray.at(d, new Vector3()).project(camera).z);
    assert.ok(depths[0] < depths[1] && depths[1] < depths[2]);
    assert.ok(depths.every(depth => depth >= -1 && depth <= 1));
  }
});

test('view switching changes a raised piece while its ground contact stays fixed', () => {
  const scene = fixture(390, 844, true), camera = new PerspectiveCamera();
  const floor = new Vector3(0.5, 0, -2.5), head = new Vector3(0.5, 1.1, -2.5);
  configureBoardCamera(camera, scene);
  const groundA = pixel(floor, camera, scene), headA = pixel(head, camera, scene);
  configureBoardCamera(camera, { ...scene, topView: true });
  const groundB = pixel(floor, camera, scene), headB = pixel(head, camera, scene);
  assert.ok(Math.hypot(groundA.x - groundB.x, groundA.y - groundB.y) < 1e-7);
  assert.ok(Math.hypot(headA.x - headB.x, headA.y - headB.y) > 2);
});

test('shipped GLB pieces and their full hops remain on screen across phone, tablet and capped wide stages', async () => {
  const calibration = JSON.parse(await readFile(new URL('../design/stone-calibration.json', import.meta.url), 'utf8'));
  const models = [];
  for (const name of ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king']) {
    const bytes = await readFile(new URL(`../public/models/${name}.glb`, import.meta.url));
    const { scene } = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    // Match the live board's scale and include the black knight's reversed
    // silhouette. Material colour does not change these geometric bounds.
    scene.scale.setScalar(0.92);
    for (const rotation of name === 'knight' ? [0, Math.PI] : [0]) {
      scene.rotation.y = rotation;
      scene.updateMatrixWorld(true);
      models.push({ name, box: new Box3().setFromObject(scene, true) });
    }
  }
  const viewports = [
    [320, 844], [360, 800], [390, 844], [430, 932], [700, 900],
    [768, 1024], [820, 1180], [1024, 768], [1440, 900], [1920, 1080],
    [1920, 600], [844, 390], [667, 375],
  ];
  for (const [viewportWidth, viewportHeight] of viewports) {
    // These are the current picture/CSS layout cases; browser QA separately
    // verifies that actual stage rectangles still agree with these inputs.
    const portrait = viewportWidth / viewportHeight <= 1.2;
    const width = Math.min(viewportWidth, 1.9 * viewportHeight);
    const height = Math.max(viewportHeight, portrait ? 600 : viewportHeight <= 600 ? 360 : 560);
    const asset = portrait
      ? viewportWidth >= 701 ? 'cloud-stage-tall.webp' : 'cloud-stage-tall-v2.webp'
      : 'cloud-stage-wide-v2.webp';
    const stoneCorners = fitStoneSurface(calibration.surfaces[asset], { width, height, fit: portrait ? 'fill' : 'cover' });
    for (const topView of [false, true]) {
      const camera = new PerspectiveCamera();
      configureBoardCamera(camera, { width, height, stoneCorners, topView });
      for (const { name, box } of models) for (let file = 0; file < 8; file++) for (let rank = 0; rank < 8; rank++) {
        for (const hop of [0, name === 'knight' ? 0.6 : 0.16]) {
          for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
            const point = new Vector3(x + file - 3.5, y + hop, z + rank - 3.5);
            const p = pixel(point, camera, { width, height });
            const margin = Math.min(p.x, width - p.x, p.y, height - p.y);
            assert.ok(margin >= 1,
              `${name} at ${file},${rank}, hop ${hop}, top ${topView} clips ${viewportWidth}x${viewportHeight}: margin ${margin}`);
          }
        }
      }
    }
  }
});

test('invalid or crossing corner sets fail before changing the current camera', () => {
  const camera = new PerspectiveCamera(), scene = fixture(390, 844, true);
  configureBoardCamera(camera, scene);
  const before = camera.projectionMatrix.toArray();
  for (const settings of [
    { ...scene, width: 0 },
    { ...scene, halfExtent: Number.NaN },
    { ...scene, stoneCorners: scene.stoneCorners.slice(0, 3) },
    { ...scene, stoneCorners: [scene.stoneCorners[0], scene.stoneCorners[2], scene.stoneCorners[1], scene.stoneCorners[3]] },
    { ...scene, stoneCorners: scene.stoneCorners.map(() => ({ x: 10, y: 10 })) },
  ]) {
    assert.throws(() => configureBoardCamera(camera, settings));
    assert.deepEqual(camera.projectionMatrix.toArray(), before);
  }
});
