// Star Office UI - 游戏主逻辑
// 依赖: layout.js（必须在这个之前加载）

// 检测浏览器是否支持 WebP
let supportsWebP = false;

// 方法 1: 使用 canvas 检测
function checkWebPSupport() {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    if (canvas.getContext && canvas.getContext('2d')) {
      resolve(canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0);
    } else {
      resolve(false);
    }
  });
}

// 方法 2: 使用 image 检测（备用）
function checkWebPSupportFallback() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = 'data:image/webp;base64,UklGRkoAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAwAAAABBxAR/Q9ERP8DAABWUDggGAAAADABAJ0BKgEAAQADADQlpAADcAD++/1QAA==';
  });
}

// 获取文件扩展名（根据 WebP 支持情况 + 布局配置的 forcePng）
function getExt(pngFile) {
  // star-working-spritesheet.png 太宽了，WebP 不支持，始终用 PNG
  if (pngFile === 'star-working-spritesheet.png') {
    return '.png';
  }
  // 如果布局配置里强制用 PNG，就用 .png
  if (LAYOUT.forcePng && LAYOUT.forcePng[pngFile.replace(/\.(png|webp)$/, '')]) {
    return '.png';
  }
  return supportsWebP ? '.webp' : '.png';
}

const config = {
  type: Phaser.AUTO,
  width: LAYOUT.game.width,
  height: LAYOUT.game.height,
  parent: 'game-container',
  pixelArt: true,
  physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
  scene: { preload: preload, create: create, update: update }
};

let totalAssets = 0;
let loadedAssets = 0;
let loadingProgressBar, loadingProgressContainer, loadingOverlay, loadingText;

// Memo 相关函数
async function loadMemo() {
  const memoDate = document.getElementById('memo-date');
  const memoContent = document.getElementById('memo-content');

  try {
    const response = await fetch('/yesterday-memo?t=' + Date.now(), { cache: 'no-store' });
    const data = await response.json();

    if (data.success && data.memo) {
      memoDate.textContent = data.date || '';
      memoContent.innerHTML = data.memo.replace(/\n/g, '<br>');
    } else {
      memoContent.innerHTML = '<div id="memo-placeholder">暂无昨日日记</div>';
    }
  } catch (e) {
    console.error('加载 memo 失败:', e);
    memoContent.innerHTML = '<div id="memo-placeholder">加载失败</div>';
  }
}

// 更新加载进度
function updateLoadingProgress() {
  loadedAssets++;
  const percent = Math.min(100, Math.round((loadedAssets / totalAssets) * 100));
  if (loadingProgressBar) {
    loadingProgressBar.style.width = percent + '%';
  }
  if (loadingText) {
    loadingText.textContent = `正在加载 Star 的像素办公室... ${percent}%`;
  }
}

// 隐藏加载界面
function hideLoadingOverlay() {
  setTimeout(() => {
    if (loadingOverlay) {
      loadingOverlay.style.transition = 'opacity 0.5s ease';
      loadingOverlay.style.opacity = '0';
      setTimeout(() => {
        loadingOverlay.style.display = 'none';
      }, 500);
    }
  }, 300);
}

const STATES = {
  idle: { name: '待命', area: 'breakroom' },
  writing: { name: '整理文档', area: 'writing' },
  researching: { name: '搜索信息', area: 'researching' },
  executing: { name: '执行任务', area: 'writing' },
  syncing: { name: '同步备份', area: 'writing' },
  error: { name: '出错了', area: 'error' }
};

const BUBBLE_TEXTS = {
  idle: [
    '待命中：耳朵竖起来了',
    '我在这儿，随时可以开工',
    '先把桌面收拾干净再说',
    '呼——给大脑放个风',
    '今天也要优雅地高效',
    '等待，是为了更准确的一击',
    '咖啡还热，灵感也还在',
    '我在后台给你加 Buff',
    '状态：静心 / 充电',
    '小猫说：慢一点也没关系'
  ],
  writing: [
    '进入专注模式：勿扰',
    '先把关键路径跑通',
    '我来把复杂变简单',
    '把 bug 关进笼子里',
    '写到一半，先保存',
    '把每一步都做成可回滚',
    '今天的进度，明天的底气',
    '先收敛，再发散',
    '让系统变得更可解释',
    '稳住，我们能赢'
  ],
  researching: [
    '我在挖证据链',
    '让我把信息熬成结论',
    '找到了：关键在这里',
    '先把变量控制住',
    '我在查：它为什么会这样',
    '把直觉写成验证',
    '先定位，再优化',
    '别急，先画因果图'
  ],
  executing: [
    '执行中：不要眨眼',
    '把任务切成小块逐个击破',
    '开始跑 pipeline',
    '一键推进：走你',
    '让结果自己说话',
    '先做最小可行，再做最美版本'
  ],
  syncing: [
    '同步中：把今天锁进云里',
    '备份不是仪式，是安全感',
    '写入中…别断电',
    '把变更交给时间戳',
    '云端对齐：咔哒',
    '同步完成前先别乱动',
    '把未来的自己从灾难里救出来',
    '多一份备份，少一份后悔'
  ],
  error: [
    '警报响了：先别慌',
    '我闻到 bug 的味道了',
    '先复现，再谈修复',
    '把日志给我，我会说人话',
    '错误不是敌人，是线索',
    '把影响面圈起来',
    '先止血，再手术',
    '我在：马上定位根因',
    '别怕，这种我见多了',
    '报警中：让问题自己现形'
  ],
  cat: [
    '喵~',
    '咕噜咕噜…',
    '尾巴摇一摇',
    '晒太阳最开心',
    '有人来看我啦',
    '我是这个办公室的吉祥物',
    '伸个懒腰',
    '今天的罐罐准备好了吗',
    '呼噜呼噜',
    '这个位置视野最好'
  ]
};

