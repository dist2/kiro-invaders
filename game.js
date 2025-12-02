const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game constants
const COLORS = {
    purple500: '#790ECB',
    purple300: '#A855F7',
    white: '#FFFFFF',
    prey300: '#9CA3AF',
    black900: '#0a0a0a'
};

// Particle system constants
const MAX_PARTICLES = 500;

// Score Manager for localStorage persistence
const ScoreManager = {
    STORAGE_KEY: 'kiroInvadersHighScore',
    
    // Save current score to localStorage
    saveScore(score) {
        try {
            const data = {
                highScore: score,
                lastPlayed: Date.now()
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            // Handle QuotaExceededError or SecurityError
            if (e.name === 'QuotaExceededError') {
                console.warn('localStorage quota exceeded. Score not saved.');
            } else if (e.name === 'SecurityError') {
                console.warn('localStorage access denied (private browsing?). Score not saved.');
            } else {
                console.error('Error saving score:', e);
            }
        }
    },
    
    // Retrieve high score from localStorage
    getHighScore() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (!stored) {
                return 0;
            }
            
            const data = JSON.parse(stored);
            
            // Validate data format
            if (typeof data.highScore !== 'number' || isNaN(data.highScore)) {
                console.warn('Corrupted high score data. Resetting to 0.');
                this.saveScore(0);
                return 0;
            }
            
            return data.highScore;
        } catch (e) {
            // Handle JSON parse errors or localStorage access errors
            console.warn('Error reading high score. Resetting to 0.', e);
            this.saveScore(0);
            return 0;
        }
    },
    
    // Check if current score is a new high score
    isNewHighScore(score) {
        const currentHigh = this.getHighScore();
        return score > currentHigh;
    },
    
    // Update high score if current score is higher
    updateHighScore(score) {
        if (this.isNewHighScore(score)) {
            this.saveScore(score);
            return true; // Indicates a new high score was set
        }
        return false;
    }
};

// Game state
let gameState = 'start'; // 'start', 'playing', 'respawning', 'gameOver'
let score = 0;
let highScore = 0; // Loaded from localStorage
let lives = 3;
let currentGroup = 1;
let enemiesInGroup = 5;
let groupEnemiesDefeated = 0;
let confettiSpawned = false; // Track if confetti has been spawned for current high score

// Respawn animation
let respawnStartTime = 0;
let respawnDuration = 1500; // 1.5 seconds
let playerFlashAlpha = 1;

// Lightspeed effect
let lightspeedActive = false;
let lightspeedStartTime = 0;
let lightspeedDuration = 4000; // 4 seconds total
let lightspeedSpeedMultiplier = 1; // Current speed multiplier for stars

// Stats tracking
let totalShots = 0;
let totalHits = 0;

// Player
const player = {
    x: 100,
    y: canvas.height / 2,
    width: 50,
    height: 50,
    speed: 5,
    direction: 1, // 1 = right, -1 = left
    img: new Image()
};

// Input handling
const keys = {};

// Game arrays
const lasers = [];
const enemies = [];
const particles = [];
const stars = [];

// Timers
let lastLaserTime = 0;
let lastEnemySpawnTime = 0;
let enemySpawnDelay = 200; // 0.2 seconds between enemies in a group
let enemiesSpawnedInGroup = 0;
let trailSpawnCounter = 0; // Counter for throttling trail particle spawning
let sparkleSpawnCounter = 0; // Counter for throttling sparkle particle spawning

// Load player image
player.img.src = 'kiro-logo.png';

// Load individual enemy sprites
const enemyImages = {
    black: new Image(),
    ghost: new Image(),
    space: new Image()
};

enemyImages.black.src = 'enemy-black.png';
enemyImages.ghost.src = 'enemy-ghost.png';
enemyImages.space.src = 'enemy-space.png';

// Enemy sprite types
const ENEMY_TYPES = ['black', 'ghost', 'space'];

// Track when images are loaded to get their natural dimensions
const enemyImageDimensions = {
    black: { width: 64, height: 64, loaded: false },
    ghost: { width: 64, height: 64, loaded: false },
    space: { width: 64, height: 64, loaded: false }
};

// Update dimensions when images load
enemyImages.black.onload = function() {
    enemyImageDimensions.black.width = this.naturalWidth;
    enemyImageDimensions.black.height = this.naturalHeight;
    enemyImageDimensions.black.loaded = true;
};
enemyImages.ghost.onload = function() {
    enemyImageDimensions.ghost.width = this.naturalWidth;
    enemyImageDimensions.ghost.height = this.naturalHeight;
    enemyImageDimensions.ghost.loaded = true;
};
enemyImages.space.onload = function() {
    enemyImageDimensions.space.width = this.naturalWidth;
    enemyImageDimensions.space.height = this.naturalHeight;
    enemyImageDimensions.space.loaded = true;
};

