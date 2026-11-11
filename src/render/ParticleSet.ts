import { Particle, ParticleContainer, type Texture } from 'pixi.js';

/**
 * A ParticleContainer with a fixed stock of Particle objects, created once.
 * Each frame the renderer calls begin(), takes as many particles as it needs
 * with next(), then end(). Nothing is allocated per frame.
 */
export class ParticleSet {
  readonly container: ParticleContainer;
  private readonly stock: Particle[] = [];
  private used = 0;

  constructor(capacity: number, texture: Texture) {
    this.container = new ParticleContainer({
      texture,
      // Every property changes from frame to frame: slots are reused for
      // different entities, with different sprites, sizes and tints.
      dynamicProperties: { position: true, vertex: true, uvs: true, color: true, rotation: false },
    });
    for (let i = 0; i < capacity; i++) {
      this.stock.push(new Particle({ texture, anchorX: 0.5, anchorY: 0.5 }));
    }
  }

  begin(): void {
    this.used = 0;
  }

  /** The next free particle, or null when the stock is used up. */
  next(): Particle | null {
    return this.used < this.stock.length ? this.stock[this.used++] : null;
  }

  end(): void {
    const list = this.container.particleChildren;
    if (list.length === this.used) return;
    while (list.length < this.used) list.push(this.stock[list.length]);
    list.length = this.used;
    this.container.update();
  }
}
