import * as THREE from 'three';
import { HandRig } from './hand.js';
import { outlineUniforms } from './toon.js';

/**
 * Rend des icônes (cartes de coup, portraits d'adversaires) à partir du vrai
 * modèle 3D de la main : l'interface et la scène partagent ainsi le même style.
 *
 * @param {{key: string, pose: string, team?: string, palette?: object}[]} requests
 * @returns {Record<string, string>} data URLs PNG indexées par `key`
 */
export function renderHandIcons(requests, size = 256) {
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

  const rigs = {};
  const rigFor = (team) => {
    if (!rigs[team]) {
      const rig = new HandRig({ team, withArm: false });
      rig.idle = 0;
      // Doigts vers le haut, léger trois-quarts
      rig.root.rotation.set(0.1, -0.45, Math.PI / 2 - 0.12);
      rigs[team] = rig;
    }
    return rigs[team];
  };

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  const savedResolution = outlineUniforms.uResolution.value.clone();
  const savedPixelRatio = outlineUniforms.uPixelRatio.value;
  outlineUniforms.uResolution.value.set(size, size);
  outlineUniforms.uPixelRatio.value = 0.9;

  const pose = (request) => {
    const rig = rigFor(request.team ?? 'player');
    rig.setPalette(request.palette);
    rig.snapPose(request.pose);
    rig.update(0, 0);
    rig.root.updateMatrixWorld(true);
    return rig;
  };

  // Cadrage commun : même échelle pour toutes les icônes du lot
  const boxes = requests.map((request) => new THREE.Box3().setFromObject(pose(request).root));
  const half =
    Math.max(...boxes.map((b) => Math.max(b.max.x - b.min.x, b.max.y - b.min.y))) / 2 + 0.12;

  const icons = {};
  requests.forEach((request, i) => {
    const rig = pose(request);
    scene.add(rig.root);
    const center = boxes[i].getCenter(new THREE.Vector3());
    Object.assign(camera, { left: -half, right: half, top: half, bottom: -half });
    camera.position.set(center.x, center.y, 10);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    icons[request.key] = renderer.domElement.toDataURL('image/png');
    scene.remove(rig.root);
  });

  outlineUniforms.uResolution.value.copy(savedResolution);
  outlineUniforms.uPixelRatio.value = savedPixelRatio;
  renderer.dispose();
  renderer.forceContextLoss();
  return icons;
}

export function renderMoveIcons(moves) {
  return renderHandIcons(moves.map((move) => ({ key: move, pose: move })));
}