let game, star, sofa, serverroom, areas = {}, currentState = 'idle', pendingDesiredState = null, statusText, lastFetch = 0, lastBlink = 0, lastBubble = 0, targetX = 660, targetY = 170, bubble = null, typewriterText = '', typewriterTarget = '', typewriterIndex = 0, lastTypewriter = 0, syncAnimSprite = null, catBubble = null;
let isMoving = false;
let waypoints = [];
let lastWanderAt = 0;
let coordsOverlay, coordsDisplay, coordsToggle;
let showCoords = false;
const FETCH_INTERVAL = 2000;
const BLINK_INTERVAL = 2500;
const BUBBLE_INTERVAL = 8000;
const CAT_BUBBLE_INTERVAL = 18000;
let lastCatBubble = 0;
const TYPEWRITER_DELAY = 50;
let agents = {}; // agentId -> sprite/container
let agentMovement = {}; // agentId -> { targetX, targetY, startX, startY, progress, spriteIndex }
let lastAgentsFetch = 0;
const AGENTS_FETCH_INTERVAL = 2500;
const AGENT_MOVE_DURATION = 800; // 毫秒，agent 移动时间
let agentHistory = {}; // agentId -> [{ timestamp, state, area }, ...]
let agentTooltip = null; // 当前显示的 agent tooltip
let featureFlags = { badges: true, timeline: true, stats: true, notifications: true }; // 功能开关

// agent 颜色配置
const AGENT_COLORS = {
  star: 0xffd700,
  npc1: 0x00aaff,
  agent_nika: 0xff69b4,
  default: 0x94a3b8
};

// agent 名字颜色
const NAME_TAG_COLORS = {
  approved: 0x22c55e,
  pending: 0xf59e0b,
  rejected: 0xef4444,
  offline: 0x64748b,
  default: 0x1f2937
};

// agent 类型颜色配置
const AGENT_TYPE_COLORS = {
  codex: { tint: 0x22c55e, nameColor: 0x16a34a, label: 'Codex' },      // 绿色
  claude: { tint: 0xf59e0b, nameColor: 0xd97706, label: 'Claude' },    // 橙色
  default: { tint: 0x94a3b8, nameColor: 0x64748b, label: 'Unknown' }   // 灰色
};

// agent 类型到精灵映射
const AGENT_TYPE_SPRITE_MAP = {
  codex: 1,    // Codex 使用精灵 1
  claude: 2,   // Claude 使用精灵 2
  default: 3   // 未知类型使用精灵 3
};

// breakroom / writing / error 区域的 agent 分布位置（多 agent 时错开）
// 每个区域有多个位置，可以支持更多 agent 同时显示而不重叠
const AREA_POSITIONS = {
  breakroom: [
    { x: 620, y: 180 },
    { x: 560, y: 220 },
    { x: 680, y: 210 },
    { x: 600, y: 250 },
    { x: 700, y: 240 },
    { x: 540, y: 160 }
  ],
  writing: [
    { x: 760, y: 320 },
    { x: 830, y: 280 },
    { x: 690, y: 350 },
    { x: 800, y: 350 },
    { x: 720, y: 290 },
    { x: 650, y: 320 }
  ],
  error: [
    { x: 180, y: 260 },
    { x: 120, y: 220 },
    { x: 240, y: 230 },
    { x: 160, y: 200 },
    { x: 220, y: 280 },
    { x: 100, y: 260 }
  ],
  researching: [
    { x: 320, y: 320 },
    { x: 280, y: 280 },
    { x: 360, y: 290 },
    { x: 300, y: 360 },
    { x: 380, y: 350 },
    { x: 260, y: 350 }
  ]
};

let areaPositionCounters = { breakroom: 0, writing: 0, error: 0, researching: 0 };


// 状态控制栏函数（用于测试）
function setState(state, detail) {
  fetch('/set_state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, detail })
  }).then(() => fetchStatus());
}

// 初始化：先检测 WebP 支持，再启动游戏
async function initGame() {
  try {
    supportsWebP = await checkWebPSupport();
  } catch (e) {
    try {
      supportsWebP = await checkWebPSupportFallback();
    } catch (e2) {
      supportsWebP = false;
    }
  }

  console.log('WebP 支持:', supportsWebP);
  new Phaser.Game(config);
}

function preload() {
  loadingOverlay = document.getElementById('loading-overlay');
  loadingProgressBar = document.getElementById('loading-progress-bar');
  loadingText = document.getElementById('loading-text');
  loadingProgressContainer = document.getElementById('loading-progress-container');

  // 从 LAYOUT 读取总资源数量（避免 magic number）
  totalAssets = LAYOUT.totalAssets || 15;
  loadedAssets = 0;

  this.load.on('filecomplete', () => {
    updateLoadingProgress();
  });

  this.load.on('complete', () => {
    hideLoadingOverlay();
  });

  this.load.image('office_bg', '/static/office_bg_small' + (supportsWebP ? '.webp' : '.png') + '?v={{VERSION_TIMESTAMP}}');
  this.load.spritesheet('star_idle', '/static/star-idle-spritesheet' + getExt('star-idle-spritesheet.png'), { frameWidth: 128, frameHeight: 128 });
  this.load.spritesheet('star_researching', '/static/star-researching-spritesheet' + getExt('star-researching-spritesheet.png'), { frameWidth: 128, frameHeight: 105 });

  this.load.image('sofa_idle', '/static/sofa-idle' + getExt('sofa-idle.png'));
  this.load.spritesheet('sofa_busy', '/static/sofa-busy-spritesheet' + getExt('sofa-busy-spritesheet.png'), { frameWidth: 256, frameHeight: 256 });

  this.load.spritesheet('plants', '/static/plants-spritesheet' + getExt('plants-spritesheet.png'), { frameWidth: 160, frameHeight: 160 });
  this.load.spritesheet('posters', '/static/posters-spritesheet' + getExt('posters-spritesheet.png'), { frameWidth: 160, frameHeight: 160 });
  this.load.spritesheet('coffee_machine', '/static/coffee-machine-spritesheet' + getExt('coffee-machine-spritesheet.png'), { frameWidth: 230, frameHeight: 230 });
  this.load.spritesheet('serverroom', '/static/serverroom-spritesheet' + getExt('serverroom-spritesheet.png'), { frameWidth: 180, frameHeight: 251 });

  this.load.spritesheet('error_bug', '/static/error-bug-spritesheet-grid' + (supportsWebP ? '.webp' : '.png'), { frameWidth: 180, frameHeight: 180 });
  this.load.spritesheet('cats', '/static/cats-spritesheet' + (supportsWebP ? '.webp' : '.png'), { frameWidth: 160, frameHeight: 160 });
  this.load.image('desk', '/static/desk' + getExt('desk.png'));
  this.load.spritesheet('star_working', '/static/star-working-spritesheet-grid' + (supportsWebP ? '.webp' : '.png'), { frameWidth: 230, frameHeight: 144 });
  this.load.spritesheet('sync_anim', '/static/sync-animation-spritesheet-grid' + (supportsWebP ? '.webp' : '.png'), { frameWidth: 256, frameHeight: 256 });
  this.load.image('memo_bg', '/static/memo-bg' + (supportsWebP ? '.webp' : '.png'));

  // 新办公桌：强制 PNG（透明）
  this.load.image('desk_v2', '/static/desk-v2.png');
  this.load.spritesheet('flowers', '/static/flowers-spritesheet' + (supportsWebP ? '.webp' : '.png'), { frameWidth: 65, frameHeight: 65 });

  // 加载 guest 精灵（动画 + 静态）
  for (let i = 1; i <= 6; i++) {
    this.load.spritesheet(`guest_anim_${i}`, `/static/guest_anim_${i}.webp`, { frameWidth: 128, frameHeight: 128 });
    this.load.image(`guest_role_${i}`, `/static/guest_role_${i}.png`);
  }
}

