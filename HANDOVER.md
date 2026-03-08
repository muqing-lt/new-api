# 邀请消费返佣功能 - 交接文档

## 需求描述

在 `/root/new-api-feat-fix` (new-api) 项目中实现邀请消费返佣功能：
- 被邀请用户（通过邀请链接注册）每次消费 API 时，按百分比将佣金返还给邀请人
- 佣金存入邀请人的 `aff_quota`（可划转收益），可在钱包页面划转到可用余额
- 管理员可在后台系统设置中配置：启用开关、默认返佣比例、阶梯返佣规则
- 阶梯返佣：累计收益达到阈值后自动提升返佣比例（如初始5%，累计10000后升为10%）

## 项目技术栈

- 后端：Go 1.22+, Gin, GORM v2
- 前端：React 18, Vite, Semi Design UI (@douyinfe/semi-ui)
- 数据库：SQLite/MySQL/PostgreSQL 三种都要支持
- 包管理：前端用 Bun，后端用 Go modules
- 模块路径：`github.com/QuantumNous/new-api`

## 已有邀请系统（修改前）

项目已有基于**固定额度奖励**的邀请机制：
- User 表字段：`aff_code`(邀请码), `aff_count`(邀请人数), `aff_quota`(待划转收益), `aff_history`(历史总收益), `inviter_id`(邀请人ID)
- 注册时一次性给邀请人 `QuotaForInviter` 额度，存入 `aff_quota`
- 用户可在钱包页面将 `aff_quota` 划转到 `quota`（可用余额）
- **没有**按消费比例返佣的逻辑

## 已完成的修改（共 8 个文件）

### 1. `common/constants.go` — 新增 3 个全局变量

在 `QuotaForInvitee` 之后、`ChannelDisableThreshold` 之前添加：

```go
var AffCommissionEnabled = false  // 消费返佣功能开关
var AffCommissionRate = 5         // 默认返佣比例（百分比，如5表示5%）
var AffCommissionTiers = ""       // 阶梯返佣规则 JSON，格式: [{"threshold":10000,"rate":10},{"threshold":50000,"rate":15}]
```

### 2. `model/option.go` — 配置加载和更新

**InitOptionMap 中新增（在 QuotaForInvitee 之后）：**
```go
common.OptionMap["AffCommissionEnabled"] = strconv.FormatBool(common.AffCommissionEnabled)
common.OptionMap["AffCommissionRate"] = strconv.Itoa(common.AffCommissionRate)
common.OptionMap["AffCommissionTiers"] = common.AffCommissionTiers
```

**updateOptionMap switch-case 中新增（在 QuotaForInvitee case 之后）：**
```go
case "AffCommissionEnabled":
    common.AffCommissionEnabled, _ = strconv.ParseBool(value)
case "AffCommissionRate":
    common.AffCommissionRate, _ = strconv.Atoi(value)
case "AffCommissionTiers":
    common.AffCommissionTiers = value
```

### 3. `model/user.go` — 返佣核心逻辑（在 inviteUser 函数之后添加）

```go
// AffCommissionTier 阶梯返佣规则
type AffCommissionTier struct {
	Threshold int `json:"threshold"` // 累计收益阈值
	Rate      int `json:"rate"`      // 返佣比例（百分比）
}

// GetAffCommissionRate 根据邀请人的累计收益获取当前返佣比例
func GetAffCommissionRate(affHistoryQuota int) int {
	rate := common.AffCommissionRate
	if common.AffCommissionTiers == "" {
		return rate
	}
	var tiers []AffCommissionTier
	if err := json.Unmarshal([]byte(common.AffCommissionTiers), &tiers); err != nil {
		return rate
	}
	for i := len(tiers) - 1; i >= 0; i-- {
		if affHistoryQuota >= tiers[i].Threshold {
			rate = tiers[i].Rate
			break
		}
	}
	return rate
}

// AddAffCommission 消费返佣：给邀请人按比例增加 AffQuota
func AddAffCommission(userId int, consumeQuota int) {
	if !common.AffCommissionEnabled { return }
	if consumeQuota <= 0 { return }
	var user User
	err := DB.Select("inviter_id").Where("id = ?", userId).First(&user).Error
	if err != nil || user.InviterId == 0 { return }
	inviter, err := GetUserById(user.InviterId, true)
	if err != nil { return }
	rate := GetAffCommissionRate(inviter.AffHistoryQuota)
	if rate <= 0 { return }
	commission := consumeQuota * rate / 100
	if commission <= 0 { return }
	err = DB.Model(&User{}).Where("id = ?", user.InviterId).Updates(map[string]interface{}{
		"aff_quota":   gorm.Expr("aff_quota + ?", commission),
		"aff_history": gorm.Expr("aff_history + ?", commission),
	}).Error
	if err != nil {
		common.SysLog(fmt.Sprintf("failed to add aff commission for user %d: %s", user.InviterId, err.Error()))
		return
	}
	RecordLog(user.InviterId, LogTypeSystem, fmt.Sprintf("邀请用户消费返佣 %s（返佣比例 %d%%）", logger.FormatQuota(commission), rate))
}
```

