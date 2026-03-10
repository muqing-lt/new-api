# 自定义功能文档

> 本文档记录了 `new-api-feat-fix` 分支中所有自定义功能的详细实现，包含路由、文件、修改内容和实现方式，方便后续合并到主分支。

---

## 目录

1. [自定义邀请码](#1-自定义邀请码)
2. [渠道透传请求头 (Header Override)](#2-渠道透传请求头-header-override)
3. [用户协议 (用户协议 + 隐私政策)](#3-用户协议-用户协议--隐私政策)
4. [错误信息复写 (Error Mapping)](#4-错误信息复写-error-mapping)
5. [分组监控 (Group Monitoring)](#5-分组监控-group-monitoring)
6. [邀请返利 (Affiliate Commission)](#6-邀请返利-affiliate-commission)

---

## 1. 自定义邀请码

### 功能概述

允许用户自定义 4-8 位字母数字邀请码（自动转大写），替代系统自动生成的邀请码。前端提供独立的编辑按钮和模态框，修复了遮罩层相关 bug。

### API 路由

| 方法 | 路径 | 说明 |
|------|------|------|
| `PUT` | `/api/user/aff` | 更新自定义邀请码 |

**请求体：**
```json
{"aff_code": "ABCD"}
```

**响应：** 成功返回 `{"success": true, "message": ""}`，失败返回对应错误信息。

### 后端文件

#### `model/user.go`

**数据模型变更 — User 结构体新增字段（第42行）：**
```go
AffCode string `json:"aff_code" gorm:"type:varchar(32);column:aff_code;uniqueIndex"`
```

**新增函数：**

| 函数 | 行号 | 说明 |
|------|------|------|
| `ValidateAffCode(code string) (string, error)` | 315 | 校验邀请码格式：4-8位字母数字，返回大写形式 |
| `IsAffCodeExists(code string) (bool, error)` | 328 | 检查邀请码是否已被其他用户使用（唯一性校验） |
| `UpdateUserAffCode(userId int, code string) error` | 336 | 更新用户的邀请码到数据库 |
| `generateUniqueAffCode() string` | 592 | 自动生成 6-8 位大写字母数字邀请码（注册时使用） |

**ValidateAffCode 校验规则：**
- 长度：4-8 位
- 字符：仅允许字母（a-z, A-Z）和数字（0-9）
- 输出：自动转为大写

#### `controller/user.go`（第388-425行）

**新增控制器函数 `UpdateAffCode()`：**

```go
type UpdateAffCodeRequest struct {
    AffCode string `json:"aff_code"`
}
```

处理流程：
1. 解析请求体 `UpdateAffCodeRequest`
2. 调用 `ValidateAffCode()` 校验格式
3. 调用 `IsAffCodeExists()` 检查唯一性
4. 调用 `UpdateUserAffCode()` 更新数据库
5. 返回成功/失败响应

#### `router/api-router.go`（第84行）

```go
selfRoute.PUT("/aff", controller.UpdateAffCode)
```

注册在 `selfRoute` 分组下，需要用户认证（UserAuth 中间件）。

### 前端文件

#### `web/src/components/topup/modals/EditAffCodeModal.jsx`

自定义邀请码编辑模态框组件：
- 4-8 位字母数字输入框，输入自动转大写
- `maskClosable={false}` — 点击遮罩层不关闭（修复遮罩层 bug）
- `centered` — 模态框居中显示
- 调用 `PUT /api/user/aff` 提交更新

#### `web/src/components/table/invitation/InvitationColumnDefs.jsx`

邀请表格列定义组件：
- 包含邀请码显示列
- 操作列中含独立的"自定义邀请码"按钮

#### `web/src/components/topup/InviteeListCard.jsx`

个人邀请记录预览卡片，展示被邀请人简要信息。

### 数据库变更

```sql
ALTER TABLE users ADD COLUMN aff_code VARCHAR(32) UNIQUE;
```

> 注：通过 GORM AutoMigrate 自动迁移。

---

## 2. 渠道透传请求头 (Header Override)

### 功能概述

通过渠道配置 JSON 规则，在请求转发到上游 API 时对 HTTP 请求头进行透传、设置、删除、复制、移动等操作。支持 5 种 Header 操作模式。

### 操作模式

| 模式 | 说明 |
|------|------|
| `set_header` | 设置/覆盖指定请求头的值 |
| `delete_header` | 删除指定请求头 |
| `copy_header` | 复制一个请求头的值到另一个请求头 |
| `move_header` | 移动请求头（复制后删除原始） |
| `pass_headers` | 将客户端请求中的指定请求头透传到上游 |

### 配置格式

通过渠道的 `header_override` 字段配置，值为 JSON 格式：

```json
{
  "operations": [
    {
      "mode": "set_header",
      "path": "X-Custom-Header",
      "value": "custom-value"
    },
    {
      "mode": "pass_headers",
      "value": ["Authorization", "X-Request-Id"]
    },
    {
      "mode": "delete_header",
      "path": "X-Unwanted-Header"
    },
    {
      "mode": "copy_header",
      "from": "X-Source-Header",
      "to": "X-Target-Header"
    },
    {
      "mode": "move_header",
      "from": "X-Old-Name",
      "to": "X-New-Name"
    }
  ]
}
```

### 后端文件

#### `model/channel.go`（第50行）

**数据模型变更 — Channel 结构体新增字段：**
```go
HeaderOverride *string `json:"header_override" gorm:"type:text"`
```

**新增方法（第914行）：**
```go
func (channel *Channel) GetHeaderOverride() map[string]interface{}
```
解析 `header_override` JSON 字段为 Go map。

#### `relay/common/override.go`

核心实现文件，定义操作结构体和执行逻辑：

**`ParamOperation` 结构体（第35行）：**
```go
type ParamOperation struct {
    Path       string               `json:"path"`
    Mode       string               `json:"mode"`   // set_header, delete_header, copy_header, move_header, pass_headers 等
    Value      interface{}          `json:"value"`
    KeepOrigin bool                 `json:"keep_origin"`
    From       string               `json:"from,omitempty"`
    To         string               `json:"to,omitempty"`
    Conditions []ConditionOperation `json:"conditions,omitempty"`
    Logic      string               `json:"logic,omitempty"` // AND, OR（默认OR）
}
```

支持条件执行（`Conditions`），可基于请求 JSON 路径的值进行条件判断后再执行 Header 操作。

**`ConditionOperation` 结构体：**
```go
type ConditionOperation struct {
    Path           string      `json:"path"`
    Mode           string      `json:"mode"`   // full, prefix, suffix, contains, gt, gte, lt, lte
    Value          interface{} `json:"value"`
    Invert         bool        `json:"invert"`
    PassMissingKey bool        `json:"pass_missing_key"`
}
```

#### `relay/common/relay_info.go`

`RelayInfo` 结构体中新增字段：
- `HeadersOverride`（第72行） — 存储渠道配置的 Header Override 规则
- `RuntimeHeadersOverride`（第150行） — 运行时动态 Header Override
- `UseRuntimeHeadersOverride`（第151行） — 是否使用运行时 Override

#### `relay/channel/api_request.go`（第127-363行）

请求发送逻辑中集成 HeaderOverride 处理：

| 函数 | 说明 |
|------|------|
| `applyHeaderOverridePlaceholders()` | 替换 Header 值中的占位符变量 |
| `processHeaderOverride()` | 处理单个 HeaderOverride 操作 |
| `ResolveHeaderOverride()` | 解析并执行所有 HeaderOverride 规则 |
| `applyHeaderOverrideToRequest()` | 将处理后的 Header 应用到实际 HTTP 请求 |

### 前端文件

#### `web/src/components/table/channels/modals/EditTagModal.jsx`

渠道编辑模态框中的 Header Override 配置区域，提供 JSON 编辑界面。

### 数据库变更

```sql
ALTER TABLE channels ADD COLUMN header_override TEXT;
```

---

## 3. 用户协议 (用户协议 + 隐私政策)

### 功能概述

支持配置用户协议和隐私政策内容，注册时强制用户勾选同意才能完成注册。提供独立的协议展示页面。

### API 路由

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/user-agreement` | 获取用户协议内容 |
| `GET` | `/api/privacy-policy` | 获取隐私政策内容 |
| `GET` | `/api/status` | 状态接口增加 `user_agreement_enabled` 和 `privacy_policy_enabled` 标志 |

### 后端文件

#### `setting/system_setting/legal.go`

**新增配置结构体：**
```go
type LegalSettings struct {
    UserAgreement string `json:"user_agreement"`
    PrivacyPolicy string `json:"privacy_policy"`
}
```

提供 `GetLegalSettings()` 函数获取配置。

#### `controller/misc.go`（第189行）

**新增控制器函数：**
- `GetUserAgreement()` — 返回用户协议内容
- `GetPrivacyPolicy()` — 返回隐私政策内容

`/api/status` 接口返回值中新增：
- `user_agreement_enabled` (bool) — 是否启用用户协议
- `privacy_policy_enabled` (bool) — 是否启用隐私政策

#### `router/api-router.go`（第28行）

```go
apiRouter.GET("/user-agreement", controller.GetUserAgreement)
apiRouter.GET("/privacy-policy", controller.GetPrivacyPolicy)
```

注册在公开路由分组，无需认证。

### 前端文件

#### `web/src/pages/UserAgreement/index.jsx`

用户协议独立展示页面，渲染后端返回的协议内容。

#### `web/src/components/auth/RegisterForm.jsx`

注册表单中新增：
- 协议确认复选框（"我已阅读并同意用户协议和隐私政策"）
- 未勾选时禁用注册按钮
- 根据 `/api/status` 返回的 `user_agreement_enabled` / `privacy_policy_enabled` 标志动态显示

---

## 4. 错误信息复写 (Error Mapping)

### 功能概述

允许在渠道级别配置错误信息映射规则，当上游 API 返回错误时，根据匹配规则替换错误消息、错误类型和错误码。支持 4 种匹配模式和可视化编辑器。

### 配置方式

通过渠道编辑页面中的 `error_mapping` 字段配置，值为 JSON 格式。

### 配置格式

```json
{
  "patterns": [
    {
      "match": "rate limit exceeded",
      "match_type": "contains",
      "replace_message": "当前渠道繁忙，请稍后重试",
      "replace_type": "server_error",
      "replace_code": "503"
    },
    {
      "match": "insufficient_quota",
      "match_type": "exact_type",
      "replace_message": "渠道额度不足"
    },
    {
      "match": "context_length_exceeded|max_tokens",
      "match_type": "regex",
      "replace_message": "请求内容过长，请减少输入"
    }
  ]
}
```

### 匹配模式

| match_type | 说明 |
|------------|------|
| `contains` | 不区分大小写的子串匹配（默认模式） |
| `regex` | 正则表达式匹配 |
| `exact_code` | 精确匹配错误码 |
| `exact_type` | 精确匹配错误类型 |

### 替换字段

| 字段 | 说明 |
|------|------|
| `replace_message` | 替换错误消息文本 |
| `replace_type` | 替换错误类型 |
| `replace_code` | 替换错误码 |

匹配采用 **first-match** 语义，即命中第一条规则后停止匹配。

### 后端文件

#### `model/channel.go`（第43行）

**数据模型变更 — Channel 结构体新增字段：**
```go
ErrorMapping *string `json:"error_mapping" gorm:"type:text"`
```

**新增方法：**
```go
func (channel *Channel) GetErrorMapping() string
```

#### `service/error.go`（第192-288行）

**核心数据结构：**

```go
// 单条匹配规则
type ErrorMappingPattern struct {
    Match          string `json:"match"`           // 匹配值
    MatchType      string `json:"match_type"`      // contains / regex / exact_code / exact_type
    ReplaceMessage string `json:"replace_message"` // 替换消息
    ReplaceType    string `json:"replace_type"`    // 替换类型
    ReplaceCode    string `json:"replace_code"`    // 替换错误码
}

// 配置容器
type ErrorMappingConfig struct {
    Patterns []ErrorMappingPattern `json:"patterns"`
}
```

**核心函数：**

| 函数 | 说明 |
|------|------|
| `ApplyErrorMapping(newApiErr *types.NewAPIError, errorMappingStr string)` | 主入口：解析配置 → 提取上游错误信息 → 匹配 → 替换 |
| `matchesPattern(pattern ErrorMappingPattern, message, errType, errCode string) bool` | 根据 match_type 执行匹配判断 |
| `applyReplacements(...)` | 应用替换：修改 message/type/code 字段 |

**支持的上游错误格式：**
- OpenAI 格式（`error.message`, `error.type`, `error.code`）
- Claude 格式（`error.message`, `error.type`）

#### 调用 `ApplyErrorMapping` 的 Relay Handler 文件（共10个）

| 文件路径 | 说明 |
|---------|------|
| `relay/channel/audio_handler.go` | 音频处理 |
| `relay/channel/embedding_handler.go` | 嵌入处理 |
| `relay/channel/rerank_handler.go` | 重排序处理 |
| `relay/channel/compatible_handler.go` | 兼容模式处理 |
| `relay/channel/gemini_handler.go` | Gemini 模型处理 |
| `relay/channel/image_handler.go` | 图片处理 |
| `relay/channel/responses_handler.go` | Responses API 处理 |
| `relay/channel/claude_handler.go` | Claude 模型处理 |
| `relay/channel/chat_completions_via_responses.go` | 通过 Responses 实现的 Chat Completions |
| `relay/channel/websocket.go` | WebSocket 处理 |

### 前端文件

#### `web/src/components/common/ui/ErrorMappingEditor.jsx`

错误映射可视化编辑器：
- **双模式切换**：可视化模式（表单式编辑）和手动模式（JSON 编辑）
- **可视化模式**：每条规则可配置 match、match_type、replace_message、replace_type、replace_code
- **内置模板**：提供常见错误映射模板，一键填充

#### `web/src/components/table/channels/modals/EditChannelModal.jsx`

渠道编辑模态框中集成 `ErrorMappingEditor` 组件。

### 数据库变更

```sql
ALTER TABLE channels ADD COLUMN error_mapping TEXT;
```

---

## 5. 分组监控 (Group Monitoring)

### 功能概述

实时监控 API 分组的可用率、缓存命中率、响应时间等指标。提供管理员监控仪表盘和公开监控页面，支持按分组查看渠道级别详情、历史趋势图表，60 秒自动刷新。

### API 路由

#### 管理员路由（需 AdminAuth）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/monitoring/admin/groups` | 获取所有分组监控统计 |
| `GET` | `/api/monitoring/admin/groups/:group` | 获取分组详情 + 渠道列表 |
| `GET` | `/api/monitoring/admin/groups/:group/history` | 获取历史图表数据 |
| `POST` | `/api/monitoring/admin/refresh` | 手动刷新监控数据（含频率限制） |
| `DELETE` | `/api/monitoring/admin/groups/:group/records` | 删除分组监控记录 |

#### 公开路由（TryUserAuth）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/monitoring/public/groups` | 公开获取分组列表（脱敏） |
| `GET` | `/api/monitoring/public/groups/:group/history` | 公开获取历史数据 |

### 后端文件

#### `controller/group_monitoring.go`

7 个控制器函数：

| 函数 | 路由 | 说明 |
|------|------|------|
| `GetAdminMonitoringGroups` | GET `/monitoring/admin/groups` | 管理员获取所有分组监控统计 |
| `GetAdminMonitoringGroupDetail` | GET `/monitoring/admin/groups/:group` | 管理员获取单分组详情 + 渠道列表 |
| `GetAdminMonitoringGroupHistory` | GET `/monitoring/admin/groups/:group/history` | 管理员获取历史图表数据 |
| `RefreshMonitoringData` | POST `/monitoring/admin/refresh` | 触发立即重新聚合 |
| `DeleteMonitoringGroupRecords` | DELETE `/monitoring/admin/groups/:group/records` | 清空分组监控数据 |
| `GetPublicMonitoringGroups` | GET `/monitoring/public/groups` | 公开分组监控（脱敏） |
| `GetPublicMonitoringGroupHistory` | GET `/monitoring/public/groups/:group/history` | 公开历史图表数据 |

#### `model/group_monitoring.go`

**核心数据结构：**

```go
// RequestStat — 日志预聚合表（5分钟桶）
type RequestStat struct {
    BucketStart       int64   // 时间桶起点（Unix 时间戳）
    GroupName         string  // 分组名称
    ChannelId         int     // 渠道 ID
    ModelName         string  // 模型名称
    TotalRequests     int     // 总请求数
    SuccessRequests   int     // 成功请求数
    ErrorRequests     int     // 错误请求数
    TotalCacheTokens  int64   // 缓存 Token 数
    TotalPromptTokens int64   // Prompt Token 数
    CacheDataPoints   int     // 缓存数据点数
    SumResponseTime   int64   // 总响应时间
}

// ChannelMonitoringStat — 渠道级快照
type ChannelMonitoringStat struct {
    GroupName        string
    ChannelId        int
    ChannelName      string   // gorm:"-" 运行时填充
    ChannelStatus    int      // gorm:"-" 运行时填充
    AvailabilityRate float64  // 可用率，-1 表示无数据
    CacheHitRate     float64  // 缓存命中率
    LastResponseTime int      // 最近响应时间
    LastFRT          int      // 最近首 Token 时间
    LastTestTime     int64    // 最近测试时间
    LastTestModel    string   // 最近测试模型
    IsOnline         bool     // 是否在线
    UpdatedAt        int64
}

// GroupMonitoringStat — 分组级快照
type GroupMonitoringStat struct {
    GroupName        string
    AvailabilityRate float64  // 分组可用率
    CacheHitRate     float64  // 分组缓存命中率
    AvgResponseTime  int      // 平均响应时间
    AvgFRT           int      // 平均首 Token 时间
    OnlineChannels   int      // 在线渠道数
    TotalChannels    int      // 总渠道数
    GroupRatio       float64  // 分组权重
    LastTestModel    string
    UpdatedAt        int64
}

// MonitoringHistory — 时间线数据（供图表绘制）
type MonitoringHistory struct {
    GroupName        string
    AvailabilityRate float64
    CacheHitRate     float64
    RecordedAt       int64
}
```

#### `setting/operation_setting/group_monitoring_setting.go`

**配置结构体：**
```go
type GroupMonitoringSetting struct {
    MonitoringGroups            []string `json:"monitoring_groups"`              // 监控的分组列表
    AvailabilityPeriodMinutes   int      `json:"availability_period_minutes"`    // 可用率计算窗口（默认60分钟）
    CacheHitPeriodMinutes       int      `json:"cache_hit_period_minutes"`       // 缓存命中率计算窗口（默认60分钟）
    AvailabilityExcludeModels   []string `json:"availability_exclude_models"`    // 可用率排除的模型
    CacheHitExcludeModels       []string `json:"cache_hit_exclude_models"`       // 缓存命中率排除的模型
    AvailabilityExcludeKeywords []string `json:"availability_exclude_keywords"`  // 可用率排除的关键词
    GroupDisplayOrder           []string `json:"group_display_order"`            // 分组展示排序
    AggregationIntervalMinutes  int      `json:"aggregation_interval_minutes"`   // 聚合间隔（默认5分钟）
    CacheTokensSeparateGroups   []string `json:"cache_tokens_separate_groups"`   // prompt_tokens 不含 cache_tokens 的分组（如 Anthropic）
}
```

通过 `config.GlobalConfig.Register("group_monitoring_setting", &groupMonitoringSetting)` 注册为动态配置。

#### `common/constants.go`（第113行）

```go
var GroupMonitoringBasePrice float64 = 2 // 分组监控基础价格
```

#### `model/option.go`（第516行附近）

动态配置处理：
```go
case "GroupMonitoringBasePrice":
    common.GroupMonitoringBasePrice, _ = strconv.ParseFloat(value, 64)
```

#### `router/api-router.go`（第381-396行）

```go
// 管理员监控路由（AdminAuth 中间件）
monitoringAdminRoute.GET("/groups", controller.GetAdminMonitoringGroups)
monitoringAdminRoute.GET("/groups/:group", controller.GetAdminMonitoringGroupDetail)
monitoringAdminRoute.GET("/groups/:group/history", controller.GetAdminMonitoringGroupHistory)
monitoringAdminRoute.POST("/refresh", middleware.CriticalRateLimit(), controller.RefreshMonitoringData)
monitoringAdminRoute.DELETE("/groups/:group/records", controller.DeleteMonitoringGroupRecords)

// 公开监控路由（TryUserAuth 中间件）
monitoringPublicRoute.GET("/groups", controller.GetPublicMonitoringGroups)
monitoringPublicRoute.GET("/groups/:group/history", controller.GetPublicMonitoringGroupHistory)
```

### 前端文件

#### `web/src/pages/GroupMonitoring/index.jsx`

监控页面入口，路由组件。

#### `web/src/components/monitoring/GroupMonitoringDashboard.jsx`

监控仪表盘主组件：
- 分组状态卡片网格展示
- 在线/离线渠道统计
- **60 秒自动刷新**
- 手动刷新按钮

#### `web/src/components/monitoring/GroupDetailPanel.jsx`

分组详情侧面板：
- 可用率 / 缓存命中率折线图表
- 渠道详细统计表格（渠道名、状态、可用率、响应时间等）

#### `web/src/components/monitoring/GroupStatusCard.jsx`

分组状态卡片组件：
- 显示分组名称、可用率、在线渠道数/总渠道数
- 状态颜色指示（绿色/黄色/红色）

#### `web/src/components/monitoring/AvailabilityCacheChart.jsx`

可用率和缓存命中率图表组件，基于 `MonitoringHistory` 数据绘制时间线折线图。

#### `web/src/pages/Setting/Operation/SettingsGroupMonitoring.jsx`

管理员配置页面：
- 配置监控分组列表
- 设置计算窗口、聚合间隔
- 排除模型/关键词配置
- 分组展示排序

---

## 6. 邀请返利 (Affiliate Commission)

### 功能概述

完整的邀请返利系统，支持：
- 用户通过邀请链接邀请新用户注册
- 被邀请人消费时，邀请人获得按比例的额度返利
- **阶梯返佣**：根据邀请人历史累计返佣额度，自动提升返佣比例
- 邀请仪表盘展示返佣进度、当前阶梯、下一阶梯目标
- 管理员后台查看所有用户邀请关系和返佣记录

### API 路由

#### 用户路由（需 UserAuth）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/user/aff` | 获取邀请码 |
| `PUT` | `/api/user/aff` | 更新自定义邀请码 |
| `GET` | `/api/user/aff/dashboard` | 获取邀请仪表盘（含阶梯返佣进度） |
| `GET` | `/api/user/aff/invitees` | 获取被邀请人列表 |
| `POST` | `/api/user/aff_transfer` | 划转邀请收益到余额 |

#### 管理员路由（需 AdminAuth）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/user/aff/list` | 获取所有用户邀请信息 |
| `GET` | `/api/user/aff/:id/invitees` | 获取某用户的被邀请人 |
| `GET` | `/api/user/aff/:id/records` | 获取某用户的返佣记录 |

### 后端文件

#### `model/user.go`

**数据模型变更 — User 结构体邀请相关字段（第42行起）：**

```go
AffCode         string `json:"aff_code" gorm:"type:varchar(32);column:aff_code;uniqueIndex"`
AffCount        int    `json:"aff_count" gorm:"type:int;default:0;column:aff_count"`            // 邀请人数
AffQuota        int    `json:"aff_quota" gorm:"type:int;default:0;column:aff_quota"`             // 待提现返佣额度
AffHistoryQuota int    `json:"aff_history_quota" gorm:"type:int;default:0;column:aff_history"`   // 历史累计返佣额度
InviterId       int    `json:"inviter_id" gorm:"type:int;column:inviter_id;index"`               // 邀请人 ID
```

**阶梯返佣结构体（第375行）：**
```go
type AffCommissionTier struct {
    Threshold int `json:"threshold"` // 累计收益阈值
    Rate      int `json:"rate"`      // 返佣比例（百分比）
}
```

**核心函数：**

| 函数 | 行号 | 说明 |
|------|------|------|
| `inviteUser()` | - | 注册时建立邀请关系 |
| `TransferAffQuotaToQuota()` | - | 将 AffQuota 划转到用户可用余额 |
| `GetAffCommissionRate(affHistoryQuota int) int` | 443 | 根据历史累计返佣额度匹配阶梯，返回当前返佣比例 |
| `AddAffCommission(userId int, consumeQuota int)` | 469 | 消费返佣核心：计算返佣金额并分配给邀请人 |

**GetAffCommissionRate 逻辑：**
1. 读取默认返佣比例 `common.AffCommissionRate`（默认 5%）
2. 解析阶梯配置 `common.AffCommissionTiers`
3. 从高到低匹配阶梯：历史额度 >= 阶梯阈值时，使用该阶梯的返佣比例
4. 未匹配任何阶梯则使用默认比例

**AddAffCommission 逻辑：**
1. 检查 `AffCommissionEnabled` 开关
2. 查找消费用户的邀请人（InviterId）
3. 获取邀请人的 AffHistoryQuota，计算当前阶梯返佣比例
4. 计算返佣金额：`commission = consumeQuota * rate / 100`
5. 事务操作：
   - 更新邀请人的 `aff_quota += commission` 和 `aff_history += commission`
   - 创建返佣记录 `aff_commission_records`

#### `model/aff_commission_record.go`

**返佣记录结构体：**
```go
type AffCommissionRecord struct {
    Id           int   `json:"id" gorm:"primaryKey"`
    InviterId    int   `json:"inviter_id" gorm:"type:int;index"`
    InviteeId    int   `json:"invitee_id" gorm:"type:int;index"`
    Commission   int   `json:"commission" gorm:"type:int"`      // 返佣金额
    ConsumeQuota int   `json:"consume_quota" gorm:"type:int"`   // 消费金额
    Rate         int   `json:"rate" gorm:"type:int"`            // 返佣比例
    CreatedAt    int64 `json:"created_at" gorm:"bigint"`
}
```

**仪表盘 DTO：**
```go
type AffDashboard struct {
    CommissionEnabled bool                `json:"commission_enabled"`  // 返佣功能是否启用
    CurrentRate       int                 `json:"current_rate"`        // 当前返佣比例
    DefaultRate       int                 `json:"default_rate"`        // 默认返佣比例
    Tiers             []AffCommissionTier `json:"tiers"`               // 阶梯配置
    CurrentTier       *AffCommissionTier  `json:"current_tier"`        // 当前所在阶梯
    NextTier          *AffCommissionTier  `json:"next_tier"`           // 下一阶梯目标
    Progress          float64             `json:"progress"`            // 到下一阶梯的进度
    Remaining         int                 `json:"remaining"`           // 距下一阶梯剩余额度
    AffHistoryQuota   int                 `json:"aff_history_quota"`   // 历史累计返佣
}
```

**主要函数：**

| 函数 | 说明 |
|------|------|
| `GetAffDashboard(inviterId int)` | 返回返佣配置 + 阶梯 + 进度信息 |
| `GetInviteeList(inviterId, page, pageSize int)` | 分页查询被邀请用户（用户名脱敏） |
| `GetAdminAffUsers(keyword, page, pageSize)` | 管理员查询邀请关系用户列表 |
| `GetAdminInviteeList(inviterId, page, pageSize)` | 管理员查看某用户邀请的所有人（不脱敏） |
| `GetAdminCommissionRecords(inviterId, page, pageSize)` | 管理员查看返佣明细 |
| `CreateAffCommissionRecord(...)` | 创建返佣记录 |

#### `common/constants.go`（第110-112行）

```go
var AffCommissionEnabled = false   // 消费返佣功能开关（默认关闭）
var AffCommissionRate = 5          // 默认返佣比例 5%
var AffCommissionTiers = ""        // 阶梯返佣 JSON，格式: [{"threshold":10000,"rate":10},{"threshold":50000,"rate":15}]
```

#### `model/option.go`

动态配置处理（支持运行时修改）：
```go
case "AffCommissionEnabled":  // 验证 bool 类型
case "AffCommissionRate":     // 验证 0-100 整数
case "AffCommissionTiers":    // 调用 NormalizeAffCommissionTiersJSON 验证 + 去重排序
```

#### `controller/user.go`

| 函数 | 说明 |
|------|------|
| `GetAffCode()` | 获取当前用户邀请码 |
| `TransferAffQuota()` | 划转邀请收益到可用余额 |
| `GetAffDashboard()` | 获取邀请仪表盘数据 |
| `GetAffInvitees()` | 获取被邀请人列表 |

#### `controller/oauth.go`

OAuth 登录流程中捕获 `aff` 参数：
1. 读取 URL 中的 `aff` 查询参数
2. 写入 Session 保存
3. 新用户注册时从 Session 读取 `aff`
4. 通过 `GetUserIdByAffCode()` 解析邀请人 ID
5. 建立邀请关系

#### `router/api-router.go`（第83-97行）

```go
// 用户邀请路由（UserAuth）
selfRoute.GET("/aff", controller.GetAffCode)
selfRoute.PUT("/aff", controller.UpdateAffCode)
selfRoute.GET("/aff/dashboard", controller.GetAffDashboard)
selfRoute.GET("/aff/invitees", controller.GetAffInvitees)
selfRoute.GET("/self/aff/dashboard", controller.GetAffDashboard)    // 兼容路径
selfRoute.GET("/self/aff/invitees", controller.GetAffInvitees)      // 兼容路径
selfRoute.POST("/aff_transfer", controller.TransferAffQuota)
```

### 前端文件

#### `web/src/pages/Invitation/index.jsx`

邀请页面入口组件。

#### `web/src/components/topup/InvitationCard.jsx`

邀请信息总览卡片：
- 待提现收益 / 历史总收益 / 邀请人数展示
- 邀请链接一键复制
- 划转收益按钮

#### `web/src/components/topup/InviteeListCard.jsx`

邀请记录预览卡片，展示最近 3 条被邀请人记录。

#### `web/src/components/topup/modals/InviteeListModal.jsx`

全部被邀请人列表模态框，支持分页浏览。

#### `web/src/components/topup/modals/EditAffCodeModal.jsx`

自定义邀请码编辑模态框（与功能1共用）。

#### `web/src/components/table/invitation/InvitationColumnDefs.jsx`

管理员邀请管理表格列定义。

#### `web/src/components/table/invitation/modals/InviteeListModal.jsx`

管理员被邀请人列表模态框（不脱敏）。

#### `web/src/components/table/invitation/modals/CommissionRecordModal.jsx`

返佣记录明细模态框，展示每笔返佣的消费金额、返佣金额、返佣比例。

#### `web/src/components/auth/RegisterForm.jsx`

注册表单中捕获 URL 的 `aff` 参数，提交注册时传递给后端建立邀请关系。

#### `web/src/helpers/api.js`

OAuth 登录流程中传递 `aff` 参数到后端。

### 数据库变更

```sql
-- User 表新增字段
ALTER TABLE users ADD COLUMN aff_code VARCHAR(32) UNIQUE;
ALTER TABLE users ADD COLUMN aff_count INT DEFAULT 0;
ALTER TABLE users ADD COLUMN aff_quota INT DEFAULT 0;
ALTER TABLE users ADD COLUMN aff_history INT DEFAULT 0;
ALTER TABLE users ADD COLUMN inviter_id INT;
CREATE INDEX idx_users_inviter_id ON users(inviter_id);

-- 新增返佣记录表
CREATE TABLE aff_commission_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inviter_id INT,
    invitee_id INT,
    commission INT,
    consume_quota INT,
    rate INT,
    created_at BIGINT
);
CREATE INDEX idx_aff_commission_records_inviter_id ON aff_commission_records(inviter_id);
CREATE INDEX idx_aff_commission_records_invitee_id ON aff_commission_records(invitee_id);
```

### 配置说明

在系统设置中配置以下选项：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `AffCommissionEnabled` | `false` | 消费返佣功能开关 |
| `AffCommissionRate` | `5` | 默认返佣比例（百分比） |
| `AffCommissionTiers` | `""` | 阶梯返佣 JSON 配置 |

**阶梯返佣配置示例：**
```json
[
  {"threshold": 10000, "rate": 10},
  {"threshold": 50000, "rate": 15},
  {"threshold": 100000, "rate": 20}
]
```

含义：
- 历史累计返佣 < 10000 → 默认 5% 比例
- 历史累计返佣 >= 10000 → 10% 比例
- 历史累计返佣 >= 50000 → 15% 比例
- 历史累计返佣 >= 100000 → 20% 比例

---

## 附录：完整文件清单

### 后端文件

| 文件路径 | 涉及功能 |
|---------|---------|
| `model/user.go` | 自定义邀请码、邀请返利 |
| `model/channel.go` | 渠道透传请求头、错误信息复写 |
| `model/aff_commission_record.go` | 邀请返利 |
| `model/group_monitoring.go` | 分组监控 |
| `model/option.go` | 邀请返利、分组监控（动态配置） |
| `controller/user.go` | 自定义邀请码、邀请返利 |
| `controller/misc.go` | 用户协议 |
| `controller/oauth.go` | 邀请返利（OAuth 流程） |
| `controller/group_monitoring.go` | 分组监控 |
| `router/api-router.go` | 所有功能的路由注册 |
| `relay/common/override.go` | 渠道透传请求头 |
| `relay/common/relay_info.go` | 渠道透传请求头 |
| `relay/channel/api_request.go` | 渠道透传请求头 |
| `service/error.go` | 错误信息复写 |
| `relay/channel/audio_handler.go` | 错误信息复写（调用点） |
| `relay/channel/embedding_handler.go` | 错误信息复写（调用点） |
| `relay/channel/rerank_handler.go` | 错误信息复写（调用点） |
| `relay/channel/compatible_handler.go` | 错误信息复写（调用点） |
| `relay/channel/gemini_handler.go` | 错误信息复写（调用点） |
| `relay/channel/image_handler.go` | 错误信息复写（调用点） |
| `relay/channel/responses_handler.go` | 错误信息复写（调用点） |
| `relay/channel/claude_handler.go` | 错误信息复写（调用点） |
| `relay/channel/chat_completions_via_responses.go` | 错误信息复写（调用点） |
| `relay/channel/websocket.go` | 错误信息复写（调用点） |
| `setting/system_setting/legal.go` | 用户协议 |
| `setting/operation_setting/group_monitoring_setting.go` | 分组监控 |
| `common/constants.go` | 邀请返利、分组监控（常量定义） |

### 前端文件

| 文件路径 | 涉及功能 |
|---------|---------|
| `web/src/components/topup/modals/EditAffCodeModal.jsx` | 自定义邀请码 |
| `web/src/components/table/invitation/InvitationColumnDefs.jsx` | 自定义邀请码、邀请返利 |
| `web/src/components/topup/InviteeListCard.jsx` | 自定义邀请码、邀请返利 |
| `web/src/components/table/channels/modals/EditTagModal.jsx` | 渠道透传请求头 |
| `web/src/pages/UserAgreement/index.jsx` | 用户协议 |
| `web/src/components/auth/RegisterForm.jsx` | 用户协议、邀请返利 |
| `web/src/components/common/ui/ErrorMappingEditor.jsx` | 错误信息复写 |
| `web/src/components/table/channels/modals/EditChannelModal.jsx` | 错误信息复写 |
| `web/src/pages/GroupMonitoring/index.jsx` | 分组监控 |
| `web/src/components/monitoring/GroupMonitoringDashboard.jsx` | 分组监控 |
| `web/src/components/monitoring/GroupDetailPanel.jsx` | 分组监控 |
| `web/src/components/monitoring/GroupStatusCard.jsx` | 分组监控 |
| `web/src/components/monitoring/AvailabilityCacheChart.jsx` | 分组监控 |
| `web/src/pages/Setting/Operation/SettingsGroupMonitoring.jsx` | 分组监控 |
| `web/src/pages/Invitation/index.jsx` | 邀请返利 |
| `web/src/components/topup/InvitationCard.jsx` | 邀请返利 |
| `web/src/components/topup/modals/InviteeListModal.jsx` | 邀请返利 |
| `web/src/components/table/invitation/modals/InviteeListModal.jsx` | 邀请返利 |
| `web/src/components/table/invitation/modals/CommissionRecordModal.jsx` | 邀请返利 |
| `web/src/helpers/api.js` | 邀请返利（OAuth 流程） |

## 7. 合并经验与踩坑记录

本章节记录从 feat-fix 分支合并到主分支（0.11.4-alpha.4）时遇到的问题和修复细节，供未来合并参考。

### 7.1 邀请返利——调用点未合并（最严重）

- **问题**: `model.AddAffCommission` 函数已合并到 model 层，但 service 层的调用点全部缺失，导致返利功能从未被触发。模型层代码存在但无人调用，功能形同虚设。
- **修复**: 在 3 个 service 文件中添加调用：
  - `service/quota.go` (第 520-528 行) — `postConsumeQuota` 内增加 `enableAffCommission` 参数控制，异步调用 `model.AddAffCommission`
  - `service/billing.go` (第 72-78 行) — `SettleBilling` 新计费路径内联返佣调用
  - `service/violation_fee.go` (第 126 行) — 违规扣费使用 `PostConsumeQuotaWithoutAffCommission` 避免错误返佣
- **设计要点**: 新增 `PostConsumeQuotaWithoutAffCommission` 函数，底层 `postConsumeQuota` 增加 `enableAffCommission bool` 参数，正常消费传 `true` 触发返佣，违规扣费传 `false` 跳过返佣

### 7.2 管理员侧边栏缺少邀请管理入口

- **问题**: `useSidebar.js` 的 `DEFAULT_ADMIN_CONFIG.admin` 缺少 `invitation: true`，导致 `isModuleVisible('admin', 'invitation')` 返回 `false`，菜单被过滤掉
- **修复**: 在 `DEFAULT_ADMIN_CONFIG.admin` 添加 `invitation: true`（第 55 行）
- **关联文件**: 路由 `App.jsx`（第 136 行）、菜单 `SiderBar.jsx`（第 193 行）已正确合并，仅缺此配置项

### 7.3 返利配置界面合并

- **问题**: `SettingsCreditLimit.jsx` 缺少三个返佣配置项
- **修复**: 在 `DEFAULT_INPUTS` 添加 `AffCommissionEnabled`、`AffCommissionRate`、`AffCommissionTiers`，添加阶梯费率的增删改 UI 和对应的保存逻辑
- **注意**: `AffCommissionEnabled` 从后端返回的是字符串 `"true"`/`"false"`，前端加载时需转为布尔值；`AffCommissionTiers` 是 JSON 数组字符串

### 7.4 model/option.go 配置注册

- **问题**: 动态配置的 `OptionMap` 初始化和 `switch case` 处理均需合并
- **修复**:
  - `OptionMap` 初始化（第 110-112 行）注册三个配置项
  - `switch case`（第 420-440 行）处理运行时更新
  - `normalizeOptionBeforeSave`（第 512-528 行）保存前校验
- **注意**: `AffCommissionTiers` 保存前调用 `NormalizeAffCommissionTiersJSON` 去重排序

### 7.5 合并检查清单（通用经验）

未来从 feat-fix 合并功能到主分支时，务必逐项检查：

1. **Model 层函数** → 确认 Service/Controller 调用点是否一起合并
2. **侧边栏菜单** → 确认 `useSidebar.js` 的 `DEFAULT_ADMIN_CONFIG` 包含新模块 key
3. **路由一致性** → 确认 `App.jsx` 路由 + `SiderBar.jsx` 菜单 + `useSidebar` 配置三处一致
4. **配置项完整性** → 确认 `common/constants.go` 常量 + `model/option.go` OptionMap + switch case + 校验四处完整
5. **前端配置页** → 确认对应设置页面的 `DEFAULT_INPUTS` 和 UI 渲染已合并
6. **前端编译验证** → `cd web && NODE_OPTIONS="--max-old-space-size=4096" bun run build`
7. **后端编译验证** → `go build -o new-api`