// Keyboard input
document.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    
    if (e.key === ' ') {
        if (gameState === 'start') {
            startGame();
        } else if (gameState === 'gameOver') {
            resetGame();
        }
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

// Mouse move handler for cursor change on credits links
canvas.addEventListener('mousemove', (e) => {
    if (gameState === 'start') {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Check if mouse is over image credits area (lower left) or GitHub link (lower right)
        const overImageCredits = x >= 10 && x <= 350 && y >= canvas.height - 25 && y <= canvas.height - 5;
        const overGithubLink = x >= canvas.width - 310 && x <= canvas.width - 10 && y >= canvas.height - 25 && y <= canvas.height - 5;
        
        if (overImageCredits || overGithubLink) {
            canvas.style.cursor = 'pointer';
        } else {
            canvas.style.cursor = 'default';
        }
    } else {
        canvas.style.cursor = 'default';
    }
});

// Click handler for credits links on start screen
canvas.addEventListener('click', (e) => {
    if (gameState === 'start') {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Check if click is in image credits area (lower left)
        if (x >= 10 && x <= 350 && y >= canvas.height - 25 && y <= canvas.height - 5) {
            window.open('https://www.vecteezy.com/free-png/space-invaders', '_blank');
        }
        
        // Check if click is in GitHub link area (lower right)
        if (x >= canvas.width - 310 && x <= canvas.width - 10 && y >= canvas.height - 25 && y <= canvas.height - 5) {
            window.open('https://github.com/dist2/kiro-invaders', '_blank');
        }
    }
});

function startGame() {
    gameState = 'playing';
    lastLaserTime = Date.now();
}

function resetGame() {
    gameState = 'start';
    score = 0;
    lives = 3;
    currentGroup = 1;
    groupEnemiesDefeated = 0;
    enemiesSpawnedInGroup = 0;
    totalShots = 0;
    totalHits = 0;
    lasers.length = 0;
    enemies.length = 0;
    particles.length = 0;
    player.x = 100;
    player.y = canvas.height / 2;
    confettiSpawned = false; // Reset confetti flag
    // High score persists across resets
}

// Laser class
class Laser {
    constructor(x, y, direction) {
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 4;
        this.speed = 8 * direction;
        this.direction = direction;
        this.hasHit = false;
    }
    
    update() {
        this.x += this.speed;
    }
    
    draw() {
        ctx.fillStyle = COLORS.purple300;
        ctx.fillRect(this.x, this.y - this.height / 2, this.width, this.height);
        
        // Glow effect
        ctx.shadowBlur = 10;
        ctx.shadowColor = COLORS.purple300;
        ctx.fillRect(this.x, this.y - this.height / 2, this.width, this.height);
        ctx.shadowBlur = 0;
    }
}

// Enemy class
class Enemy {
    constructor(pathIndex, groupNumber) {
        // Random starting position on the right side
        this.x = canvas.width + 50;
        this.y = 100 + Math.random() * (canvas.height - 200); // Random Y position
        
        this.width = 40;
        this.height = 40;
        this.baseSpeed = 1.5;
        this.speed = this.baseSpeed * Math.pow(1.07, groupNumber - 1);
        this.baseHealth = 2;
        this.health = Math.ceil(this.baseHealth * Math.pow(1.1, groupNumber - 1));
        this.maxHealth = this.health;
        this.pathIndex = pathIndex;
        this.groupNumber = groupNumber;
        this.isLeader = pathIndex === 0;
        this.movingRight = false;
        
        // Random initial vertical direction and speed
        this.movingDown = Math.random() > 0.5;
        this.reachedLeft = false;
        this.verticalSpeed = (this.speed * 0.3) + (Math.random() * this.speed * 0.6); // 0.3x to 0.9x of horizontal speed
        
        this.lastDirectionChange = Date.now();
        this.directionChangeDelay = 800 + Math.random() * 1200;
        
        // Assign random enemy sprite type
        this.spriteType = ENEMY_TYPES[Math.floor(Math.random() * ENEMY_TYPES.length)];
        this.img = enemyImages[this.spriteType];
        
        // Update width and height based on sprite's natural dimensions
        // Scale to fit within a reasonable size (40px base, but maintain aspect ratio)
        const spriteDims = enemyImageDimensions[this.spriteType];
        if (spriteDims.loaded) {
            const scale = 40 / Math.max(spriteDims.width, spriteDims.height);
            this.width = spriteDims.width * scale;
            this.height = spriteDims.height * scale;
        }
        
        // Scatter behavior
        this.isScattering = false;
        this.scatterStartTime = 0;
        this.scatterDuration = 0; // Will be set randomly when scatter starts
        this.scatterVelocityX = 0;
        this.scatterVelocityY = 0;
        this.targetFormationX = 0;
        this.targetFormationY = 0;
    }
    
    promoteToLeader() {
        this.isLeader = true;
    }
    
    startScatter(allEnemies) {
        this.isScattering = true;
        this.scatterStartTime = Date.now();
        
        // Random scatter duration between 1-4 seconds per enemy
        this.scatterDuration = 1000 + Math.random() * 3000; // 1000-4000ms
        
        // Random scatter direction
        const angle = Math.random() * Math.PI * 2;
        const speed = 3 + Math.random() * 2; // Random speed 3-5
        this.scatterVelocityX = Math.cos(angle) * speed;
        this.scatterVelocityY = Math.sin(angle) * speed;
        
        // Avoid other enemies by adjusting direction if too close
        for (let other of allEnemies) {
            if (other === this) continue;
            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < 100) {
                // Push away from nearby enemy
                this.scatterVelocityX -= dx / dist * 2;
                this.scatterVelocityY -= dy / dist * 2;
            }
        }
    }
    
    update(leader) {
        // Handle scatter behavior
        if (this.isScattering) {
            const elapsed = Date.now() - this.scatterStartTime;
            
            if (elapsed < this.scatterDuration) {
                // Scatter phase - move in random direction
                this.x += this.scatterVelocityX;
                this.y += this.scatterVelocityY;
                
                // Bounce off screen edges
                if (this.x < 50 || this.x > canvas.width - 50) {
                    this.scatterVelocityX *= -1;
                }
                if (this.y < 50 || this.y > canvas.height - 50) {
                    this.scatterVelocityY *= -1;
                }
                
                // Keep within bounds
                this.x = Math.max(50, Math.min(canvas.width - 50, this.x));
                this.y = Math.max(50, Math.min(canvas.height - 50, this.y));
                
                return; // Skip normal movement
            } else {
                // Return to formation phase
                if (leader) {
                    const targetX = leader.x + (this.pathIndex * 60);
                    const targetY = leader.y;
                    
                    const dx = targetX - this.x;
                    const dy = targetY - this.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    
                    if (dist > 10) {
                        // Accelerate back to formation (faster than normal)
                        const returnSpeed = this.speed * 3; // 3x speed to catch up
                        this.x += (dx / dist) * returnSpeed;
                        this.y += (dy / dist) * returnSpeed;
                        return; // Skip normal movement
                    } else {
                        // Back in formation
                        this.isScattering = false;
                    }
                } else {
                    // No leader, stop scattering
                    this.isScattering = false;
                }
            }
        }
        
        if (this.isLeader) {
            // Leader controls the movement
            if (!this.reachedLeft) {
                // Move horizontally (left)
                this.x -= this.speed;
                
                // Apply initial vertical movement
                if (this.movingDown) {
                    this.y += this.verticalSpeed;
                } else {
                    this.y -= this.verticalSpeed;
                }
                
                // Bounce off vertical boundaries
                if (this.y > canvas.height - 50) {
                    this.movingDown = false;
                    this.y = canvas.height - 50;
                }
                if (this.y < 50) {
                    this.movingDown = true;
                    this.y = 50;
                }
                
                if (this.x < 50) {
                    this.reachedLeft = true;
                    this.movingRight = true;
                }
            } else {
                // Move horizontally
                if (this.movingRight) {
                    this.x += this.speed;
                    if (this.x > canvas.width - 50) {
                        this.movingRight = false;
                    }
                } else {
                    this.x -= this.speed;
                    if (this.x < 50) {
                        this.movingRight = true;
                    }
                }
                
                // Smart vertical movement - try to hit player and avoid lasers
                const now = Date.now();
                
                // Check if we should change direction
                if (now - this.lastDirectionChange > this.directionChangeDelay) {
                    // Try to move toward player
                    const toPlayer = player.y - this.y;
                    
                    // Check for nearby lasers
                    let nearbyLaser = false;
                    for (let laser of lasers) {
                        const dx = laser.x - this.x;
                        const dy = laser.y - this.y;
                        if (Math.abs(dx) < 100 && Math.abs(dy) < 40) {
                            nearbyLaser = true;
                            // Try to dodge
                            this.movingDown = dy < 0;
                            break;
                        }
                    }
                    
                    // If no laser nearby, move toward player
                    if (!nearbyLaser && Math.abs(toPlayer) > 30) {
                        this.movingDown = toPlayer > 0;
                    }
                    
                    this.lastDirectionChange = now;
                    this.directionChangeDelay = 600 + Math.random() * 1000;
                }
                
                // Apply vertical movement
                if (this.movingDown) {
                    this.y += this.verticalSpeed;
                    if (this.y > canvas.height - 50) {
                        this.movingDown = false;
                    }
                } else {
                    this.y -= this.verticalSpeed;
                    if (this.y < 50) {
                        this.movingDown = true;
                    }
                }
            }
        } else if (leader) {
            // Follow the leader's position with offset
            this.x = leader.x + (this.pathIndex * 60);
            this.y = leader.y;
        }
    }
    
    draw() {
        // Draw enemy sprite
        if (this.img && this.img.complete) {
            ctx.drawImage(
                this.img,
                this.x - this.width / 2, this.y - this.height / 2,
                this.width, this.height
            );
        } else {
            // Fallback to colored rectangle if image not loaded
            ctx.fillStyle = this.spriteType === 'black' ? '#333333' : 
                           this.spriteType === 'ghost' ? '#E0E0E0' : '#4A90E2';
            ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        }
        
        // Health bar
        const healthBarWidth = this.width;
        const healthBarHeight = 4;
        const healthPercent = this.health / this.maxHealth;
        
        ctx.fillStyle = '#333';
        ctx.fillRect(this.x - healthBarWidth / 2, this.y - this.height / 2 - 10, healthBarWidth, healthBarHeight);
        
        ctx.fillStyle = healthPercent > 0.5 ? '#4ADE80' : healthPercent > 0.25 ? '#FCD34D' : '#EF4444';
        ctx.fillRect(this.x - healthBarWidth / 2, this.y - this.height / 2 - 10, healthBarWidth * healthPercent, healthBarHeight);
    }
    
    takeDamage() {
        this.health--;
        return this.health <= 0;
    }
}