所需 import 都已存在：`encoding/json`, `common`, `logger`, `gorm`, `fmt`

### 4. `service/quota.go` — PostConsumeQuota 中调用返佣

在 `PostConsumeQuota` 函数末尾 `return nil` 之前添加：

```go
// 异步执行消费返佣
if quota > 0 {
    actualQuota := quota + preConsumedQuota
    if actualQuota > 0 {
        userId := relayInfo.UserId
        gopool.Go(func() {
            model.AddAffCommission(userId, actualQuota)
        })
    }
}
```

`gopool` 和 `model` 包已在该文件中导入。

### 5. `service/billing.go` — SettleBilling 中调用返佣

**新增 import：**
```go
"github.com/QuantumNous/new-api/model"
"github.com/bytedance/gopkg/util/gopool"
```

**在 BillingSession 路径的 `return nil` 之前添加：**
```go
// 异步执行消费返佣
if actualQuota > 0 {
    userId := relayInfo.UserId
    gopool.Go(func() {
        model.AddAffCommission(userId, actualQuota)
    })
}
```

### 6. `web/src/pages/Setting/Operation/SettingsCreditLimit.jsx` — 管理员配置界面

在原有"额度设置" Form.Section 之后，新增"消费返佣设置" Form.Section，包含：
- 启用开关（Form.Switch `AffCommissionEnabled`）
- 默认返佣比例（Form.InputNumber `AffCommissionRate`，0-100%）
- 阶梯返佣规则：动态增删的 threshold + rate 行

新增 import：`Typography, Space, Tag, Toast` from semi-ui，`IconPlus, IconDelete` from semi-icons

新增 state：`tiers`（阶梯规则数组）

新增函数：`addTier`, `removeTier`, `updateTier`

useEffect 中新增：字符串布尔值转换、AffCommissionTiers JSON 解析

### 7. `web/src/i18n/locales/zh-CN.json` — 中文翻译

在 `"消费"` 之后添加了 12 条翻译键值（中文→中文映射）。

### 8. `web/src/i18n/locales/en.json` — 英文翻译

在 `"消费"` 之后添加了 12 条翻译键值（中文→英文映射）。

新增的翻译 key 列表：
- 消费返佣设置 / Commission Settings
- 启用消费返佣 / Enable Consumption Commission
- 开启后，被邀请用户每次消费API时，按比例返还额度给邀请人
- 默认返佣比例 / Default Commission Rate
- 被邀请人消费额度的返还百分比
- 阶梯返佣规则 / Tiered Commission Rules
- 当邀请人的累计收益达到阈值时，返佣比例自动提升。阈值为额度单位。
- 累计收益阈值 / Cumulative Earnings Threshold
- 提升后比例 / Upgraded Rate
- 添加阶梯规则 / Add Tier Rule
- 保存返佣设置 / Save Commission Settings

## 未完成 / 待验证

1. **Go 编译未通过** — 之前服务器无法访问 `proxy.golang.org`，所有错误都是网络超时，非代码问题。新服务器需要运行 `go build ./...` 验证。建议设置 `GOPROXY=https://goproxy.cn,direct`
2. **前端构建未测试** — 需要在 `web/` 目录运行 `bun install && bun run build` 验证
3. **功能测试** — 需要启动项目后实际测试：
   - 管理员后台 > 系统设置 > 额度设置 > 消费返佣设置区域是否正确显示
   - 配置保存和读取是否正常
   - 消费 API 后邀请人是否收到返佣（查看 aff_quota 变化和日志）
   - 阶梯规则是否生效

## 关键文件路径参考

```
/root/new-api-feat-fix/
├── common/constants.go          # 全局变量定义
├── model/option.go              # Option 加载/更新逻辑
├── model/user.go                # User 模型 + 返佣核心函数
├── service/quota.go             # PostConsumeQuota（消费扣费路径1）
├── service/billing.go           # SettleBilling（消费扣费路径2）
├── web/src/pages/Setting/Operation/SettingsCreditLimit.jsx  # 管理员配置页面
├── web/src/i18n/locales/zh-CN.json  # 中文翻译
├── web/src/i18n/locales/en.json     # 英文翻译
├── router/api-router.go         # 路由（本次未修改）
├── controller/user.go           # 用户控制器（本次未修改）
└── CLAUDE.md                    # 项目约定（重要参考）
```

## 消费扣费的两条路径（都已插入返佣）

1. **有 BillingSession 时**：`SettleBilling()` → `billing.Settle()` → 返佣（service/billing.go）
2. **无 BillingSession 时**：`SettleBilling()` → `PostConsumeQuota()` → 返佣（service/quota.go）

两条路径都通过 `gopool.Go` 异步调用 `model.AddAffCommission(userId, actualQuota)`。

## 注意事项

- 项目不是 git 仓库（`/root/new-api-feat-fix/.git` 不存在）
- 项目约定见 `/root/new-api-feat-fix/CLAUDE.md`
- 代码风格：Go 标准，前端用 Semi Design，i18n 用 react-i18next
- 数据库列名：`aff_quota`(待划转), `aff_history`(历史累计), `inviter_id`(邀请人)
