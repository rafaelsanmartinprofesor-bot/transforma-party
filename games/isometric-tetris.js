// games/isometric-tetris.js
// Minijuego: Tetris Isométrico: El Encaje Vectorial
// Contenido matemático: Traslación, Rotación y Reflexión en el plano cartesiano.

class IsometricTetrisGame {
    constructor(io, roomId) {
        this.io = io;
        this.roomId = roomId;
        this.state = 'waiting'; // waiting, playing, ended
        this.players = {}; // socketId -> { x, y, rotation, reflection, score, finished }
        this.targetShape = {
            type: 'L',
            x: 0,
            y: 0,
            rotation: 0,
            reflection: false
        };
        this.timer = 30; // 30 segundos por ronda
        this.interval = null;
    }

    init(playerSockets) {
        this.state = 'playing';
        playerSockets.forEach(socketId => {
            this.players[socketId] = {
                x: 0,
                y: 0,
                rotation: 0,
                reflection: false,
                score: 0,
                finished: false
            };
        });
        this.generateTarget();
        this.startTimer();
    }

    generateTarget() {
        const rotations = [0, 90, 180, 270];
        const types = ['L', 'T', 'I', 'Z'];
        this.targetShape = {
            type: types[Math.floor(Math.random() * types.length)],
            x: Math.floor(Math.random() * 7) - 3, // Coordenada X entre -3 y 3
            y: Math.floor(Math.random() * 7) - 3, // Coordenada Y entre -3 y 3
            rotation: rotations[Math.floor(Math.random() * rotations.length)],
            reflection: Math.random() > 0.5
        };
    }

    handlePlayerAction(socketId, action) {
        if (this.state !== 'playing') return;
        const player = this.players[socketId];
        if (!player || player.finished) return;

        // Acciones disponibles desde el cliente:
        // action.type: 'translate' (dx, dy), 'rotate' (90°), 'reflect' (invertir eje), 'submit' (comprobar encaje)
        if (action.type === 'translate') {
            player.x += (action.dx || 0);
            player.y += (action.dy || 0);
        } else if (action.type === 'rotate') {
            player.rotation = (player.rotation + 90) % 360;
        } else if (action.type === 'reflect') {
            player.reflection = !player.reflection;
        } else if (action.type === 'submit') {
            const matchX = player.x === this.targetShape.x;
            const matchY = player.y === this.targetShape.y;
            const matchRot = player.rotation === this.targetShape.rotation;
            const matchRef = player.reflection === this.targetShape.reflection;

            if (matchX && matchY && matchRot && matchRef) {
                player.score += 100;
                player.finished = true;
            } else {
                player.score = Math.max(0, player.score - 15); // Penalización por intento fallido
            }
        }

        this.broadcastState();
    }

    startTimer() {
        this.interval = setInterval(() => {
            this.timer--;
            if (this.timer <= 0) {
                clearInterval(this.interval);
                this.endGame();
            } else {
                this.broadcastState();
            }
        }, 1000);
    }

    broadcastState() {
        this.io.to(this.roomId).emit('isometric_tetris_state', {
            state: this.state,
            target: this.targetShape,
            players: this.players,
            timer: this.timer
        });
    }

    endGame() {
        this.state = 'ended';
        this.io.to(this.roomId).emit('isometric_tetris_ended', {
            players: this.players
        });
    }
}

module.exports = IsometricTetrisGame;
