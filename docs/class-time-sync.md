# OneByOne 上课数据同步接口接入说明

文档版本：v1，适用于当前上课数据同步功能。v1 是文档版本；接口路径不包含版本号。

外部上课平台在课程结束后，向 OneByOne 推送「一名学员的一次上课记录」。OneByOne 将课程时间合并到教师的学员训练看板，分别展示学习总时长、自主训练和上课时长，并扣除上课期间重复记录的站内训练。

## 1. 接入准备

### 生成接口地址与 Token

1. 教师登录 OneByOne，进入「学员训练数据看板」，展开「上课数据同步」。
2. 在「生成 Token 的课堂范围」中勾选允许同步的课堂，点击「生成 Token」。
3. 复制页面显示的完整接口地址和 Token，交由外部平台后端保存。

完整 Token 仅在生成成功时显示一次。每位教师在每个工作区只有一个有效 Token，有效期为生成后的 **365 天**，页面显示具体到期时间。重新生成会立即替换旧 Token；停用后旧 Token 立即失效。已经导入的课程记录保留，更换 Token 后继续沿用原有 `externalId`。

每次请求都会重新检查教师管理权限、工作区状态及学员归属。Token 只能写入授权课堂的课时，不能用于登录教师账号或读取学员数据。外部平台由服务端调用即可，无需传入浏览器 Cookie 或教师密码。

### 配置课堂与学员映射

页面生成的完整接口地址是最终依据。当前站点的地址示例：

```text
https://onebyone.run/d/system/training-time/classes
```

URL 中的 `/d/system/` 是接口入口所在的域；JSON 中的 `domainId` 是本次课时归属的课堂。通过该入口推送 C++ 课程时，JSON 中仍应使用 `"domainId": "C0001"`，且该课堂必须在 Token 的授权范围中。

| 课堂名称 | 当前 `domainId` |
| --- | --- |
| Python训练 | `system` |
| C++训练 | `C0001` |

课堂编号以 Token 生成页面括号内显示的值为准，区分大小写，不要根据课堂名称自行拼写。

外部平台需要保存自己的学员编号与 **OneByOne 学员 UID** 的对应关系。UID 可在看板学员列表中查看；不能使用姓名、手机号、外部平台学员 ID 或登录名代替。学员必须已加入目标课堂、未被学员管理停用，并具备有效学员权限。接口不创建学员、不自动加入课堂，也不提供查询 UID 的功能。

## 2. 请求格式

| 项目 | 要求 |
| --- | --- |
| 方法 | `POST` |
| URL | 教师页面生成的完整接口地址 |
| 内容类型 | `Content-Type: application/json` |
| 认证 | 推荐 `Authorization: Bearer <TOKEN>` |
| 请求体 | 一个 JSON 对象，一名学员的一次已完成课程 |

```http
POST https://onebyone.run/d/system/training-time/classes
Authorization: Bearer <TOKEN>
Content-Type: application/json

{
  "externalId": "classflow:lesson:123:student:101",
  "domainId": "system",
  "uid": 101,
  "startAt": "2026-10-26T10:00:00+08:00",
  "durationHours": 1.5,
  "title": "Python 循环课堂"
}
```

上面的 UID 和记录编号仅用于说明，正式接入时替换为实际映射数据。

### 字段定义

| 字段 | 必填 | JSON 类型 | 约束与含义 |
| --- | --- | --- | --- |
| `externalId` | 是 | string | 本工作区唯一、稳定的「学员课程记录编号」，最长 128 字符，去除首尾空白后不能为空，不能包含控制字符。建议由来源平台、课程编号和外部学员编号组成。 |
| `domainId` | 是 | string | 目标 OneByOne 课堂编号，不能为空，最长 128 字符，必须在 Token 授权范围及教师当前管理范围内。 |
| `uid` | 是 | number | OneByOne 学员 UID，必须为大于 1 的安全整数，不能传数字字符串。 |
| `startAt` | 是 | string | 真实课程开始时刻，使用带时区的 ISO 8601 时间，如 `2026-10-26T10:00:00+08:00` 或 `2026-10-26T02:00:00Z`。不接受没有时区的时间或时间戳数字；秒可省略，毫秒最多 3 位。 |
| `durationHours` | 是 | number | 实际上课小时数，必须大于 0 且不超过 24，支持 `1.5`、`0.75` 等小数。不是“第几课时”，也不是分钟数或数字字符串。计算结果四舍五入到毫秒，须至少为 1 毫秒。 |
| `title` | 否 | string | 看板展示的课程名称，最长 200 字符，不能包含控制字符。服务端去除首尾空白；不提供或为空时，看板显示默认课程名称。 |
| `token` | 否 | string | 使用 JSON 传 Token 时填写；推荐请求头方式。若请求头和此字段同时出现，值必须完全一致。 |

结束时间由 `startAt + durationHours` 计算，必须不晚于 OneByOne 服务端当前时间。应在课程完成后推送；尚未结束或未来的课程会被拒绝。接口不接受 `endAt`、分钟数、工作区编号、教师编号等额外 JSON 字段。

