'use strict';

/* ============================================================
 * 状态（逻辑画布统一为 PREVIEW_SIZE，导出时整体缩放）
 * ============================================================ */
const state = {
  mode: 'text',          // 'image' | 'text'
  img: null,             // { el, fitScale, scale, offsetX, offsetY } offset 为逻辑单位
  text: {
    str: 'Hi~',
    font: "'Microsoft YaHei', '微软雅黑', sans-serif",
    size: 64,            // 逻辑字号（对应 480 画布）
    color: '#FF4D4F',
    stroke: true,
    strokeWidth: 6,      // 逻辑单位
  },
  effect: 'bounce',
  speed: 1,              // 0.5 ~ 2
  amount: 1,             // 0.5 ~ 1.5
  exportSize: 240,
  exportFps: 12,
  exportDuration: 2,
};

const PREVIEW_SIZE = 480; // 所有素材与动效的逻辑坐标系
const byId = (id) => document.getElementById(id);
const canvas = byId('previewCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

/* ============================================================
 * 动效定义：返回 { dx, dy, rot, sx, sy, alpha, pivot }
 * t 为秒；幅度按逻辑单位（PREVIEW_SIZE 基准）
 * ============================================================ */
const TAU = Math.PI * 2;
const EFFECTS = {
  bounce: {
    name: '弹跳', icon: '🏀',
    fx(t) {
      const u = (t * state.speed) % 1;
      const h = Math.abs(Math.sin(Math.PI * u));       // 0~1 高度包络
      const sq = 1 - 0.14 * (1 - h);                   // 着地压扁
      return {
        dx: 0,
        dy: -h * 0.2 * PREVIEW_SIZE * state.amount,
        rot: 0, sx: 1 / sq, sy: sq,
        alpha: 1, pivot: 'bottom',
      };
    },
  },
  swing: {
    name: '摇摆', icon: '🎐',
    fx(t) {
      const a = Math.sin(t * state.speed * TAU * 0.6) * 0.22 * state.amount;
      return { dx: 0, dy: 0, rot: a, sx: 1, sy: 1, alpha: 1, pivot: 'bottom' };
    },
  },
  shake: {
    name: '抖动', icon: '📳',
    fx(t) {
      const f = t * state.speed;
      return {
        dx: (Math.sin(f * TAU * 9) + Math.sin(f * TAU * 17) * 0.6) * 8 * state.amount,
        dy: Math.sin(f * TAU * 11) * 0.7 * 8 * state.amount,
        rot: Math.sin(f * TAU * 23) * 0.03 * state.amount,
        sx: 1, sy: 1, alpha: 1, pivot: 'center',
      };
    },
  },
  spin: {
    name: '旋转', icon: '🌀',
    fx(t) {
      return { dx: 0, dy: 0, rot: t * state.speed * TAU * 0.5, sx: 1, sy: 1, alpha: 1, pivot: 'center' };
    },
  },
  pulse: {
    name: '脉冲', icon: '💗',
    fx(t) {
      const s = 1 + Math.sin(t * state.speed * TAU * 0.8) * 0.15 * state.amount;
      return { dx: 0, dy: 0, rot: 0, sx: s, sy: s, alpha: 1, pivot: 'center' };
    },
  },
  flash: {
    name: '闪烁', icon: '⚡',
    fx(t) {
      const on = Math.sin(t * state.speed * TAU * 2) > 0;
      // GIF 仅支持 1bit 透明，暗帧直接全透明以保持预览与导出一致
      return { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, alpha: on ? 1 : 0, pivot: 'center' };
    },
  },
  float: {
    name: '浮动', icon: '🫧',
    fx(t) {
      const u = t * state.speed;
      return {
        dx: 0,
        dy: Math.sin(u * TAU * 0.6) * 0.13 * PREVIEW_SIZE * state.amount,
        rot: Math.sin(u * TAU * 0.4) * 0.06 * state.amount,
        sx: 1, sy: 1, alpha: 1, pivot: 'center',
      };
    },
  },
  nod: {
    name: '点头', icon: '👌',
    fx(t) {
      const a = Math.sin(t * state.speed * TAU * 1.4) * 0.09 * state.amount;
      return { dx: 0, dy: a * 0.3 * PREVIEW_SIZE * 0.05, rot: a, sx: 1, sy: 1, alpha: 1, pivot: 'top' };
    },
  },
};

/* ============================================================
 * 素材 + 动效统一渲染（预览与导出共用，保证一致）
 * time: 画布实际尺寸；time: 当前时刻（秒）
 * ============================================================ */
let imgCache = null; // {el, fitScale}

function drawMaterial(g, size, time) {
  const k = size / PREVIEW_SIZE; // 逻辑 -> 实际缩放
  const cx = size / 2, cy = size / 2;

  // 计算素材逻辑尺寸
  let matW = 0, matH = 0;
  if (state.mode === 'image' && imgCache) {
    const w = imgCache.el.naturalWidth, h = imgCache.el.naturalHeight;
    if (!imgCache.fitScale) {
      const maxSide = PREVIEW_SIZE * 0.7;
      imgCache.fitScale = Math.min(maxSide / w, maxSide / h);
    }
    matW = w * imgCache.fitScale * state.img.scale;
    matH = h * imgCache.fitScale * state.img.scale;
  } else if (state.mode === 'text' && state.text.str) {
    const ts = state.text;
    g.font = `bold ${ts.size}px ${ts.font}`;
    const m = g.measureText(ts.str);
    matW = Math.max(m.width, 1);
    matH = ts.size * 1.25;
  }
  if (matW <= 0 || matH <= 0) return;

  // 动效变换：整个绘制在逻辑坐标系中进行，最后统一 scale(k) 适配实际画布
  const fx = EFFECTS[state.effect].fx(time);
  const pivotY = fx.pivot === 'bottom' ? matH / 2 : fx.pivot === 'top' ? -matH / 2 : 0;
  const pivotX = 0;

  g.save();
  g.globalAlpha = fx.alpha;
  g.translate(cx, cy);       // 移到画布中心（实际像素）
  g.scale(k, k);             // 进入逻辑坐标系：1 逻辑单位 = k 实际像素
  g.translate(fx.dx, fx.dy); // 动效位移（逻辑单位）
  g.translate(pivotX, pivotY);
  g.rotate(fx.rot);          // 旋转围绕 pivot 点
  g.scale(fx.sx, fx.sy);
  g.translate(-pivotX, -pivotY);

  if (state.mode === 'image' && imgCache) {
    const ox = state.img.offsetX;
    const oy = state.img.offsetY;
    g.drawImage(imgCache.el, -matW / 2 + ox, -matH / 2 + oy, matW, matH);
  } else if (state.mode === 'text' && state.text.str) {
    const ts = state.text;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    if (ts.stroke) {
      g.lineWidth = ts.strokeWidth * 2;
      g.strokeStyle = '#ffffff';
      g.strokeText(ts.str, 0, 0);
    }
    g.fillStyle = ts.color;
    g.fillText(ts.str, 0, 0);
  }
  g.restore();
}

/* ============================================================
 * 预览动画循环（rAF 驱动）
 * ============================================================ */
let tNow = 0, lastTs = 0;
function renderLoop(ts) {
  if (lastTs) tNow += (ts - lastTs) / 1000;
  lastTs = ts;
  ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
  drawMaterial(ctx, PREVIEW_SIZE, tNow);
  requestAnimationFrame(renderLoop);
}
requestAnimationFrame(renderLoop);

/* ============================================================
 * 图片上传
 * ============================================================ */
const dropZone = byId('dropZone');
const fileInput = byId('fileInput');

function loadImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      imgCache = { el: img, fitScale: null };
      state.img = { scale: 1, offsetX: 0, offsetY: 0 };
      state.mode = 'image';
      byId('thumbPreview').src = e.target.result;
      byId('imageControl').classList.remove('hidden');
      byId('dropZone').classList.add('hidden');
      resetTabs();
      syncUi();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => loadImageFile(fileInput.files[0]));
