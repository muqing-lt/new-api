# 自定义功能文档

> 本文档记录了所有自定义功能的详细实现，包含路由、文件、修改内容和实现方式，方便后续合并到主分支。
> 
> **合并历史**:
> - `new-api-feat-fix` → `0.11.4-alpha.4`: 功能 1-6 初始合并
> - `new-api-0.11.4-alpha.4-custom` → `0.12.0`: 功能 1-6 二次合并 + 充值协议（手写）+ 强制 IP 日志（新增）

---

## 目录

1. [自定义邀请码](#1-自定义邀请码)
2. [渠道透传请求头 (Header Override)](#2-渠道透传请求头-header-override)
3. [用户协议 (用户协议 + 隐私政策 + 充值协议)](#3-用户协议-用户协议--隐私政策--充值协议)
4. [错误信息复写 (Error Mapping)](#4-错误信息复写-error-mapping)
5. [分组监控 (Group Monitoring)](#5-分组监控-group-monitoring)
6. [邀请返利 (Affiliate Commission)](#6-邀请返利-affiliate-commission)
7. [合并到 0.11.4 的经验](#7-合并经验与踩坑记录)
8. [合并到 0.12.0 的经验](#8-合并到-0120-的经验补充)
9. [强制 IP 日志记录 (Force IP Logging)](#9-强制-ip-日志记录-force-ip-logging)

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

## 3. 用户协议 (用户协议 + 隐私政策 + 充值协议)

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

### 充值协议 (Topup Agreement)

在用户协议体系基础上扩展的充值协议功能。管理员可在后台配置充值协议内容，配置后用户在钱包管理的额度充值页面必须勾选同意充值协议才能发起充值。

#### 功能要点

1. 管理后台可配置充值协议内容（支持 Markdown & HTML）
2. 配置后，充值页面所有支付入口（普通支付、Stripe、Creem）均受协议约束
3. 未勾选协议时，所有支付按钮禁用、Creem 产品卡片不可点击
4. PaymentConfirmModal 弹窗中有二次确认（勾选框 + 按钮禁用）
5. 弹窗关闭时自动重置协议勾选状态，防止绕过
6. 未配置充值协议时，不显示勾选框，不影响正常充值流程

#### API 路由

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/topup-agreement` | 获取充值协议内容（公开，无需认证） |
| `GET` | `/api/status` | 状态接口增加 `topup_agreement_enabled` 标志 |

#### 后端文件

**`setting/system_setting/legal.go`**

`LegalSettings` 结构体新增字段：
```go
TopupAgreement string `json:"topup_agreement"`
```

默认值为空字符串。配置 key: `legal.topup_agreement`，通过 `config.GlobalConfig.Register("legal", &defaultLegalSettings)` 自动注册，无需额外注册代码。

**`controller/misc.go`**

新增控制器函数（第210-217行）：
```go
func GetTopupAgreement(c *gin.Context) {
    c.JSON(http.StatusOK, gin.H{
        "success": true,
        "message": "",
        "data":    system_setting.GetLegalSettings().TopupAgreement,
    })
    return
}
```

`GetStatus()` 返回值新增（第118行）：
```go
"topup_agreement_enabled": legalSetting.TopupAgreement != "",
```

**`router/api-router.go`**（第30行）

```go
apiRouter.GET("/topup-agreement", controller.GetTopupAgreement)
```

注册在公开路由分组（与 `/api/user-agreement`、`/api/privacy-policy` 同级），无需认证。

#### 前端文件

**`web/src/pages/TopupAgreement/index.jsx`**（新建）

充值协议独立展示页面，使用通用 `DocumentRenderer` 组件，请求 `/api/topup-agreement` 接口获取内容。参考 `UserAgreement/index.jsx` 实现。

**`web/src/App.jsx`**

- 第60行：`const TopupAgreement = lazy(() => import('./pages/TopupAgreement'));`
- 路由注册（`/privacy-policy` 路由后）：`path='/topup-agreement'` → `<TopupAgreement />`

**`web/src/components/topup/index.jsx`**（充值页面主组件）

状态定义（第116-118行）：
```js
const topupAgreementEnabled = statusState?.status?.topup_agreement_enabled || false;
const [agreedToTopupAgreement, setAgreedToTopupAgreement] = useState(false);
```

Props 传递：
- 向 `PaymentConfirmModal` 传递 `topupAgreementEnabled`、`agreedToTopupAgreement`、`setAgreedToTopupAgreement`
- 向 `RechargeCard` 传递同样的三个 props

Creem 充值确认弹窗（第792-840行）：
- `okButtonProps.disabled` 增加 `topupAgreementEnabled && !agreedToTopupAgreement` 条件
- 弹窗内渲染协议 Checkbox（使用 `Typography.Text` 和链接到 `/topup-agreement`）

**关键：弹窗关闭时重置协议状态**（防止用户在一个弹窗勾选后关闭，再打开其他弹窗时绕过协议）：
- `handleCancel`（第689行）：增加 `setAgreedToTopupAgreement(false)`
- `handleCreemCancel`（第705行）：增加 `setAgreedToTopupAgreement(false)`

Import 变更（第31行）：增加 `Checkbox, Typography` 从 `@douyinfe/semi-ui`

**`web/src/components/topup/modals/PaymentConfirmModal.jsx`**

Props 接收新增（第43-45行）：`topupAgreementEnabled`、`agreedToTopupAgreement`、`setAgreedToTopupAgreement`

Import 变更（第21行）：增加 `Checkbox` 从 `@douyinfe/semi-ui`

Modal 新增 `okButtonProps`（第67行）：
```jsx
okButtonProps={{ disabled: topupAgreementEnabled && !agreedToTopupAgreement }}
```

Card 下方渲染协议 Checkbox（第212-231行）：
```jsx
{topupAgreementEnabled && (
  <div className='pt-2'>
    <Checkbox checked={agreedToTopupAgreement}
      onChange={(e) => setAgreedToTopupAgreement(e.target.checked)}>
      <Text size='small' className='text-gray-600'>
        {t('我已阅读并同意')}
        <a href='/topup-agreement' target='_blank' ...>{t('充值协议')}</a>
      </Text>
    </Checkbox>
  </div>
)}
```

**`web/src/components/topup/RechargeCard.jsx`**

Props 接收新增（第97-99行）：`topupAgreementEnabled`、`agreedToTopupAgreement`、`setAgreedToTopupAgreement`

Import 变更（第36行）：增加 `Checkbox` 从 `@douyinfe/semi-ui`

普通支付按钮 disabled 逻辑（第303-308行）增加协议检查：
```js
const disabled =
  (!enableOnlineTopUp && !isStripe) ||
  (!enableStripeTopUp && isStripe) ||
  minTopupVal > Number(topUpCount || 0) ||
  (topupAgreementEnabled && !agreedToTopupAgreement);
```

Creem 产品卡片（第502-526行）增加协议约束：
```js
const creemDisabled = topupAgreementEnabled && !agreedToTopupAgreement;
// onClick 中检查 !creemDisabled
// className 动态切换 opacity-50 cursor-not-allowed / cursor-pointer
```

Form 底部（第531-548行）渲染协议 Checkbox：
```jsx
{topupAgreementEnabled && (
  <div className='pt-2'>
    <Checkbox ...>{t('我已阅读并同意')} <a href='/topup-agreement'>{t('充值协议')}</a></Checkbox>
  </div>
)}
```

**`web/src/components/settings/OtherSetting.jsx`**

新增常量（第39行）：
```js
const LEGAL_TOPUP_AGREEMENT_KEY = 'legal.topup_agreement';
```

`inputs` 初始状态增加 `[LEGAL_TOPUP_AGREEMENT_KEY]: ''`
`loadingInput` 初始状态增加 `[LEGAL_TOPUP_AGREEMENT_KEY]: false`

新增 `submitTopupAgreement` 函数（参考 `submitUserAgreement` 实现），调用 `updateOption(LEGAL_TOPUP_AGREEMENT_KEY, ...)`。

通用设置 Form.Section 中，隐私政策按钮后新增：
- 充值协议 `Form.TextArea`（label: '充值协议'，helpText: '填写充值协议内容后，用户充值时将被要求勾选已阅读充值协议'）
- "设置充值协议" `Button`

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

#### 顶栏导航显示修复

**问题**: 管理员在 `SettingsGroupMonitoring.jsx` 中开启"顶栏导航分组监控"后，会向 `HeaderNavModules` 写入 `monitoring: true`（第179行），但 `useNavigation.js` 的 `allLinks` 静态数组中没有 `itemKey: 'monitoring'` 的条目，导致过滤函数永远不会渲染分组监控导航项。

**修复文件**: `web/src/hooks/common/useNavigation.js`

在 `allLinks` 数组中增加 `monitoring` 条目（第67-71行）：
```js
{
  text: t('分组监控'),
  itemKey: 'monitoring',
  to: '/monitoring',
},
```

- `itemKey: 'monitoring'` 与 `SettingsGroupMonitoring.jsx` 保存 `config.monitoring` 使用的 key 一致
- 路径 `/monitoring` 与 `App.jsx` 中的公开路由路径一致（第154行）
- `defaultModules` 中不含 `monitoring`（默认不显示），管理员手动开启后才出现
- 过滤逻辑 `modules[link.itemKey] === true` 无需修改，已能正确处理

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
| `GET` | `/api/user/aff/list` | 获取所有用户邀请信息（支持 `order` + `sort` 排序参数） |
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
| `GetAdminAffUsers(keyword, page, pageSize, order, sort)` | 管理员查询邀请关系用户列表（支持字段排序 + 升降序） |
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

管理员邀请管理表格列定义。支持 `aff_count`、`aff_quota`、`aff_history_quota` 三列的受控排序（`sortOrder` 属性由父组件传入的 `sortInfo` 控制）。

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

### 管理员邀请列表排序

管理员邀请管理页面支持对三个数值列进行服务端排序：

**可排序字段：**

| 前端 dataIndex | 后端 order 参数值 | 数据库实际列名 |
|---------------|-----------------|--------------|
| `aff_count` | `aff_count` | `aff_count` |
| `aff_quota` | `aff_quota` | `aff_quota` |
| `aff_history_quota` | `aff_history_quota` | `aff_history` |

**API 参数：**
- `order` — 排序字段名（白名单校验）
- `sort` — 排序方向：`ascend`（升序）或 `descend`（降序，默认）

**实现要点：**
- 后端使用 switch-case 白名单校验排序字段，防止 SQL 注入
- 前端使用 Semi Design Table 受控排序（`sortOrder` 属性），避免客户端排序与服务端排序冲突
- 排序状态通过 `sortInfo` 对象 `{ field, order }` 在 hook、Table、ColumnDefs 间传递
- 排序在翻页和搜索时保持

**涉及文件：**
- `model/aff_commission_record.go` — `GetAdminAffUsers` 新增 `sort` 参数
- `controller/aff.go` — `AdminGetAffUsers` 传递 `sort` 查询参数
- `web/src/hooks/invitation/useInvitationData.jsx` — 排序状态管理 `sortInfo`
- `web/src/components/table/invitation/InvitationColumnDefs.jsx` — 受控 `sortOrder`
- `web/src/components/table/invitation/InvitationTable.jsx` — 传递 `sortInfo` prop

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
| `controller/misc.go` | 用户协议、充值协议 |
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
| `setting/system_setting/legal.go` | 用户协议、充值协议 |
| `setting/operation_setting/group_monitoring_setting.go` | 分组监控 |
| `common/constants.go` | 邀请返利、分组监控（常量定义） |
| `controller/aff.go` | 邀请返利（管理员邀请列表排序） |

### 前端文件

| 文件路径 | 涉及功能 |
|---------|---------|
| `web/src/components/topup/modals/EditAffCodeModal.jsx` | 自定义邀请码 |
| `web/src/components/table/invitation/InvitationColumnDefs.jsx` | 自定义邀请码、邀请返利、排序 |
| `web/src/components/topup/InviteeListCard.jsx` | 自定义邀请码、邀请返利 |
| `web/src/components/table/channels/modals/EditTagModal.jsx` | 渠道透传请求头 |
| `web/src/pages/UserAgreement/index.jsx` | 用户协议 |
| `web/src/pages/TopupAgreement/index.jsx` | 充值协议 |
| `web/src/components/auth/RegisterForm.jsx` | 用户协议、邀请返利 |
| `web/src/components/topup/modals/PaymentConfirmModal.jsx` | 充值协议 |
| `web/src/components/topup/index.jsx` | 充值协议（状态管理、弹窗协议控制） |
| `web/src/components/topup/RechargeCard.jsx` | 充值协议（支付按钮禁用、Creem卡片禁用、Checkbox渲染） |
| `web/src/components/settings/OtherSetting.jsx` | 充值协议（管理后台设置） |
| `web/src/App.jsx` | 充值协议（路由注册）、分组监控导航栏修复 |
| `web/src/components/common/ui/ErrorMappingEditor.jsx` | 错误信息复写 |
| `web/src/components/table/channels/modals/EditChannelModal.jsx` | 错误信息复写 |
| `web/src/pages/GroupMonitoring/index.jsx` | 分组监控 |
| `web/src/components/monitoring/GroupMonitoringDashboard.jsx` | 分组监控 |
| `web/src/components/monitoring/GroupDetailPanel.jsx` | 分组监控 |
| `web/src/components/monitoring/GroupStatusCard.jsx` | 分组监控 |
| `web/src/components/monitoring/AvailabilityCacheChart.jsx` | 分组监控 |
| `web/src/pages/Setting/Operation/SettingsGroupMonitoring.jsx` | 分组监控 |
| `web/src/hooks/common/useNavigation.js` | 分组监控（导航栏显示修复） |
| `web/src/pages/Invitation/index.jsx` | 邀请返利 |
| `web/src/components/topup/InvitationCard.jsx` | 邀请返利 |
| `web/src/components/topup/modals/InviteeListModal.jsx` | 邀请返利 |
| `web/src/components/table/invitation/modals/InviteeListModal.jsx` | 邀请返利 |
| `web/src/components/table/invitation/modals/CommissionRecordModal.jsx` | 邀请返利 |
| `web/src/helpers/api.js` | 邀请返利（OAuth 流程） |
| `web/src/hooks/invitation/useInvitationData.jsx` | 邀请返利（排序状态管理） |
| `web/src/components/table/invitation/InvitationTable.jsx` | 邀请返利（排序 prop 传递） |

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

## 8. 合并到 0.12.0 的经验补充

本章节记录从 `new-api-0.11.4-alpha.4-custom` 分支合并到 0.12.0 主分支时新增的踩坑记录。

### 8.1 AutoMigrate 遗漏新表（致命）

- **问题**: 从 custom 分支复制了 `model/group_monitoring.go`、`model/aff_commission_record.go` 等文件，但忘记在 `model/main.go` 的 `AutoMigrate` 中注册 5 个新表（`RequestStat`、`ChannelMonitoringStat`、`GroupMonitoringStat`、`MonitoringHistory`、`AffCommissionRecord`），导致数据库启动时不会建表
- **修复**: 在 `model/main.go` 的**两处** AutoMigrate 列表中均添加（主迁移 + 并行迁移）
- **教训**: 新增 model 结构体后，必须同时检查 `model/main.go` 中的 AutoMigrate 注册

### 8.2 缺少配套文件（分组监控）

- **问题**: `controller/group_monitoring.go` 引用了 `model.GetGroupMonitoringStatsByNames` 等函数，但这些函数在 `model/group_monitoring_aggregation.go` 中，而非 `model/group_monitoring.go`。仅复制了后者，导致编译失败
- **修复**: 补充复制 `model/group_monitoring_aggregation.go` 和 `service/group_monitoring.go`
- **教训**: 复制文件前先用 `grep -rn "函数名" /源目录/` 确认所有依赖文件

### 8.3 generateUniqueAffCode 事务上下文错误

- **问题**: `model/user.go` 中 `InsertWithTx` 函数调用 `generateUniqueAffCode(DB)` 传了全局 `DB`，但应该传 `tx`（事务对象），否则在事务内查重不一致，有并发竞态
- **修复**: 改为 `generateUniqueAffCode(tx)`

### 8.4 model/option.go 缺少 fmt import

- **问题**: 添加了 `AffCommission` 相关的 `fmt.Errorf` 调用，但忘记在 import 中添加 `"fmt"`
- **修复**: 添加 `"fmt"` 到 import 列表

### 8.5 relay handler sed 批量修改缩进错误

- **问题**: 使用 `sed` 批量在 10 个 relay handler 中插入 `ApplyErrorMapping` 行时，sed 的 `\t\t` 缩进固定为 2 个 tab，但实际代码中 `ResetStatusCode` 的缩进层级不同（2-4 个 tab），导致插入的行缩进不一致
- **修复**: 用 Python 脚本逐行修复，让每个 `ApplyErrorMapping` 行与其上方 `ResetStatusCode` 行缩进对齐
- **教训**: sed 批量插入后必须验证缩进，或改用更精确的工具

### 8.6 SiderBar routerMap 缺少 group-monitoring

- **问题**: `SiderBar.jsx` 的 `routerMap` 对象中遗漏了 `'group-monitoring': '/console/group-monitoring'`
- **修复**: 补充添加

### 8.7 充值协议功能（custom 分支无此功能，手写实现）

充值协议功能在 custom 分支中不存在，根据 custom.md 文档规格 + 参考 `new-api-0.11.4-alpha.4` 分支的实现手写完成。涉及文件：

**后端**:
- `setting/system_setting/legal.go` — `LegalSettings` 新增 `TopupAgreement` 字段
- `controller/misc.go` — 新增 `GetTopupAgreement()`, `GetStatus()` 新增 `topup_agreement_enabled`
- `router/api-router.go` — `/topup-agreement` 公开路由

**前端**:
- `web/src/pages/TopupAgreement/index.jsx` — 新建充值协议展示页
- `web/src/App.jsx` — 路由注册
- `web/src/components/topup/index.jsx` — 状态管理 + Creem 弹窗协议控制
- `web/src/components/topup/modals/PaymentConfirmModal.jsx` — Checkbox + 按钮禁用
- `web/src/components/topup/RechargeCard.jsx` — 支付按钮禁用 + Creem 卡片禁用 + Checkbox
- `web/src/components/settings/OtherSetting.jsx` — 管理后台配置项

### 8.8 更新后的合并检查清单

在 7.5 基础上补充：

8. **AutoMigrate 注册** → `model/main.go` 中主迁移和并行迁移两处列表均需添加新表
9. **配套文件完整性** → 复制 controller 前先 grep 确认所有 model/service 依赖都已复制
10. **事务上下文** → `InsertWithTx` 等事务函数中，子调用应传 `tx` 而非全局 `DB`
11. **sed 批量修改** → 修改后验证缩进和上下文一致性

---

## 9. 强制 IP 日志记录 (Force IP Logging)

### 功能概述

管理员可在系统设置的日志设置中开启"强制记录 IP"开关。开启后，所有用户的请求和错误日志都会记录 IP 地址，无需用户在个人设置中手动启用。

### 配置方式

通过系统设置 → 日志设置 → "强制记录 IP" 开关控制。

### 后端文件

#### `common/constants.go`

新增常量：
```go
var ForceRecordIpEnabled = false // 强制记录日志 IP 开关（默认关闭）
```

#### `model/option.go`

- OptionMap 初始化注册 `ForceRecordIpEnabled`
- switch case 处理运行时更新

#### `model/log.go`

`RecordErrorLog` 和 `RecordConsumeLog` 函数中，判断 `needRecordIp` 的逻辑从：
```go
needRecordIp := false
if settingMap, err := GetUserSetting(userId, false); err == nil {
    if settingMap.RecordIpLog {
        needRecordIp = true
    }
}
```
改为：
```go
needRecordIp := common.ForceRecordIpEnabled
if !needRecordIp {
    if settingMap, err := GetUserSetting(userId, false); err == nil {
        if settingMap.RecordIpLog {
            needRecordIp = true
        }
    }
}
```

### 前端文件

#### `web/src/pages/Setting/Operation/SettingsLog.jsx`

`inputs` 初始状态新增 `ForceRecordIpEnabled: false`，UI 中新增 Switch 组件。

---

## 10. 充值协议 UI 增强 — 禁用提示

### 功能概述

当充值协议启用但用户未勾选同意时，禁用的支付按钮和 Creem 卡片显示 Tooltip 悬浮提示"请先勾选同意充值协议"，Checkbox 下方也有红色提示文字，替代原来的"禁止"光标。

### 涉及文件

| 文件 | 改动 |
|------|------|
| `web/src/components/topup/RechargeCard.jsx` | 支付按钮禁用时包裹 `<Tooltip content="请先勾选同意充值协议">`；Creem 卡片同理；Checkbox 下方未勾选时显示 `<Text type='danger'>` 红色提示 |
| `web/src/components/topup/index.jsx` | Creem 确认弹窗 Checkbox 下方，未勾选时显示红色提示文字 |
| `web/src/components/topup/modals/PaymentConfirmModal.jsx` | 支付确认弹窗 Checkbox 下方，未勾选时显示红色提示文字 |

### 实现要点

- 支付按钮：复用已有的 `<Tooltip>` 模式（最低充值金额提示），在条件分支中增加协议未勾选的判断
- Creem 卡片：将 `<Card>` 提取为 `cardEl` 变量，根据 `creemDisabled` 决定是否包裹 `<Tooltip>`
- 弹窗内：在 Checkbox 组件下方用 `{!agreedToTopupAgreement && <Text type='danger'>...}` 条件渲染

---

## 11. 分组监控设置独立 Tab

### 功能概述

将分组监控设置从"运营设置"中移出，作为管理员系统设置页面的独立顶级 Tab 栏目显示，与"性能设置"、"系统设置"等平级。

### 涉及文件

| 文件 | 改动 |
|------|------|
| `web/src/components/settings/GroupMonitoringSetting.jsx` | **新建**包装组件，独立加载 options 传给 SettingsGroupMonitoring |
| `web/src/pages/Setting/index.jsx` | +`Monitor` 图标 import，+`GroupMonitoringSetting` import，新增 `group-monitoring` Tab（位于"性能设置"之后） |
| `web/src/components/settings/OperationSetting.jsx` | 移除分组监控（不再放在运营设置中） |

---

## 12. 前端构建遗漏文件

### 问题

前端 `bun run build` 报错：`Could not resolve "./CommissionTierCard" from "src/components/topup/InvitationCard.jsx"`

### 原因

从 custom 分支复制 `InvitationCard.jsx` 时，漏掉了其依赖的 `CommissionTierCard.jsx`。

### 修复

从 custom 分支补充复制 `web/src/components/topup/CommissionTierCard.jsx`。

### 教训

复制前端组件时也需要检查其 import 依赖，不仅仅是后端的函数依赖。可用 `grep "import" 组件文件` 快速确认。

---

## 附录：本次合并完整修改文件清单

### 后端新建文件（8个）

| 文件 | 功能 |
|------|------|
| `model/aff_commission_record.go` | 返佣记录表 |
| `model/group_monitoring.go` | 分组监控数据结构 |
| `model/group_monitoring_aggregation.go` | 分组监控聚合查询 |
| `controller/group_monitoring.go` | 分组监控控制器 |
| `controller/aff.go` | 管理员邀请管理 |
| `service/group_monitoring.go` | 分组监控服务 |
| `setting/operation_setting/group_monitoring_setting.go` | 分组监控配置 |
| `pages/TopupAgreement/index.jsx` | 充值协议页面（手写） |

### 后端修改文件（18个）

| 文件 | 改动摘要 |
|------|---------|
| `model/user.go` | +自定义邀请码函数 +返佣函数 +原子化 inviteUser/TransferAffQuota |
| `model/channel.go` | +ErrorMapping 字段 +GetErrorMapping() |
| `model/option.go` | +fmt import +4项 OptionMap +switch case +normalizeOptionBeforeSave |
| `model/main.go` | 两处 AutoMigrate 添加5个新表 |
| `model/log.go` | 两处 IP 记录逻辑增加 ForceRecordIpEnabled 判断 |
| `common/constants.go` | +AffCommission* +GroupMonitoringBasePrice +ForceRecordIpEnabled |
| `controller/user.go` | +UpdateAffCode |
| `controller/misc.go` | +GetTopupAgreement +topup_agreement_enabled |
| `router/api-router.go` | +PUT /aff +邀请路由 +管理员邀请路由 +监控路由 +/topup-agreement |
| `service/error.go` | +ApplyErrorMapping 错误映射功能 |
| `service/quota.go` | PostConsumeQuota 拆分 +PostConsumeQuotaWithoutAffCommission |
| `service/billing.go` | +返佣调用 +model/gopool import |
| `service/violation_fee.go` | 改用 PostConsumeQuotaWithoutAffCommission |
| `setting/system_setting/legal.go` | +TopupAgreement 字段 |
| `constant/context_key.go` | +ContextKeyChannelErrorMapping |
| `middleware/distributor.go` | +error_mapping context 设置 |
| `i18n/keys.go` | +4个邀请码 i18n key |
| `i18n/locales/zh-CN.yaml` + `en.yaml` | +邀请码翻译 |
| 10个 relay handler | +errorMappingStr +ApplyErrorMapping 调用 |

### 前端新建文件（20个）

| 文件 | 功能 |
|------|------|
| `pages/TopupAgreement/index.jsx` | 充值协议页面 |
| `pages/GroupMonitoring/index.jsx` | 分组监控页面 |
| `pages/Invitation/index.jsx` | 邀请管理页面 |
| `pages/Setting/Operation/SettingsGroupMonitoring.jsx` | 监控配置页 |
| `components/settings/GroupMonitoringSetting.jsx` | 监控设置 Tab 包装组件 |
| `components/monitoring/*.jsx` (5个) | 监控 UI 组件 |
| `components/common/ui/ErrorMappingEditor.jsx` | 错误映射编辑器 |
| `components/topup/CommissionTierCard.jsx` | 返佣阶梯卡片 |
| `components/topup/modals/EditAffCodeModal.jsx` | 自定义邀请码 |
| `components/topup/InviteeListCard.jsx` | 被邀请人卡片 |
| `components/topup/modals/InviteeListModal.jsx` | 被邀请人列表 |
| `components/table/invitation/*` | 管理员邀请表格组件 |
| `hooks/invitation/useInvitationData.jsx` | 邀请数据 hook |

### 前端修改文件（12个）

| 文件 | 改动摘要 |
|------|---------|
| `App.jsx` | +Invitation/GroupMonitoring/TopupAgreement 路由 |
| `hooks/common/useSidebar.js` | +invitation: true |
| `hooks/common/useNavigation.js` | +monitoring 导航 |
| `components/layout/SiderBar.jsx` | +invitation/group-monitoring routerMap +邀请管理菜单 |
| `components/topup/index.jsx` | +充值协议状态/props/弹窗控制/Tooltip提示 |
| `components/topup/modals/PaymentConfirmModal.jsx` | +Checkbox/okButtonProps/提示文字 |
| `components/topup/RechargeCard.jsx` | +Checkbox/按钮禁用/Creem禁用/Tooltip提示 |
| `components/topup/InvitationCard.jsx` | 替换为增强版 |
| `components/table/channels/modals/EditChannelModal.jsx` | +ErrorMappingEditor集成 |
| `components/settings/OtherSetting.jsx` | +充值协议配置 |
| `components/settings/OperationSetting.jsx` | 移除分组监控（独立Tab） |
| `pages/Setting/index.jsx` | +分组监控独立Tab |
| `pages/Setting/Operation/SettingsLog.jsx` | +ForceRecordIpEnabled 开关 |
| `pages/Setting/Operation/SettingsCreditLimit.jsx` | 替换为含返佣配置版 |


## 分组监控与日志设置合并避坑指南 (v0.12.0)

1. **分组监控菜单 403 错误（路由权限过高）**
   新版合并时，如果前端页面（如 `/console/group-monitoring`）是供普通用户访问的，必须在 `web/src/App.jsx` 中用 `<PrivateRoute>` 包裹，而非 `<AdminRoute>`。否则普通用户访问时会被拦截并重定向到 `/forbidden` 页面。

2. **强制记录 IP 设置不生效（布尔值变字符串）**
   前端的 `OperationSetting.jsx` 初始 `inputs` 状态对象中必须显式声明所有布尔型配置的默认值（如 `ForceRecordIpEnabled: false`）。如果漏了，`getOptions()` 的 `typeof inputs[item.key] === 'boolean'` 检测会失效（变成 undefined），导致 API 返回的 `"true"` 被直接赋为**字符串**，从而使开关组件状态绑定失效，保存传参也变成字符串。

3. **分组监控聚合定时器未启动（曲线变直线）**
   新版代码合并时，不要忘记在 `main.go` 的启动流程中检查并添加后台 Goroutine 调用，例如：
   ```go
   go service.StartGroupMonitoringAggregation()
   ```
   如果遗漏，后台定时聚合任务将从未启动，`monitoring_histories` 表无新数据写入，导致前端折线图只会拉取到初始种子数据而显示为一条直线。

4. **前端图表 `cache_hit_rate` 阈值 Bug（低命中率数据丢失）**
   在渲染历史图表（如 `AvailabilityCacheChart.jsx` 和 `MiniHistoryChart.jsx`）时，检查阈值判断是否错误。原代码中 `cache_hit_rate >= 3` 会导致 0-2.99% 的命中率被当作无数据而忽略。正确的有效判断应为 `>= 0`。
