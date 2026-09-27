import kaplay from "kaplay";
import "./mobile.css";

const W = 540;
const H = 960;
const CX = W / 2;
const CY = 340;
const TARGET_R = 112;
const KNIFE_LEN = 78;
const KNIFE_W = 10;
const HIT_GAP = 0.24;
const BEST_KEY = "sullen-knife-hit-best";

const phone =
  window.matchMedia("(pointer: coarse)").matches ||
  "ontouchstart" in window ||
  navigator.maxTouchPoints > 0;
if (phone) document.documentElement.classList.add("phone");

function setScreen(name) {
  document.documentElement.classList.toggle("menu", name === "menu");
  document.documentElement.classList.toggle("over", name === "over");
  document.documentElement.classList.toggle("play", name === "play");
}

let playHandler = null;
let throwHandler = null;
document.getElementById("btn-play")?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  playHandler?.();
});
document.getElementById("btn-throw")?.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  e.stopPropagation();
  throwHandler?.();
});

kaplay({
  width: W,
  height: H,
  letterbox: true,
  crisp: true,
  pixelDensity: Math.min(window.devicePixelRatio || 1, 2),
  background: [12, 10, 8],
  root: document.getElementById("game-wrap"),
  touchToMouse: true,
});

const C = {
  wood: rgb(122, 62, 28),
  woodHi: rgb(176, 96, 42),
  woodDark: rgb(64, 28, 12),
  ring: rgb(240, 196, 0),
  knife: rgb(214, 220, 228),
  knifeDark: rgb(90, 98, 108),
  ink: rgb(245, 236, 220),
  mute: rgb(160, 140, 120),
  mint: rgb(10, 184, 118),
  blood: rgb(226, 59, 47),
};

function readBest() {
  return Number(localStorage.getItem(BEST_KEY) || 0);
}

function writeBest(score) {
  const best = Math.max(readBest(), score);
  localStorage.setItem(BEST_KEY, String(best));
  return best;
}

