import {
  type BufferGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  type Material,
} from 'three';

/**
 * One instanced mesh with a fixed number of slots, filled from scratch every
 * frame. Instances are only ever scaled and moved, never rotated (but for
 * the tumble of `addTumbling`), so the matrix is written directly. Nothing is allocated per frame.
 */
export class Batch {
  readonly mesh: InstancedMesh;
  /** The same instances drawn again as a dark hull, when the batch was given an outline material. */
  readonly outline: InstancedMesh | null;
  private readonly matrices: Float32Array;
  private readonly colors: Float32Array | null;
  /** Two extra numbers per instance, read by the material's shader (the punch of a big rat). */
  private readonly aux: Float32Array | null;
  private readonly auxAttribute: InstancedBufferAttribute | null;
  private readonly capacity: number;
  private count = 0;

  constructor(
    geometry: BufferGeometry,
    material: Material | Material[],
    capacity: number,
    tinted = false,
    outline: Material | null = null,
    auxName = '',
  ) {
    this.capacity = capacity;
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    if (outline) {
      this.outline = new InstancedMesh(geometry, outline, capacity);
      // One buffer of matrices serves both meshes.
      this.outline.instanceMatrix = this.mesh.instanceMatrix;
      this.outline.frustumCulled = false;
      this.outline.count = 0;
    } else {
      this.outline = null;
    }
    this.matrices = this.mesh.instanceMatrix.array as Float32Array;
    this.matrices.fill(0);
    if (tinted) {
      this.colors = new Float32Array(capacity * 3).fill(1);
      this.mesh.instanceColor = new InstancedBufferAttribute(this.colors, 3);
      this.mesh.instanceColor.setUsage(DynamicDrawUsage);
    } else {
      this.colors = null;
    }
    if (auxName !== '') {
      this.aux = new Float32Array(capacity * 2);
      this.auxAttribute = new InstancedBufferAttribute(this.aux, 2);
      this.auxAttribute.setUsage(DynamicDrawUsage);
      geometry.setAttribute(auxName, this.auxAttribute);
    } else {
      this.aux = null;
      this.auxAttribute = null;
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
    m[o + 6] = 0;
    m[o + 9] = 0;
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
    if (this.aux) {
      this.aux[this.count * 2] = 0;
      this.aux[this.count * 2 + 1] = 0;
    }
    this.count++;
    return true;
  }

  /** Sets the two extra numbers of the instance added last. Only for batches created with `auxName`. */
  setAux(a: number, b: number): void {
    if (!this.aux || this.count === 0) return;
    this.aux[(this.count - 1) * 2] = a;
    this.aux[(this.count - 1) * 2 + 1] = b;
  }

  /**
   * Adds an instance of size `s` turned head over heels by `angle` radians about a point
   * `pivot` model units above its base.
   */
  addTumbling(x: number, y: number, z: number, s: number, angle: number, pivot: number): boolean {
    if (!this.add(x, y, z, s, s, s)) return false;
    const o = (this.count - 1) * 16;
    const m = this.matrices;
    const c = Math.cos(angle) * s;
    const n = Math.sin(angle) * s;
    m[o + 5] = c;
    m[o + 6] = n;
    m[o + 9] = -n;
    m[o + 10] = c;
    m[o + 13] = y + pivot * (s - c);
    m[o + 14] = z - pivot * n;
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
    if (this.outline) this.outline.count = this.count;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, this.count * 16);
    mesh.instanceMatrix.needsUpdate = true;
    if (this.auxAttribute) {
      this.auxAttribute.clearUpdateRanges();
      this.auxAttribute.addUpdateRange(0, this.count * 2);
      this.auxAttribute.needsUpdate = true;
    }
    if (mesh.instanceColor) {
      mesh.instanceColor.clearUpdateRanges();
      mesh.instanceColor.addUpdateRange(0, this.count * 3);
      mesh.instanceColor.needsUpdate = true;
    }
  }
}
