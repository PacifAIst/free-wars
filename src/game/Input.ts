import { DRAG_DIRECTION, DRAG_SENSITIVITY, RELEASE_MOMENTUM_SECONDS } from './constants';

/** What the game loop needs from an input device. Lets tests drive the loop. */
export interface InputSource {
  /**
   * Returns the shooter target change (gu) accumulated since the last call,
   * and resets it. `cellPx` is the current size of one grid unit in CSS px.
   */
  consumeTargetDelta(cellPx: number): number;
  /** Keyboard direction: -1 left, 0 none, +1 right. */
  keyDir(): number;
  /** True once per tap, click, Enter or Space. */
  takeTap(): boolean;
  /** True once per pause request (P or Escape). */
  takePause(): boolean;
}

const TAP_MAX_MOVE_PX = 10;
const TAP_MAX_MS = 350;
/** Smoothing for the release velocity estimate, 0..1 (higher = more recent). */
const VELOCITY_BLEND = 0.5;
/** A finger that rested this long before lifting carries no momentum. */
const MOMENTUM_STALE_MS = 80;

/**
 * Unified drag input (SPEC section 5): pointer events only, so mouse, touch and
 * pen behave the same. Arrow keys and A/D are the desktop alternative.
 */
export class Input implements InputSource {
  private dragPx = 0;
  private pointerId: number | null = null;
  private lastX = 0;
  private lastMoveMs = 0;
  private velocityPxPerSec = 0;
  private downX = 0;
  private downY = 0;
  private downMs = 0;
  private moved = 0;
  private left = false;
  private right = false;
  private tap = false;
  private pause = false;

  attach(target: HTMLElement): void {
    target.addEventListener('pointerdown', this.onPointerDown);
    target.addEventListener('pointermove', this.onPointerMove);
    target.addEventListener('pointerup', this.onPointerUp);
    target.addEventListener('pointercancel', this.onPointerCancel);
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  consumeTargetDelta(cellPx: number): number {
    const px = this.dragPx;
    this.dragPx = 0;
    // The map follows the finger, so the shooter moves the other way along the lane.
    return (-DRAG_DIRECTION * DRAG_SENSITIVITY * px) / cellPx;
  }

  keyDir(): number {
    return (this.right ? 1 : 0) - (this.left ? 1 : 0);
  }

  takeTap(): boolean {
    const t = this.tap;
    this.tap = false;
    return t;
  }

  takePause(): boolean {
    const p = this.pause;
    this.pause = false;
    return p;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.lastX = e.clientX;
    this.downX = e.clientX;
    this.downY = e.clientY;
    this.downMs = e.timeStamp;
    this.lastMoveMs = e.timeStamp;
    this.velocityPxPerSec = 0;
    this.moved = 0;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    const dx = e.clientX - this.lastX;
    const dt = e.timeStamp - this.lastMoveMs;
    this.lastX = e.clientX;
    this.lastMoveMs = e.timeStamp;
    this.dragPx += dx;
    this.moved = Math.max(this.moved, Math.hypot(e.clientX - this.downX, e.clientY - this.downY));
    if (dt > 0) {
      const instant = (dx / dt) * 1000;
      this.velocityPxPerSec += (instant - this.velocityPxPerSec) * VELOCITY_BLEND;
    }
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    if (this.moved <= TAP_MAX_MOVE_PX && e.timeStamp - this.downMs <= TAP_MAX_MS) {
      this.tap = true;
    } else if (e.timeStamp - this.lastMoveMs <= MOMENTUM_STALE_MS) {
      // Release momentum: carry a little of the flick into the target.
      this.dragPx += this.velocityPxPerSec * RELEASE_MOMENTUM_SECONDS;
    }
    this.velocityPxPerSec = 0;
  };

  private readonly onPointerCancel = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.velocityPxPerSec = 0;
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.left = true;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.right = true;
        break;
      case 'Enter':
      case 'Space':
        if (!e.repeat) this.tap = true;
        break;
      case 'KeyP':
      case 'Escape':
        if (!e.repeat) this.pause = true;
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') this.right = false;
  };

  private readonly onBlur = (): void => {
    this.left = false;
    this.right = false;
  };
}
