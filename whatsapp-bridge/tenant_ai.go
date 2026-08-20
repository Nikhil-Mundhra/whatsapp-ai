package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"go.mau.fi/whatsmeow/types"
)

// applyWebGrant activates a takeover grant triggered from the Web Dashboard.
func (t *Tenant) applyWebGrant(choice, contact string) {
	t.mu.Lock()
	var targetJID types.JID
	if contact != "" {
		if strings.HasSuffix(contact, "@g.us") || strings.HasSuffix(contact, "@s.whatsapp.net") || strings.HasSuffix(contact, "@lid") {
			if jid, err := types.ParseJID(contact); err == nil {
				targetJID = jid
			}
		} else {
			clean := normalizePhone(contact)
			if clean != "" {
				targetJID = types.NewJID(clean, types.DefaultUserServer)
			}
		}
	}
	if targetJID.IsEmpty() && !t.lastTargetJID.IsEmpty() {
		targetJID = t.lastTargetJID
	}

	// Resolve phone number to active LID if known
	if !targetJID.IsEmpty() && t.client != nil && t.client.Store != nil && t.client.Store.LIDs != nil {
		ctx := context.Background()
		if targetJID.Server == "s.whatsapp.net" {
			if lid, err := t.client.Store.LIDs.GetLIDForPN(ctx, targetJID); err == nil && !lid.IsEmpty() {
				targetJID = lid
			}
		}
	}
	if !t.lastTargetJID.IsEmpty() && (targetJID.IsEmpty() || t.matchesTarget(t.lastTargetJID, targetJID)) {
		targetJID = t.lastTargetJID
	}

	normChoice := strings.TrimSpace(strings.ToLower(choice))
	isOneText := strings.Contains(normChoice, "1") || strings.Contains(normChoice, "1 text") || normChoice == "send 1 text"
	is5Min := strings.Contains(normChoice, "5 min") || strings.Contains(normChoice, "5 minutes")
	is2Hours := strings.Contains(normChoice, "2 hour") || strings.Contains(normChoice, "2 hr") || strings.Contains(normChoice, "2 hours")
	isDeny := strings.Contains(normChoice, "deny")

	if isOneText {
		t.grantKind = "count"
		t.grantRemaining = 1
		t.grantTargetJID = targetJID
		t.lastTargetJID = targetJID
		t.logger.Infof("Web Takeover granted for %s: 1 text (target %s)", t.Hash, targetJID)
		t.mu.Unlock()
		if !targetJID.IsEmpty() {
			go t.replyToChat(targetJID)
		}
	} else if is5Min {
		t.grantKind = "duration"
		t.grantExpiresAt = time.Now().Add(5 * time.Minute)
		t.grantTargetJID = targetJID
		t.lastTargetJID = targetJID
		t.logger.Infof("Web Takeover granted for %s: 5 minutes (until %s, target %s)", t.Hash, t.grantExpiresAt.Format("15:04:05"), targetJID)
		t.mu.Unlock()
		if !targetJID.IsEmpty() {
			go t.replyToChat(targetJID)
		}
	} else if is2Hours {
		t.grantKind = "duration"
		t.grantExpiresAt = time.Now().Add(2 * time.Hour)
		t.grantTargetJID = targetJID
		t.lastTargetJID = targetJID
		t.logger.Infof("Web Takeover granted for %s: 2 hours (until %s, target %s)", t.Hash, t.grantExpiresAt.Format("15:04:05"), targetJID)
		t.mu.Unlock()
		if !targetJID.IsEmpty() {
			go t.replyToChat(targetJID)
		}
	} else if isDeny {
		t.grantKind = "none"
		t.grantRemaining = 0
		t.grantTargetJID = types.EmptyJID
		t.logger.Infof("Web Takeover denied for %s", t.Hash)
		t.mu.Unlock()
	} else {
		t.mu.Unlock()
	}
}