// Particle class for effects
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 4;
        this.vy = (Math.random() - 0.5) * 4;
        this.life = 1;
        this.decay = 0.02;
        this.size = Math.random() * 3 + 2;
        this.color = color;
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
    }
    
    draw() {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.globalAlpha = 1;
    }
}

// TrailParticle class for player movement trail
class TrailParticle extends Particle {
    constructor(x, y) {
        super(x, y, COLORS.purple300);
        // Small size for subtle trail
        this.size = Math.random() * 2 + 2;
        // Minimal velocity for subtle movement
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        // Slow decay for longer-lasting trail
        this.decay = 0.03;
    }
}

// ExplosionParticle class with gravity effects
class ExplosionParticle extends Particle {
    constructor(x, y, color) {
        super(x, y, color);
        // Larger size for more impactful explosions
        this.size = Math.random() * 3 + 3;
        // Higher initial velocity for dramatic effect
        this.vx = (Math.random() - 0.5) * 8;
        this.vy = (Math.random() - 0.5) * 8;
        // Faster decay
        this.decay = 0.025;
        // Gravity property
        this.gravity = 0.2;
    }
    
    update() {
        // Apply gravity to vertical velocity
        this.vy += this.gravity;
        // Call parent update to handle position and life
        super.update();
    }
}

