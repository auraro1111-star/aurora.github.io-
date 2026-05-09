const GameState = {
    MENU: 'menu',
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

const API_BASE = window.location.origin;

async function fetchConfig() {
    try {
        const [configRes, mechsRes] = await Promise.all([
            fetch(`${API_BASE}/api/config`),
            fetch(`${API_BASE}/api/mechs`)
        ]);
        gameConfig = await configRes.json();
        mechsConfig = await mechsRes.json();
    } catch (error) {
        console.warn('无法从服务器获取配置，使用默认配置');
        gameConfig = {
            gravity: 0.8,
            groundY: 500,
            canvasWidth: 1200,
            canvasHeight: 600,
            attackCooldown: 500,
            jumpForce: -15,
            moveSpeed: 5
        };
        mechsConfig = {
            alpha: {
                id: 'alpha',
                name: '机甲Alpha',
                maxHealth: 100,
                attackDamage: 15,
                jumpAttackDamage: 20,
                defenseReduction: 0.8,
                color: { primary: '#ff4757', secondary: '#ff6b81', accent: '#c0392b' }
            },
            beta: {
                id: 'beta',
                name: '机甲Beta',
                maxHealth: 100,
                attackDamage: 15,
                jumpAttackDamage: 20,
                defenseReduction: 0.8,
                color: { primary: '#3742fa', secondary: '#5352ed', accent: '#1e3799' }
            }
        };
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
        this.y = gameConfig.groundY - 80;
        this.width = 64;
        this.height = 80;
        this.velocityX = 0;
        this.velocityY = 0;
        
        this.isPlayer1 = isPlayer1;
        this.isFacingRight = isPlayer1;
        this.isAttacking = false;
        this.isBlocking = false;
        this.isJumping = false;
        this.isHurt = false;
        this.isDead = false;
        
        this.attackCooldown = 0;
        this.hurtTimer = 0;
        this.attackFrame = 0;
        this.animFrame = 0;
        this.animTimer = 0;
    }
    
    update(deltaTime, opponent) {
        if (this.isDead) return;
        
        this.velocityX = 0;
        
        if (this.isHurt) {
            this.hurtTimer -= deltaTime;
            if (this.hurtTimer <= 0) {
                this.isHurt = false;
            }
        }
        
        if (this.attackCooldown > 0) {
            this.attackCooldown -= deltaTime;
        }
        
        if (this.isAttacking) {
            this.attackFrame += deltaTime / 50;
            if (this.attackFrame >= 6) {
                this.isAttacking = false;
                this.attackFrame = 0;
            }
        }
        
        this.animTimer += deltaTime;
        if (this.animTimer >= 200) {
            this.animTimer = 0;
            this.animFrame = (this.animFrame + 1) % 4;
        }
        
        if (!this.isBlocking && !this.isAttacking) {
            if (this.isPlayer1) {
                if (keys['KeyA']) {
                    this.velocityX = -gameConfig.moveSpeed;
                    this.isFacingRight = false;
                }
                if (keys['KeyD']) {
                    this.velocityX = gameConfig.moveSpeed;
                    this.isFacingRight = true;
                }
            } else {
                if (keys['ArrowLeft']) {
                    this.velocityX = -gameConfig.moveSpeed;
                    this.isFacingRight = false;
                }
                if (keys['ArrowRight']) {
                    this.velocityX = gameConfig.moveSpeed;
                    this.isFacingRight = true;
                }
            }
        }
        
        if (this.isPlayer1) {
            if (keys['KeyW'] && !this.isJumping) {
                this.velocityY = gameConfig.jumpForce;
                this.isJumping = true;
            }
            this.isBlocking = keys['KeyG'] && !this.isJumping;
        } else {
            if (keys['ArrowUp'] && !this.isJumping) {
                this.velocityY = gameConfig.jumpForce;
                this.isJumping = true;
            }
            this.isBlocking = keys['KeyL'] && !this.isJumping;
        }
        
        this.velocityY += gameConfig.gravity;
        
        this.x += this.velocityX;
        this.y += this.velocityY;
        
        if (this.y >= gameConfig.groundY - this.height) {
            this.y = gameConfig.groundY - this.height;
            this.velocityY = 0;
            this.isJumping = false;
        }
        
        if (this.x < 50) this.x = 50;
        if (this.x > gameConfig.canvasWidth - this.width - 50) {
            this.x = gameConfig.canvasWidth - this.width - 50;
        }
        
        if (opponent) {
            const dx = opponent.x - this.x;
            if (dx > 0) this.isFacingRight = true;
            else if (dx < 0) this.isFacingRight = false;
        }
    }
    
    attack(opponent) {
        if (this.attackCooldown > 0 || this.isAttacking || this.isBlocking || this.isDead) return;
        
        this.isAttacking = true;
        this.attackFrame = 0;
        this.attackCooldown = gameConfig.attackCooldown;
        
        const attackRange = 100;
        const dx = opponent.x - this.x;
        const distance = Math.abs(dx);
        
        if (distance < attackRange) {
            const damage = this.isJumping ? this.jumpAttackDamage : this.attackDamage;
            opponent.takeDamage(damage, this.isJumping);
        }
    }
    
    takeDamage(damage, isJumpingAttack) {
        if (this.isDead) return;
        
        let actualDamage = damage;
        if (this.isBlocking && !isJumpingAttack) {
            actualDamage = Math.floor(damage * (1 - this.defenseReduction));
        }
        
        this.health -= actualDamage;
        this.isHurt = true;
        this.hurtTimer = 200;
        
        if (this.health <= 0) {
            this.health = 0;
            this.isDead = true;
        }
    }
    
    draw(ctx) {
        ctx.save();
        
        const drawX = this.x + this.width / 2;
        const drawY = this.y;
        
        if (this.isHurt && Math.floor(this.hurtTimer / 50) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }
        
        if (!this.isFacingRight) {
            ctx.translate(drawX * 2, 0);
            ctx.scale(-1, 1);
        }
        
        const bobOffset = this.isJumping ? 0 : Math.sin(this.animFrame * Math.PI / 2) * 2;
        const legOffset = Math.abs(this.velocityX) > 0 ? Math.sin(this.animFrame * Math.PI) * 8 : 0;
        
        this.drawMechBody(ctx, drawX, drawY + bobOffset, legOffset);
        
        if (this.isBlocking) {
            this.drawShield(ctx, drawX, drawY);
        }
        
        if (this.isAttacking) {
            this.drawAttackEffect(ctx, drawX, drawY);
        }
        
        ctx.restore();
    }
    
    drawMechBody(ctx, x, y, legOffset) {
        const pixelSize = 4;
        const color = this.color;
        
        ctx.fillStyle = color.primary;
        
        ctx.fillRect(x - 12, y, 24, 8);
        ctx.fillRect(x - 16, y + 8, 32, 16);
        ctx.fillRect(x - 14, y + 24, 28, 20);
        
        ctx.fillStyle = color.secondary;
        ctx.fillRect(x - 8, y + 2, 16, 4);
        ctx.fillRect(x - 12, y + 12, 24, 8);
        
        ctx.fillStyle = color.accent;
        ctx.fillRect(x - 6, y + 28, 12, 4);
        
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 8, y + 4, 4, 4);
        ctx.fillRect(x + 4, y + 4, 4, 4);
        
        ctx.fillStyle = color.primary;
        const legY = y + 44;
        ctx.fillRect(x - 12, legY, 8, 36 + legOffset);
        ctx.fillRect(x + 4, legY, 8, 36 - legOffset);
        
        ctx.fillStyle = color.accent;
        ctx.fillRect(x - 14, legY + 32 + legOffset, 12, 4);
        ctx.fillRect(x + 2, legY + 32 - legOffset, 12, 4);
        
        ctx.fillStyle = color.secondary;
        ctx.fillRect(x - 24, y + 12, 8, 24);
        ctx.fillRect(x + 16, y + 12, 8, 24);
        
        if (this.isAttacking) {
            const armAngle = (this.attackFrame / 6) * Math.PI / 2;
            ctx.fillStyle = color.primary;
            ctx.fillRect(x + 16, y + 16 + Math.sin(armAngle) * 10, 20, 6);
        }
    }
    
    drawShield(ctx, x, y) {
        ctx.strokeStyle = this.color.secondary;
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.6 + Math.sin(Date.now() / 100) * 0.2;
        
        ctx.beginPath();
        ctx.arc(x, y + 40, 50, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(x, y + 40, 40, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    drawAttackEffect(ctx, x, y) {
        const progress = this.attackFrame / 6;
        ctx.fillStyle = `rgba(255, 255, 255, ${1 - progress})`;
        
        const slashX = x + 20 + progress * 40;
        ctx.fillRect(slashX, y + 10, 30 - progress * 20, 4);
        ctx.fillRect(slashX + 5, y + 20, 25 - progress * 15, 4);
        ctx.fillRect(slashX + 10, y + 30, 20 - progress * 10, 4);
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
        this.hurtTimer = 0;
        this.attackFrame = 0;
        this.isFacingRight = this.isPlayer1;
    }
}

function initGame() {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    
    document.getElementById('start-btn').addEventListener('click', startGame);
    document.getElementById('rematch-btn').addEventListener('click', startGame);
    document.getElementById('menu-btn').addEventListener('click', showMenu);
}

function resizeCanvas() {
    const container = document.getElementById('game-screen');
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight - 100;
    
    const aspectRatio = gameConfig.canvasWidth / gameConfig.canvasHeight;
    let width = containerWidth;
    let height = width / aspectRatio;
    
    if (height > containerHeight) {
        height = containerHeight;
        width = height * aspectRatio;
    }
    
    canvas.width = gameConfig.canvasWidth;
    canvas.height = gameConfig.canvasHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
}

function handleKeyDown(e) {
    keys[e.code] = true;
    
    if (e.code === 'Escape') {
        if (currentState === GameState.PLAYING) {
            pauseGame();
        } else if (currentState === GameState.PAUSED) {
            resumeGame();
        }
    }
    
    if (currentState === GameState.PLAYING) {
        if (e.code === 'KeyF') {
            player1.attack(player2);
        }
        if (e.code === 'KeyK') {
            player2.attack(player1);
        }
    }
    
    if (['KeyA', 'KeyD', 'KeyW', 'KeyF', 'KeyG', 
         'ArrowLeft', 'ArrowRight', 'ArrowUp', 'KeyK', 'KeyL'].includes(e.code)) {
        e.preventDefault();
    }
}

function handleKeyUp(e) {
    keys[e.code] = false;
}

async function startGame() {
    await fetchConfig();
    
    player1 = new Mech(mechsConfig.alpha, 200, true);
    player2 = new Mech(mechsConfig.beta, gameConfig.canvasWidth - 264, false);
    
    gameTime = 0;
    
    try {
        await fetch(`${API_BASE}/api/game/start`, { method: 'POST' });
    } catch (error) {
        console.warn('无法同步游戏状态到服务器');
    }
    
    showScreen('game-screen');
    currentState = GameState.PLAYING;
    resizeCanvas();
    
    lastTime = performance.now();
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
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
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

function gameLoop(timestamp) {
    if (currentState !== GameState.PLAYING) return;
    
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;
    
    gameTime += deltaTime;
    
    update(deltaTime);
    render();
    
    if (player1.isDead || player2.isDead) {
        endGame();
        return;
    }
    
    animationFrameId = requestAnimationFrame(gameLoop);
}

function update(deltaTime) {
    player1.update(deltaTime, player2);
    player2.update(deltaTime, player1);
    
    updateHUD();
}

function updateHUD() {
    const healthPercent1 = (player1.health / player1.maxHealth) * 100;
    const healthPercent2 = (player2.health / player2.maxHealth) * 100;
    
    document.getElementById('health-bar-1').style.width = `${healthPercent1}%`;
    document.getElementById('health-bar-2').style.width = `${healthPercent2}%`;
    document.getElementById('health-text-1').textContent = Math.ceil(player1.health);
    document.getElementById('health-text-2').textContent = Math.ceil(player2.health);
    
    const minutes = Math.floor(gameTime / 60000);
    const seconds = Math.floor((gameTime % 60000) / 1000);
    document.getElementById('round-time').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    drawBackground();
    player1.draw(ctx);
    player2.draw(ctx);
}

function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#0a0a1a');
    gradient.addColorStop(0.5, '#1a1a2e');
    gradient.addColorStop(1, '#2d2d44');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 50; i++) {
        const x = (i * 137 + Date.now() / 100) % canvas.width;
        const y = (i * 89) % (gameConfig.groundY - 100);
        const size = (i % 3) + 1;
        ctx.globalAlpha = 0.3 + (i % 5) * 0.1;
        ctx.fillRect(x, y, size, size);
    }
    ctx.globalAlpha = 1;
    
    ctx.fillStyle = '#1e1e3a';
    ctx.fillRect(0, gameConfig.groundY, canvas.width, canvas.height - gameConfig.groundY);
    
    ctx.strokeStyle = '#3d3d5c';
    ctx.lineWidth = 2;
    for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, gameConfig.groundY);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = gameConfig.groundY; y < canvas.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    
    ctx.strokeStyle = '#ff4757';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, gameConfig.groundY);
    ctx.lineTo(canvas.width, gameConfig.groundY);
    ctx.stroke();
    
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.strokeRect(50, 50, canvas.width - 100, gameConfig.groundY - 100);
    ctx.setLineDash([]);
}

function endGame() {
    currentState = GameState.GAME_OVER;
    
    const winner = player1.isDead ? '玩家2' : '玩家1';
    const winnerMech = player1.isDead ? player2 : player1;
    
    document.getElementById('winner-text').textContent = `${winner} 获胜!`;
    document.getElementById('winner-text').style.color = winnerMech.color.primary;
    
    const winnerPreview = document.getElementById('winner-mech');
    winnerPreview.style.background = `linear-gradient(135deg, ${winnerMech.color.primary}, ${winnerMech.color.accent})`;
    
    const minutes = Math.floor(gameTime / 60000);
    const seconds = Math.floor((gameTime % 60000) / 1000);
    document.getElementById('final-time').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    showScreen('result-screen');
}

document.addEventListener('DOMContentLoaded', async () => {
    await fetchConfig();
    initGame();
});
