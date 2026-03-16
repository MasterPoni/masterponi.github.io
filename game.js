
// CONFIGURACIÓN FÍSICA
const JUMP_OPTS = {
    standing: { height: 110, timeToApex: 1.0 },
    running: { height: 142, timeToApex: 1.5 }
};

function calculatePhysics(heightPixels, timeSeconds) {
    const frames = timeSeconds * 60;
    const gravity = (2 * heightPixels) / (frames * frames);
    const jumpPower = Math.abs(gravity * frames);
    return { gravity, jumpPower };
}

const PHYSICS_STANDING = calculatePhysics(JUMP_OPTS.standing.height, JUMP_OPTS.standing.timeToApex);
const PHYSICS_RUNNING = calculatePhysics(JUMP_OPTS.running.height, JUMP_OPTS.running.timeToApex);

// VARIABLES GLOBALES
const GAME_CONFIG = {
    groundFriction: 0.8,
    airFriction: 0.98,
    speed: 0.5,
    maxSpeed: 4.5,
    maxAirSpeed: 1.5,
    maxFallSpeed: 6,
    levelWidth: 5000,
    screenWidth: 512,
    groundHeight: 32,
    currentGravity: PHYSICS_STANDING.gravity
};

const playerState = {
    x: 50,
    y: GAME_CONFIG.groundHeight,
    vx: 0,
    vy: 0,
    isGrounded: false,
    isCrouching: false,
    isPushing: false,
    isTurning: false,
    width: 32,
    height: 64,
    prevX: -1,
    prevY: -1,
    facing: 1
};

const camera = { x: 0, y: 0, prevX: -1 };
let jumpKeyReleased = true;
let currentAnimState = 'idle';

let collectedFragments = 0;
const coinValueElement = document.getElementById('coin-value'); // Mantenido por si acaso

// REFERENCIAS Y LECTURA DEL MAPA
const layerBackground = document.getElementById('layer-background');
const layerMidground = document.getElementById('layer-midground');
const layerScenery = document.getElementById('layer-scenery');
const layerPlay = document.getElementById('layer-play');
const playerElement = document.getElementById('player');
const goalElement = document.getElementById('goal');

const goal = {
    x: goalElement ? parseInt(goalElement.style.left) || 2304 : 2304,
    y: goalElement ? parseInt(goalElement.style.bottom) || 32 : 32,
    width: goalElement ? parseInt(goalElement.style.width) || 32 : 32,
    height: goalElement ? parseInt(goalElement.style.height) || 300 : 300
};

// PLATAFORMAS Y TRANSITION-BLOCKS
let platforms = [];
document.querySelectorAll('.platform, .transition-block').forEach(el => {
    platforms.push({
        x: parseInt(el.style.left) || 0,
        y: parseInt(el.style.bottom) || 0,
        width: parseInt(el.style.width) || 0,
        height: parseInt(el.style.height) || 0
    });
});

let grounds = [];
document.querySelectorAll('.ground').forEach(el => {
    grounds.push({
        x: parseInt(el.style.left) || 0,
        width: parseInt(el.style.width) || 0,
        y: 0,
        height: 32
    });
});

let questionBlocks = [];
document.querySelectorAll('.question-block').forEach(el => {
    questionBlocks.push({
        element: el,
        x: parseInt(el.style.left) || 0,
        y: parseInt(el.style.bottom) || 0,
        width: parseInt(el.style.width) || 32,
        height: parseInt(el.style.height) || 32,
        isQuestionBlock: true,
        isHit: false,
        dialogId: el.getAttribute('data-dialog-id'),
        fragmentId: el.getAttribute('data-fragment-id')
    });
});

let pushBlocks = [];
document.querySelectorAll('.pushable').forEach(el => {
    pushBlocks.push({
        element: el,
        x: parseInt(el.style.left) || 0,
        y: parseInt(el.style.bottom) || 0,
        width: parseInt(el.style.width) || 32,
        height: parseInt(el.style.height) || 32,
        vx: 0,
        vy: 0,
        prevX: -1,
        prevY: -1
    });
});

let blockBarriers = [];
document.querySelectorAll('.block-barrier').forEach(el => {
    blockBarriers.push({
        x: parseInt(el.style.left) || 0,
        y: parseInt(el.style.bottom) || 0,
        width: parseInt(el.style.width) || 32,
        height: parseInt(el.style.height) || 32
    });
});

