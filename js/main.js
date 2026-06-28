/* Yato Easing - パネル UI ロジック
 * - SVG cubic-bezier エディタ（ハンドルドラッグ / 数値入力 / クイックイーズ）
 * - 動くプレビュー（移動・拡縮・透明の3表現、requestAnimationFrame）
 * - AE スキン色追従（テーマに合わせて CSS 変数を実行時設定）
 * - ExtendScript ブリッジ（Copy / Apply）
 */
(function () {
    "use strict";

    var cs = new CSInterface();

    var curve = { x1: 0.333, y1: 0.0, x2: 0.667, y2: 1.0 };
    var VB = 120;

    function $(id) { return document.getElementById(id); }

    var svg = $("editor");
    var elCurve = $("curve");
    var elH1 = $("h1"), elH2 = $("h2");
    var elH1line = $("h1line"), elH2line = $("h2line");
    var inInf = $("inInf"), outInf = $("outInf");
    var status = $("status");
    var pvMove = $("pvMove"), pvScale = $("pvScale"), pvFade = $("pvFade");

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    // ===== AE スキン色追従 =====
    function clampByte(v) { return Math.max(0, Math.min(255, Math.round(v))); }
    function shade(c, amt) { return { r: clampByte(c.r + amt), g: clampByte(c.g + amt), b: clampByte(c.b + amt) }; }
    function rgb(c) { return "rgb(" + c.r + "," + c.g + "," + c.b + ")"; }

    function applyHostTheme() {
        try {
            var info = cs.getHostEnvironment().appSkinInfo;
            var col = info.panelBackgroundColor.color; // 0..255
            var bg = { r: col.red, g: col.green, b: col.blue };
            var lum = 0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b;
            var dark = lum < 128;
            var root = document.documentElement.style;

            root.setProperty("--ye-bg", rgb(bg));
            root.setProperty("--ye-surface", rgb(shade(bg, dark ? -8 : -10)));
            root.setProperty("--ye-border", rgb(shade(bg, dark ? -16 : -24)));
            root.setProperty("--ye-input", rgb(shade(bg, dark ? -18 : -14)));
            root.setProperty("--ye-grid", rgb(shade(bg, dark ? 18 : -30)));
            root.setProperty("--ye-diag", rgb(shade(bg, dark ? 30 : -45)));
            root.setProperty("--ye-hline", rgb(shade(bg, dark ? 62 : -75)));
            root.setProperty("--ye-btn", rgb(shade(bg, dark ? 16 : -12)));
            root.setProperty("--ye-btn-hover", rgb(shade(bg, dark ? 30 : -24)));
            root.setProperty("--ye-text", dark ? "#e4e4e4" : "#1d1d1d");
            root.setProperty("--ye-dim", dark ? "#9a9a9a" : "#6a6a6a");
            // アクセントはテーマ非依存（単一アクセント）。両モードで読めるティール固定。
        } catch (e) { /* ブラウザ等で appSkinInfo 取得不可の場合はフォールバック既定値のまま */ }
    }

    // ===== 描画 =====
    function nx(x) { return x * VB; }
    function ny(y) { return VB - y * VB; }

    function render() {
        var p0x = nx(0), p0y = ny(0), p3x = nx(1), p3y = ny(1);
        var c1x = nx(curve.x1), c1y = ny(curve.y1);
        var c2x = nx(curve.x2), c2y = ny(curve.y2);

        elCurve.setAttribute("d",
            "M " + p0x + " " + p0y + " C " + c1x + " " + c1y + " " + c2x + " " + c2y + " " + p3x + " " + p3y);
        elH1.setAttribute("cx", c1x); elH1.setAttribute("cy", c1y);
        elH2.setAttribute("cx", c2x); elH2.setAttribute("cy", c2y);
        elH1line.setAttribute("x1", p0x); elH1line.setAttribute("y1", p0y);
        elH1line.setAttribute("x2", c1x); elH1line.setAttribute("y2", c1y);
        elH2line.setAttribute("x1", p3x); elH2line.setAttribute("y1", p3y);
        elH2line.setAttribute("x2", c2x); elH2line.setAttribute("y2", c2y);

        outInf.value = Math.round(curve.x1 * 100);
        inInf.value = Math.round((1 - curve.x2) * 100);
    }

    // ===== ハンドルドラッグ =====
    var dragging = null;
    function clientToNorm(ev) {
        var pt = svg.createSVGPoint();
        pt.x = ev.clientX; pt.y = ev.clientY;
        var loc = pt.matrixTransform(svg.getScreenCTM().inverse());
        // y は overshoot を許容しつつ viewBox 余白内に収める
        return { x: clamp(loc.x / VB, 0, 1), y: clamp((VB - loc.y) / VB, -0.3, 1.3) };
    }
    function onPointerMove(ev) {
        if (!dragging) return;
        var n = clientToNorm(ev);
        if (dragging === "h1") { curve.x1 = n.x; curve.y1 = n.y; }
        else { curve.x2 = n.x; curve.y2 = n.y; }
        render();
        ev.preventDefault();
    }
    elH1.addEventListener("pointerdown", function (ev) { dragging = "h1"; ev.target.setPointerCapture(ev.pointerId); });
    elH2.addEventListener("pointerdown", function (ev) { dragging = "h2"; ev.target.setPointerCapture(ev.pointerId); });
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", function () { dragging = null; });

    // ===== 数値入力 =====
    function onInfInput() {
        curve.x1 = clamp(parseFloat(outInf.value) || 0, 0, 100) / 100;
        curve.x2 = 1 - clamp(parseFloat(inInf.value) || 0, 0, 100) / 100;
        render();
    }
    outInf.addEventListener("change", onInfInput);
    inInf.addEventListener("change", onInfInput);

    // ===== クイックイーズ =====
    var qbtns = document.querySelectorAll(".qbtn");
    for (var q = 0; q < qbtns.length; q++) {
        qbtns[q].addEventListener("click", function () {
            var p = this.getAttribute("data-c").split(",");
            curve.x1 = parseFloat(p[0]); curve.y1 = parseFloat(p[1]);
            curve.x2 = parseFloat(p[2]); curve.y2 = parseFloat(p[3]);
            render();
        });
    }

    // ===== 上下反転（値軸 y を反転）=====
    $("btnFlip").addEventListener("click", function () {
        curve.y1 = 1 - curve.y1;
        curve.y2 = 1 - curve.y2;
        render();
    });

    // ===== ステータス =====
    function setStatus(msg, kind) { status.textContent = msg; status.className = kind || ""; }

    // ===== プリセット（localStorage）=====
    var PRESET_KEY = "yatoEasingPresets";
    function loadPresets() {
        try { return JSON.parse(localStorage.getItem(PRESET_KEY) || "[]"); }
        catch (e) { return []; }
    }
    function savePresets(arr) {
        try { localStorage.setItem(PRESET_KEY, JSON.stringify(arr)); } catch (e) { }
    }
    function r4(v) { return Math.round(v * 10000) / 10000; }

    function renderPresets() {
        var list = $("presetList");
        list.innerHTML = "";
        var arr = loadPresets();
        if (!arr.length) {
            var em = document.createElement("div");
            em.className = "preset-empty";
            em.textContent = "保存したプリセットがここに表示されます";
            list.appendChild(em);
            return;
        }
        for (var i = 0; i < arr.length; i++) {
            (function (p, idx) {
                var chip = document.createElement("span");
                chip.className = "preset-chip";
                chip.title = "クリックで読込";
                chip.addEventListener("click", function () {
                    curve.x1 = p.c[0]; curve.y1 = p.c[1]; curve.x2 = p.c[2]; curve.y2 = p.c[3];
                    render();
                    setStatus("プリセット「" + p.name + "」を読込", "");
                });
                var label = document.createElement("span");
                label.textContent = p.name;
                var x = document.createElement("span");
                x.className = "x";
                x.textContent = "×";
                x.title = "削除";
                x.addEventListener("click", function (e) {
                    e.stopPropagation();
                    var a = loadPresets();
                    a.splice(idx, 1);
                    savePresets(a);
                    renderPresets();
                });
                chip.appendChild(label);
                chip.appendChild(x);
                list.appendChild(chip);
            })(arr[i], i);
        }
    }

    function saveCurrentPreset() {
        var nameEl = $("presetName");
        var name = (nameEl.value || "").replace(/^\s+|\s+$/g, "");
        var arr = loadPresets();
        if (!name) name = "Preset " + (arr.length + 1);
        arr.push({ name: name, c: [r4(curve.x1), r4(curve.y1), r4(curve.x2), r4(curve.y2)] });
        savePresets(arr);
        nameEl.value = "";
        renderPresets();
        setStatus("プリセット「" + name + "」を保存", "ok");
    }
    $("btnSavePreset").addEventListener("click", saveCurrentPreset);
    $("presetName").addEventListener("keydown", function (e) {
        if (e.keyCode === 13) { e.preventDefault(); saveCurrentPreset(); }
    });

    // ===== ExtendScript ブリッジ =====
    function evalHost(code, cb) {
        cs.evalScript(code, function (res) {
            res = res || "";
            if (res.indexOf("OK:") === 0) cb(null, res.substring(3));
            else if (res.indexOf("ERR:") === 0) cb(res.substring(4), null);
            else cb(res || "ExtendScript からの応答がありません", null);
        });
    }
    $("btnCopy").addEventListener("click", function () {
        evalHost("yatoGetSelectedEase()", function (err, data) {
            if (err) { setStatus(err, "err"); return; }
            var p = data.split(",");
            curve.x1 = clamp(parseFloat(p[0]), 0, 1);
            curve.y1 = parseFloat(p[1]);
            curve.x2 = clamp(parseFloat(p[2]), 0, 1);
            curve.y2 = parseFloat(p[3]);
            render();
            setStatus("イーズを取得しました", "ok");
        });
    });
    $("btnApply").addEventListener("click", function () {
        var code = "yatoApplyEaseCurve(" + curve.x1 + "," + curve.y1 + "," + curve.x2 + "," + curve.y2 + ")";
        evalHost(code, function (err, data) {
            if (err) { setStatus(err, "err"); return; }
            setStatus(data + " 個のキーに適用しました", "ok");
        });
    });

    // ===== bezier タイミング関数（x -> y）=====
    function bezAxis(t, a1, a2) {
        var mt = 1 - t;
        return 3 * mt * mt * t * a1 + 3 * mt * t * t * a2 + t * t * t;
    }
    function solveT(x) {
        var t = x;
        for (var i = 0; i < 8; i++) {
            var xt = bezAxis(t, curve.x1, curve.x2) - x;
            if (Math.abs(xt) < 1e-4) break;
            var mt = 1 - t;
            var d = 3 * mt * mt * curve.x1 + 6 * mt * t * (curve.x2 - curve.x1) + 3 * t * t * (1 - curve.x2);
            if (Math.abs(d) < 1e-6) break;
            t = t - xt / d;
        }
        return clamp(t, 0, 1);
    }
    function ease(p) { return bezAxis(solveT(p), curve.y1, curve.y2); }

    // ===== 動くプレビュー（3表現）=====
    var DURATION = 1200, PAUSE = 350, elapsed = 0, lastTs = null;
    function frame(ts) {
        if (lastTs === null) lastTs = ts;
        elapsed += ts - lastTs;
        lastTs = ts;

        var cycle = DURATION + PAUSE;
        var local = elapsed % (cycle * 2);
        var p, dir;
        if (local < cycle) { p = clamp(local / DURATION, 0, 1); dir = 1; }
        else { p = clamp((local - cycle) / DURATION, 0, 1); dir = 0; }

        var v = ease(p);
        if (dir === 0) v = 1 - v;

        var w = pvMove.parentNode.clientWidth - pvMove.offsetWidth;
        pvMove.style.transform = "translateX(" + (v * w) + "px)";
        pvScale.style.transform = "scale(" + (0.35 + 0.65 * v) + ")";
        pvFade.style.opacity = (0.15 + 0.85 * v);

        requestAnimationFrame(frame);
    }

    // ===== ホスト JSX のロード =====
    // CEP は manifest の ScriptPath を自動ロードするが、環境差で未ロードのことがある。
    // 明示的に evalFile してから yatoPing() で疎通を確認する。
    function loadHost(done) {
        try {
            var ext = cs.getSystemPath(SystemPath.EXTENSION);
            var p = (ext + "/jsx/host.jsx").replace(/\\/g, "/");
            cs.evalScript('$.evalFile("' + p + '")', function () {
                cs.evalScript("yatoPing()", function (r) {
                    if ((r || "").indexOf("OK:") === 0) { if (done) done(true); }
                    else { setStatus("ホストJSXの読込に失敗: " + r, "err"); if (done) done(false); }
                });
            });
        } catch (e) {
            setStatus("ホスト初期化エラー: " + e, "err");
            if (done) done(false);
        }
    }

    // ===== 起動 =====
    applyHostTheme();
    cs.addEventListener("com.adobe.csxs.events.ThemeColorChanged", applyHostTheme);
    render();
    renderPresets();
    requestAnimationFrame(frame);
    loadHost(function (ok) { if (ok) setStatus("準備完了"); });
})();
