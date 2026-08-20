package main

import (
	"encoding/binary"
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"
)

var (
	bracketTagRegex = regexp.MustCompile(`\[.*?\]`)
	nonWordRegex    = regexp.MustCompile(`[^\p{L}\p{N}\s]`)
	multiSpaceRegex = regexp.MustCompile(`\s+`)
)

// Low-information stopwords / purely conversational fillers in multiple languages.
var lowInfoPhrases = map[string]bool{
	"ok": true, "k": true, "kk": true, "okay": true, "okie": true, "hmm": true, "hmmm": true,
	"hmmmm": true, "ya": true, "yaa": true, "yaaa": true, "yeah": true, "yes": true, "yep": true,
	"yess": true, "yesss": true, "no": true, "nope": true, "nah": true, "haha": true, "hahaha": true,
	"hahahaha": true, "lol": true, "lmao": true, "rofl": true, "nice": true, "cool": true, "great": true,
	"good": true, "gn": true, "gm": true, "goodnight": true, "goodnightttt": true, "good night": true,
	"sweet dreams": true, "sweet dreamsssss": true, "bye": true, "byee": true, "mwah": true,
	"mwahh": true, "mwahhh": true, "mwahhhh": true, "tc": true, "take care": true, "sure": true,
	"done": true, "theek hai": true, "haan": true, "sahi hai": true, "achha": true,
}

// CosineSimilarity computes cosine similarity between two float32 vectors.
func CosineSimilarity(a, b []float32) float64 {
	if len(a) == 0 || len(b) == 0 || len(a) != len(b) {
		return 0
	}
	var dotProduct float64
	var normA float64
	var normB float64

	for i := 0; i < len(a); i++ {
		valA := float64(a[i])
		valB := float64(b[i])
		dotProduct += valA * valB
		normA += valA * valA
		normB += valB * valB
	}

	if normA == 0 || normB == 0 {
		return 0
	}
	return dotProduct / (math.Sqrt(normA) * math.Sqrt(normB))
}

// Float32SliceToBytes converts a float32 slice to a compact byte slice for SQLite BLOB storage.
func Float32SliceToBytes(floats []float32) []byte {
	buf := make([]byte, len(floats)*4)
	for i, f := range floats {
		binary.LittleEndian.PutUint32(buf[i*4:], math.Float32bits(f))
	}
	return buf
}

// BytesToFloat32Slice converts bytes back to a float32 slice.
func BytesToFloat32Slice(b []byte) []float32 {
	if len(b)%4 != 0 {
		return nil
	}
	floats := make([]float32, len(b)/4)
	for i := 0; i < len(floats); i++ {
		bits := binary.LittleEndian.Uint32(b[i*4:])
		floats[i] = math.Float32frombits(bits)
	}
	return floats
}

// CleanTextContent strips bracketed protocol tags, cleans whitespace, and returns plain text.
func CleanTextContent(text string) string {
	cleaned := bracketTagRegex.ReplaceAllString(text, " ")
	cleaned = multiSpaceRegex.ReplaceAllString(cleaned, " ")
	return strings.TrimSpace(cleaned)
}

// IsHighSignalMemory checks whether a snippet has sufficient meaningful semantic information.
// Returns false for pure emojis, short acknowledgements, protocol tags, and trivial fillers.
func IsHighSignalMemory(text string) bool {
	cleaned := CleanTextContent(text)
	if cleaned == "" {
		return false
	}

	// Remove all punctuation & symbols to inspect word tokens
	alphaOnly := nonWordRegex.ReplaceAllString(cleaned, " ")
	alphaOnly = multiSpaceRegex.ReplaceAllString(alphaOnly, " ")
	words := strings.Fields(strings.ToLower(alphaOnly))

	// Filter out if fewer than 4 substantive words
	if len(words) < 4 {
		return false
	}

	// Count meaningful non-filler words
	meaningfulWords := 0
	for _, w := range words {
		if !lowInfoPhrases[w] && len(w) > 1 {
			meaningfulWords++
		}
	}

	// Must have at least 3 distinct meaningful non-filler words
	return meaningfulWords >= 3
}

// SemanticChunk represents a coherent group of consecutive messages within a short time window.
type SemanticChunk struct {
	ID        string
	ChatJID   string
	Speaker   string
	Snippet   string
	Timestamp time.Time
	MsgIDs    []string
}