['dragover', 'drop'].forEach((ev) => {
  dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    if (ev === 'dragover') dropZone.classList.add('dragover');
    else { dropZone.classList.remove('dragover'); loadImageFile(e.dataTransfer.files[0]); }
  });
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

byId('btnReplaceImage').addEventListener('click', () => fileInput.click());
byId('btnResetImage').addEventListener('click', () => {
  if (!state.img) return;
  state.img.scale = 1; state.img.offsetX = 0; state.img.offsetY = 0;
  byId('imgScale').value = 100;
  syncUi();
});

/* 预览区拖拽移动 + 滚轮缩放（图片模式） */
let dragging = false, startX = 0, startY = 0, sOffX = 0, sOffY = 0;
canvas.addEventListener('pointerdown', (e) => {
  if (state.mode !== 'image' || !imgCache) return;
  dragging = true;
  canvas.classList.add('dragging');
  startX = e.clientX; startY = e.clientY;
  sOffX = state.img.offsetX; sOffY = state.img.offsetY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const rect = canvas.getBoundingClientRect();
  const k = PREVIEW_SIZE / rect.width;
  state.img.offsetX = sOffX + (e.clientX - startX) * k;
  state.img.offsetY = sOffY + (e.clientY - startY) * k;
});
canvas.addEventListener('pointerup', () => { dragging = false; canvas.classList.remove('dragging'); });
canvas.addEventListener('wheel', (e) => {
  if (state.mode !== 'image' || !imgCache) return;
  e.preventDefault();
  const next = state.img.scale * (e.deltaY > 0 ? 0.9 : 1.1);
  state.img.scale = Math.min(2, Math.max(0.4, next));
  byId('imgScale').value = Math.round(state.img.scale * 100);
  syncUi();
}, { passive: false });

