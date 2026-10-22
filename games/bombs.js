'use strict';
// Minijuego 1: Bombas de traslación. Plano de -4 a 4 en x e y (origen al centro).
const HALF = 4, SIZE = 9, INTRO_MS = 5000, RESULT_MS = 6000;
const key = (x, y) => `${x},${y}`;
const rnd = (n) => Math.floor(Math.random() * n);
const seconds = (round) => Math.max(8, 20 - 2 * (round - 1)); // cada ronda hay menos tiempo

function publicState(g) {
  if (!g) return null;
  return {
    type: g.type, phase: g.phase, round: g.round, half: HALF, bombs: g.bombs,
    endsAt: g.endsAt, now: Date.now(), winners: g.winners,
    players: [...g.players.values()].map((p) => ({
      id: p.id, name: p.name, color: p.color, x: p.x, y: p.y, alive: p.alive,
      submitted: Boolean(p.answer), result: p.result, tx: p.tx, ty: p.ty
    }))
  };
}
function emit(room, io) { io.to(room.code).emit('game:state', publicState(room.game)); }
function stop(room) { if (room.game && room.game.timer) clearTimeout(room.game.timer); room.game = null; }

function start(room, io) {
  stop(room);
  const cells = [];
  for (let x = -HALF; x <= HALF; x++) for (let y = -HALF; y <= HALF; y++) cells.push([x, y]);
  cells.sort(() => Math.random() - 0.5);
  const players = new Map();
  let i = 0;
  for (const p of room.players.values()) {
    const [x, y] = cells[i++ % cells.length];
    players.set(p.id, { id: p.id, name: p.name, color: p.color, x, y, alive: true, answer: null, result: null, tx: null, ty: null });
  }
  room.game = { type: 'bombs', phase: 'intro', round: 0, bombs: [], players, endsAt: Date.now() + INTRO_MS, winners: [], timer: null };
  emit(room, io);
  room.game.timer = setTimeout(() => nextRound(room, io), INTRO_MS);
}

function nextRound(room, io) {
  const g = room.game; if (!g) return;
  g.round += 1; g.phase = 'input';
  const alive = [...g.players.values()].filter((p) => p.alive);
  alive.forEach((p) => { p.answer = null; p.result = null; p.tx = null; p.ty = null; });
  const total = Math.min(SIZE * SIZE - 8, 26 + 4 * (g.round - 1)); // cada ronda hay más bombas
  const set = new Set();
  alive.forEach((p) => { if (Math.random() < 0.75) set.add(key(p.x, p.y)); }); // casi todos deben moverse
  while (set.size < total) set.add(key(rnd(SIZE) - HALF, rnd(SIZE) - HALF));
  g.bombs = [...set].map((s) => s.split(',').map(Number));
  const ms = seconds(g.round) * 1000;
  g.endsAt = Date.now() + ms;
  emit(room, io);
  g.timer = setTimeout(() => resolve(room, io), ms + 600);
}

function resolve(room, io) {
  const g = room.game; if (!g || g.phase !== 'input') return;
  clearTimeout(g.timer);
  const bombs = new Set(g.bombs.map((b) => key(b[0], b[1])));
  const before = [...g.players.values()].filter((p) => p.alive);
  for (const p of before) {
    const a = p.answer || { dx: 0, dy: 0 }; // sin respuesta equivale a quedarse quieto
    p.tx = p.x + a.dx; p.ty = p.y + a.dy;
    const inside = Math.abs(p.tx) <= HALF && Math.abs(p.ty) <= HALF;
    if (inside && !bombs.has(key(p.tx, p.ty))) { p.x = p.tx; p.y = p.ty; p.result = 'safe'; }
    else { p.alive = false; p.result = inside ? 'boom' : 'out'; }
  }
  const alive = before.filter((p) => p.alive);
  const limit = g.players.size > 1 ? 1 : 0;
  if (alive.length <= limit) {
    g.phase = 'end';
    g.winners = (alive.length ? alive : before).map((p) => p.id);
    emit(room, io);
  } else {
    g.phase = 'result';
    g.endsAt = Date.now() + RESULT_MS;
    emit(room, io);
    g.timer = setTimeout(() => nextRound(room, io), RESULT_MS);
  }
}

function submit(room, io, playerId, dx, dy) {
  const g = room.game;
  if (!g || g.phase !== 'input' || Date.now() > g.endsAt + 400) return;
  const p = g.players.get(playerId);
  if (!p || !p.alive) return;
  dx = Number(dx); dy = Number(dy);
  if (!Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx) > 12 || Math.abs(dy) > 12) return;
  p.answer = { dx, dy };
  const everyone = [...g.players.values()].filter((q) => q.alive).every((q) => q.answer);
  if (everyone) resolve(room, io); else emit(room, io);
}

module.exports = { start, stop, submit, publicState };
