/**
 * Standard 2D Vector representation for space navigation and physics calculation.
 */
export class Vector2D {
  x: number;
  y: number;

  /**
   * Creates a 2D Vector.
   * @param x - The x-coordinate.
   * @param y - The y-coordinate.
   */
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  /**
   * Returns a copy of this vector.
   * @returns A new Vector2D copy.
   */
  clone(): Vector2D {
    return new Vector2D(this.x, this.y);
  }

  /**
   * Adds another vector to this one.
   * @param v - The vector to add.
   * @returns A new Vector2D.
   */
  add(v: Vector2D): Vector2D {
    return new Vector2D(this.x + v.x, this.y + v.y);
  }

  /**
   * Subtracts another vector from this one.
   * @param v - The vector to subtract.
   * @returns A new Vector2D.
   */
  subtract(v: Vector2D): Vector2D {
    return new Vector2D(this.x - v.x, this.y - v.y);
  }

  /**
   * Multiplies this vector by a scalar.
   * @param scalar - The scalar multiplier.
   * @returns A new Vector2D.
   */
  multiply(scalar: number): Vector2D {
    return new Vector2D(this.x * scalar, this.y * scalar);
  }

  /**
   * Computes the dot product with another vector.
   * @param v - The other vector.
   * @returns The dot product.
   */
  dot(v: Vector2D): number {
    return this.x * v.x + this.y * v.y;
  }

  /**
   * Computes the magnitude (length) of this vector.
   * @returns The magnitude.
   */
  magnitude(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  /**
   * Returns a normalized (unit) vector in the same direction.
   * Handles division-by-zero safely by returning a zero-vector if magnitude is 0.
   * @returns A new normalized Vector2D.
   */
  normalize(): Vector2D {
    const mag = this.magnitude();
    if (mag === 0 || !isFinite(mag)) {
      return new Vector2D(0, 0);
    }
    const x = this.x / mag;
    const y = this.y / mag;
    if (!isFinite(x) || !isFinite(y)) {
      return new Vector2D(0, 0);
    }
    return new Vector2D(x, y);
  }

  /**
   * Computes the distance between this vector and another.
   * @param v - The other vector.
   * @returns The distance.
   */
  distance(v: Vector2D): number {
    return Math.sqrt((this.x - v.x) ** 2 + (this.y - v.y) ** 2);
  }
}
