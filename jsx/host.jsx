/*
 * Yato Easing - ExtendScript ホストエンジン
 *
 * CEP パネル(main.js)から CSInterface.evalScript 経由で呼ばれる。
 * ExtendScript には JSON が無いため、戻り値は単純文字列プロトコルで返す:
 *   成功: "OK:..."   失敗: "ERR:メッセージ"
 *
 * 機能:
 *   yatoPing()                             疎通確認 -> "OK:pong"
 *   yatoGetSelectedEase()                  選択キーの現行イーズを cubic-bezier 4値に変換して返す
 *   yatoApplyEaseCurve(x1,y1,x2,y2)        cubic-bezier 4値を選択キーへ書き込む
 *
 * 重要: temporal ease の配列長は「値の次元数」とは限らない。
 *   - 空間プロパティ(Position/Anchor/Effect point 等)は値が2D/3Dでも temporal ease は長さ1
 *     （速度はモーションパス上のスカラー速度）。
 *   - 非空間の多次元(Scale/3D Rotation 等)は次元ごと。
 *   よって配列長は keyInTemporalEase(key).length から取得する。
 *
 * イーズ<->ベジェ変換:
 *   正規化 cubic-bezier P0=(0,0) P1=(x1,y1) P2=(x2,y2) P3=(1,1)
 *   out影響度 = x1*100,  out速度 = (y1/x1)*avg
 *   in 影響度 = (1-x2)*100, in 速度 = ((1-y2)/(1-x2))*avg
 */

// ------- ユーティリティ -------

function _clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function _round4(v) { return Math.round(v * 10000) / 10000; }
function _asArray(v) { return (v instanceof Array) ? v : [v]; }

function _dist(a, b) {
    var s = 0;
    for (var d = 0; d < a.length; d++) { var x = b[d] - a[d]; s += x * x; }
    return Math.sqrt(s);
}

// time-varying かつキー2つ以上選択されているプロパティを集める
function _collectEasableProps(comp) {
    var out = [];
    var props = comp.selectedProperties;
    for (var i = 0; i < props.length; i++) {
        var p = props[i];
        if (p.canVaryOverTime && p.numKeys >= 2 && p.selectedKeys.length >= 2) out.push(p);
    }
    return out;
}

// 区間 [vA,vB]/D について、ease 次元数 easeDim ぶんの平均速度配列を返す。
// 非空間で次元一致なら各次元差分、空間(easeDim=1)なら移動量の大きさ。
function _avgSpeeds(vA, vB, D, easeDim) {
    var a = _asArray(vA), b = _asArray(vB);
    var avg = [];
    if (easeDim === a.length) {
        for (var d = 0; d < easeDim; d++) avg.push((b[d] - a[d]) / D);
    } else {
        var mag = _dist(a, b) / D;
        for (var k = 0; k < easeDim; k++) avg.push(mag);
    }
    return avg;
}

// ------- 疎通確認 -------
function yatoPing() { return "OK:pong"; }

// ------- Copy: 選択キーのイーズ -> bezier 4値 -------

