# 合并后全面审计修复计划

> 审计日期：2026-03-04
> 范围：alpha.3 合并到 feat-fix 后的全面代码审计
> 状态标记：[x] 已修复 / [ ] 待修复

---

## 一、已修复的问题

### 1.1 controller/relay.go -- RelayTask 核心逻辑恢复 [x]
- 旧版 `RelayTask` + `taskRelayHandler` 替换为 alpha.3 完整实现
- 新增 `RelayTaskFetch`（fetch 路由专用入口）
- 恢复 `ResolveOriginTask` / `defer Refund` / `LockedChannel` / `addUsedChannel` / `processChannelError`
- 恢复成功后 `SettleBilling` + `LogTaskConsumption` + `InitTask` + `task.Insert()`
- 新增 `respondTaskError` 统一错误输出

### 1.2 router -- fetch 路由指向修正 [x]
- `relay-router.go`：Suno fetch 路由改为 `RelayTaskFetch`
- `video-router.go`：4 个 GET fetch 路由改为 `RelayTaskFetch`

### 1.3 service/task_polling.go:195 -- nil 指针修复 [x]
- `*ch.BaseURL` 改为 `ch.GetBaseURL()`

### 1.4 ErrorMappingEditor 前端恢复 [x]
- 从备份恢复 `ErrorMappingEditor.jsx` 组件
- `EditChannelModal.jsx` 添加 import / 初始状态 / 渲染区域

### 1.5 pass_headers 运行时头透传链路恢复 [x]
- 7 个 handler 从 `ApplyParamOverride(...)` 改回 `ApplyParamOverrideWithRelayInfo(jsonData, info)`
- 新增 `relay/param_override_error.go`（统一 param override 错误处理）
- 涉及：claude / compatible / responses / image / gemini / embedding / rerank handler

### 1.6 重试上下文字段维护 [x]
- `controller/relay.go` 重试循环中添加 `RetryIndex` / `LastError` 赋值

### 1.7 测试失败修复 [x]
- `api_request_test.go:80`：大写 key 改为小写匹配实现

### 1.8 embedding_handler.go JSON 约定修复 [x]
- `json.Marshal` -> `common.Marshal`，删除 `encoding/json` import

### 1.9 override_test.go 测试恢复 [x]
- 从 alpha.3 恢复（791 行 -> 1694 行）

---

## 二、待修复：严重/高危

### 2.1 [x] relay/relay_task.go:290 -- RelayTaskFetch 缺少 return 导致 nil panic

**问题**：`relayMode` 无效时设置了错误但没有 `return`，下一行调用 nil 函数 panic。
**修复**：第 291 行后添加 `return`。
**影响**：服务崩溃。

### 2.2 [x] controller/midjourney.go:80 -- *BaseURL 直接解引用

**问题**：`*midjourneyChannel.BaseURL` 在 BaseURL 为 nil 时 panic，导致 MJ 后台轮询协程崩溃。
**修复**：改为 `midjourneyChannel.GetBaseURL()`。
**影响**：后台协程崩溃，所有 MJ 未完成任务停止轮询。

### 2.3 [x] controller/relay.go:139 -- 敏感词检测传入 nil error

**问题**：`types.NewError(err, ...)` 中 `err` 此时为 nil，错误描述信息丢失。
**修复**：
```go
newAPIError = types.NewError(
    fmt.Errorf("sensitive words detected: %s", strings.Join(words, ", ")),
    types.ErrorCodeSensitiveWordsDetected,
)
```

### 2.4 [x] service/task_polling.go:225 -- taskM lookup 无 nil 检查

**问题**：`taskM[responseItem.TaskID]` 可能返回 nil（上游返回意外 ID），后续访问 panic。
**修复**：添加 `if task == nil { continue }` 检查。

### 2.5 [x] service/task_polling.go:238 -- Suno 退款缺 CAS 保护（双重退款风险）

**问题**：退款在 `task.Update()` 之前执行，且用非原子 `Update()` 而非 `UpdateWithStatus()`。两个轮询周期并发时可能重复退款。
**修复**：参照视频任务（第474-500行），改用 `UpdateWithStatus` + CAS 保护，退款放在 CAS 成功之后。