// buildChatHistory formats the last N messages with appropriate sender attribution.
func (t *Tenant) buildChatHistory(msgs []Message, isGroup bool, targetJID types.JID) string {
	var historyBuilder strings.Builder
	for i := len(msgs) - 1; i >= 0; i-- {
		m := msgs[i]
		prefix := "From: " + t.resolveSenderDisplayName(m.Sender, targetJID)
		if m.IsFromMe {
			prefix = "From: Me"
		} else if isGroup {
			senderDisplayName := t.resolveSenderDisplayName(m.Sender, targetJID)
			prefix = fmt.Sprintf("[%s]", senderDisplayName)
		}
		historyBuilder.WriteString(fmt.Sprintf("%s: %s\n", prefix, m.Content))
	}
	return historyBuilder.String()
}

// buildIdentityClause constructs the self-identity prompt based on owner contact details.
func (t *Tenant) buildIdentityClause() string {
	identityClause := "You are the person who writes the messages labeled 'From: Me' in the conversation history below."
	if t.ownerPhone != "" && t.client != nil && t.client.Store != nil {
		normPhone := normalizePhone(t.ownerPhone)
		pnJID := types.NewJID(normPhone, types.DefaultUserServer)
		if contact, err := t.client.Store.Contacts.GetContact(context.Background(), pnJID); err == nil {
			if contact.FullName != "" {
				identityClause = fmt.Sprintf("You are %s, the person who writes the messages labeled 'From: Me' in the conversation history below. Your name is %s.", contact.FullName, contact.FullName)
			} else if contact.PushName != "" && !isAllDigits(contact.PushName) {
				identityClause = fmt.Sprintf("You are %s, the person who writes the messages labeled 'From: Me' in the conversation history below. Your name is %s.", contact.PushName, contact.PushName)
			}
		}
	}
	return identityClause
}

// resolveSenderDisplayName returns a clean human name for a sender, falling back to chat display name
// or clean digits, avoiding raw internal LID IDs.
func (t *Tenant) resolveSenderDisplayName(sender string, chatJID types.JID) string {
	if sender == "" {
		if !chatJID.IsEmpty() {
			return t.resolveContactDisplayName(chatJID.String())
		}
		return "Contact"
	}
	name := t.resolveContactDisplayName(sender)
	if isAllDigits(name) || name == sender {
		if !chatJID.IsEmpty() {
			chatName := t.resolveContactDisplayName(chatJID.String())
			if chatName != "" && !isAllDigits(chatName) {
				return chatName
			}
		}
		if t.messageStore != nil {
			if storedName := t.messageStore.GetChatName(sender); storedName != "" {
				return storedName
			}
			if !chatJID.IsEmpty() {
				if storedName := t.messageStore.GetChatName(chatJID.String()); storedName != "" {
					return storedName
				}
			}
		}
	}
	if isAllDigits(name) {
		clean := cleanPhoneDigits(name)
		if clean != "" {
			return clean
		}
		return "Contact"
	}
	return name
}

// resolveContactDisplayName returns a human-friendly name for a JID or phone number.
func (t *Tenant) resolveContactDisplayName(contactJID string) string {
	if contactJID == "" {
		return ""
	}
	if t.client != nil && t.client.Store != nil {
		ctx := context.Background()
		norm := normalizePhone(contactJID)
		if norm != "" {
			pnJID := types.NewJID(norm, types.DefaultUserServer)
			if c, err := t.client.Store.Contacts.GetContact(ctx, pnJID); err == nil {
				if c.FullName != "" {
					return c.FullName
				}
				if c.PushName != "" && !isAllDigits(c.PushName) {
					return c.PushName
				}
			}
		}
		// If contactJID has @lid or is numeric LID
		lidJID := contactJID
		if !strings.HasSuffix(lidJID, "@lid") && !strings.Contains(lidJID, "@") && isAllDigits(lidJID) {
			lidJID = contactJID + "@lid"
		}
		if strings.HasSuffix(lidJID, "@lid") {
			if parsed, err := types.ParseJID(lidJID); err == nil {
				if pn, err := t.client.Store.LIDs.GetPNForLID(ctx, parsed); err == nil && !pn.IsEmpty() {
					if c, err := t.client.Store.Contacts.GetContact(ctx, pn); err == nil {
						if c.FullName != "" {
							return c.FullName
						}
						if c.PushName != "" && !isAllDigits(c.PushName) {
							return c.PushName
						}
					}
				}
			}
		}
	}
	if t.messageStore != nil {
		if storedName := t.messageStore.GetChatName(contactJID); storedName != "" {
			return storedName
		}
	}
	clean := cleanPhoneDigits(contactJID)
	if clean != "" {
		return clean
	}
	return contactJID
}

