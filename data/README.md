# マスター編集手順
data/master/ にある10種類のJSONが編集元です。data/balance.json と index.html 内の BALANCE_MASTER は生成物です。
1. 必要なマスターのみ編集。
2. node scripts/sync-balance.cjs
3. node scripts/sync-balance.cjs --check
4. node --test tests/*.test.cjs
5. node scripts/benchmark.cjs（105条件のJSON出力）

| ファイル | 管理内容 |
|---|---|
| weapon_master | モンスターの名称、基本ATK/SPD、射程・範囲、枠、成長、役割 |
| rune_master | 魂名称、種類、確率、対象、効果、累積、時間、範囲 |
| enemy_master | 敵サイズ・配置パターン・Y座標候補 |
| stage_master | 通常AREA生成、成長曲線 |
| boss_master | 特殊ボス・HP・攻略ヒント |
| reward_master | 戦闘報酬・アリーナ・ギフト・ショップ |
| drop_table | ドロップ率と抽選重み |
| upgrade_table | 強化費用・必要素材・工房の交換比率/欠片報酬 |
| effect_master | 攻撃演出・表示上限 |
| balance_config | 制限時間・速度/イベント制限・推奨編成・検証条件・探索上限 |

戦闘ルールの原作未確認値は暫定。既定の攻撃形状はforward/単体/爆発。line/cone/chain/zone等は設定候補のため、既存バランスを破壊しないよう試験・調整してから変更する。表示文の一部、内部アルゴリズム、旧互換処理はJS側。IDの追加・削除や配列順変更はセーブ互換テストを必要とする。
