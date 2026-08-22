package bridge

import (
	"strings"
	"testing"
	"time"
)

func TestParseICSFeed(t *testing.T) {
	icsContent := `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
BEGIN:VEVENT
UID:event-123@google.com
SUMMARY:Coffee with Sarah
DESCRIPTION:Discuss Phase 5 Architecture
LOCATION:Blue Bottle Coffee\, Mint Plaza
DTSTART:20260823T103000Z
DTEND:20260823T113000Z
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
UID:event-allday@google.com
SUMMARY:Company Holiday
DTSTART;VALUE=DATE:20260825
DTEND;VALUE=DATE:20260826
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`

	loc, _ := time.LoadLocation("UTC")
	events, err := ParseICSFeed(strings.NewReader(icsContent), "test-tenant", "primary", loc)
	if err != nil {
		t.Fatalf("ParseICSFeed failed: %v", err)
	}

	if len(events) != 2 {
		t.Fatalf("expected 2 events, got %d", len(events))
	}

	ev1 := events[0]
	if ev1.ID != "event-123@google.com" {
		t.Errorf("expected UID event-123@google.com, got %s", ev1.ID)
	}
	if ev1.Summary != "Coffee with Sarah" {
		t.Errorf("expected Summary 'Coffee with Sarah', got %s", ev1.Summary)
	}
	if ev1.Location != "Blue Bottle Coffee, Mint Plaza" {
		t.Errorf("expected Location 'Blue Bottle Coffee, Mint Plaza', got %s", ev1.Location)
	}
	if ev1.IsAllDay {
		t.Errorf("ev1 should not be all-day")
	}

	ev2 := events[1]
	if !ev2.IsAllDay {
		t.Errorf("ev2 should be all-day")
	}
	if ev2.Summary != "Company Holiday" {
		t.Errorf("expected Summary 'Company Holiday', got %s", ev2.Summary)
	}
}

func TestFormatCalendarAvailability(t *testing.T) {
	loc, _ := time.LoadLocation("Asia/Kolkata")
	queryStart := time.Date(2026, 8, 23, 0, 0, 0, 0, loc).UTC()
	queryEnd := time.Date(2026, 8, 23, 23, 59, 59, 0, loc).UTC()

	// 1. Free window
	availFree := FormatCalendarAvailability(nil, queryStart, queryEnd, loc)
	if !strings.Contains(availFree, "Completely FREE") {
		t.Errorf("expected Completely FREE in availability, got: %s", availFree)
	}

	// 2. Window with event
	events := []CalendarEvent{
		{
			ID:         "ev-1",
			TenantHash: "test-hash",
			Summary:    "Architecture Review",
			StartUTC:   time.Date(2026, 8, 23, 10, 30, 0, 0, time.UTC), // 16:00 IST
			EndUTC:     time.Date(2026, 8, 23, 11, 30, 0, 0, time.UTC), // 17:00 IST
			IsAllDay:   false,
		},
	}

	availBusy := FormatCalendarAvailability(events, queryStart, queryEnd, loc)
	if !strings.Contains(availBusy, "Architecture Review") {
		t.Errorf("expected event in availability string, got: %s", availBusy)
	}
	if !strings.Contains(availBusy, "16:00 - 17:00: BUSY") {
		t.Errorf("expected 16:00 - 17:00: BUSY in availability string, got: %s", availBusy)
	}
}

func TestDetectSchedulingIntent(t *testing.T) {
	cases := []struct {
		text     string
		expected bool
	}{
		{"Hey, are you free tomorrow for coffee?", true},
		{"Let's sync up on Zoom next week", true},
		{"What time works for you on Friday?", true},
		{"Haha that was so funny lol", false},
		{"I'm exhausted today", true}, // contains today
		{"Good morning!", false},
	}

	for _, c := range cases {
		got := DetectSchedulingIntent(c.text)
		if got != c.expected {
			t.Errorf("DetectSchedulingIntent(%q) = %v, expected %v", c.text, got, c.expected)
		}
	}
}

func TestResolveQueryWindow(t *testing.T) {
	loc, _ := time.LoadLocation("UTC")
	anchor := time.Date(2026, 8, 22, 12, 0, 0, 0, loc) // Saturday

	// Tomorrow -> Sunday Aug 23
	start, end, ok := ResolveQueryWindow("Are you free tomorrow?", anchor, loc)
	if !ok {
		t.Fatalf("expected ResolveQueryWindow to succeed for 'tomorrow'")
	}
	if start.Day() != 23 || end.Day() != 23 {
		t.Errorf("expected start/end day 23, got start=%v end=%v", start, end)
	}
}