// SparkleParticle class with rotation and scale
class SparkleParticle extends Particle {
    constructor(x, y) {
        // Bright colors: purple, white, gold
        const colors = [COLORS.purple300, COLORS.white, '#FFD700'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        super(x, y, color);
        
        // Configure with bright colors and twinkling animation
        this.size = 3;
        // Minimal velocity for subtle movement
        this.vx = (Math.random() - 0.5) * 1;
        this.vy = (Math.random() - 0.5) * 1;
        // Moderate decay
        this.decay = 0.02;
        
        // Rotation properties
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.2;
        
        // Scale properties
        this.scale = 0.5 + Math.random();
        this.scaleSpeed = (Math.random() - 0.5) * 0.05;
        this.minScale = 0.5;
        this.maxScale = 1.5;
    }
    
    update() {
        // Update rotation
        this.rotation += this.rotationSpeed;
        
        // Update scale with oscillation
        this.scale += this.scaleSpeed;
        if (this.scale > this.maxScale || this.scale < this.minScale) {
            this.scaleSpeed *= -1;
        }
        
        // Call parent update
        super.update();
    }
    
    draw() {
        ctx.save();
        ctx.globalAlpha = this.life;
        
        // Apply transformations
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.scale(this.scale, this.scale);
        
        // Draw sparkle as a star shape
        ctx.fillStyle = this.color;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
            const angle = (i * Math.PI) / 2;
            const x = Math.cos(angle) * this.size;
            const y = Math.sin(angle) * this.size;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.fill();
        
        // Add glow effect
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fill();
        
        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    }
}

// ConfettiParticle class with physics
class ConfettiParticle extends Particle {
    constructor(x, y) {
        // Use Kiro brand colors: purple500, purple300, white
        const colors = [COLORS.purple500, COLORS.purple300, COLORS.white];
        const color = colors[Math.floor(Math.random() * colors.length)];
        super(x, y, color);
        
        // Random size between 4-8
        this.size = 4 + Math.random() * 4;
        
        // Random initial velocities for variety
        this.vx = (Math.random() - 0.5) * 6;
        this.vy = -Math.random() * 8 - 2; // Initial upward velocity
        
        // Slower decay for longer celebration
        this.decay = 0.01;
        
        // Gravity property
        this.gravity = 0.15;
        
        // Rotation properties
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.3;
        
        // Horizontal drift
        this.drift = (Math.random() - 0.5) * 0.5;
        
        // Rectangle dimensions
        this.width = this.size;
        this.height = this.size * 1.5;
    }
    
    update() {
        // Apply gravity to vertical velocity
        this.vy += this.gravity;
        
        // Apply horizontal drift
        this.vx += this.drift * 0.1;
        
        // Update rotation
        this.rotation += this.rotationSpeed;
        
        // Call parent update to handle position and life
        super.update();
    }
    
