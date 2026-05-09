const GameState = {
    MENU: 'menu',
    COUNTDOWN: 'countdown',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAME_OVER: 'game_over'
};

let currentState = GameState.MENU;
let gameConfig = null;
let mechsConfig = null;
let canvas, ctx;
let player1, player2;
let keys = {};
let lastTime = 0;
let gameTime = 0;
let animationFrameId = null;
let countdownTimer = 0;
let countdownText = '';
let hitEffects = [];
let screenShake = 0;

const API_BASE = window.location.origin;

const defaultGameConfig = {
    gravity: 0.6,
    groundY: 480,
    canvasWidth: 1200,
    canvasHeight: 600,
    attackCooldown: 400,
    jumpForce: -14,
    moveSpeed: 6
};

const defaultMechsConfig = {
    alpha: {
        id: 'alpha',
        name: '机甲Alpha',
        maxHealth: 100,
        attackDamage: 12,
        jumpAttackDamage: 18,
        defenseReduction: 0.75,
        color: { primary: '#ff4757', secondary: '#ff6b81', accent: '#c0392b', dark: '#8b0000' }
    },
    beta: {
        id: 'beta',
        name: '机甲Beta',
        maxHealth: 100,
        attackDamage: 12,
        jumpAttackDamage: 18,
        defenseReduction: 0.75,
        color: { primary: '#3742fa', secondary: '#5352ed', accent: '#1e3799', dark: '#00008b' }
    }
};

async function fetchConfig() {
    try {
        const [configRes, mechsRes] = await Promise.all([
            fetch(`${API_BASE}/api/config`),
            fetch(`${API_BASE}/api/mechs`)
        ]);
        gameConfig = await configRes.json();
        mechsConfig = await mechsRes.json();
    } catch (error) {
        console.warn('使用默认配置');
        gameConfig = { ...defaultGameConfig };
        mechsConfig = {
            alpha: { ...defaultMechsConfig.alpha },
            beta: { ...defaultMechsConfig.beta }
        };
    }
}

class HitEffect {
    constructor(x, y, damage, color) {
        this.x = x;
        this.y = y;
        this.damage = damage;
        this.color = color;
        this.life = 1.0;
        this.particles = [];
        for (let i = 0; i < 8; i++) {
            this.particles.push({
                x: 0, y: 0,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8 - 3,
                size: Math.random() * 4 + 2,
                life: 1.0
            });
        }
    }

    update(dt) {
        this.life -= dt / 800;
        this.y -= 1.5;
        this.particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.2;
            p.life -= dt / 500;
        });
    }

    draw(ctx) {
        if (this.life <= 0) return;
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.font = 'bold 20px "Press Start 2P", monospace';
        ctx.fillStyle = this.color;
        ctx.textAlign = 'center';
        ctx.fillText(`-${this.damage}`, this.x, this.y);

        this.particles.forEach(p => {
            if (p.life <= 0) return;
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x + p.x, this.y + p.y, p.size, p.size);
        });
        ctx.restore();
    }

    isDead() {
        return this.life <= 0;
    }
}

class Mech {
    constructor(config, x, isPlayer1) {
        this.id = config.id;
        this.name = config.name;
        this.maxHealth = config.maxHealth;
        this.health = config.maxHealth;
        this.attackDamage = config.attackDamage;
        this.jumpAttackDamage = config.jumpAttackDamage;
        this.defenseReduction = config.defenseReduction;
        this.color = config.color;

        this.x = x;
        this.y = gameConfig.groundY - 120;
        this.width = 80;
        this.height = 120;
        this.velocityX = 0;
        this.velocityY = 0;

        this.isPlayer1 = isPlayer1;
        this.facingRight = isPlayer1;
        this.isAttacking = false;
        this.isBlocking = false;
        this.isJumping = false;
        this.isHurt = false;
        this.isDead = false;

        this.attackCooldown = 0;
        this.attackTimer = 0;
        this.attackDuration = 300;
        this.hurtTimer = 0;
        this.animFrame = 0;
        this.animTimer = 0;
        this.walkCycle = 0;
        this.idleCycle = 0;
        this.knockbackX = 0;
    }

