# Yato Easing

After Effects の有償プラグイン **Kease** に似た、自作のイージング操作 CEP パネル。Kease 本体はエンジンがバイナリ・JS も難読化されておりコードを流用できないため、挙動を一から再現している。プリセットライブラリのような付加機能は持たず、**イージングの Preview・取得（Copy）・操作（Apply）の 3 機能だけ**に絞ったミニマル版である。

## 機能

| 機能 | 説明 |
| --- | --- |
| **イージング操作** | SVG 上の cubic-bezier 2 ハンドルをドラッグ、または In/Out 影響度を数値入力。Linear / In / Out / InOut のクイックボタン付き。 |
| **Preview** | 曲線グラフ（編集画面と一体）＋ 上部に曲線で加減速する動くドット。`requestAnimationFrame` で常時再生。 |
| **Copy** | 選択中キーフレームの現行イーズを読み取り、曲線エディタへロードする。 |
| **Apply** | 現在の曲線を選択キーフレームへ書き込む（`KeyframeEase` / `setTemporalEaseAtKey`、Undo 1 操作にまとまる）。 |
| **上下反転** | 曲線を値軸（Y）で反転（`y → 1-y`）。加減速カーブを上下にひっくり返す。 |
| **プリセット** | 現在の曲線を名前付きで `localStorage` に保存。チップをクリックでロード、× で削除。初期プリセットは無し。 |

## 構成

```
CSXS/manifest.xml   拡張定義（ExtensionBundleId=com.yato.easing / CSXS 11 / AEFT 15+）
html/index.html     パネル UI
css/styles.css      Adobe ダークテーマ
js/main.js          UI制御・ベジェ編集・プレビュー・ExtendScript ブリッジ
js/libs/CSInterface.js   Adobe 公式 CEP SDK
jsx/host.jsx        ExtendScript エンジン（イーズ<->ベジェ変換 / AE 操作）
install.ps1         dev install（Junction + PlayerDebugMode）
```

## 導入（dev install）

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

- `%APPDATA%\Adobe\CEP\extensions\com.yato.easing` へ **Directory Junction** を張る（開発中はコピー不要、編集が即反映）。
- 未署名拡張読み込みのため `HKCU\Software\Adobe\CSXS.{10,11,12}\PlayerDebugMode=1` を設定（管理者権限不要）。
- After Effects を再起動し `Window > Extensions > Yato Easing` を開く。

## 使い方

1. レイヤーのプロパティに 2 つ以上キーフレームを打ち、**対象キーを選択**する。
2. **Copy** で現在のイーズを取り込む（任意）。曲線をドラッグ／数値／クイックボタンで整える。
3. **Apply** で選択キーへ反映。

## 変換仕様（イーズ <-> cubic-bezier）

正規化 cubic-bezier `P0=(0,0) P1=(x1,y1) P2=(x2,y2) P3=(1,1)`。区間 `D=t2-t1`、次元 d の平均速度 `avg=(v2[d]-v1[d])/D` として:

- Out 影響度 `= x1*100`, Out 速度 `= (y1/x1)*avg`
- In 影響度 `= (1-x2)*100`, In 速度 `= ((1-y2)/(1-x2))*avg`

多次元プロパティ（位置・スケール等）は次元ごとに `avg` を計算し速度を算出。影響度は時間軸共有のため全次元共通。Copy 時は `|delta|` 最大の次元を曲線の代表として使う。

## 留意点

- イーズ → ベジェは影響度/速度からの近似復元のため、極端なイーズは完全一致しないことがある（Kease も同様）。
- 署名なし運用（PlayerDebugMode）。第三者配布時は別途 ZXP 署名が必要。
- 動作確認: AE 2026（CSXS 11、Kease と同条件）。