function angleDiff(a, b) {
  let d = ((a - b + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

function stagePlan(stage) {
  return {
    need: 4 + Math.min(8, stage),
    speed: 1.35 + stage * 0.18,
    reverse: stage > 2 && stage % 2 === 0,
    wobble: stage > 4,
  };
}

function drawKnife(x, y, ang, flying) {
  pushTransform();
  pushTranslate(x, y);
  pushRotate(ang);
  drawRect({
    pos: vec2(-KNIFE_W / 2, -KNIFE_LEN * 0.15),
    width: KNIFE_W,
    height: KNIFE_LEN,
    radius: 3,
    color: flying ? C.ink : C.knife,
  });
  drawRect({
    pos: vec2(-KNIFE_W / 2 - 4, KNIFE_LEN * 0.52),
    width: KNIFE_W + 8,
    height: 14,
    radius: 2,
    color: C.blood,
  });
  drawRect({
    pos: vec2(-2, -KNIFE_LEN * 0.15 - 10),
    width: 4,
    height: 12,
    color: C.knifeDark,
  });
  popTransform();
}

scene("menu", () => {
  setScreen("menu");
  const playBtn = document.getElementById("btn-play");
  if (playBtn) playBtn.textContent = "PLAY";

  add([
    text("SULLEN STUDIO", { size: 16 }),
    pos(CX, 72),
    anchor("center"),
    color(C.mute),
  ]);
  add([
    text("KNIFE HIT", { size: 56 }),
    pos(CX, 150),
    anchor("center"),
    color(C.ink),
  ]);
  add([
    text("stick the knives. miss the blades.", { size: 16 }),
    pos(CX, 208),
    anchor("center"),
    color(C.mute),
  ]);

  let demo = 0;
  const demoStuck = [-0.6, 0.9, 2.4];
  onDraw(() => {
    demo += dt() * 1.4;
    drawCircle({ pos: vec2(CX, 430), radius: 96, color: C.woodDark });
    drawCircle({ pos: vec2(CX, 430), radius: 86, color: C.wood });
    drawCircle({ pos: vec2(CX, 430), radius: 18, color: C.ring });
    for (const a of demoStuck) {
      const ang = a + demo;
      drawKnife(
        CX + Math.cos(ang) * 86,
        430 + Math.sin(ang) * 86,
        ang + Math.PI / 2,
        false,
      );
    }
  });

  add([
    text(`BEST  ${readBest()}`, { size: 22 }),
    pos(CX, 640),
    anchor("center"),
    color(C.mint),
  ]);
  add([
    text(phone ? "TAP PLAY OR THE LOG" : "SPACE / TAP TO THROW", {
      size: 16,
    }),
    pos(CX, 780),
    anchor("center"),
    color(C.mute),
  ]);

  let ready = false;
  wait(0.3, () => {
    ready = true;
  });
  const start = () => {
    if (!ready) return;
    ready = false;
    go("game");
  };
  playHandler = start;
  onKeyPress("space", start);
  onKeyPress("enter", start);
  onClick(start);
});

scene("game", () => {
  setScreen("play");
  let stage = 1;
  let score = 0;
  let rot = 0;
  let stuck = [];
  let flying = null;
  let plan = stagePlan(1);
  let left = plan.need;
  let dir = 1;
  let shake = 0;
  let dead = false;

  const scoreT = add([
    text("0", { size: 42 }),
    pos(36, 36),
    color(C.ink),
  ]);
  const stageT = add([
    text("STAGE 1", { size: 18 }),
    pos(W - 36, 44),
    anchor("topright"),
    color(C.ring),
  ]);
  const leftT = add([
    text(`${left}`, { size: 28 }),
    pos(CX, 820),
    anchor("center"),
    color(C.blood),
  ]);

  function resetStage() {
    plan = stagePlan(stage);
    left = plan.need;
    stuck = [];
    flying = null;
    dir = plan.reverse ? -1 : 1;
    leftT.text = String(left);
    stageT.text = `STAGE ${stage}`;
  }

  function throwKnife() {
    if (dead || flying) return;
    flying = { y: 780 };
  }

  throwHandler = throwKnife;
  onKeyPress("space", throwKnife);
  onKeyPress("enter", throwKnife);
  onClick(() => {
    if (!phone) throwKnife();
  });

  onUpdate(() => {
    if (dead) return;
    const dtv = Math.min(dt(), 1 / 30);
    let speed = plan.speed;
    if (plan.wobble) speed += Math.sin(time() * 3) * 0.7;
    rot += dir * speed * dtv;
    shake = Math.max(0, shake - dtv * 8);

    if (!flying) return;
    flying.y -= 1680 * dtv;
    if (flying.y > CY + TARGET_R - 8) return;

    const hitWorld = Math.PI / 2;
    const clash = stuck.some((a) => angleDiff(a + rot, hitWorld) < HIT_GAP);
    if (clash) {
      dead = true;
      const best = writeBest(score);
      wait(0.45, () => go("over", { score, best, stage }));
      return;
    }

    stuck.push(hitWorld - rot);
    score += 10 + stage * 2;
    left -= 1;
    flying = null;
    shake = 1;
    scoreT.text = String(score);
    leftT.text = String(left);
    if (left <= 0) {
      stage += 1;
      score += 50;
      scoreT.text = String(score);
      resetStage();
    }
  });

  onDraw(() => {
    const ox = (Math.random() - 0.5) * shake * 8;
    const oy = (Math.random() - 0.5) * shake * 8;
    const x = CX + ox;
    const y = CY + oy;
    drawCircle({ pos: vec2(x, y), radius: TARGET_R + 10, color: C.woodDark });
    drawCircle({ pos: vec2(x, y), radius: TARGET_R, color: C.wood });
    drawCircle({ pos: vec2(x, y), radius: TARGET_R - 18, color: C.woodHi });
    drawCircle({ pos: vec2(x, y), radius: 22, color: C.ring });
    for (let i = 0; i < 8; i++) {
      const a = rot + (i * Math.PI) / 4;
      drawLine({
        p1: vec2(x + Math.cos(a) * 28, y + Math.sin(a) * 28),
        p2: vec2(x + Math.cos(a) * (TARGET_R - 8), y + Math.sin(a) * (TARGET_R - 8)),
        width: 3,
        color: C.woodDark,
      });
    }
    for (const a of stuck) {
      const ang = a + rot;
      drawKnife(
        x + Math.cos(ang) * TARGET_R,
        y + Math.sin(ang) * TARGET_R,
        ang + Math.PI / 2,
        false,
      );
    }
    if (flying) drawKnife(CX, flying.y, 0, true);
    else if (!dead) drawKnife(CX, 780, 0, true);
  });
});

scene("over", ({ score, best, stage }) => {
  setScreen("over");
  const playBtn = document.getElementById("btn-play");
  if (playBtn) playBtn.textContent = "AGAIN";

  add([
    text("SULLEN STUDIO", { size: 16 }),
    pos(CX, 80),
    anchor("center"),
    color(C.mute),
  ]);
  add([
    text("HIT A BLADE", { size: 40 }),
    pos(CX, 180),
    anchor("center"),
    color(C.blood),
  ]);
  add([
    text(String(score), { size: 88 }),
    pos(CX, 360),
    anchor("center"),
    color(C.ring),
  ]);
  add([
    text(`BEST  ${best}    STAGE  ${stage}`, { size: 20 }),
    pos(CX, 450),
    anchor("center"),
    color(C.mute),
  ]);

  let ready = false;
  wait(0.4, () => {
    ready = true;
  });
  const again = () => {
    if (!ready) return;
    ready = false;
    go("game");
  };
  playHandler = again;
  onKeyPress("space", again);
  onKeyPress("enter", again);
  onClick(again);
});

go("menu");