function create() {
  game = this;
  this.add.image(640, 360, 'office_bg');

  // === 沙发（来自 LAYOUT）===
  sofa = this.add.sprite(
    LAYOUT.furniture.sofa.x,
    LAYOUT.furniture.sofa.y,
    'sofa_busy'
  ).setOrigin(LAYOUT.furniture.sofa.origin.x, LAYOUT.furniture.sofa.origin.y);
  sofa.setDepth(LAYOUT.furniture.sofa.depth);

  this.anims.create({
    key: 'sofa_busy',
    frames: this.anims.generateFrameNumbers('sofa_busy', { start: 0, end: 47 }),
    frameRate: 12,
    repeat: -1
  });

  areas = LAYOUT.areas;

  this.anims.create({
    key: 'star_idle',
    frames: this.anims.generateFrameNumbers('star_idle', { start: 0, end: 29 }),
    frameRate: 12,
    repeat: -1
  });
  this.anims.create({
    key: 'star_researching',
    frames: this.anims.generateFrameNumbers('star_researching', { start: 0, end: 95 }),
    frameRate: 12,
    repeat: -1
  });

  star = game.physics.add.sprite(areas.breakroom.x, areas.breakroom.y, 'star_idle');
  star.setOrigin(0.5);
  star.setScale(1.4);
  star.setAlpha(0.95);
  star.setDepth(20);
  star.setVisible(false);
  star.anims.stop();

  if (game.textures.exists('sofa_busy')) {
    sofa.setTexture('sofa_busy');
    sofa.anims.play('sofa_busy', true);
  }

  // === 牌匾（来自 LAYOUT）===
  const plaqueX = LAYOUT.plaque.x;
  const plaqueY = LAYOUT.plaque.y;
  const plaqueBg = game.add.rectangle(plaqueX, plaqueY, LAYOUT.plaque.width, LAYOUT.plaque.height, 0x5d4037);
  plaqueBg.setStrokeStyle(3, 0x3e2723);
  const plaqueText = game.add.text(plaqueX, plaqueY, '海辛小龙虾的办公室', {
    fontFamily: 'ArkPixel, monospace',
    fontSize: '18px',
    fill: '#ffd700',
    fontWeight: 'bold',
    stroke: '#000',
    strokeThickness: 2
  }).setOrigin(0.5);
  game.add.text(plaqueX - 190, plaqueY, '⭐', { fontFamily: 'ArkPixel, monospace', fontSize: '20px' }).setOrigin(0.5);
  game.add.text(plaqueX + 190, plaqueY, '⭐', { fontFamily: 'ArkPixel, monospace', fontSize: '20px' }).setOrigin(0.5);

  // === 植物们（来自 LAYOUT）===
  const plantFrameCount = 16;
  for (let i = 0; i < LAYOUT.furniture.plants.length; i++) {
    const p = LAYOUT.furniture.plants[i];
    const randomPlantFrame = Math.floor(Math.random() * plantFrameCount);
    const plant = game.add.sprite(p.x, p.y, 'plants', randomPlantFrame).setOrigin(0.5);
    plant.setDepth(p.depth);
    plant.setInteractive({ useHandCursor: true });
    window[`plantSprite${i === 0 ? '' : i + 1}`] = plant;
    plant.on('pointerdown', (() => {
      const next = Math.floor(Math.random() * plantFrameCount);
      plant.setFrame(next);
    }));
  }

  // === 海报（来自 LAYOUT）===
  const postersFrameCount = 32;
  const randomPosterFrame = Math.floor(Math.random() * postersFrameCount);
  const poster = game.add.sprite(LAYOUT.furniture.poster.x, LAYOUT.furniture.poster.y, 'posters', randomPosterFrame).setOrigin(0.5);
  poster.setDepth(LAYOUT.furniture.poster.depth);
  poster.setInteractive({ useHandCursor: true });
  window.posterSprite = poster;
  window.posterFrameCount = postersFrameCount;
  poster.on('pointerdown', () => {
    const next = Math.floor(Math.random() * window.posterFrameCount);
    window.posterSprite.setFrame(next);
  });

  // === 小猫（来自 LAYOUT）===
  const catsFrameCount = 16;
  const randomCatFrame = Math.floor(Math.random() * catsFrameCount);
  const cat = game.add.sprite(LAYOUT.furniture.cat.x, LAYOUT.furniture.cat.y, 'cats', randomCatFrame).setOrigin(LAYOUT.furniture.cat.origin.x, LAYOUT.furniture.cat.origin.y);
  cat.setDepth(LAYOUT.furniture.cat.depth);
  cat.setInteractive({ useHandCursor: true });
  window.catSprite = cat;
  window.catsFrameCount = catsFrameCount;
  cat.on('pointerdown', () => {
    const next = Math.floor(Math.random() * window.catsFrameCount);
    window.catSprite.setFrame(next);
  });

  // === 咖啡机（来自 LAYOUT）===
  this.anims.create({
    key: 'coffee_machine',
    frames: this.anims.generateFrameNumbers('coffee_machine', { start: 0, end: 95 }),
    frameRate: 12.5,
    repeat: -1
  });
  const coffeeMachine = this.add.sprite(
    LAYOUT.furniture.coffeeMachine.x,
    LAYOUT.furniture.coffeeMachine.y,
    'coffee_machine'
  ).setOrigin(LAYOUT.furniture.coffeeMachine.origin.x, LAYOUT.furniture.coffeeMachine.origin.y);
  coffeeMachine.setDepth(LAYOUT.furniture.coffeeMachine.depth);
  coffeeMachine.anims.play('coffee_machine', true);

  // === 服务器区（来自 LAYOUT）===
  this.anims.create({
    key: 'serverroom_on',
    frames: this.anims.generateFrameNumbers('serverroom', { start: 0, end: 39 }),
    frameRate: 6,
    repeat: -1
  });
  serverroom = this.add.sprite(
    LAYOUT.furniture.serverroom.x,
    LAYOUT.furniture.serverroom.y,
    'serverroom',
    0
  ).setOrigin(LAYOUT.furniture.serverroom.origin.x, LAYOUT.furniture.serverroom.origin.y);
  serverroom.setDepth(LAYOUT.furniture.serverroom.depth);
  serverroom.anims.stop();
  serverroom.setFrame(0);

  // === 新办公桌（来自 LAYOUT，强制透明 PNG）===
  const desk = this.add.image(
    LAYOUT.furniture.desk.x,
    LAYOUT.furniture.desk.y,
    'desk_v2'
  ).setOrigin(LAYOUT.furniture.desk.origin.x, LAYOUT.furniture.desk.origin.y);
  desk.setDepth(LAYOUT.furniture.desk.depth);

  // === 花盆（来自 LAYOUT）===
  const flowerFrameCount = 16;
  const randomFlowerFrame = Math.floor(Math.random() * flowerFrameCount);
  const flower = this.add.sprite(
    LAYOUT.furniture.flower.x,
    LAYOUT.furniture.flower.y,
    'flowers',
    randomFlowerFrame
  ).setOrigin(LAYOUT.furniture.flower.origin.x, LAYOUT.furniture.flower.origin.y);
  flower.setScale(LAYOUT.furniture.flower.scale || 1);
  flower.setDepth(LAYOUT.furniture.flower.depth);
  flower.setInteractive({ useHandCursor: true });
  window.flowerSprite = flower;
  window.flowerFrameCount = flowerFrameCount;
  flower.on('pointerdown', () => {
    const next = Math.floor(Math.random() * window.flowerFrameCount);
    window.flowerSprite.setFrame(next);
  });

  // === Star 在桌前工作（来自 LAYOUT）===
  this.anims.create({
    key: 'star_working',
    frames: this.anims.generateFrameNumbers('star_working', { start: 0, end: 191 }),
    frameRate: 12,
    repeat: -1
  });
  this.anims.create({
    key: 'error_bug',
    frames: this.anims.generateFrameNumbers('error_bug', { start: 0, end: 95 }),
    frameRate: 12,
    repeat: -1
  });

  // 创建 guest 精灵动画
  for (let i = 1; i <= 6; i++) {
    this.anims.create({
      key: `guest_walk_${i}`,
      frames: this.anims.generateFrameNumbers(`guest_anim_${i}`, { start: 0, end: 7 }),
      frameRate: 10,
      repeat: -1
    });
  }

  // === 错误 bug（来自 LAYOUT）===
  const errorBug = this.add.sprite(
    LAYOUT.furniture.errorBug.x,
    LAYOUT.furniture.errorBug.y,
    'error_bug',
    0
  ).setOrigin(LAYOUT.furniture.errorBug.origin.x, LAYOUT.furniture.errorBug.origin.y);
  errorBug.setDepth(LAYOUT.furniture.errorBug.depth);
  errorBug.setVisible(false);
  errorBug.setScale(LAYOUT.furniture.errorBug.scale);
  errorBug.anims.play('error_bug', true);
  window.errorBug = errorBug;
  window.errorBugDir = 1;

  const starWorking = this.add.sprite(
    LAYOUT.furniture.starWorking.x,
    LAYOUT.furniture.starWorking.y,
    'star_working',
    0
  ).setOrigin(LAYOUT.furniture.starWorking.origin.x, LAYOUT.furniture.starWorking.origin.y);
  starWorking.setVisible(false);
  starWorking.setScale(LAYOUT.furniture.starWorking.scale);
  starWorking.setDepth(LAYOUT.furniture.starWorking.depth);
  window.starWorking = starWorking;

  // === 同步动画（来自 LAYOUT）===
  this.anims.create({
    key: 'sync_anim',
    frames: this.anims.generateFrameNumbers('sync_anim', { start: 1, end: 52 }),
    frameRate: 12,
    repeat: -1
  });
  syncAnimSprite = this.add.sprite(
    LAYOUT.furniture.syncAnim.x,
    LAYOUT.furniture.syncAnim.y,
    'sync_anim',
    0
  ).setOrigin(LAYOUT.furniture.syncAnim.origin.x, LAYOUT.furniture.syncAnim.origin.y);
  syncAnimSprite.setDepth(LAYOUT.furniture.syncAnim.depth);
  syncAnimSprite.anims.stop();
  syncAnimSprite.setFrame(0);

  window.starSprite = star;

  statusText = document.getElementById('status-text');
  coordsOverlay = document.getElementById('coords-overlay');
  coordsDisplay = document.getElementById('coords-display');
  coordsToggle = document.getElementById('coords-toggle');

  coordsToggle.addEventListener('click', () => {
    showCoords = !showCoords;
    coordsOverlay.style.display = showCoords ? 'block' : 'none';
    coordsToggle.textContent = showCoords ? '隐藏坐标' : '显示坐标';
    coordsToggle.style.background = showCoords ? '#e94560' : '#333';
  });

  game.input.on('pointermove', (pointer) => {
    if (!showCoords) return;
    const x = Math.max(0, Math.min(config.width - 1, Math.round(pointer.x)));
    const y = Math.max(0, Math.min(config.height - 1, Math.round(pointer.y)));
    coordsDisplay.textContent = `${x}, ${y}`;
    coordsOverlay.style.left = (pointer.x + 18) + 'px';
    coordsOverlay.style.top = (pointer.y + 18) + 'px';
  });

  loadMemo();
  fetchStatus();
  fetchAgents();
}

