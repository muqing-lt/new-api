package model

import (
	"math"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

type AffCommissionRecord struct {
	Id           int   `json:"id" gorm:"primaryKey"`
	InviterId    int   `json:"inviter_id" gorm:"type:int;index"`
	InviteeId    int   `json:"invitee_id" gorm:"type:int;index"`
	Commission   int   `json:"commission" gorm:"type:int"`
	ConsumeQuota int   `json:"consume_quota" gorm:"type:int"`
	Rate         int   `json:"rate" gorm:"type:int"`
	CreatedAt    int64 `json:"created_at" gorm:"bigint"`
}

type InviteeItem struct {
	Username        string `json:"username"`
	InvitedAt       int64  `json:"invited_at"`
	CreatedAt       int64  `json:"created_at"`
	TotalCommission int    `json:"total_commission"`
}

type InviteeListResult struct {
	Page     int           `json:"page"`
	PageSize int           `json:"page_size"`
	Total    int64         `json:"total"`
	Items    []InviteeItem `json:"items"`
}

type AffDashboard struct {
	CommissionEnabled bool                `json:"commission_enabled"`
	CurrentRate       int                 `json:"current_rate"`
	DefaultRate       int                 `json:"default_rate"`
	Tiers             []AffCommissionTier `json:"tiers"`
	CurrentTier       *AffCommissionTier  `json:"current_tier"`
	NextTier          *AffCommissionTier  `json:"next_tier"`
	Progress          float64             `json:"progress"`
	Remaining         int                 `json:"remaining"`
	AffHistoryQuota   int                 `json:"aff_history_quota"`
}

// MaskUsername 用户名脱敏
func MaskUsername(username string) string {
	username = strings.TrimSpace(username)
	if username == "" {
		return "***"
	}

	if strings.Contains(username, "@") {
		parts := strings.SplitN(username, "@", 2)
		local := parts[0]
		domain := parts[1]

		localRunes := []rune(local)
		if len(localRunes) >= 2 {
			return string(localRunes[:2]) + "***@" + domain
		}
		if len(localRunes) == 1 {
			return string(localRunes[:1]) + "***@" + domain
		}
		return "***@" + domain
	}

	runes := []rune(username)
	n := len(runes)
	if n < 4 {
		return string(runes[:1]) + "***"
	}
	return string(runes[:2]) + "***" + string(runes[n-2:])
}

// GetAffDashboard 返回返佣配置 + 阶梯 + 进度
func GetAffDashboard(inviterId int) (*AffDashboard, error) {
	inviter, err := GetUserById(inviterId, true)
	if err != nil {
		return nil, err
	}

	dashboard := &AffDashboard{
		CommissionEnabled: common.AffCommissionEnabled,
		DefaultRate:       common.AffCommissionRate,
		AffHistoryQuota:   inviter.AffHistoryQuota,
	}

	// 解析阶梯
	if common.AffCommissionTiers != "" {
		tiers, parseErr := ParseAffCommissionTiers(common.AffCommissionTiers)
		if parseErr == nil && len(tiers) > 0 {
			dashboard.Tiers = tiers
		}
	}
	if dashboard.Tiers == nil {
		dashboard.Tiers = []AffCommissionTier{}
	}

	// 计算当前比例
	dashboard.CurrentRate = GetAffCommissionRate(inviter.AffHistoryQuota)

	// 计算当前阶梯和下一阶梯
	if len(dashboard.Tiers) > 0 {
		for i := len(dashboard.Tiers) - 1; i >= 0; i-- {
			if inviter.AffHistoryQuota >= dashboard.Tiers[i].Threshold {
				dashboard.CurrentTier = &dashboard.Tiers[i]
				if i+1 < len(dashboard.Tiers) {
					dashboard.NextTier = &dashboard.Tiers[i+1]
				}
				break
			}
		}
		// 未达到任何阶梯
		if dashboard.CurrentTier == nil && len(dashboard.Tiers) > 0 {
			dashboard.NextTier = &dashboard.Tiers[0]
		}
	}

	// 计算进度
	if dashboard.NextTier != nil {
		total := dashboard.NextTier.Threshold
		if total > 0 {
			dashboard.Progress = math.Min(float64(inviter.AffHistoryQuota)/float64(total)*100, 100)
			dashboard.Remaining = total - inviter.AffHistoryQuota
			if dashboard.Remaining < 0 {
				dashboard.Remaining = 0
			}
		}
	} else if dashboard.CurrentTier != nil {
		// 已达最高阶梯
		dashboard.Progress = 100
		dashboard.Remaining = 0
	}

	return dashboard, nil
}

// GetInviteeList 分页查询被邀请用户列表 + 每人累计佣金
func GetInviteeList(inviterId int, page int, pageSize int) (*InviteeListResult, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 10
	}

	// 查询总数
	var total int64
	if err := DB.Model(&User{}).Where("inviter_id = ?", inviterId).Count(&total).Error; err != nil {
		return nil, err
	}

	result := &InviteeListResult{
		Page:     page,
		PageSize: pageSize,
		Total:    total,
		Items:    []InviteeItem{},
	}

	if total == 0 {
		return result, nil
	}

	// 分页查询被邀请用户
	type inviteeRow struct {
		Id       int
		Username string
	}
	var invitees []inviteeRow
	offset := (page - 1) * pageSize
	err := DB.Model(&User{}).Select("id, username").
		Where("inviter_id = ?", inviterId).
		Order("id DESC").
		Offset(offset).Limit(pageSize).
		Find(&invitees).Error
	if err != nil {
		return nil, err
	}

	if len(invitees) == 0 {
		return result, nil
	}

	// 收集 invitee IDs
	ids := make([]int, len(invitees))
	for i, inv := range invitees {
		ids[i] = inv.Id
	}

	// 批量查询每人累计佣金
	type commissionSum struct {
		InviteeId         int   `gorm:"column:invitee_id"`
		TotalCommission   int   `gorm:"column:total_commission"`
		FirstCommissionAt int64 `gorm:"column:first_commission_at"`
	}
	var commissions []commissionSum
	if err = DB.Model(&AffCommissionRecord{}).
		Select("invitee_id, SUM(commission) as total_commission, MIN(created_at) as first_commission_at").
		Where("inviter_id = ? AND invitee_id IN ?", inviterId, ids).
		Group("invitee_id").
		Find(&commissions).Error; err != nil {
		return nil, err
	}

	// 构建 map
	commMap := make(map[int]commissionSum, len(commissions))
	for _, c := range commissions {
		commMap[c.InviteeId] = c
	}

	// 组装结果
	for _, inv := range invitees {
		agg := commMap[inv.Id]
		result.Items = append(result.Items, InviteeItem{
			Username:        MaskUsername(inv.Username),
			InvitedAt:       agg.FirstCommissionAt,
			CreatedAt:       agg.FirstCommissionAt, // backward compatibility
			TotalCommission: agg.TotalCommission,
		})
	}

	return result, nil
}