/* ============================================================
 * Tab 切换
 * ============================================================ */
function resetTabs() {
  byId('tabImage').classList.toggle('active', state.mode === 'image');
  byId('tabText').classList.toggle('active', state.mode === 'text');
  byId('panelImage').classList.toggle('active', state.mode === 'image');
  byId('panelText').classList.toggle('active', state.mode === 'text');
}
byId('tabImage').addEventListener('click', () => {
  if (imgCache) { state.mode = 'image'; resetTabs(); }
  else fileInput.click();
});
byId('tabText').addEventListener('click', () => { state.mode = 'text'; resetTabs(); });

/* ============================================================
 * 文字控件
 * ============================================================ */
byId('textInput').addEventListener('input', (e) => { state.text.str = e.target.value.trim(); });
byId('fontFamily').addEventListener('change', (e) => { state.text.font = e.target.value; });
byId('fontSize').addEventListener('input', (e) => {
  state.text.size = +e.target.value;
  byId('fontSizeVal').textContent = e.target.value;
});
byId('fillColor').addEventListener('input', (e) => { state.text.color = e.target.value; });
byId('outlineToggle').addEventListener('change', (e) => { state.text.stroke = e.target.checked; });
byId('outlineWidth').addEventListener('input', (e) => {
  state.text.strokeWidth = +e.target.value;
  byId('outlineWidthVal').textContent = e.target.value;
});

/* ============================================================
 * 动效与参数
 * ============================================================ */
const effectGrid = byId('effectGrid');
Object.keys(EFFECTS).forEach((key) => {
  const el = document.createElement('div');
  el.className = 'effect-card' + (key === state.effect ? ' active' : '');
  el.dataset.key = key;
  el.innerHTML = `<span class="effect-icon">${EFFECTS[key].icon}</span><div class="effect-name">${EFFECTS[key].name}</div>`;
  el.addEventListener('click', () => {
    state.effect = key;
    effectGrid.querySelectorAll('.effect-card').forEach((c) => c.classList.toggle('active', c.dataset.key === key));
    byId('currentEffectMeta').textContent = `动效：${EFFECTS[key].name}`;
  });
  effectGrid.appendChild(el);
});

byId('speedRange').addEventListener('input', (e) => {
  state.speed = +e.target.value / 100;
  byId('speedVal').textContent = (+e.target.value / 100).toFixed(1).replace(/\.0$/, '') + '×';
});
byId('amountRange').addEventListener('input', (e) => {
  state.amount = +e.target.value / 100;
  byId('amountVal').textContent = (+e.target.value / 100).toFixed(1).replace(/\.0$/, '') + '×';
});
byId('imgScale').addEventListener('input', (e) => {
  if (!state.img) return;
  state.img.scale = +e.target.value / 100;
  syncUi();
});

/* ============================================================
 * GIF 导出（gifenc，共享 drawMaterial 保证逐帧一致）
 * ============================================================ */
const btnExport = byId('btnExport');
const progressBox = byId('exportProgress');
const progressFill = byId('progressFill');
const progressText = byId('progressText');
const resultBox = byId('exportResult');
const wrap = byId('gifPreviewWrap');

