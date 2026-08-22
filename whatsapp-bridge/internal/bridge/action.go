package bridge

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"go.mau.fi/whatsmeow/types"
)

var (
	jsonBlockRegex = regexp.MustCompile(`(?s)\{.*?"reply_text".*?\}`)
)

// ProposedAction represents a concrete tool action proposed by the LLM.
type ProposedAction struct {
	Type        string   `json:"type"` // "create_calendar_event" | "send_location"
	Summary     string   `json:"summary"`
	Location    string   `json:"location,omitempty"`
	StartUTC    string   `json:"startUtc,omitempty"`
	EndUTC      string   `json:"endUtc,omitempty"`
	Description string   `json:"description,omitempty"`
	Attendees   []string `json:"attendees,omitempty"`
}

// AIResponseEnvelope encapsulates conversational text and optional proposed action.
type AIResponseEnvelope struct {
	ReplyText      string          `json:"reply_text"`
	ProposedAction *ProposedAction `json:"action,omitempty"`
}

// ExtractActionEnvelope parses raw LLM output to separate reply text from structured action blocks.
func ExtractActionEnvelope(raw string) (string, *ProposedAction) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", nil
	}

	// 1. Try parsing full string as JSON envelope
	var env AIResponseEnvelope
	if strings.HasPrefix(raw, "{") && strings.HasSuffix(raw, "}") {
		if err := json.Unmarshal([]byte(raw), &env); err == nil && env.ReplyText != "" {
			return strings.TrimSpace(env.ReplyText), env.ProposedAction
		}
	}

	// 2. Look for embedded JSON block in response
	if match := jsonBlockRegex.FindString(raw); match != "" {
		if err := json.Unmarshal([]byte(match), &env); err == nil && env.ReplyText != "" {
			return strings.TrimSpace(env.ReplyText), env.ProposedAction
		}
	}

	// 3. Fallback: treat entire string as plain text response without action
	return raw, nil
}

// CompoundActionPoll represents the generated options and question for a 1-tap compound poll.
type CompoundActionPoll struct {
	Question string
	Options  []string
}

// BuildCompoundActionPoll constructs a native WhatsApp poll combining TakeOver grant & action gating.
func BuildCompoundActionPoll(contactName string, action *ProposedAction) CompoundActionPoll {
	if contactName == "" {
		contactName = "Contact"
	}

	var question string
	var options []string

	if action != nil && action.Type == "create_calendar_event" {
		summary := action.Summary
		if summary == "" {
			summary = "event"
		}
		question = fmt.Sprintf("%s: Take over & schedule %s?", contactName, summary)
		if len(question) > 250 {
			question = question[:247] + "..."
		}

		options = []string{
			"Send & Create Invite",
			"Send Text Only",
			"5 minutes",
			"Deny",
		}
	} else {
		question = fmt.Sprintf("Allow AI to reply to %s?", contactName)
		options = []string{
			"Send 1 text",
			"5 minutes",
			"2 hours",
			"Deny",
		}
	}

	return CompoundActionPoll{
		Question: question,
		Options:  options,
	}
}

// ActionVoteType represents the classified resolution of an action poll vote.
type ActionVoteType int

const (
	ActionVoteExecuteAll ActionVoteType = iota
	ActionVoteTextOnly
	ActionVote5Min
	ActionVote2Hours
	ActionVoteDeny
	ActionVoteUnknown
)

// ResolveActionVote maps the owner's selected poll option string to an ActionVoteType.
func ResolveActionVote(choice string) ActionVoteType {
	lower := strings.ToLower(strings.TrimSpace(choice))
	if strings.Contains(lower, "create") || strings.Contains(lower, "invite") || strings.Contains(lower, "send & create") {
		return ActionVoteExecuteAll
	}
	if strings.Contains(lower, "text only") || strings.Contains(lower, "send text") {
		return ActionVoteTextOnly
	}
	if strings.Contains(lower, "5 min") || strings.Contains(lower, "5 minutes") {
		return ActionVote5Min
	}
	if strings.Contains(lower, "2 hour") || strings.Contains(lower, "2 hr") || strings.Contains(lower, "2 hours") {
		return ActionVote2Hours
	}
	if strings.Contains(lower, "deny") || strings.Contains(lower, "cancel") || strings.Contains(lower, "reject") {
		return ActionVoteDeny
	}
	if strings.Contains(lower, "1 text") || strings.Contains(lower, "send 1 text") {
		return ActionVoteExecuteAll
	}
	return ActionVoteUnknown
}