// AdminAffUserItem 管理员查看的邀请用户概览
type AdminAffUserItem struct {
	Id              int    `json:"id"`
	Username        string `json:"username"`
	AffCode         string `json:"aff_code"`
	AffCount        int    `json:"aff_count"`
	AffQuota        int    `json:"aff_quota"`
	AffHistoryQuota int    `json:"aff_history_quota"`
	InviterId       int    `json:"inviter_id"`
	InviterUsername  string `json:"inviter_username"`
}

// AdminAffInviteeItem 管理员查看的被邀请人详情（不脱敏）
type AdminAffInviteeItem struct {
	Id              int    `json:"id"`
	Username        string `json:"username"`
	CreatedAt       int64  `json:"created_at"`
	TotalCommission int    `json:"total_commission"`
}

// GetAdminAffUsers 管理员查询有邀请关系的用户列表（带搜索）
func GetAdminAffUsers(keyword string, page int, pageSize int, sortField string, sortOrder string) ([]AdminAffUserItem, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 10
	}

	query := DB.Model(&User{}).Where("aff_count > 0 OR inviter_id > 0 OR aff_history > 0 OR aff_quota > 0")
	if keyword != "" {
		escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(keyword)
		query = query.Where("username LIKE ? OR aff_code LIKE ?", "%"+escaped+"%", "%"+escaped+"%")
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	type userRow struct {
		Id              int
		Username        string
		AffCode         string
		AffCount        int
		AffQuota        int
		AffHistoryQuota int `gorm:"column:aff_history"`
		InviterId       int
	}
	var rows []userRow
	offset := (page - 1) * pageSize
	// 排序白名单
	allowedSortFields := map[string]string{
		"id":                "id",
		"aff_count":         "aff_count",
		"aff_quota":         "aff_quota",
		"aff_history_quota": "aff_history",
	}
	orderClause := "aff_count DESC, id DESC"
	if col, ok := allowedSortFields[sortField]; ok {
		dir := "DESC"
		if sortOrder == "asc" {
			dir = "ASC"
		}
		orderClause = col + " " + dir + ", id DESC"
	}
	if err := query.Select("id, username, aff_code, aff_count, aff_quota, aff_history, inviter_id").
		Order(orderClause).
		Offset(offset).Limit(pageSize).
		Find(&rows).Error; err != nil {
		return nil, 0, err
	}

	// 收集所有 inviter_id 批量查用户名
	inviterIds := make([]int, 0, len(rows))
	for _, r := range rows {
		if r.InviterId > 0 {
			inviterIds = append(inviterIds, r.InviterId)
		}
	}
	inviterNameMap := make(map[int]string)
	if len(inviterIds) > 0 {
		type nameRow struct {
			Id       int
			Username string
		}
		var names []nameRow
		if err := DB.Model(&User{}).Select("id, username").Where("id IN ?", inviterIds).Find(&names).Error; err != nil {
			common.SysError("failed to query inviter names: " + err.Error())
		}
		for _, n := range names {
			inviterNameMap[n.Id] = n.Username
		}
	}

	items := make([]AdminAffUserItem, len(rows))
	for i, r := range rows {
		items[i] = AdminAffUserItem{
			Id:              r.Id,
			Username:        r.Username,
			AffCode:         r.AffCode,
			AffCount:        r.AffCount,
			AffQuota:        r.AffQuota,
			AffHistoryQuota: r.AffHistoryQuota,
			InviterId:       r.InviterId,
			InviterUsername:  inviterNameMap[r.InviterId],
		}
	}

	return items, total, nil
}

