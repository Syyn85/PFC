import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Boîte à outils cel shading :
 *  - rampes d'éclairage en paliers (gradient maps)
 *  - matériau toon enrichi : liseré de lumière (rim) + reflet spéculaire dur
 *  - contours "inverted hull" d'épaisseur constante à l'écran
 *  - halos lumineux additifs
 */

export const INK = new THREE.Color('#231a3d');

/** Uniforms partagés par tous les contours (mis à jour au redimensionnement). */
export const outlineUniforms = {
  uResolution: { value: new THREE.Vector2(1, 1) },
  uPixelRatio: { value: 1 },
};

// --- Rampes d'éclairage -------------------------------------------------------

const rampCache = new Map();

/**
 * Crée une rampe à paliers. `bands` = [[seuil, luminosité], ...] où le seuil
 * est exprimé sur [0, 1] (0 = dos à la lumière, 0.5 = rasant, 1 = face).
 */
export function toonRamp(bands = RAMPS.soft) {
  const key = JSON.stringify(bands);
  if (rampCache.has(key)) return rampCache.get(key);

  const size = 64;
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const x = (i + 0.5) / size;
    let value = bands[0][1];
    for (const [threshold, level] of bands) if (x >= threshold) value = level;
    data[i] = Math.round(value * 255);
  }
  const texture = new THREE.DataTexture(data, size, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  rampCache.set(key, texture);
  return texture;
}

export const RAMPS = {
  // ombre / demi-teinte / lumière
  soft: [
    [0, 0.34],
    [0.47, 0.66],
    [0.6, 1.0],
  ],
  // deux tons francs, pour le décor
  hard: [
    [0, 0.4],
    [0.52, 1.0],
  ],
  // peau / tissu : plus de nuances
  smooth: [
    [0, 0.3],
    [0.42, 0.55],
    [0.52, 0.8],
    [0.66, 1.0],
  ],
};

// --- Matériau toon ------------------------------------------------------------

const TOON_UNIFORMS_DECL = /* glsl */ `
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform float uRimThreshold;
uniform vec3 uSpecColor;
uniform float uSpecStrength;
uniform float uSpecSize;
`;

const TOON_EXTRA_LIGHT = /* glsl */ `
{
  vec3 viewDir = normalize( vViewPosition );
  float ndv = saturate( dot( normal, viewDir ) );
  float rimMask = 1.0;
  #if NUM_DIR_LIGHTS > 0
    vec3 keyDir = directionalLights[ 0 ].direction;
    rimMask = 0.35 + 0.65 * saturate( dot( normal, keyDir ) * 0.5 + 0.5 );
    vec3 halfDir = normalize( keyDir + viewDir );
    float specTerm = saturate( dot( normal, halfDir ) );
    outgoingLight += uSpecColor * uSpecStrength * smoothstep( uSpecSize, uSpecSize + 0.01, specTerm );
  #endif
  float rim = smoothstep( uRimThreshold, uRimThreshold + 0.025, 1.0 - ndv );
  outgoingLight += uRimColor * uRimStrength * rim * rimMask;
}
#include <opaque_fragment>
`;

// Ombres portées en aplat (lumières directionnelles) :
//  - toonShadowMap lit la carte en cinq points fixes (centre et diagonales à ±0,5 texel)
//    au lieu du disque tourné par un bruit de getShadow (bord granuleux une fois seuillé) :
//    avec le filtrage PCF matériel, c'est un filtre en tente dont l'isocontour 0,5 est
//    lisse. Le rayon de la lumière (LightShadow.radius) est donc ignoré ici ;
//  - toonShadow seuille ce facteur à 0,5 sur environ un pixel écran (bord net, anticrénelé)
//    et, dans l'ombre, ramène l'éclairage direct à un ton unique : le palier sombre de la
//    rampe (lu dans la rampe elle-même) creusé de TOON_CAST_DEPTH. Toute surface à l'ombre
//    d'une main prend ce même aplat, un cran sous l'ombre propre des volumes, pour que les
//    objets restent bien posés au sol (sur l'herbe surtout, qui n'a pas d'ombre propre).
//    LightShadow.intensity reste un dosage (1 = aplat atteint), pas un second plancher.
const TOON_SHADOW_PARS = /* glsl */ `
#include <shadowmap_pars_fragment>
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
  #ifdef SHADOWMAP_TYPE_PCF
    float toonShadowMap( sampler2DShadow map, vec2 mapSize, float bias, vec4 coord ) {
      coord.xyz /= coord.w;
      coord.z += bias;
      if ( any( lessThan( coord.xy, vec2( 0.0 ) ) ) || any( greaterThan( coord.xyz, vec3( 1.0 ) ) ) ) return 1.0;
      vec2 d = 0.5 / mapSize;
      return 0.2 * (
        texture( map, coord.xyz ) +
        texture( map, vec3( coord.xy - d, coord.z ) ) +
        texture( map, vec3( coord.xy + d, coord.z ) ) +
        texture( map, vec3( coord.x - d.x, coord.y + d.y, coord.z ) ) +
        texture( map, vec3( coord.x + d.x, coord.y - d.y, coord.z ) )
      );
    }
  #else
    #define toonShadowMap( map, mapSize, bias, coord ) getShadow( map, mapSize, 1.0, bias, 0.0, coord )
  #endif

  const float TOON_CAST_DEPTH = 0.5;

  float toonShadow( float shadow, float intensity, vec3 normal, vec3 lightDir ) {
    float aa = clamp( 0.5 * fwidth( shadow ), 0.02, 0.5 );
    float lit = mix( 1.0, smoothstep( 0.5 - aa, 0.5 + aa, shadow ), intensity );
    #ifdef USE_GRADIENTMAP
      float dark = texture2D( gradientMap, vec2( 0.0 ) ).r;
    #else
      float dark = 0.7; // palier sombre de la rampe par défaut de MeshToonMaterial
    #endif
    // Facteur de directLight.color, que RE_Direct multiplie ensuite par la rampe
    float ramp = getGradientIrradiance( normal, lightDir ).r;
    return mix( min( dark * TOON_CAST_DEPTH / max( ramp, 1e-3 ), 1.0 ), 1.0, lit );
  }
#endif
`;

