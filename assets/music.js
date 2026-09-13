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

    // 默认音量 10%（0.1）；若 localStorage 存的是 0 或非法值，回退到默认
    var storedVol = parseFloat(localStorage.getItem(K_VOL));
    var targetVol = clamp(storedVol, 0, 1);
    if (!isFinite(storedVol) || storedVol <= 0 || storedVol > 1) targetVol = 0.1;

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
    // 每次页面加载附加随机参数，强制浏览器从头加载，避免从缓存进度续播
    audio.src = SONG_SRC + '&_=' + Date.now();
    audio.loop = true;                 // 单曲循环
    audio.preload = 'auto';
    audio.volume = targetVol;
    audio.style.display = 'none';
    document.body.appendChild(audio);

    var isPlaying = false;             // 唯一播放状态源
    var hasError = false;
    var gestureBound = false;

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
            audio.volume = targetVol;
            audio.play().then(function () {
                isPlaying = true;
                localStorage.removeItem(K_PAUSED);
                syncUI();
            }).catch(function () { armGestureUnlock(); });
        }
    });

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
            audio.volume = targetVol;
            var p = audio.play();
            if (p && p.then) {
                p.then(function () {
                    isPlaying = true;
                    syncUI();
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
            audio.volume = targetVol;
            audio.play().then(function () {
                isPlaying = true;
                localStorage.removeItem(K_PAUSED);
                syncUI();
            }).catch(function () { armGestureUnlock(); });
        }
    });

    /* ---------- 音量控制 ---------- */
    volRange.addEventListener('input', function () {
        targetVol = clamp(parseInt(volRange.value, 10) / 100, 0, 1);
        localStorage.setItem(K_VOL, String(targetVol));
        volNum.textContent = volRange.value;
        audio.volume = targetVol;
    });
    // 阻止滑块点击冒泡到飞行/星盘交互
    volRange.addEventListener('pointerdown', function (e) { e.stopPropagation(); });

    /* ---------- 每次打开网页均从头播放：清除上次进度记忆 ---------- */
    // 需求：每次页面加载/刷新时音乐从 0 秒开始，不续播上次位置
    localStorage.removeItem('dr1025_music_time');
    // 首次播放时强制归零（playing 事件在媒体真正开始播放后触发，此时 seek 最可靠）
    var resetOnce = false;
    audio.addEventListener('playing', function () {
        if (!resetOnce) {
            resetOnce = true;
            audio.currentTime = 0;
        }
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
        // src 已带随机参数，每次加载从头开始
        var p = audio.play();
        if (p && p.then) {
            p.then(function () {
                audio.currentTime = 0;  // 播放成功后再次归零
                isPlaying = true;
                syncUI();
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