    draw() {
        ctx.save();
        ctx.globalAlpha = this.life;
        
        // Apply transformations
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        // Draw rotated rectangle
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        
        ctx.restore();
        ctx.globalAlpha = 1;
    }
}

function createExplosion(x, y, color, intensity = 1) {
    // Variable particle count based on intensity
    const particleCount = Math.floor(20 * intensity);
    
    for (let i = 0; i < particleCount; i++) {
        const particle = new ExplosionParticle(x, y, color);
        
        // Ensure outward velocity vectors from collision center
        // Calculate angle for this particle
        const angle = (i / particleCount) * Math.PI * 2;
        const speed = 3 + Math.random() * 5; // Random speed between 3-8
        
        // Set velocity based on angle for outward motion
        particle.vx = Math.cos(angle) * speed;
        particle.vy = Math.sin(angle) * speed;
        
        particles.push(particle);
    }
}

function spawnTrailParticles() {
    // Only spawn when game state is 'playing'
    if (gameState !== 'playing') {
        return;
    }
    
    // Throttle spawn rate to every 2-3 frames
    trailSpawnCounter++;
    if (trailSpawnCounter >= 2) {
        particles.push(new TrailParticle(player.x, player.y));
        trailSpawnCounter = 0;
    }
}

function spawnSparkleParticles(x, y) {
    // Spawn sparkle particles at regular intervals
    sparkleSpawnCounter++;
    if (sparkleSpawnCounter >= 5) {
        // Spawn 5 sparkle particles
        for (let i = 0; i < 5; i++) {
            particles.push(new SparkleParticle(x, y));
        }
        sparkleSpawnCounter = 0;
    }
}

function spawnConfetti() {
    // Spawn 80-100 confetti particles
    const particleCount = 80 + Math.floor(Math.random() * 21);
    
    for (let i = 0; i < particleCount; i++) {
        // Randomize initial positions across screen width
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height * 0.3; // Start from top 30% of screen
        
        const confetti = new ConfettiParticle(x, y);
        
        // Randomize initial velocities for variety
        confetti.vx = (Math.random() - 0.5) * 8;
        confetti.vy = -Math.random() * 10 - 3; // Strong upward velocity
        
        particles.push(confetti);
    }
}

function enforceParticleLimit() {
    // Remove oldest particles when limit is reached
    if (particles.length > MAX_PARTICLES) {
        const excessCount = particles.length - MAX_PARTICLES;
        particles.splice(0, excessCount);
    }
}

// Star class for scrolling background
class Star {
    constructor(x, y, size, speed) {
        this.x = x;
        this.y = y;
        this.size = size;
        this.baseSpeed = speed; // Store original speed
        this.speed = speed;
        this.opacity = 0.3 + Math.random() * 0.7; // Random opacity between 0.3 and 1
        this.twinkleSpeed = 0.02 + Math.random() * 0.03;
        this.twinkleDirection = Math.random() > 0.5 ? 1 : -1;
        this.prevX = x; // For trail effect
        this.prevY = y;
    }
    
    update(speedMultiplier = 1) {
        // Store previous position for trail
        this.prevX = this.x;
        this.prevY = this.y;
        
        // Move star from right to left with speed multiplier
        this.speed = this.baseSpeed * speedMultiplier;
        this.x -= this.speed;
        
        // Wrap around when star goes off screen
        if (this.x < -10) {
            this.x = canvas.width + 10;
            this.y = Math.random() * canvas.height;
            this.prevX = this.x;
            this.prevY = this.y;
        }
        
        // Twinkle effect (slower during lightspeed)
        if (speedMultiplier < 5) {
            this.opacity += this.twinkleSpeed * this.twinkleDirection;
            if (this.opacity >= 1 || this.opacity <= 0.3) {
                this.twinkleDirection *= -1;
            }
        }
    }
    
    draw(speedMultiplier = 1) {
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = '#FFFFFF';
        
        // Draw trail during lightspeed
        if (speedMultiplier > 3) {
            const trailLength = Math.min(speedMultiplier * 10, 100);
            const gradient = ctx.createLinearGradient(this.x, this.y, this.x + trailLength, this.y);
            gradient.addColorStop(0, 'rgba(255, 255, 255, ' + this.opacity + ')');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            
            ctx.strokeStyle = gradient;
            ctx.lineWidth = this.size;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.x + trailLength, this.y);
            ctx.stroke();
        }
        
