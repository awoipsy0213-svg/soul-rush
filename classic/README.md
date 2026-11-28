# SOUL RUSH CLASSIC 0.1.0

原作 Rune Rider (111%, 2017) を参考にした非公式の独立再構築版。既存のSOUL RUSH v0.18は変更しない。通常24秒、特殊6秒、武器7種、ルーン33種、5ビルド、同種素材+ゴールドによる育成。ホーム/装備/戦闘/報酬画面を参考画面の構造に寄せ、自作SVGで武器・キャラ・敵・ルーンを描画。元のロゴ、画像、コード、音楽は使用していない。

- セーブ: soul_rush_classic_v9。旧SOUL RUSHのセーブ/復元とは分離。バックアップにはedition識別子が必要。
- 原作未確認の数値: 初期敵HP29（24秒版の遊び始めを調整）、武器性能、ルーン倍率、配置、報酬、ドロップ、ヘルメット解放、等は仮仕様。原作の素材そのものや完全なピクセル一致は再現していない。
- 追加した独自の魂工房・自動編成は再現版では無効。攻撃範囲の表示と詳細分析は検証用途として残す。アリーナは従来NPC対戦。
- 参考: https://appget.com/appli/view/70954/ / https://www.behance.net/gallery/66921429/Rune-Rider-UI-Weapons-Helmets-and- / https://forum.gamer.com.tw/B.php?bsn=33387
- 起動: リポジトリルートで python -m http.server 8000 を実行し http://localhost:8000/classic/ を開く。
- reference.json は既存ベースの変更点を管理する。独立HTML内マスターへの同期は下記スクリプトで検証。
- テスト: node --test tests/classic.test.cjs ; node tests/classic-browser-smoke.cjs