// GetAdminInviteeList 管理员查看某用户邀请的所有人（不脱敏）
func GetAdminInviteeList(inviterId int, page int, pageSize int) ([]AdminAffInviteeItem, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 10
	}

	var total int64
	if err := DB.Model(&User{}).Where("inviter_id = ?", inviterId).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if total == 0 {
		return []AdminAffInviteeItem{}, 0, nil
	}

	type inviteeRow struct {
		Id       int
		Username string
	}
	var invitees []inviteeRow
	offset := (page - 1) * pageSize
	if err := DB.Model(&User{}).Select("id, username").
		Where("inviter_id = ?", inviterId).
		Order("id DESC").
		Offset(offset).Limit(pageSize).
		Find(&invitees).Error; err != nil {
		return nil, 0, err
	}

	ids := make([]int, len(invitees))
	for i, inv := range invitees {
		ids[i] = inv.Id
	}

	// 批量查询每人累计佣金
	type commissionSum struct {
		InviteeId         int   `gorm:"column:invitee_id"`
		TotalCommission   int   `gorm:"column:total_commission"`
		FirstCommissionAt int64 `gorm:"column:first_commission_at"`
	}
	var commissions []commissionSum
	if err := DB.Model(&AffCommissionRecord{}).
		Select("invitee_id, SUM(commission) as total_commission, MIN(created_at) as first_commission_at").
		Where("inviter_id = ? AND invitee_id IN ?", inviterId, ids).
		Group("invitee_id").
		Find(&commissions).Error; err != nil {
		return nil, 0, err
	}

	commMap := make(map[int]commissionSum, len(commissions))
	for _, c := range commissions {
		commMap[c.InviteeId] = c
	}

	items := make([]AdminAffInviteeItem, len(invitees))
	for i, inv := range invitees {
		agg := commMap[inv.Id]
		items[i] = AdminAffInviteeItem{
			Id:              inv.Id,
			Username:        inv.Username,
			CreatedAt:       agg.FirstCommissionAt,
			TotalCommission: agg.TotalCommission,
		}
	}

	return items, total, nil
}

// AdminCommissionRecordItem 管理员查看的返佣记录（含被邀请人用户名）
type AdminCommissionRecordItem struct {
	Id              int    `json:"id"`
	InviterId       int    `json:"inviter_id"`
	InviteeId       int    `json:"invitee_id"`
	InviteeUsername  string `json:"invitee_username"`
	Commission      int    `json:"commission"`
	ConsumeQuota    int    `json:"consume_quota"`
	Rate            int    `json:"rate"`
	CreatedAt       int64  `json:"created_at"`
}

// GetAdminCommissionRecords 管理员查看某用户的返佣明细
func GetAdminCommissionRecords(inviterId int, page int, pageSize int) ([]AdminCommissionRecordItem, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 10
	}

	var total int64
	if err := DB.Model(&AffCommissionRecord{}).Where("inviter_id = ?", inviterId).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if total == 0 {
		return []AdminCommissionRecordItem{}, 0, nil
	}

	var records []AffCommissionRecord
	offset := (page - 1) * pageSize
	if err := DB.Where("inviter_id = ?", inviterId).
		Order("created_at DESC").
		Offset(offset).Limit(pageSize).
		Find(&records).Error; err != nil {
		return nil, 0, err
	}

	// 批量查询被邀请人用户名
	inviteeIds := make([]int, len(records))
	for i, r := range records {
		inviteeIds[i] = r.InviteeId
	}
	type nameRow struct {
		Id       int
		Username string
	}
	var names []nameRow
	DB.Model(&User{}).Select("id, username").Where("id IN ?", inviteeIds).Find(&names)
	nameMap := make(map[int]string, len(names))
	for _, n := range names {
		nameMap[n.Id] = n.Username
	}

	items := make([]AdminCommissionRecordItem, len(records))
	for i, r := range records {
		items[i] = AdminCommissionRecordItem{
			Id:              r.Id,
			InviterId:       r.InviterId,
			InviteeId:       r.InviteeId,
			InviteeUsername:  nameMap[r.InviteeId],
			Commission:      r.Commission,
			ConsumeQuota:    r.ConsumeQuota,
			Rate:            r.Rate,
			CreatedAt:       r.CreatedAt,
		}
	}

	return items, total, nil
}

// CreateAffCommissionRecord 创建返佣记录
func CreateAffCommissionRecord(db *gorm.DB, inviterId int, inviteeId int, commission int, consumeQuota int, rate int) error {
	if db == nil {
		db = DB
	}

	record := &AffCommissionRecord{
		InviterId:    inviterId,
		InviteeId:    inviteeId,
		Commission:   commission,
		ConsumeQuota: consumeQuota,
		Rate:         rate,
		CreatedAt:    time.Now().Unix(),
	}
	return db.Create(record).Error
}