function update(time) {
  if (time - lastFetch > FETCH_INTERVAL) { fetchStatus(); lastFetch = time; }
  if (time - lastAgentsFetch > AGENTS_FETCH_INTERVAL) { fetchAgents(); lastAgentsFetch = time; }

  // 更新 agent 运动
  updateAgentMovement();

  const effectiveStateForServer = pendingDesiredState || currentState;
  if (serverroom) {
    if (effectiveStateForServer === 'idle') {
      if (serverroom.anims.isPlaying) {
        serverroom.anims.stop();
        serverroom.setFrame(0);
      }
    } else {
      if (!serverroom.anims.isPlaying || serverroom.anims.currentAnim?.key !== 'serverroom_on') {
        serverroom.anims.play('serverroom_on', true);
      }
    }
  }

  if (window.errorBug) {
    if (effectiveStateForServer === 'error') {
      window.errorBug.setVisible(true);
      if (!window.errorBug.anims.isPlaying || window.errorBug.anims.currentAnim?.key !== 'error_bug') {
        window.errorBug.anims.play('error_bug', true);
      }
      const leftX = LAYOUT.furniture.errorBug.pingPong.leftX;
      const rightX = LAYOUT.furniture.errorBug.pingPong.rightX;
      const speed = LAYOUT.furniture.errorBug.pingPong.speed;
      const dir = window.errorBugDir || 1;
      window.errorBug.x += speed * dir;
      window.errorBug.y = LAYOUT.furniture.errorBug.y;
      if (window.errorBug.x >= rightX) {
        window.errorBug.x = rightX;
        window.errorBugDir = -1;
      } else if (window.errorBug.x <= leftX) {
        window.errorBug.x = leftX;
        window.errorBugDir = 1;
      }
    } else {
      window.errorBug.setVisible(false);
      window.errorBug.anims.stop();
    }
  }

  if (syncAnimSprite) {
    if (effectiveStateForServer === 'syncing') {
      if (!syncAnimSprite.anims.isPlaying || syncAnimSprite.anims.currentAnim?.key !== 'sync_anim') {
        syncAnimSprite.anims.play('sync_anim', true);
      }
    } else {
      if (syncAnimSprite.anims.isPlaying) syncAnimSprite.anims.stop();
      syncAnimSprite.setFrame(0);
    }
  }

  if (time - lastBubble > BUBBLE_INTERVAL) {
    showBubble();
    lastBubble = time;
  }
  if (time - lastCatBubble > CAT_BUBBLE_INTERVAL) {
    showCatBubble();
    lastCatBubble = time;
  }

  if (typewriterIndex < typewriterTarget.length && time - lastTypewriter > TYPEWRITER_DELAY) {
    typewriterText += typewriterTarget[typewriterIndex];
    statusText.textContent = typewriterText;
    typewriterIndex++;
    lastTypewriter = time;
  }

  moveStar(time);
}

