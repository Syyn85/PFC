import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Fusionne les meshes statiques d'une hiérarchie par matériau (et leurs contours
 * par matériau de contour). Le décor passe ainsi de centaines d'appels de rendu
 * à quelques dizaines, ce qui compte beaucoup sur mobile.
 *
 * Seuls les MeshToonMaterial (et leurs contours) sont fusionnés ; le reste
 * (sprites, flammes, objets animés…) est laissé tel quel.
 *
 * Les drapeaux d'ombre de chaque mesh sont respectés (regroupement par matériau
 * ET par drapeaux) : un objet créé sans ombre portée reste sans ombre portée.
 * `castShadow: false` / `receiveShadow: false` les coupent pour toute la hiérarchie.
 */
export function bakeStatic(root, { castShadow = true, receiveShadow = true } = {}) {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const bodies = new Map();
  const outlines = new Map();
  const baked = [];

  const push = (map, key, init, geometry) => {
    if (!map.has(key)) map.set(key, { ...init, geometries: [] });
    map.get(key).geometries.push(geometry);
  };

  root.traverse((obj) => {
    if (!obj.isMesh || obj.isInstancedMesh || obj.userData.isOutline) return;
    if (!obj.material?.isMeshToonMaterial) return;
    const matrix = new THREE.Matrix4().multiplyMatrices(toRoot, obj.matrixWorld);
    const cast = castShadow && obj.castShadow;
    const receive = receiveShadow && obj.receiveShadow;
    push(
      bodies,
      `${obj.material.uuid}:${cast}:${receive}`,
      { material: obj.material, cast, receive },
      prepare(obj.geometry, obj.material).applyMatrix4(matrix),
    );
    for (const child of obj.children) {
      if (!child.userData.isOutline) continue;
      push(
        outlines,
        child.material.uuid,
        { material: child.material },
        prepare(child.geometry, null).applyMatrix4(matrix),
      );
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

  for (const { material, cast, receive, geometries } of bodies.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.userData.baked = true;
    root.add(mesh);
  }
  for (const { material, geometries } of outlines.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    mesh.userData.isOutline = true;
    mesh.raycast = () => {};
    root.add(mesh);
  }
  return root;
}

/**
 * Copie indexée ne gardant que les attributs utiles au matériau. Garder l'index
 * évite de traiter chaque sommet partagé plusieurs fois (≈ 4,5× moins de sommets
 * que la version dépliée) ; mergeGeometries exige des entrées toutes indexées.
 */
function prepare(geometry, material) {
  const keep = new Set(['position', 'normal']);
  if (material?.map) keep.add('uv');
  if (material?.vertexColors) keep.add('color');
  let source = geometry.clone();
  for (const name of Object.keys(source.attributes)) {
    if (!keep.has(name)) source.deleteAttribute(name);
  }
  source.morphAttributes = {};
  source.clearGroups();
  if (source.index) return source;

  // Source non indexée (polyèdres, extrusions…) : on soude les sommets identiques.
  if (material?.defines?.FLAT_SHADED !== undefined) {
    // Facettes : le shader recalcule la normale par dérivées écran, celle des sommets
    // ne sert plus qu'au décalage d'ombre (normalBias). On soude donc sur la position
    // (+ uv / couleur), puis on recalcule des normales moyennes.
    source.deleteAttribute('normal');
    source = mergeVertices(source);
    source.computeVertexNormals();
  } else {
    // Ombrage lissé : mergeVertices compare tous les attributs, normales comprises,
    // donc deux sommets aux normales différentes (arête vive) restent distincts.
    source = mergeVertices(source);
  }
  return source;
}
