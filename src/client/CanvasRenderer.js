import { Vector2D } from "../physics/Vector2D.js";

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

    // Visual Explosion/Spark Particles
    this.particles = [];
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
   */
  draw(dt, playerShip, entities, targetEntity, localPlayerId = null, fleetMembers = [], fleetName = null) {
    // 1. Update Camera to center on Player
    if (playerShip) {
      this.camera.x = playerShip.position.x - this.canvas.width / 2;
      this.camera.y = playerShip.position.y - this.canvas.height / 2;
    }

    // 2. Clear Context with beautiful space black
    this.ctx.fillStyle = "#020205";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 3. Render Parallax Starfield
    this.drawStarfield();

    // 4. Update and Draw Spark Particles
    this.drawParticles(dt);

    // 5. Draw Game Entities in camera space
    this.ctx.save();
    this.ctx.translate(-this.camera.x, -this.camera.y);

    for (const ent of entities) {
      if (ent.type === "planet") {
        this.drawPlanet(ent);
      } else if (ent.type === "projectile") {
        this.drawProjectile(ent);
      } else if (ent.type === "ship") {
        this.drawShip(ent, localPlayerId, fleetMembers, fleetName);
      } else {
        this.drawAsteroid(ent);
      }
    }

    // Draw target marker
    if (targetEntity && entities.includes(targetEntity)) {
      this.drawTargetIndicator(targetEntity);
    }

    this.ctx.restore();

    // 6. Draw HUD pointer arrows for offscreen target/planets
    if (playerShip) {
      this.drawOffScreenPointers(playerShip, entities, targetEntity, localPlayerId, fleetMembers);
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
      this.ctx.beginPath();
      this.ctx.arc(finalX, finalY, star.size, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  /**
   * Advances and draws sparks.
   */
  drawParticles(dt) {
    const activeParticles = [];

    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.alpha -= p.decay * dt;

      if (p.alpha > 0) {
        this.ctx.save();
        this.ctx.globalAlpha = p.alpha;
        this.ctx.fillStyle = p.color;
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = p.color;
        this.ctx.beginPath();
        this.ctx.arc(
          p.x - this.camera.x,
          p.y - this.camera.y,
          p.radius,
          0,
          Math.PI * 2,
        );
        this.ctx.fill();
        this.ctx.restore();

        activeParticles.push(p);
      }
    }

    this.particles = activeParticles;
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

    this.ctx.restore();
  }

  /**
   * Draws a glowing laser.
   */
  drawProjectile(proj) {
    this.ctx.save();

    // Pick different colors based on who fired
    const isPlayer = proj.ownerId === "player";
    const color = isPlayer ? "#00ffcc" : "#ff3333";

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 3;
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = color;

    // Tail line
    const dir = new Vector2D(Math.cos(proj.heading), Math.sin(proj.heading));
    const tail = proj.position.subtract(dir.multiply(20));

    this.ctx.beginPath();
    this.ctx.moveTo(proj.position.x, proj.position.y);
    this.ctx.lineTo(tail.x, tail.y);
    this.ctx.stroke();

    this.ctx.restore();
  }

  /**
   * Draws a ship with dynamic engines exhausts.
   */
  drawShip(ship, localPlayerId = null, fleetMembers = [], fleetName = null) {
    const isLocalPlayer = (localPlayerId && ship.id === localPlayerId) || ship.id === "player";
    const teammate = fleetMembers && fleetMembers.find(m => m.id === ship.id && m.id !== localPlayerId);
    const isTeammate = !!teammate;
    const isOtherPlayer = localPlayerId && !isLocalPlayer && !isTeammate && (ship.id !== "player" && !ship.name.includes("Pirate") && !ship.name.includes("Guard"));

    this.ctx.save();
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

    // Exhaust thrust flame
    if (ship.controls && ship.controls.isThrusting && !ship.isDestroyed) {
      this.ctx.fillStyle = "#ff6a00";
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = "#ffb300";
      this.ctx.beginPath();
      // Flicker size
      const flameLen = 20 + Math.random() * 15;
      this.ctx.moveTo(-ship.radius, -5);
      this.ctx.lineTo(-ship.radius - flameLen, 0);
      this.ctx.lineTo(-ship.radius, 5);
      this.ctx.closePath();
      this.ctx.fill();
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
      fillColor = "#180822";  // Deep purple theme
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
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = strokeColor;

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
  drawOffScreenPointers(player, entities, activeTarget, localPlayerId = null, fleetMembers = []) {
    const screenPadding = 20;
    const targets = [];

    // Always track activeTarget and planets
    if (activeTarget && entities.includes(activeTarget)) {
      targets.push({
        position: activeTarget.position,
        name: activeTarget.name || "Target",
        color: "#ffb300"
      });
    }

    for (const ent of entities) {
      if (ent.type === "planet") {
        targets.push({
          position: ent.position,
          name: ent.name,
          color: "rgba(100, 180, 255, 0.8)"
        });
      }
    }

    // Track offscreen fleet members
    if (fleetMembers) {
      for (const member of fleetMembers) {
        if (member.id === localPlayerId) continue;
        // Don't draw pointer if teammate is in the local system and is close enough
        const teammateShip = entities.find(e => e.type === "ship" && e.id === member.id);
        if (teammateShip) {
          // It will be drawn by standard entities, only draw pointer if offscreen
          targets.push({
            position: teammateShip.position,
            name: member.nickname,
            color: "#a040fb",
            isTeammate: true
          });
        } else {
          // Teammate is offscreen or in other area/landed
          targets.push({
            position: new Vector2D(member.x, member.y),
            name: member.nickname,
            color: "#a040fb",
            isTeammate: true
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

        // Project onto screen boundaries
        let px = 0;
        let py = 0;

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
}