function normalizeState(s) {
  if (!s) return 'idle';
  if (s === 'working') return 'writing';
  if (s === 'run' || s === 'running') return 'executing';
  if (s === 'sync') return 'syncing';
  if (s === 'research') return 'researching';
  return s;
}

function fetchStatus() {
  fetch('/status')
    .then(response => response.json())
    .then(data => {
      const nextState = normalizeState(data.state);
      const stateInfo = STATES[nextState] || STATES.idle;
      const changed = (pendingDesiredState === null) && (nextState !== currentState);
      const nextLine = '[' + stateInfo.name + '] ' + (data.detail || '...');
      if (changed) {
        typewriterTarget = nextLine;
        typewriterText = '';
        typewriterIndex = 0;

        pendingDesiredState = null;
        currentState = nextState;

        if (nextState === 'idle') {
          if (game.textures.exists('sofa_busy')) {
            sofa.setTexture('sofa_busy');
            sofa.anims.play('sofa_busy', true);
          }
          star.setVisible(false);
          star.anims.stop();
          if (window.starWorking) {
            window.starWorking.setVisible(false);
            window.starWorking.anims.stop();
          }
        } else if (nextState === 'error') {
          sofa.anims.stop();
          sofa.setTexture('sofa_idle');
          star.setVisible(false);
          star.anims.stop();
          if (window.starWorking) {
            window.starWorking.setVisible(false);
            window.starWorking.anims.stop();
          }
        } else if (nextState === 'syncing') {
          sofa.anims.stop();
          sofa.setTexture('sofa_idle');
          star.setVisible(false);
          star.anims.stop();
          if (window.starWorking) {
            window.starWorking.setVisible(false);
            window.starWorking.anims.stop();
          }
        } else {
          sofa.anims.stop();
          sofa.setTexture('sofa_idle');
          star.setVisible(false);
          star.anims.stop();
          if (window.starWorking) {
            window.starWorking.setVisible(true);
            window.starWorking.anims.play('star_working', true);
          }
        }

        if (serverroom) {
          if (nextState === 'idle') {
            serverroom.anims.stop();
            serverroom.setFrame(0);
          } else {
            serverroom.anims.play('serverroom_on', true);
          }
        }

        if (syncAnimSprite) {
          if (nextState === 'syncing') {
            if (!syncAnimSprite.anims.isPlaying || syncAnimSprite.anims.currentAnim?.key !== 'sync_anim') {
              syncAnimSprite.anims.play('sync_anim', true);
            }
          } else {
            if (syncAnimSprite.anims.isPlaying) syncAnimSprite.anims.stop();
            syncAnimSprite.setFrame(0);
          }
        }
      } else {
        if (!typewriterTarget || typewriterTarget !== nextLine) {
          typewriterTarget = nextLine;
          typewriterText = '';
          typewriterIndex = 0;
        }
      }
    })
    .catch(error => {
      typewriterTarget = '连接失败，正在重试...';
      typewriterText = '';
      typewriterIndex = 0;
    });
}