byId('exportSize').addEventListener('change', (e) => { state.exportSize = +e.target.value; });
byId('exportFps').addEventListener('change', (e) => { state.exportFps = +e.target.value; });
byId('exportDuration').addEventListener('change', (e) => { state.exportDuration = +e.target.value; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function exportGif() {
  const hasMat =
    (state.mode === 'image' && imgCache) ||
    (state.mode === 'text' && state.text.str);
  if (!hasMat) { alert('请先上传图片或输入文字'); return; }

  const size = state.exportSize;
  const fps = state.exportFps;
  const totalFrames = state.exportDuration * fps;
  const delay = Math.round(1000 / fps);
  const px = size * size * 4;

  const off = document.createElement('canvas');
  off.width = size; off.height = size;
  const g = off.getContext('2d', { willReadFrequently: true });

  btnExport.disabled = true;
  progressBox.classList.remove('hidden');
  resultBox.classList.add('hidden');
  wrap.classList.add('hidden');
  progressText.textContent = '正在渲染帧…';
  progressFill.style.width = '0%';

  try {
    const enc = window.GIFEnc.GIFEncoder();

    // 阶段一：渲染全部帧到内存
    const frames = new Uint8Array(px * totalFrames);
    for (let i = 0; i < totalFrames; i++) {
      g.clearRect(0, 0, size, size);
      drawMaterial(g, size, i / fps);
      frames.set(g.getImageData(0, 0, size, size).data, i * px);
      if (i % 4 === 0) {
        progressFill.style.width = Math.round((i / totalFrames) * 70) + '%';
        await sleep(0);
      }
    }

    // 阶段二：建立全局调色板（rgba4444 保留透明通道）
    // 注意：不能用第一帧建调色板——闪烁等动效首帧可能全透明，会导致整个 GIF 无色。
    // 选取不透明像素最多的帧作为调色板基准，保证主题色进入调色板。
    progressText.textContent = '生成调色板…';
    await sleep(0);
    let paletteBase = frames.slice(0, px);
    {
      let best = -1, bestLevel = -1;
      for (let i = 0; i < totalFrames; i++) {
        const sub = frames.subarray(i * px, (i + 1) * px);
        let level = 0;
        for (let k = 3; k < sub.length; k += 4) if (sub[k] > 0) level++;
        if (level > bestLevel) { bestLevel = level; best = i; }
      }
      if (best >= 0) paletteBase = frames.slice(best * px, (best + 1) * px);
    }
    const palette = window.GIFEnc.quantize(paletteBase, 256, { format: 'rgba4444', clearAlpha: true });
    let transparentIndex = 0;
    for (let k = 0; k < palette.length; k++) {
      if (palette[k].length >= 4 && palette[k][3] === 0) { transparentIndex = k; break; }
    }

    // 阶段三：逐帧编码
    progressText.textContent = '正在编码 GIF…';
    for (let i = 0; i < totalFrames; i++) {
      // 注意：gifenc 的 applyPalette 按 t.buffer 整体读取（忽略 subarray 的 byteOffset），
      // 必须传入独立拷贝（slice），否则每帧都会读到第一帧数据，导致导出的 GIF 没有动画。
      const data = frames.slice(i * px, (i + 1) * px);
      const idx = window.GIFEnc.applyPalette(data, palette, 'rgba4444');
      enc.writeFrame(idx, size, size, {
        palette, delay,
        transparent: true, transparentIndex,
        repeat: 0,
      });
      if (i % 4 === 0) {
        progressFill.style.width = Math.round(70 + (i / totalFrames) * 28) + '%';
        await sleep(0);
      }
    }
    enc.finish();

    const blob = new Blob([enc.bytes()], { type: 'image/gif' });
    const url = URL.createObjectURL(blob);
    byId('downloadLink').href = url;
    byId('downloadLink').download = `动效表情包_${EFFECTS[state.effect].name}.gif`;
    const img = document.createElement('img');
    img.alt = '导出 GIF 预览';
    img.src = url;
    wrap.innerHTML = '';
    wrap.appendChild(img);

    progressFill.style.width = '100%';
    progressText.textContent = '完成';
    await sleep(200);
    progressBox.classList.add('hidden');
    resultBox.classList.remove('hidden');
  } catch (err) {
    progressText.textContent = '导出失败：' + err.message;
    await sleep(1500);
    progressBox.classList.add('hidden');
  } finally {
    btnExport.disabled = false;
  }
}

btnExport.addEventListener('click', exportGif);
byId('btnPreviewGif').addEventListener('click', () => wrap.classList.toggle('hidden'));
byId('btnResetResult').addEventListener('click', () => {
  resultBox.classList.add('hidden');
  wrap.classList.add('hidden');
});

/* ============================================================
 * UI 同步
 * ============================================================ */
function syncUi() {
  byId('imgScaleVal').textContent = state.img ? Math.round(state.img.scale * 100) + '%' : '100%';
}

/* 初始化 */
resetTabs();