### 2.6 [x] service/task_polling.go:170-188 / 306-323 -- 渠道获取失败无退款

**问题**：Suno 和 Video 轮询中渠道获取失败时，任务标记 FAILURE 但没有调用 `RefundTaskQuota`。
**修复**：在标记 FAILURE 前遍历任务调用 `RefundTaskQuota`。

### 2.7 [x] service/task_polling.go:119-128 -- 空 upstream_task_id 任务无退款

**问题**：没有 `upstream_task_id` 的任务批量标记 FAILURE，但没有退款。
**修复**：添加退款逻辑。

### 2.8 [x] common/custom-event.go -- sync.Mutex 值拷贝（go vet 报错）

**问题**：`CustomEvent` 结构体包含 `sync.Mutex`，`Render` 和 `WriteContentType` 以值接收者调用，导致锁被拷贝。
**修复**：将接收者改为 `*CustomEvent`，`encode` 参数改为 `*CustomEvent`。
**影响**：并发场景下锁机制失效。

### 2.9 [x] model/subscription.go -- 订阅退款跨事务提交导致双重退款风险

**问题**：`RefundSubscriptionPreConsume` 在事务中调用 `PostConsumeUserSubscriptionDelta`（独立事务），存在“额度已退但状态未更新”窗口。
**修复**：新增 `postConsumeUserSubscriptionDeltaTx(tx, ...)`，退款路径复用同一事务。

### 2.10 [x] middleware/auth.go -- TokenAuthReadOnly 放行失效令牌

**问题**：只读鉴权仅检查 key 存在，未检查状态/过期/额度。
**修复**：改用 `model.ValidateUserToken` 执行完整 token 有效性校验。

---

## 三、待修复：中危

### 3.1 [x] controller/relay.go:560 -- SettleBilling 失败资金不一致

**问题**：`SettleBilling` 失败仅打日志，`taskErr` 仍为 nil，defer Refund 不触发。预扣费既未结算也未退还。
**修复方案**：SettleBilling 失败时手动调用 `relayInfo.Billing.Refund(c)` 或设置 taskErr。

### 3.2 [x] controller/relay.go:581 -- task.Insert() 失败无补偿

**问题**：任务入库失败仅打日志，已计费但不入库，导致轮询无法跟踪、后续无法退款。
**修复方案**：Insert 失败时触发退款。

### 3.3 [x] controller/midjourney.go:92-119 -- 资源泄漏

**问题**：错误路径上 `cancel()` 和 `resp.Body.Close()` 未调用。
**修复**：使用 `defer cancel()` 和 `defer resp.Body.Close()` 模式。

### 3.4 [x] model/task.go:190 -- InitTask nil 保护不一致

**问题**：第175行检查了 `relayInfo != nil`，但第190行不在保护范围内。
**修复**：统一 nil 保护范围或添加早返回。

### 3.5 [x] model/channel.go:863 -- GetSetting/GetOtherSettings 有写副作用

**问题**：getter 方法在反序列化失败时自动清空数据并写库，可能导致数据丢失。
**修复**：移除 getter 中的数据库写入，仅记录日志返回空值。

### 3.6 [x] middleware/auth.go:104,112,120 -- session 值直接类型断言

**问题**：`status.(int)` / `role.(int)` 直接断言，session 数据异常时 panic。
**修复**：使用 comma-ok 模式安全断言。

---

## 四、待修复：低危

### 4.1 [x] 12 个 adaptor 文件 -- `panic("implement me")` 不可达代码

**问题**：`ConvertClaudeRequest` 桩实现使用 `panic`，运行时被调用会崩溃。go vet 报不可达代码。
**修复**：统一改为 `return nil, errors.New("not implemented")`。

### 4.2 [x] router/video-router.go -- 缺少 SystemPerformanceCheck 中间件

**问题**：Video / Kling / Jimeng 路由组未注册性能检查中间件。
**修复**：添加 `.Use(middleware.SystemPerformanceCheck())`。

### 4.3 [x] router -- Video / Suno 路由缺少 ModelRequestRateLimit

