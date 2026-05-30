import { Vector2D } from "../physics/Vector2D.js";
import { NEBULAE } from "../engine/Nebulae.js";

/**
 * Manages the HTML5 Canvas context, viewport camera tracking, parallax starfields, custom vector drawing, and particle effects.
 */
export class CanvasRenderer {
  /**
   * Creates a CanvasRenderer.
   * @param {HTMLCanvasElement} canvas - Element to bind.
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    // Camera offset viewport position
    this.camera = new Vector2D(0, 0);

    // Starfield Parallax Layers
    this.stars = [];
    this.initStarfield();

    // Warp animation parameters (Endless Sky Sector Jumping)
    this.isWarping = false;
    this.warpTimer = 0;
    this.warpTunnelStars = [];

    // Navigation arrow target (set from main.js)
    this.navigationTarget = null;

    // Visual Explosion/Spark Particles
    this.particles = [];

    // Floating text feedback array for cargo collections
    this.pickupTexts = [];

    // Visual Gaseous Nebula Vapor Particles
    this.nebulaParticles = [];
    for (const neb of NEBULAE) {
      for (let i = 0; i < 30; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * neb.radius;
        this.nebulaParticles.push({
          nebulaId: neb.id,
          x: neb.position.x + Math.cos(angle) * dist,
          y: neb.position.y + Math.sin(angle) * dist,
          radius: 60 + Math.random() * 80,
          vx: (Math.random() - 0.5) * 12,
          vy: (Math.random() - 0.5) * 12,
          alpha: 0.12 + Math.random() * 0.14,
          color: neb.particleColor,
          pulseSpeed: 0.2 + Math.random() * 0.3,
          pulsePhase: Math.random() * Math.PI * 2,
        });
      }
    }
  }

  /**
   * Builds three depth layers of stars to create a premium spatial depth scrolling effect.
   */
  initStarfield() {
    const starCount = 300;
    const galaxySize = 6000; // bounds

    for (let i = 0; i < starCount; i++) {
      this.stars.push({
        x: (Math.random() - 0.5) * galaxySize,
        y: (Math.random() - 0.5) * galaxySize,
        size: Math.random() * 2 + 0.5,
        parallax: Math.random() * 0.7 + 0.2, // speed scalar (0.2 to 0.9)
        color: `hsl(${Math.random() * 40 + 200}, 80%, ${Math.random() * 30 + 70}%)`, // cool nebula blue-whites
      });
    }
  }

  /**
   * Triggers window resizing.
   */
  resize() {
    const container = this.canvas.parentElement;
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;
  }

