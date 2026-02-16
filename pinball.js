(() => {
  const { Engine, Render, Runner, World, Bodies, Events, Body } = Matter;

  const WIDTH = 520;
  const HEIGHT = 900;
  const WALL_THICKNESS = 16;
  const BALL_RADIUS = 11;
  const BALL_OUT_MARGIN = 120;

  const canvasHost = document.getElementById("canvasHost");
  const logBox = document.getElementById("logBox");
  const mapJson = document.getElementById("mapJson");
  const thicknessRange = document.getElementById("thicknessRange");
  const thicknessValue = document.getElementById("thicknessValue");

  const spawnBallBtn = document.getElementById("spawnBallBtn");
  const wireframeBtn = document.getElementById("wireframeBtn");
  const clearDraftBtn = document.getElementById("clearDraftBtn");
  const clearMapBtn = document.getElementById("clearMapBtn");
  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");

  const engine = Engine.create({
    gravity: { x: 0, y: 1.05 },
  });

  const render = Render.create({
    element: canvasHost,
    engine,
    options: {
      width: WIDTH,
      height: HEIGHT,
      wireframes: false,
      showBounds: false,
      background: "#0a1420",
    },
  });

  const runner = Runner.create();

  const state = {
    lines: [],
    draft: [],
    wallBodies: [],
    ballBody: null,
    wireframe: false,
    logs: [],
    wallThickness: WALL_THICKNESS,
  };

  function log(message) {
    const stamp = new Date().toLocaleTimeString();
    state.logs.unshift(`[${stamp}] ${message}`);
    state.logs = state.logs.slice(0, 60);
    logBox.textContent = state.logs.join("\n");
  }

  function syncThicknessUI() {
    const value = String(Math.round(state.wallThickness));
    thicknessRange.value = value;
    thicknessValue.textContent = value;
  }

  function toWorldPoint(event) {
    const rect = render.canvas.getBoundingClientRect();
    return {
      x: Math.round(event.clientX - rect.left),
      y: Math.round(event.clientY - rect.top),
    };
  }

  function segmentToWallBody(a, b, thickness) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 2) {
      return null;
    }

    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const angle = Math.atan2(dy, dx);

    const body = Bodies.rectangle(mx, my, length, thickness, {
      isStatic: true,
      friction: 0.25,
      restitution: 0,
      render: {
        fillStyle: "#355474",
        strokeStyle: "#95c4f2",
        lineWidth: 1,
      },
      label: "wallSegment",
    });

    Body.setAngle(body, angle);
    return body;
  }

  function rebuildWalls(thickness = state.wallThickness) {
    if (state.wallBodies.length) {
      World.remove(engine.world, state.wallBodies);
      state.wallBodies = [];
    }

    const nextWalls = [];
    for (const line of state.lines) {
      for (let i = 0; i < line.length - 1; i += 1) {
        const wall = segmentToWallBody(line[i], line[i + 1], thickness);
        if (wall) {
          nextWalls.push(wall);
        }
      }
    }

    if (nextWalls.length) {
      World.add(engine.world, nextWalls);
    }
    state.wallBodies = nextWalls;
    state.wallThickness = thickness;
    syncThicknessUI();
    log(`Wall rebuild: ${state.wallBodies.length} segments`);
  }

  function resetBall() {
    if (state.ballBody) {
      World.remove(engine.world, state.ballBody);
    }

    state.ballBody = Bodies.circle(WIDTH * 0.2, 40, BALL_RADIUS, {
      restitution: 0.12,
      friction: 0.02,
      frictionAir: 0.0008,
      density: 0.002,
      render: {
        fillStyle: "#f6b26b",
        strokeStyle: "#ffd8a8",
        lineWidth: 1,
      },
      label: "ball",
    });

    World.add(engine.world, state.ballBody);
    log("Ball spawned");
  }

  function finalizeDraft() {
    if (state.draft.length < 2) {
      log("Need at least 2 points to finalize a line");
      return;
    }

    state.lines.push([...state.draft]);
    state.draft = [];
    rebuildWalls();
    log(`Line finalized. Total lines: ${state.lines.length}`);
  }

  function clearDraft() {
    state.draft = [];
    log("Draft cleared");
  }

  function clearMap() {
    state.lines = [];
    state.draft = [];
    rebuildWalls();
    log("All map lines cleared");
  }

  function exportMap() {
    const payload = {
      thickness: state.wallThickness,
      lines: state.lines,
    };

    const text = JSON.stringify(payload, null, 2);
    mapJson.value = text;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => log("Exported JSON and copied to clipboard"))
        .catch(() => log("Exported JSON (clipboard denied)"));
      return;
    }

    log("Exported JSON (clipboard API unavailable)");
  }

  function importMap() {
    try {
      const parsed = JSON.parse(mapJson.value);
      if (!parsed || !Array.isArray(parsed.lines)) {
        throw new Error("JSON must have lines[]");
      }

      const normalized = parsed.lines.map((line, lineIdx) => {
        if (!Array.isArray(line) || line.length < 2) {
          throw new Error(`line ${lineIdx + 1} needs at least 2 points`);
        }

        return line.map((p, pointIdx) => {
          if (typeof p?.x !== "number" || typeof p?.y !== "number") {
            throw new Error(`line ${lineIdx + 1}, point ${pointIdx + 1} invalid`);
          }
          return { x: p.x, y: p.y };
        });
      });

      state.lines = normalized;
      state.draft = [];
      const thickness = Number(parsed.thickness) > 0 ? Number(parsed.thickness) : WALL_THICKNESS;
      rebuildWalls(thickness);
      log(`Imported map: ${state.lines.length} lines`);
    } catch (error) {
      log(`Import error: ${error.message}`);
    }
  }

  render.canvas.addEventListener("click", (event) => {
    const p = toWorldPoint(event);
    state.draft.push(p);
    log(`Draft point added: (${p.x}, ${p.y})`);
  });

  window.addEventListener("keydown", (event) => {
    const activeTag = document.activeElement?.tagName;
    if (activeTag === "TEXTAREA" || activeTag === "INPUT") {
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      finalizeDraft();
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      if (state.draft.length > 0) {
        const removed = state.draft.pop();
        log(`Draft point removed: (${removed.x}, ${removed.y})`);
      }
    }
  });

  exportBtn.addEventListener("click", exportMap);
  importBtn.addEventListener("click", importMap);
  clearDraftBtn.addEventListener("click", clearDraft);
  clearMapBtn.addEventListener("click", clearMap);
  spawnBallBtn.addEventListener("click", resetBall);
  thicknessRange.addEventListener("input", () => {
    const nextThickness = Number(thicknessRange.value);
    thicknessValue.textContent = String(nextThickness);
    rebuildWalls(nextThickness);
    log(`Wall thickness set: ${nextThickness}`);
  });

  wireframeBtn.addEventListener("click", () => {
    state.wireframe = !state.wireframe;
    render.options.wireframes = state.wireframe;
    render.options.showBounds = state.wireframe;
    wireframeBtn.textContent = `Wireframe: ${state.wireframe ? "ON" : "OFF"}`;
    log(`Wireframe ${state.wireframe ? "enabled" : "disabled"}`);
  });

  Events.on(engine, "beforeUpdate", () => {
    if (!state.ballBody) {
      return;
    }

    const { x, y } = state.ballBody.position;
    const outX = x < -BALL_OUT_MARGIN || x > WIDTH + BALL_OUT_MARGIN;
    const outY = y < -BALL_OUT_MARGIN || y > HEIGHT + BALL_OUT_MARGIN;

    if (outX || outY) {
      log("Ball out of bounds -> reset");
      resetBall();
    }
  });

  Events.on(engine, "collisionStart", (event) => {
    for (const pair of event.pairs) {
      const labels = [pair.bodyA.label, pair.bodyB.label];
      if (labels.includes("ball") && labels.includes("wallSegment")) {
        const p = pair.collision.supports[0];
        log(`Ball-wall collision near (${Math.round(p.x)}, ${Math.round(p.y)})`);
      }
    }
  });

  Events.on(render, "afterRender", () => {
    const ctx = render.context;

    if (state.lines.length) {
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = "#3fd6a4";
      ctx.lineWidth = 1;
      for (const line of state.lines) {
        ctx.beginPath();
        ctx.moveTo(line[0].x, line[0].y);
        for (let i = 1; i < line.length; i += 1) {
          ctx.lineTo(line[i].x, line[i].y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    if (state.draft.length) {
      ctx.save();
      ctx.strokeStyle = "#f29f5c";
      ctx.lineWidth = 2;
      ctx.fillStyle = "#ffd6b2";

      if (state.draft.length > 1) {
        ctx.beginPath();
        ctx.moveTo(state.draft[0].x, state.draft[0].y);
        for (let i = 1; i < state.draft.length; i += 1) {
          ctx.lineTo(state.draft[i].x, state.draft[i].y);
        }
        ctx.stroke();
      }

      for (const p of state.draft) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  });

  function seedStarterTrack() {
    state.lines = [
      [
        { x: 90, y: 20 },
        { x: 90, y: 860 },
      ],
      [
        { x: 240, y: 20 },
        { x: 240, y: 860 },
      ],
      [
        { x: 90, y: 220 },
        { x: 170, y: 300 },
        { x: 170, y: 520 },
        { x: 240, y: 590 },
      ],
      [
        { x: 90, y: 640 },
        { x: 160, y: 700 },
      ],
    ];

    rebuildWalls();
  }

  seedStarterTrack();
  resetBall();
  syncThicknessUI();
  log("Editor ready");

  Runner.run(runner, engine);
  Render.run(render);
})();