function moveStar(time) {
  const effectiveState = pendingDesiredState || currentState;
  const stateInfo = STATES[effectiveState] || STATES.idle;
  const baseTarget = areas[stateInfo.area] || areas.breakroom;

  const dx = targetX - star.x;
  const dy = targetY - star.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const speed = 1.4;
  const wobble = Math.sin(time / 200) * 0.8;

  if (dist > 3) {
    star.x += (dx / dist) * speed;
    star.y += (dy / dist) * speed;
    star.setY(star.y + wobble);
    isMoving = true;
  } else {
    if (waypoints && waypoints.length > 0) {
      waypoints.shift();
      if (waypoints.length > 0) {
        targetX = waypoints[0].x;
        targetY = waypoints[0].y;
        isMoving = true;
      } else {
        if (pendingDesiredState !== null) {
          isMoving = false;
          currentState = pendingDesiredState;
          pendingDesiredState = null;

          if (currentState === 'idle') {
            star.setVisible(false);
            star.anims.stop();
            if (window.starWorking) {
              window.starWorking.setVisible(false);
              window.starWorking.anims.stop();
            }
          } else {
            star.setVisible(false);
            star.anims.stop();
            if (window.starWorking) {
              window.starWorking.setVisible(true);
              window.starWorking.anims.play('star_working', true);
            }
          }
        }
      }
    } else {
      if (pendingDesiredState !== null) {
        isMoving = false;
        currentState = pendingDesiredState;
        pendingDesiredState = null;

        if (currentState === 'idle') {
          star.setVisible(false);
          star.anims.stop();
          if (window.starWorking) {
            window.starWorking.setVisible(false);
            window.starWorking.anims.stop();
          }
          if (game.textures.exists('sofa_busy')) {
            sofa.setTexture('sofa_busy');
            sofa.anims.play('sofa_busy', true);
          }
        } else {
          star.setVisible(false);
          star.anims.stop();
          if (window.starWorking) {
            window.starWorking.setVisible(true);
            window.starWorking.anims.play('star_working', true);
          }
          sofa.anims.stop();
          sofa.setTexture('sofa_idle');
        }
      }
    }
  }
}

function showBubble() {
  if (bubble) { bubble.destroy(); bubble = null; }
  const texts = BUBBLE_TEXTS[currentState] || BUBBLE_TEXTS.idle;
  if (currentState === 'idle') return;

  let anchorX = star.x;
  let anchorY = star.y;
  if (currentState === 'syncing' && syncAnimSprite && syncAnimSprite.visible) {
    anchorX = syncAnimSprite.x;
    anchorY = syncAnimSprite.y;
  } else if (currentState === 'error' && window.errorBug && window.errorBug.visible) {
    anchorX = window.errorBug.x;
    anchorY = window.errorBug.y;
  } else if (!star.visible && window.starWorking && window.starWorking.visible) {
    anchorX = window.starWorking.x;
    anchorY = window.starWorking.y;
  }

  const text = texts[Math.floor(Math.random() * texts.length)];
  const bubbleY = anchorY - 70;
  const bg = game.add.rectangle(anchorX, bubbleY, text.length * 10 + 20, 28, 0xffffff, 0.95);
  bg.setStrokeStyle(2, 0x000000);
  const txt = game.add.text(anchorX, bubbleY, text, { fontFamily: 'ArkPixel, monospace', fontSize: '12px', fill: '#000', align: 'center' }).setOrigin(0.5);
  bubble = game.add.container(0, 0, [bg, txt]);
  bubble.setDepth(1200);
  setTimeout(() => { if (bubble) { bubble.destroy(); bubble = null; } }, 3000);
}

function showCatBubble() {
  if (!window.catSprite) return;
  if (window.catBubble) { window.catBubble.destroy(); window.catBubble = null; }
  const texts = BUBBLE_TEXTS.cat || ['喵~', '咕噜咕噜…'];
  const text = texts[Math.floor(Math.random() * texts.length)];
  const anchorX = window.catSprite.x;
  const anchorY = window.catSprite.y - 60;
  const bg = game.add.rectangle(anchorX, anchorY, text.length * 10 + 20, 24, 0xfffbeb, 0.95);
  bg.setStrokeStyle(2, 0xd4a574);
  const txt = game.add.text(anchorX, anchorY, text, { fontFamily: 'ArkPixel, monospace', fontSize: '11px', fill: '#8b6914', align: 'center' }).setOrigin(0.5);
  window.catBubble = game.add.container(0, 0, [bg, txt]);
  window.catBubble.setDepth(2100);
  setTimeout(() => { if (window.catBubble) { window.catBubble.destroy(); window.catBubble = null; } }, 4000);
}

function fetchAgents() {
  fetch('/agents?t=' + Date.now(), { cache: 'no-store' })
    .then(response => response.json())
    .then(data => {
      if (!Array.isArray(data)) return;

      // 更新 agent 状态和触发通知
      updateAgentStateAndNotifications(data);

      // 重置位置计数器
      areaPositionCounters = { breakroom: 0, writing: 0, error: 0 };
      // 处理每个 agent
      for (let agent of data) {
        renderAgent(agent);
      }
      // 移除不再存在的 agent
      const currentIds = new Set(data.map(a => a.agentId));
      for (let id in agents) {
        if (!currentIds.has(id)) {
          if (agents[id]) {
            agents[id].destroy();
            delete agents[id];
          }
        }
      }

      // 更新时间线和统计面板
      updateTimelinePanel(data);
      updateStatsOverlay(data);
    })
    .catch(error => {
      console.error('拉取 agents 失败:', error);
    });
}

function getAreaPosition(area) {
  const positions = AREA_POSITIONS[area] || AREA_POSITIONS.breakroom;
  const idx = areaPositionCounters[area] || 0;
  areaPositionCounters[area] = (idx + 1) % positions.length;
  return positions[idx];
}

