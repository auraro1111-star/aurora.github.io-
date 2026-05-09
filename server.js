const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const gameConfig = {
    gravity: 0.8,
    groundY: 500,
    canvasWidth: 1200,
    canvasHeight: 600,
    attackCooldown: 500,
    jumpForce: -15,
    moveSpeed: 5
};

const mechsConfig = {
    alpha: {
        id: 'alpha',
        name: '机甲Alpha',
        maxHealth: 100,
        attackDamage: 15,
        jumpAttackDamage: 20,
        defenseReduction: 0.8,
        color: {
            primary: '#ff4757',
            secondary: '#ff6b81',
            accent: '#c0392b'
        }
    },
    beta: {
        id: 'beta',
        name: '机甲Beta',
        maxHealth: 100,
        attackDamage: 15,
        jumpAttackDamage: 20,
        defenseReduction: 0.8,
        color: {
            primary: '#3742fa',
            secondary: '#5352ed',
            accent: '#1e3799'
        }
    }
};

let gameState = {
    isRunning: false,
    winner: null,
    player1: null,
    player2: null,
    timestamp: Date.now()
};

app.get('/api/config', (req, res) => {
    res.json(gameConfig);
});

app.put('/api/config', (req, res) => {
    const updates = req.body;
    Object.assign(gameConfig, updates);
    res.json({ success: true, config: gameConfig });
});

app.get('/api/mechs', (req, res) => {
    res.json(mechsConfig);
});

app.get('/api/mechs/:id', (req, res) => {
    const mech = mechsConfig[req.params.id];
    if (mech) {
        res.json(mech);
    } else {
        res.status(404).json({ error: '机甲不存在' });
    }
});

app.put('/api/mechs/:id', (req, res) => {
    const id = req.params.id;
    if (mechsConfig[id]) {
        mechsConfig[id] = { ...mechsConfig[id], ...req.body };
        res.json({ success: true, mech: mechsConfig[id] });
    } else {
        res.status(404).json({ error: '机甲不存在' });
    }
});

app.post('/api/game/start', (req, res) => {
    gameState = {
        isRunning: true,
        winner: null,
        player1: {
            x: 200,
            y: gameConfig.groundY - 80,
            health: mechsConfig.alpha.maxHealth,
            isAttacking: false,
            isBlocking: false,
            isJumping: false
        },
        player2: {
            x: gameConfig.canvasWidth - 280,
            y: gameConfig.groundY - 80,
            health: mechsConfig.beta.maxHealth,
            isAttacking: false,
            isBlocking: false,
            isJumping: false
        },
        timestamp: Date.now()
    };
    res.json({ success: true, state: gameState });
});

app.post('/api/game/end', (req, res) => {
    gameState.isRunning = false;
    res.json({ success: true, state: gameState });
});

app.get('/api/game/state', (req, res) => {
    res.json(gameState);
});

app.put('/api/game/state', (req, res) => {
    gameState = { ...gameState, ...req.body, timestamp: Date.now() };
    res.json({ success: true, state: gameState });
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.listen(PORT, () => {
    console.log(`🎮 像素风机甲对战游戏服务器已启动!`);
    console.log(`📡 服务地址: http://localhost:${PORT}`);
    console.log(`🎮 游戏地址: http://localhost:${PORT}/index.html`);
    console.log(`⚙️  管理面板: http://localhost:${PORT}/admin`);
});
