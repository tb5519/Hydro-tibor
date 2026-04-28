# Hydro-tibor 服务器部署预案与上线清单

## 一、当前阶段说明

- 本文仅为服务器部署预案，不代表已经部署完成。
- 当前本地 `Web + Mongo` 已验证通过。
- 当前本地 judge 已完成构建、启动、认证、连接与最小评测验证。
- 当前服务器尚未部署 Hydro。
- 当前不操作 ClassFlow。
- 当前不连接服务器。

## 二、最终目标架构

- ClassFlow 继续保持裸机部署。
- Hydro 使用 Docker Compose 部署。
- Hydro 项目目录建议：`/www/hydro-tibor`。
- ClassFlow 与 Hydro 的目录分开。
- ClassFlow 与 Hydro 的端口分开。
- ClassFlow 与 Hydro 的数据库分开。
- ClassFlow 与 Hydro 的 deploy key 分开。
- ClassFlow 与 Hydro 的日志分开。
- ClassFlow 与 Hydro 的备份分开。

域名方案（推荐）：

- `classflow.top` -> ClassFlow（保持不变）

方案 A：Hydro 使用 `onebyone.run`（或 `oj.onebyone.run`）

- 优点：
  - 题库品牌独立
  - 不和 ClassFlow 混在一起
  - 用户认知更清晰

方案 B：Hydro 使用 `oj.classflow.top`

- 优点：
  - 和 ClassFlow 生态统一
- 缺点：
  - 容易让排课系统和 OJ 题库品牌混在一起

最终建议：

- 优先使用 `onebyone.run` 或 `oj.onebyone.run` 作为 Hydro 域名；
- `classflow.top` 继续仅服务 ClassFlow。

域名与备案说明（重要）：

- `onebyone.run` 作为题库/OJ 品牌域名很合适，但当前为个人备案主体。
- 若 `onebyone.run` 仅用于个人学习题库、个人非商业 OJ，可作为候选。
- 若 Hydro/OJ 用于公司业务、课程服务、付费会员、企业宣传或商业转化，不建议继续使用个人备案主体。
- 此类商业场景应优先评估以下路径：
  - 将 `onebyone.run` 迁移或调整为公司主体备案；
  - 或使用公司备案域名下的 `oj.classflow.top`；
  - 或新增一个公司主体备案的 OJ 专用域名。
- 当前服务器位于阿里云；若 `onebyone.run` 备案在腾讯云并解析到阿里云中国大陆服务器，还需评估阿里云接入备案要求。
- 最终部署前必须确认：备案主体、接入服务商、网站实际内容三者一致。

建议端口：

- ClassFlow：保持现有端口（例如 `5050`）
- Hydro Web：宿主机 `127.0.0.1:8888`
- Mongo：仅容器内部访问，不暴露公网
- Judge：不暴露公网端口

## 三、服务器目录规划

建议目录结构（示例）：

- `/www/classflow`：ClassFlow 项目目录（现有）
- `/www/hydro-tibor`：Hydro 项目代码目录
- `/data/hydro-tibor`：Hydro 数据总目录
- `/data/hydro-tibor/backups`：备份输出目录
- `/data/hydro-tibor/uploads`：上传/题目文件数据
- `/data/hydro-tibor/mongo`：Mongo 数据（如使用 bind mount）
- `/data/hydro-tibor/judge`：judge 本地私有配置（如 `judge.yaml`）
- `/logs/hydro-tibor`：Hydro 侧日志归档目录

用途说明：

- Hydro 数据不得混入 ClassFlow 目录。
- 若使用 bind mount，可见性好、便于备份与审计。
- 若使用 Docker named volumes，也要建立备份脚本，把卷内容定期导出到 `/data/hydro-tibor/backups`。

## 四、GitHub / deploy key 规划

- ClassFlow 使用自己的 deploy key。
- Hydro-tibor 使用独立 deploy key。
- 本地开发 key 可写（按需）。
- 服务器 deploy key 建议只读。
- 不复用 ClassFlow 的 deploy key。
- 私钥不提交到 GitHub。
- token/password 不写入仓库。

未来服务器 clone 形态（示例，不执行）：

```bash
git clone git@github.com-hydro-tibor:tb5519/Hydro-tibor.git /www/hydro-tibor
```

建议 SSH alias（示例）：

```sshconfig
Host github.com-hydro-tibor
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_hydro_tibor_server
  IdentitiesOnly yes
```

## 五、环境变量与敏感配置

服务器私有配置建议包含：

- `.env`
- `docker/judge/judge.yaml`
- judge 用户名/密码
- Mongo 连接配置
- `HYDRO_HTTP_PORT`
- `HYDRO_ADDONS_JSON`
- `HYDRO_JUDGE_SERVER_URL`
- `HYDRO_JUDGE_USERNAME`
- `HYDRO_JUDGE_PASSWORD`

强制约束：

- `.env` 不提交
- `docker/judge/judge.yaml` 不提交
- 真实密码不进 GitHub
- 服务器配置与本地配置分开管理

## 六、Docker Compose 部署策略

默认启动 Web + Mongo：

```bash
docker compose up -d --build
```

启动 Web + Mongo + Judge（叠加）：

```bash
docker compose -f docker-compose.yml -f docker-compose.judge.yml up -d --build
```

策略说明：

- 默认 compose 不启动 judge。
- judge 是可选叠加服务。
- 服务器若需评测能力，必须叠加 judge。
- judge 存在 `privileged` 风险，需受控启用。
- judge 必须设置资源限制。
- judge 不暴露公网端口。

## 七、Nginx / Caddy 反向代理预案