        // Draw star as a small circle
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        
        // Add a subtle glow for larger stars
        if (this.size > 1.5) {
            ctx.shadowBlur = this.size * 2;
            ctx.shadowColor = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
        
        ctx.globalAlpha = 1;
    }
}

// Initialize stars
function initStars() {
    stars.length = 0;
    const starCount = 100; // Number of stars
    
    for (let i = 0; i < starCount; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const size = 0.5 + Math.random() * 2; // Size between 0.5 and 2.5 pixels
        const speed = 0.1 + Math.random() * 0.4; // Speed between 0.1 and 0.5
        
        stars.push(new Star(x, y, size, speed));
    }
}

// Update stars
function updateStars() {
    for (let star of stars) {
        star.update(lightspeedSpeedMultiplier);
    }
}

// Draw stars
function drawStars() {
    for (let star of stars) {
        star.draw(lightspeedSpeedMultiplier);
    }
}

// Start lightspeed effect
function startLightspeed() {
    lightspeedActive = true;
    lightspeedStartTime = Date.now();
    lightspeedSpeedMultiplier = 1;
}

// Update lightspeed effect
function updateLightspeed() {
    if (!lightspeedActive) return;
    
    const elapsed = Date.now() - lightspeedStartTime;
    const progress = elapsed / lightspeedDuration;
    
    if (progress >= 1) {
        // Lightspeed complete
        lightspeedActive = false;
        lightspeedSpeedMultiplier = 1;
        return;
    }
    
    // Easing function for smooth acceleration and deceleration
    // Accelerate for first 40%, maintain for 20%, decelerate for last 40%
    if (progress < 0.4) {
        // Acceleration phase (0 to 0.4)
        const accelProgress = progress / 0.4;
        lightspeedSpeedMultiplier = 1 + (accelProgress * accelProgress) * 19; // Ease in to 20x speed
    } else if (progress < 0.6) {
        // Maintain phase (0.4 to 0.6)
        lightspeedSpeedMultiplier = 20; // Max speed
    } else {
        // Deceleration phase (0.6 to 1.0)
        const decelProgress = (progress - 0.6) / 0.4;
        const easeOut = 1 - ((1 - decelProgress) * (1 - decelProgress));
        lightspeedSpeedMultiplier = 20 - (easeOut * 19); // Ease out back to 1x speed
    }
}

// Pixel-perfect collision detection for enemy sprites
function checkSpriteCollision(laser, enemy) {
    // First do a bounding box check for performance
    if (laser.x + laser.width < enemy.x - enemy.width / 2 ||
        laser.x > enemy.x + enemy.width / 2 ||
        laser.y + laser.height / 2 < enemy.y - enemy.height / 2 ||
        laser.y - laser.height / 2 > enemy.y + enemy.height / 2) {
        return false;
    }
    
    // Check if enemy image is loaded
    if (!enemy.img || !enemy.img.complete) {
        // Fallback to bounding box collision if image not loaded
        return true;
    }
    
    try {
        // If bounding boxes overlap, check pixel-level collision
        // Create a temporary canvas to check sprite pixels
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = enemy.width;
        tempCanvas.height = enemy.height;
        
        // Draw the enemy sprite to the temporary canvas
        tempCtx.drawImage(
            enemy.img,
            0, 0,
            enemy.width, enemy.height
        );
        
        // Get the image data
        const canvasWidth = Math.floor(enemy.width);
        const canvasHeight = Math.floor(enemy.height);
        const imageData = tempCtx.getImageData(0, 0, canvasWidth, canvasHeight);
        const pixels = imageData.data;
        
        // Calculate laser position relative to enemy sprite
        const laserLeft = laser.x - (enemy.x - enemy.width / 2);
        const laserRight = laser.x + laser.width - (enemy.x - enemy.width / 2);
        const laserTop = laser.y - laser.height / 2 - (enemy.y - enemy.height / 2);
        const laserBottom = laser.y + laser.height / 2 - (enemy.y - enemy.height / 2);
        
        // Check if any pixel in the laser's area is non-transparent
        for (let y = Math.floor(Math.max(0, laserTop)); y < Math.ceil(Math.min(canvasHeight, laserBottom)); y++) {
            for (let x = Math.floor(Math.max(0, laserLeft)); x < Math.ceil(Math.min(canvasWidth, laserRight)); x++) {
                const index = (y * canvasWidth + x) * 4;
                const alpha = pixels[index + 3];
                
                // If pixel is not transparent, we have a hit
                if (alpha > 50) { // Threshold for considering a pixel as "solid"
                    return true;
                }
            }
        }
        
        return false;
    } catch (e) {
        // If there's any error with pixel detection, fallback to bounding box
        console.warn('Pixel collision detection error:', e);
        return true;
    }
}

function updatePlayer() {
    // Track if player is moving
    let isMoving = false;
    
    // Movement
    if (keys['ArrowUp'] && player.y > player.height / 2) {
        player.y -= player.speed;
        isMoving = true;
    }
    if (keys['ArrowDown'] && player.y < canvas.height - player.height / 2) {
        player.y += player.speed;
        isMoving = true;
    }
    if (keys['ArrowLeft'] && player.x > player.width / 2) {
        player.x -= player.speed;
        player.direction = -1;
        isMoving = true;
    }
    if (keys['ArrowRight'] && player.x < canvas.width - player.width / 2) {
        player.x += player.speed;
        player.direction = 1;
        isMoving = true;
    }
    
    // Spawn trail particles when moving
    if (isMoving) {
        spawnTrailParticles();
    }
    
    // Auto-fire laser every 0.7 seconds
    const now = Date.now();
    if (now - lastLaserTime > 700) {
        fireLaser();
    }
}

function fireLaser() {
    const offsetX = player.direction === 1 ? player.width / 2 : -player.width / 2;
    lasers.push(new Laser(player.x + offsetX, player.y, player.direction));
    lastLaserTime = Date.now();
    totalShots++;
}

function spawnEnemyGroup() {
    if (enemiesSpawnedInGroup >= enemiesInGroup) {
        return;
    }
    
    const now = Date.now();
    if (now - lastEnemySpawnTime > enemySpawnDelay) {
        enemies.push(new Enemy(enemiesSpawnedInGroup, currentGroup));
        enemiesSpawnedInGroup++;
        lastEnemySpawnTime = now;
    }
}

function handleRespawn() {
    const elapsed = Date.now() - respawnStartTime;
    
    if (elapsed < respawnDuration) {
        // Flash effect
        playerFlashAlpha = Math.abs(Math.sin(elapsed / 100));
        
        // Smoothly move enemies to new positions
        const progress = elapsed / respawnDuration;
        enemies.forEach(enemy => {
            if (enemy.targetX !== undefined) {
                enemy.x = enemy.startX + (enemy.targetX - enemy.startX) * progress;
                enemy.y = enemy.startY + (enemy.targetY - enemy.startY) * progress;
            }
        });
    } else {
        // Respawn complete
        gameState = 'playing';
        playerFlashAlpha = 1;
        
        // Clear target positions
        enemies.forEach(enemy => {
            delete enemy.startX;
            delete enemy.startY;
            delete enemy.targetX;
            delete enemy.targetY;
        });
    }
}

function updateGame() {
    // Always update stars for scrolling background
    updateStars();
    
    // Update lightspeed effect
    updateLightspeed();
    
    if (gameState === 'respawning') {
        handleRespawn();
        return;
    }
    
    if (gameState !== 'playing') return;
    
    updatePlayer();
    
    // Spawn enemies
    if (enemiesSpawnedInGroup < enemiesInGroup) {
        spawnEnemyGroup();
    }
    
    // Update lasers
    for (let i = lasers.length - 1; i >= 0; i--) {
        lasers[i].update();
        
        if (lasers[i].x > canvas.width || lasers[i].x < 0) {
            lasers.splice(i, 1);
        }
    }
    
    // Update enemies
    let leader = enemies.find(e => e.isLeader);
    for (let i = enemies.length - 1; i >= 0; i--) {
        enemies[i].update(leader);
        
        // Check proximity and collision with player
        const dx = enemies[i].x - player.x;
        const dy = enemies[i].y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Proximity detection for sparkles (within 80px but not colliding)
        const proximityThreshold = 80;
        const collisionThreshold = player.width / 2 + enemies[i].width / 2;
        
        if (distance < proximityThreshold && distance >= collisionThreshold) {
            // Player is near enemy without collision - spawn sparkles
            spawnSparkleParticles(player.x, player.y);
        }
        
        if (distance < collisionThreshold) {
            createExplosion(player.x, player.y, '#FF4444');
            createExplosion(player.x, player.y, COLORS.purple500);
            
            lives--;
            
            if (lives <= 0) {
                gameState = 'gameOver';
                // Update high score when game ends
                if (ScoreManager.updateHighScore(score)) {
                    // New high score achieved, update display variable
                    highScore = score;
                }
            } else {
                // Start respawn sequence
                gameState = 'respawning';
                respawnStartTime = Date.now();
                
                // Reset player position
                player.x = 100;
                player.y = canvas.height / 2;
                
                // Set new random positions for enemies (at least 400px away from player)
                enemies.forEach(enemy => {
                    enemy.startX = enemy.x;
                    enemy.startY = enemy.y;
                    
                    // Find a position at least 400px away from player
                    let newX, newY, dist;
                    do {
                        newX = 400 + Math.random() * (canvas.width - 500);
                        newY = 50 + Math.random() * (canvas.height - 100);
                        const dx = newX - player.x;
                        const dy = newY - player.y;
                        dist = Math.sqrt(dx * dx + dy * dy);
                    } while (dist < 400);
                    
                    enemy.targetX = newX;
                    enemy.targetY = newY;
                });
            }
            break;
        }
        
        // Remove if off screen
        if (enemies[i].x < -50) {
            enemies.splice(i, 1);
        }
    }
    
    // Check laser-enemy collisions
    for (let i = lasers.length - 1; i >= 0; i--) {
        for (let j = enemies.length - 1; j >= 0; j--) {
            const laser = lasers[i];
            const enemy = enemies[j];
            
            // Use pixel-perfect collision detection
            if (checkSpriteCollision(laser, enemy)) {
                
                if (!laser.hasHit) {
                    laser.hasHit = true;
                    totalHits++;
                    
                    if (enemy.takeDamage()) {
                        score += 100 * currentGroup;
                        createExplosion(enemy.x, enemy.y, '#4ADE80');
                        
                        // Check if new high score is achieved and spawn confetti
                        if (!confettiSpawned && score > highScore) {
                            spawnConfetti();
                            confettiSpawned = true;
                            highScore = score; // Update high score immediately for display
                        }
                        
                        // Make remaining enemies scatter before removing this one
                        if (enemies.length > 1) {
                            for (let k = 0; k < enemies.length; k++) {
                                if (k !== j) { // Don't scatter the one being destroyed
                                    enemies[k].startScatter(enemies);
                                }
                            }
                        }
                        
                        // If leader was destroyed, promote next enemy and reassign pathIndex
                        if (enemy.isLeader && enemies.length > 1) {
                            enemies.splice(j, 1);
                            
                            // Promote first remaining enemy to leader
                            if (enemies.length > 0) {
                                enemies[0].promoteToLeader();
                                enemies[0].reachedLeft = true;
                                enemies[0].movingRight = true;
                                
                                // Reassign pathIndex for all remaining enemies
                                for (let k = 0; k < enemies.length; k++) {
                                    enemies[k].pathIndex = k;
                                }
                            }
                            j--; // Adjust index since we already spliced
                        } else {
                            enemies.splice(j, 1);
                        }
                        groupEnemiesDefeated++;
                        
                        // Check if group is complete
                        if (groupEnemiesDefeated >= enemiesInGroup) {
                            currentGroup++;
                            groupEnemiesDefeated = 0;
                            enemiesSpawnedInGroup = 0;
                            
                            // Start lightspeed effect
                            startLightspeed();
                            
                            // Delay next group until after lightspeed completes
                            lastEnemySpawnTime = Date.now() + lightspeedDuration + 500; // Lightspeed + 0.5s buffer
                        }
                    } else {
                        createExplosion(enemy.x, enemy.y, COLORS.purple300);
                    }
                    
                    lasers.splice(i, 1);
                    
                    // Fire another laser immediately after hit
                    fireLaser();
                    break;
                }
            }
        }
    }
    
    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        if (particles[i].life <= 0) {
            particles.splice(i, 1);
        }
    }
    
