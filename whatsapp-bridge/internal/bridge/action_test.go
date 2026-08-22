package bridge

import (
	"strings"
	"testing"
)

func TestExtractActionEnvelope(t *testing.T) {
	// 1. JSON Envelope with action
	jsonPayload := `{
		"reply_text": "Yeah, tomorrow at 4 PM works great for coffee!",
		"action": {
			"type": "create_calendar_event",
			"summary": "Coffee with Alex",
			"location": "Blue Bottle Coffee",
			"startUtc": "2026-08-23T10:30:00Z",
			"endUtc": "2026-08-23T11:30:00Z"
		}
	}`

	reply, action := ExtractActionEnvelope(jsonPayload)
	if reply != "Yeah, tomorrow at 4 PM works great for coffee!" {
		t.Errorf("unexpected reply: %s", reply)
	}
	if action == nil {
		t.Fatalf("expected action to be non-nil")
	}
	if action.Type != "create_calendar_event" {
		t.Errorf("expected action type create_calendar_event, got %s", action.Type)
	}
	if action.Summary != "Coffee with Alex" {
		t.Errorf("expected summary Coffee with Alex, got %s", action.Summary)
	}

	// 2. Plain text reply without action
	plainText := "Sounds good, see you then!"
	pReply, pAction := ExtractActionEnvelope(plainText)
	if pReply != "Sounds good, see you then!" {
		t.Errorf("unexpected plain reply: %s", pReply)
	}
	if pAction != nil {
		t.Errorf("expected nil action for plain text, got %+v", pAction)
	}
}

func TestBuildCompoundActionPoll(t *testing.T) {
	action := &ProposedAction{
		Type:    "create_calendar_event",
		Summary: "Coffee with Alex",
	}

	poll := BuildCompoundActionPoll("Alex", action)
	if !strings.Contains(poll.Question, "Alex: Take over & schedule Coffee with Alex?") {
		t.Errorf("unexpected question: %s", poll.Question)
	}

	if len(poll.Options) != 4 {
		t.Fatalf("expected 4 options, got %d", len(poll.Options))
	}
	if poll.Options[0] != "Send & Create Invite" {
		t.Errorf("expected Option 0 to be 'Send & Create Invite', got %s", poll.Options[0])
	}
	if poll.Options[1] != "Send Text Only" {
		t.Errorf("expected Option 1 to be 'Send Text Only', got %s", poll.Options[1])
	}
}

func TestResolveActionVote(t *testing.T) {
	cases := []struct {
		choice   string
		expected ActionVoteType
	}{
		{"Send & Create Invite", ActionVoteExecuteAll},
		{"Send Text Only", ActionVoteTextOnly},
		{"5 minutes", ActionVote5Min},
		{"2 hours", ActionVote2Hours},
		{"Deny", ActionVoteDeny},
	}

	for _, c := range cases {
		got := ResolveActionVote(c.choice)
		if got != c.expected {
			t.Errorf("ResolveActionVote(%q) = %v, expected %v", c.choice, got, c.expected)
		}
	}
}