不支持 JSON 数组、批量请求、表单或文件上传。一节课有多名学员时，逐名请求，每名学员使用自己的 `externalId`。不要将 Token 放在 URL 查询参数中；`?token=...` 会被拒绝。

### 幂等规则

`externalId` 在 **整个工作区** 内唯一，不是仅在教师、Token 或课堂内部唯一。同一节课的两名学员应分别使用：

```text
classflow:lesson:123:student:101
classflow:lesson:123:student:102
```

同一条学员课程记录从第一次推送开始，重试、网络超时补发、Token 更换后补发都使用相同编号及内容。接口按目标课堂、学员、开始时刻、上课时长和标题判断内容是否相同。标题改变也可能造成冲突，应保存待发送内容的固定快照。

当前接口只支持新增和相同内容的重复确认，**不支持修改、取消、删除或覆盖已有记录**。收到冲突时，不要通过生成新编号重复上传同一节课来绕过冲突，应先人工核对来源记录和本站记录。

## 3. 返回结果与重试

### 成功返回

首次成功返回 HTTP `200`：

```json
{
  "accepted": true,
  "duplicate": false,
  "externalId": "classflow:lesson:123:student:101",
  "domainId": "system",
  "uid": 101,
  "startAt": "2026-10-26T02:00:00.000Z",
  "endAt": "2026-10-26T03:30:00.000Z",
  "durationHours": 1.5
}
```

返回的 `startAt`、`endAt` 使用 UTC，与请求里的北京时间指向同一时刻。返回结果不包含 Token。

相同编号、相同内容重复推送仍返回 HTTP `200`，`accepted` 为 `true`、`duplicate` 为 `true`，其余字段同上。外部平台应将其标记为成功；不会重复插入或重复增加时长。

### 错误处理

业务接口错误返回 JSON：

```json
{
  "error": "ClassTimeTokenError",
  "message": "课时同步令牌无效、已过期或已撤销。"
}
```

| HTTP 状态 | `error` | 含义 | 建议处理 |
| --- | --- | --- | --- |
| `400` | `ValidationError` | 字段、类型、内容类型不正确，包含额外字段，课程尚未结束，或 URL 中携带 `token`。 | 检查请求后再发送；课程尚未结束的，待完成后使用同一编号和内容发送。 |
| `401` | `ClassTimeTokenError` | Token 缺失、格式错误、无效、过期、停用，或请求头与 JSON 中的 Token 不一致。 | 暂停该连接并检查配置；需要时请教师重新生成。更换凭据后保留原编号和内容补发。 |
| `403` | `ClassTimeScopeError` | Token、教师权限、工作区、课堂或学员归属不符合要求。 | 停止自动重试，核对授权课堂、学员映射、加入状态和教师权限。 |
| `403` | `OpcountExceededError` | 触发接口或全站限流。 | 排队降速，等待至少 60 秒并加入随机抖动后，使用同一编号和内容重试。 |
| `409` | `ClassTimeConflictError` | 工作区已存在该 `externalId`，但内容不同。 | 转人工核对，不能自动覆盖或更换编号绕过。 |
| `500` | 未预期异常名称 | 服务暂不可用，说明为「课时同步暂不可用，请稍后重试。」。 | 保留原编号和内容，指数退避后重试。 |

当前实现限流返回 **`403 + OpcountExceededError`，不是 `429`**。默认上课接口限制为每 60 秒 120 次，还受全站每 5 秒 100 次限制。限额按服务器配置的来源 IP，或 IP 与用户组合计算，并非每个 Token 各有独立额度；共用出口 IP 的连接可能互相影响，服务器也可能配置其他限额。建议从每秒 1 次的平稳队列发送开始，避免集中并发和失败后立即重发。

网络超时、连接中断或服务错误不代表本站一定未写入。保留同一编号和原始内容重试，可以安全确认结果。对于网关等返回的非 JSON 错误，保留 HTTP 状态用于排查，不要把无法解析的响应当成成功。

## 4. 调用示例

示例中的 `<TOKEN>`、`<DOMAIN_ID>`、`<ONEBYONE_UID>` 为占位符。课堂编号应替换为 `system` 或 `C0001` 等授权值，UID 替换为本站对应学员整数。时间示例使用已完成课程日期 `2026-10-26`；正式同步使用真实上课时间。

### cURL

```bash
CLASS_SYNC_URL='https://onebyone.run/d/system/training-time/classes'
CLASS_SYNC_TOKEN='<TOKEN>'
CLASS_DOMAIN_ID='<DOMAIN_ID>'
ONEBYONE_UID='<ONEBYONE_UID>'

curl --request POST "$CLASS_SYNC_URL" \
  --header "Authorization: Bearer $CLASS_SYNC_TOKEN" \
  --header 'Content-Type: application/json' \
  --connect-timeout 10 \
  --max-time 30 \
  --data-binary @- <<JSON
{
  "externalId": "classflow:lesson:123:student:$ONEBYONE_UID",
  "domainId": "$CLASS_DOMAIN_ID",
  "uid": $ONEBYONE_UID,
  "startAt": "2026-10-26T10:00:00+08:00",
  "durationHours": 1.5,
  "title": "Python 循环课堂"
}
JSON
```

