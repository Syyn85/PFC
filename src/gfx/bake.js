import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Fusionne les meshes statiques d'une hiérarchie par matériau (et leurs contours
 * par matériau de contour). Le décor passe ainsi de centaines d'appels de rendu
 * à quelques dizaines, ce qui compte beaucoup sur mobile.
 *
 * Seuls les MeshToonMaterial (et leurs contours) sont fusionnés ; le reste
 * (sprites, flammes, objets animés…) est laissé tel quel.
 */
export function bakeStatic(root, { castShadow = true, receiveShadow = true } = {}) {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const bodies = new Map();
  const outlines = new Map();
  const baked = [];

  const push = (map, material, geometry) => {
    if (!map.has(material)) map.set(material, []);
    map.get(material).push(geometry);
  };

  root.traverse((obj) => {
    if (!obj.isMesh || obj.isInstancedMesh || obj.userData.isOutline) return;
    if (!obj.material?.isMeshToonMaterial) return;
    const matrix = new THREE.Matrix4().multiplyMatrices(toRoot, obj.matrixWorld);
    push(bodies, obj.material, prepare(obj.geometry, obj.material).applyMatrix4(matrix));
    for (const child of obj.children) {
      if (!child.userData.isOutline) continue;
      push(outlines, child.material, prepare(child.geometry, null).applyMatrix4(matrix));
    }
    baked.push(obj);
  });

  for (const obj of baked) {
    const parent = obj.parent;
    for (const child of [...obj.children]) {
      if (!child.userData.isOutline) parent.attach(child);
    }
    obj.removeFromParent();
  }

  for (const [material, geometries] of bodies) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.userData.baked = true;
    root.add(mesh);
  }
  for (const [material, geometries] of outlines) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    mesh.userData.isOutline = true;
    mesh.raycast = () => {};
    root.add(mesh);
  }
  return root;
}

/** Copie non indexée ne gardant que les attributs utiles au matériau. */
function prepare(geometry, material) {
  const keep = new Set(['position', 'normal']);
  if (material?.map) keep.add('uv');
  if (material?.vertexColors) keep.add('color');
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  for (const name of Object.keys(source.attributes)) {
    if (!keep.has(name)) source.deleteAttribute(name);
  }
  source.morphAttributes = {};
  source.clearGroups();
  return source;
}
