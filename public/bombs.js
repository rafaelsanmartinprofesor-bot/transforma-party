'use strict';
// Pantallas del minijuego 1 (Bombas de traslación): proyector y teléfono.
(() => {
  const TP = window.TP;
  const { socket, app } = TP;
  const esc = TP.escapeHtml;
  let g = null, offset = 0, dx = 0, dy = 0, lastRound = -1, sent = false, timerId = null;

  socket.on('game:state', (s) => {
    g = s;
    if (s) {
      offset = s.now - Date.now();
      if (s.round !== lastRound) { lastRound = s.round; dx = 0; dy = 0; sent = false; }
      if (TP.room && TP.room.status === 'started') draw();
    } else lastRound = -1;
  });
  window.TPGame = {
    refresh() {
      if (g) draw();
      else app.innerHTML = '<section class="loading-panel panel"><div class="spinner"></div><p>Preparando el juego…</p></section>';
    }
  };

  const dot = (p, ring) => `<span class="gdot${ring ? ' me' : ''}" style="--c:${esc(p.color)}" title="${esc(p.name)}">${esc(p.name.slice(0, 1).toUpperCase())}</span>`;

  function board(meId) {
    const H = g.half;
    const bombs = new Set(g.bombs.map((b) => b.join(',')));
    let h = `<div class="bb" style="--n:${2 * H + 2}">`;
    for (let y = H; y >= -H; y--) {
      h += `<i class="ax">${y}</i>`;
      for (let x = -H; x <= H; x++) {
        const bomb = g.phase !== 'intro' && bombs.has(`${x},${y}`);
        let inner = bomb ? '<b class="bomb">💣</b>' : '';
        g.players.filter((p) => p.alive && p.x === x && p.y === y && (!meId || p.id === meId)).forEach((p) => { inner += dot(p, p.id === meId); });
        if (g.phase === 'result') g.players.filter((p) => p.result === 'boom' && p.tx === x && p.ty === y && (!meId || p.id === meId)).forEach(() => { inner += '<b class="boom">💥</b>'; });
        h += `<div class="cell${bomb ? ' danger' : ''}${x === 0 || y === 0 ? ' axis' : ''}">${inner}</div>`;
      }
    }
    h += '<i class="ax"></i>';
    for (let x = -H; x <= H; x++) h += `<i class="ax">${x}</i>`;
    return h + '</div>';
  }

  const timerBlock = () => '<div class="tbar"><span id="tfill"></span></div><div class="tsec" id="tsec"></div>';
  function tick() {
    const left = Math.max(0, (g.endsAt - (Date.now() + offset)) / 1000);
    const total = g.phase === 'input' ? Math.max(8, 20 - 2 * (g.round - 1)) : (g.phase === 'intro' ? 5 : 6);
    const fill = document.getElementById('tfill'), sec = document.getElementById('tsec');
    if (fill) fill.style.width = `${Math.min(100, (left / total) * 100)}%`;
    if (sec) sec.textContent = g.phase === 'end' ? '' : `${Math.ceil(left)} s`;
  }

  function hostView() {
    const alive = g.players.filter((p) => p.alive);
    const out = g.players.filter((p) => !p.alive);
    const titles = { intro: '¡Prepárense!', input: '¡Salven sus casillas!', result: 'Resultado de la ronda', end: '¡Tenemos ganador!' };
    const winners = g.players.filter((p) => g.winners.includes(p.id));
    const side = g.phase === 'end'
      ? `<div class="winner">🏆<h2>${winners.map((p) => esc(p.name)).join(' y ') || 'Nadie'}</h2></div>`
      : `<p class="rule">Escribe en tu teléfono el vector de traslación <strong>(a, b)</strong> que te lleve desde tu casilla a una casilla sin bomba.<br>Nueva posición = <strong>(x + a, y + b)</strong>. Si sales del tablero, caes.</p>`;
    const chips = (list, mark) => list.map((p) => `<span class="gchip" style="--c:${esc(p.color)}">${mark(p)}${esc(p.name)}</span>`).join('');
    return `
      <div class="lobby-heading"><div><span class="eyebrow">BOMBAS DE TRASLACIÓN · RONDA ${g.round || 1}</span><h1>${titles[g.phase]}</h1></div><span class="state-pill">${alive.length} EN PIE</span></div>
      <div class="gm-layout">
        <section class="panel gm-board">${board(null)}${g.phase === 'end' ? '' : timerBlock()}</section>
        <aside class="panel gm-side">${side}
          <h3>En pie</h3><div class="gchips">${chips(alive, (p) => (g.phase === 'input' ? (p.submitted ? '✓ ' : '… ') : ''))}</div>
          ${out.length ? `<h3>Eliminados</h3><div class="gchips out">${chips(out, (p) => '💥 ')}</div>` : ''}
        </aside>
      </div>
      <section class="host-controls panel"><div class="control-copy"><strong>Controles del profesor</strong><span>Las rondas avanzan solas: menos tiempo y más bombas en cada una.</span></div>
        <div class="control-buttons">${g.phase === 'end' ? '<button class="button" id="gRestart" type="button">Jugar otra vez</button>' : ''}<button class="button secondary" id="gLobby" type="button">↶ Volver al lobby</button><button class="button danger" id="gEnd" type="button">Terminar sala</button></div></section>`;
  }

  function playerView() {
    const me = g.players.find((p) => p.id === (TP.player && TP.player.id));
    if (!me) return '<section class="started-card panel"><h1>Mira el proyector.</h1></section>';
    const win = g.winners.includes(me.id);
    let body;
    if (g.phase === 'end') body = `<h1>${win ? '🏆 ¡Ganaste!' : 'Terminó el juego'}</h1><p>Mira el proyector para ver al ganador.</p>`;
    else if (!me.alive) body = `<h1>💥 Quedaste fuera</h1><p>${me.result === 'out' ? 'Tu traslación te sacó del tablero.' : 'Caíste en una casilla con bomba.'} Sigue la partida en el proyector.</p>`;
    else if (g.phase === 'intro') body = `<h1>¡Prepárate!</h1><p>Estás en <strong>(${me.x}, ${me.y})</strong>. Pronto aparecerán bombas.</p>`;
    else if (g.phase === 'result') body = `<h1>🎉 ¡Salvado!</h1><p>Ahora estás en <strong>(${me.x}, ${me.y})</strong>. Prepárate para la siguiente ronda.</p>`;
    else body = `<p class="pos">Estás en <strong>(${me.x}, ${me.y})</strong></p>${board(me.id)}${timerBlock()}
      <div class="steppers">${['dx', 'dy'].map((k) => `<div class="stp"><span>${k === 'dx' ? 'a (horizontal)' : 'b (vertical)'}</span><div><button type="button" data-k="${k}" data-d="-1">−</button><output id="v${k}">${k === 'dx' ? dx : dy}</output><button type="button" data-k="${k}" data-d="1">+</button></div></div>`).join('')}</div>
      <button class="button join-submit" id="gSend" type="button">${sent ? 'Enviado ✓ (puedes cambiarlo)' : 'Enviar vector'}</button>`;
    return `<section class="gm-phone panel"><span class="room-badge" style="--c:${esc(me.color)}">● ${esc(me.name)}</span>${body}</section>`;
  }

  function draw() {
    if (!g || !TP.role) return;
    clearInterval(timerId);
    const host = TP.role === 'host';
    app.innerHTML = host ? hostView() : playerView();
    if (host) {
      const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
      on('gRestart', () => TP.hostAction('restart'));
      on('gLobby', () => TP.hostAction('reset'));
      on('gEnd', () => { if (window.confirm('¿Terminar esta sala?')) TP.hostAction('end'); });
    } else {
      app.querySelectorAll('.steppers button').forEach((b) => b.addEventListener('click', () => {
        const d = Number(b.dataset.d);
        if (b.dataset.k === 'dx') dx = Math.max(-9, Math.min(9, dx + d)); else dy = Math.max(-9, Math.min(9, dy + d));
        document.getElementById('vdx').textContent = dx; document.getElementById('vdy').textContent = dy;
        sent = false; const s = document.getElementById('gSend'); if (s) s.textContent = 'Enviar vector';
      }));
      const send = document.getElementById('gSend');
      if (send) send.addEventListener('click', () => { socket.emit('game:submit', { code: TP.room.code, dx, dy }); sent = true; send.textContent = 'Enviado ✓ (puedes cambiarlo)'; });
    }
    timerId = setInterval(tick, 200); tick();
  }
})();