function updateAgentMovement() {
  const now = Date.now();

  for (let agentId in agentMovement) {
    const movement = agentMovement[agentId];
    if (!agents[agentId]) continue;

    const container = agents[agentId];

    // 计算进度
    if (movement.startTime !== undefined) {
      const elapsed = now - movement.startTime;
      movement.progress = Math.min(1, elapsed / AGENT_MOVE_DURATION);
    }

    if (movement.progress < 1) {
      // 使用缓动函数平滑移动
      const easeProgress = movement.progress < 0.5
        ? 2 * movement.progress * movement.progress
        : -1 + (4 - 2 * movement.progress) * movement.progress;

      const x = movement.startX + (movement.targetX - movement.startX) * easeProgress;
      const y = movement.startY + (movement.targetY - movement.startY) * easeProgress;

      container.setPosition(x, y);

      // 显示走路动画
      const sprite = container.getAt(0);
      if (sprite && sprite.name === 'agentSprite') {
        const spriteIndex = movement.spriteIndex || 1;
        const animKey = `guest_walk_${spriteIndex}`;
        if (!sprite.anims.isPlaying) {
          sprite.anims.play(animKey, true);
        }
      }
    } else {
      // 移动完成，回到静态图片
      container.setPosition(movement.targetX, movement.targetY);
      const sprite = container.getAt(0);
      if (sprite && sprite.name === 'agentSprite') {
        if (sprite.anims.isPlaying) {
          sprite.anims.stop();
        }
        const spriteIndex = movement.spriteIndex || 1;
        const roleKey = `guest_role_${spriteIndex}`;
        if (sprite.texture.key !== roleKey) {
          sprite.setTexture(roleKey);
        }
      }
    }
  }
}

function getAgentSpriteIndex(agentId, agentType) {
  // 基于 agent 类型返回精灵索引（1-6）
  const typeKey = (agentType || '').toLowerCase();
  const spriteIndex = AGENT_TYPE_SPRITE_MAP[typeKey] || AGENT_TYPE_SPRITE_MAP.default;
  return spriteIndex;
}

function renderAgent(agent) {
  const agentId = agent.agentId;
  const name = agent.name || 'Agent';
  const agentType = (agent.agentType || 'unknown').toLowerCase();
  const area = agent.area || 'breakroom';
  const authStatus = agent.authStatus || 'pending';
  const isMain = !!agent.isMain;

  // 获取这个 agent 在区域里的位置
  const pos = getAreaPosition(area);
  const baseX = pos.x;
  const baseY = pos.y;

  // 获取 agent 类型颜色配置
  const typeConfig = AGENT_TYPE_COLORS[agentType] || AGENT_TYPE_COLORS.default;
  const nameColor = typeConfig.nameColor;
  const spriteTint = typeConfig.tint;
  const spriteIndex = getAgentSpriteIndex(agentId, agentType);

  // 透明度（离线/待批准/拒绝时变半透明）
  let alpha = 1;
  if (authStatus === 'pending') alpha = 0.7;
  if (authStatus === 'rejected') alpha = 0.4;
  if (authStatus === 'offline') alpha = 0.5;

  if (!agents[agentId]) {
    // 新建 agent
    const container = game.add.container(baseX, baseY);
    container.setDepth(1200 + (isMain ? 100 : 0));

    // 使用像素精灵（静态角色图片作为默认）
    const spriteKey = `guest_role_${spriteIndex}`;
    const sprite = game.add.image(0, 0, spriteKey)
      .setOrigin(0.5)
      .setTint(spriteTint)
      .setAlpha(alpha)
      .setScale(1.0);
    sprite.name = 'agentSprite';

    // 保存精灵信息用于后续更新
    container._agentData = {
      agentType,
      spriteIndex,
      currentSprite: spriteKey,
      currentArea: area
    };

    // 名字标签（漂浮）
    const nameTag = game.add.text(0, -50, name, {
      fontFamily: 'ArkPixel, monospace',
      fontSize: '12px',
      fill: '#' + nameColor.toString(16).padStart(6, '0'),
      stroke: '#000',
      strokeThickness: 2,
      backgroundColor: 'rgba(255,255,255,0.9)',
      padding: { x: 4, y: 2 }
    }).setOrigin(0.5);
    nameTag.name = 'nameTag';

    // 状态小点（代表 authStatus）
    let dotColor = 0x64748b;
    if (authStatus === 'approved') dotColor = 0x22c55e;
    if (authStatus === 'pending') dotColor = 0xf59e0b;
    if (authStatus === 'rejected') dotColor = 0xef4444;
    if (authStatus === 'offline') dotColor = 0x94a3b8;
    const statusDot = game.add.circle(16, -30, 4, dotColor, alpha);
    statusDot.setStrokeStyle(1, 0x000000, alpha);
    statusDot.name = 'statusDot';

    container.add([sprite, statusDot, nameTag]);

    // 添加 PR/CI 徽章
    if (featureFlags.badges) {
      addAgentBadges(container, agent);
    }

    // 使容器可交互
    container.setInteractive(new Phaser.Geom.Rectangle(-64, -64, 128, 128), Phaser.Geom.Rectangle.Contains);
    container.on('pointerdown', () => {
      showAgentTooltip(agent, container.x, container.y);
    });

    agents[agentId] = container;

    // 初始化运动状态
    agentMovement[agentId] = { targetX: baseX, targetY: baseY, progress: 1, spriteIndex };

    // 初始化历史记录
    if (!agentHistory[agentId]) {
      agentHistory[agentId] = [];
    }
    agentHistory[agentId].push({ timestamp: Date.now(), state: agent.state || 'idle', area: agent.area || 'breakroom' });
  } else {
    // 更新 agent
    const container = agents[agentId];
    const oldData = container._agentData || {};
    const areaChanged = oldData.currentArea !== area;
    const spriteChanged = oldData.spriteIndex !== spriteIndex;

    // 如果位置变化，触发移动动画
    if (areaChanged) {
      const currentX = container.x;
      const currentY = container.y;
      agentMovement[agentId] = {
        targetX: baseX,
        targetY: baseY,
        startX: currentX,
        startY: currentY,
        progress: 0,
        spriteIndex,
        startTime: Date.now()
      };
      oldData.currentArea = area;
    } else {
      // 更新目标位置（以防 AREA_POSITIONS 变化）
      if (!agentMovement[agentId]) {
        agentMovement[agentId] = { targetX: baseX, targetY: baseY, progress: 1, spriteIndex };
      }
    }

    container.setAlpha(alpha);
    container.setDepth(1200 + (isMain ? 100 : 0));

    // 更新精灵（如果类型变化）
    if (spriteChanged) {
      const sprite = container.getAt(0);
      if (sprite && sprite.name === 'agentSprite') {
        const newSpriteKey = `guest_role_${spriteIndex}`;
        sprite.setTexture(newSpriteKey).setTint(spriteTint);
        container._agentData.spriteIndex = spriteIndex;
        container._agentData.currentSprite = newSpriteKey;
        if (agentMovement[agentId]) {
          agentMovement[agentId].spriteIndex = spriteIndex;
        }
      }
    } else {
      // 更新 tint（如果颜色需要调整）
      const sprite = container.getAt(0);
      if (sprite && sprite.name === 'agentSprite') {
        sprite.setTint(spriteTint);
      }
    }

    // 更新名字和颜色
    const nameTag = container.getAt(2);
    if (nameTag && nameTag.name === 'nameTag') {
      nameTag.setText(name);
      nameTag.setFill('#' + nameColor.toString(16).padStart(6, '0'));
    }

    // 更新状态点颜色
    const statusDot = container.getAt(1);
    if (statusDot && statusDot.name === 'statusDot') {
      let dotColor = 0x64748b;
      if (authStatus === 'approved') dotColor = 0x22c55e;
      if (authStatus === 'pending') dotColor = 0xf59e0b;
      if (authStatus === 'rejected') dotColor = 0xef4444;
      if (authStatus === 'offline') dotColor = 0x94a3b8;
      statusDot.setFillStyle(dotColor, alpha);
    }
  }
}

