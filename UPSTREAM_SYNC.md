# 上游同步记录 / UPSTREAM_SYNC

> 目的：本地跟踪远端版本，方便一键检测是否有更新。
> 本地目录：`ai-huoke-kefu`（= 云渠通 / LinkBot-AI 全域获客智能客服）
> 决策（2026-09-16）：用户确认按 GitHub `light618/linkbot-ai` 为准，GitCC 仅保留 remote 记录，不作为同步源。

## 1. 远端地址

| 别名 | 地址 | 说明 | 状态 |
|------|------|------|------|
| `gitcc`（用户指定，未验证是否同源） | `https://www.gitcc.com/hoya012/yun-qu-tong-gitcc` | GitCC 私有/内部可见，匿名访问 302 跳 `/users/sign_in`，API 返回 `404 Project Not Found`，无法确认内容 | ⚠️ 需会员登录：`git ls-remote` 返回 `could not read Username`，且有宝塔 BTWAF 保护，匿名无法 clone，对比需登录后执行第 3 节 GitCC 命令 |
| `upstream`（实际使用，已验证） | `https://github.com/light618/linkbot-ai.git` | GitHub 公开仓库 `light618/linkbot-ai`，`全域获客智能客服系统`，`main` 单分支，创建 2025-10-28 | ✅ 可匿名 clone，本次同步源 |

SSH 形式（需 GitCC 账号配 key 后可用）：
- `git@www.gitcc.com:hoya012/yun-qu-tong-gitcc.git`

本地 remote 配置：
```
gitcc    git@www.gitcc.com:hoya012/yun-qu-tong-gitcc.git (fetch/push)
upstream https://github.com/light618/linkbot-ai.git (fetch/push)
```

## 2. 本次同步状态（2026-09-16）

- 本地 `main` 已重置到 `upstream/main`
- 远端 HEAD：`b2856a4d7ac203e2fcc2d1c92d6d22f741229970`
- 本地 HEAD：`b2856a4d7ac203e2fcc2d1c92d6d22f741229970`（一致 ✅）
- 提交信息：`docs: 更新部署指南，明确两个代码库三个服务的部署方式`
- 提交时间：`2025-11-29 19:44:10 +0800`
- 作者：`light618 <light618@github.com>`
- 本地提交数：`10`（`git rev-list --count HEAD`）
- 最近 5 条：
  ```
  b2856a4 docs: 更新部署指南，明确两个代码库三个服务的部署方式
  84aa451 feat: 添加 Railway 部署配置
  01c93eb feat: 完善抖音接入功能
  1a03516 feat: 完善抖音接入功能
  0ad5a89 修复前端硬编码URL：使用Railway域名
  ```

同步方式（已执行）：
```bash
git remote add upstream https://github.com/light618/linkbot-ai.git
git remote add gitcc git@www.gitcc.com:hoya012/yun-qu-tong-gitcc.git
git fetch upstream
git checkout -B main upstream/main
```

## 3. 检测远端版本（不用下载全量）

最快：只查远端 HEAD：
```bash
git ls-remote https://github.com/light618/linkbot-ai.git HEAD
# 对比本地
git rev-parse HEAD
```

完整检查（推荐，含 commit message）：
```bash
git fetch upstream
git log --oneline HEAD..upstream/main -10
git status -sb
# 有输出 = 远端有更新；无输出 = 已同步
```

GitCC（登录后才能用，二选一）：
```bash
# HTTPS（会弹登录）
git ls-remote https://www.gitcc.com/hoya012/yun-qu-tong-gitcc.git HEAD
# SSH（需先配 key）
git ls-remote git@www.gitcc.com:hoya012/yun-qu-tong-gitcc.git HEAD
```

## 4. 有更新时同步

```bash
git fetch upstream
git log --oneline HEAD..upstream/main   # 先看差异
git checkout main
git merge --ff-only upstream/main       #  clean 时快进
# 如有本地修改：先 git stash push -m "local" 再 merge，完了 git stash pop
git show -s --format="%H %ad %s" --date=iso HEAD
# 然后更新本文档第 2 节的 HEAD / 时间 / 提交数
```

## 5. 本地启动测试速查

- 后端（3001）：`cd backend && npm start`（已构建 `dist/`），健康检查 `curl http://localhost:3001/health`
- 前端（3000）：`cd frontend && npm start`，访问 `http://localhost:3000/login`（账号 `admin/admin123`）
- Go 代理（8080）：本机无 Go 工具链，用预编译二进制 `./live-im-proxy`，`PORT=8080 ./live-im-proxy`，检查 `curl http://localhost:8080/health` 和 `curl http://localhost:8080/`
- 全栈：`docker-compose up -d`（需 Docker，含 postgres/redis/nocobase/backend/frontend/proxy/nginx）
- 注意：`start.sh` / `start-all.sh` 内写死了旧路径（`../linkbot-ai-frontend`、` /Users/yiche/linkbot-ai`），本机直接跑会失败，建议按第 5 节手动逐个起。

## 6. 同源性验证结论（2026-09-16，未确认）

- 本地代码全文无 `gitcc / hoya012 / yun-qu-tong / 云渠通` 字样（仅本文档），全是 `LinkBot-AI / linkbot-ai`，作者仅 `light618` + `yiche`，无 `hoya012` 提交。
- GitHub `light618/linkbot-ai`：创建 2025-10-28，push 2025-11-29，17MB，TypeScript，3 stars，HEAD `b2856a4`。
- GitCC `hoya012/yun-qu-tong-gitcc`：匿名不可见，无法比对文件树/commit。要确认是否为同一份，需登录后比对 `git ls-remote <gitcc> HEAD` 是否等于 `b2856a4d7ac203e2fcc2d1c92d6d22f741229970`。
- “二者是镜像”的说法目前仅见于 aosen.cc 一篇下载站文章（2026-08-18），非官方，不可作为证据。