    // Enforce particle count limit to prevent memory issues
    enforceParticleLimit();
}

function drawPlayer() {
    ctx.save();
    ctx.globalAlpha = playerFlashAlpha;
    ctx.translate(player.x, player.y);
    if (player.direction === -1) {
        ctx.scale(-1, 1);
    }
    ctx.drawImage(player.img, -player.width / 2, -player.height / 2, player.width, player.height);
    ctx.restore();
    ctx.globalAlpha = 1;
}

function drawUI() {
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(`Score: ${score}`, 20, 40);
    
    ctx.fillText(`Lives: ${lives}`, 20, 70);
    
    ctx.fillStyle = COLORS.prey300;
    ctx.font = '16px sans-serif';
    ctx.fillText(`Group: ${currentGroup}`, 20, 95);
    ctx.fillText(`High Score: ${highScore}`, 20, 115);
}

function drawStartScreen() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = COLORS.purple500;
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('KIRO INVADERS', canvas.width / 2, canvas.height / 2 - 50);
    
    ctx.fillStyle = COLORS.white;
    ctx.font = '24px sans-serif';
    ctx.fillText('Press SPACE to Begin', canvas.width / 2, canvas.height / 2 + 20);
    
    ctx.fillStyle = COLORS.prey300;
    ctx.font = '16px sans-serif';
    ctx.fillText('Arrow Keys to Move • Auto-Fire Enabled', canvas.width / 2, canvas.height / 2 + 60);
    
    // Image credits in lower left (clickable)
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.purple300;
    ctx.font = '12px sans-serif';
    const imageCreditsText = 'Graphics: Space Invaders PNGs by Vecteezy';
    ctx.fillText(imageCreditsText, 10, canvas.height - 10);
    
    // Underline to indicate it's clickable
    const imageCreditsWidth = ctx.measureText(imageCreditsText).width;
    ctx.strokeStyle = COLORS.purple300;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10, canvas.height - 8);
    ctx.lineTo(10 + imageCreditsWidth, canvas.height - 8);
    ctx.stroke();
    
    // Created by and GitHub link in lower right (clickable)
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.purple300;
    ctx.font = '12px sans-serif';
    const githubText = 'Created by: Dave Barry - github.com/dist2/kiro-invaders';
    ctx.fillText(githubText, canvas.width - 10, canvas.height - 10);
    
    // Underline to indicate it's clickable
    const githubWidth = ctx.measureText(githubText).width;
    ctx.strokeStyle = COLORS.purple300;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(canvas.width - 10 - githubWidth, canvas.height - 8);
    ctx.lineTo(canvas.width - 10, canvas.height - 8);
    ctx.stroke();
}

