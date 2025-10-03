// --- TravelinMan Main Game Screen ---
// Uses Three.js and Perlin noise for terrain

/* global THREE, perlinNoise */

// --- Configs ---
const MAP_SIZE = 24;     // number of grid vertices per side
const MAP_SCALE = 10;    // world units per side
const POINT_COUNT = 8;   // intermediate nodes
const CONNECTIONS = 3;   // avg connections per node

const canvas = document.getElementById('three-canvas');
const messageEl = document.getElementById('message');
const startBtn = document.getElementById('start-btn');

// --- THREE.js Setup ---
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88bbff);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 100);
camera.position.set(0, 13, 15);
camera.lookAt(0, 0, 0);
const light = new THREE.DirectionalLight(0xffffff, 1.1);
light.position.set(2, 6, 5);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.7));

// --- Generate Terrain ---
function generateTerrainMesh(size, scale) {
  const geometry = new THREE.PlaneGeometry(scale, scale, size-1, size-1);
  geometry.rotateX(-Math.PI/2);
  const seed = Math.random() * 1000;
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    const vx = geometry.attributes.position.getX(i);
    const vz = geometry.attributes.position.getZ(i);
    const h = perlinNoise.simplex2((vx+seed)/5, (vz+seed)/5) * 1.5;
    geometry.attributes.position.setY(i, h);
  }
  geometry.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ color: 0x6ac47e, flatShading: true });
  return new THREE.Mesh(geometry, mat);
}
const terrain = generateTerrainMesh(MAP_SIZE, MAP_SCALE);
scene.add(terrain);

// --- Generate Graph Nodes ---
function randOnEdge(side) {
  // side: 0=left, 1=right
  const y = Math.random() * MAP_SCALE - MAP_SCALE/2;
  const x = side === 0 ? -MAP_SCALE/2 : MAP_SCALE/2;
  return { x, y };
}
function randNode() {
  return {
    x: Math.random() * (MAP_SCALE-2) - (MAP_SCALE-2)/2,
    y: Math.random() * (MAP_SCALE-2) - (MAP_SCALE-2)/2,
  };
}

const nodes = [];
nodes.push({ ...randOnEdge(0), type: 'start' }); // Start
for(let i=0; i<POINT_COUNT; ++i) nodes.push({ ...randNode(), type: 'mid' });
nodes.push({ ...randOnEdge(1), type: 'end' }); // End

const startIdx = 0, endIdx = nodes.length-1;

// --- Generate Connections (undirected) ---
const edges = [];
for (let i = 0; i < nodes.length; ++i) {
  let targets = [];
  while (targets.length < CONNECTIONS) {
    let j = Math.floor(Math.random() * nodes.length);
    if (j !== i && !targets.includes(j)) targets.push(j);
  }
  for (const j of targets) {
    // Avoid duplicates
    if (!edges.find(e => (e[0] === i && e[1] === j) || (e[0] === j && e[1] === i))) {
      edges.push([i, j]);
    }
  }
}

// --- Visualize Nodes & Edges ---
const nodeMeshes = [];
const edgeMeshes = [];
function addNodeMesh(node, idx) {
  const color = node.type === 'start' ? 0x2196f3 : node.type === 'end' ? 0xff5252 : 0xffe082;
  const geo = new THREE.SphereGeometry(0.35, 14, 12);
  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(node.x, 0.45, node.y);
  mesh.userData = { idx };
  scene.add(mesh);
  nodeMeshes.push(mesh);
}
function addEdgeMesh(a, b) {
  const mat = new THREE.LineBasicMaterial({ color: 0x333333 });
  const pts = [
    new THREE.Vector3(nodes[a].x, 0.5, nodes[a].y),
    new THREE.Vector3(nodes[b].x, 0.5, nodes[b].y)
  ];
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  edgeMeshes.push(line);
}
for(const [a,b] of edges) addEdgeMesh(a, b);
for(let i=0; i<nodes.length; ++i) addNodeMesh(nodes[i], i);

// --- Path Selection ---
let playerPath = [startIdx];
let choosing = true;
let selectable = nextSelectable(startIdx, playerPath);

function nextSelectable(current, pathSoFar) {
  return edges.filter(e => e.includes(current))
    .map(e => e[0] === current ? e[1] : e[0])
    .filter(idx => !pathSoFar.includes(idx));
}

// Highlight selectable nodes
function updateSelectable() {
  nodeMeshes.forEach((mesh, idx) => {
    mesh.material.emissive.setHex(selectable.includes(idx) ? 0xffff00 : 0x000000);
  });
}

