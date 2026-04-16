# REGALIA スケジュール管理 — 設計メモ（初版）

家族内運用から開始し、必要に応じて拡張する前提の**方針固定用ドキュメント**。実装前の合意形成と、後からの変更理由の記録に使う。

---

## 1. 目的・非目標

### 1.1 目的

- チームから届く**テキスト中心のスケジュール**（例: `input_example.txt` 形式）を、**見逃しなく**マスター一覧として保持する。
- **追加・変更（日時・会場など）・削除**を、別ページに飛ばさず**マスター一覧上**で状態が分かるようにする（色・凡例・必要なら行展開）。
- **履歴**は追記型で残し、いつ・何が変わったかを後から辿れるようにする。
- **月単位**で一覧を切り替えられる（タブ／ページ／ルート）。

### 1.2 非目標（初版）

- テキストパースの完全自動化のみに依存すること（人手確認なし）。
- チーム外への一般公開（最初は家族／限定的な閲覧者）。
- カレンダー同期（Google Calendar 等）は後続検討。

---

## 2. 既存アプリとの整合（REGALIA 一貫性）

| 項目 | 揃える内容 |
|------|------------|
| バックエンド | **Python 3 + FastAPI** |
| DB | **`DATABASE_URL` 必須 → PostgreSQL（Supabase）**（`psycopg`） |
| 本番 URL | **`REGALIA_PUBLIC_BASE_URL`**（リバースプロキシ・LIFF 用） |
| ログ | **`REGALIA_LOG_LEVEL` / `REGALIA_LOG_FILE`**、`regalia.*` ロガー階層 |
| 認証（本番） | **LINE LIFF + `Authorization: Bearer <id_token>`**（`sub` を **LINE user id** として利用）。開発時 **`REGALIA_DEV_*`**。許可リストは **`SCHEDULE_ALLOWED_LINE_USER_IDS`**、任意で **`SCHEDULE_ALLOWED_GROUP_IDS`**（`X-Liff-Group-Id` とサーバ側照合） |
| UI バージョン | 画面タイトル等に **`(vX)`**（駐車場・動画の運用に合わせる） |
| デプロイ | **Docker + Northflank**（既存手順のコピーでよい） |

### 2.1 フロントエンドの載せ方（**決定: 案 A**）

- **`server/app/static/index.html`** を配信。LIFF SDK・月セレクト・`/api/events` 表示（初版）。

### 2.2 実装メモ（凍結）

- 認証は **LIFF の id_token** を検証し、**`sub` = `line_user_id`** で API を保護する（動画 `server/app/auth.py` と同一フロー）。
- コードエントリ: **`REGALIA_schedule_management/server/`**（`README.md` 参照）。

---

## 3. 利用シナリオ（ユーザーストーリー）

1. **取込担当**がアプリを開き、**対象年月**を選ぶ（または「今月」）。
2. チームからコピーした**生テキスト**をテキストエリアに貼り付け、任意で**補足**（例: リーグ名の明示、取込メモ）を付ける。
3. **プレビュー**ボタン → バックエンドがパースし、**行候補**を返す。警告・未解釈行を表示。
4. 画面上で**軽微な修正**（日付・相手・会場・K/O）が可能なら編集（要否はフェーズで決定）。
5. **確定取込** → DB のマスターと差分計算し、**変更ログ追記**＋**マスター更新**。一覧に反映（色・凡例）。
6. **閲覧者**は月タブで一覧のみ（編集権限なしでも可）。

---

## 4. データモデル（案）

### 4.1 `schedule_events`（マスター・現在の真実）

「1 試合（または開催単位）= 1 行」。論理削除で履歴表示と整合。

| カラム | 型（概念） | 説明 |
|--------|------------|------|
| `id` | UUID / BIGSERIAL | 安定 ID（再取込で同一イベントを追う要） |
| `event_date` | DATE | 開催日（月タブ・並びの主キー） |
| `kickoff_primary` | TEXT | 代表 K/O（文字列のままでも可、初版） |
| `kickoff_secondary` | TEXT | 副審用など（任意） |
| `opponent` | TEXT | 対戦相手 |
| `venue` | TEXT | 会場 |
| `category_code` | TEXT | 例: U15, U14（記号 ☆◇ を正規化したコード） |
| `league_or_competition` | TEXT | 例: U-15リーグ2部 |
| `notes` | TEXT | 審判・備考など |
| `source_text_hash` | TEXT | 取込元ブロックのハッシュ（任意・重複検知用） |
| `raw_source_excerpt` | TEXT | デバッグ・監査用の抜粋（任意、長さ制限） |
| `display_status` | ENUM/TEXT | `active` / `changed_recently` / `new` / `removed` 等（UI 色の源。実装で名寄せ） |
| `last_change_at` | TIMESTAMPTZ | 最終変更時刻 |
| `deleted_at` | TIMESTAMPTZ NULL | 論理削除（一覧ではグレーアウト＋凡例「削除」） |
| `created_at` / `updated_at` | TIMESTAMPTZ | 監査 |

**インデックス**: `(event_date)`, `(category_code, event_date)` など。

### 4.2 `schedule_event_changes`（追記のみの変更ログ）