const allStaticSolids = [...platforms, ...questionBlocks];

// DIÁLOGO DINÁMICO
let dialogTimeout;
function showDialog(textHTML, x, y) {
    const dialog = document.getElementById('dialog-box');
    if (!dialog) return;
    dialog.innerHTML = textHTML;
    dialog.style.display = 'block';
    dialog.style.left = `${x}px`;
    dialog.style.bottom = `${y}px`;

    clearTimeout(dialogTimeout);
    dialogTimeout = setTimeout(() => {
        dialog.style.display = 'none';
    }, 6000);
}

// CONTROLES
const keys = { w: false, a: false, s: false, d: false };
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = true;
});
window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = false;
    if (key === 'w') {
        jumpKeyReleased = true;
        if (playerState.vy < 0) playerState.vy *= 0.2;
    }
});

// BUCLE
function gameLoop() {
    updatePhysics();
    render();
    requestAnimationFrame(gameLoop);
}

// FÍSICA
function updatePhysics() {
    playerState.isPushing = false;
    playerState.isTurning = false;

    // JUGADOR: Eje X
    if (keys.d) playerState.vx += GAME_CONFIG.speed;
    if (keys.a) playerState.vx -= GAME_CONFIG.speed;

    if (playerState.isGrounded) {
        if (playerState.vx > 1.0 && keys.a) playerState.isTurning = true;
        if (playerState.vx < -1.0 && keys.d) playerState.isTurning = true;
    }

    if (playerState.isGrounded) playerState.vx *= GAME_CONFIG.groundFriction;
    else playerState.vx *= GAME_CONFIG.airFriction;

    let currentLimit = playerState.isGrounded ? GAME_CONFIG.maxSpeed : GAME_CONFIG.maxAirSpeed;
    playerState.vx = Math.max(Math.min(playerState.vx, currentLimit), -currentLimit);

    playerState.x += playerState.vx;

    if (playerState.x < 0) { playerState.x = 0; playerState.vx = 0; }
    if (playerState.x > GAME_CONFIG.levelWidth - playerState.width) {
        playerState.x = GAME_CONFIG.levelWidth - playerState.width;
        playerState.vx = 0;
    }

    allStaticSolids.forEach(block => {
        if (playerState.x < block.x + block.width &&
            playerState.x + playerState.width > block.x &&
            playerState.y < block.y + block.height &&
            playerState.y + playerState.height > block.y) {

            if (playerState.vx > 0) playerState.x = block.x - playerState.width;
            else if (playerState.vx < 0) playerState.x = block.x + block.width;
            playerState.vx = 0;
        }
    });

    // JUGADOR: Eje Y
    playerState.vy += GAME_CONFIG.currentGravity;
    if (playerState.vy > GAME_CONFIG.maxFallSpeed) playerState.vy = GAME_CONFIG.maxFallSpeed;
    playerState.y -= playerState.vy;

    playerState.isGrounded = false;

    if (playerState.y <= GAME_CONFIG.groundHeight) {
        let onGroundBlock = false;
        grounds.forEach(g => {
            if (playerState.x + playerState.width > g.x && playerState.x < g.x + g.width) {
                onGroundBlock = true;
            }
        });
        if (onGroundBlock) {
            playerState.y = GAME_CONFIG.groundHeight;
            playerState.vy = 0;
            playerState.isGrounded = true;
            GAME_CONFIG.currentGravity = PHYSICS_STANDING.gravity;
        }
    }

    allStaticSolids.forEach(block => {
        if (playerState.x < block.x + block.width &&
            playerState.x + playerState.width > block.x &&
            playerState.y < block.y + block.height &&
            playerState.y + playerState.height > block.y) {

            if (playerState.vy > 0) {
                playerState.y = block.y + block.height;
                playerState.vy = 0;
                playerState.isGrounded = true;
                GAME_CONFIG.currentGravity = PHYSICS_STANDING.gravity;
            } else if (playerState.vy < 0) {
                playerState.y = block.y - playerState.height;
                playerState.vy = 0;

                // GOLPEAR BLOQUE SORPRESA
                if (block.isQuestionBlock && !block.isHit) {
                    block.isHit = true;
                    block.element.classList.add('hit');

                    if (block.fragmentId) {
                        const uiFragment = document.getElementById(`frag-${block.fragmentId}`);
                        if (uiFragment) {
                            uiFragment.classList.add('collected');
                            collectedFragments += 1;
                        }
                    }

                    let dialogX = block.x + (block.width / 2);
                    let dialogY = block.y + block.height + 15;

                    let contenidoHTML = "<b>¡Fragmento encontrado!</b>";
                    try {
                        if (typeof DIALOGOS_DEL_JUEGO !== 'undefined' && DIALOGOS_DEL_JUEGO[block.dialogId]) {
                            contenidoHTML = DIALOGOS_DEL_JUEGO[block.dialogId];
                        }
                    } catch (error) {
                        console.error(error);
                    }
                    showDialog(contenidoHTML, dialogX, dialogY);
                }
            }
        }
    });

    // CAJAS EMPUJABLES
    pushBlocks.forEach(block => {
        block.vy += 0.5;
        block.y -= block.vy;
        block.vx *= 0.8;
        if (Math.abs(block.vx) < 0.1) block.vx = 0;

        let nextBlockX = block.x + block.vx;

        blockBarriers.forEach(barrier => {
            if (nextBlockX < barrier.x + barrier.width &&
                nextBlockX + block.width > barrier.x &&
                block.y < barrier.y + barrier.height &&
                block.y + block.height > barrier.y) {
                if (block.vx > 0) nextBlockX = barrier.x - block.width;
                else if (block.vx < 0) nextBlockX = barrier.x + barrier.width;
                block.vx = 0;
            }
        });

        allStaticSolids.forEach(solid => {
            if (nextBlockX < solid.x + solid.width &&
                nextBlockX + block.width > solid.x &&
                block.y < solid.y + solid.height &&
                block.y + block.height > solid.y) {
                if (block.vx > 0) nextBlockX = solid.x - block.width;
                else if (block.vx < 0) nextBlockX = solid.x + solid.width;
                block.vx = 0;
            }
        });

        block.x = nextBlockX;

        if (block.y <= GAME_CONFIG.groundHeight) {
            block.y = GAME_CONFIG.groundHeight;
            block.vy = 0;
        }

        if (playerState.x < block.x + block.width &&
            playerState.x + playerState.width > block.x &&
            playerState.y < block.y + block.height &&
            playerState.y + playerState.height > block.y) {

            const previousPlayerY = playerState.y + playerState.vy;

            if (playerState.vy > 0 && previousPlayerY >= block.y + block.height - 20) {
                playerState.y = block.y + block.height;
                playerState.vy = 0;
                playerState.isGrounded = true;
                GAME_CONFIG.currentGravity = PHYSICS_STANDING.gravity;
            }
            else {
                const playerCenter = playerState.x + playerState.width / 2;
                const blockCenter = block.x + block.width / 2;

                if (playerCenter < blockCenter) {
                    playerState.x = block.x - playerState.width;
                    playerState.vx = 0;
                    block.vx = 2.5;
                    playerState.isPushing = true;
                } else {
                    playerState.x = block.x + block.width;
                    playerState.vx = 0;
                    block.vx = -2.5;
                    playerState.isPushing = true;
                }
            }
        }
    });

    // INICIAR SALTO
    if (keys.w && playerState.isGrounded && jumpKeyReleased) {
        jumpKeyReleased = false;
        playerState.isGrounded = false;
        if (Math.abs(playerState.vx) > 2.0) {
            playerState.vy = -PHYSICS_RUNNING.jumpPower;
            GAME_CONFIG.currentGravity = PHYSICS_RUNNING.gravity;
        } else {
            playerState.vy = -PHYSICS_STANDING.jumpPower;
            GAME_CONFIG.currentGravity = PHYSICS_STANDING.gravity;
        }
    }

    // COLISIÓN CON LA META
    if (playerState.x < goal.x + goal.width &&
        playerState.x + playerState.width > goal.x &&
        playerState.y < goal.y + goal.height &&
        playerState.y + playerState.height > goal.y) {

        if (collectedFragments >= 7) {
            alert("¡NIVEL SUPERADO!\nHas logrado recomponer el documento.");
            resetLevel();
            collectedFragments = 0;
            document.querySelectorAll('.paper-part').forEach(el => el.classList.remove('collected'));
            questionBlocks.forEach(b => { b.isHit = false; b.element.classList.remove('hit'); });
        } else {
            playerState.x = goal.x - playerState.width;
            playerState.vx = 0;
            showDialog(`¡Documento incompleto!<br>Llevas ${collectedFragments} de 7.`, playerState.x + 16, playerState.y + 80);
        }
    }

    if (playerState.y < -300) resetLevel();
}

