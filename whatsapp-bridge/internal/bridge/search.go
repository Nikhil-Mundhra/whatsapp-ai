package bridge

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"
)

var (
	htmlTagRegex       = regexp.MustCompile(`<[^>]*>`)
	scriptTagRegex     = regexp.MustCompile(`(?is)<script.*?>.*?</script>`)
	styleTagRegex      = regexp.MustCompile(`(?is)<style.*?>.*?</style>`)
	interrogativeRegex = regexp.MustCompile(`(?i)\b(where is|where are|what time|when is|when does|how much|how many|who is|who won|score of|weather in|temperature in|address of|location of|hours for|open until|opening time|menu at|latest news|release date)\b`)
	intimateKeywords   = map[string]bool{
		"partner": true, "spouse": true, "wife": true, "husband": true,
		"girlfriend": true, "boyfriend": true, "close friend": true, "best friend": true,
	}
)

// ScoredSnippet represents a web search snippet with its semantic relevance score.
type ScoredSnippet struct {
	Snippet    string
	Similarity float64
}

// CleanHTMLContent strips scripts, styles, and HTML tags, returning plain text.
func CleanHTMLContent(html string) string {
	noScripts := scriptTagRegex.ReplaceAllString(html, " ")
	noStyles := styleTagRegex.ReplaceAllString(noScripts, " ")
	noTags := htmlTagRegex.ReplaceAllString(noStyles, " ")
	return CleanTextContent(noTags)
}

// EvaluateSearchHeuristicGate implements the Triple-Lock Heuristic Gate.
// Returns true if the message demands real-time external fact search.
func EvaluateSearchHeuristicGate(text string, relationship string) bool {
	cleaned := CleanTextContent(text)
	if cleaned == "" {
		return false
	}
	lower := strings.ToLower(cleaned)

	// Lock 1: Intimacy & Relationship Guard
	relLower := strings.ToLower(strings.TrimSpace(relationship))
	isIntimate := intimateKeywords[relLower]

	hasExplicitFactInterrogative := interrogativeRegex.MatchString(lower)

	if isIntimate && !hasExplicitFactInterrogative {
		// Suppress search on casual / emotional conversation with intimate partners
		return false
	}

	// Lock 2: Entity & Temporal Interrogative Gate
	if !hasExplicitFactInterrogative {
		// Check for common factual indicators like currency, temperature, or specific query suffixes
		if !strings.Contains(lower, "hours") && !strings.Contains(lower, "timing") &&
			!strings.Contains(lower, "location") && !strings.Contains(lower, "price") &&
			!strings.Contains(lower, "weather") && !strings.Contains(lower, "score") {
			return false
		}
	}

	// Lock 3: Semantic Signal Check (ignore very short trivial texts)
	words := strings.Fields(lower)
	if len(words) < 3 {
		return false
	}

	return true
}

// ScrapeDuckDuckGoLite performs a zero-cost scrape of DuckDuckGo Lite.
func ScrapeDuckDuckGoLite(query string) ([]string, error) {
	if strings.TrimSpace(query) == "" {
		return nil, fmt.Errorf("empty search query")
	}

	form := url.Values{}
	form.Set("q", query)

	req, err := http.NewRequest("POST", "https://lite.duckduckgo.com/lite/", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, fmt.Errorf("failed to build search request: %v", err)
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("search request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("search returned HTTP %d", resp.StatusCode)
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read search response: %v", err)
	}

	return ExtractSnippetsFromDDGHTML(string(bodyBytes)), nil
}

// ExtractSnippetsFromDDGHTML extracts text snippets from DuckDuckGo Lite HTML.
func ExtractSnippetsFromDDGHTML(htmlContent string) []string {
	var snippets []string

	// DDG Lite snippet classes: result-snippet or td.result-snippet
	snippetRegex := regexp.MustCompile(`(?is)<td class=['"]result-snippet['"]>(.*?)</td>`)
	matches := snippetRegex.FindAllStringSubmatch(htmlContent, 10)

	for _, m := range matches {
		if len(m) > 1 {
			cleaned := CleanHTMLContent(m[1])
			if len(cleaned) > 20 && !strings.Contains(cleaned, "DuckDuckGo") {
				snippets = append(snippets, cleaned)
			}
		}
	}

	// Fallback if specific classes are altered: extract general table row text
	if len(snippets) == 0 {
		rowRegex := regexp.MustCompile(`(?is)<tr>(.*?)</tr>`)
		rows := rowRegex.FindAllStringSubmatch(htmlContent, 20)
		for _, r := range rows {
			if len(r) > 1 {
				cleaned := CleanHTMLContent(r[1])
				if len(cleaned) > 40 && len(strings.Fields(cleaned)) > 6 && !strings.Contains(cleaned, "DuckDuckGo") {
					snippets = append(snippets, cleaned)
				}
			}
		}
	}

	return snippets
}

// SemanticFilterSnippets ranks scraped snippets using cosine similarity against query embedding.
func (t *Tenant) SemanticFilterSnippets(query string, rawSnippets []string, apiKey string) []string {
	if len(rawSnippets) == 0 || query == "" {
		return nil
	}

	queryEmb, err := t.generateEmbedding(apiKey, query)
	if err != nil || len(queryEmb) == 0 {
		// Fallback to local pseudo embedding
		queryEmb = FastTextPseudoEmbedding(query)
	}

	var scored []ScoredSnippet
	for _, snip := range rawSnippets {
		if !IsHighSignalMemory(snip) {
			continue
		}

		snipEmb, err := t.generateEmbedding(apiKey, snip)
		if err != nil || len(snipEmb) == 0 {
			snipEmb = FastTextPseudoEmbedding(snip)
		}

		sim := CosineSimilarity(queryEmb, snipEmb)
		// Strict quality cutoff (0.65)
		if sim >= 0.65 {
			scored = append(scored, ScoredSnippet{
				Snippet:    snip,
				Similarity: sim,
			})
		}
	}

	if len(scored) == 0 {
		return nil
	}

	// Sort by similarity descending
	sort.Slice(scored, func(i, j int) bool {
		return scored[i].Similarity > scored[j].Similarity
	})

	// Return top 2 highest-signal snippets
	limit := 2
	if len(scored) < limit {
		limit = len(scored)
	}

	results := make([]string, limit)
	for i := 0; i < limit; i++ {
		results[i] = scored[i].Snippet
	}
	return results
}

// FormatSearchGrounding builds the [SEARCH_GROUNDING] context block for LLM prompt.
func FormatSearchGrounding(query string, snippets []string) string {
	if len(snippets) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("[SEARCH_GROUNDING]\n")
	sb.WriteString(fmt.Sprintf("- Verified Query: %s\n", query))
	sb.WriteString("- Factual Knowledge Snippets:\n")
	for i, snip := range snippets {
		sb.WriteString(fmt.Sprintf("  %d. %s\n", i+1, snip))
	}
	sb.WriteString("- Grounding Rule: Ground any factual assertions strictly in the snippets above. Never fabricate unverified timings, dates, scores, or locations.\n")

	return sb.String()
}
