import { Matrix4, Vector3, Vector4 } from 'three';

const ANGLES = { scene: 48, top: 88 };

function solveLinear(rows, values) {
  const matrix = rows.map((row, index) => [...row, values[index]]);
  const size = rows.length;
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    }
    if (Math.abs(matrix[pivot][column]) < 1e-12) {
      throw new RangeError('Stone corners do not define a stable projective plane.');
    }
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    const divisor = matrix[column][column];
    for (let entry = column; entry <= size; entry++) matrix[column][entry] /= divisor;
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = matrix[row][column];
      for (let entry = column; entry <= size; entry++) {
        matrix[row][entry] -= factor * matrix[column][entry];
      }
    }
  }
  return matrix.map(row => row[size]);
}

function homography(source, target) {
  const rows = [], values = [];
  for (let index = 0; index < 4; index++) {
    const { x, y } = source[index], { x: u, y: v } = target[index];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    values.push(u);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    values.push(v);
  }
  return [...solveLinear(rows, values), 1];
}

function validate(camera, width, height, corners, halfExtent) {
  if (!camera?.isPerspectiveCamera) throw new TypeError('A Three.js PerspectiveCamera is required.');
  if (![width, height, halfExtent].every(value => Number.isFinite(value) && value > 0)) {
    throw new RangeError('Stage dimensions and plane halfExtent must be finite positive numbers.');
  }
  if (!Array.isArray(corners) || corners.length !== 4
    || corners.some(point => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    throw new TypeError('stoneCorners must contain four finite CSS-pixel points.');
  }
  // Work in normalized coordinates so the degeneracy check is independent of DPR
  // and CSS-pixel scale. TL, TR, BR, BL form a clockwise convex polygon on screen.
  const points = corners.map(({ x, y }) => ({ x: x / width, y: y / height }));
  for (let index = 0; index < 4; index++) {
    const a = points[index], b = points[(index + 1) % 4], c = points[(index + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross <= 1e-10) {
      throw new RangeError('stoneCorners must be distinct convex corners ordered TL, TR, BR, BL.');
    }
  }
}

/**
 * Anchor the world plane y=0 to the illustrated stone's measured four corners.
 * The outer stone is [-halfExtent,+halfExtent] on x/z; the existing 8x8 board
 * stays at [-4,+4], giving a uniform world-space rim without moving chess squares.
 *
 * stoneCorners are stage-local CSS pixels, already transformed using the active
 * background image's actual cover/fill crop. Do not pass viewport coordinates or
 * physical canvas pixels. This module has no DOM or background-image assumptions.
 *
 * Call after stage/image/view changes. Do not call updateProjectionMatrix() after
 * this function: it would discard the calibrated projection and its inverse.
 */
export function configureBoardCamera(camera, {
  width, height, stoneCorners, halfExtent = 4.4, topView = false,
}) {
  validate(camera, width, height, stoneCorners, halfExtent);
  const angleDegrees = topView ? ANGLES.top : ANGLES.scene;
  const angle = angleDegrees * Math.PI / 180;
  const edgeWidth = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const rearWidth = edgeWidth(stoneCorners[0], stoneCorners[1]);
  const frontWidth = edgeWidth(stoneCorners[3], stoneCorners[2]);
  const perspectiveRatio = (frontWidth - rearWidth) / (frontWidth + rearWidth);
  // For a square viewed at elevation e, (frontWidth - rearWidth) /
  // (frontWidth + rearWidth) = halfExtent * cos(e) / distance. Calibrate
  // that distance at the normal view and keep it for the top view, avoiding
  // an unintended zoom into the pieces when only their elevation changes.
  // Almost parallel/reversed edges must not send the camera to infinity;
  // strongly tapered art must not bring it too close to the playing volume.
  const distance = Math.max(halfExtent * 4,
    halfExtent * Math.cos(ANGLES.scene * Math.PI / 180) / Math.max(0.04, perspectiveRatio));
  camera.fov = 34;
  camera.aspect = width / height;
  camera.zoom = 1;
  camera.near = halfExtent * 0.02;
  camera.far = halfExtent * 40;
  camera.up.set(0, 1, 0);
  camera.position.set(0, distance * Math.sin(angle), distance * Math.cos(angle));
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const outer = [
    new Vector3(-halfExtent, 0, -halfExtent),
    new Vector3(halfExtent, 0, -halfExtent),
    new Vector3(halfExtent, 0, halfExtent),
    new Vector3(-halfExtent, 0, halfExtent),
  ];
  const source = outer.map(point => point.clone().project(camera));
  const target = stoneCorners.map(({ x, y }) => ({ x: 2 * x / width - 1, y: 1 - 2 * y / height }));
  const h = homography(source, target);
  const lift = new Matrix4().set(
    h[0], h[1], 0, h[2],
    h[3], h[4], 0, h[5],
    0, 0, 1, 0,
    h[6], h[7], 0, h[8],
  );
  const projection = lift.multiply(camera.projectionMatrix);
  const elements = projection.elements;

  // A screen homography changes clip W, so retaining the old clip Z would make
  // valid pieces fail -W <= Z <= W. Normalize the new W row into a depth axis,
  // then rebuild Z from that same axis with the usual near/far mapping. The
  // camera centre stays fixed, and depth remains monotonic along every ray.
  const centre = new Vector4(0, 0, 0, 1)
    .applyMatrix4(camera.matrixWorldInverse).applyMatrix4(projection);
  const depthScale = Math.hypot(elements[3], elements[7], elements[11]);
  if (!Number.isFinite(depthScale) || depthScale < 1e-12 || Math.abs(centre.w) < 1e-12) {
    throw new RangeError('Stone projection has no stable forward depth.');
  }
  projection.multiplyScalar((centre.w < 0 ? -1 : 1) / depthScale);
  const a = (camera.far + camera.near) / (camera.far - camera.near);
  const b = -2 * camera.far * camera.near / (camera.far - camera.near);
  for (let column = 0; column < 4; column++) {
    elements[column * 4 + 2] = a * elements[column * 4 + 3] + (column === 3 ? b : 0);
  }
  if (!Number.isFinite(projection.determinant()) || Math.abs(projection.determinant()) < 1e-12) {
    throw new RangeError('Stone projection is not invertible.');
  }
  camera.projectionMatrix.copy(projection);
  camera.projectionMatrixInverse.copy(projection).invert();

  const projectedCorners = outer.map(point => {
    const p = point.clone().project(camera);
    return { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2 };
  });
  const maxCornerErrorPx = Math.max(...projectedCorners.map((point, index) =>
    Math.hypot(point.x - stoneCorners[index].x, point.y - stoneCorners[index].y)));
  const minPlaneDepth = Math.min(...outer.map(point => new Vector4(point.x, point.y, point.z, 1)
    .applyMatrix4(camera.matrixWorldInverse).applyMatrix4(projection).w));
  return { angleDegrees, distance, perspectiveRatio, projectedCorners, maxCornerErrorPx, minPlaneDepth };
}