    update(dt, opponent) {
        if (this.isDead) return;

        const dtScale = dt / 16.67;

        if (this.hurtTimer > 0) {
            this.hurtTimer -= dt;
            if (this.hurtTimer <= 0) this.isHurt = false;
        }

        if (this.attackCooldown > 0) {
            this.attackCooldown -= dt;
        }

        if (this.isAttacking) {
            this.attackTimer -= dt;
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
                this.attackTimer = 0;
            }
        }

        this.animTimer += dt;
        if (this.animTimer >= 150) {
            this.animTimer = 0;
            this.animFrame = (this.animFrame + 1) % 4;
        }

        this.idleCycle += dt * 0.004;
        this.walkCycle += Math.abs(this.velocityX) * dt * 0.01;

        this.velocityX = 0;

        let wantBlock = false;
        if (this.isPlayer1) {
            wantBlock = keys['KeyG'] && !this.isJumping;
        } else {
            wantBlock = keys['KeyL'] && !this.isJumping;
        }
        this.isBlocking = wantBlock;

        if (!this.isBlocking && !this.isAttacking && !this.isHurt) {
            if (this.isPlayer1) {
                if (keys['KeyA']) {
                    this.velocityX = -gameConfig.moveSpeed * dtScale;
                }
                if (keys['KeyD']) {
                    this.velocityX = gameConfig.moveSpeed * dtScale;
                }
            } else {
                if (keys['ArrowLeft']) {
                    this.velocityX = -gameConfig.moveSpeed * dtScale;
                }
                if (keys['ArrowRight']) {
                    this.velocityX = gameConfig.moveSpeed * dtScale;
                }
            }
        }

        if (!this.isAttacking && !this.isHurt) {
            if (this.isPlayer1) {
                if (keys['KeyW'] && !this.isJumping) {
                    this.velocityY = gameConfig.jumpForce;
                    this.isJumping = true;
                }
            } else {
                if (keys['ArrowUp'] && !this.isJumping) {
                    this.velocityY = gameConfig.jumpForce;
                    this.isJumping = true;
                }
            }
        }

        if (this.knockbackX !== 0) {
            this.x += this.knockbackX * dtScale;
            this.knockbackX *= 0.85;
            if (Math.abs(this.knockbackX) < 0.5) this.knockbackX = 0;
        }

        this.velocityY += gameConfig.gravity * dtScale;
        this.x += this.velocityX;
        this.y += this.velocityY;

        if (this.y >= gameConfig.groundY - this.height) {
            this.y = gameConfig.groundY - this.height;
            this.velocityY = 0;
            this.isJumping = false;
        }

        if (this.x < 30) this.x = 30;
        if (this.x > gameConfig.canvasWidth - this.width - 30) {
            this.x = gameConfig.canvasWidth - this.width - 30;
        }

