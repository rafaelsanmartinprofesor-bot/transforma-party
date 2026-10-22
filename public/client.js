'use strict';

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const app = $('#app');
  const connectionDot = $('#connectionDot');
  const connectionLabel = $('#connectionLabel');
  const toast = $('#toast');
  const socket = io({ autoConnect: true, reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 700 });
  const palette = [
    { name: 'Menta', hex: '#35C9A5' }, { name: 'Coral', hex: '#FF6B6B' },
    { name: 'Amarillo', hex: '#FFD166' }, { name: 'Azul', hex: '#6C7CFF' },
    { name: 'Violeta', hex: '#B77BFF' }, { name: 'Naranja', hex: '#FF9F43' },
    { name: 'Celeste', hex: '#45B7E8' }, { name: 'Rosa', hex: '#F06CB4' },
    { name: 'Lima', hex: '#A3D977' }, { name: 'Blanco', hex: '#F3F4F6' }
  ];
  const params = new URLSearchParams(window.location.search);
  const routeCode = normalizeCode(params.get('sala'));
  const teacherRoute = params.get('modo') === 'profesor';
  let room = null;
  let role = null;
  let currentPlayer = null;
  let selectedColor = palette[0].hex;
  let toastTimer = null;
  let lastError = '';

  function normalizeCode(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
  }
  function setConnection(connected) {
    connectionDot.classList.toggle('online', connected);
    connectionDot.classList.toggle('offline', !connected);
    connectionLabel.textContent = connected ? 'Servidor conectado' : 'Reconectando…';
  }
  function roomUrl(code = room?.code || routeCode) {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('sala', code);
    return url.toString();
  }
  function hostUrl(code = room?.code) {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('sala', code);
    url.searchParams.set('modo', 'profesor');
    return url.toString();
  }
  function setUrl(url) { window.history.replaceState({}, '', url); }
  function rememberHost(code, token) { sessionStorage.setItem(`tp-host-${code}`, token); }
  function hostToken(code = room?.code || routeCode) { return sessionStorage.getItem(`tp-host-${code}`) || ''; }
  function profileKey(code = routeCode || room?.code) { return `tp-player-${code}`; }
  function getSavedProfile(code = routeCode) {
    try { return JSON.parse(localStorage.getItem(profileKey(code)) || 'null'); } catch { return null; }
  }
  function saveProfile(code, profile) { localStorage.setItem(profileKey(code), JSON.stringify(profile)); }
  function clearProfile(code = routeCode) { localStorage.removeItem(profileKey(code)); }
  function colorPaletteMarkup() {
    return palette.map((color, index) => `<button type="button" class="color-option ${selectedColor === color.hex ? 'selected' : ''}" style="--swatch:${color.hex}" data-color="${color.hex}" aria-label="Color ${color.name}" aria-pressed="${selectedColor === color.hex}"><span></span></button>`).join('');
  }
  function setError(message) {
    lastError = message;
    const existing = $('.error-banner', app);
    if (existing) existing.remove();
    const target = $('.error-target', app) || $('.join-card', app) || app;
    const banner = document.createElement('div');
    banner.className = 'error-banner';
    banner.textContent = message;
    if (target === $('.join-card', app)) target.insertBefore(banner, $('.join-submit', target));
    else target.prepend(banner);
  }
  function clearError() { lastError = ''; $('.error-banner', app)?.remove(); }

  function renderHome() {
    role = null; room = null; currentPlayer = null;
    app.innerHTML = `
      <section class="hero">
        <div class="hero-copy">
          <span class="eyebrow">LA SALA DE JUEGO MATEMÁTICA</span>
          <h1>Las mates.<br>Pero en <em>modo party.</em></h1>
          <p>Un lobby para competir, moverse y pensar. Entra desde tu teléfono, elige tu color y prepárate para jugar transformaciones isométricas con toda la clase.</p>
          <div class="chips"><span class="chip"><i></i> Multijugador en vivo</span><span class="chip"><i></i> Sin instalar apps</span><span class="chip"><i></i> Una sala, una clase</span></div>
        </div>
        <div class="grid-art" aria-hidden="true">
          <div class="grid-art-frame">
            <span class="art-label">MAPA 01 / TRANSFORMACIONES</span>
            <span class="shape shape-a">↗</span><span class="shape shape-b">↻</span><span class="shape shape-c">◇</span><span class="shape shape-d">↔</span><span class="shape shape-e">✦</span>
            <span class="art-vector">v = (−2, +3)</span><span class="art-live">SALA MULTIJUGADOR</span>
          </div>
        </div>
      </section>
      <section class="home-actions">
        <article class="action-card panel student-card">
          <span class="card-kicker">01 / ESTUDIANTES</span><h2>Entrar a una sala</h2>
          <p>Escribe el código que aparece en el proyector o escanea el QR que comparte tu profesor.</p>
          <form class="inline-form" id="joinCodeForm"><input id="roomCodeInput" class="input" autocomplete="off" maxlength="4" autocapitalize="characters" spellcheck="false" placeholder="CÓDIGO · EJ. K7P2" aria-label="Código de sala"><button class="button secondary" type="submit">Entrar <span aria-hidden="true">↗</span></button></form>
        </article>
        <article class="action-card panel teacher-card">
          <span class="card-kicker">02 / PROFESOR</span><h2>Crear nueva sala</h2>
          <p>Genera un código y un QR para que tu curso se conecte. Revisa quién está dentro y decide cuándo comenzar.</p>
          <button id="createRoomButton" class="button" type="button">＋ Crear sala de juego</button>
        </article>
      </section>`;
    $('#joinCodeForm', app).addEventListener('submit', (event) => {
      event.preventDefault();
      const code = normalizeCode($('#roomCodeInput', app).value);
      if (code.length !== 4) { showToast('Escribe el código de 4 caracteres.'); return; }
      window.location.href = `${window.location.pathname}?sala=${encodeURIComponent(code)}`;
    });
    $('#roomCodeInput', app).addEventListener('input', (event) => { event.target.value = normalizeCode(event.target.value); });
    $('#createRoomButton', app).addEventListener('click', () => {
      $('#createRoomButton', app).disabled = true;
      $('#createRoomButton', app).textContent = 'Creando sala…';
      socket.emit('room:create');
    });
  }

  function renderJoinForm() {
    role = 'join-form';
    app.innerHTML = `
      <div class="join-shell">
        <button class="back-link" id="backHome" type="button">← Volver al inicio</button>
        <section class="join-card panel">
          <span class="room-badge">● SALA ${escapeHtml(routeCode)}</span>
          <h1>Entra al juego.</h1>
          <p class="sub">Elige cómo te verá tu curso en el tablero. Usa tu nombre o un apodo apropiado para la sala.</p>
          <form id="joinPlayerForm">
            <label class="form-label" for="playerName">Tu nombre <span class="name-count" id="nameCount">0 / 20</span></label>
            <input class="input" id="playerName" type="text" maxlength="20" autocomplete="nickname" placeholder="Ej. Martina" required>
            <span class="form-label">Elige tu color</span>
            <div class="color-options" id="colorOptions">${colorPaletteMarkup()}</div>
            <button class="button join-submit" type="submit">Entrar a la sala <span aria-hidden="true">↗</span></button>
            <div class="form-note">No necesitas crear una cuenta ni instalar una aplicación.<br>Usa el teléfono como control; la partida se ve en el proyector.</div>
          </form>
        </section>
      </div>`;
    $('#backHome', app).addEventListener('click', () => { window.location.href = window.location.pathname; });
    $('#playerName', app).addEventListener('input', (event) => { $('#nameCount', app).textContent = `${event.target.value.length} / 20`; });
    $('#colorOptions', app).addEventListener('click', (event) => {
      const button = event.target.closest('[data-color]');
      if (!button) return;
      selectedColor = button.dataset.color;
      $$('.color-option', app).forEach((option) => {
        const chosen = option.dataset.color === selectedColor;
        option.classList.toggle('selected', chosen);
        option.setAttribute('aria-pressed', String(chosen));
      });
    });
    $('#joinPlayerForm', app).addEventListener('submit', (event) => {
      event.preventDefault();
      clearError();
      const name = $('#playerName', app).value.trim().replace(/\s+/g, ' ');
      if (!name) { setError('Escribe tu nombre antes de entrar.'); return; }
      $('#joinPlayerForm button[type="submit"]', app).disabled = true;
      $('#joinPlayerForm button[type="submit"]', app).textContent = 'Conectando…';
      socket.emit('room:join', { code: routeCode, name, color: selectedColor });
    });
  }

  function renderHostLobby() {
    role = 'host';
    if (!room) return;
    const players = room.players || [];
    const connectedPlayers = players.filter((player) => player.connected);
    const started = room.status === 'started';
    const url = roomUrl(room.code);
    const playerMarkup = players.length ? players.map((player) => `
      <article class="player-tile" title="${escapeHtml(player.name)}">
        <span class="player-avatar" style="--player-color:${escapeHtml(player.color)}">${escapeHtml((player.name || '?').slice(0, 1).toLocaleUpperCase('es-CL'))}</span>
        <div class="player-meta"><div class="player-name">${escapeHtml(player.name)}</div><div class="player-status"><span class="status-dot ${player.connected ? '' : 'offline'}"></span>${player.connected ? 'CONECTADO' : 'RECONEXIÓN'}</div></div>
      </article>`).join('') : `
      <div class="empty-state"><div class="empty-orbit">＋</div><strong>Tu sala está lista.</strong><span>Comparte el QR o el código. Los estudiantes aparecerán aquí en cuanto entren.</span></div>`;
    app.innerHTML = `
      <div class="lobby-heading"><div><span class="eyebrow">SALA DE PROFESOR</span><h1>${started ? '¡Que comience la partida!' : 'Lobby de la clase.'}</h1><p>${started ? 'El lobby está cerrado y los estudiantes ya recibieron la señal de inicio.' : 'Comparte el acceso y espera a que aparezca tu curso.'}</p></div><span class="state-pill ${started ? 'started' : ''}">${started ? 'PARTIDA INICIADA' : 'ESPERANDO JUGADORES'}</span></div>
      <div class="lobby-layout">
        <aside class="room-panel panel">
          <div class="room-topline"><span>CÓDIGO DE SALA</span><span>● EN VIVO</span></div>
          <div class="room-code">${escapeHtml(room.code)}</div>
          <div class="room-hint">Tus estudiantes pueden escanear este QR<br>o ingresar el código manualmente.</div>
          <div class="qr-box" id="qrBox"><span class="qr-placeholder">Generando QR…</span></div>
          <div class="room-url" id="roomUrlText">${escapeHtml(url)}</div>
          <div class="copy-row"><button class="button secondary" id="copyLinkButton" type="button">↗ Copiar enlace</button><button class="button outline" id="copyCodeButton" type="button">▣ Copiar código</button></div>
          <div class="room-panel-bottom"><div class="network-note">Consejo: proyecta esta pantalla mientras se conectan. El enlace del QR entra directamente a esta sala.</div></div>
        </aside>
        <section class="players-panel panel">
          <div class="players-header"><div><div class="players-heading"><h2>Jugadores</h2><span class="player-count">${connectedPlayers.length.toString().padStart(2, '0')} / 40</span></div><p>Los nombres y colores se actualizan en tiempo real.</p></div><div class="player-legend">NOMBRE · COLOR · ESTADO</div></div>
          <div class="players-grid">${playerMarkup}</div>
          <div class="players-footer"><span><strong>${connectedPlayers.length}</strong> conectados · ${players.length - connectedPlayers.length} desconectados</span><div class="player-dot-list">${connectedPlayers.slice(0, 14).map((player) => `<span style="--dot-color:${escapeHtml(player.color)}" title="${escapeHtml(player.name)}"></span>`).join('')}</div></div>
        </section>
      </div>
      <section class="host-controls panel">
        <div class="control-copy"><strong>${started ? 'La sala ya está en marcha' : (room.allowJoining ? 'Todo listo para empezar' : 'Ingreso a la sala cerrado')}</strong><span>${started ? 'El siguiente paso será conectar el primer minijuego.' : 'Puedes bloquear nuevas entradas o iniciar la partida cuando quieras.'}</span></div>
        <div class="control-buttons">${started ? `<button class="button secondary" id="backToLobbyButton" type="button">↶ Volver al lobby</button>` : `<button class="button outline" id="toggleJoinButton" type="button">${room.allowJoining ? '⌁ Cerrar ingreso' : '＋ Permitir ingreso'}</button><button class="button" id="startGameButton" type="button" ${connectedPlayers.length === 0 ? 'disabled' : ''}>Empezar partida <span aria-hidden="true">→</span></button>`}<button class="button danger" id="endRoomButton" type="button">Terminar sala</button></div>
      </section>`;
    drawQr(url);
    $('#copyLinkButton', app).addEventListener('click', async () => { await copyText(url, 'Enlace copiado.'); });
    $('#copyCodeButton', app).addEventListener('click', async () => { await copyText(room.code, 'Código copiado.'); });
    $('#toggleJoinButton', app)?.addEventListener('click', () => sendHostAction('toggle-join'));
    $('#startGameButton', app)?.addEventListener('click', () => {
      if (connectedPlayers.length === 0) { showToast('Espera a que entre al menos un estudiante.'); return; }
      sendHostAction('start');
    });
    $('#backToLobbyButton', app)?.addEventListener('click', () => sendHostAction('reset'));
    $('#endRoomButton', app).addEventListener('click', () => {
      if (window.confirm('¿Terminar esta sala? Los estudiantes serán desconectados y el código dejará de estar disponible.')) sendHostAction('end');
    });
  }

  function renderStudentWaiting() {
    role = 'player';
    const players = (room?.players || []).filter((p) => p.connected).slice(0, 5);
    app.innerHTML = `
      <section class="student-wait panel">
        <span class="room-badge">● SALA ${escapeHtml(room?.code || routeCode)}</span>
        <div class="waiting-avatars">${players.length ? players.map((player) => `<span style="--avatar-color:${escapeHtml(player.color)}" title="${escapeHtml(player.name)}">${escapeHtml(player.name.slice(0, 1).toLocaleUpperCase('es-CL'))}</span>`).join('') : `<span style="--avatar-color:${escapeHtml(currentPlayer?.color || selectedColor)}">${escapeHtml((currentPlayer?.name || '?').slice(0, 1).toUpperCase())}</span>`}</div>
        <div class="waiting-label">${room?.allowJoining ? 'LOBBY ABIERTO' : 'LOBBY CERRADO'}</div>
        <h1>Estás dentro, ${escapeHtml(currentPlayer?.name || 'jugador')}.</h1>
        <p>Tu personaje ya está en la sala. Mira el proyector y espera la señal del profesor. Cuando comience la partida, la pantalla se actualizará automáticamente.</p>
        <div class="student-mini-code">${escapeHtml(room?.code || routeCode)}</div>
        <div class="started-note">Color elegido: <strong style="color:${escapeHtml(currentPlayer?.color || selectedColor)}">${escapeHtml(palette.find((p) => p.hex === (currentPlayer?.color || selectedColor))?.name || 'Personalizado')}</strong> · No cierres esta pestaña durante el juego.</div>
      </section>`;
  }

  function renderStudentStarted() {
    role = 'player';
    app.innerHTML = `
      <section class="started-card panel">
        <div class="started-icon">▶</div>
        <span class="room-badge">SALA ${escapeHtml(room?.code || routeCode)} · PARTIDA EN CURSO</span>
        <h1>¡A jugar, ${escapeHtml(currentPlayer?.name || 'jugador')}!</h1>
        <p>El profesor ha iniciado la partida. Mantén esta página abierta y sigue las instrucciones que aparezcan en el proyector.</p>
        <div class="student-mini-code">${escapeHtml(currentPlayer?.name || '')}</div>
        <div class="started-note">Este prototipo incluye el lobby y la señal de inicio. El minijuego de bombas se integrará en la siguiente etapa.</div>
      </section>`;
  }

  function renderTeacherStarted() {
    role = 'host';
    app.innerHTML = `
      <div class="lobby-heading"><div><span class="eyebrow">SALA DE PROFESOR</span><h1>¡Partida iniciada!</h1><p>La señal de inicio ya llegó a los dispositivos conectados.</p></div><span class="state-pill started">PARTIDA EN CURSO</span></div>
      <section class="teacher-started panel"><div><h2>Lobby completado.</h2><p>La sala, la conexión en tiempo real, los nombres y los colores ya funcionan. En esta versión, el botón de inicio activa el estado de partida; el tablero y las reglas del minijuego se incorporarán después.</p></div><div class="control-buttons"><button class="button secondary" id="backToLobbyButton" type="button">↶ Volver al lobby</button><button class="button danger" id="endRoomButton" type="button">Terminar sala</button></div></section>
      <section class="players-panel panel" style="margin-top:18px"><div class="players-header"><div><div class="players-heading"><h2>Curso conectado</h2><span class="player-count">${room.players.filter((p) => p.connected).length.toString().padStart(2, '0')}</span></div><p>La lista se mantiene sincronizada mientras juegan.</p></div></div><div class="players-grid">${room.players.filter((p) => p.connected).map((player) => `<article class="player-tile"><span class="player-avatar" style="--player-color:${escapeHtml(player.color)}">${escapeHtml(player.name.slice(0, 1).toLocaleUpperCase('es-CL'))}</span><div class="player-meta"><div class="player-name">${escapeHtml(player.name)}</div><div class="player-status"><span class="status-dot"></span>CONECTADO</div></div></article>`).join('')}</div></section>`;
    $('#backToLobbyButton', app).addEventListener('click', () => sendHostAction('reset'));
    $('#endRoomButton', app).addEventListener('click', () => {
      if (window.confirm('¿Terminar esta sala? Los estudiantes serán desconectados y el código dejará de estar disponible.')) sendHostAction('end');
    });
  }

  function drawQr(url) {
    const box = $('#qrBox', app);
    if (!box) return;
    if (window.QRCode && typeof window.QRCode.toCanvas === 'function') {
      const canvas = document.createElement('canvas');
      box.replaceChildren(canvas);
      window.QRCode.toCanvas(canvas, url, { width: 300, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111a2e', light: '#ffffff' } }, (error) => {
        if (error) box.innerHTML = '<span class="qr-placeholder">No se pudo crear el QR.<br>Usa el enlace o código.</span>';
      });
    } else {
      box.innerHTML = '<span class="qr-placeholder">QR no disponible.<br>Usa el enlace o código.</span>';
    }
  }
  async function copyText(text, successMessage) {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {
        const element = document.createElement('textarea'); element.value = text; element.style.position = 'fixed'; element.style.opacity = '0'; document.body.appendChild(element); element.select();
        const copied = document.execCommand('copy'); element.remove(); if (!copied) throw new Error('copy failed');
      }
      showToast(successMessage);
    } catch (_error) { showToast(`Copia manual: ${text}`); }
  }
  function sendHostAction(action) {
    if (!room) return;
    socket.emit('host:action', { code: room.code, token: hostToken(room.code), action });
  }
  function handleRoomUpdate(nextRoom) {
    if (!nextRoom || (room && nextRoom.code !== room.code)) return;
    room = nextRoom;
    if (role === 'host') {
      if (room.status === 'started') { window.TPGame ? window.TPGame.refresh() : renderTeacherStarted(); } else renderHostLobby();
    } else if (role === 'player') {
      if (room.status === 'started') { window.TPGame ? window.TPGame.refresh() : renderStudentStarted(); } else renderStudentWaiting();
    }
  }
  function routeInitial() {
    if (!routeCode) { renderHome(); return; }
    if (teacherRoute) {
      const token = hostToken(routeCode);
      if (!token) {
        app.innerHTML = `<section class="join-card panel" style="max-width:520px;margin:4vh auto"><span class="eyebrow">RECUPERAR SALA</span><h1>Falta la sesión del profesor.</h1><p class="sub">Este enlace es de administración y el navegador no conserva el código privado de esta sala. Vuelve a la pestaña donde creaste la sala o crea una nueva.</p><button class="button" id="goHome" type="button">Volver al inicio</button></section>`;
        $('#goHome', app).addEventListener('click', () => { window.location.href = window.location.pathname; });
        return;
      }
      socket.emit('host:resume', { code: routeCode, token });
      return;
    }
    const saved = getSavedProfile(routeCode);
    if (saved?.id) {
      currentPlayer = saved;
      socket.emit('player:resume', { code: routeCode, playerId: saved.id });
      app.innerHTML = `<section class="loading-panel panel"><div class="spinner"></div><p>Recuperando tu conexión…</p><button id="changePlayerButton" class="button outline" type="button">Entrar con otro nombre</button></section>`;
      $('#changePlayerButton', app).addEventListener('click', () => { clearProfile(routeCode); currentPlayer = null; renderJoinForm(); });
    } else renderJoinForm();
  }

  socket.on('connect', () => {
    setConnection(true);
    clearError();
    if (teacherRoute && !role) {
      const token = hostToken(routeCode);
      if (token) socket.emit('host:resume', { code: routeCode, token });
    } else if (routeCode && !role) {
      const saved = getSavedProfile(routeCode);
      if (saved?.id) socket.emit('player:resume', { code: routeCode, playerId: saved.id });
    }
  });
  socket.on('disconnect', () => setConnection(false));
  socket.on('room:created', ({ code, hostToken: token, room: newRoom }) => {
    rememberHost(code, token);
    room = newRoom; role = 'host';
    setUrl(hostUrl(code));
    renderHostLobby();
    showToast(`Sala ${code} creada. Comparte el QR con tu curso.`);
  });
  socket.on('host:authenticated', ({ room: newRoom, code }) => {
    room = newRoom; role = 'host';
    setUrl(hostUrl(code));
    handleRoomUpdate(newRoom);
  });
  socket.on('player:joined', ({ player, room: newRoom }) => {
    currentPlayer = player;
    saveProfile(newRoom.code, player);
    room = newRoom; role = 'player';
    handleRoomUpdate(newRoom);
    showToast(`¡Bienvenido/a, ${player.name}!`);
  });
  socket.on('player:resumed', ({ player, room: newRoom }) => {
    currentPlayer = player; saveProfile(newRoom.code, player); room = newRoom; role = 'player';
    handleRoomUpdate(newRoom);
  });
  socket.on('room:update', handleRoomUpdate);
  socket.on('app:error', ({ message } = {}) => {
    const errorMessage = message || 'Ha ocurrido un problema.';
    if (role === 'join-form' || (!role && routeCode && !teacherRoute)) setError(errorMessage);
    else showToast(errorMessage);
    if (role === 'join-form') {
      const button = $('#joinPlayerForm button[type="submit"]', app);
      if (button) { button.disabled = false; button.innerHTML = 'Entrar a la sala <span aria-hidden="true">↗</span>'; }
    }
    if (teacherRoute && !role) {
      app.innerHTML = `<section class="join-card panel" style="max-width:520px;margin:4vh auto"><span class="eyebrow">NO SE PUDO ABRIR LA SALA</span><h1>Revisa el acceso.</h1><p class="sub">${escapeHtml(errorMessage)}</p><button class="button" id="goHome" type="button">Volver al inicio</button></section>`;
      $('#goHome', app).addEventListener('click', () => { window.location.href = window.location.pathname; });
    }
  });
  socket.on('room:ended', ({ message } = {}) => {
    if (role === 'host') sessionStorage.removeItem(`tp-host-${room?.code || routeCode}`);
    if (role === 'player') clearProfile(room?.code || routeCode);
    app.innerHTML = `<section class="started-card panel"><div class="started-icon">×</div><h1>Sala terminada.</h1><p>${escapeHtml(message || 'El profesor terminó esta sala.')}</p><button class="button" id="goHome" type="button">Volver al inicio</button></section>`;
    $('#goHome', app).addEventListener('click', () => { window.location.href = window.location.pathname; });
  });

  window.TP = { socket, app, escapeHtml, hostAction: sendHostAction, get room() { return room; }, get role() { return role; }, get player() { return currentPlayer; } };
  setConnection(socket.connected);
  routeInitial();
  function $$(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }
})();
