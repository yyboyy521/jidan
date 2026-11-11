# 冀🥚协会青春版

基于复旦新生群「冀旦协会」真实聊天记录改编的**文字选择养成游戏**。纯前端、零依赖、零构建，双击 `game/index.html` 即玩。

- 🎮 在线游玩：https://yyboyy521.github.io/jidan/
- 📱 手机访问：同上（竖屏适配，可用「添加到主屏幕」）
- 📖 玩法与机制：见 `game/README.md`
- 🧩 设计文档：`design/`（内容设计 / 视觉规格 / QA 报告）

## 目录结构

```
game/            游戏本体（index.html + js/ + css/ + assets/）
design/          策划、视觉、测试文档
tools/push-api.js  部署辅助脚本（API 推送通道）
deploy.sh        一键部署脚本（核心）
deploy.bat       Windows 双击入口
```

## 日常更新流程

1. 改完 `game/` 里的文件
2. 双击 `deploy.bat`（或在 Git Bash 里执行 `bash deploy.sh "说明"`）
3. 等 1-2 分钟，GitHub Pages 自动重新发布

脚本会依次尝试：`git push` → 失败则自动切到 GitHub API 通道（两条通道产出的提交哈希一致，不会分叉）。

## 首次配置（在新机器上）

```bash
git config credential.helper store      # 记住 Token
git push origin main                    # 输入一次用户名 + Token
```

Token 需要 `repo` 权限。若 Token 失效，脚本会提示重新生成。