// lights_fragment_begin où l'ombre des lumières directionnelles passe par toonShadow.
// Ponctuelles et spots restent intacts ; sans carte d'ombre ou sans receiveShadow, le
// code d'origine (et son 1.0) s'applique toujours.
const DIR = 'directionalLightShadow';
const DIR_SHADOW_CALL = `getShadow( directionalShadowMap[ i ], ${DIR}.shadowMapSize, ${DIR}.shadowIntensity, ${DIR}.shadowBias, ${DIR}.shadowRadius, vDirectionalShadowCoord[ i ] )`;
const TOON_LIGHTS_BEGIN = THREE.ShaderChunk.lights_fragment_begin.replace(
  DIR_SHADOW_CALL,
  `toonShadow( toonShadowMap( directionalShadowMap[ i ], ${DIR}.shadowMapSize, ${DIR}.shadowBias, vDirectionalShadowCoord[ i ] ), ${DIR}.shadowIntensity, geometryNormal, directLight.direction )`,
);
if (TOON_LIGHTS_BEGIN === THREE.ShaderChunk.lights_fragment_begin) {
  console.warn('toon.js : appel getShadow introuvable (version de three ?), ombres non seuillées');
}

// Fonction partagée : son code source sert de clé de cache au programme GLSL.
// Tout ce qui varie d'un matériau à l'autre doit donc passer par des uniforms.
function injectToonExtras(shader) {
  Object.assign(shader.uniforms, this.userData.toon);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${TOON_UNIFORMS_DECL}`)
    .replace('#include <shadowmap_pars_fragment>', TOON_SHADOW_PARS)
    .replace('#include <lights_fragment_begin>', TOON_LIGHTS_BEGIN)
    .replace('#include <opaque_fragment>', TOON_EXTRA_LIGHT);
}

/**
 * Matériau toon. Les réglages de liseré et de reflet restent modifiables après
 * coup via `material.userData.toon.uSpecStrength.value`, etc.
 */
export function toonMaterial({
  color = '#ffffff',
  ramp = RAMPS.soft,
  rim = 0.28,
  rimColor = '#fff4e6',
  rimThreshold = 0.62,
  spec = 0,
  specColor = '#ffffff',
  specSize = 0.965,
  flatShading = false,
  ...params
} = {}) {
  const material = new THREE.MeshToonMaterial({
    color,
    gradientMap: toonRamp(ramp),
    ...params,
  });
  // MeshToonMaterial n'expose pas flatShading : on active directement la variante
  // du shader (normales recalculées par facette via les dérivées écran).
  if (flatShading) material.defines = { FLAT_SHADED: '' };
  material.userData.toon = {
    uRimColor: { value: new THREE.Color(rimColor) },
    uRimStrength: { value: rim },
    uRimThreshold: { value: rimThreshold },
    uSpecColor: { value: new THREE.Color(specColor) },
    uSpecStrength: { value: spec },
    uSpecSize: { value: specSize },
  };
  material.onBeforeCompile = injectToonExtras;
  return material;
}

// --- Contours (inverted hull) -------------------------------------------------

const OUTLINE_VERTEX = /* glsl */ `
uniform float uThickness;
uniform vec2 uResolution;
uniform float uPixelRatio;
#include <common>
#include <fog_pars_vertex>

void main() {
  vec3 objectNormal = vec3( normal );
  vec4 mvPosition = vec4( position, 1.0 );
  #ifdef USE_INSTANCING
    objectNormal = mat3( instanceMatrix ) * objectNormal;
    mvPosition = instanceMatrix * mvPosition;
  #endif
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;

  // Direction de la normale projetée à l'écran, en pixels.
  vec3 viewNormal = normalize( normalMatrix * objectNormal );
  vec2 dir = ( projectionMatrix * vec4( viewNormal, 0.0 ) ).xy * uResolution;
  float len = length( dir );
  dir = len > 1e-6 ? dir / len : vec2( 0.0 );

  // Épaisseur quasi constante en pixels, légèrement atténuée au loin.
  float distanceScale = clamp( 10.0 / max( gl_Position.w, 1e-3 ), 0.4, 1.3 );
  float px = uThickness * uPixelRatio * distanceScale;
  gl_Position.xy += dir * ( 2.0 * px / uResolution ) * gl_Position.w;

  #include <fog_vertex>
}
`;

const OUTLINE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
#include <common>
#include <fog_pars_fragment>

void main() {
  gl_FragColor = vec4( uColor, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const outlineMaterialCache = new Map();

export function outlineMaterial(color = INK, thickness = 2.2) {
  const c = new THREE.Color(color);
  const key = `${c.getHexString()}:${thickness}`;
  if (outlineMaterialCache.has(key)) return outlineMaterialCache.get(key);

  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uColor: { value: c }, uThickness: { value: thickness } },
    ]),
    vertexShader: OUTLINE_VERTEX,
    fragmentShader: OUTLINE_FRAGMENT,
    side: THREE.BackSide,
    fog: true,
  });
  // Les uniforms partagés gardent la même référence pour tous les contours.
  material.uniforms.uResolution = outlineUniforms.uResolution;
  material.uniforms.uPixelRatio = outlineUniforms.uPixelRatio;
  outlineMaterialCache.set(key, material);
  return material;
}

const smoothGeometryCache = new WeakMap();

/** Copie de la géométrie aux normales lissées : évite les "trous" de contour aux arêtes vives. */
function smoothedGeometry(geometry) {
  const cached = smoothGeometryCache.get(geometry);
  if (cached) return cached;
  const positionsOnly = new THREE.BufferGeometry();
  positionsOnly.setAttribute('position', geometry.getAttribute('position'));
  if (geometry.index) positionsOnly.setIndex(geometry.index);
  const smooth = mergeVertices(positionsOnly, 1e-4);
  smooth.computeVertexNormals();
  smoothGeometryCache.set(geometry, smooth);
  return smooth;
}

const noRaycast = () => {};

export function addOutline(mesh, { thickness = 2.2, color = INK } = {}) {
  const outline = new THREE.Mesh(
    smoothedGeometry(mesh.geometry),
    outlineMaterial(color, thickness),
  );
  outline.name = 'outline';
  outline.userData.isOutline = true;
  outline.raycast = noRaycast;
  mesh.add(outline);
  return outline;
}

/** Contour d'un InstancedMesh : partage la même matrice d'instances. */
export function addInstancedOutline(instanced, { thickness = 1.6, color = INK } = {}) {
  const outline = new THREE.InstancedMesh(
    smoothedGeometry(instanced.geometry),
    outlineMaterial(color, thickness),
    instanced.count,
  );
  outline.instanceMatrix = instanced.instanceMatrix;
  outline.frustumCulled = false;
  outline.userData.isOutline = true;
  outline.raycast = noRaycast;
  instanced.add(outline);
  return outline;
}

/** Ajoute un contour à chaque mesh de la hiérarchie (sauf `userData.noOutline`). */
export function outlineTree(root, options) {
  const meshes = [];
  root.traverse((obj) => {
    if (obj.isMesh && !obj.userData.isOutline && !obj.userData.noOutline) meshes.push(obj);
  });
  for (const mesh of meshes) addOutline(mesh, mesh.userData.outline ?? options);
  return root;
}

/** Mesh toon avec ombres et contour, en une ligne. */
export function toonMesh(geometry, material, { outline = {}, cast = true, receive = true } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  if (outline) addOutline(mesh, outline);
  return mesh;
}

// --- Halos & textures procédurales -------------------------------------------

let glowTexture = null;

export function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

export function glowSprite(color, size = 1, opacity = 0.8) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  sprite.scale.setScalar(size);
  sprite.userData.noOutline = true;
  return sprite;
}

export function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