// generateEmbedding computes a float32 vector embedding for text using Gemini or OpenAI API,
// falling back to local FastTextPseudoEmbedding.
func (t *Tenant) generateEmbedding(apiKey, text string) ([]float32, error) {
	if text == "" {
		return nil, fmt.Errorf("empty text")
	}

	// 1. Gemini Embedding
	if strings.HasPrefix(apiKey, "AIza") {
		endpoint := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=%s", apiKey)
		type Part struct {
			Text string `json:"text"`
		}
		type Content struct {
			Parts []Part `json:"parts"`
		}
		type Req struct {
			Model   string  `json:"model"`
			Content Content `json:"content"`
		}
		reqBody := Req{
			Model:   "models/text-embedding-004",
			Content: Content{Parts: []Part{{Text: text}}},
		}
		jsonBytes, _ := json.Marshal(reqBody)
		httpReq, err := http.NewRequest("POST", endpoint, bytes.NewReader(jsonBytes))
		if err == nil {
			httpReq.Header.Set("Content-Type", "application/json")
			client := &http.Client{Timeout: 15 * time.Second}
			resp, reqErr := client.Do(httpReq)
			if reqErr == nil {
				defer resp.Body.Close()
				bodyBytes, _ := io.ReadAll(resp.Body)
				if resp.StatusCode == http.StatusOK {
					var gRes struct {
						Embedding struct {
							Values []float32 `json:"values"`
						} `json:"embedding"`
					}
					if json.Unmarshal(bodyBytes, &gRes) == nil && len(gRes.Embedding.Values) > 0 {
						return gRes.Embedding.Values, nil
					}
				}
			}
		}
	} else if apiKey != "" {
		// 2. OpenAI / OpenRouter Embedding
		endpoint := "https://api.openai.com/v1/embeddings"
		if strings.HasPrefix(apiKey, "sk-or-") {
			endpoint = "https://openrouter.ai/api/v1/embeddings"
		}
		type Req struct {
			Model string `json:"model"`
			Input string `json:"input"`
		}
		reqBody := Req{
			Model: "text-embedding-3-small",
			Input: text,
		}
		jsonBytes, _ := json.Marshal(reqBody)
		httpReq, err := http.NewRequest("POST", endpoint, bytes.NewReader(jsonBytes))
		if err == nil {
			httpReq.Header.Set("Authorization", "Bearer "+apiKey)
			httpReq.Header.Set("Content-Type", "application/json")
			client := &http.Client{Timeout: 15 * time.Second}
			resp, reqErr := client.Do(httpReq)
			if reqErr == nil {
				defer resp.Body.Close()
				bodyBytes, _ := io.ReadAll(resp.Body)
				if resp.StatusCode == http.StatusOK {
					var oRes struct {
						Data []struct {
							Embedding []float32 `json:"embedding"`
						} `json:"data"`
					}
					if json.Unmarshal(bodyBytes, &oRes) == nil && len(oRes.Data) > 0 && len(oRes.Data[0].Embedding) > 0 {
						return oRes.Data[0].Embedding, nil
					}
				}
			}
		}
	}

	// 3. High performance local offline pseudo-embedding fallback
	return FastTextPseudoEmbedding(text), nil
}

