import * as THREE from 'three';
import { HandRig } from './hand.js';
import { outlineUniforms } from './toon.js';

/**
 * Rend les icônes des cartes (pierre / feuille / ciseaux) à partir du vrai
 * modèle 3D de la main : l'interface et la scène partagent ainsi le même style.
 */
export function renderMoveIcons(moves, size = 256) {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#e9e0ff', '#8a5a96', 1.4));
  const key = new THREE.DirectionalLight('#fff0dc', 3.2);
  key.position.set(-2, 4, 6);
  scene.add(key);

  const hand = new HandRig({ team: 'player', withArm: false });
  hand.idle = 0;
  // Doigts vers le haut, léger trois-quarts
  hand.root.rotation.set(0.1, -0.45, Math.PI / 2 - 0.12);
  scene.add(hand.root);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  camera.position.set(0, 0, 10);

  const savedResolution = outlineUniforms.uResolution.value.clone();
  const savedPixelRatio = outlineUniforms.uPixelRatio.value;
  outlineUniforms.uResolution.value.set(size, size);
  outlineUniforms.uPixelRatio.value = 0.9;

  // Cadrage commun : même échelle pour les trois coups
  const boxes = moves.map((move) => {
    hand.snapPose(move);
    hand.update(0, 0);
    hand.root.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(hand.root);
  });
  const half =
    Math.max(...boxes.map((b) => Math.max(b.max.x - b.min.x, b.max.y - b.min.y))) / 2 + 0.12;

  const icons = {};
  moves.forEach((move, i) => {
    hand.snapPose(move);
    hand.update(0, 0);
    const center = boxes[i].getCenter(new THREE.Vector3());
    Object.assign(camera, { left: -half, right: half, top: half, bottom: -half });
    camera.position.set(center.x, center.y, 10);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    icons[move] = renderer.domElement.toDataURL('image/png');
  });

  outlineUniforms.uResolution.value.copy(savedResolution);
  outlineUniforms.uPixelRatio.value = savedPixelRatio;
  renderer.dispose();
  renderer.forceContextLoss();
  return icons;
}
