# LINE 投稿 + Gemini によるスケジュール取り込み

## 目的

- 規定の LINE トーク／グループに **テキストを投稿（または転送）**すると、**Messaging API Webhook** が本番 API を呼び出す。
- 本文を **Gemini** で構造化 JSON に変換し、**DB 既存行と比較して実質変更がある行だけ**を対象にする。
- **確認フローは常に有効**: テキスト取り込みでは **必ず最初に「受領しました。解析中…」** を返信し、続きは **Push** で結果（差分なし／確認文＋ Quick Reply／エラー等）を送る。**はい**（postback またはテキスト）でだけ **`upsert_schedule_events`** を実行する。
- **Messaging API の Bearer**: `LINE_CHANNEL_ACCESS_TOKEN` を省略可能。未設定時は **`LINE_CHANNEL_ID` + `LINE_CHANNEL_SECRET`** で `POST https://api.line.me/v2/oauth/accessToken`（client_credentials）から取得し、サーバ内でキャッシュする。上書きしたい場合だけ `LINE_CHANNEL_ACCESS_TOKEN` を設定する。

## コンポーネント

| 要素 | 役割 |
|------|------|
| LINE Developers | Webhook URL を `https://{公開ホスト}/webhooks/line` に設定。`LINE_CHANNEL_ID` / `LINE_CHANNEL_SECRET` で署名検証および（必要なら）アクセストークン発行。 |
| FastAPI `POST /webhooks/line` | 署名検証 → 許可リスト → **冪等（message_id）** → Gemini → 差分抽出 → pending 保存 + **reply** → postback / テキストで確定 upsert。 |
| Gemini API | 日本語の生テキスト → イベント配列 JSON（`responseMimeType: application/json`）。システムプロンプトは `server/app/input_parsers.py`（バンドル用パーサ）の **☆◇◯＝カテゴリ・・/●＝大会名・U-15が大会名の一部かカテゴリか** 等と整合するよう指示。**相模原市U-15リーグ**は見出しに依存せず `category_code: all`（`schedule_league_rules` とサーバ後処理で固定）。 |
| `line_webhook_deliveries` | `message_id` 単位で重複処理防止と簡易監査。 |
| `line_ingest_pending` | 確認待ちの upsert 行（JSON）と有効期限。 |
| `line_webhook_reply_dedupe` | postback の Webhook 再送で二重適用しないための `replyToken` ハッシュ。 |

## 許可モデル（必ずどちらかを設定）

- **`LINE_INGEST_USER_IDS`** … 1対1トークで、これらの **userId** からのテキストのみ処理。
- **`LINE_INGEST_GROUP_IDS`** … グループで、これらの **groupId** のルームのみ処理。

**両方空のときは取り込みしない**（誤爆防止）。

## 環境変数

| 変数 | 必須 | 説明 |
|------|------|------|
| `GEMINI_API_KEY` | 取り込みを有効にするなら | Google AI Studio / Cloud から取得。 |
| `LINE_CHANNEL_SECRET` | Webhook なら | Messaging API のチャネルシークレット（署名用）。 |
| `LINE_CHANNEL_ACCESS_TOKEN` | 任意 | チャネルアクセストークンを直指定。**未設定なら ID+シークレットで OAuth 発行**（キャッシュ）。 |
| `LINE_INGEST_USER_IDS` | 上記とセット | カンマ区切り userId。 |
| `LINE_INGEST_GROUP_IDS` | 上記とセット | カンマ区切り groupId（`C` で始まる）。 |
| `GEMINI_MODEL` | 任意 | 既定 `gemini-2.5-flash`（404 時は `gemini-flash-latest` 等を自動試行）。 |
| `GEMINI_DEFAULT_YEAR` | 任意 | 未設定なら実行日の年をプロンプトに渡す。 |
| `GEMINI_DEFAULT_MONTH` | 任意 | 未設定なら実行日の月。 |

## 確認フローの挙動

- **差分なし**（既存 DB と同一）のときは「取り込み対象の変更はありません」と返し、DB は更新しない。
- **新しい取り込み文**を送ると、同一ユーザー・同一グループの **未確定の古い pending は `superseded`** になる。
- **はい**は **元メッセージを送った LINE userId のみ**が確定できる（グループでも投稿者の userId で紐づく）。
- **いいえ**は postback またはテキスト（`いいえ` / `no` / `キャンセル` 等）。最新の未確定 pending を取り消す。
- pending の既定 **有効期限は約 30 分**（期限切れ後の はい は無効）。

## 運用上の注意

- **転送メッセージ**は LINE のイベント型が `text` と異なる場合がある。取り込めないときは **コピペ投稿**に寄せる。
- LLM は誤抽出しうる。**確認フロー**で内容を見てから確定することを推奨。
- Webhook は **署名失敗時のみ 400**。処理失敗でも LINE の再送を避けるため **200** を返し、詳細は `line_webhook_deliveries` とログを参照。

## デプロイ（Northflank）

- 公開 URL を `REGALIA_PUBLIC_BASE_URL` と一致させ、LINE の Webhook に `…/webhooks/line` を登録。
- `GEMINI_API_KEY` と許用 ID をシークレットに登録。