// retrieveRelevantMemories finds high-relevance semantic past conversations while excluding
// low-information garbage and messages already present in the recent sliding window.
func (t *Tenant) retrieveRelevantMemories(targetJID types.JID, altJIDs []string, apiKey string, recentMsgs []Message) []ScoredMemory {
	if t.messageStore == nil || targetJID.IsEmpty() {
		return nil
	}

	// Build deduplication map of recent message contents
	recentTexts := make(map[string]bool)
	var latestIncomingText string
	for _, m := range recentMsgs {
		clean := CleanTextContent(m.Content)
		if clean != "" {
			recentTexts[clean] = true
		}
		if !m.IsFromMe && latestIncomingText == "" && clean != "" {
			latestIncomingText = clean
		}
	}

	if latestIncomingText == "" {
		return nil
	}

	contactName := t.resolveContactDisplayName(targetJID.String())

	// Fetch existing stored semantic memories
	memories, err := t.messageStore.GetSemanticMemories(targetJID.String(), altJIDs, 50)
	if err != nil || len(memories) < 2 {
		// Index historical messages
		allMsgs, mErr := t.messageStore.GetMessagesForIndexing(targetJID.String(), altJIDs, 100)
		if mErr == nil && len(allMsgs) > 0 {
			chunks := BuildConversationChunks(allMsgs, targetJID.String(), contactName, 3*time.Minute)
			for _, chunk := range chunks {
				emb, eErr := t.generateEmbedding(apiKey, chunk.Snippet)
				if eErr == nil && len(emb) > 0 {
					mem := &SemanticMemory{
						ID:         chunk.ID,
						ChatJID:    chunk.ChatJID,
						Speaker:    chunk.Speaker,
						Snippet:    chunk.Snippet,
						Embedding:  emb,
						Timestamp:  chunk.Timestamp,
						TokenCount: len(strings.Fields(chunk.Snippet)),
					}
					_ = t.messageStore.SaveSemanticMemory(mem)
					memories = append(memories, *mem)
				}
			}
		}
	}

	if len(memories) == 0 {
		return nil
	}

	// Generate query embedding for the latest incoming text
	queryEmb, err := t.generateEmbedding(apiKey, latestIncomingText)
	if err != nil || len(queryEmb) == 0 {
		return nil
	}

	var scored []ScoredMemory
	for _, mem := range memories {
		// Anti-garbage filtering on snippet
		if !IsHighSignalMemory(mem.Snippet) {
			continue
		}

		// Recency window deduplication: skip if any line of snippet is in recentTexts
		hasOverlap := false
		for _, line := range strings.Split(mem.Snippet, "\n") {
			parts := strings.SplitN(line, ": ", 2)
			textPart := line
			if len(parts) == 2 {
				textPart = parts[1]
			}
			if recentTexts[CleanTextContent(textPart)] {
				hasOverlap = true
				break
			}
		}
		if hasOverlap {
			continue
		}

		sim := CosineSimilarity(queryEmb, mem.Embedding)
		// Strict quality cutoff (0.68)
		if sim >= 0.68 {
			scored = append(scored, ScoredMemory{
				Memory:     mem,
				Similarity: sim,
			})
		}
	}

	// Sort scored memories by similarity descending
	for i := 0; i < len(scored); i++ {
		for j := i + 1; j < len(scored); j++ {
			if scored[j].Similarity > scored[i].Similarity {
				scored[i], scored[j] = scored[j], scored[i]
			}
		}
	}

	// Limit to top 2 highest-signal memories
	if len(scored) > 2 {
		scored = scored[:2]
	}

	return scored
}

