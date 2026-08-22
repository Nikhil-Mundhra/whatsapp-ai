package bridge

import (
	"bufio"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
)

var (
	schedulingKeywords = []string{
		"meet", "meeting", "call", "zoom", "sync", "catch up", "coffee", "lunch", "dinner",
		"free", "available", "schedule", "calendar", "tomorrow", "tonight", "today",
		"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
		"next week", "this weekend", "slot", "slots", "time", "pm", "am",
	}
)

// DetectSchedulingIntent checks if incoming message indicates scheduling or availability discussion.
func DetectSchedulingIntent(text string) bool {
	cleaned := CleanTextContent(text)
	if cleaned == "" {
		return false
	}
	lower := strings.ToLower(cleaned)
	for _, kw := range schedulingKeywords {
		// Word-boundary / phrase match
		if strings.Contains(lower, kw) {
			return true
		}
	}
	return false
}

// ResolveQueryWindow parses colloquial temporal expressions anchored to message time and timezone.
func ResolveQueryWindow(text string, anchor time.Time, loc *time.Location) (time.Time, time.Time, bool) {
	if loc == nil {
		loc = time.Local
	}
	localAnchor := anchor.In(loc)
	lower := strings.ToLower(CleanTextContent(text))

	year, month, day := localAnchor.Date()
	startOfDay := time.Date(year, month, day, 0, 0, 0, 0, loc)

	if strings.Contains(lower, "tomorrow") {
		start := startOfDay.AddDate(0, 0, 1)
		end := start.AddDate(0, 0, 1).Add(-time.Second)
		return start.UTC(), end.UTC(), true
	}

	if strings.Contains(lower, "today") || strings.Contains(lower, "tonight") {
		start := localAnchor
		end := startOfDay.AddDate(0, 0, 1).Add(-time.Second)
		return start.UTC(), end.UTC(), true
	}

	weekdays := map[string]time.Weekday{
		"sunday":    time.Sunday,
		"monday":    time.Monday,
		"tuesday":   time.Tuesday,
		"wednesday": time.Wednesday,
		"thursday":  time.Thursday,
		"friday":    time.Friday,
		"saturday":  time.Saturday,
	}

	for dayName, targetWd := range weekdays {
		if strings.Contains(lower, dayName) {
			daysUntil := int(targetWd - localAnchor.Weekday())
			if daysUntil <= 0 {
				daysUntil += 7
			}
			start := startOfDay.AddDate(0, 0, daysUntil)
			end := start.AddDate(0, 0, 1).Add(-time.Second)
			return start.UTC(), end.UTC(), true
		}
	}

	if strings.Contains(lower, "this weekend") || strings.Contains(lower, "weekend") {
		daysUntilSat := int(time.Saturday - localAnchor.Weekday())
		if daysUntilSat < 0 {
			daysUntilSat += 7
		}
		satStart := startOfDay.AddDate(0, 0, daysUntilSat)
		sunEnd := satStart.AddDate(0, 0, 2).Add(-time.Second)
		return satStart.UTC(), sunEnd.UTC(), true
	}

	// Default fallback: inspect the next 48 hours
	start := localAnchor
	end := localAnchor.Add(48 * time.Hour)
	return start.UTC(), end.UTC(), true
}

// ParseICSTimestamp converts raw iCalendar date/datetime strings to UTC time.
func ParseICSTimestamp(raw string, loc *time.Location) (time.Time, bool, error) {
	raw = strings.TrimSpace(raw)
	if loc == nil {
		loc = time.UTC
	}

	// Handle VALUE=DATE:YYYYMMDD or 8-digit date string
	if len(raw) == 8 && !strings.Contains(raw, "T") {
		t, err := time.ParseInLocation("20060102", raw, loc)
		if err != nil {
			return time.Time{}, true, err
		}
		return t.UTC(), true, nil
	}

	// Handle UTC format: 20060102T150405Z
	if strings.HasSuffix(raw, "Z") {
		t, err := time.Parse("20060102T150405Z", raw)
		if err != nil {
			return time.Time{}, false, err
		}
		return t.UTC(), false, nil
	}

	// Handle local format: 20060102T150405
	t, err := time.ParseInLocation("20060102T150405", raw, loc)
	if err == nil {
		return t.UTC(), false, nil
	}

	return time.Time{}, false, fmt.Errorf("unsupported iCal timestamp format: %s", raw)
}

