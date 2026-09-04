import * as THREE from "three";
import { Block, MAX_PIECES_PER_ISLAND, PIECES, PIECE_TYPES, canPlace, pieceCells } from "@kaboom-bay/shared";
import { blockColor } from "../rendering/palette.js";

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _m = new THREE.Matrix4();
const GREEN = new THREE.Color(0x62d26f);
const RED = new THREE.Color(0xff4b3e);
const MOVE_THRESHOLD = 7; // px: less than this between down and up = a tap, not an orbit

/**
 * Free-form building on your own island. Raycasts the island mesh, snaps a ghost of the selected
 * piece to the hit face, colours it green/red with the shared placement rules, and sends
 * PLACE_PIECE / REMOVE_PIECE intents. Works with mouse (hover ghost, right-click removes) and
 * touch (tap places, Remove mode button).
 */
export class BuildController {
  constructor({ canvas, camera, scene, island, net, getPieceCount, pieceAt, onChange, isBlocked = () => false }) {
    this.canvas = canvas;
    this.camera = camera;
    this.island = island;
    this.net = net;
    this.getPieceCount = getPieceCount;
    this.pieceAt = pieceAt; // (x, y, z) -> pieceId owned by me, or null
    this.isBlocked = isBlocked; // (x, y, z) -> true if the hero stands there (can't build on yourself)
    this.onChange = onChange;

    this.enabled = false;
    this.type = Block.WALL;
    this.rot = 0;
    this.mode = "place"; // place | remove
    this.hover = null; // { anchor:[x,y,z], ok, reason } or { removeId }
    this.pointer = null;
    this.centerMode = false; // first person: aim with the crosshair, Match calls updateCenter()/commit()

    this.ghost = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.02, 1.02, 1.02),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }),
      16,
    );
    this.ghost.count = 0;
    this.ghost.frustumCulled = false;
    this.ghost.renderOrder = 5;
    scene.add(this.ghost);

    this._down = (e) => this._onDown(e);
    this._move = (e) => this._onMove(e);
    this._up = (e) => this._onUp(e);
    this._key = (e) => this._onKey(e);
    canvas.addEventListener("pointerdown", this._down);
    canvas.addEventListener("pointermove", this._move);
    canvas.addEventListener("pointerup", this._up);
    window.addEventListener("keydown", this._key);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) { this.ghost.count = 0; this.hover = null; }
    this.onChange?.();
  }

  setType(type) { if (PIECES[type]) { this.type = type; this.mode = "place"; this._refresh(); } }
  rotate() { this.rot = (this.rot + 1) & 3; this._refresh(); }
  setMode(mode) { this.mode = mode; this._refresh(); }
  get pieceCount() { return this.getPieceCount(); }
  get budget() { return MAX_PIECES_PER_ISLAND; }

  _onKey(e) {
    if (!this.enabled || e.target?.tagName === "INPUT") return;
    const n = Number(e.key);
    if (n >= 1 && n <= PIECE_TYPES.length) this.setType(PIECE_TYPES[n - 1]);
    else if (e.code === "KeyR") this.rotate();
    else if (e.code === "KeyX") this.setMode(this.mode === "remove" ? "place" : "remove"); // Escape is not used: browsers reserve it for fullscreen exit
  }

  _onDown(e) {
    if (!this.enabled || this.centerMode) return;
    if (this.pointer) { this.pointer = null; return; } // second finger: camera gesture
    this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, button: e.button, moved: false };
    this._updateHover(e);
  }

  _onMove(e) {
    if (!this.enabled || this.centerMode) return;
    if (this.pointer && e.pointerId === this.pointer.id) {
      if (Math.hypot(e.clientX - this.pointer.x, e.clientY - this.pointer.y) > MOVE_THRESHOLD) this.pointer.moved = true;
      return; // dragging = orbit; don't chase the ghost around
    }
    if (e.pointerType === "mouse") this._updateHover(e);
  }

  _onUp(e) {
    if (!this.enabled || this.centerMode || !this.pointer || e.pointerId !== this.pointer.id) return;
    const p = this.pointer;
    this.pointer = null;
    if (p.moved) return;
    this._updateHover(e);
    if (!this.hover) return;
    if (p.button === 2 || this.mode === "remove") {
      if (this.hover.removeId) this.net.send("remove_piece", this.hover.removeId);
    } else if (this.hover.ok) {
      const [x, y, z] = this.hover.anchor;
      this.net.send("place_piece", { type: this.type, x, y, z, rot: this.rot });
    }
  }

  _refresh() {
    this.onChange?.();
    if (this.centerMode) this.updateCenter();
    else if (this._lastEvent) this._updateHover(this._lastEvent);
  }

  /** First person: hover whatever the crosshair points at. Call every frame. */
  updateCenter() {
    if (!this.enabled) return;
    this._hoverAt(0, 0, this.mode === "remove");
  }

  /**
   * Touch: hover the screen centre, and if that spot can't take the piece (a tree, a wall, water), try a
   * ring of nearby points so PLACE lands on the closest valid ground instead of doing nothing.
   */
  updateCenterNear() {
    if (!this.enabled) return;
    const isRemove = this.mode === "remove";
    const offsets = [[0, 0], [0.08, 0], [-0.08, 0], [0, 0.08], [0, -0.08], [0.08, 0.08], [-0.08, 0.08], [0.08, -0.08], [-0.08, -0.08], [0.16, 0], [-0.16, 0], [0, 0.16], [0, -0.16], [0.16, 0.16], [-0.16, 0.16], [0.16, -0.16], [-0.16, -0.16]];
    for (const [dx, dy] of offsets) {
      this._hoverAt(dx, dy, isRemove);
      if (isRemove ? this.hover?.removeId : this.hover?.ok) return;
    }
    this._hoverAt(0, 0, isRemove); // nothing valid nearby: show the red ghost at the centre
  }

  /** First person: act on the current crosshair hover. */
  commit(kind) {
    if (!this.enabled) return false;
    if (kind === "remove") {
      this._hoverAt(0, 0, true);
      const id = this.hover?.removeId;
      if (id) this.net.send("remove_piece", id);
      this._hoverAt(0, 0, this.mode === "remove");
      return !!id;
    }
    if (!this.hover) return false;
    if (this.hover.ok) { const [x, y, z] = this.hover.anchor; this.net.send("place_piece", { type: this.type, x, y, z, rot: this.rot }); return true; }
    return false;
  }

  _updateHover(e) {
    this._lastEvent = e;
    const r = this.canvas.getBoundingClientRect();
    this._hoverAt(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1, this.mode === "remove" || e.button === 2);
  }

  _hoverAt(nx, ny, isRemove) {
    _ndc.set(nx, ny);
    _ray.setFromCamera(_ndc, this.camera);
    const hit = _ray.intersectObject(this.island.mesher.mesh, false)[0];
    if (!hit) { this.hover = null; this.ghost.count = 0; return; }
    const n = hit.face.normal;
    const { grid, origin } = this.island;

    if (isRemove) {
      const sx = Math.floor(hit.point.x - n.x * 0.5 - origin.x), sy = Math.floor(hit.point.y - n.y * 0.5 - origin.y), sz = Math.floor(hit.point.z - n.z * 0.5 - origin.z);
      const removeId = this.pieceAt(sx, sy, sz);
      this.hover = removeId ? { removeId, cell: [sx, sy, sz] } : null;
      this._drawGhost(removeId ? [[sx, sy, sz]] : [], RED);
      return;
    }

    // empty cell in front of the hit face
    const cx = Math.floor(hit.point.x + n.x * 0.5 - origin.x), cy = Math.floor(hit.point.y + n.y * 0.5 - origin.y), cz = Math.floor(hit.point.z + n.z * 0.5 - origin.z);
    // centre the footprint on the cursor, lowest cells at the target height
    const rel = pieceCells(this.type, 0, 0, 0, this.rot);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, y, z] of rel) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    const ax = cx - Math.floor((minX + maxX) / 2), ay = cy - minY, az = cz - Math.floor((minZ + maxZ) / 2);
    let res = canPlace(grid, this.type, ax, ay, az, this.rot, { pieceCount: this.getPieceCount() });
    if (res.ok && res.cells.some(([x, y, z]) => this.isBlocked(x, y, z))) res = { ok: false, reason: "hero" };
    const cells = res.ok ? res.cells : pieceCells(this.type, ax, ay, az, this.rot);
    this.hover = { anchor: [ax, ay, az], ok: res.ok, reason: res.reason };
    this._drawGhost(cells, res.ok ? GREEN : RED);
  }

  _drawGhost(cells, color) {
    const { origin } = this.island;
    const n = Math.min(cells.length, this.ghost.instanceMatrix.count);
    for (let i = 0; i < n; i++) {
      const [x, y, z] = cells[i];
      _m.makeTranslation(origin.x + x + 0.5, origin.y + y + 0.5, origin.z + z + 0.5);
      this.ghost.setMatrixAt(i, _m);
    }
    this.ghost.count = n;
    this.ghost.instanceMatrix.needsUpdate = true;
    this.ghost.material.color.copy(color).lerp(blockColor(this.type), this.mode === "remove" ? 0 : 0.35);
  }

  dispose() {
    this.canvas.removeEventListener("pointerdown", this._down);
    this.canvas.removeEventListener("pointermove", this._move);
    this.canvas.removeEventListener("pointerup", this._up);
    window.removeEventListener("keydown", this._key);
    this.ghost.parent?.remove(this.ghost);
    this.ghost.dispose();
  }
}
