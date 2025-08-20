# トラブルシューティングガイド

## 🚨 ページが応答しない場合の対処法

### 1. シンプル版を使用（推奨）
履歴機能を完全に無効化した軽量版です：
```
http://localhost:8080/simple.html
```

### 2. 履歴無効モードで起動
通常版を履歴なしで起動：
```
http://localhost:8080/?nohistory=true
```

### 3. デバッグモードで確認
詳細なログを表示：
```
http://localhost:8080/?debug=true&nohistory=true
```

### 4. ブラウザコンソールでLocalStorageをクリア
```javascript
// コンソールで実行
clearAllData();
// または
localStorage.clear();
```

## 📝 利用可能なURL一覧

| URL | 説明 | 用途 |
|-----|------|------|
| http://localhost:8080/simple.html | シンプル版（履歴なし） | 問題発生時の代替 |
| http://localhost:8080/ | 通常版 | メイン利用 |
| http://localhost:8080/?nohistory=true | 履歴無効モード | トラブル時 |
| http://localhost:8080/?debug=true | デバッグモード | 問題調査 |
| http://localhost:8080/meeting.html | 議事録機能 | 会議用 |

## 🔧 再発防止策（実装済み）

1. **メッセージ数制限**: 最大20件まで保持
2. **データサイズ制限**: 500KB以上は自動削除
3. **重複送信防止**: 1秒間の連続送信をブロック
4. **段階的表示**: 10msごとに1件ずつ表示
5. **文字数制限**: 各メッセージ5000文字まで

## 💡 推奨事項

- 問題が発生したら、まず`simple.html`を試してください
- 定期的にLocalStorageをクリアすることを推奨
- 長時間使用する場合は`?nohistory=true`オプションを使用

## 🆘 それでも動かない場合

```bash
# コンテナを完全に再起動
docker-compose down
docker-compose up -d --build

# ログを確認
docker logs chat-frontend --tail 50
docker logs chat-backend --tail 50
```