// ExecuteApprovedAction handles execution of an approved pending action.
func (t *Tenant) ExecuteApprovedAction(action *PendingAction, voteType ActionVoteType) error {
	if action == nil || t.messageStore == nil {
		return fmt.Errorf("invalid action or message store")
	}

	now := time.Now().UTC()
	startExec := time.Now()

	switch voteType {
	case ActionVoteExecuteAll:
		// 1. Send WhatsApp reply
		ok, sendStatus, sentMsgID := sendWhatsAppMessage(t.client, t.messageStore, action.ChatJID, action.DraftReplyText, "", t.logger)
		if !ok {
			errMsg := fmt.Sprintf("failed to send WhatsApp reply: %s", sendStatus)
			_ = t.messageStore.UpdatePendingActionStatus(t.Hash, action.ID, "failed", errMsg, &now)
			return fmt.Errorf("%s", errMsg)
		}
		if sentMsgID != "" {
			t.recordApiSent(sentMsgID)
		}

		// 2. Parse and write calendar event if applicable
		if action.ActionType == "create_calendar_event" && action.ActionPayload != "" {
			var propAction ProposedAction
			if err := json.Unmarshal([]byte(action.ActionPayload), &propAction); err == nil {
				startT, _ := time.Parse(time.RFC3339, propAction.StartUTC)
				endT, _ := time.Parse(time.RFC3339, propAction.EndUTC)
				if startT.IsZero() {
					startT = now.Add(24 * time.Hour)
				}
				if endT.IsZero() {
					endT = startT.Add(1 * time.Hour)
				}

				calEv := CalendarEvent{
					ID:          fmt.Sprintf("act-%s", action.ID),
					TenantHash:  t.Hash,
					CalendarID:  "primary",
					Summary:     propAction.Summary,
					Description: propAction.Description,
					Location:    propAction.Location,
					StartUTC:    startT,
					EndUTC:      endT,
					Status:      "confirmed",
					UpdatedAt:   now,
				}
				_ = t.messageStore.SaveCalendarEvents(t.Hash, "primary", []CalendarEvent{calEv})
			}
		}

		_ = t.messageStore.UpdatePendingActionStatus(t.Hash, action.ID, "executed", "", &now)

		// Log tool execution
		dur := time.Since(startExec).Milliseconds()
		_ = t.messageStore.LogToolExecution(&ToolExecution{
			ID:                  fmt.Sprintf("tool-%d", time.Now().UnixNano()),
			TenantHash:          t.Hash,
			ChatJID:             action.ChatJID,
			ToolName:            action.ActionType,
			InputPayload:        action.ActionPayload,
			OutputPayload:       fmt.Sprintf("Replied and executed action %s", action.ID),
			ExecutionDurationMs: dur,
			Status:              "success",
			CreatedAt:           now,
		})

		// Send audit confirmation notification to owner
		contactName := t.resolveContactDisplayName(action.ChatJID)
		notice := fmt.Sprintf("Executed TakeOver reply to %s and created calendar event.", contactName)
		if t.ownerPhone != "" {
			ownerJID := types.NewJID(normalizePhone(t.ownerPhone), types.DefaultUserServer)
			_, _, _ = sendWhatsAppMessage(t.client, t.messageStore, ownerJID.String(), notice, "", t.logger)
		}

	case ActionVoteTextOnly:
		ok, sendStatus, sentMsgID := sendWhatsAppMessage(t.client, t.messageStore, action.ChatJID, action.DraftReplyText, "", t.logger)
		if !ok {
			errMsg := fmt.Sprintf("failed to send WhatsApp reply: %s", sendStatus)
			_ = t.messageStore.UpdatePendingActionStatus(t.Hash, action.ID, "failed", errMsg, &now)
			return fmt.Errorf("%s", errMsg)
		}
		if sentMsgID != "" {
			t.recordApiSent(sentMsgID)
		}

		_ = t.messageStore.UpdatePendingActionStatus(t.Hash, action.ID, "executed", "text_only", &now)

	case ActionVote5Min:
		targetJID, _ := types.ParseJID(action.ChatJID)
		t.mu.Lock()
		t.grantKind = "duration"
		t.grantExpiresAt = time.Now().Add(5 * time.Minute)
		t.grantTargetJID = targetJID
		t.lastTargetJID = targetJID
		t.grantArmedAt = time.Now()
		t.mu.Unlock()
		_ = t.messageStore.UpdatePendingActionStatus(t.Hash, action.ID, "approved", "takeover_5min", &now)
		go t.replyToChat(targetJID)

	case ActionVoteDeny:
		_ = t.messageStore.UpdatePendingActionStatus(t.Hash, action.ID, "rejected", "owner_denied", &now)
	}

	return nil
}