目标（优先）：

- `onebyone.run` -> `127.0.0.1:8888`
- 或 `oj.onebyone.run` -> `127.0.0.1:8888`

备选：

- `oj.classflow.top` -> `127.0.0.1:8888`

要求：

- HTTPS
- 不影响 `classflow.top`
- 不影响现有 ClassFlow 反代
- Hydro 与 ClassFlow 使用独立 server/site block
- Mongo 与 Judge 不暴露公网

Nginx 思路（示例）：

- 为 `onebyone.run`（或 `oj.onebyone.run`）新建独立 server block
- `proxy_pass http://127.0.0.1:8888`
- 单独 TLS 证书与日志文件
- 不改现有 ClassFlow server block

Caddy 思路（示例）：

- 为 `onebyone.run`（或 `oj.onebyone.run`）新建独立站点
- `reverse_proxy 127.0.0.1:8888`
- 自动 HTTPS
- 与 ClassFlow 站点拆分配置

## 八、资源隔离策略

为避免影响 ClassFlow，建议：

- judge 设定 CPU 限制
- judge 设定内存限制
- judge 设定 `pids_limit`
- judge 日志大小限制（`max-size`/`max-file`）
- 关注 Mongo 内存占用
- 关注 Docker 磁盘占用
- 控制提交并发，避免评测高峰挤占资源

原则：

- 宁愿 judge 慢一点，也不能拖垮 ClassFlow。

上线前至少确认：

- 总内存
- CPU 核数
- 磁盘剩余空间
- ClassFlow 当前资源占用
- Docker 运行时资源占用

## 九、备份策略

至少备份以下对象：

- MongoDB 数据
- Hydro home 配置
- uploads/file 数据
- judge 配置
- `.env` 私有配置
- docker-compose 配置
- GitHub 仓库代码

建议频率：

- 上线前手动备份一次
- 每日自动备份 Mongo/uploads
- 每次升级前备份
- 每次接 judge 或调整 volume 前备份

危险命令/操作：

- `docker compose down -v`
- `docker system prune -a --volumes`
- `rm -rf /data/hydro-tibor`
- 覆盖 `.env`
- 覆盖 `judge.yaml`

## 十、上线前检查清单

- [ ] 服务器 Docker 已安装
- [ ] Docker Compose 可用
- [ ] 域名 `onebyone.run` 或 `oj.onebyone.run` 已解析（备选 `oj.classflow.top`）
- [ ] HTTPS 方案已明确
- [ ] ClassFlow 当前运行正常
- [ ] Hydro 项目目录已创建
- [ ] Hydro deploy key 已配置
- [ ] `.env` 已创建
- [ ] `judge.yaml` 已创建
- [ ] Mongo 数据目录/volume 已明确
- [ ] uploads 数据目录/volume 已明确
- [ ] 备份目录已创建
- [ ] 反向代理配置已准备
- [ ] 端口无冲突
- [ ] `Web + Mongo` 可启动
- [ ] judge 可选启动
- [ ] localhost/内网端口可访问
- [ ] 外网域名可访问
- [ ] A+B AC/WA 验证通过
- [ ] ClassFlow 不受影响

## 十一、上线流程预案

以下为未来上线顺序（预案，不执行）：

1. 备份 ClassFlow
2. 确认服务器资源
3. 创建 Hydro 目录
4. 配置 deploy key
5. clone `Hydro-tibor`
6. 创建服务器 `.env`
7. 创建服务器 `docker/judge/judge.yaml`
8. 先启动 `Web + Mongo`
9. 本机 `curl` 验证 `127.0.0.1:8888`
10. 配置 Nginx/Caddy 到 `onebyone.run`（或 `oj.onebyone.run`）
11. 外网访问验证
12. 再启动 judge
13. 验证 judge 在线
14. 做 A+B AC/WA 验证
15. 观察 ClassFlow 是否受影响
16. 记录上线结果

## 十二、回滚方案

若 Hydro 上线失败，回滚目标是“先保 ClassFlow 不受影响”：

- 停止 Hydro 容器
- 恢复反向代理配置
- 不改动 ClassFlow
- 恢复上一个 commit
- 恢复 Mongo/uploads 备份
- 关闭 judge
- 保留日志用于排查

示例命令（示例，不执行）：

```bash
docker compose down
git reset --hard <previous_commit>
docker compose up -d --build
```

说明：

- `down -v` 不作为常规回滚命令。

## 十三、服务器部署风险

- judge `privileged` 安全风险
- 与 ClassFlow 同机资源争抢风险
- Mongo 数据丢失风险
- volume 误删风险
- 端口冲突风险
- 反向代理冲突风险
- HTTPS 配置冲突风险
- 日志/提交文件导致磁盘打满风险
- Git deploy key 配置错误风险
- 本地 Mac arm64 与服务器 x86_64 行为差异风险
- 服务器首次部署不应直接对外开放给真实用户

## 十四、阶段 3B 建议

下一阶段建议：

- 阶段 3B：服务器部署前实机信息收集

本轮不执行，仅列出待收集信息：

- 服务器系统版本
- CPU / 内存 / 磁盘
- Docker 是否安装
- 当前 ClassFlow 运行方式
- 当前 Nginx/Caddy 使用情况
- 当前端口占用
- 当前域名解析
- 当前备份情况
- 当前防火墙/安全组
- 当前宝塔面板情况

## 十五、Cursor 下一轮执行边界

下一轮仍然不能：

- 直接上服务器
- 修改 ClassFlow
- 删除 volume
- 合并 UI 改造
- 修改业务代码
- 提交敏感配置
