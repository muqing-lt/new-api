package system_setting

import "github.com/QuantumNous/new-api/setting/config"

type LegalSettings struct {
	UserAgreement  string `json:"user_agreement"`
	PrivacyPolicy  string `json:"privacy_policy"`
	TopupAgreement string `json:"topup_agreement"`
}

var defaultLegalSettings = LegalSettings{
	UserAgreement:  "",
	PrivacyPolicy:  "",
	TopupAgreement: "",
}

func init() {
	config.GlobalConfig.Register("legal", &defaultLegalSettings)
}

func GetLegalSettings() *LegalSettings {
	return &defaultLegalSettings
}
