package model

import (
	"reflect"
	"testing"

	"github.com/QuantumNous/new-api/common"
)

func TestParseAffCommissionTiersSortAndMerge(t *testing.T) {
	raw := `[{"threshold":50000,"rate":15},{"threshold":10000,"rate":8},{"threshold":10000,"rate":10}]`
	tiers, err := ParseAffCommissionTiers(raw)
	if err != nil {
		t.Fatalf("ParseAffCommissionTiers failed: %v", err)
	}

	expected := []AffCommissionTier{
		{Threshold: 10000, Rate: 10},
		{Threshold: 50000, Rate: 15},
	}
	if !reflect.DeepEqual(tiers, expected) {
		t.Fatalf("unexpected tiers: got=%v want=%v", tiers, expected)
	}
}

func TestParseAffCommissionTiersInvalidRate(t *testing.T) {
	raw := `[{"threshold":10000,"rate":101}]`
	_, err := ParseAffCommissionTiers(raw)
	if err == nil {
		t.Fatal("expected error for invalid rate, got nil")
	}
}

func TestNormalizeAffCommissionTiersJSON(t *testing.T) {
	raw := `[{"threshold":50000,"rate":20},{"threshold":10000,"rate":10}]`
	normalized, err := NormalizeAffCommissionTiersJSON(raw)
	if err != nil {
		t.Fatalf("NormalizeAffCommissionTiersJSON failed: %v", err)
	}
	want := `[{"threshold":10000,"rate":10},{"threshold":50000,"rate":20}]`
	if normalized != want {
		t.Fatalf("unexpected normalized tiers: got=%s want=%s", normalized, want)
	}
}

func TestGetAffCommissionRate(t *testing.T) {
	oldRate := common.AffCommissionRate
	oldTiers := common.AffCommissionTiers
	defer func() {
		common.AffCommissionRate = oldRate
		common.AffCommissionTiers = oldTiers
	}()

	common.AffCommissionRate = 5
	common.AffCommissionTiers = `[{"threshold":50000,"rate":20},{"threshold":10000,"rate":10}]`

	if got := GetAffCommissionRate(9000); got != 5 {
		t.Fatalf("rate for 9000 should be 5, got %d", got)
	}
	if got := GetAffCommissionRate(10000); got != 10 {
		t.Fatalf("rate for 10000 should be 10, got %d", got)
	}
	if got := GetAffCommissionRate(60000); got != 20 {
		t.Fatalf("rate for 60000 should be 20, got %d", got)
	}
}

func TestGetAffCommissionRateClampDefault(t *testing.T) {
	oldRate := common.AffCommissionRate
	oldTiers := common.AffCommissionTiers
	defer func() {
		common.AffCommissionRate = oldRate
		common.AffCommissionTiers = oldTiers
	}()

	common.AffCommissionRate = 120
	common.AffCommissionTiers = ""
	if got := GetAffCommissionRate(0); got != 100 {
		t.Fatalf("default rate should be clamped to 100, got %d", got)
	}
}

func TestMaskUsername(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{in: "", want: "***"},
		{in: "a", want: "a***"},
		{in: "abcd", want: "ab***cd"},
		{in: "user@example.com", want: "us***@example.com"},
		{in: "@example.com", want: "***@example.com"},
	}

	for _, tt := range tests {
		if got := MaskUsername(tt.in); got != tt.want {
			t.Fatalf("MaskUsername(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}
