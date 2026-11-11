#!/usr/bin/env bash
# 《冀🥚协会青春版》一键部署脚本
# 用法：bash deploy.sh [提交说明]   或双击 deploy.bat
# 流程：暂存全部改动 -> 提交 -> 推送 main -> GitHub Pages 自动重新发布(1-2分钟)
set -e
cd "$(dirname "$0")"

MSG="${*:-更新游戏内容}"

# ---- SSL 修正：Windows schannel 吊销检查离线报错(CRYPT_E_REVOCATION_OFFLINE)，
#      固定切换 OpenSSL 后端并指向 Git 自带 CA 证书包 ----
GITBIN="$(command -v git)"
GITROOT="$(cd "$(dirname "$GITBIN")/.." && pwd)"
CA=""
for c in "$GITROOT/etc/ssl/certs/ca-bundle.crt" "$GITROOT/mingw64/etc/ssl/certs/ca-bundle.crt"; do
  if [ -f "$c" ]; then CA="$c"; break; fi
done
# ---- 传输修正：HTTP/2 在部分代理网络下会报 framing layer 错误，固定走 HTTP/1.1 ----
SSL=(-c "http.version=HTTP/1.1")
if [ -n "$CA" ]; then
  SSL+=(-c "http.sslBackend=openssl" -c "http.sslCAInfo=$CA")
else
  echo "!! 未找到 CA 证书包，改用系统默认 SSL 配置"
fi

# ---- 1. 暂存全部改动 ----
git add -A

# ---- 2. 有改动才提交 ----
if git diff --cached --quiet; then
  echo "- 没有新的改动需要提交"
else
  git commit -m "$MSG"
  echo "- 已提交：$MSG"
fi

# ---- 3. 推送 ----
echo "- 推送到 GitHub ..."
if git "${SSL[@]}" push origin main; then
  echo ""
  echo "OK 部署完成！GitHub Pages 将在 1-2 分钟内自动重新发布："
  echo "   https://yyboyy521.github.io/jidan/"
else
  echo ""
  echo "!! 推送失败。常见原因："
  echo "   1) Token 已失效/被删除 -> 到 GitHub Settings > Developer settings 重新生成，"
  echo "      然后运行: git config credential.helper store && git push origin main (输入新Token)"
  echo "   2) 网络不通 -> 检查能否打开 github.com"
  exit 1
fi
