package bridge

import (
	"strings"
	"testing"
)

func TestExtractSnippetsFromDDGHTML(t *testing.T) {
	mockHTML := `<!DOCTYPE html>
<html>
<body>
<table>
<tr>
  <td class="result-snippet">Blue Bottle Coffee Mint Plaza is located at 66 Mint Plaza, San Francisco. Open daily from 7:00 AM to 6:00 PM.</td>
</tr>
<tr>
  <td class="result-snippet">Specialty coffee roaster offering espresso drinks, pour overs, and fresh pastries in a modern setting.</td>
</tr>
</table>
</body>
</html>`

	snippets := ExtractSnippetsFromDDGHTML(mockHTML)
	if len(snippets) != 2 {
		t.Fatalf("expected 2 snippets, got %d", len(snippets))
	}

	if !strings.Contains(snippets[0], "Blue Bottle Coffee Mint Plaza") {
		t.Errorf("expected snippet 1 content, got: %s", snippets[0])
	}
	if !strings.Contains(snippets[1], "Specialty coffee roaster") {
		t.Errorf("expected snippet 2 content, got: %s", snippets[1])
	}
}

func TestEvaluateSearchHeuristicGate(t *testing.T) {
	cases := []struct {
		text         string
		relationship string
		expected     bool
	}{
		{"What time does Blue Bottle Coffee open?", "Acquaintance", true},
		{"Where is the nearest Indian restaurant?", "Colleague", true},
		{"Weather in San Francisco tomorrow", "Friend", true},
		// Intimate partner with emotional/casual text -> bypass
		{"I am feeling super tired today baby", "Partner", false},
		{"Good night sweet dreams!", "Spouse", false},
		// Intimate partner with explicit factual query -> trigger
		{"What time does the grocery store close tonight?", "Partner", true},
		// Short trivial banter -> bypass
		{"haha ok", "Friend", false},
	}

	for _, c := range cases {
		got := EvaluateSearchHeuristicGate(c.text, c.relationship)
		if got != c.expected {
			t.Errorf("EvaluateSearchHeuristicGate(%q, %q) = %v, expected %v", c.text, c.relationship, got, c.expected)
		}
	}
}

func TestFormatSearchGrounding(t *testing.T) {
	snippets := []string{
		"Blue Bottle Coffee is open 7 AM to 6 PM.",
		"Located on Mint Plaza in downtown SF.",
	}
	formatted := FormatSearchGrounding("Blue Bottle Coffee hours", snippets)

	if !strings.Contains(formatted, "[SEARCH_GROUNDING]") {
		t.Errorf("expected header [SEARCH_GROUNDING], got: %s", formatted)
	}
	if !strings.Contains(formatted, "Blue Bottle Coffee is open 7 AM to 6 PM.") {
		t.Errorf("expected snippet in formatted block, got: %s", formatted)
	}
	if !strings.Contains(formatted, "Grounding Rule:") {
		t.Errorf("expected Grounding Rule in formatted block, got: %s", formatted)
	}
}