`ONEBYONE_UID` 替换后必须是整数，JSON 中不能加引号。该示例按站点提供的课堂编号构造请求；应用程序应使用 JSON 序列化库处理任意来源文本。

### Python `requests`

下面的函数执行一次发送，区分成功、可重试及需人工处理的错误。调用方应使用持久化队列安排重试。

```python
import requests

CLASS_SYNC_URL = "https://onebyone.run/d/system/training-time/classes"
CLASS_SYNC_TOKEN = "<TOKEN>"  # 正式环境从服务端配置读取


class RetryableSyncError(Exception):
    pass


def push_completed_lesson(payload):
    try:
        response = requests.post(
            CLASS_SYNC_URL,
            headers={"Authorization": f"Bearer {CLASS_SYNC_TOKEN}"},
            json=payload,
            timeout=(10, 30),
            allow_redirects=False,
        )
    except (requests.Timeout, requests.ConnectionError) as exc:
        raise RetryableSyncError("网络异常，稍后用原编号和内容重试") from exc

    try:
        result = response.json()
    except ValueError as exc:
        if response.status_code >= 500:
            raise RetryableSyncError(f"服务错误：HTTP {response.status_code}") from exc
        raise RuntimeError(f"接口未返回 JSON：HTTP {response.status_code}") from exc

    if response.status_code == 200 and result.get("accepted") is True:
        return result  # duplicate 为 true 也视为成功
    if (response.status_code == 403
            and result.get("error") == "OpcountExceededError"):
        raise RetryableSyncError("限流：至少等待 60 秒并加入随机抖动后重试")
    if response.status_code >= 500:
        raise RetryableSyncError(f"服务暂不可用：HTTP {response.status_code}")
    raise RuntimeError(
        f"同步需人工处理：HTTP {response.status_code}, "
        f"{result.get('error')}: {result.get('message')}"
    )


payload = {
    "externalId": "classflow:lesson:123:student:<EXTERNAL_STUDENT_ID>",
    "domainId": "<DOMAIN_ID>",
    "uid": int("<ONEBYONE_UID>"),
    "startAt": "2026-10-26T10:00:00+08:00",
    "durationHours": 1.5,
    "title": "Python 循环课堂",
}

# 替换全部占位符后调用；payload 和 externalId 应由外部平台持久化。
result = push_completed_lesson(payload)
```

## 5. 推荐的外部平台同步流程

1. **课后生成任务**：确认课程已结束，为每名实际上课学员生成独立记录，完成课堂编号和本站 UID 的映射。
2. **保存发送快照**：在外部平台数据库中保存固定 `externalId`、完整请求内容、同步状态、尝试次数和下次重试时间。可使用 outbox 表，与课程完成状态一并提交。
3. **后台排队发送**：工作进程取出待发送记录，使用当前有效 Token 平稳逐条调用。不要把 Token 写入日志或放到学员端页面。
4. **确认成功**：仅在 HTTP `200` 且 `accepted: true` 时标记已同步，`duplicate: true` 同样算成功。保留响应中的记录编号和时间，便于对账。
5. **分类重试**：网络异常、限流及服务暂不可用可退避重试；凭据、权限、格式或内容冲突进入待处理状态。重试仍发送同一编号和快照。
6. **抽样核对**：教师选择相同日期及课堂，查看学员详情的「同步的上课记录」，同时核对上课时长、自主训练和学习总时长。

## 6. 看板统计口径

- **上课时长**：同一学员课程时间段的并集，重复或重叠课程只计一次。
- **自主训练**：有效站内训练中位于上课时间段以外的部分。同一学员在所选不同课堂中的上课与训练也会核对重叠。
- **学习总时长**：自主训练加上课时长。例如训练 10:00—11:30、上课 10:30—12:00，结果为自主训练 30 分钟、上课 90 分钟、学习总时长 120 分钟。
- 日统计按北京时间拆分。查询日期范围时，跨边界课程只计范围内部分；课堂筛选只包含所选课堂记录。提交和通过题目继续使用站内原有计数口径。
- 不同课堂的课程也有重叠时，总量只计一次；重叠部分按课堂编号固定顺序归属到一个课堂，保证课堂分布之和等于合并总量。
- 学员详情保留原始课程。课程之间存在重叠时，单条展示时长相加可能大于合并后的上课时长。

### 历史训练数据限制

升级前的部分训练只有日汇总，没有实际发生时间段，无法准确还原与补录课程的重叠。这些历史训练保留原值，看板提示存在无法精确去重的部分。升级后的新训练保存实际计时时间段，补录课程后自动重新计算重叠。极端情况下精确时间段达到存储上限，额外训练保留为日汇总，并使用同一提示。