// PR/CI 徽章配置
const BADGE_EMOJIS = {
  pr_created: '🔀',
  ci_passing: '✅',
  ci_failed: '❌',
  waiting_review: '⏳',
  approved: '✓',
  merged: '✨'
};

// 添加 PR/CI 徽章
function addAgentBadges(container, agent) {
  const badges = [];
  if (agent.prStatus) badges.push(agent.prStatus);
  if (agent.ciStatus) badges.push(agent.ciStatus);

  // 只显示最多2个徽章
  for (let i = 0; i < Math.min(badges.length, 2); i++) {
    const status = badges[i];
    const emoji = BADGE_EMOJIS[status] || '•';
    const badgeText = game.add.text(20 + i * 20, -40, emoji, {
      fontFamily: 'Arial',
      fontSize: '10px'
    }).setOrigin(0.5);
    badgeText.name = 'badge_' + status;
    container.add(badgeText);
  }
}

// 显示 agent 详情 tooltip
function showAgentTooltip(agent, x, y) {
  // 移除旧 tooltip
  if (agentTooltip) {
    agentTooltip.destroy();
    agentTooltip = null;
  }

  const html = `
    <div class="agent-tooltip" style="position: fixed; left: ${x + 20}px; top: ${y - 40}px; z-index: 10000;
          background: rgba(0, 0, 0, 0.9); color: #fff; padding: 8px 12px; border-radius: 4px;
          font-family: monospace; font-size: 11px; white-space: nowrap; border: 1px solid #fff;">
      <div><strong>${agent.name}</strong></div>
      <div>Type: ${agent.agentType || 'unknown'}</div>
      <div>Status: ${agent.authStatus || 'pending'}</div>
      <div>Area: ${agent.area || 'breakroom'}</div>
      ${agent.prUrl ? `<div><a href="${agent.prUrl}" target="_blank" style="color:#0ff;">PR</a></div>` : ''}
      ${agent.issueNumber ? `<div>Issue: #${agent.issueNumber}</div>` : ''}
    </div>
  `;

  // 创建 DOM 元素
  const div = document.createElement('div');
  div.innerHTML = html;
  document.body.appendChild(div.firstChild);
  agentTooltip = div.firstChild;

  // 3秒后自动关闭
  setTimeout(() => {
    if (agentTooltip) {
      agentTooltip.remove();
      agentTooltip = null;
    }
  }, 3000);
}

// 显示通知效果（PR/CI 事件）
function showNotificationEffect(agent, type) {
  if (!featureFlags.notifications) return;

  const container = agents[agent.agentId];
  if (!container) return;

  const emojis = {
    pr_created: '🎉',
    ci_failed: '⚠️',
    merged: '✨'
  };

  const emoji = emojis[type] || '●';

  // 创建漂浮的 emoji
  const floatingText = game.add.text(container.x, container.y - 60, emoji, {
    fontFamily: 'Arial',
    fontSize: '24px'
  }).setOrigin(0.5);

  game.tweens.add({
    targets: floatingText,
    y: container.y - 120,
    alpha: 0,
    duration: 1500,
    ease: 'Quad.easeOut',
    onComplete: () => floatingText.destroy()
  });
}

// 占位符函数，在 index.html 中实现
function updateTimelinePanel(agents) {
  if (window.updateTimelinePanel) {
    window.updateTimelinePanel(agents);
  }
}

function updateStatsOverlay(agents) {
  if (window.updateStatsOverlay) {
    window.updateStatsOverlay(agents);
  }
}

// 跟踪 agent 状态变化
let agentPreviousState = {}; // agentId -> { state, prStatus, ciStatus }

// 更新 agent 历史记录并触发通知
function updateAgentStateAndNotifications(agents) {
  for (const agent of agents) {
    const agentId = agent.agentId;
    const prevState = agentPreviousState[agentId];

    // 跟踪状态变化
    if (!prevState) {
      agentPreviousState[agentId] = {
        state: agent.state,
        prStatus: agent.prStatus,
        ciStatus: agent.ciStatus,
        timestamp: Date.now()
      };
      continue;
    }

    // 检测 PR 创建
    if (agent.prStatus === 'pr_created' && prevState.prStatus !== 'pr_created') {
      showNotificationEffect(agent, 'pr_created');
    }

    // 检测 CI 失败
    if (agent.ciStatus === 'ci_failed' && prevState.ciStatus !== 'ci_failed') {
      showNotificationEffect(agent, 'ci_failed');
    }

    // 检测合并
    if (agent.prStatus === 'merged' && prevState.prStatus !== 'merged') {
      showNotificationEffect(agent, 'merged');
    }

    // 更新历史记录
    if (agent.state !== prevState.state) {
      if (!agentHistory[agentId]) {
        agentHistory[agentId] = [];
      }
      agentHistory[agentId].push({
        timestamp: Date.now(),
        state: agent.state || 'idle',
        area: agent.area || 'breakroom'
      });
    }

    // 保存当前状态
    agentPreviousState[agentId] = {
      state: agent.state,
      prStatus: agent.prStatus,
      ciStatus: agent.ciStatus,
      timestamp: Date.now()
    };
  }
}

// 启动游戏
initGame();
