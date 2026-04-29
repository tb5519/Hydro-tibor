# Hydro-tibor 本地迁移演练报告

## 一、演练结论

- 旧 Mongo 数据可以导入 Hydro-tibor。
- 旧文件体可以恢复到 `/data/file/hydro`。
- 旧题目可以打开。
- 图片 / 附件 / 头像可以恢复。
- judge 可以连接。
- 旧题 P1001 已完成 AC/WA 验证。
- 迁移技术路线可行。

## 二、版本信息

旧系统：

Hydro v5.0.0-beta.11 Community

新系统：

Hydro v5.0.0-beta.18-332e593-dirty Community

说明：

- 两者都是 Hydro v5 beta 系列。
- 当前本地演练已验证数据基本兼容。
- 正式迁移前仍需保留完整备份与回滚方案。

## 三、演练环境

本地迁移实验目录：

`/Users/tangbo/Desktop/hydro-migration-lab`

本地访问地址：

`http://localhost:18888`

说明：

- 迁移实验环境与 hydro-tibor 开发环境隔离。
- 不影响 `localhost:8888`。
- 不影响 ClassFlow。
- 不影响旧服务器。
- 使用独立 compose 项目名 / volume。

## 四、使用的备份文件

- `/Users/tangbo/hydro-backups/hydro-old-backup-20260429/hydro-mongo.archive.gz`
- `/Users/tangbo/hydro-backups/hydro-old-backup-20260429/hydro-home.tar.gz`
- `/Users/tangbo/hydro-backups/hydro-old-backup-20260429/SHA256SUMS.txt`
- `/Users/tangbo/Desktop/hydro.zip`

说明：

- `hydro-mongo.archive.gz` 用于恢复 MongoDB。
- `hydro-home.tar.gz` 只包含部分 `.hydro` 内容，主要是 static、配置、插件等。
- `hydro.zip` 是旧服务器 `/data/file/hydro` 文件体目录，通过 SFTP 下载。
- 实际文件体不在 `hydro-home.tar.gz` 中。
- 正式迁移必须额外备份 `/data/file/hydro`。

## 五、Mongo 导入结果

- mongorestore 成功。
- 恢复数量：`56934 document(s) restored successfully`。
- 失败数量：`0`。

导入后关键 collection 数量：

- `user:36`
- `document:358`
- `record:2949`
- `domain:3`
- `domain.user:45`
- `document.status:1059`
- `storage:5576`
- `record.stat:959`
- `oplog:45782`
- `badge:2`
- `userBadge:2`

说明：

- 旧题库数据已进入迁移实验库。
- `badge / userBadge` 也存在。
- `P1000 / P1001 / P1002` 等旧题可查询。

## 六、文件恢复结果

最初只恢复 `hydro-home.tar.gz` 后：

- 图片异常。
- 附件异常。
- 头像异常。
- 测试数据缺失。
- `/data/file` 只有约 48K。

后来定位到真正文件体目录：

`/data/file/hydro`

通过 SFTP 下载为：

`/Users/tangbo/Desktop/hydro.zip`

恢复后：

- `/data/file/hydro` 约 184M。
- 图片恢复。
- 附件恢复。
- 头像恢复。
- 题面资源恢复。
- P1001 题面可正常查看。

重要结论：

正式迁移时，不能只备份 MongoDB 和 `hydro-home.tar.gz`，必须额外备份 `/data/file/hydro`。

## 七、judge 验证结果

迁移实验环境初始没有 judge。启动 judge 时遇到：

1. `judge.yaml` 被挂成目录。
2. 修复为普通文件后，EISDIR 消失。
3. 出现 `User "judge" not found`。
4. 在迁移实验库中创建本地 judge 用户。
5. judge 用户 uid：36。
6. 执行 `setJudge` 成功。
7. judge 连接 Hydro 成功。

最终验证：

- P1001 正确代码 AC。
- P1001 错误代码 WA / 非 AC。
- 说明旧题测试数据可被 judge 正常读取。

正确代码：

```python
import sys
s = sys.stdin.read()
sys.stdout.write(s)
```

错误代码：

```python
print("wrong answer")
```

## 八、遇到的问题与解决

### 1、18888 初始启动失败

原因：

`build:ui:production` 被 Killed，退出码 137，疑似 Docker 内存不足。

解决：

复用 hydro-tibor 已构建的 `packages/ui-default/public` 产物到 hydro-migration-lab，避免重复构建。

### 2、旧题看不到

原因：

未登录，`/p` 和 `/p/P1001` 返回 302 到 `/login`。

解决：

登录后可访问题库和旧题。

### 3、图片/附件/头像异常

原因：

只恢复 `hydro-home.tar.gz` 不够，文件体实际在 `/data/file/hydro`。

解决：

下载 `hydro.zip` 并恢复到 `/data/file/hydro`。

### 4、judge.yaml 挂载错误

原因：

`docker/judge/judge.yaml` 被挂成目录。

解决：

备份异常目录，重新创建普通 `judge.yaml` 文件。

### 5、judge 用户不存在

原因：

迁移库中没有 `uname=judge` 用户。

解决：

在迁移实验库中创建本地 judge 用户，并 `setJudge`。

## 九、正式迁移时必须注意

正式迁移必须包含：

1. MongoDB dump
2. `/root/.hydro` 备份
3. `/data/file/hydro` 文件体备份
4. `badge-for-hydrooj` 插件备份
5. SHA256 校验
6. 迁移前备份新环境
7. 迁移后 AC/WA 验证

禁止：

- 不允许只导 MongoDB。
- 不允许只恢复 `hydro-home.tar.gz`。
- 不允许覆盖 `.env`。
- 不允许覆盖 `docker/judge/judge.yaml`。
- 不允许覆盖 Docker compose 配置。
- 不允许执行 `docker compose down -v` 作为常规回滚。
- 不允许未备份旧系统就切换正式域名。

## 十、正式迁移建议顺序

Step 1：冻结旧系统写入  
Step 2：完整备份 MongoDB  
Step 3：完整备份 `/root/.hydro`  
Step 4：完整备份 `/data/file/hydro`  
Step 5：校验备份文件  
Step 6：部署新 Hydro-tibor 空系统  
Step 7：导入 MongoDB  
Step 8：恢复 `/data/file/hydro`  
Step 9：恢复必要 static 资源  
Step 10：创建或校准 judge 用户  
Step 11：启动 Web + Mongo + judge  
Step 12：验证旧题题面、图片、附件、头像  
Step 13：验证旧题 AC/WA  
Step 14：验证徽章、排行榜、用户页  
Step 15：观察 ClassFlow 是否受影响  
Step 16：确认无误后再切换域名或开放访问

## 十一、当前不建议做的事

- 不建议现在就正式迁移。
- 不建议在 ClassFlow 服务器上直接演练。
- 不建议未备份就覆盖 volume。
- 不建议现在做多徽章功能。
- 不建议把迁移实验数据直接当正式数据使用。
- 不建议跳过文件体恢复直接做 judge。

## 十二、下一阶段建议

阶段 5H：正式迁移执行清单

目标：

- 根据这次演练结果，整理正式服务器迁移命令。
- 规划迁移窗口。
- 规划回滚。
- 规划上线验证。
- 评估 2核2G 服务器是否先跑 Web + Mongo + judge 并发 1。
