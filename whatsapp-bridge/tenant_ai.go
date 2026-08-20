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
func (t *Tenant) buildChatHistory(msgs []Message, isGroup bool) string {
	var historyBuilder strings.Builder
	for i := len(msgs) - 1; i >= 0; i-- {
		m := msgs[i]
		prefix := "From: " + m.Sender
		if m.IsFromMe {
			prefix = "From: Me"
		} else if isGroup {
			senderDisplayName := m.Sender
			if t.client != nil && t.client.Store != nil {
				normS := normalizePhone(m.Sender)
				if normS != "" {
					pnJID := types.NewJID(normS, types.DefaultUserServer)
					if c, err := t.client.Store.Contacts.GetContact(context.Background(), pnJID); err == nil && c.FullName != "" {
						senderDisplayName = c.FullName
					} else if c.PushName != "" && !isAllDigits(c.PushName) {
						senderDisplayName = c.PushName
					}
				}
			}
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

// buildSystemPrompt creates the tailored system prompt for 1-on-1 or group chat dynamics.
func (t *Tenant) buildSystemPrompt(identityClause string, targetJID types.JID, isGroup bool) string {
	if isGroup {
		groupName := t.resolveGroupName(targetJID)
		return fmt.Sprintf(`%s That is your own writing style: mirror your own message length, tone, capitalization, punctuation, slang, and emoji usage. If your messages are one-liners, reply with one-liners. If you use emojis, use emojis; if you don't, don't.

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
   - Output ONLY the exact text message to send and nothing else.`, identityClause, groupName)
	}

	return fmt.Sprintf(`%s That is your own writing style: mirror your own message length, tone, capitalization, punctuation, slang, and emoji usage. If your messages are one-liners, reply with one-liners. If you use emojis, use emojis; if you don't, don't.

LANGUAGE PREFERENCE:
- If the other person or the chat history uses non-English languages, regional dialects, vernacular phrases, or code-mixed speech (e.g. Hindi/Hinglish, Telugu/Tanglish, etc. written in Latin/English script), ALWAYS prefer and reply in that language or code-mixed style over plain English, even if English is commonly used in the chat.
- Match the casual Romanized transliteration style naturally (e.g., respond in natural regional vernacular/slang instead of reverting to formal English).

READ THE ROOM:
- The last message from the other person is the one you are replying to. Answer what THEY just said and stay on that topic. Never reply with a generic or off-topic one-liner.
- Never repeat a message you already sent in the history, and never send the same text twice in a row.
- Never continue your own monologue: if the other person has not spoken since your last message, you have nothing to reply to.
- Reply naturally and human. Don't mention that you're an AI. Don't use markdown. Output only the message text and nothing else.`, identityClause)
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

	chatJID := targetJID.String()
	msgs, err := t.messageStore.GetMessages(chatJID, 20)
	if err != nil || len(msgs) == 0 {
		t.logger.Warnf("No chat history found for %s to generate reply", chatJID)
		return
	}

	isGroup := targetJID.Server == "g.us"
	history := t.buildChatHistory(msgs, isGroup)
	identityClause := t.buildIdentityClause()
	systemPrompt := t.buildSystemPrompt(identityClause, targetJID, isGroup)

	model := t.aiModel
	if model == "" {
		model = os.Getenv("AI_MODEL")
	}
	if model == "" {
		model = "qwen/qwen3.8-27b"
	}

	apiKey := t.aiApiKey
	if apiKey == "" {
		apiKey = os.Getenv("OPENROUTER_API_KEY")
	}
	if apiKey == "" {
		apiKey = os.Getenv("AI_API_KEY")
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
