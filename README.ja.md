# hanabi-cli

協力型カードゲーム「ハナビ（花火）」を、**追記専用の YAML 台帳**として実装した CLI。 一手ごとの記録が actor とターン番号と時刻に紐付き、同じ台帳を `--as <player>` レンズ越しに見るとそのプレイヤーの「自分の手札は見えない」視点が生まれ、 レンズなしで見れば観戦者としての全真実が出る。

[`eris-ths/guild-cli`](https://github.com/eris-ths/guild-cli) v0.3.0 からフォーク。 インフラ（atomic write、path 封じ込め、楽観ロック CAS、DDD クリーンアーキテクチャ、厳格フラグ検証）はそのまま引き継ぎ、 ハナビ固有のドメインだけ新規に書いた。

> **ステータス**: alpha (0.x)。 [`atelier`](./docs/ATELIER.md) — このプロトタイプを土台に設計中のゲームエンジン — の前駆。
> 脅威モデルは [`SECURITY.md`](./SECURITY.md)、リリース履歴は [`CHANGELOG.md`](./CHANGELOG.md) を参照。

> 英語版は [`README.md`](./README.md) にあります。 日本語版は翻訳ではなく、日本語話者の読み手（人間・AI 両方）に向けて独立に書かれています。

## なぜ作ったか

同時に 3 つの目的を持つ:

- **gate クラスのインフラがターン制ゲームにも通用するか試す**。 イベントソーシング台帳 + CAS + レンズ系が、チーム協働の領域で動くなら、協力型カードゲームでも動くのか？ 今のところ答えは Yes。
- **レンズ設計をゲーム領域で dogfood する**。 真実は `snap.log` 一つ。 `show` そのままで全盤面、`show --as eris` で eris の手札だけ隠す。 永続化経路は分岐せず、描画時にレンズを当てるだけ。
- **[`atelier`](./docs/ATELIER.md) への足がかりを敷く** — Card 駆動、 Lua サンドボックス、 パック配布、 観戦者 AI スロットを備えた AI ファーストのゲームエンジン構想。

## ゲームとして面白いの？

答えは **面白い**（10 点中 8 点。 ハナビ自体がゲームの古典なので）。 実際 20 ターン遊んで、協調の痺れる瞬間が何度も来た。

- **自分の手札だけ見えない、相手の手札は見える**。 自分に出せるヒントは自分では出せない。 毎手が半分情報の流れ、半分カード操作。 「コミュニケーションがうまくなる」ことが上達の中心、というゲームは珍しい。
- **ヒント 8 個しかない、ミスは 3 回で敗北**。 5 ターン目で「相手が 5 を捨てようとしてるのに、ヒント余力ない」みたいな緊張が走る。
- **相棒同士でコンベンションが生まれる**。 「青ヒントを受けたあとの rank3 ヒント返し」 が、そのペアだけに意味を持ち始める。 ルールブックじゃなく、共有の文法になる。
- **ミスは協調の話題になる**。 ミスって「どう signal すればよかった？」 の議論になる。 「なぜ見えなかった」 じゃない。 関係性に優しく、卓は緊張する、いいバランス。
- **1 ゲーム 15〜30 分**。 昼休みに入る長さ、でもちゃんと「物語」になる長さ。

CLI 版だけの価値:

- **非同期プレイが自然**。 台帳ファイルが状態の全て。 メール添付、git commit、共有フォルダ — 好きな手段で渡して、受け手は `show --as 自分の名前` で続きから入れる。 数日かけて遊ぶ turn-by-turn が成立する。
- **完全リプレイ**。 seed + log で任意のターンを再現。 自分のミスを見返す、鮮やかな逆転を共有する、が可能。
- **AI パートナーがいずれ合流する**。 観戦 AI の枠は `atelier` で設計済み ([`docs/ATELIER.md`](./docs/ATELIER.md) §7 参照)。

ハナビ未経験なら、 この CLI の 2 人用がいちばん入りやすい。 `--seed beginner-friendly` で 1 ゲーム通してみて、 緊張がどこで自然に発生するか体感するのがおすすめ。

## どこまで読めばいい？

| 深さ | ファイル | これで充分なとき |
|---|---|---|
| 30 秒 | ここまでの段落 | これが何か知りたい |
| 3 分 | [`AGENT.md`](./AGENT.md) | AI エージェントで `hanabi` を動かすので verb マップだけ欲しい |
| 15 分 | [`docs/ATELIER.md`](./docs/ATELIER.md) | どこに向かっているのか（ビジョン）を知りたい |
| 5 分 | [`docs/PROTOTYPES.md`](./docs/PROTOTYPES.md) | 同じ土台を共有する兄弟プロトタイプ 2 本が気になる |
| 必要時 | [`SECURITY.md`](./SECURITY.md) / [`CHANGELOG.md`](./CHANGELOG.md) | 組み込む、採用する段階 |

## インストール

Node.js 20 以降が必要。

```bash
npm install
npm run build
node ./bin/hanabi.mjs --help
```

## クイックスタート

```bash
# 新しいゲーム
HANABI_ROOT=./demo node ./bin/hanabi.mjs new-game --players eris,nao --seed "my-seed"

# 観戦ビュー（全員の手札が見える）
HANABI_ROOT=./demo node ./bin/hanabi.mjs show

# プレイヤービュー（自分の手札は隠れ、相手は見える）
HANABI_ROOT=./demo node ./bin/hanabi.mjs show --as eris

# 手札 2 枚目を play
HANABI_ROOT=./demo node ./bin/hanabi.mjs play 2 --by eris

# 手札 3 枚目を discard
HANABI_ROOT=./demo node ./bin/hanabi.mjs discard 3 --by eris

# ヒントを出す: 「あなたの rank 1 のカードは位置 X と Y」または「青のカードは位置 Z」
HANABI_ROOT=./demo node ./bin/hanabi.mjs inform --by eris --target nao --rank 1
HANABI_ROOT=./demo node ./bin/hanabi.mjs inform --by eris --target nao --color blue
```

## 動詞（verb）一覧

| 動詞 | 役割 | 主なフラグ |
|---|---|---|
| `new-game` | 新ゲーム作成 | `--players`, `--seed`, `--id` |
| `show` | 盤面描画 | `--as <player>`, `--id` |
| `play` | 手札からカードを出す | `<handIndex>` 位置引数（1 始まり）, `--by` |
| `discard` | カードを捨てる（info トークン +1） | `<handIndex>`, `--by` |
| `inform` | ヒントを出す | `--by`, `--target`, `--color` または `--rank` |
| `list` | ゲーム ID 一覧 | — |
| `help` | 使い方 | — |

未定義のフラグは必ずエラーになる。 `--turn` のつもりで `--trun` と打てば黙って無視されない。 詳しい動詞リファレンスは [`AGENT.md`](./AGENT.md)。

## 設計の系譜

[`guild-cli`](https://github.com/eris-ths/guild-cli) v0.3.0 から継承、 ゲーム領域に合わせて調整:

- **イベントソーシング**: `snap.log` が真実の源。 ゲーム状態はログからの導出。 リプレイも事後検証もタダ。
- **純粋関数的変更**: すべての action は `(snap, input) → newSnap`。 その場書き換えはしない。 リポジトリはスナップショットを atomic に書き、 `snap.version` で CAS する。
- **楽観ロック CAS**: `GameVersionConflict` は guild-cli の `RequestVersionConflict` と同形。 同時書き込みを検知、再読込して retry。
- **隠れ情報レンズは描画境界で**: スナップショットは常に真実を保持。 `show --as <player>` は描画時にレンズを当て、 そのプレイヤーの手札を `**` に置換するだけ。 `gate voices --lense <l>` と同じ思想。
- **シード可能な決定的リプレイ**: Mulberry32 PRNG + FNV-1a 文字列シードハッシュ。 シード固定でシャッフル完全再現。 `Math.random()` はどこにも使わない。
- **厳格フラグ検証**: 全動詞で `rejectUnknownFlags`。 黙って通すのが一番まずい。
- **パス安全性**: `safeFs.assertUnder` + `pathSafety.isUnderBase`。 パス traversal はコンパイル時の関心事であって、 ランタイム修正事項ではない。

## 実装済みルール（標準ハナビ）

- 50 枚デッキ: 5 色 × (1 が 3 枚、2/3/4 が各 2 枚、5 が 1 枚)
- 手札: 2〜3 人プレイなら 5 枚、 4〜5 人なら 4 枚
- Info トークン 8 個（ヒントで −1、 discard で +1、 5 を完成させると +1、 上限 8）
- ミス 3 回で敗北
- デッキ尽き後の最終ラウンド: 残りプレイヤーが 1 手ずつ、 それで終了
- スコア 25（全花火完成）で勝利

## セキュリティと品質

- 脅威モデルは [`SECURITY.md`](./SECURITY.md) に明記。
- 品質基準は guild-cli を継承: TS strict モード、 `noUncheckedIndexedAccess`、 `exactOptionalPropertyTypes`。 根拠なしの `any` なし。 全動詞に end-to-end テストあり。 Lua サンドボックスの拒否リストはテストでピン留め。
- エンジンにもファーストパーティロジックにも `Math.random()` は存在しない。 乱数はすべて `Rng` 経由、 全ゲームが監査可能で再現可能。

## Lua サンドボックス（実験的）

`src/core/lua/sandbox.ts` に wasmoon ベースの Lua サンドボックスがある。 拒否リスト（`os`, `io`, `require`, `package`, `debug`, `load`, `loadstring`, `loadfile`, `dofile`, `collectgarbage`）はハードコード。 テストが各拒否グローバルを列挙し、 サンドボックス内で `nil` になることをアサートする。 純粋計算モジュール（`math`, `string`, `table`）は残す。

Lua はまだハナビのドメインロジックに統合されていない。 サンドボックスは [`atelier`](./docs/ATELIER.md) の Card スクリプト層のための hook point。

## リポジトリ衛生

- シークレットはコミットしない、env ファイルも想定しない。
- `games/`、 `_playground/`、 `data/` は gitignore 済み。 台帳ファイルはローカルに留まる。
- コミットは署名する（設定している場合）、 AI 協働時には co-author 行を添える。

## ライセンス

MIT
