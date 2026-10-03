import * as THREE from 'three';

/**
 * Ciel, étoiles et mer de nuages. Les couleurs sont pilotées par les thèmes
 * (themes.js) : chaque uniform de couleur est mis à jour par world.setTheme.
 */

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize( position );
  vec4 pos = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_Position = pos.xyww; // toujours au fond
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uBelow;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform float uAurora;
uniform float uFlash;
uniform float uTime;
varying vec3 vDir;

void main() {
  vec3 d = normalize( vDir );
  float h = d.y;
  float sunDot = dot( d, normalize( uSunDir ) );

  // Dégradé vertical en bandes douces
  vec3 col = mix( uHorizon, uMid, smoothstep( 0.02, 0.32, h ) );
  col = mix( col, uTop, smoothstep( 0.28, 0.85, h ) );
  col = mix( col, uBelow, smoothstep( 0.0, -0.2, h ) );

  // Lueur chaude autour du soleil, en paliers façon dessin animé
  float glow = smoothstep( 0.55, 1.0, sunDot ) * ( 1.0 - smoothstep( 0.0, 0.45, abs( h ) ) );
  col = mix( col, uGlow, floor( glow * 4.0 ) / 4.0 * 0.7 );

  // Disque solaire + halos concentriques
  float disc = smoothstep( 0.9965, 0.9972, sunDot );
  float ring1 = smoothstep( 0.988, 0.9887, sunDot ) * 0.35;
  float ring2 = smoothstep( 0.972, 0.9727, sunDot ) * 0.18;
  col = mix( col, uSun, clamp( disc + ring1 + ring2, 0.0, 1.0 ) );

  // Aurores boréales : rideaux ondulants quantifiés
  if ( uAurora > 0.0 ) {
    float wave = sin( d.x * 7.0 + uTime * 0.25 + sin( d.z * 5.0 - uTime * 0.18 ) * 1.6 );
    float curtain = smoothstep( 0.03, 0.18, h ) * ( 1.0 - smoothstep( 0.45, 0.8, h ) );
    float a = floor( smoothstep( 0.35, 1.0, wave ) * curtain * 3.0 ) / 3.0;
    vec3 auroraCol = mix( vec3( 0.25, 1.0, 0.62 ), vec3( 0.62, 0.38, 1.0 ), smoothstep( 0.25, 0.6, h ) );
    col = mix( col, auroraCol, a * 0.6 * uAurora );
  }

  // Éclair (orage)
  col += vec3( 0.75, 0.82, 1.0 ) * uFlash * 0.45;

  gl_FragColor = vec4( col, 1.0 );
  #include <colorspace_fragment>
}
`;

export function createSky(sunDirection) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color() },
      uMid: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
      uBelow: { value: new THREE.Color() },
      uSun: { value: new THREE.Color() },
      uSunDir: { value: sunDirection.clone().normalize() },
      uAurora: { value: 0 },
      uFlash: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), material);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  mesh.userData.noOutline = true;
  return mesh;
}

// --- Étoiles scintillantes ---------------------------------------------------

export function createStars(count = 420, rand = Math.random) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const theta = rand() * Math.PI * 2;
    const y = 0.25 + rand() * 0.75; // uniquement le haut du ciel
    const r = Math.sqrt(1 - y * y);
    positions.set([Math.cos(theta) * r * 450, y * 450, Math.sin(theta) * r * 450], i * 3);
    seeds[i] = rand();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uAlpha: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uAlpha;
      varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * mv;
        float twinkle = 0.55 + 0.45 * sin( uTime * ( 1.0 + aSeed * 2.5 ) + aSeed * 40.0 );
        float height = normalize( position ).y;
        vAlpha = twinkle * smoothstep( 0.3 - 0.25 * uAlpha, 0.7 - 0.3 * uAlpha, height ) * uAlpha;
        gl_PointSize = ( 1.5 + aSeed * 2.5 ) * uPixelRatio;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float star = smoothstep( 0.5, 0.0, abs( c.x ) + abs( c.y ) ); // petite étoile en losange
        gl_FragColor = vec4( vec3( 1.0, 0.96, 0.9 ), star * vAlpha );
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -9;
  return points;
}

// --- Mer de nuages -----------------------------------------------------------

const SEA_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uLight;
uniform vec3 uFoam;
uniform vec3 uFogColor;
varying vec3 vWorld;

float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float noise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash( i ), hash( i + vec2( 1, 0 ) ), u.x ),
              mix( hash( i + vec2( 0, 1 ) ), hash( i + vec2( 1, 1 ) ), u.x ), u.y );
}
float fbm( vec2 p ) {
  float v = 0.0, a = 0.5;
  for ( int i = 0; i < 5; i++ ) { v += a * noise( p ); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}

void main() {
  vec2 p = vWorld.xz * 0.05 + vec2( uTime * 0.015, uTime * 0.008 );
  float n = fbm( p + 0.6 * fbm( p * 0.7 - uTime * 0.01 ) );

  // Quantification en paliers : rendu "dessin animé"
  vec3 col = uDeep;
  col = mix( col, uMid, step( 0.42, n ) );
  col = mix( col, uLight, step( 0.53, n ) );
  col = mix( col, uFoam, step( 0.64, n ) );

  float dist = length( vWorld.xz - cameraPosition.xz );
  col = mix( col, uFogColor, smoothstep( 30.0, 190.0, dist ) );
  gl_FragColor = vec4( col, 1.0 );
  #include <colorspace_fragment>
}
`;

export function createCloudSea() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color() },
      uMid: { value: new THREE.Color() },
      uLight: { value: new THREE.Color() },
      uFoam: { value: new THREE.Color() },
      uFogColor: { value: new THREE.Color() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4( position, 1.0 );
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: SEA_FRAGMENT,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), material);
  mesh.position.y = -16;
  mesh.userData.noOutline = true;
  return mesh;
}