  /**
   * Places an explosion splash at coordinates.
   * @param {number} x - coordinate.
   * @param {number} y - coordinate.
   * @param {string} [color] - Spark colors.
   */
  spawnExplosion(x, y, color = "#ff4a1c") {
    // Spawn spark particles
    const particleCount = 20 + Math.floor(Math.random() * 15);
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 150 + 50;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: Math.random() * 3 + 1,
        color: color,
        alpha: 1,
        decay: Math.random() * 1.5 + 0.8,
      });
    }
  }

  /**
   * Renders the complete game state scene.
   * @param {number} dt - Time delta.
   * @param {Ship} playerShip - Player entity.
   * @param {Array} entities - Active physics entities.
   * @param {SpaceEntity} targetEntity - Current locked target.
   * @param {string} [localPlayerId] - Local player connection ID.
   * @param {Array} [fleetMembers] - Teammates in the current fleet.
   * @param {string} [fleetName] - Name/Code of the current fleet.
   * @param {Object} [activeSectorEvent] - Active threat event.
   */
  draw(
    dt,
    playerShip,
    entities,
    targetEntity,
    localPlayerId = null,
    fleetMembers = [],
    fleetName = null,
    activeSectorEvent = null,
  ) {
    this.activeSectorEvent = activeSectorEvent;
    this.localPlayerId = localPlayerId;
    // 1. Update Camera to center on Player
    if (playerShip) {
      this.camera.x = playerShip.position.x - this.canvas.width / 2;
      this.camera.y = playerShip.position.y - this.canvas.height / 2;

      // Apply high-fidelity camera shake during hyperspace warp jumps
      if (this.isWarping) {
        const shakeAmt = 12;
        this.camera.x += (Math.random() - 0.5) * shakeAmt;
        this.camera.y += (Math.random() - 0.5) * shakeAmt;
      }
    }

    // 2. Clear Context with beautiful space black
    this.ctx.fillStyle = "#020205";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 3. Render Parallax Starfield or Warp Tunnel streaking stars
    if (this.isWarping) {
      this.drawWarpStarfield(dt);
    } else {
      this.drawStarfield();
    }

    // 4. Update and Draw Spark Particles
    this.drawParticles(dt);

    // 5. Draw Game Entities in camera space
    this.ctx.save();
    this.ctx.translate(-this.camera.x, -this.camera.y);

    // Render Tactical Nebula gas clouds & slow-drifting vapor
    this.drawNebulae(dt);

    // Calculate viewport bounds with safety padding to prevent pop-in
    const pad = 200;
    const viewLeft = this.camera.x - pad;
    const viewRight = this.camera.x + this.canvas.width + pad;
    const viewTop = this.camera.y - pad;
    const viewBottom = this.camera.y + this.canvas.height + pad;

    for (const ent of entities) {
      // Viewport broad-phase culling
      const radius = ent.radius || 20;
      const left = ent.position.x - radius;
      const right = ent.position.x + radius;
      const top = ent.position.y - radius;
      const bottom = ent.position.y + radius;

      const isVisible =
        right >= viewLeft &&
        left <= viewRight &&
        bottom >= viewTop &&
        top <= viewBottom;
      if (!isVisible) continue;

      if (ent.type === "planet") {
        this.drawPlanet(ent);
      } else if (ent.type === "projectile") {
        this.drawProjectile(ent);
      } else if (ent.type === "ship") {
        this.drawShip(ent, localPlayerId, fleetMembers, fleetName);
      } else if (ent.type === "cargo_pod") {
        this.drawCargoPod(ent);
      } else if (ent.type === "warp_gate") {
        this.drawWarpGate(ent);
      } else {
        this.drawAsteroid(ent);
      }
    }

    // Draw active Tractor Beam lightning tethers if player ship has the outfitter module equipped
    if (
      playerShip &&
      playerShip.outfits &&
      playerShip.outfits.includes("Tractor Beam Matrix")
    ) {
      for (const ent of entities) {
        if (ent.type === "cargo_pod") {
          const dist = playerShip.position.distance(ent.position);
          if (dist > 1 && dist <= 250) {
            this.drawTractorBeam(
              playerShip.position.x,
              playerShip.position.y,
              ent.position.x,
              ent.position.y,
            );
          }
        }
      }
    }

    // Draw active Boarding Gravimetric tether if player has a disabled ship locked in close range
    if (
      playerShip &&
      targetEntity &&
      !targetEntity.isDestroyed &&
      targetEntity.isDisabled
    ) {
      const dist = playerShip.position.distance(targetEntity.position);
      if (dist <= 250) {
        this.drawBoardingTether(
          playerShip.position.x,
          playerShip.position.y,
          targetEntity.position.x,
          targetEntity.position.y,
        );
      }
    }

    // Draw target marker
    if (targetEntity && entities.includes(targetEntity)) {
      this.drawTargetIndicator(targetEntity);
    }

    this.ctx.restore();

    // 6. Draw HUD pointer arrows for offscreen target/planets
    if (playerShip) {
      this.drawOffScreenPointers(
        playerShip,
        entities,
        targetEntity,
        localPlayerId,
        fleetMembers,
      );
    }

    // 6b. Draw Hyperlane Navigation Guiding Arrow
    if (playerShip && this.navigationTarget) {
      this.drawNavigationArrow(playerShip, this.navigationTarget);
    }

    // 7. Draw holographic sweeping HUD radar overlay
    if (playerShip) {
      this.drawRadar(dt, playerShip, entities, localPlayerId, fleetMembers);
    }

    // 8. Render floating pickups overlay
    this.drawPickupTexts(dt);
  }

  /**
   * Renders the soft structural cloud boundaries and slow-drifting vapor particles.
   * @param {number} dt - Frame time delta.
   */
  drawNebulae(dt) {
    // 1. Draw large structural gradient backgrounds for each nebula
    for (const neb of NEBULAE) {
      this.ctx.save();
      const grad = this.ctx.createRadialGradient(
        neb.position.x,
        neb.position.y,
        0,
        neb.position.x,
        neb.position.y,
        neb.radius,
      );
      grad.addColorStop(0, neb.color);
      grad.addColorStop(0.5, neb.color.replace(/[\d.]+\)$/, "0.08)"));
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");

      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.arc(neb.position.x, neb.position.y, neb.radius, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }

    // 2. Draw drifting cloud vapor particles
    for (const p of this.nebulaParticles) {
      // Update position
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Keep particles bounded within the nebula's radius (rebound gently)
      const neb = NEBULAE.find((n) => n.id === p.nebulaId);
      if (neb) {
        const dx = p.x - neb.position.x;
        const dy = p.y - neb.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > neb.radius) {
          const angle =
            Math.atan2(dy, dx) + Math.PI + (Math.random() - 0.5) * 0.5;
          p.vx = Math.cos(angle) * (6 + Math.random() * 8);
          p.vy = Math.sin(angle) * (6 + Math.random() * 8);
          p.x = neb.position.x + Math.cos(angle) * (neb.radius - 15);
          p.y = neb.position.y + Math.sin(angle) * (neb.radius - 15);
        }
      }

      // Slowly breathe alpha
      p.pulsePhase += p.pulseSpeed * dt;
      const currentAlpha = p.alpha * (0.7 + 0.3 * Math.sin(p.pulsePhase));

      // Draw soft fuzzy vapor puff
      this.ctx.save();
      const grad = this.ctx.createRadialGradient(
        p.x,
        p.y,
        0,
        p.x,
        p.y,
        p.radius,
      );
      grad.addColorStop(0, p.color.replace(/[\d.]+\)$/, `${currentAlpha})`));
      grad.addColorStop(
        0.5,
        p.color.replace(/[\d.]+\)$/, `${currentAlpha * 0.4})`),
      );
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");

      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }
  }

  /**
   * Renders starfield shifting dynamically relative to viewport.
   */
  drawStarfield() {
    for (const star of this.stars) {
      // Calculate screen coordinate with parallax shifting
      const sx = star.x - this.camera.x * star.parallax;
      const sy = star.y - this.camera.y * star.parallax;

      // Wrap coordinates around screen to make stars endless
      let finalX = sx % this.canvas.width;
      let finalY = sy % this.canvas.height;
      if (finalX < 0) finalX += this.canvas.width;
      if (finalY < 0) finalY += this.canvas.height;

      this.ctx.fillStyle = star.color;
      // High-performance square pixels instead of slow curves/arc paths
      const size = star.size * 2;
      this.ctx.fillRect(finalX - star.size, finalY - star.size, size, size);
    }
  }

  /**
   * Advances and draws sparks.
   */
  drawParticles(dt) {
    const activeParticles = [];
    const cx = this.camera.x;
    const cy = this.camera.y;
    const w = this.canvas.width;
    const h = this.canvas.height;

    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.alpha -= p.decay * dt;

      if (p.alpha > 0) {
        const screenX = p.x - cx;
        const screenY = p.y - cy;
        const radius = p.radius || 2;

        // Perform fast viewport culling for particles
        if (
          screenX >= -radius &&
          screenX <= w + radius &&
          screenY >= -radius &&
          screenY <= h + radius
        ) {
          this.ctx.globalAlpha = p.alpha;
          this.ctx.fillStyle = p.color;

          // High-performance fillRect instead of costly save/restore, path arcs, and CPU shadowBlur
          const size = radius * 2;
          this.ctx.fillRect(screenX - radius, screenY - radius, size, size);
        }

        activeParticles.push(p);
      }
    }

    this.ctx.globalAlpha = 1.0; // restore baseline opacity
    this.particles = activeParticles;
  }

  /**
   * Spawns a floating text pop-up at target space coordinates.
   */
  addPickupText(text, x, y, color = "#ffd700") {
    this.pickupTexts.push({
      text: text,
      x: x,
      y: y,
      alpha: 1.0,
      color: color,
      vy: -45,
    });
  }

  /**
   * Animates and renders floating cargo feedback texts.
   */
  drawPickupTexts(dt) {
    const activeTexts = [];
    for (const t of this.pickupTexts) {
      t.y += t.vy * dt;
      t.alpha -= dt * 0.85;

      if (t.alpha > 0) {
        this.ctx.save();
        this.ctx.globalAlpha = t.alpha;
        this.ctx.fillStyle = t.color;
        this.ctx.font = "bold 13px 'Outfit', sans-serif";
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = t.color;
        this.ctx.textAlign = "center";
        this.ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
        this.ctx.lineWidth = 3.5;
        this.ctx.strokeText(t.text, t.x - this.camera.x, t.y - this.camera.y);
        this.ctx.fillText(t.text, t.x - this.camera.x, t.y - this.camera.y);
        this.ctx.restore();
        activeTexts.push(t);
      }
    }
    this.pickupTexts = activeTexts;
  }

  /**
   * Helper to convert hex color to rgba color with alpha.
   */
  hexToRgba(hex, alpha) {
    if (!hex || typeof hex !== "string" || !hex.startsWith("#")) {
      return `rgba(50, 100, 255, ${alpha})`;
    }
    let c = hex.substring(1);
    if (c.length === 3) {
      c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    }
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Draws a planet with atmosphere aura and rings if large.
   */
  drawPlanet(planet) {
    this.ctx.save();

    const planetColor = planet.color || "#4d6fff";

    // Atmosphere glow
    const glowGrad = this.ctx.createRadialGradient(
      planet.position.x,
      planet.position.y,
      planet.radius * 0.9,
      planet.position.x,
      planet.position.y,
      planet.radius * 1.3,
    );
    glowGrad.addColorStop(0, this.hexToRgba(planetColor, 0.4));
    glowGrad.addColorStop(1, this.hexToRgba(planetColor, 0));

    this.ctx.fillStyle = glowGrad;
    this.ctx.beginPath();
    this.ctx.arc(
      planet.position.x,
      planet.position.y,
      planet.radius * 1.3,
      0,
      Math.PI * 2,
    );
    this.ctx.fill();

    // Planet core sphere
    const sphereGrad = this.ctx.createRadialGradient(
      planet.position.x - planet.radius * 0.3,
      planet.position.y - planet.radius * 0.3,
      planet.radius * 0.1,
      planet.position.x,
      planet.position.y,
      planet.radius,
    );
    sphereGrad.addColorStop(0, planetColor);
    sphereGrad.addColorStop(0.5, this.hexToRgba(planetColor, 0.4));
    sphereGrad.addColorStop(1, this.hexToRgba(planetColor, 0.1));

    this.ctx.fillStyle = sphereGrad;
    this.ctx.beginPath();
    this.ctx.arc(
      planet.position.x,
      planet.position.y,
      planet.radius,
      0,
      Math.PI * 2,
    );
    this.ctx.fill();

    // Orbital ring/outline
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.arc(
      planet.position.x,
      planet.position.y,
      planet.radius + 30,
      0,
      Math.PI * 2,
    );
    this.ctx.stroke();

    // Landing ring label
    this.ctx.fillStyle = "rgba(100, 180, 255, 0.6)";
    this.ctx.font = "12px Orbitron, sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.fillText(
      planet.name,
      planet.position.x,
      planet.position.y - planet.radius - 12,
    );

    // Active Sector Event planetary indicators
    if (
      this.activeSectorEvent &&
      this.activeSectorEvent.planetName === planet.name
    ) {
      if (this.activeSectorEvent.type === "siege") {
        // Red flashing outer warning field at 400u
        const flashAlpha = 0.3 + Math.sin(Date.now() / 200) * 0.15;
        this.ctx.strokeStyle = `rgba(255, 59, 48, ${flashAlpha})`;
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([8, 12]);
        this.ctx.beginPath();
        this.ctx.arc(planet.position.x, planet.position.y, 400, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Danger zone shade
        const dangerGrad = this.ctx.createRadialGradient(
          planet.position.x,
          planet.position.y,
          planet.radius * 1.3,
          planet.position.x,
          planet.position.y,
          400,
        );
        dangerGrad.addColorStop(0, "rgba(255, 59, 48, 0)");
        dangerGrad.addColorStop(
          1,
          `rgba(255, 59, 48, ${0.05 * (0.5 + Math.sin(Date.now() / 300) * 0.5)})`,
        );
        this.ctx.fillStyle = dangerGrad;
        this.ctx.beginPath();
        this.ctx.arc(planet.position.x, planet.position.y, 400, 0, Math.PI * 2);
        this.ctx.fill();

        // Warning Label floating above
        this.ctx.fillStyle = "#ff3b30";
        this.ctx.font = "bold 11px Orbitron, sans-serif";
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = "#ff3b30";
        this.ctx.fillText(
          "⚠️ UNDER SIEGE - DEFEND PORT",
          planet.position.x,
          planet.position.y - planet.radius - 30,
        );
        this.ctx.shadowBlur = 0;
      } else if (this.activeSectorEvent.type === "emp") {
        // Neon-Cyan crackling field at 400u
        const pulseAlpha = 0.25 + Math.sin(Date.now() / 150) * 0.15;
        this.ctx.strokeStyle = `rgba(0, 242, 254, ${pulseAlpha})`;
        this.ctx.lineWidth = 1.5;
        this.ctx.setLineDash([4, 6]);
        this.ctx.beginPath();
        this.ctx.arc(planet.position.x, planet.position.y, 400, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Electric blue atmosphere shade
        const empGrad = this.ctx.createRadialGradient(
          planet.position.x,
          planet.position.y,
          planet.radius * 1.3,
          planet.position.x,
          planet.position.y,
          400,
        );
        empGrad.addColorStop(0, "rgba(0, 242, 254, 0)");
        empGrad.addColorStop(1, "rgba(0, 242, 254, 0.05)");
        this.ctx.fillStyle = empGrad;
        this.ctx.beginPath();
        this.ctx.arc(planet.position.x, planet.position.y, 400, 0, Math.PI * 2);
        this.ctx.fill();

        // Crackling lightning storm arcs (15% chance per frame)
        if (Math.random() < 0.15) {
          this.ctx.strokeStyle = "rgba(0, 242, 254, 0.85)";
          this.ctx.lineWidth = 1.5;
          this.ctx.shadowBlur = 6;
          this.ctx.shadowColor = "#00f2fe";
          this.ctx.beginPath();
          const startAngle = Math.random() * Math.PI * 2;
          let currX = planet.position.x + Math.cos(startAngle) * planet.radius;
          let currY = planet.position.y + Math.sin(startAngle) * planet.radius;
          this.ctx.moveTo(currX, currY);

          const steps = 4;
          const stepDist = (400 - planet.radius) / steps;
          for (let j = 0; j < steps; j++) {
            const angle = startAngle + (Math.random() - 0.5) * 0.4;
            currX += Math.cos(angle) * stepDist;
            currY += Math.sin(angle) * stepDist;
            this.ctx.lineTo(currX, currY);
          }
          this.ctx.stroke();
          this.ctx.shadowBlur = 0;
        }

        // Warning Label floating above
        this.ctx.fillStyle = "#00f2fe";
        this.ctx.font = "bold 11px Orbitron, sans-serif";
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = "#00f2fe";
        this.ctx.fillText(
          "⚡ ION EMP STORM - NO SHIELDS",
          planet.position.x,
          planet.position.y - planet.radius - 30,
        );
        this.ctx.shadowBlur = 0;
      }
    }

    this.ctx.restore();
  }

  /**
   * Renders a floating, rotating, glowing cargo pod capsule.
   */
  drawCargoPod(pod) {
    this.ctx.save();
    this.ctx.translate(pod.position.x, pod.position.y);
    this.ctx.rotate(pod.heading || 0);

    let color = "#ffffff";
    switch (pod.resourceType) {
      case "luxuries":
        color = "#ffd700"; // Gold
        break;
      case "minerals":
        color = "#cd7f32"; // Bronze / Copper
        break;
      case "food":
        color = "#39ff14"; // Neon Green
        break;
      case "electronics":
        color = "#00f0ff"; // Electric Cyan
        break;
      case "contraband":
        color = "#d03ffc"; // Neon Purple
        break;
      case "machinery":
        color = "#b0b0b0"; // Metallic Gray
        break;
    }

    const pulse = 1.0 + 0.15 * Math.sin(Date.now() * 0.005);
    const radius = pod.radius || 8;

    this.ctx.shadowBlur = 10 * pulse;
    this.ctx.shadowColor = color;
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 1.5;

    // Hexagonal capsule shape
    this.ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const x = Math.cos(angle) * radius * pulse;
      const y = Math.sin(angle) * radius * pulse;
      if (i === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }
    this.ctx.closePath();
    this.ctx.fillStyle = "rgba(10, 10, 15, 0.85)";
    this.ctx.fill();
    this.ctx.stroke();

    // Inner glowing core
    this.ctx.beginPath();
    this.ctx.arc(0, 0, radius * 0.4 * pulse, 0, Math.PI * 2);
    this.ctx.fillStyle = color;
    this.ctx.shadowBlur = 15;
    this.ctx.fill();

    this.ctx.restore();
  }

  /**
   * Draws a crackling electric cyan lightning bolt connecting a ship to a cargo pod.
   */
  drawTractorBeam(x1, y1, x2, y2) {
    this.ctx.save();

    const beamColor = "#00f0ff";
    this.ctx.strokeStyle = beamColor;
    this.ctx.shadowColor = beamColor;

    // Outer glow thick path
    this.ctx.lineWidth = 4.5;
    this.ctx.shadowBlur = 15;
    this.ctx.globalAlpha = 0.4;
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();

    // Inner hot-white crackling lightning core
    this.ctx.globalAlpha = 1.0;
    this.ctx.lineWidth = 1.5;
    this.ctx.shadowBlur = 8;
    this.ctx.strokeStyle = "#ffffff";

    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Determine number of segments based on distance
    const segments = Math.max(4, Math.floor(dist / 25));

    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);

    const normalX = -dy / dist;
    const normalY = dx / dist;

    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const lx = x1 + dx * t;
      const ly = y1 + dy * t;
      // High-frequency electric jitter
      const offset = (Math.random() - 0.5) * 10;
      const px = lx + normalX * offset;
      const py = ly + normalY * offset;
      this.ctx.lineTo(px, py);
    }

    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();

    this.ctx.restore();
  }

  /**
   * Draws a glowing laser.
   */
  drawProjectile(proj) {
    // Pick different colors based on who fired (friendly vs hostile)
    const isFriendly =
      proj.ownerId === "player" || proj.ownerId === this.localPlayerId;
    const color = isFriendly ? "#00ffcc" : "#ff3333";

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 3;

    // Tail line
    const dir = new Vector2D(Math.cos(proj.heading), Math.sin(proj.heading));
    const tail = proj.position.subtract(dir.multiply(20));

    this.ctx.beginPath();
    this.ctx.moveTo(proj.position.x, proj.position.y);
    this.ctx.lineTo(tail.x, tail.y);
    this.ctx.stroke();
  }

  /**
   * Draws a ship with dynamic engines exhausts.
   */
  drawShip(ship, localPlayerId = null, fleetMembers = [], fleetName = null) {
    const isLocalPlayer =
      (localPlayerId && ship.id === localPlayerId) || ship.id === "player";
    const teammate =
      fleetMembers &&
      fleetMembers.find((m) => m.id === ship.id && m.id !== localPlayerId);
    const isTeammate = !!teammate;
    const isOtherPlayer =
      localPlayerId &&
      !isLocalPlayer &&
      !isTeammate &&
      ship.id !== "player" &&
      !ship.name.includes("Pirate") &&
      !ship.name.includes("Guard");

    // Check if ship is inside a nebula cloud
    let activeNeb = null;
    for (const neb of NEBULAE) {
      const dx = ship.position.x - neb.position.x;
      const dy = ship.position.y - neb.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= neb.radius) {
        activeNeb = neb;
        break;
      }
    }

    this.ctx.save();

    if (activeNeb) {
      if (isLocalPlayer || isTeammate) {
        this.ctx.globalAlpha = 0.45; // Shimmering translucent look for local feedback
      } else {
        this.ctx.globalAlpha = 0.12; // Deep stealth silhouette for rivals
      }
    }

    this.ctx.translate(ship.position.x, ship.position.y);

    // Draw Nameplate & Fleet Tag upright (before rotation to prevent text rotating)
    if (!ship.isDestroyed) {
      this.ctx.save();
      this.ctx.font = "11px Orbitron, sans-serif";
      this.ctx.textAlign = "center";

      let nameText = ship.name || "Commander";
      let textColor = "#a0a5b5";

      if (isLocalPlayer) {
        textColor = "#00ff88"; // Green for local player
        if (fleetName) {
          nameText = `[${fleetName}] ${nameText}`;
        }
      } else if (isTeammate) {
        textColor = "#c080ff"; // Glowing purple for teammate
        if (fleetName) {
          nameText = `[${fleetName}] ${nameText}`;
        }
      } else if (isOtherPlayer) {
        textColor = "#00ffcc"; // Neon cyan for other players
      }

      // Draw nameplate if it's a player or if it's connected
      if (isLocalPlayer || isTeammate || isOtherPlayer) {
        this.ctx.fillStyle = textColor;
        this.ctx.shadowBlur = 4;
        this.ctx.shadowColor = textColor;
        this.ctx.fillText(nameText, 0, -ship.radius * 1.8);
      }
      this.ctx.restore();
    }

    this.ctx.rotate(ship.heading);

    // Exhaust thrust flame — afterburner makes it longer, hotter, and adds a
    // bright cyan-white inner core so the player can SEE their boost engaging.
    if (ship.controls && ship.controls.isThrusting && !ship.isDestroyed) {
      const boosting = !!(
        ship.controls.isBoosting &&
        (ship.energy === undefined || ship.energy > 0) &&
        !ship.isOverheated
      );
      const baseLen = 20 + Math.random() * 15;
      const flameLen = boosting ? baseLen * 1.9 + Math.random() * 10 : baseLen;
      const flameSpread = boosting ? 7 : 5;

      this.ctx.fillStyle = boosting ? "#00f2fe" : "#ff6a00";
      this.ctx.shadowBlur = boosting ? 22 : 15;
      this.ctx.shadowColor = boosting ? "#00f2fe" : "#ffb300";
      this.ctx.beginPath();
      this.ctx.moveTo(-ship.radius, -flameSpread);
      this.ctx.lineTo(-ship.radius - flameLen, 0);
      this.ctx.lineTo(-ship.radius, flameSpread);
      this.ctx.closePath();
      this.ctx.fill();

      if (boosting) {
        // Hot inner core
        this.ctx.fillStyle = "#ffffff";
        this.ctx.shadowBlur = 12;
        this.ctx.shadowColor = "#ffffff";
        this.ctx.beginPath();
        const coreLen = flameLen * 0.55;
        this.ctx.moveTo(-ship.radius, -flameSpread * 0.45);
        this.ctx.lineTo(-ship.radius - coreLen, 0);
        this.ctx.lineTo(-ship.radius, flameSpread * 0.45);
        this.ctx.closePath();
        this.ctx.fill();
      }
    }

    // Draw Ship Hull
    // Assign sleek colors based on faction role
    let strokeColor = "#a0a5b5";
    let fillColor = "#181a21";

    if (isLocalPlayer) {
      strokeColor = "#00ff88"; // Neon green player
      fillColor = "#0b1c12";
    } else if (isTeammate) {
      strokeColor = "#a040fb"; // Neon purple teammate
      fillColor = "#180822"; // Deep purple theme
    } else if (ship.name === "Pirate Raider") {
      strokeColor = "#ff3b30"; // Crimson pirate
      fillColor = "#22080a";
    } else if (ship.name.includes("Guard")) {
      strokeColor = "#30d158"; // Emerald defense
      fillColor = "#08220f";
    } else if (isOtherPlayer) {
      strokeColor = "#00ffcc"; // Neon cyan other player
      fillColor = "#05181a";
    }

    this.ctx.strokeStyle = strokeColor;
    this.ctx.fillStyle = fillColor;
    this.ctx.lineWidth = 2.5;

    this.ctx.beginPath();
    // Sleek starfighter triangle coordinates
    this.ctx.moveTo(ship.radius * 1.2, 0); // nose tip
    this.ctx.lineTo(-ship.radius, -ship.radius * 0.8); // back wing left
    this.ctx.lineTo(-ship.radius * 0.5, 0); // aft cutout
    this.ctx.lineTo(-ship.radius, ship.radius * 0.8); // back wing right
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();

    // Shield bubble effect when active and damaged recently (colored by faction)
    if (ship.shield > 0 && ship.shield < ship.maxShield * 0.99) {
      const shieldRatio = ship.shield / ship.maxShield;
      let rippleColor = "0, 150, 255"; // Default blue
      if (isLocalPlayer) {
        rippleColor = "0, 255, 136"; // Neon green/teal for player
      } else if (isTeammate) {
        rippleColor = "160, 64, 251"; // Neon purple for teammate
      } else if (ship.name === "Pirate Raider") {
        rippleColor = "255, 59, 48"; // Crimson red for pirate
      } else if (ship.name.includes("Guard")) {
        rippleColor = "48, 209, 88"; // Emerald for guard
      } else if (isOtherPlayer) {
        rippleColor = "0, 255, 204"; // Cyan for other players
      }
      this.ctx.strokeStyle = `rgba(${rippleColor}, ${0.1 + (1 - shieldRatio) * 0.4})`;
      this.ctx.lineWidth = 2.5;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, ship.radius * 1.5, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    // 1. Render thermal reactor meltdown core glowing (Overheated ships)
    if (ship.isOverheated && !ship.isDestroyed) {
      this.ctx.save();
      this.ctx.fillStyle = `rgba(255, 23, 68, ${0.4 + Math.sin(Date.now() * 0.01) * 0.3})`;
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = "#ff1744";
      this.ctx.beginPath();
      this.ctx.arc(0, 0, ship.radius * 0.6, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }

    // 2. Render neon electric sparks branching outward (Disabled ships)
    if (ship.isDisabled && !ship.isDestroyed) {
      this.ctx.save();
      this.ctx.strokeStyle = "#00f2fe";
      this.ctx.lineWidth = 2;
      this.ctx.shadowBlur = 8;
      this.ctx.shadowColor = "#00f2fe";
      this.ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const angle = Math.random() * Math.PI * 2;
        const len = 8 + Math.random() * 12;
        const sx = Math.cos(angle) * (ship.radius * 0.4);
        const sy = Math.sin(angle) * (ship.radius * 0.4);
        this.ctx.moveTo(sx, sy);
        // Draw jagged electric bolt
        const midX =
          sx + Math.cos(angle + (Math.random() - 0.5) * 0.5) * (len * 0.5);
        const midY =
          sy + Math.sin(angle + (Math.random() - 0.5) * 0.5) * (len * 0.5);
        this.ctx.lineTo(midX, midY);
        this.ctx.lineTo(
          midX + Math.cos(angle) * (len * 0.5),
          midY + Math.sin(angle) * (len * 0.5),
        );
      }
      this.ctx.stroke();
      this.ctx.restore();
    }

    this.ctx.restore();
  }

  /**
   * Draws rotating vector-based rocks or glistening gem shards.
   */
  drawAsteroid(rock) {
    this.ctx.save();
    this.ctx.translate(rock.position.x, rock.position.y);
    this.ctx.rotate(rock.heading);

    let strokeColor = "#808285";
    let fillColor = "#1e2022";
    let shadowColor = "#808285";
    let shadowBlur = 2;

    if (rock.type === "gem_asteroid") {
      // Glistening gold or emerald based on deterministic ASCII hash of its ID
      const hashVal = rock.id ? rock.id.charCodeAt(0) : 0;
      const isGold = hashVal % 2 === 0;

      if (isGold) {
        strokeColor = "#ffd700"; // Rich Gold
        fillColor = "#2d2400"; // Dark amber core
        shadowColor = "#ffd700";
        shadowBlur = 12;
      } else {
        strokeColor = "#00ff66"; // Emerald green
        fillColor = "#00240d"; // Dark forest jade core
        shadowColor = "#00ff66";
        shadowBlur = 12;
      }
    }

    this.ctx.strokeStyle = strokeColor;
    this.ctx.fillStyle = fillColor;
    this.ctx.lineWidth = 2.5;
    this.ctx.shadowBlur = shadowBlur;
    this.ctx.shadowColor = shadowColor;

    // 8-point jagged circular polygon representation
    this.ctx.beginPath();
    const pts = 8;
    for (let i = 0; i < pts; i++) {
      const angle = (i / pts) * Math.PI * 2;
      // Procedural rock variations based on deterministic ID hashes
      const offset = rock.id
        ? (rock.id.charCodeAt(i % rock.id.length) % 5) - 2
        : 0;
      const r = rock.radius + offset;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();

    // Draw little sparkling inner details for gem asteroids
    if (rock.type === "gem_asteroid") {
      this.ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      // Draw glistening cross in the center
      this.ctx.moveTo(-rock.radius * 0.4, 0);
      this.ctx.lineTo(rock.radius * 0.4, 0);
      this.ctx.moveTo(0, -rock.radius * 0.4);
      this.ctx.lineTo(0, rock.radius * 0.4);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  /**
   * Draws targeting HUD markers around the current target.
   */
  drawTargetIndicator(target) {
    this.ctx.save();
    this.ctx.strokeStyle = "#ffb300";
    this.ctx.lineWidth = 1.5;
    this.ctx.shadowBlur = 5;
    this.ctx.shadowColor = "#ffb300";

    const boxSize = target.radius * 1.8;
    const x = target.position.x;
    const y = target.position.y;

    // Drawing elegant neon corner bracket locks
    this.ctx.beginPath();
    // Top Left
    this.ctx.moveTo(x - boxSize, y - boxSize + 6);
    this.ctx.lineTo(x - boxSize, y - boxSize);
    this.ctx.lineTo(x - boxSize + 6, y - boxSize);
    // Top Right
    this.ctx.moveTo(x + boxSize - 6, y - boxSize);
    this.ctx.lineTo(x + boxSize, y - boxSize);
    this.ctx.lineTo(x + boxSize, y - boxSize + 6);
    // Bottom Right
    this.ctx.moveTo(x + boxSize, y + boxSize - 6);
    this.ctx.lineTo(x + boxSize, y + boxSize);
    this.ctx.lineTo(x + boxSize - 6, y + boxSize);
    // Bottom Left
    this.ctx.moveTo(x - boxSize + 6, y + boxSize);
    this.ctx.lineTo(x - boxSize, y + boxSize);
    this.ctx.lineTo(x - boxSize, y + boxSize - 6);

    this.ctx.stroke();

    // Renders brief health overlay text above target
    if (target.type === "ship") {
      this.ctx.fillStyle = "#ffb300";
      this.ctx.font = "10px Orbitron, sans-serif";
      this.ctx.textAlign = "center";
      this.ctx.fillText(
        `${target.name} [Shield: ${Math.floor(target.shield)}]`,
        x,
        y - target.radius - 10,
      );
    }

    this.ctx.restore();
  }

  /**
   * Draws direction HUD arrows pointing toward targeted ships or planets when offscreen.
   */
  drawOffScreenPointers(
    player,
    entities,
    activeTarget,
    localPlayerId = null,
    fleetMembers = [],
  ) {
    const screenPadding = 20;
    const targets = [];

    // Always track activeTarget and planets
    if (activeTarget && entities.includes(activeTarget)) {
      let isVisible = true;
      if (activeTarget.type === "ship") {
        let insideNebula = false;
        for (const neb of NEBULAE) {
          const ndx = activeTarget.position.x - neb.position.x;
          const ndy = activeTarget.position.y - neb.position.y;
          const ndist = Math.sqrt(ndx * ndx + ndy * ndy);
          if (ndist <= neb.radius) {
            insideNebula = true;
            break;
          }
        }

        if (insideNebula) {
          const isTeammate =
            fleetMembers &&
            fleetMembers.some(
              (m) => m.id === activeTarget.id && m.id !== localPlayerId,
            );
          const dist = player.position.distance(activeTarget.position);
          if (!isTeammate && dist > 250) {
            isVisible = false;
          }
        }
      }

      if (isVisible) {
        targets.push({
          position: activeTarget.position,
          name: activeTarget.name || "Target",
          color: "#ffb300",
        });
      }
    }

    for (const ent of entities) {
      if (ent.type === "planet") {
        targets.push({
          position: ent.position,
          name: ent.name,
          color: "rgba(100, 180, 255, 0.8)",
        });
      }
    }

    // Track offscreen fleet members
    if (fleetMembers) {
      for (const member of fleetMembers) {
        if (member.id === localPlayerId) continue;
        // Don't draw pointer if teammate is in the local system and is close enough
        const teammateShip = entities.find(
          (e) => e.type === "ship" && e.id === member.id,
        );
        if (teammateShip) {
          // It will be drawn by standard entities, only draw pointer if offscreen
          targets.push({
            position: teammateShip.position,
            name: member.nickname,
            color: "#a040fb",
            isTeammate: true,
          });
        } else {
          // Teammate is offscreen or in other area/landed
          targets.push({
            position: new Vector2D(member.x, member.y),
            name: member.nickname,
            color: "#a040fb",
            isTeammate: true,
          });
        }
      }
    }

    // Remove duplicates pointing to same entity
    const uniqueTargets = [];
    const seenIds = new Set();
    for (const t of targets) {
      const key = `${t.position.x},${t.position.y}`;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        uniqueTargets.push(t);
      }
    }

    for (const t of uniqueTargets) {
      const dx = t.position.x - player.position.x;
      const dy = t.position.y - player.position.y;

      const distance = Math.sqrt(dx * dx + dy * dy);

      // Determine viewport bounding lines
      const halfW = this.canvas.width / 2;
      const halfH = this.canvas.height / 2;

      // If entity is off-screen, draw bounding pointer
      if (Math.abs(dx) > halfW || Math.abs(dy) > halfH) {
        const angle = Math.atan2(dy, dx);

        // Project onto screen boundaries (both branches below assign px and py).
        let px;
        let py;

        // Calculate intersection point with screen bounds
        const slope = dy / dx;
        if (Math.abs(dx) * halfH > Math.abs(dy) * halfW) {
          // Hits Left or Right edge
          px = dx > 0 ? this.canvas.width - screenPadding : screenPadding;
          py = halfH + (px - halfW) * slope;
        } else {
          // Hits Top or Bottom edge
          py = dy > 0 ? this.canvas.height - screenPadding : screenPadding;
          px = halfW + (py - halfH) / slope;
        }

        // Draw glowing arrow triangle pointing towards the entity
        this.ctx.save();
        this.ctx.translate(px, py);
        this.ctx.rotate(angle);

        this.ctx.fillStyle = t.color;
        this.ctx.shadowBlur = 5;
        this.ctx.shadowColor = t.color;

        this.ctx.beginPath();
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(-10, -5);
        this.ctx.lineTo(-8, 0);
        this.ctx.lineTo(-10, 5);
        this.ctx.closePath();
        this.ctx.fill();

        // Print distance and nickname above arrow
        this.ctx.rotate(-angle); // keep text vertical
        this.ctx.fillStyle = t.color;
        this.ctx.font = "8px Orbitron, sans-serif";
        this.ctx.textAlign = "center";

        let label = `${Math.round(distance)}u`;
        if (t.isTeammate) {
          label = `${t.name} (${Math.round(distance)}u)`;
        }
        this.ctx.fillText(label, 0, -10);

        this.ctx.restore();
      }
    }
  }

  /**
   * Renders the retro-modern holographic sweeping HUD radar panel.
   * @param {number} dt - Time delta.
   * @param {Ship} player - Local player ship.
   * @param {Array} entities - Space entities.
   * @param {string} localPlayerId - Player ID.
   * @param {Array} fleetMembers - Teammate data.
   */
  drawRadar(dt, player, entities, localPlayerId, fleetMembers) {
    const radarRadius = 75;
    const padding = 20;
    const cx = this.canvas.width - radarRadius - padding;
    const cy = this.canvas.height - radarRadius - padding;

    // Increment radar sweep angle
    this.radarSweepAngle = (this.radarSweepAngle || 0) + 1.8 * dt;
    const sweepAngle = this.radarSweepAngle % (Math.PI * 2);

    // 1. Draw Glassmorphic Radar Container Background
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, radarRadius, 0, Math.PI * 2);
    this.ctx.closePath();
    this.ctx.fillStyle = "rgba(10, 15, 30, 0.7)";
    this.ctx.fill();
    this.ctx.strokeStyle = "rgba(0, 242, 254, 0.3)";
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();

    // 2. Draw Concentric Scale Range Rings (25%, 50%, 75%, 100% of 3000u)
    this.ctx.strokeStyle = "rgba(0, 242, 254, 0.08)";
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([2, 4]); // dashed look for range rings
    const rings = [0.25, 0.5, 0.75, 1.0];
    for (const rRatio of rings) {
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, radarRadius * rRatio, 0, Math.PI * 2);
      this.ctx.stroke();
    }
    this.ctx.setLineDash([]); // reset line dash

    // 3. Draw Radar Crosshair Axes Grid
    this.ctx.strokeStyle = "rgba(0, 242, 254, 0.06)";
    this.ctx.beginPath();
    this.ctx.moveTo(cx - radarRadius, cy);
    this.ctx.lineTo(cx + radarRadius, cy);
    this.ctx.moveTo(cx, cy - radarRadius);
    this.ctx.lineTo(cx, cy + radarRadius);
    this.ctx.stroke();

    // 4. Draw Radar Sweeping Trail Slice (gradient trailing clockwise)
    this.ctx.beginPath();
    this.ctx.moveTo(cx, cy);
    // Draw sector arc trailing behind the sweep angle by 0.55 radians
    this.ctx.arc(cx, cy, radarRadius, sweepAngle - 0.55, sweepAngle);
    this.ctx.closePath();
    const trailGrad = this.ctx.createRadialGradient(
      cx,
      cy,
      0,
      cx,
      cy,
      radarRadius,
    );
    trailGrad.addColorStop(0, "rgba(0, 242, 254, 0.2)");
    trailGrad.addColorStop(0.8, "rgba(0, 242, 254, 0.06)");
    trailGrad.addColorStop(1, "rgba(0, 242, 254, 0)");
    this.ctx.fillStyle = trailGrad;
    this.ctx.fill();

    // 5. Draw Sweeping Neon Beam Line
    this.ctx.strokeStyle = "rgba(0, 242, 254, 0.85)";
    this.ctx.shadowBlur = 8;
    this.ctx.shadowColor = "rgba(0, 242, 254, 0.85)";
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.moveTo(cx, cy);
    this.ctx.lineTo(
      cx + Math.cos(sweepAngle) * radarRadius,
      cy + Math.sin(sweepAngle) * radarRadius,
    );
    this.ctx.stroke();
    this.ctx.shadowBlur = 0; // reset shadow

    // 6. Plot Surrounding Scanned Entities within range
    const MAX_RANGE = 3000;
    for (const ent of entities) {
      if (
        ent.id === "player" ||
        ent.id === localPlayerId ||
        ent.type === "projectile"
      )
        continue;

      const dx = ent.position.x - player.position.x;
      const dy = ent.position.y - player.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > MAX_RANGE) continue;

      // Stealth cloaking filter inside Nebula Clouds
      if (ent.type === "ship") {
        let insideNebula = false;
        for (const neb of NEBULAE) {
          const ndx = ent.position.x - neb.position.x;
          const ndy = ent.position.y - neb.position.y;
          const ndist = Math.sqrt(ndx * ndx + ndy * ndy);
          if (ndist <= neb.radius) {
            insideNebula = true;
            break;
          }
        }

        if (insideNebula) {
          const isTeammate =
            fleetMembers &&
            fleetMembers.some((m) => m.id === ent.id && m.id !== localPlayerId);
          // Hidden from radar scans unless teammate or close combat lock (<250u)
          if (!isTeammate && dist > 250) {
            continue;
          }
        }
      }

      // Calculate entity polar angle
      const relAngle = Math.atan2(dy, dx);

      // Determine intensity based on angle difference behind the sweep line
      let diff = (sweepAngle - relAngle) % (Math.PI * 2);
      if (diff < 0) diff += Math.PI * 2;
      const intensity = Math.max(0, 1 - diff / (Math.PI * 2));
      const alpha = Math.pow(intensity, 3); // curve alpha to drop off faster

      // Map to radar screen coords
      const screenDist = (dist / MAX_RANGE) * radarRadius;
      const ex = cx + Math.cos(relAngle) * screenDist;
      const ey = cy + Math.sin(relAngle) * screenDist;

      // Color-coding rules
      let color = `rgba(128, 130, 133, ${alpha})`; // Faint grey asteroid default
      let dotSize = 2;

      if (ent.type === "planet") {
        color = `rgba(0, 242, 254, ${alpha})`; // Holographic blue planet
        dotSize = 3.5;
      } else if (ent.type === "ship") {
        const isTeammate =
          fleetMembers &&
          fleetMembers.some((m) => m.id === ent.id && m.id !== localPlayerId);
        const isPirate =
          ent.name &&
          (ent.name.includes("Pirate") ||
            ent.name.includes("Raider") ||
            ent.name.includes("Marauder") ||
            ent.name.includes("Boss") ||
            ent.name.includes("Viper"));
        const isGuard =
          ent.name &&
          (ent.name.includes("Guard") ||
            ent.name.includes("Police") ||
            ent.name.includes("Navy") ||
            ent.name.includes("Aegis") ||
            ent.name.includes("Sentinel") ||
            ent.name.includes("Patrol"));
        const isMerchant =
          ent.name &&
          (ent.name.includes("freighter") ||
            ent.name.includes("Cargo") ||
            ent.name.includes("Hauler") ||
            ent.name.includes("Behemoth") ||
            ent.name.includes("Voyager") ||
            ent.name.includes("Galleon") ||
            ent.name.includes("Atlas") ||
            ent.name.includes("Hermes"));

        if (isTeammate) {
          color = `rgba(160, 64, 251, ${alpha})`; // Neon purple teammate
          dotSize = 3.5;
        } else if (isPirate) {
          color = `rgba(255, 59, 48, ${alpha})`; // Crimson pirate
          dotSize = 3.5;
        } else if (isGuard) {
          color = `rgba(48, 209, 88, ${alpha})`; // Emerald guard
          dotSize = 3;
        } else if (isMerchant) {
          color = `rgba(255, 230, 0, ${alpha})`; // Gold merchant
          dotSize = 3;
        } else {
          color = `rgba(0, 255, 204, ${alpha})`; // Cyan other player
          dotSize = 3.5;
        }
      }

      // Draw dot
      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      this.ctx.arc(ex, ey, dotSize, 0, Math.PI * 2);
      this.ctx.fill();

      // Additional planetary border ring to distinguish it
      if (ent.type === "planet") {
        this.ctx.strokeStyle = `rgba(0, 242, 254, ${alpha * 0.5})`;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.arc(ex, ey, dotSize + 2, 0, Math.PI * 2);
        this.ctx.stroke();
      }
    }

    // 7. Plot local player ship at center of radar
    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.rotate(player.heading);
    this.ctx.strokeStyle = "#00ff88"; // Green for player
    this.ctx.fillStyle = "rgba(0, 255, 136, 0.35)";
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.moveTo(5, 0); // nose tip
    this.ctx.lineTo(-4, -3); // back wing left
    this.ctx.lineTo(-2, 0); // cutout
    this.ctx.lineTo(-4, 3); // back wing right
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.restore();

    // 8. Draw Range Label Overlay
    this.ctx.fillStyle = "rgba(0, 242, 254, 0.4)";
    this.ctx.font = "8px Orbitron, sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.fillText("3000u", cx, cy + radarRadius - 6);

    this.ctx.restore();
  }

  /**
   * Renders a glowing, animated dashed gravimetric boarding tether between two points.
   */
  drawBoardingTether(x1, y1, x2, y2) {
    this.ctx.save();
    this.ctx.strokeStyle = "rgba(255, 230, 0, 0.85)";
    this.ctx.lineWidth = 2.0;
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = "#ffe600";
    this.ctx.setLineDash([5, 8]);
    this.ctx.lineDashOffset = -Math.floor(Date.now() * 0.02) % 13;

    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
    this.ctx.restore();
  }

  /**
   * Draws a rotating gravity well wormhole vortex stargate.
   * @param {Object} gate - Stargate warp portal entity.
   */
  drawWarpGate(gate) {
    this.ctx.save();

    // 1. Vortex background dark accretion disk
    this.ctx.fillStyle = "rgba(10, 5, 20, 0.95)";
    this.ctx.beginPath();
    this.ctx.arc(gate.position.x, gate.position.y, gate.radius, 0, Math.PI * 2);
    this.ctx.fill();

    // Subtle neon purple border ring
    this.ctx.strokeStyle = "#e040fb";
    this.ctx.lineWidth = 2.5;
    this.ctx.stroke();

    // Glow radial gradient
    const glowGrad = this.ctx.createRadialGradient(
      gate.position.x,
      gate.position.y,
      gate.radius * 0.5,
      gate.position.x,
      gate.position.y,
      gate.radius * 1.8,
    );
    glowGrad.addColorStop(0, "rgba(224, 64, 251, 0.5)");
    glowGrad.addColorStop(0.5, "rgba(172, 59, 255, 0.25)");
    glowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

    this.ctx.fillStyle = glowGrad;
    this.ctx.beginPath();
    this.ctx.arc(
      gate.position.x,
      gate.position.y,
      gate.radius * 1.8,
      0,
      Math.PI * 2,
    );
    this.ctx.fill();

    // 2. Concentric swirling rings (rotating with global time or custom angle)
    const time = Date.now() * 0.001;
    const numRings = 4;
    for (let r = 0; r < numRings; r++) {
      const angleOffset = (r * Math.PI) / 2;
      const speed = 1.2 + r * 0.4;
      const rotation = time * speed + angleOffset;
      const ringRadius = gate.radius * (0.35 + 0.18 * r);

      this.ctx.beginPath();
      this.ctx.ellipse(
        gate.position.x,
        gate.position.y,
        ringRadius,
        ringRadius * 0.65,
        rotation,
        0,
        Math.PI * 2,
      );
      this.ctx.strokeStyle = r % 2 === 0 ? "#e040fb" : "#00f2fe";
      this.ctx.lineWidth = 2.0;
      this.ctx.stroke();
    }

    // 3. Central core gravity singularity
    const singularityGrad = this.ctx.createRadialGradient(
      gate.position.x,
      gate.position.y,
      0,
      gate.position.x,
      gate.position.y,
      gate.radius * 0.45,
    );
    singularityGrad.addColorStop(0, "#ffffff");
    singularityGrad.addColorStop(0.3, "#e040fb");
    singularityGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

    this.ctx.fillStyle = singularityGrad;
    this.ctx.beginPath();
    this.ctx.arc(
      gate.position.x,
      gate.position.y,
      gate.radius * 0.45,
      0,
      Math.PI * 2,
    );
    this.ctx.fill();

    // 4. Stargate text label
    this.ctx.font = "bold 10px 'Orbitron', 'Inter', sans-serif";
    this.ctx.fillStyle = "#e040fb";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(
      (gate.name || "WARP GATE").toUpperCase(),
      gate.position.x,
      gate.position.y - gate.radius - 18,
    );

    if (gate.targetSector) {
      this.ctx.font = "8px 'Orbitron', 'Inter', sans-serif";
      this.ctx.fillStyle = "#00f2fe";
      this.ctx.fillText(
        `TO ${gate.targetSector.toUpperCase()}`,
        gate.position.x,
        gate.position.y - gate.radius - 6,
      );
    }

    this.ctx.restore();
  }

  /**
   * Renders the stellar warp streak tunnel animation.
   * @param {number} dt - frame tick delta time.
   */
  drawWarpStarfield(dt) {
    if (!this.isWarping) return;

    // Initialize warp tunnel stars if empty
    if (!this.warpTunnelStars || this.warpTunnelStars.length === 0) {
      this.warpTunnelStars = [];
      const numStars = 200;
      for (let i = 0; i < numStars; i++) {
        const angle = Math.random() * Math.PI * 2;
        this.warpTunnelStars.push({
          angle: angle,
          distance: Math.random() * (this.canvas.width / 2),
          speed: 600 + Math.random() * 1200,
          length: 30 + Math.random() * 70,
          color: `hsla(${260 + Math.random() * 80}, 100%, 80%, ${0.6 + Math.random() * 0.4})`,
        });
      }
    }

    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;

    for (const star of this.warpTunnelStars) {
      // Move stars outward from center
      star.distance += star.speed * dt;
      // Grow length as they accelerate
      star.length += star.speed * 0.2 * dt;

      // Wrap stars that go offscreen
      if (star.distance > Math.max(this.canvas.width, this.canvas.height)) {
        star.distance = Math.random() * 50;
        star.length = 15;
      }

      // Calculate screen positions
      const startX = centerX + Math.cos(star.angle) * star.distance;
      const startY = centerY + Math.sin(star.angle) * star.distance;
      const endX =
        centerX + Math.cos(star.angle) * (star.distance + star.length);
      const endY =
        centerY + Math.sin(star.angle) * (star.distance + star.length);

      // Render glowing streak
      this.ctx.beginPath();
      this.ctx.moveTo(startX, startY);
      this.ctx.lineTo(endX, endY);
      this.ctx.strokeStyle = star.color;
      this.ctx.lineWidth = 2.0;
      this.ctx.stroke();
    }

    // Concentric expanding warp portal shockwaves
    this.warpTimer += dt;
    const waveCount = 3;
    for (let w = 0; w < waveCount; w++) {
      const delay = w * 0.6;
      const t = (this.warpTimer + delay) % 1.8;
      const progress = t / 1.8;
      const maxRadius = Math.max(this.canvas.width, this.canvas.height) * 0.9;
      const radius = progress * maxRadius;
      const alpha = Math.max(0, 1 - progress);

      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      this.ctx.strokeStyle = `rgba(224, 64, 251, ${alpha * 0.45})`;
      this.ctx.lineWidth = 5 + (1 - progress) * 10;
      this.ctx.stroke();
    }
  }

  /**
   * Draws a pulsing neon navigation arrow at the edge of the screen pointing towards the
   * targeted warp gate, with distance and gate name labels.
   * @param {Ship} playerShip - The player entity.
   * @param {Object} target - The target gate entity {position, name}.
   */
  drawNavigationArrow(playerShip, target) {
    const screenX = target.position.x - this.camera.x;
    const screenY = target.position.y - this.camera.y;
    const margin = 60;

    // Only draw if off-screen
    if (
      screenX >= margin &&
      screenX <= this.canvas.width - margin &&
      screenY >= margin &&
      screenY <= this.canvas.height - margin
    ) {
      return;
    }

    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const angle = Math.atan2(screenY - centerY, screenX - centerX);

    // Clamp arrow to canvas edge
    const edgeX = Math.max(
      margin,
      Math.min(
        this.canvas.width - margin,
        centerX + Math.cos(angle) * (this.canvas.width / 2 - margin),
      ),
    );
    const edgeY = Math.max(
      margin,
      Math.min(
        this.canvas.height - margin,
        centerY + Math.sin(angle) * (this.canvas.height / 2 - margin),
      ),
    );

    // Pulsing alpha
    const pulse = 0.6 + 0.4 * Math.sin(Date.now() * 0.005);

    // Arrow triangle
    const arrowSize = 14;
    this.ctx.save();
    this.ctx.translate(edgeX, edgeY);
    this.ctx.rotate(angle);

    this.ctx.beginPath();
    this.ctx.moveTo(arrowSize, 0);
    this.ctx.lineTo(-arrowSize * 0.6, -arrowSize * 0.5);
    this.ctx.lineTo(-arrowSize * 0.6, arrowSize * 0.5);
    this.ctx.closePath();
    this.ctx.fillStyle = `rgba(0, 255, 136, ${pulse})`;
    this.ctx.fill();

    this.ctx.restore();

    // Distance text
    const dist = Math.round(playerShip.position.distance(target.position));
    const labelName = target.name || "STARGATE";

    // Position label offset from the arrow
    const labelOffX = edgeX + Math.cos(angle + Math.PI) * 30;
    const labelOffY = edgeY + Math.sin(angle + Math.PI) * 30;

    this.ctx.font = "bold 9px 'Orbitron', sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = `rgba(0, 255, 136, ${pulse * 0.9})`;
    this.ctx.fillText(`${labelName.toUpperCase()}`, labelOffX, labelOffY - 6);
    this.ctx.font = "8px 'Inter', sans-serif";
    this.ctx.fillStyle = `rgba(0, 255, 136, ${pulse * 0.7})`;
    this.ctx.fillText(`${dist} u`, labelOffX, labelOffY + 6);
  }
}
