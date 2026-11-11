#!/usr/bin/env bash
# 《冀🥚协会青春版》一键部署
# 用法：双击 deploy.bat   或   bash deploy.sh "提交说明"
# 流程：暂存 -> 提交 -> 推送 main -> GitHub Pages 自动重新发布（1-2 分钟）
set -e
cd "$(dirname "$0")"

MSG="${*:-更新游戏内容}"

# ---- SSL 修正：Windows schannel 吊销检查会离线报错(CRYPT_E_REVOCATION_OFFLINE)，
#      固定切到 OpenSSL 后端并指向 Git 自带 CA 证书包；同时固定 HTTP/1.1 避开 HTTP2 framing 错误 ----
GITROOT="$(cd "$(dirname "$(command -v git)")/.." && pwd)"
CA=""
for c in "$GITROOT/etc/ssl/certs/ca-bundle.crt" "$GITROOT/mingw64/etc/ssl/certs/ca-bundle.crt"; do
  if [ -f "$c" ]; then CA="$c"; break; fi
done
SSL=(-c "http.version=HTTP/1.1")
if [ -n "$CA" ]; then
  SSL+=(-c "http.sslBackend=openssl" -c "http.sslCAInfo=$CA")
else
  echo "!! 未找到 CA 证书包，使用系统默认 SSL 配置"
fi

# ---- SSH 通道需要额外放行（如已配置 SSH key 可改走 SSH）；此处统一用 HTTPS ----

# ---- 1. 暂存 ----
git add -A

# ---- 2. 提交（无改动则跳过） ----
if git diff --cached --quiet; then
  echo "- 没有新的改动，直接尝试推送"
else
  git commit -m "$MSG" >/dev/null
  echo "- 已提交：$MSG"
fi

# ---- 3. 推送（HTTPS 直推，最多重试 3 次） ----
PUSHED=0
for i in 1 2 3; do
  echo "- 推送尝试 $i/3 ..."
  if git "${SSL[@]}" push origin main 2>/tmp/deploy-push.log; then
    PUSHED=1
    break
  fi
  tail -2 /tmp/deploy-push.log | sed 's/^/    /'
  [ "$i" -lt 3 ] && sleep 4
done

# ---- 4. 回退通道：git push 被网络阻断时，走 GitHub API 推送（哈希保持一致，不分叉） ----
if [ "$PUSHED" -eq 0 ]; then
  echo "- git 通道不可用，切换到 GitHub API 通道 ..."
  if node tools/push-api.js main; then
    PUSHED=1
  else
    echo ""
    echo "!! 两种通道都失败。请检查："
    echo "   1) 能否在浏览器打开 https://github.com"
    echo "   2) Token 是否失效：GitHub > Settings > Developer settings > Tokens 重新生成，然后执行"
    echo "      git config credential.helper store && git credential approve  (粘贴新 Token)"
    exit 1
  fi
fi

echo ""
echo "OK 部署完成！GitHub Pages 将在 1-2 分钟内自动重新发布："
echo "   https://yyboyy521.github.io/jidan/"
echo "   直连游戏页：https://yyboyy521.github.io/jidan/game/index.html"
