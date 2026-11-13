import {
  type BufferGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  type Material,
} from 'three';

/**
 * One instanced mesh with a fixed number of slots, filled from scratch every
 * frame. Instances are only ever scaled and moved, never rotated, so the
 * matrix is written directly. Nothing is allocated per frame.
 */
export class Batch {
  readonly mesh: InstancedMesh;
  private readonly matrices: Float32Array;
  private readonly colors: Float32Array | null;
  private readonly capacity: number;
  private count = 0;

  constructor(geometry: BufferGeometry, material: Material | Material[], capacity: number, tinted = false) {
    this.capacity = capacity;
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.matrices = this.mesh.instanceMatrix.array as Float32Array;
    this.matrices.fill(0);
    if (tinted) {
      this.colors = new Float32Array(capacity * 3).fill(1);
      this.mesh.instanceColor = new InstancedBufferAttribute(this.colors, 3);
      this.mesh.instanceColor.setUsage(DynamicDrawUsage);
    } else {
      this.colors = null;
    }
  }

  begin(): void {
    this.count = 0;
  }

  /** Adds an instance. Returns false when every slot is taken. */
  add(x: number, y: number, z: number, sx: number, sy: number, sz: number): boolean {
    if (this.count >= this.capacity) return false;
    const o = this.count * 16;
    const m = this.matrices;
    m[o] = sx;
    m[o + 5] = sy;
    m[o + 10] = sz;
    m[o + 12] = x;
    m[o + 13] = y;
    m[o + 14] = z;
    m[o + 15] = 1;
    if (this.colors) {
      const c = this.count * 3;
      this.colors[c] = 1;
      this.colors[c + 1] = 1;
      this.colors[c + 2] = 1;
    }
    this.count++;
    return true;
  }

  /** Colours the instance added last. Only for batches created with `tinted`. */
  tint(r: number, g: number, b: number): void {
    if (!this.colors || this.count === 0) return;
    const c = (this.count - 1) * 3;
    this.colors[c] = r;
    this.colors[c + 1] = g;
    this.colors[c + 2] = b;
  }

  end(): void {
    const { mesh } = this;
    mesh.count = this.count;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, this.count * 16);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.clearUpdateRanges();
      mesh.instanceColor.addUpdateRange(0, this.count * 3);
      mesh.instanceColor.needsUpdate = true;
    }
  }
}
