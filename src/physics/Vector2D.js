/**
 * Standard 2D Vector representation for space navigation and physics calculation.
 */
export class Vector2D {
  /**
   * Creates a 2D Vector.
   * @param {number} x - The x-coordinate.
   * @param {number} y - The y-coordinate.
   */
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  /**
   * Returns a copy of this vector.
   * @returns {Vector2D} A new Vector2D copy.
   */
  clone() {
    return new Vector2D(this.x, this.y);
  }

  /**
   * Adds another vector to this one.
   * @param {Vector2D} v - The vector to add.
   * @returns {Vector2D} A new Vector2D.
   */
  add(v) {
    return new Vector2D(this.x + v.x, this.y + v.y);
  }

  /**
   * Subtracts another vector from this one.
   * @param {Vector2D} v - The vector to subtract.
   * @returns {Vector2D} A new Vector2D.
   */
  subtract(v) {
    return new Vector2D(this.x - v.x, this.y - v.y);
  }

  /**
   * Multiplies this vector by a scalar.
   * @param {number} scalar - The scalar multiplier.
   * @returns {Vector2D} A new Vector2D.
   */
  multiply(scalar) {
    return new Vector2D(this.x * scalar, this.y * scalar);
  }

  /**
   * Computes the dot product with another vector.
   * @param {Vector2D} v - The other vector.
   * @returns {number} The dot product.
   */
  dot(v) {
    return this.x * v.x + this.y * v.y;
  }

  /**
   * Computes the magnitude (length) of this vector.
   * @returns {number} The magnitude.
   */
  magnitude() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  /**
   * Returns a normalized (unit) vector in the same direction.
   * Handles division-by-zero safely by returning a zero-vector if magnitude is 0.
   * @returns {Vector2D} A new normalized Vector2D.
   */
  normalize() {
    const mag = this.magnitude();
    if (mag === 0) {
      return new Vector2D(0, 0);
    }
    return new Vector2D(this.x / mag, this.y / mag);
  }

  /**
   * Computes the distance between this vector and another.
   * @param {Vector2D} v - The other vector.
   * @returns {number} The distance.
   */
  distance(v) {
    return Math.sqrt((this.x - v.x) ** 2 + (this.y - v.y) ** 2);
  }
}