// RENDER
function setAnimationState(newState) {
    if (currentAnimState === newState) return;
    if (playerElement) {
        playerElement.classList.remove('state-idle', 'state-running', 'state-jumping', 'state-falling', 'state-crouching', 'state-pushing', 'state-turning');
        playerElement.classList.add(`state-${newState}`);
    }
    currentAnimState = newState;
}

function render() {
    if (playerElement) {
        if (playerState.prevX !== playerState.x) {
            playerElement.style.left = `${playerState.x}px`;
            playerState.prevX = playerState.x;
        }
        if (playerState.prevY !== playerState.y) {
            playerElement.style.bottom = `${playerState.y}px`;
            playerState.prevY = playerState.y;
        }

        if (playerState.vx > 0.1 && playerState.facing !== 1) {
            playerElement.style.transform = "scaleX(1)";
            playerState.facing = 1;
        } else if (playerState.vx < -0.1 && playerState.facing !== -1) {
            playerElement.style.transform = "scaleX(-1)";
            playerState.facing = -1;
        }
    }

    if (playerState.isCrouching) setAnimationState('crouching');
    else if (!playerState.isGrounded) {
        if (playerState.vy < 1.0) setAnimationState('jumping');
        else setAnimationState('falling');
    } else if (playerState.isPushing) {
        setAnimationState('pushing');
    } else if (playerState.isTurning) {
        setAnimationState('turning');
    } else {
        if (Math.abs(playerState.vx) > 0.1) setAnimationState('running');
        else setAnimationState('idle');
    }

    pushBlocks.forEach(block => {
        if (block.prevX !== block.x) {
            block.element.style.left = `${block.x}px`;
            block.prevX = block.x;
        }
        if (block.prevY !== block.y) {
            block.element.style.bottom = `${block.y}px`;
            block.prevY = block.y;
        }
    });

    let targetX = playerState.x - (GAME_CONFIG.screenWidth / 2);
    if (targetX < 0) targetX = 0;
    if (targetX > GAME_CONFIG.levelWidth - GAME_CONFIG.screenWidth) {
        targetX = GAME_CONFIG.levelWidth - GAME_CONFIG.screenWidth;
    }
    camera.x = targetX;

    if (layerPlay) layerPlay.style.transform = `translateX(${-camera.x}px)`;
    if (layerScenery) layerScenery.style.transform = `translateX(${-camera.x}px)`;
    if (layerMidground) layerMidground.style.backgroundPosition = `${-camera.x * 0.5}px bottom`;
    if (layerBackground) layerBackground.style.backgroundPosition = `${-camera.x * 0.2}px bottom`;
}