| カラム | 説明 |
|--------|------|
| `id` | BIGSERIAL |
| `event_id` | `schedule_events.id`（削除後も参照可能なら NULL 禁止＋イベント行は論理削除で残す） |
| `change_type` | `added` / `updated` / `removed` |
| `field_name` | `updated` 時: `event_date`, `kickoff_primary`, … |
| `old_value` / `new_value` | TEXT または JSON（複数フィールド一括なら JSON 1 行でも可） |
| `batch_id` | UUID（同一取込バッチ） |
| `actor_line_user_id` | TEXT NULL（LIFF 利用時） |
| `created_at` | TIMESTAMPTZ |

### 4.3 `import_batches`（任意だが推奨）

| カラム | 説明 |
|--------|------|
| `id` | UUID |
| `target_year_month` | `2026-04` 形式 |
| `raw_text` | 取込時の全文（サイズ上限・圧縮は運用で） |
| `status` | `preview` / `committed` / `failed` |
| `created_at` / `committed_at` | |

プレビューだけの段階では `preview`、確定で `committed` とし、`schedule_event_changes.batch_id` と紐づける。

### 4.4 同一イベントの再認識（ID の安定）

- 初回: すべて `added`。
- 2 回目以降: **ヒューリスティック**で既存行にマッチ（例: 同一 `event_date` + 正規化 `opponent` + `venue`）。マッチ失敗は新規扱い → 運用で手でマージする UI は後続でも可。
- **確定ルール**は実装フェーズで文書化し、誤マッチ時の手直し方針を決める。

---

## 5. API 概要（案）

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/health` | DB バックエンド、件数、バージョン |
| GET | `/auth/me` | 駐車場・動画と同様の認証確認 |
| POST | `/api/imports/preview` | body: `raw_text`, `year_month`, options → パース結果・警告（DB のマスターは変更しない） |
| POST | `/api/imports/commit` | body: `batch_id` または確定用ペイロード → 差分適用・ログ追記 |
| GET | `/api/events` | query: `year`, `month` → 当月の `schedule_events`（`deleted_at` フィルタ方針はクエリで選択） |
| GET | `/api/events/{id}/history` | 変更ログ時系列 |
| POST | `/api/admin/...` | 緊急時の手修正（権限は管理者のみ）※初版は省略可 |

認証・許可リスト（`SCHEDULE_ALLOWED_LINE_USER_IDS` 等）は動画アプリの `MOVIES_*` と並列で環境変数化。

---

## 6. フロントエンド UI（案）

- **ヘッダ**: ロゴ・タイトル・`(vX)`・ログイン表示（駐車場イメージ）。
- **月ナビ**: タブまたはセレクト（`2026年4月`）。URL は `/` + query または `/2026/04`（後者はブックマーク向き）。
- **凡例**: 固定表示（追加／変更／削除／確認済み 等。最終セットは実装時に確定）。
- **メイン一覧**: 表（日付・カテゴリ・相手・K/O・会場・状態色）。削除行はグレーアウト＋打ち消し線など。
- **取込パネル**（権限あるユーザーのみ）: テキストエリア、プレビュー表、確定。
- **行展開**（任意）: そのイベントの `schedule_event_changes` を同一画面内に表示。

注入変数: `__REGALIA_API_BASE__`, `__REGALIA_LIFF_ID__`, 開発用フラグ（駐車場ドキュメントと同パターン）。

---

## 7. パース処理（バックエンド）

- **初版**: ルールベース（見出し `【…月…】`、`☆U-15`、日付行 `N日(曜)`、続く `vs`・K/O・`@会場`）。
- **出力**: 構造化リスト + `warnings[]`（パース不能行、複数解釈）。
- **テスト**: `input_example.txt` をフィクスチャに単体テスト。
- 将来: 必要なら LLM 補助は**プレビュー限定**・確定は人間、で検討。

---

## 8. フェーズ分割（提案）

| フェーズ | 内容 |
|----------|------|
| **P0** | リポジトリ雛形、FastAPI、`/health`、DB 接続、テーブル作成、`GET /api/events` 空返却 |
| **P1** | パース `preview`、手動シード CSV または固定テキストで `commit` なしの確認 |
| **P2** | `commit`、差分・`schedule_event_changes`、一覧の状態色・凡例 |
| **P3** | LIFF 認証・許可リスト、Northflank |
| **P4** | 行展開履歴、同一イベントマッチ改善、管理者手修正 API |

---

## 9. 未決事項（要決定）

1. フロントを **static** にするか **`_INDEX_HTML`** にするか（§2.1）。
2. **論理削除**行を「当月一覧」に常に出すか、トグル「削除を表示」か。
3. **`display_status`** を DB に持つか、**直近ログから算出**するか（両方も可）。
4. 複数年度（学年切替）の URL・データの持ち方。
5. 取込 **raw_text** の保存期間・サイズ上限（プライバシー・コスト）。

---

## 10. 参考ファイル

- 入力サンプル: リポジトリ直下 `input_example.txt`
- 既存構成: `REGALIA_ParkingLotteryManagementApp/docs/ARCHITECTURE.md`、`REGALIA_MovieSearchApp/server/README.md`

---

*文書バージョン: 0.1 — 設計検討開始時点*