function drawGameOverScreen() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = COLORS.purple500;
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 100);
    
    ctx.fillStyle = COLORS.white;
    ctx.font = '32px sans-serif';
    ctx.fillText(`Final Score: ${score}`, canvas.width / 2, canvas.height / 2 - 30);
    
    // Show high score
    ctx.fillStyle = COLORS.purple300;
    ctx.font = '24px sans-serif';
    ctx.fillText(`High Score: ${highScore}`, canvas.width / 2, canvas.height / 2 + 5);
    
    ctx.fillStyle = COLORS.prey300;
    ctx.font = '20px sans-serif';
    const accuracy = totalShots > 0 ? ((totalHits / totalShots) * 100).toFixed(1) : 0;
    ctx.fillText(`Shots Fired: ${totalShots}`, canvas.width / 2, canvas.height / 2 + 40);
    ctx.fillText(`Hits: ${totalHits}`, canvas.width / 2, canvas.height / 2 + 70);
    ctx.fillText(`Accuracy: ${accuracy}%`, canvas.width / 2, canvas.height / 2 + 100);
    
    ctx.fillStyle = COLORS.white;
    ctx.font = '24px sans-serif';
    ctx.fillText('Press SPACE to Restart', canvas.width / 2, canvas.height / 2 + 160);
    
    ctx.textAlign = 'left';
}

function draw() {
    // Clear canvas
    ctx.fillStyle = COLORS.black900;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw stars in background (always visible)
    drawStars();
    
    if (gameState === 'playing' || gameState === 'respawning' || gameState === 'gameOver') {
        // Draw game objects
        drawPlayer();
        
        lasers.forEach(laser => laser.draw());
        enemies.forEach(enemy => enemy.draw());
        particles.forEach(particle => particle.draw());
        
        drawUI();
    }
    
    if (gameState === 'start') {
        drawStartScreen();
    } else if (gameState === 'gameOver') {
        drawGameOverScreen();
    }
}

function gameLoop() {
    updateGame();
    draw();
    requestAnimationFrame(gameLoop);
}

// Load high score from localStorage on game initialization
highScore = ScoreManager.getHighScore();

// Initialize stars
initStars();

// Start the game loop
gameLoop();