        if (opponent && !opponent.isDead) {
            const myCenter = this.x + this.width / 2;
            const oppCenter = opponent.x + opponent.width / 2;
            this.facingRight = myCenter < oppCenter;
        }
    }

    attack(opponent) {
        if (this.attackCooldown > 0 || this.isAttacking || this.isBlocking || this.isDead || this.isHurt) return;

        this.isAttacking = true;
        this.attackTimer = this.attackDuration;
        this.attackCooldown = gameConfig.attackCooldown;

        const myCenter = this.x + this.width / 2;
        const oppCenter = opponent.x + opponent.width / 2;
        const distance = Math.abs(myCenter - oppCenter);

        const inFront = this.facingRight
            ? opponent.x > this.x - 20
            : opponent.x < this.x + this.width + 20;

        if (distance < 140 && inFront) {
            const damage = this.isJumping ? this.jumpAttackDamage : this.attackDamage;
            const blocked = opponent.takeDamage(damage, this.isJumping);
            if (blocked) {
                hitEffects.push(new HitEffect(oppCenter, opponent.y - 10, Math.floor(damage * (1 - opponent.defenseReduction)), '#ffd700'));
            } else {
                hitEffects.push(new HitEffect(oppCenter, opponent.y - 10, damage, this.color.primary));
            }
            screenShake = 8;
            const knockDir = this.facingRight ? 1 : -1;
            opponent.knockbackX = knockDir * (blocked ? 3 : 6);
        }
    }

    takeDamage(damage, isJumpingAttack) {
        if (this.isDead) return false;

        let actualDamage = damage;
        let blocked = false;
        if (this.isBlocking && !isJumpingAttack) {
            actualDamage = Math.floor(damage * (1 - this.defenseReduction));
            blocked = true;
        }

        this.health -= actualDamage;
        this.isHurt = true;
        this.hurtTimer = 200;

        if (this.health <= 0) {
            this.health = 0;
            this.isDead = true;
        }
        return blocked;
    }

    draw(ctx) {
        ctx.save();

        const cx = this.x + this.width / 2;
        const cy = this.y;

        if (this.isHurt && Math.floor(this.hurtTimer / 40) % 2 === 0) {
            ctx.globalAlpha = 0.4;
        }

        if (!this.facingRight) {
            ctx.translate(cx, 0);
            ctx.scale(-1, 1);
            ctx.translate(-cx, 0);
        }

        const idleBob = this.isJumping ? 0 : Math.sin(this.idleCycle) * 3;
        const walkBob = Math.abs(this.velocityX) > 0.5 ? Math.sin(this.walkCycle * 3) * 2 : 0;
        const drawY = cy + idleBob + walkBob;

        this.drawBody(ctx, cx, drawY);

        if (this.isBlocking) {
            this.drawShield(ctx, cx, drawY);
        }

        if (this.isAttacking) {
            this.drawSlash(ctx, cx, drawY);
        }

        ctx.restore();

        this.drawShadow(ctx, cx, gameConfig.groundY);
    }

    drawBody(ctx, cx, y) {
        const c = this.color;
        const ps = 4;

        ctx.fillStyle = c.primary;
        ctx.fillRect(cx - 16, y, 32, 12);
        ctx.fillRect(cx - 20, y + 12, 40, 24);
        ctx.fillRect(cx - 18, y + 36, 36, 28);

        ctx.fillStyle = c.secondary;
        ctx.fillRect(cx - 12, y + 2, 24, 8);
        ctx.fillRect(cx - 16, y + 16, 32, 12);

        ctx.fillStyle = c.accent;
        ctx.fillRect(cx - 10, y + 40, 20, 6);
        ctx.fillRect(cx - 8, y + 52, 16, 4);

        ctx.fillStyle = '#00ffff';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 8;
        ctx.fillRect(cx - 10, y + 4, 6, 6);
        ctx.fillRect(cx + 4, y + 4, 6, 6);
        ctx.shadowBlur = 0;

        ctx.fillStyle = c.dark;
        ctx.fillRect(cx - 12, y + 4, 2, 2);
        ctx.fillRect(cx + 10, y + 4, 2, 2);

        const legAnim = Math.abs(this.velocityX) > 0.5 ? Math.sin(this.walkCycle * 3) * 10 : 0;
        ctx.fillStyle = c.primary;
        ctx.fillRect(cx - 16, y + 64, 12, 40 + legAnim);
        ctx.fillRect(cx + 4, y + 64, 12, 40 - legAnim);

        ctx.fillStyle = c.accent;
        ctx.fillRect(cx - 18, y + 100 + legAnim, 16, 8);
        ctx.fillRect(cx + 2, y + 100 - legAnim, 16, 8);

        ctx.fillStyle = c.dark;
        ctx.fillRect(cx - 18, y + 104 + legAnim, 16, 4);
        ctx.fillRect(cx + 2, y + 104 - legAnim, 16, 4);

        ctx.fillStyle = c.secondary;
        if (this.isAttacking) {
            const progress = 1 - (this.attackTimer / this.attackDuration);
            const armExtend = Math.sin(progress * Math.PI) * 30;
            ctx.fillRect(cx + 20, y + 18, 12 + armExtend, 10);
            ctx.fillStyle = c.accent;
            ctx.fillRect(cx + 28 + armExtend, y + 16, 12, 14);
        } else if (this.isBlocking) {
            ctx.fillRect(cx + 18, y + 14, 10, 30);
            ctx.fillRect(cx - 28, y + 14, 10, 30);
        } else {
            ctx.fillRect(cx + 20, y + 18, 10, 24);
            ctx.fillRect(cx - 30, y + 18, 10, 24);
        }

        ctx.fillStyle = c.primary;
        ctx.fillRect(cx - 8, y - 12, 16, 12);
        ctx.fillStyle = c.accent;
        ctx.fillRect(cx - 4, y - 16, 8, 6);

        if (this.isBlocking) {
            ctx.fillStyle = c.secondary;
            ctx.fillRect(cx - 6, y - 20, 12, 6);
        }
    }

    drawShield(ctx, cx, y) {
        const pulse = Math.sin(Date.now() * 0.008) * 0.2 + 0.5;
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = this.color.secondary;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(cx, y + 60, 55, 70, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = this.color.primary;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cx, y + 60, 48, 62, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    drawSlash(ctx, cx, y) {
        const progress = 1 - (this.attackTimer / this.attackDuration);
        const alpha = 1 - progress;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        const slashX = cx + 30 + progress * 30;
        ctx.moveTo(slashX, y + 10);
        ctx.lineTo(slashX + 20, y + 30);
        ctx.lineTo(slashX, y + 50);
        ctx.stroke();

        ctx.strokeStyle = this.color.primary;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(slashX + 5, y + 15);
        ctx.lineTo(slashX + 25, y + 30);
        ctx.lineTo(slashX + 5, y + 45);
        ctx.stroke();
        ctx.restore();
    }

    drawShadow(ctx, cx, groundY) {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#000000';
        const shadowScale = 1 - (groundY - (this.y + this.height)) / 300;
        const sw = 60 * Math.max(0.3, shadowScale);
        const sh = 8 * Math.max(0.3, shadowScale);
        ctx.beginPath();
        ctx.ellipse(cx, groundY + 4, sw / 2, sh / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    reset(x) {
        this.health = this.maxHealth;
        this.x = x;
        this.y = gameConfig.groundY - this.height;
        this.velocityX = 0;
        this.velocityY = 0;
        this.isAttacking = false;
        this.isBlocking = false;
        this.isJumping = false;
        this.isHurt = false;
        this.isDead = false;
        this.attackCooldown = 0;
        this.attackTimer = 0;
        this.hurtTimer = 0;
        this.facingRight = this.isPlayer1;
        this.knockbackX = 0;
        this.animFrame = 0;
        this.animTimer = 0;
        this.walkCycle = 0;
        this.idleCycle = 0;
    }
}

function initGame() {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');

    canvas.width = gameConfig.canvasWidth;
    canvas.height = gameConfig.canvasHeight;

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    document.getElementById('start-btn').addEventListener('click', startGame);
    document.getElementById('rematch-btn').addEventListener('click', startGame);
    document.getElementById('menu-btn').addEventListener('click', showMenu);
}

function resizeCanvas() {
    const maxW = window.innerWidth;
    const maxH = window.innerHeight - 80;
    const ratio = gameConfig.canvasWidth / gameConfig.canvasHeight;
    let w = maxW;
    let h = w / ratio;
    if (h > maxH) {
        h = maxH;
        w = h * ratio;
    }
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
}

function handleKeyDown(e) {
    keys[e.code] = true;

    if (e.code === 'Escape') {
        if (currentState === GameState.PLAYING) {
            pauseGame();
        } else if (currentState === GameState.PAUSED) {
            resumeGame();
        }
        return;
    }

    if (currentState === GameState.PLAYING) {
        if (e.code === 'KeyF' && player1) {
            player1.attack(player2);
        }
        if (e.code === 'KeyK' && player2) {
            player2.attack(player1);
        }
    }

    const gameKeys = ['KeyA', 'KeyD', 'KeyW', 'KeyF', 'KeyG',
        'ArrowLeft', 'ArrowRight', 'ArrowUp', 'KeyK', 'KeyL', 'Space'];
    if (gameKeys.includes(e.code)) {
        e.preventDefault();
    }
}

function handleKeyUp(e) {
    keys[e.code] = false;
}

async function startGame() {
    await fetchConfig();

    player1 = new Mech(mechsConfig.alpha, 200, true);
    player2 = new Mech(mechsConfig.beta, gameConfig.canvasWidth - 280, false);

    gameTime = 0;
    hitEffects = [];
    screenShake = 0;

    try {
        await fetch(`${API_BASE}/api/game/start`, { method: 'POST' });
    } catch (error) { }

    showScreen('game-screen');
    canvas.width = gameConfig.canvasWidth;
    canvas.height = gameConfig.canvasHeight;
    resizeCanvas();

    currentState = GameState.COUNTDOWN;
    countdownTimer = 3000;
    countdownText = '3';

    lastTime = performance.now();
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    gameLoop(lastTime);
}

function pauseGame() {
    currentState = GameState.PAUSED;
    document.getElementById('pause-overlay').classList.remove('hidden');
}

function resumeGame() {
    currentState = GameState.PLAYING;
    document.getElementById('pause-overlay').classList.add('hidden');
    lastTime = performance.now();
    gameLoop(lastTime);
}

function showMenu() {
    currentState = GameState.MENU;
    showScreen('menu-screen');
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function gameLoop(timestamp) {
    const rawDt = timestamp - lastTime;
    lastTime = timestamp;
    const dt = Math.min(rawDt, 50);

    if (currentState === GameState.COUNTDOWN) {
        countdownTimer -= dt;
        if (countdownTimer > 2000) countdownText = '3';
        else if (countdownTimer > 1000) countdownText = '2';
        else if (countdownTimer > 0) countdownText = '1';
        else {
            countdownText = 'FIGHT!';
            currentState = GameState.PLAYING;
            setTimeout(() => { countdownText = ''; }, 500);
        }
        render();
        animationFrameId = requestAnimationFrame(gameLoop);
        return;
    }

    if (currentState !== GameState.PLAYING) return;

    gameTime += dt;

    update(dt);
    render();

    if (player1.isDead || player2.isDead) {
        setTimeout(() => endGame(), 800);
        currentState = GameState.GAME_OVER;
        return;
    }

    animationFrameId = requestAnimationFrame(gameLoop);
}

function update(dt) {
    player1.update(dt, player2);
    player2.update(dt, player1);

    hitEffects = hitEffects.filter(e => {
        e.update(dt);
        return !e.isDead();
    });

    if (screenShake > 0) screenShake *= 0.85;
    if (screenShake < 0.5) screenShake = 0;

    const p1box = { x: player1.x, y: player1.y, w: player1.width, h: player1.height };
    const p2box = { x: player2.x, y: player2.y, w: player2.width, h: player2.height };
    if (p1box.x < p2box.x + p2box.w && p1box.x + p1box.w > p2box.x &&
        p1box.y < p2box.y + p2box.h && p1box.y + p1box.h > p2box.y) {
        const overlap = Math.min(p1box.x + p1box.w - p2box.x, p2box.x + p2box.w - p1box.x);
        player1.x -= overlap / 2;
        player2.x += overlap / 2;
    }

    updateHUD();
}

function updateHUD() {
    const hp1 = (player1.health / player1.maxHealth) * 100;
    const hp2 = (player2.health / player2.maxHealth) * 100;

    document.getElementById('health-bar-1').style.width = hp1 + '%';
    document.getElementById('health-bar-2').style.width = hp2 + '%';
    document.getElementById('health-text-1').textContent = Math.ceil(player1.health);
    document.getElementById('health-text-2').textContent = Math.ceil(player2.health);

    const m = Math.floor(gameTime / 60000);
    const s = Math.floor((gameTime % 60000) / 1000);
    document.getElementById('round-time').textContent =
        m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0');
}

function render() {
    ctx.save();

    if (screenShake > 0) {
        ctx.translate(
            (Math.random() - 0.5) * screenShake * 2,
            (Math.random() - 0.5) * screenShake * 2
        );
    }

    ctx.clearRect(-10, -10, canvas.width + 20, canvas.height + 20);
    drawBackground();
    player1.draw(ctx);
    player2.draw(ctx);

    hitEffects.forEach(e => e.draw(ctx));

    if (countdownText) {
        drawCountdown();
    }

    ctx.restore();
}

function drawCountdown() {
    ctx.save();
    ctx.font = 'bold 72px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const pulse = 1 + Math.sin(Date.now() * 0.01) * 0.1;

    if (countdownText === 'FIGHT!') {
        ctx.fillStyle = '#ff4757';
        ctx.shadowColor = '#ff4757';
    } else {
        ctx.fillStyle = '#ffd700';
        ctx.shadowColor = '#ffd700';
    }
    ctx.shadowBlur = 20;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2 - 40);
    ctx.scale(pulse, pulse);
    ctx.fillText(countdownText, 0, 0);
    ctx.restore();
    ctx.restore();
}

function drawBackground() {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#05051a');
    grad.addColorStop(0.6, '#0d0d2b');
    grad.addColorStop(1, '#1a1a3e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 80; i++) {
        const sx = (i * 137.5 + 23) % canvas.width;
        const sy = (i * 89.3 + 17) % (gameConfig.groundY - 60);
        const ss = (i % 3) + 1;
        const twinkle = Math.sin(Date.now() * 0.002 + i * 0.7) * 0.3 + 0.5;
        ctx.globalAlpha = twinkle;
        ctx.fillRect(sx, sy, ss, ss);
    }
    ctx.globalAlpha = 1;

    const gy = gameConfig.groundY;
    const floorGrad = ctx.createLinearGradient(0, gy, 0, canvas.height);
    floorGrad.addColorStop(0, '#1a1a3e');
    floorGrad.addColorStop(1, '#0d0d2b');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, gy, canvas.width, canvas.height - gy);

    ctx.strokeStyle = '#2a2a5a';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, gy);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = gy; y < canvas.height; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    ctx.strokeStyle = '#ff4757';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#ff4757';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(canvas.width, gy);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = 'rgba(255, 215, 0, 0.15)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.strokeRect(30, 30, canvas.width - 60, gy - 60);
    ctx.setLineDash([]);
}

function endGame() {
    const winner = player1.isDead ? '玩家2' : '玩家1';
    const winnerMech = player1.isDead ? player2 : player1;

    document.getElementById('winner-text').textContent = winner + ' 获胜!';
    document.getElementById('winner-text').style.color = winnerMech.color.primary;

    const preview = document.getElementById('winner-mech');
    preview.style.background = 'linear-gradient(135deg, ' + winnerMech.color.primary + ', ' + winnerMech.color.accent + ')';

    const m = Math.floor(gameTime / 60000);
    const s = Math.floor((gameTime % 60000) / 1000);
    document.getElementById('final-time').textContent =
        m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0');

    showScreen('result-screen');
}

document.addEventListener('DOMContentLoaded', async () => {
    await fetchConfig();
    initGame();
});