// ParseICSFeed parses an RFC 5545 iCalendar stream into a slice of CalendarEvent records.
func ParseICSFeed(r io.Reader, tenantHash, calendarID string, loc *time.Location) ([]CalendarEvent, error) {
	if loc == nil {
		loc = time.UTC
	}
	scanner := bufio.NewScanner(r)

	// Unfold folded lines (RFC 5545: lines starting with space or tab continue previous line)
	var lines []string
	for scanner.Scan() {
		line := scanner.Text()
		if len(line) > 0 && (line[0] == ' ' || line[0] == '\t') {
			if len(lines) > 0 {
				lines[len(lines)-1] += line[1:]
			}
		} else {
			lines = append(lines, line)
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	var events []CalendarEvent
	var inEvent bool
	var currentEv CalendarEvent
	now := time.Now().UTC()

	cleanVal := func(s string) string {
		s = strings.ReplaceAll(s, `\,`, `,`)
		s = strings.ReplaceAll(s, `\;`, `;`)
		s = strings.ReplaceAll(s, `\n`, "\n")
		s = strings.ReplaceAll(s, `\N`, "\n")
		return strings.TrimSpace(s)
	}

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "BEGIN:VEVENT" {
			inEvent = true
			currentEv = CalendarEvent{
				TenantHash: tenantHash,
				CalendarID: calendarID,
				Status:     "confirmed",
				UpdatedAt:  now,
			}
			continue
		}

		if line == "END:VEVENT" {
			if inEvent && currentEv.ID != "" && !currentEv.StartUTC.IsZero() {
				if currentEv.EndUTC.IsZero() {
					if currentEv.IsAllDay {
						currentEv.EndUTC = currentEv.StartUTC.Add(24 * time.Hour)
					} else {
						currentEv.EndUTC = currentEv.StartUTC.Add(1 * time.Hour)
					}
				}
				events = append(events, currentEv)
			}
			inEvent = false
			continue
		}

		if !inEvent {
			continue
		}

		colonIdx := strings.Index(line, ":")
		if colonIdx == -1 {
			continue
		}
		propKey := line[:colonIdx]
		propVal := line[colonIdx+1:]

		// Strip parameters from property name, e.g. DTSTART;VALUE=DATE -> DTSTART
		mainProp := propKey
		if semiIdx := strings.Index(propKey, ";"); semiIdx != -1 {
			mainProp = propKey[:semiIdx]
		}
		mainProp = strings.ToUpper(strings.TrimSpace(mainProp))

		switch mainProp {
		case "UID":
			currentEv.ID = cleanVal(propVal)
		case "SUMMARY":
			currentEv.Summary = cleanVal(propVal)
		case "DESCRIPTION":
			currentEv.Description = cleanVal(propVal)
		case "LOCATION":
			currentEv.Location = cleanVal(propVal)
		case "STATUS":
			currentEv.Status = strings.ToLower(cleanVal(propVal))
		case "DTSTART":
			t, isAllDay, err := ParseICSTimestamp(propVal, loc)
			if err == nil {
				currentEv.StartUTC = t
				currentEv.IsAllDay = isAllDay
			}
		case "DTEND":
			t, isAllDay, err := ParseICSTimestamp(propVal, loc)
			if err == nil {
				currentEv.EndUTC = t
				if isAllDay {
					currentEv.IsAllDay = true
				}
			}
		}
	}

	return events, nil
}

// SyncTenantCalendarFeed downloads and stores events from an external iCal feed.
func SyncTenantCalendarFeed(feedURL, tenantHash, calendarID string, store *MessageStore, loc *time.Location) (int, error) {
	if feedURL == "" || tenantHash == "" || store == nil {
		return 0, fmt.Errorf("invalid calendar sync parameters")
	}

	// Normalize webcal:// to https://
	url := feedURL
	if strings.HasPrefix(strings.ToLower(url), "webcal://") {
		url = "https://" + url[9:]
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return 0, fmt.Errorf("failed to fetch calendar feed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("calendar feed HTTP %d", resp.StatusCode)
	}

	events, err := ParseICSFeed(resp.Body, tenantHash, calendarID, loc)
	if err != nil {
		return 0, fmt.Errorf("failed to parse calendar feed: %v", err)
	}

	if err := store.SaveCalendarEvents(tenantHash, calendarID, events); err != nil {
		return 0, fmt.Errorf("failed to save calendar events: %v", err)
	}

	return len(events), nil
}

// FormatCalendarAvailability produces a formatted availability block for prompt injection.
func FormatCalendarAvailability(events []CalendarEvent, queryStart, queryEnd time.Time, loc *time.Location) string {
	if loc == nil {
		loc = time.UTC
	}

	startLocal := queryStart.In(loc)
	endLocal := queryEnd.In(loc)

	var sb strings.Builder
	sb.WriteString("[CALENDAR AVAILABILITY]\n")
	sb.WriteString(fmt.Sprintf("- Evaluated Window: %s to %s (%s)\n",
		startLocal.Format("Mon Jan 02 15:04"),
		endLocal.Format("Mon Jan 02 15:04"),
		loc.String(),
	))

	if len(events) == 0 {
		sb.WriteString("- Status: Completely FREE with no scheduled conflicts across the evaluated window.\n")
		sb.WriteString("- Grounding Rule: You are fully available. Confidently propose or confirm timings within this window.\n")
		return sb.String()
	}

	// Sort events by start time
	sort.Slice(events, func(i, j int) bool {
		return events[i].StartUTC.Before(events[j].StartUTC)
	})

	sb.WriteString("- Scheduled Events / Busy Slots:\n")
	for _, ev := range events {
		evStart := ev.StartUTC.In(loc)
		evEnd := ev.EndUTC.In(loc)
		if ev.IsAllDay {
			sb.WriteString(fmt.Sprintf("  * [ALL-DAY] %s: BUSY - %s\n", evStart.Format("Mon Jan 02"), ev.Summary))
		} else {
			sb.WriteString(fmt.Sprintf("  * %s - %s: BUSY - %s\n",
				evStart.Format("Mon Jan 02 15:04"),
				evEnd.Format("15:04"),
				ev.Summary,
			))
		}
	}
	sb.WriteString("- Grounding Rule: Do NOT agree to slots conflicting with the busy events listed above. Offer open windows around them.\n")

	return sb.String()
}