// buildSystemPrompt creates the tailored system prompt with relationship context, friend circles, and semantic memories.
func (t *Tenant) buildSystemPrompt(identityClause string, targetJID types.JID, isGroup bool, settings *ChatSettings, memories []ScoredMemory) string {
	var extraContext strings.Builder

	if settings != nil {
		if settings.Relationship != "" {
			extraContext.WriteString(fmt.Sprintf(`
RELATIONSHIP CONTEXT & DYNAMICS:
- Relationship with this person: %s
- Always align with this exact relationship dynamic, tone, intimacy, banter, or sarcasm.`, strings.TrimSpace(settings.Relationship)))
		}

		if len(settings.FriendCircle) > 0 {
			var friendNames []string
			for _, f := range settings.FriendCircle {
				name := t.resolveContactDisplayName(f)
				if name != "" {
					friendNames = append(friendNames, name)
				}
			}
			if len(friendNames) > 0 {
				extraContext.WriteString(fmt.Sprintf(`
SHARED FRIEND CIRCLE & MUTUAL CONNECTIONS:
- You share mutual friends, common groups, and social history with: %s.
- Keep social context, references, and shared group vibes aligned.`, strings.Join(friendNames, ", ")))
			}
		}

		if settings.CustomPrompt != "" {
			extraContext.WriteString(fmt.Sprintf(`
CUSTOM INSTRUCTIONS:
%s`, strings.TrimSpace(settings.CustomPrompt)))
		}
	}

	if len(memories) > 0 {
		formattedMemories := FormatSemanticMemories(memories)
		if formattedMemories != "" {
			extraContext.WriteString("\n" + formattedMemories)
		}
	}

	if isGroup {
		groupName := t.resolveGroupName(targetJID)
		return fmt.Sprintf(`%s That is your own writing style: mirror your own message length, tone, capitalization, punctuation, slang, and emoji usage. If your messages are one-liners, reply with one-liners. If you use emojis, use emojis; if you don't, don't.
%s
YOU ARE IN A GROUP CHAT ("%s"):
1. GROUP DYNAMICS & BREVITY:
   - Group texts must be very short, natural, and casual (often 1 to 8 words). Never write long paragraphs or sound like an assistant.
   - Match the group banter, sarcasm, teasing, or casual vibe.
   - If the group uses regional languages or code-mixing (Telugu/Tanglish, Hindi/Hinglish, etc.), ALWAYS prefer and reply in that language or code-mixed style over plain English. Match the casual Romanized transliteration.

2. TARGETED REPLY:
   - Multiple people are in this group chat. Each message is labeled with "[Sender Name]: ...".
   - Respond specifically to the person who addressed, mentioned, or replied to you.
   - Do NOT answer for other group members or interrupt conversations between others unless relevant to you.

3. ABSOLUTE RULES:
   - Never say you are an AI or bot.
   - No formal greetings ("Hey guys", "Hello all").
   - Output ONLY the exact text message to send and nothing else.`, identityClause, extraContext.String(), groupName)
	}

	return fmt.Sprintf(`%s That is your own writing style: mirror your own message length, tone, capitalization, punctuation, slang, and emoji usage. If your messages are one-liners, reply with one-liners. If you use emojis, use emojis; if you don't, don't.
%s
LANGUAGE PREFERENCE:
- If the other person or the chat history uses non-English languages, regional dialects, vernacular phrases, or code-mixed speech (e.g. Hindi/Hinglish, Telugu/Tanglish, etc. written in Latin/English script), ALWAYS prefer and reply in that language or code-mixed style over plain English, even if English is commonly used in the chat.
- Match the casual Romanized transliteration style naturally (e.g., respond in natural regional vernacular/slang instead of reverting to formal English).

READ THE ROOM:
- The last message from the other person is the one you are replying to. Answer what THEY just said and stay on that topic. Never reply with a generic or off-topic one-liner.
- Never repeat a message you already sent in the history, and never send the same text twice in a row.
- Never continue your own monologue: if the other person has not spoken since your last message, you have nothing to reply to.
- Reply naturally and human. Don't mention that you're an AI. Don't use markdown. Output only the message text and nothing else.`, identityClause, extraContext.String())
}

// callGeminiAPI invokes Google Gemini REST API directly.
func (t *Tenant) callGeminiAPI(apiKey, model, systemPrompt, history string) (string, error) {
	geminiModel := model
	if strings.Contains(geminiModel, "/") {
		parts := strings.Split(geminiModel, "/")
		geminiModel = parts[len(parts)-1]
	}
	endpoint := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", geminiModel, apiKey)

	type GeminiPart struct {
		Text string `json:"text"`
	}
	type GeminiContent struct {
		Role  string       `json:"role"`
		Parts []GeminiPart `json:"parts"`
	}
	type GeminiReq struct {
		SystemInstruction *GeminiContent  `json:"system_instruction,omitempty"`
		Contents          []GeminiContent `json:"contents"`
	}
	gReq := GeminiReq{
		SystemInstruction: &GeminiContent{Parts: []GeminiPart{{Text: systemPrompt}}},
		Contents:          []GeminiContent{{Role: "user", Parts: []GeminiPart{{Text: history}}}},
	}
	gBytes, _ := json.Marshal(gReq)
	httpReq, err := http.NewRequest("POST", endpoint, bytes.NewReader(gBytes))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Gemini API error (HTTP %d): %s", resp.StatusCode, string(bodyBytes))
	}

	var gRes struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal(bodyBytes, &gRes); err != nil || len(gRes.Candidates) == 0 || len(gRes.Candidates[0].Content.Parts) == 0 {
		return "", fmt.Errorf("empty Gemini response")
	}

	return strings.TrimSpace(gRes.Candidates[0].Content.Parts[0].Text), nil
}