**问题**：仅 relayV1 和 gemini 路由有模型级限流，Suno / Video 等缺失。
**修复**：在相关路由组添加 `ModelRequestRateLimit` 中间件。

### 4.4 [x] controller/midjourney.go:122 -- taskM MjId lookup 无 nil 检查

### 4.5 [x] controller/midjourney.go:212/224 -- FinishTime 重复比较（死代码）

### 4.6 [x] relay/audio_handler.go -- 唯一未调用 ApplyParamOverrideWithRelayInfo 的 handler

**修复**：在 `AudioHelper` 中对 `dto.AudioRequest` 执行 `ApplyParamOverrideWithRelayInfo`，并复用统一错误映射。

---

## 五、待修复：规范化（encoding/json 迁移）

项目 Rule 1 要求所有 JSON 操作使用 `common.Marshal`/`common.Unmarshal`。
当前全项目约有 **298 处**直接使用 `encoding/json`，以下为按优先级排列的主要区域：

### 5.1 核心业务代码（建议尽快迁移）
- [x] `controller/midjourney.go` -- 6 处
- [x] `relay/mjproxy_handler.go` -- 8 处
- [x] `relay/helper/model_mapped.go` -- 1 处
- [x] `relay/helper/valid_request.go` -- 1 处
- [x] `service/midjourney.go` -- 4 处
- [x] `service/convert.go` -- 4 处
- [x] `service/webhook.go` -- 1 处
- [x] `service/user_notify.go` -- 1 处
- [x] `service/download.go` -- 1 处
- [x] `middleware/kling_adapter.go` -- 1 处
- [x] `middleware/jimeng_adapter.go` -- 1 处
- [x] `middleware/turnstile-check.go` -- 1 处

### 5.2 model 层（建议逐步迁移）
- [x] `model/channel.go` -- 1 处
- [x] `model/user.go` -- 3 处
- [x] `model/passkey.go` -- 2 处
- [x] `model/pricing.go` -- 2 处
- [x] `model/prefill_group.go` -- 1 处

### 5.3 其他区域（可后续迁移）
- [x] `controller/` 其他文件 -- ~15 处
- [x] `service/codex_oauth.go` -- 3 处
- [x] `service/passkey/session.go` -- 3 处
- [x] `oauth/` 目录 -- 5 个文件
- [x] `setting/` 目录 -- 多处
- [x] `dto/` 目录 -- 多处
- [x] `relay/channel/` 目录剩余调用 -- 全量迁移
- [x] `pkg/ionet` / `pkg/cachex` -- 全量迁移

> 说明：当前仓库仅 `common/json.go` 保留标准库 `encoding/json` 调用，作为统一封装入口。

---

## 六、测试覆盖恢复

### 已恢复
- [x] `relay/common/override_test.go` -- 791 -> 1694 行

### 待恢复（10 个文件，共 2334 行）
- [x] `dto/gemini_generation_config_test.go` (89 行)
- [x] `dto/openai_request_zero_value_test.go` (73 行)
- [x] `model/task_cas_test.go` (217 行)
- [x] `relay/channel/aws/relay_aws_test.go` (55 行)
- [x] `relay/channel/gemini/relay_gemini_usage_test.go` (333 行)
- [x] `relay/common/relay_info_test.go` (40 行)
- [x] `relay/helper/stream_scanner_test.go` (521 行)
- [x] `service/channel_affinity_template_test.go` (187 行)
- [x] `service/channel_affinity_usage_cache_test.go` (105 行)
- [x] `service/task_billing_test.go` (714 行)

> 恢复方法：从 alpha.3 复制并验证编译通过。

---

## 七、执行优先级

1. **P0（立即）**：2.1, 2.2, 2.4, 2.5, 2.8 -- 会导致服务崩溃或资金损失
2. **P1（尽快）**：2.3, 2.6, 2.7, 3.1, 3.2 -- 功能缺陷或资金不一致
3. **P2（计划）**：3.3-3.6, 4.1-4.6, 六（测试恢复）-- 防御性编程改进
4. **P3（逐步）**：五（encoding/json 迁移）-- 规范化，不影响功能