// Handle clicks on nodes
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (!choosing) return;
  const mouse = {
    x: (event.offsetX / renderer.domElement.width) * 2 - 1,
    y: - (event.offsetY / renderer.domElement.height) * 2 + 1
  };
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(nodeMeshes);
  if (intersects.length > 0) {
    const idx = intersects[0].object.userData.idx;
    if (selectable.includes(idx)) {
      playerPath.push(idx);
      if (idx === endIdx) {
        choosing = false;
        messageEl.textContent = "Ready! Press Start Race.";
        startBtn.style.display = "";
      } else {
        selectable = nextSelectable(idx, playerPath);
        if (selectable.length === 0) {
          messageEl.textContent = "No further paths! Undo?";
        }
      }
      updateSelectable();
      redrawPlayerPath();
    }
  }
});

// Draw player's selected path
let playerLine = null;
function redrawPlayerPath() {
  if (playerLine) scene.remove(playerLine);
  if (playerPath.length < 2) return;
  const pts = playerPath.map(i => new THREE.Vector3(nodes[i].x, 0.75, nodes[i].y));
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color: 0x00cfff, linewidth: 4 });
  playerLine = new THREE.Line(geo, mat);
  scene.add(playerLine);
}

// --- Enemy chooses random path ---
function enemyRandomPath() {
  let path = [startIdx];
  let curr = startIdx;
  while(curr !== endIdx) {
    let nexts = nextSelectable(curr, path);
    if (nexts.length === 0) break;
    curr = nexts[Math.floor(Math.random() * nexts.length)];
    path.push(curr);
    if (path.length > 20) break; // fail-safe
  }
  if (path[path.length-1] !== endIdx) return enemyRandomPath(); // try again
  return path;
}

// --- Race Animation ---
let enemyPath = [];
let playerMarker = null, enemyMarker = null;
function startRace() {
  startBtn.style.display = "none";
  messageEl.textContent = "Racing!";
  enemyPath = enemyRandomPath();
  drawEnemyPath();
  animateRace();
}
startBtn.onclick = startRace;

let enemyLine = null;
function drawEnemyPath() {
  if (enemyLine) scene.remove(enemyLine);
  const pts = enemyPath.map(i => new THREE.Vector3(nodes[i].x, 0.75, nodes[i].y));
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineDashedMaterial({ color: 0xff1744, dashSize: 0.3, gapSize: 0.15 });
  enemyLine = new THREE.Line(geo, mat);
  scene.add(enemyLine);
}

// Animate markers along their paths
function animateRace() {
  // Place markers
  if (playerMarker) scene.remove(playerMarker);
  if (enemyMarker) scene.remove(enemyMarker);
  playerMarker = makeMarker(0x03a9f4);
  enemyMarker = makeMarker(0xd50000);
  scene.add(playerMarker); scene.add(enemyMarker);

  let t = 0;
  const total = Math.max(playerPath.length, enemyPath.length) * 70;
  function animate() {
    t++;
    moveMarker(playerMarker, playerPath, t/total);
    moveMarker(enemyMarker, enemyPath, t/total);

    renderer.render(scene, camera);
    if (t < total) {
      requestAnimationFrame(animate);
    } else {
      // Who won?
      if (playerPath.length < enemyPath.length) {
        messageEl.textContent = "Player wins!";
      } else if (playerPath.length > enemyPath.length) {
        messageEl.textContent = "Enemy wins!";
      } else {
        messageEl.textContent = "It's a tie!";
      }
      choosing = false;
    }
  }
  animate();
}

function makeMarker(color) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 10),
    new THREE.MeshLambertMaterial({ color })
  );
}
function moveMarker(marker, path, t) {
  // t: 0 to 1, progress along full path
  let totalSegs = path.length-1;
  let idx = Math.floor(t * totalSegs);
  let frac = (t * totalSegs) - idx;
  if (idx >= totalSegs) idx = totalSegs-1, frac = 1;
  if (idx < 0) idx = 0, frac = 0;
  const a = nodes[path[idx]], b = nodes[path[idx+1]];
  if (!a || !b) return;
  marker.position.set(
    a.x + (b.x - a.x)*frac,
    1.1,
    a.y + (b.y - a.y)*frac
  );
}

// --- Resize ---
function resize() {
  const w = window.innerWidth, h = window.innerHeight * 0.8;
  renderer.setSize(w, h, false);
  camera.aspect = w/h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// --- Initial Render/Animation Loop ---
function renderLoop() {
  renderer.render(scene, camera);
  requestAnimationFrame(renderLoop);
}
renderLoop();
updateSelectable();