function yatoGetSelectedEase() {
    try {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) return "ERR:アクティブな Comp がありません";

        var props = _collectEasableProps(comp);
        if (props.length === 0) return "ERR:キーフレームを2つ以上選択してください";

        var prop = props[0];
        var sk = prop.selectedKeys.slice(0).sort(function (a, b) { return a - b; });
        var kA = sk[0], kB = sk[1];

        var t1 = prop.keyTime(kA), t2 = prop.keyTime(kB);
        var D = t2 - t1;
        if (D <= 0) return "ERR:キー間隔が不正です";

        var outEase = prop.keyOutTemporalEase(kA); // KeyframeEase[]
        var inEase = prop.keyInTemporalEase(kB);
        var easeDim = outEase.length;

        var vA = _asArray(prop.keyValue(kA));
        var vB = _asArray(prop.keyValue(kB));

        // 代表となる平均速度・影響度・速度を選ぶ
        var avg, outInf, inInf, outSpd, inSpd;
        if (easeDim === vA.length) {
            // 非空間多次元: |delta| 最大の次元を代表に
            var d = 0, bestAbs = -1;
            for (var i = 0; i < vA.length; i++) {
                var ad = Math.abs(vB[i] - vA[i]);
                if (ad > bestAbs) { bestAbs = ad; d = i; }
            }
            avg = (vB[d] - vA[d]) / D;
            outInf = outEase[d].influence; inInf = inEase[d].influence;
            outSpd = outEase[d].speed; inSpd = inEase[d].speed;
        } else {
            // 空間(easeDim=1): スカラー速度
            avg = _dist(vA, vB) / D;
            outInf = outEase[0].influence; inInf = inEase[0].influence;
            outSpd = outEase[0].speed; inSpd = inEase[0].speed;
        }

        var x1 = outInf / 100;
        var x2 = 1 - (inInf / 100);
        var y1, y2;
        if (avg === 0) { y1 = x1; y2 = x2; }
        else {
            y1 = (outSpd / avg) * x1;
            y2 = 1 - ((inSpd / avg) * (1 - x2));
        }

        x1 = _clamp(x1, 0, 1); x2 = _clamp(x2, 0, 1);
        y1 = _clamp(y1, -1, 2); y2 = _clamp(y2, -1, 2);

        return "OK:" + _round4(x1) + "," + _round4(y1) + "," + _round4(x2) + "," + _round4(y2);
    } catch (e) {
        return "ERR:" + e.toString();
    }
}

// ------- Apply: bezier 4値 -> 選択キーへ書き込み -------

function yatoApplyEaseCurve(x1, y1, x2, y2) {
    try {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) return "ERR:アクティブな Comp がありません";

        var props = _collectEasableProps(comp);
        if (props.length === 0) return "ERR:キーフレームを2つ以上選択してください";

        x1 = _clamp(x1, 0.001, 0.999);
        x2 = _clamp(x2, 0.001, 0.999);

        var BEZ = KeyframeInterpolationType.BEZIER;
        var affected = 0;

        app.beginUndoGroup("Yato Easing: Apply Curve");
        try {
            for (var pi = 0; pi < props.length; pi++) {
                var prop = props[pi];
                var sk = prop.selectedKeys.slice(0).sort(function (a, b) { return a - b; });

                // ease 次元数は既存 temporal ease の配列長から（空間=1 / 非空間=次元数）
                var easeDim = prop.keyInTemporalEase(sk[0]).length;

                // 各キーの望ましい in/out をまず現行値で初期化
                var desiredIn = {}, desiredOut = {};
                for (var s = 0; s < sk.length; s++) {
                    var k = sk[s];
                    desiredIn[k] = prop.keyInTemporalEase(k);
                    desiredOut[k] = prop.keyOutTemporalEase(k);
                }

                // 隣接区間ごとに out(kA)/in(kB) を上書き
                for (var j = 0; j < sk.length - 1; j++) {
                    var kA = sk[j], kB = sk[j + 1];
                    var D = prop.keyTime(kB) - prop.keyTime(kA);
                    if (D <= 0) continue;

                    var avg = _avgSpeeds(prop.keyValue(kA), prop.keyValue(kB), D, easeDim);

                    var outArr = [], inArr = [];
                    var outInf = _clamp(x1 * 100, 0.1, 100);
                    var inInf = _clamp((1 - x2) * 100, 0.1, 100);
                    for (var d = 0; d < easeDim; d++) {
                        var outSpd = (avg[d] === 0) ? 0 : (y1 / x1) * avg[d];
                        var inSpd = (avg[d] === 0) ? 0 : ((1 - y2) / (1 - x2)) * avg[d];
                        outArr.push(new KeyframeEase(outSpd, outInf));
                        inArr.push(new KeyframeEase(inSpd, inInf));
                    }
                    desiredOut[kA] = outArr;
                    desiredIn[kB] = inArr;
                }

                // キーごとに1回だけ適用（中間キーの二重書き込み回避）
                for (var s2 = 0; s2 < sk.length; s2++) {
                    var key = sk[s2];
                    prop.setInterpolationTypeAtKey(key, BEZ, BEZ);
                    prop.setTemporalEaseAtKey(key, desiredIn[key], desiredOut[key]);
                    affected++;
                }
            }
        } finally {
            app.endUndoGroup();
        }

        return "OK:" + affected;
    } catch (e) {
        return "ERR:" + e.toString();
    }
}
