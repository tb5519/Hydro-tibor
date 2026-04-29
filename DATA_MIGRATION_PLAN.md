# Hydro-tibor 旧题库数据迁移规划

## 一、当前阶段说明

- 本文只是迁移规划文档。
- 当前不执行迁移。
- 当前不连接旧服务器。
- 当前不导入旧数据。
- 当前不修改数据库。
- 当前目标是为后续“本地迁移演练”和“正式迁移”做准备。

## 二、版本信息

旧系统：Hydro v5.0.0-beta.11 Community

新系统：Hydro v5.0.0-beta.18-332e593-dirty Community

说明：

- 两者都是 Hydro v5 beta 系列，迁移可行性较高。
- 但 beta.11 到 beta.18 之间可能存在字段差异。
- 不允许直接整库覆盖正式环境。
- 必须先做本地迁移演练。
- 正式部署前应尽量避免 dirty 版本状态。

## 三、迁移范围

可能需要迁移的数据：

1. 用户数据
2. 题目数据
3. 题目测试数据
4. 上传文件 / 附件
5. 提交记录
6. 训练 / 题单
7. 比赛
8. 讨论
9. 标签
10. 排行榜 / 统计
11. domain 配置
12. 权限 / 角色
13. 系统设置
14. 语言配置
15. judge 相关配置

说明：

- 不一定所有数据都一次迁移。
- 推荐分阶段迁移。
- 题目 + 测试数据 + 用户优先。
- 提交记录和历史排名风险更高，可后置。

## 四、必须备份的内容

正式迁移前必须备份：

1. MongoDB 数据
2. Hydro home 目录
3. 题目测试数据目录
4. 上传文件 / 附件目录
5. 配置文件
6. 插件配置
7. 域配置
8. 现有运行脚本
9. 旧系统版本信息
10. 旧系统目录结构截图或命令输出

特别强调：

- 只备份 MongoDB 不够。
- 题目测试数据和附件必须一起备份。

## 五、迁移风险

1. 版本字段不兼容
2. Mongo collection 结构变化
3. 用户 ID / 题目 ID 冲突
4. domain 不一致导致数据看不到
5. 题目有记录但测试数据缺失
6. 提交记录关联用户 / 题目失败
7. 训练 / 比赛关联题目失败
8. 权限和角色异常
9. 旧插件和新版本不兼容
10. 文件权限问题
11. Docker volume 路径不一致
12. 本地 Mac Docker 与服务器 Linux Docker 差异
13. 覆盖 UI v2 / Docker / judge 配置的风险
14. 迁移后 judge 评测失败

## 六、推荐迁移顺序

建议顺序：

- 第一阶段：只迁题目 + 测试数据
- 第二阶段：迁用户
- 第三阶段：迁训练 / 题单 / 比赛
- 第四阶段：迁讨论 / 标签
- 第五阶段：迁提交记录
- 第六阶段：迁统计 / 排名

说明：

- 每阶段都要验证。
- 不建议一次全部倒入。
- 出问题时更容易定位。

## 七、本地迁移演练流程

以下流程为后续演练流程，本轮不执行：

1. Step 1：从旧服务器导出 MongoDB
2. Step 2：从旧服务器打包题目测试数据和上传文件
3. Step 3：在本地 Hydro-tibor Docker 环境准备独立测试库
4. Step 4：导入 MongoDB 到本地测试库
5. Step 5：恢复测试数据 / uploads / file
6. Step 6：启动 Web + Mongo
7. Step 7：启动 judge
8. Step 8：抽查旧题能否打开
9. Step 9：提交旧题做 AC/WA 验证
10. Step 10：检查用户、训练、比赛、讨论
11. Step 11：记录问题并修复
12. Step 12：形成正式迁移方案

## 八、正式迁移流程预案

1. Step 1：正式迁移前冻结旧系统写入
2. Step 2：完整备份旧系统
3. Step 3：部署新 Hydro-tibor
4. Step 4：确认新系统空库能运行
5. Step 5：导入 MongoDB
6. Step 6：恢复文件数据
7. Step 7：重启 Web / Mongo / judge
8. Step 8：验证题目、用户、评测
9. Step 9：验证 ClassFlow 不受影响
10. Step 10：切换域名或开放访问
11. Step 11：保留旧系统只读备份一段时间

## 九、需要收集的旧系统信息

后续要从旧服务器收集：

1. 旧系统安装目录
2. 旧 MongoDB 连接方式
3. MongoDB 数据库名
4. MongoDB 版本
5. collections 列表
6. Hydro home 目录
7. 题目测试数据目录
8. uploads / file 目录
9. Docker / 非 Docker 部署方式
10. Node / Yarn / Hydro 版本
11. 插件列表
12. domain 列表
13. 题目数量
14. 用户数量
15. 提交记录数量
16. 训练数量
17. 比赛数量
18. 磁盘数据大小
19. 当前备份方式
20. 当前 judge 配置

## 十、只读命令清单

后续在旧服务器可执行的只读命令：

要求：

- 只读
- 不修改旧系统
- 不重启服务
- 不导出数据
- 不暴露密码

查看版本：

```bash
hydrooj --version || true
node -v
yarn -v
mongo --version || true
mongosh --version || true
```

查看目录：

```bash
pwd
ls -la
ls /root/.hydro 2>/dev/null || true
ls /data 2>/dev/null || true
ls /www 2>/dev/null || true
```

查看进程：

```bash
ps aux | grep -i hydro | grep -v grep
ps aux | grep -i mongo | grep -v grep
ps aux | grep -i judge | grep -v grep
```

查看端口：

```bash
ss -lntp
```

查看数据库基本信息：

- 不要输出密码。
- 如果能安全连接 `mongosh`，再列：

```javascript
show dbs
use hydro
show collections
```

查看数据量时可以写示例，但仅在确认无敏感输出时执行。

## 十一、本地演练验收标准

迁移演练成功标准：

1. 旧题目能打开
2. 旧题面正常显示
3. 旧测试数据存在
4. 旧题可以提交并 AC / WA
5. 用户数据可见
6. 训练 / 题单可打开
7. 比赛可打开
8. 提交记录可查看
9. 讨论可查看
10. 权限正常
11. UI v2 不被覆盖
12. judge 正常
13. Docker 配置不被覆盖
14. ClassFlow 不受影响

## 十二、回滚方案

如果迁移失败：

1. 停止新 Hydro
2. 保留迁移失败现场日志
3. 恢复迁移前 MongoDB 备份
4. 恢复文件备份
5. 回退到迁移前 commit
6. 保留旧系统不动
7. 不要删除旧系统数据
8. 不要执行 `docker compose down -v` 作为常规回滚
9. 不要覆盖旧备份

## 十三、禁止事项

- 不允许直接在正式库上首次迁移。
- 不允许只导 MongoDB 不导文件。
- 不允许覆盖 `.env`。
- 不允许覆盖 `docker/judge/judge.yaml`。
- 不允许用旧配置覆盖 UI v2 / Docker / judge 配置。
- 不允许未备份就导入。
- 不允许在 ClassFlow 正在高峰使用时迁移。
- 不允许执行 `docker compose down -v`。
- 不允许删除旧服务器数据。
- 不允许把数据库密码写进 GitHub。

## 十四、阶段 5B 建议

下一阶段：阶段 5B：旧服务器只读信息收集（本轮不执行）。

阶段 5B 目标：

- 收集旧系统目录
- 收集旧 Mongo 信息
- 收集文件目录
- 收集数据规模
- 确定导出方式
- 输出 `MIGRATION_INSPECTION_REPORT.md`
