/* ============================================================
 * 共享背景音乐播放器 · 林俊杰《当你》单曲循环
 * 用于 index.html（星空主页）与 sky.html（天空没有极限）
 *
 * 能力：
 *  - 进入页面即尝试自动播放（受浏览器策略限制时，首次点击/按键自动解锁）
 *  - 单曲循环、音量调节（localStorage 记忆）、手动暂停/播放
 *  - 跨页面续播：定时保存播放进度，切换页面后从上次位置继续
 *  - 音频文件缺失时进入告警态，提示放置文件
 *
 * 音频文件请自行准备（需拥有合法使用权）放到：
 *     assets/music/dangni.mp3
 * ==========================================================*/
(function () {
    'use strict';

    var SONG_SRC = 'assets/music/dangni.mp3?v=1025';
    var K_VOL = 'dr1025_music_vol';      // 音量记忆
    var K_PAUSED = 'dr1025_music_paused'; // 用户是否手动暂停
    var K_TIME = 'dr1025_music_time';     // 跨页续播进度（秒）
    var FADE_MS = 1400;                    // 开场淡入时长

    var targetVol = clamp(parseFloat(localStorage.getItem(K_VOL)), 0, 1);
    if (isNaN(targetVol)) targetVol = 0.35;

    /* ---------- 构建悬浮播放器 DOM ---------- */
    var fab = document.createElement('div');
    fab.className = 'music-fab';
    if (/sky\.html/.test(location.pathname)) fab.classList.add('on-sky');
    fab.innerHTML =
        '<div class="music-panel">' +
        '  <div class="song"><b>林俊杰</b> ·《当你》</div>' +
        '  <input type="range" min="0" max="100" value="' + Math.round(targetVol * 100) + '" aria-label="音量" />' +
        '  <div class="vol-label">VOL <span class="vol-num">' + Math.round(targetVol * 100) + '</span></div>' +
        '</div>' +
        '<button class="music-btn" type="button" aria-label="播放或暂停背景音乐" title="林俊杰 ·《当你》（单曲循环）">' +
        '  <span class="music-eq"><i></i><i></i><i></i><i></i></span>' +
        '</button>' +
        '<div class="music-hint" hidden>点击任意处开启音乐 ♪</div>';
    document.body.appendChild(fab);

    var btn = fab.querySelector('.music-btn');
    var eq = fab.querySelector('.music-eq');
    var hint = fab.querySelector('.music-hint');
    var volRange = fab.querySelector('input[type=range]');
    var volNum = fab.querySelector('.vol-num');

    /* ---------- 音频元素 ---------- */
    var audio = new Audio();
    audio.src = SONG_SRC;
    audio.loop = true;                 // 单曲循环
    audio.preload = 'auto';
    audio.volume = targetVol;
    audio.style.display = 'none';
    document.body.appendChild(audio);

    var isPlaying = false;             // 唯一播放状态源
    var hasError = false;
    var gestureBound = false;
    var fadeTimer = null;

    /* ---------- 状态 → UI（并向外部派发 music-state 事件） ---------- */
    function syncUI() {
        fab.classList.toggle('playing', isPlaying);
        if (isPlaying) {
            eq.hidden = false;
            btn.textContent = '';
            btn.appendChild(eq);
        } else {
            eq.hidden = true;
            btn.textContent = '▶';
        }
        // 通知页面上的其他音乐控制按钮（如主页控制台的「音乐」按钮）同步状态
        try {
            window.dispatchEvent(new CustomEvent('music-state', {
                detail: { playing: isPlaying, hasError: hasError }
            }));
        } catch (e) { /* 旧浏览器不支持 CustomEvent 时忽略 */ }
    }

    // 外部切换播放状态的统一入口（index.html 控制台按钮通过此事件触发）
    window.addEventListener('music-toggle', function () {
        if (hasError) return;
        if (isPlaying) {
            audio.pause();
            isPlaying = false;
            localStorage.setItem(K_PAUSED, '1');
            syncUI();
        } else {
            audio.volume = 0;
            audio.play().then(function () {
                isPlaying = true;
                localStorage.removeItem(K_PAUSED);
                syncUI();
                startFade();
            }).catch(function () { armGestureUnlock(); });
        }
    });

    /* ---------- 淡入播放 ---------- */
    // 音量从 0 平滑淡入到目标音量
    function startFade() {
        clearInterval(fadeTimer);
        var start = Date.now();
        fadeTimer = setInterval(function () {
            var k = Math.min(1, (Date.now() - start) / FADE_MS);
            audio.volume = targetVol * k;
            if (k >= 1) { clearInterval(fadeTimer); audio.volume = targetVol; }
        }, 40);
    }

    /* ---------- 浏览器自动播放策略：首次手势解锁 ---------- */
    function armGestureUnlock() {
        if (gestureBound || hasError) return;
        gestureBound = true;
        fab.classList.add('locked');
        hint.hidden = false;

        function unlock() {
            if (localStorage.getItem(K_PAUSED) === '1') {
                // 用户上次手动暂停过，尊重其选择，仅移除提示
                disarm();
                return;
            }
            audio.volume = 0;
            var p = audio.play();
            if (p && p.then) {
                p.then(function () {
                    isPlaying = true;
                    syncUI();
                    startFade();
                    disarm();
                }).catch(function () { /* 仍被拦截则继续等待下一次手势 */ });
            }
        }
        function disarm() {
            gestureBound = false;
            fab.classList.remove('locked');
            hint.hidden = true;
            ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
                window.removeEventListener(ev, unlock, true);
            });
        }
        ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
            window.addEventListener(ev, unlock, { capture: true, passive: true });
        });
    }

    /* ---------- 手动播放 / 暂停 ---------- */
    btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (hasError) return;
        if (isPlaying) {
            audio.pause();
            isPlaying = false;
            localStorage.setItem(K_PAUSED, '1');
            syncUI();
        } else {
            audio.volume = 0;
            audio.play().then(function () {
                isPlaying = true;
                localStorage.removeItem(K_PAUSED);
                syncUI();
                startFade();
            }).catch(function () { armGestureUnlock(); });
        }
    });

    /* ---------- 音量控制 ---------- */
    volRange.addEventListener('input', function () {
        targetVol = clamp(parseInt(volRange.value, 10) / 100, 0, 1);
        localStorage.setItem(K_VOL, String(targetVol));
        volNum.textContent = volRange.value;
        clearInterval(fadeTimer);
        audio.volume = targetVol;
    });
    // 阻止滑块点击冒泡到飞行/星盘交互
    volRange.addEventListener('pointerdown', function (e) { e.stopPropagation(); });

    /* ---------- 跨页续播：保存与恢复进度 ---------- */
    var restored = false;
    // 将播放位置定位到上次跨页时保存的进度（避开曲尾）
    function tryRestore() {
        if (restored || !audio.duration) return;
        var saved = parseFloat(localStorage.getItem(K_TIME));
        if (!isNaN(saved) && saved > 1 && saved < audio.duration - 1.5) {
            try { audio.currentTime = saved; } catch (e) { /* 解码未就绪时忽略 */ }
        }
        restored = true;
    }
    audio.addEventListener('loadedmetadata', tryRestore);
    // 缓存命中时元数据可能已就绪（事件早于监听），立即尝试一次
    if (audio.readyState >= 1) tryRestore();
    setInterval(function () {
        if (isPlaying && !audio.paused && audio.duration) {
            localStorage.setItem(K_TIME, String(audio.currentTime));
        }
    }, 2000);
    // 页面隐藏/关闭前立即存档
    document.addEventListener('visibilitychange', function () {
        if (document.hidden && audio.duration) {
            localStorage.setItem(K_TIME, String(audio.currentTime));
        }
    });
    window.addEventListener('pagehide', function () {
        if (audio.duration) localStorage.setItem(K_TIME, String(audio.currentTime));
    });

    /* ---------- 文件缺失 / 加载失败告警 ---------- */
    audio.addEventListener('error', function () {
        hasError = true;
        fab.classList.add('music-err');
        fab.classList.remove('locked', 'playing');
        eq.hidden = true;
        btn.textContent = '!';
        btn.title = '未找到音乐文件：请将《当你》音频放到 assets/music/dangni.mp3';
        hint.hidden = true;
    });

    /* ---------- 工具：数值夹取 ---------- */
    function clamp(v, min, max) {
        if (isNaN(v)) return min;
        return Math.max(min, Math.min(max, v));
    }

    /* ---------- 进入页面：尝试自动播放；被拦截则挂手势解锁 ---------- */
    function init() {
        // 用户上次手动暂停 → 不自动播放，显示 ▶
        if (localStorage.getItem(K_PAUSED) === '1') { syncUI(); return; }
        var p = audio.play();
        if (p && p.then) {
            p.then(function () {
                isPlaying = true;
                syncUI();
                startFade();
            }).catch(function (err) {
                if (err && err.name === 'NotAllowedError') armGestureUnlock();
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    // bfcache 往返恢复：按存档重新对齐播放状态（避免缓存页状态过期）
    window.addEventListener('pageshow', function (e) {
        if (!e.persisted) return;
        if (localStorage.getItem(K_PAUSED) === '1') {
            audio.pause();
            isPlaying = false;
            syncUI();
        } else if (audio.paused) {
            audio.play().then(function () {
                isPlaying = true;
                syncUI();
            }).catch(function () { armGestureUnlock(); });
        }
    });

    // 启动：先渲染初始暂停态图标，再尝试自动播放
    function boot() {
        syncUI();
        init();
    }
})();
