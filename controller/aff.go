package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// GetAffDashboard 返回返佣配置 + 阶梯 + 进度
func GetAffDashboard(c *gin.Context) {
	userId := c.GetInt("id")
	dashboard, err := model.GetAffDashboard(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, dashboard)
}

// GetAffInvitees 分页返回被邀请用户列表 + 每人佣金
func GetAffInvitees(c *gin.Context) {
	userId := c.GetInt("id")
	pageInfo := common.GetPageQuery(c)
	result, err := model.GetInviteeList(userId, pageInfo.Page, pageInfo.PageSize)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

// AdminGetAffUsers 管理员查看所有有邀请关系的用户
func AdminGetAffUsers(c *gin.Context) {
	keyword := c.Query("keyword")
	pageInfo := common.GetPageQuery(c)
	items, total, err := model.GetAdminAffUsers(keyword, pageInfo.Page, pageInfo.PageSize)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

// AdminGetAffInvitees 管理员查看某用户邀请了哪些人
func AdminGetAffInvitees(c *gin.Context) {
	userId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorMsg(c, "invalid user id")
		return
	}
	pageInfo := common.GetPageQuery(c)
	items, total, err := model.GetAdminInviteeList(userId, pageInfo.Page, pageInfo.PageSize)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

// AdminGetAffRecords 管理员查看某用户的返佣明细
func AdminGetAffRecords(c *gin.Context) {
	userId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorMsg(c, "invalid user id")
		return
	}
	pageInfo := common.GetPageQuery(c)
	items, total, err := model.GetAdminCommissionRecords(userId, pageInfo.Page, pageInfo.PageSize)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}