function resetLevel() {
    playerState.x = 50;
    playerState.y = GAME_CONFIG.groundHeight;
    playerState.vx = 0;
    playerState.vy = 0;
    camera.x = 0;
    GAME_CONFIG.currentGravity = PHYSICS_STANDING.gravity;
}

// DECORADOR DE MUNDOS
function applyTextures() {
    const blocks = document.querySelectorAll('.ground, .platform');

    blocks.forEach(block => {
        const isGround = block.classList.contains('ground');
        const assetName = isGround ? 'Suelo' : 'Ladrillos';

        let type = 1;
        if (block.classList.contains('type-2')) type = 2;
        if (block.classList.contains('type-3')) type = 3;
        if (block.classList.contains('type-4')) type = 4;

        block.style.backgroundImage = 'none';
        block.style.backgroundColor = 'transparent';

        const width = parseInt(block.style.width);
        const numTiles = Math.ceil(width / 32);

        for (let i = 0; i < numTiles; i++) {
            let tile = document.createElement('div');
            tile.style.position = 'absolute';
            tile.style.left = `${i * 32}px`;
            tile.style.bottom = '0px';
            tile.style.width = '32px';
            tile.style.height = '100%';

            let variation = (i % 2 === 0) ? 1 : 2;
            tile.style.backgroundImage = `url('./Assets/${type}.${variation}.${assetName}.png')`;
            tile.style.backgroundRepeat = 'repeat-y';
            tile.style.backgroundSize = '32px 32px';

            block.appendChild(tile);
        }
    });
}

// ARRANQUE
applyTextures();
gameLoop();