// callOpenAICompatibleAPI invokes OpenAI, Groq, or OpenRouter chat completions.
func (t *Tenant) callOpenAICompatibleAPI(apiKey, model, systemPrompt, history string) (string, error) {
	type Message struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	type Reasoning struct {
		Effort    string `json:"effort,omitempty"`
		MaxTokens int    `json:"max_tokens,omitempty"`
	}
	type RequestBody struct {
		Model     string     `json:"model"`
		Messages  []Message  `json:"messages"`
		MaxTokens int        `json:"max_tokens,omitempty"`
		Reasoning *Reasoning `json:"reasoning,omitempty"`
	}

	messages := []Message{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: history},
	}

	endpoint := "https://openrouter.ai/api/v1/chat/completions"
	var reqBody RequestBody

	if strings.HasPrefix(apiKey, "sk-") && !strings.HasPrefix(apiKey, "sk-or-") && !strings.HasPrefix(apiKey, "sk-ant-") {
		endpoint = "https://api.openai.com/v1/chat/completions"
		reqBody = RequestBody{
			Model:     model,
			Messages:  messages,
			MaxTokens: 2000,
		}
	} else if strings.HasPrefix(apiKey, "gsk_") {
		endpoint = "https://api.groq.com/openai/v1/chat/completions"
		reqBody = RequestBody{
			Model:     model,
			Messages:  messages,
			MaxTokens: 2000,
		}
	} else {
		reqBody = RequestBody{
			Model:     model,
			Messages:  messages,
			MaxTokens: 2000,
			Reasoning: &Reasoning{Effort: "low"},
		}
	}

	jsonBytes, _ := json.Marshal(reqBody)
	req, err := http.NewRequest("POST", endpoint, bytes.NewReader(jsonBytes))
	if err != nil {
		return "", fmt.Errorf("failed to build AI request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("HTTP-Referer", "https://github.com/Nikhil-Mundhra/whatsapp-ai")
	req.Header.Set("X-Title", "WhatsApp TakeOver AI")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("AI request failed: %v", err)
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.logger.Errorf("AI Provider error (HTTP %d): %s", resp.StatusCode, string(bodyBytes))

		// If OpenRouter failed due to reasoning parameter, retry without reasoning
		if reqBody.Reasoning != nil {
			reqBody.Reasoning = nil
			retryBytes, _ := json.Marshal(reqBody)
			retryReq, _ := http.NewRequest("POST", endpoint, bytes.NewReader(retryBytes))
			retryReq.Header.Set("Authorization", "Bearer "+apiKey)
			retryReq.Header.Set("Content-Type", "application/json")
			retryReq.Header.Set("HTTP-Referer", "https://github.com/Nikhil-Mundhra/whatsapp-ai")
			retryReq.Header.Set("X-Title", "WhatsApp TakeOver AI")
			retryResp, retryErr := client.Do(retryReq)
			if retryErr == nil {
				defer retryResp.Body.Close()
				bodyBytes, _ = io.ReadAll(retryResp.Body)
				if retryResp.StatusCode != http.StatusOK {
					return "", fmt.Errorf("AI retry without reasoning also failed (HTTP %d): %s", retryResp.StatusCode, string(bodyBytes))
				}
			} else {
				return "", retryErr
			}
		} else {
			return "", fmt.Errorf("AI Provider error (HTTP %d): %s", resp.StatusCode, string(bodyBytes))
		}
	}

	var resData struct {
		Choices []struct {
			Message struct {
				Content   string `json:"content"`
				Reasoning string `json:"reasoning"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(bodyBytes, &resData); err != nil || len(resData.Choices) == 0 {
		return "", fmt.Errorf("failed to parse AI response: %v (raw: %s)", err, string(bodyBytes))
	}

	if resData.Choices[0].Message.Reasoning != "" {
		t.logger.Infof("[reasoning] %s", resData.Choices[0].Message.Reasoning)
	}

	replyText := strings.TrimSpace(resData.Choices[0].Message.Content)
	if strings.Contains(replyText, "</think>") {
		parts := strings.Split(replyText, "</think>")
		replyText = strings.TrimSpace(parts[len(parts)-1])
	}

	return replyText, nil
}

// replyToChat drafts a persona-aligned reply and sends it via WhatsApp.
func (t *Tenant) replyToChat(targetJID types.JID) {
	if t.client == nil || !t.client.IsConnected() || targetJID.IsEmpty() {
		return
	}

	var altJIDs []string
	if t.client != nil && t.client.Store != nil && t.client.Store.LIDs != nil {
		ctx := context.Background()
		if targetJID.Server == "s.whatsapp.net" {
			if lid, err := t.client.Store.LIDs.GetLIDForPN(ctx, targetJID); err == nil && !lid.IsEmpty() {
				altJIDs = append(altJIDs, lid.String())
			}
		} else if targetJID.Server == "lid" {
			if pn, err := t.client.Store.LIDs.GetPNForLID(ctx, targetJID); err == nil && !pn.IsEmpty() {
				altJIDs = append(altJIDs, pn.String())
			}
		}
	}
	if !t.lastTargetJID.IsEmpty() && t.lastTargetJID.String() != targetJID.String() {
		altJIDs = append(altJIDs, t.lastTargetJID.String())
	}

	msgs, err := t.messageStore.GetMessagesFlexible(targetJID.String(), altJIDs, 20)
	if err != nil || len(msgs) == 0 {
		t.logger.Warnf("No chat history found for %s (alts: %v) to generate reply", targetJID, altJIDs)
		return
	}

	var chatSettings *ChatSettings
	if t.messageStore != nil {
		if cs, err := t.messageStore.GetChatSettingsFlexible(targetJID.String(), altJIDs); err == nil && cs != nil {
			chatSettings = cs
		}
	}

	isGroup := targetJID.Server == "g.us"
	history := t.buildChatHistory(msgs, isGroup, targetJID)
	identityClause := t.buildIdentityClause()

	apiKey := t.aiApiKey
	if apiKey == "" {
		apiKey = os.Getenv("OPENROUTER_API_KEY")
	}
	if apiKey == "" {
		apiKey = os.Getenv("AI_API_KEY")
	}

	memories := t.retrieveRelevantMemories(targetJID, altJIDs, apiKey, msgs)
	systemPrompt := t.buildSystemPrompt(identityClause, targetJID, isGroup, chatSettings, memories)

	model := t.aiModel
	if chatSettings != nil && chatSettings.Model != "" {
		model = chatSettings.Model
	}
	if model == "" {
		model = os.Getenv("AI_MODEL")
	}
	if model == "" {
		model = "qwen/qwen3.8-27b"
	}

	if apiKey == "" {
		t.logger.Warnf("No AI API key found for tenant %s. Skipping auto-reply.", t.Hash)
		return
	}

	var replyText string
	if strings.HasPrefix(apiKey, "AIza") {
		replyText, err = t.callGeminiAPI(apiKey, model, systemPrompt, history)
	} else {
		replyText, err = t.callOpenAICompatibleAPI(apiKey, model, systemPrompt, history)
	}

	if err != nil {
		t.logger.Errorf("AI generation failed for tenant %s: %v", t.Hash, err)
		return
	}

	if replyText == "" {
		t.logger.Warnf("AI generated empty content for tenant %s", t.Hash)
		return
	}

	t.logger.Infof("AI drafted reply for %s using %s: %q", targetJID, model, replyText)

	ok, sendStatus, sentMsgID := sendWhatsAppMessage(t.client, t.messageStore, targetJID.String(), replyText, "", t.logger)
	t.logger.Infof("Sent AI reply to %s: ok=%v status=%s msgID=%s", targetJID, ok, sendStatus, sentMsgID)
	if ok && sentMsgID != "" {
		t.recordApiSent(sentMsgID)
		t.mu.Lock()
		if t.grantKind == "count" {
			if t.grantRemaining > 0 {
				t.grantRemaining--
			}
			if t.grantRemaining <= 0 {
				t.grantKind = "none"
				t.grantTargetJID = types.EmptyJID
			}
		}
		t.mu.Unlock()
	}
}