// BuildConversationChunks groups messages into coherent multi-turn dialogue chunks
// (messages within 3 minutes of each other).
func BuildConversationChunks(msgs []Message, chatJID, contactName string, maxGap time.Duration) []SemanticChunk {
	if len(msgs) == 0 {
		return nil
	}

	if maxGap <= 0 {
		maxGap = 3 * time.Minute
	}

	var chunks []SemanticChunk
	var currentLines []string
	var currentMsgIDs []string
	var chunkStartTime time.Time
	var lastMsgTime time.Time

	flushChunk := func() {
		if len(currentLines) == 0 {
			return
		}
		combinedSnippet := strings.Join(currentLines, "\n")
		if IsHighSignalMemory(combinedSnippet) {
			speakerLabel := contactName
			if speakerLabel == "" {
				speakerLabel = "Contact"
			}
			chunkID := fmt.Sprintf("chunk_%s_%d", chatJID, chunkStartTime.UnixNano())
			chunks = append(chunks, SemanticChunk{
				ID:        chunkID,
				ChatJID:   chatJID,
				Speaker:   speakerLabel,
				Snippet:   combinedSnippet,
				Timestamp: chunkStartTime,
				MsgIDs:    currentMsgIDs,
			})
		}
		currentLines = nil
		currentMsgIDs = nil
	}

	// Process messages in chronological order (oldest to newest)
	for i := len(msgs) - 1; i >= 0; i-- {
		m := msgs[i]
		cleanText := CleanTextContent(m.Content)
		if cleanText == "" {
			continue
		}

		speaker := "Me"
		if !m.IsFromMe {
			if contactName != "" {
				speaker = contactName
			} else {
				speaker = "Contact"
			}
		}

		line := fmt.Sprintf("%s: %s", speaker, cleanText)

		if len(currentLines) == 0 {
			chunkStartTime = m.Time
			lastMsgTime = m.Time
			currentLines = append(currentLines, line)
			if m.Filename != "" {
				currentMsgIDs = append(currentMsgIDs, m.Filename)
			}
			continue
		}

		// If time difference is greater than maxGap or chunk is getting long, start a new chunk
		if m.Time.Sub(lastMsgTime) > maxGap || len(currentLines) >= 6 {
			flushChunk()
			chunkStartTime = m.Time
		}

		lastMsgTime = m.Time
		currentLines = append(currentLines, line)
	}

	flushChunk()
	return chunks
}

// ScoredMemory represents a semantic memory with its cosine similarity score.
type ScoredMemory struct {
	Memory     SemanticMemory
	Similarity float64
}

// FormatSemanticMemories renders ranked semantic memories for injection into LLM prompts.
func FormatSemanticMemories(memories []ScoredMemory) string {
	if len(memories) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("\nRELEVANT HISTORICAL CONTEXT & MEMORIES (SEMANTIC SEARCH):\n")
	sb.WriteString("- Use these verified past conversations and memories for personal context, facts, inside jokes, and continuity.\n")
	sb.WriteString("- Do not quote them verbatim unless natural.\n\n")

	for i, sm := range memories {
		dateStr := sm.Memory.Timestamp.Format("2006-01-02")
		sb.WriteString(fmt.Sprintf("[Memory %d - Context from %s (Relevance: %.2f)]:\n", i+1, dateStr, sm.Similarity))
		lines := strings.Split(sm.Memory.Snippet, "\n")
		for _, line := range lines {
			if strings.TrimSpace(line) != "" {
				sb.WriteString(fmt.Sprintf("  %s\n", strings.TrimSpace(line)))
			}
		}
		sb.WriteString("\n")
	}

	return strings.TrimRight(sb.String(), "\n")
}

// FastTextPseudoEmbedding generates a fast, deterministic bag-of-words / character n-gram
// normalized 64-dimensional float vector for local offline semantic similarity matching.
func FastTextPseudoEmbedding(text string) []float32 {
	const dim = 64
	vec := make([]float32, dim)
	cleaned := strings.ToLower(CleanTextContent(text))
	words := strings.Fields(cleaned)

	for _, w := range words {
		// Word hash projection
		var h uint32 = 2166136261
		for _, r := range w {
			h ^= uint32(r)
			h *= 16777619
		}
		idx := int(h % dim)
		vec[idx] += 1.0

		// Character trigrams
		runes := []rune(w)
		for i := 0; i+2 < len(runes); i++ {
			var th uint32 = 2166136261
			for j := 0; j < 3; j++ {
				th ^= uint32(runes[i+j])
				th *= 16777619
			}
			tidx := int(th % dim)
			vec[tidx] += 0.5
		}
	}

	// L2 normalization
	var norm float32
	for _, v := range vec {
		norm += v * v
	}
	if norm > 0 {
		scale := float32(1.0 / math.Sqrt(float64(norm)))
		for i := range vec {
			vec[i] *= scale
		}
	}
	return vec
}
