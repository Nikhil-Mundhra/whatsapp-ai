package bridge

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
)

func (t *Tenant) resolveGroupName(chatJID types.JID) string {
	ctx := context.Background()
	return GetChatName(ctx, t.client, t.messageStore, chatJID, chatJID.String(), nil, "", t.logger)
}

func (t *Tenant) isAllowedRecipient(senderJID, chatJID types.JID) bool {
	// 1. If an active takeover grant was explicitly armed for this contact/chat, allow it!
	t.mu.Lock()
	activeGrant := false
	now := time.Now()
	timeout := 5 * time.Minute
	if t.grantKind == "duration" && now.Before(t.grantExpiresAt) {
		if t.grantArmedAt.IsZero() || now.Sub(t.grantArmedAt) < timeout {
			activeGrant = true
		}
	} else if t.grantKind == "count" && t.grantRemaining > 0 {
		if t.grantArmedAt.IsZero() || now.Sub(t.grantArmedAt) < timeout {
			activeGrant = true
		}
	}
	grantTarget := t.grantTargetJID
	t.mu.Unlock()

	if activeGrant && !grantTarget.IsEmpty() {
		if t.matchesTarget(chatJID, grantTarget) || t.matchesTarget(senderJID, grantTarget) {
			return true
		}
	}

	// 2. If it's a group chat, check group JID and group name against configured recipients
	if chatJID.Server == "g.us" {
		groupName := strings.ToLower(t.resolveGroupName(chatJID))
		for _, r := range t.recipients {
			trimmed := strings.TrimSpace(r)
			if trimmed == "" {
				continue
			}
			// Match exact group JID or group user ID
			if chatJID.String() == trimmed || chatJID.User == trimmed {
				return true
			}
			// Match group name case-insensitively
			if groupName != "" && (strings.EqualFold(trimmed, groupName) || strings.Contains(groupName, strings.ToLower(trimmed))) {
				return true
			}
		}
		// Group chat not matched in recipients -> reject immediately (do not fall through to 1-on-1 logic)
		return false
	}

	// 3. For individual chats, gather all identity candidates of the incoming sender and chat
	candidates := []string{
		senderJID.User,
		chatJID.User,
		senderJID.String(),
		chatJID.String(),
	}

	if t.client != nil && t.client.Store != nil && t.client.Store.LIDs != nil {
		ctx := context.Background()
		if senderJID.Server == "lid" {
			if pn, err := t.client.Store.LIDs.GetPNForLID(ctx, senderJID); err == nil && !pn.IsEmpty() {
				candidates = append(candidates, pn.User, pn.String())
			}
		} else if senderJID.Server == "s.whatsapp.net" {
			if lid, err := t.client.Store.LIDs.GetLIDForPN(ctx, senderJID); err == nil && !lid.IsEmpty() {
				candidates = append(candidates, lid.User, lid.String())
			}
		}

		if chatJID.Server == "lid" {
			if pn, err := t.client.Store.LIDs.GetPNForLID(ctx, chatJID); err == nil && !pn.IsEmpty() {
				candidates = append(candidates, pn.User, pn.String())
			}
		} else if chatJID.Server == "s.whatsapp.net" {
			if lid, err := t.client.Store.LIDs.GetLIDForPN(ctx, chatJID); err == nil && !lid.IsEmpty() {
				candidates = append(candidates, lid.User, lid.String())
			}
		}
	}

	t.logger.Infof("Evaluating allowed recipient for sender %s (chat %s): candidates=%v allowed_recipients=%v", senderJID, chatJID, candidates, t.recipients)

	for _, r := range t.recipients {
		trimmedR := strings.TrimSpace(r)
		if trimmedR == "" {
			continue
		}

		// Direct exact match against any candidate (e.g. exact JID or raw user string)
		for _, cand := range candidates {
			if cand != "" && strings.EqualFold(cand, trimmedR) {
				return true
			}
		}

		// If recipient is configured as a phone number, check if its LID matches incoming sender/chat
		if t.client != nil && t.client.Store != nil && t.client.Store.LIDs != nil {
			normR := normalizePhone(trimmedR)
			if normR != "" {
				pnJID := types.NewJID(normR, types.DefaultUserServer)
				if lid, err := t.client.Store.LIDs.GetLIDForPN(context.Background(), pnJID); err == nil && !lid.IsEmpty() {
					if lid.User == senderJID.User || lid.User == chatJID.User || lid.String() == senderJID.String() || lid.String() == chatJID.String() {
						return true
					}
				}
			}
		}

		// Normalized phone digit matching
		normR := normalizePhone(trimmedR)
		if normR == "" {
			continue
		}

		for _, cand := range candidates {
			normCand := normalizePhone(cand)
			if normCand == "" {
				continue
			}

			// Exact normalized digit match
			if normR == normCand {
				return true
			}

			// Suffix match for country code differences (only for valid phone numbers with >= 7 digits)
			if len(normR) >= 7 && len(normCand) >= 7 {
				if strings.HasSuffix(normCand, normR) || strings.HasSuffix(normR, normCand) {
					return true
				}
			}
		}
	}
	return false
}

// matchesTarget checks whether an incoming chat/sender JID matches an explicitly granted target JID, resolving PN <-> LID mappings.
func (t *Tenant) matchesTarget(incoming, target types.JID) bool {
	if target.IsEmpty() {
		return true
	}
	if incoming.String() == target.String() || incoming.User == target.User {
		return true
	}

	normInc := normalizePhone(incoming.User)
	normTgt := normalizePhone(target.User)
	if normInc != "" && normTgt != "" {
		if normInc == normTgt {
			return true
		}
		if len(normInc) >= 7 && len(normTgt) >= 7 && (strings.HasSuffix(normInc, normTgt) || strings.HasSuffix(normTgt, normInc)) {
			return true
		}
	}

	if t.client != nil && t.client.Store != nil && t.client.Store.LIDs != nil {
		ctx := context.Background()
		if target.Server == "s.whatsapp.net" {
			if lid, err := t.client.Store.LIDs.GetLIDForPN(ctx, target); err == nil && !lid.IsEmpty() {
				if lid.User == incoming.User || lid.String() == incoming.String() {
					return true
				}
			}
		}
		if incoming.Server == "lid" {
			if pn, err := t.client.Store.LIDs.GetPNForLID(ctx, incoming); err == nil && !pn.IsEmpty() {
				if pn.User == target.User || pn.String() == target.String() || (len(normTgt) >= 7 && normalizePhone(pn.User) == normTgt) {
					return true
				}
			}
		}
		if target.Server == "lid" {
			if pn, err := t.client.Store.LIDs.GetPNForLID(ctx, target); err == nil && !pn.IsEmpty() {
				if pn.User == incoming.User || pn.String() == incoming.String() || (len(normInc) >= 7 && normalizePhone(pn.User) == normInc) {
					return true
				}
			}
		}
	}
	return false
}

func (t *Tenant) resolveContactName(msg *events.Message) string {
	ctx := context.Background()
	senderJID := msg.Info.Sender
	chatJID := msg.Info.Chat
	isGroup := chatJID.Server == "g.us"

	// 1. Check PushName directly on the message
	if msg.Info.PushName != "" && !isAllDigits(msg.Info.PushName) {
		return msg.Info.PushName
	}

	// 2. Check contacts store with Phone Number JID
	if t.client != nil && t.client.Store != nil {
		var pnJID types.JID
		if senderJID.Server == "lid" && t.client.Store.LIDs != nil {
			if pn, err := t.client.Store.LIDs.GetPNForLID(ctx, senderJID); err == nil && !pn.IsEmpty() {
				pnJID = pn
			}
		} else {
			pnJID = senderJID
		}

		if !pnJID.IsEmpty() && t.client.Store.Contacts != nil {
			if contact, err := t.client.Store.Contacts.GetContact(ctx, pnJID); err == nil {
				if contact.FullName != "" {
					return contact.FullName
				}
				if contact.BusinessName != "" {
					return contact.BusinessName
				}
				if contact.PushName != "" && !isAllDigits(contact.PushName) {
					return contact.PushName
				}
			}
		}

		// Also check senderJID directly in Contacts
		if t.client.Store.Contacts != nil {
			if contact, err := t.client.Store.Contacts.GetContact(ctx, senderJID); err == nil {
				if contact.FullName != "" {
					return contact.FullName
				}
				if contact.BusinessName != "" {
					return contact.BusinessName
				}
				if contact.PushName != "" && !isAllDigits(contact.PushName) {
					return contact.PushName
				}
			}
		}

		// Also check chatJID directly in Contacts (for 1-on-1 chats only)
		if !isGroup && t.client.Store.Contacts != nil {
			if contact, err := t.client.Store.Contacts.GetContact(ctx, chatJID); err == nil {
				if contact.FullName != "" {
					return contact.FullName
				}
				if contact.BusinessName != "" {
					return contact.BusinessName
				}
				if contact.PushName != "" && !isAllDigits(contact.PushName) {
					return contact.PushName
				}
			}
		}
	}

	// 3. Check SQLite database chats table (for 1-on-1 chats or sender JID directly)
	if t.messageStore != nil && t.messageStore.db != nil {
		var name string
		if !isGroup {
			if err := t.messageStore.db.QueryRow("SELECT name FROM chats WHERE jid = ? OR jid = ?", chatJID.String(), senderJID.String()).Scan(&name); err == nil {
				if name != "" && !isAllDigits(name) {
					return name
				}
			}
		} else {
			if err := t.messageStore.db.QueryRow("SELECT name FROM chats WHERE jid = ?", senderJID.String()).Scan(&name); err == nil {
				if name != "" && !isAllDigits(name) {
					return name
				}
			}
		}
	}

	// 4. Fallback to Phone Number if known instead of raw LID number
	if t.client != nil && t.client.Store != nil && t.client.Store.LIDs != nil && senderJID.Server == "lid" {
		if pn, err := t.client.Store.LIDs.GetPNForLID(ctx, senderJID); err == nil && !pn.IsEmpty() {
			return "+" + pn.User
		}
	}

	if senderJID.User != "" {
		return senderJID.User
	}
	return "Contact"
}

// isGroupMessageDirectedToOwner checks if a message in a group chat is directed at the owner (via @mention, direct reply/quote, or name mention).
func (t *Tenant) isGroupMessageDirectedToOwner(msg *events.Message) (bool, string) {
	if msg == nil || msg.Message == nil {
		return false, ""
	}

	ownerPN := normalizePhone(t.ownerPhone)
	ownerUser := ""
	if t.client != nil && t.client.Store != nil && t.client.Store.ID != nil {
		ownerUser = t.client.Store.ID.User
	}

	// 1. Check ContextInfo for mentions and replies
	ci := getContextInfo(msg.Message)
	if ci != nil {
		// Mentions
		for _, mj := range ci.GetMentionedJID() {
			normMJ := normalizePhone(mj)
			if (ownerPN != "" && (normMJ == ownerPN || strings.HasSuffix(normMJ, ownerPN))) ||
				(ownerUser != "" && (mj == ownerUser || strings.Contains(mj, ownerUser))) {
				return true, "mentioned you"
			}
		}

		// Reply/Quote to owner's message
		if participant := ci.GetParticipant(); participant != "" {
			normP := normalizePhone(participant)
			if (ownerPN != "" && (normP == ownerPN || strings.HasSuffix(normP, ownerPN))) ||
				(ownerUser != "" && (participant == ownerUser || strings.Contains(participant, ownerUser))) {
				return true, "replied to you"
			}
		}
	}

	// 2. Check message body text for owner's first name/nickname
	text := strings.ToLower(extractTextContent(msg.Message))
	if text != "" {
		ownerNames := []string{}
		if t.ownerPhone != "" && t.client != nil && t.client.Store != nil {
			pnJID := types.NewJID(normalizePhone(t.ownerPhone), types.DefaultUserServer)
			if contact, err := t.client.Store.Contacts.GetContact(context.Background(), pnJID); err == nil {
				if contact.FullName != "" {
					parts := strings.Fields(contact.FullName)
					if len(parts) > 0 && len(parts[0]) >= 3 {
						ownerNames = append(ownerNames, strings.ToLower(parts[0]))
					}
				}
				if contact.PushName != "" && !isAllDigits(contact.PushName) && len(contact.PushName) >= 3 {
					parts := strings.Fields(contact.PushName)
					if len(parts) > 0 && len(parts[0]) >= 3 {
						ownerNames = append(ownerNames, strings.ToLower(parts[0]))
					}
				}
			}
		}
		if t.client != nil && t.client.Store != nil && t.client.Store.PushName != "" {
			parts := strings.Fields(t.client.Store.PushName)
			if len(parts) > 0 && len(parts[0]) >= 3 {
				ownerNames = append(ownerNames, strings.ToLower(parts[0]))
			}
		}
		for _, name := range ownerNames {
			if strings.Contains(text, name) {
				return true, fmt.Sprintf("mentioned %s", name)
			}
		}
	}

	return false, ""
}

// handleEvent processes incoming whatsmeow events for a specific tenant.
func (t *Tenant) handleEvent(evt interface{}) {
	switch v := evt.(type) {
	case *events.Message:
		if v.Message.GetPollUpdateMessage() != nil {
			t.handleTenantPollVote(v)
		} else {
			handleMessage(t.client, t.messageStore, v, t.logger)

			isAllowed := t.isAllowedRecipient(v.Info.Sender, v.Info.Chat)
			isGroup := v.Info.Chat.Server == "g.us"

			// Determine normalized recipient key (for group chats, key by group JID)
			recipientKey := v.Info.Chat.String()
			if !isGroup {
				recipientKey = normalizePhone(v.Info.Chat.User)
				if recipientKey == "" {
					recipientKey = normalizePhone(v.Info.Sender.User)
				}
			}

			if v.Info.IsFromMe && isAllowed {
				if t.isApiSent(string(v.Info.ID)) {
					t.logger.Infof("Ignoring self-echo of API-sent message %s", v.Info.ID)
					return
				}
				// When owner manually texts an allowed contact (not self-chat):
				// Keep active poll alive (no ping-pong delete/recreate), update conversation activity.
				if recipientKey != normalizePhone(t.ownerPhone) {
					t.mu.Lock()
					t.initMapsLocked()
					now := time.Now()
					t.lastActivityTimeByRecipient[recipientKey] = now
					t.lastManualTextTimeByRecipient[recipientKey] = now
					if t.sessionStartedAtByRecipient[recipientKey].IsZero() {
						t.sessionStartedAtByRecipient[recipientKey] = now
					}
					t.logger.Infof("Owner sent manual message to %s -> active conversation session updated (poll preserved)", recipientKey)
					t.mu.Unlock()
				}
				return
			}

			if !v.Info.IsFromMe && isAllowed {
				t.mu.Lock()
				t.initMapsLocked()
				t.lastTargetJID = v.Info.Chat

				now := time.Now()
				timeout := 5 * time.Minute

				// Check if grant is active
				activeGrant := false
				if t.grantKind == "duration" && now.Before(t.grantExpiresAt) {
					if !t.grantArmedAt.IsZero() && now.Sub(t.grantArmedAt) >= timeout {
						t.logger.Infof("Takeover duration grant timed out (> %v silence) for %s -> revoked", timeout, t.Hash)
						t.grantKind = "none"
						t.grantRemaining = 0
						t.grantTargetJID = types.EmptyJID
						t.grantExpiresAt = time.Time{}
						t.grantArmedAt = time.Time{}
					} else {
						activeGrant = true
					}
				} else if t.grantKind == "count" && t.grantRemaining > 0 {
					if !t.grantArmedAt.IsZero() && now.Sub(t.grantArmedAt) >= timeout {
						t.logger.Infof("Takeover count grant timed out (> %v silence) for %s -> revoked", timeout, t.Hash)
						t.grantKind = "none"
						t.grantRemaining = 0
						t.grantTargetJID = types.EmptyJID
						t.grantArmedAt = time.Time{}
					} else {
						activeGrant = true
					}
				}
				grantTarget := t.grantTargetJID
				t.mu.Unlock()

				// If an active grant was explicitly armed for a specific target JID, check match
				if activeGrant && !grantTarget.IsEmpty() {
					if !t.matchesTarget(v.Info.Chat, grantTarget) && !t.matchesTarget(v.Info.Sender, grantTarget) {
						activeGrant = false
					}
				}

				if activeGrant {
					t.mu.Lock()
					t.lastActivityTimeByRecipient[recipientKey] = now
					t.mu.Unlock()
					t.logger.Infof("Active takeover grant for %s -> drafting AI reply immediately", t.Hash)
					go t.replyToChat(v.Info.Chat)
				} else if t.ownerPhone != "" {
					// For Group Chats, apply Smart Triggering
					triggerReason := ""
					if isGroup {
						directed, reason := t.isGroupMessageDirectedToOwner(v)
						if !directed {
							// Background group chatter: stored in DB, but no poll triggered
							return
						}
						triggerReason = reason
					}

					t.mu.Lock()
					t.initMapsLocked()

					oldPollID := t.activePollsByRecipient[recipientKey]
					sessionStart := t.sessionStartedAtByRecipient[recipientKey]
					lastManual := t.lastManualTextTimeByRecipient[recipientKey]
					lastActivity := t.lastActivityTimeByRecipient[recipientKey]

					hasOwnerParticipated := !lastManual.IsZero() && (lastManual.After(sessionStart) || lastManual.Equal(sessionStart))

					shouldKeepExistingPoll := false
					var pollToDelete string

					if oldPollID != "" {
						if !hasOwnerParticipated {
							// Case 1: Owner has NOT replied manually yet.
							// The poll stays alive indefinitely (even after 5 minutes) waiting for owner!
							shouldKeepExistingPoll = true
							t.logger.Infof("Owner has not replied yet. Keeping existing poll %s alive indefinitely for %s.", oldPollID, recipientKey)
						} else {
							// Case 2: Owner has replied manually (active conversation session).
							if !lastActivity.IsZero() && now.Sub(lastActivity) < timeout {
								// Within 5 minutes: active conversation session! Keep existing poll alive.
								shouldKeepExistingPoll = true
								t.logger.Infof("Active conversation in progress with %s. Keeping existing poll %s alive without duplicate dispatch.", recipientKey, oldPollID)
							} else {
								// Silent for >= 5 minutes: session timed out! Delete old poll, will create fresh poll.
								pollToDelete = oldPollID
								delete(t.activePollsByRecipient, recipientKey)
								delete(t.lastPollTimeByRecipient, recipientKey)
								delete(t.sessionStartedAtByRecipient, recipientKey)
								delete(t.lastManualTextTimeByRecipient, recipientKey)
								delete(t.lastActivityTimeByRecipient, recipientKey)
								t.logger.Infof("Active conversation session timed out (> %v silence) for %s. Revoking old poll %s and starting new session.", timeout, recipientKey, oldPollID)
							}
						}
					}

					t.lastActivityTimeByRecipient[recipientKey] = now
					t.mu.Unlock()

					if pollToDelete != "" {
						_ = deleteWhatsAppMessage(t.client, t.ownerPhone, pollToDelete)
						go func(pID string) {
							expireURL := fmt.Sprintf("%s/api/polls/%s/expire?hash=%s", getWebhookBaseURL(), pID, t.Hash)
							req, _ := http.NewRequest(http.MethodPost, expireURL, nil)
							if resp, err := http.DefaultClient.Do(req); err == nil && resp != nil {
								_ = resp.Body.Close()
							}
						}(pollToDelete)
					}

					if shouldKeepExistingPoll {
						return
					}

					// Build and dispatch fresh poll
					chatName := t.resolveContactName(v)
					var question string
					if isGroup {
						groupName := t.resolveGroupName(v.Info.Chat)
						textSnippet := strings.TrimSpace(extractTextContent(v.Message))
						if len(textSnippet) > 35 {
							textSnippet = textSnippet[:32] + "..."
						}
						if textSnippet != "" {
							question = fmt.Sprintf("%s in \"%s\" (%s: \"%s\"). Take over?", chatName, groupName, triggerReason, textSnippet)
						} else {
							question = fmt.Sprintf("%s in \"%s\" %s. Take over?", chatName, groupName, triggerReason)
						}
					} else {
						question = fmt.Sprintf("%s texted you. Take over?", chatName)
					}
					options := []string{"Send 1 text", "5 minutes", "2 hours", "Deny"}

					ok, status, pollID := sendWhatsAppPoll(t.client, t.ownerPhone, question, options, 1)
					if ok && pollID != "" {
						t.recordApiSent(pollID) // CRITICAL: record poll ID so self-echo doesn't trigger manual message reset!
						t.mu.Lock()
						t.initMapsLocked()
						t.activePollsByRecipient[recipientKey] = pollID
						t.lastPollTimeByRecipient[recipientKey] = time.Now()
						t.sessionStartedAtByRecipient[recipientKey] = time.Now()
						t.lastActivityTimeByRecipient[recipientKey] = time.Now()
						t.mu.Unlock()
					}
					fmt.Printf("\n[takeover %s] Sent approval poll to owner %s for incoming message from %s (recipient %s): ok=%v status=%s pollID=%s\n", t.Hash, t.ownerPhone, chatName, recipientKey, ok, status, pollID)

					go func(pID, contact, cName, q string, opts []string) {
						payload, _ := json.Marshal(map[string]interface{}{
							"id":             pID,
							"hash":           t.Hash,
							"contact":        contact,
							"contactDisplay": cName,
							"question":       q,
							"options":        opts,
							"status":         "pending",
						})
						webhookURL := fmt.Sprintf("%s/api/polls", getWebhookBaseURL())
						resp, err := http.Post(webhookURL, "application/json", bytes.NewReader(payload))
						if err == nil && resp != nil {
							_ = resp.Body.Close()
						}
					}(pollID, recipientKey, chatName, question, options)
				}
			}
		}
	case *events.HistorySync:
		t.handleTenantHistorySync(v)
	case *events.Connected:
		t.logger.Infof("Tenant %s successfully connected and authenticated", t.Hash)
		t.mu.Lock()
		t.connectedAt = time.Now()
		t.lastError = ""
		t.reconnectAttempts = 0
		t.mu.Unlock()
	case *events.Disconnected:
		t.logger.Warnf("Tenant %s disconnected from WhatsApp socket", t.Hash)
		t.mu.Lock()
		t.disconnectedAt = time.Now()
		t.mu.Unlock()
	case *events.StreamReplaced:
		t.logger.Warnf("Tenant %s stream was replaced by another active session", t.Hash)
		t.mu.Lock()
		t.disconnectedAt = time.Now()
		t.lastError = "stream replaced by another active session"
		t.mu.Unlock()
	case *events.TemporaryBan:
		t.logger.Errorf("Tenant %s is temporarily banned by WhatsApp: code=%v expire=%v", t.Hash, v.Code, v.Expire)
		t.mu.Lock()
		t.lastError = fmt.Sprintf("temporarily banned (code: %v, expire: %v)", v.Code, v.Expire)
		t.mu.Unlock()
	case *events.ConnectFailure:
		t.logger.Errorf("Tenant %s connection failure: %v", t.Hash, v.Reason)
		t.mu.Lock()
		t.lastError = fmt.Sprintf("connect failure: %v", v.Reason)
		t.mu.Unlock()
	case *events.LoggedOut:
		t.logger.Warnf("Tenant %s logged out from WhatsApp. Wiping stored session and messages...", t.Hash)
		t.close()
		_ = os.RemoveAll(t.dir())
		t.logger.Infof("Tenant %s local data wiped.", t.Hash)
	}
}

// setupEventHandler wires message and poll events for this tenant.
func (t *Tenant) setupEventHandler() {
	t.client.AddEventHandler(t.handleEvent)
}

// handleTenantHistorySync processes WhatsApp history sync ONLY for targeted recipients, capping at 75 recent messages per chat.
func (t *Tenant) handleTenantHistorySync(historySync *events.HistorySync) {
	if historySync == nil || historySync.Data == nil {
		return
	}

	totalConvs := len(historySync.Data.Conversations)
	t.logger.Infof("Received history sync chunk with %d conversations. Filtering for targeted recipients...", totalConvs)

	syncedConvs := 0
	syncedMsgs := 0

	for _, conversation := range historySync.Data.Conversations {
		if conversation == nil || conversation.ID == nil {
			continue
		}

		chatJID := *conversation.ID
		jid, err := types.ParseJID(chatJID)
		if err != nil {
			continue
		}

		// Only sync history for allowed recipients (or owner chat)
		isAllowed := t.isAllowedRecipient(jid, jid)
		isOwner := t.ownerPhone != "" && (normalizePhone(jid.User) == normalizePhone(t.ownerPhone))
		if len(t.recipients) > 0 && !isAllowed && !isOwner {
			continue // Skip non-targeted chats entirely
		}

		name := GetChatName(context.Background(), t.client, t.messageStore, jid, chatJID, conversation, "", t.logger)
		messages := conversation.Messages
		if len(messages) == 0 {
			continue
		}

		// Cap to latest 75 messages (between 50 and 100)
		const maxHistoryPerChat = 75
		if len(messages) > maxHistoryPerChat {
			messages = messages[:maxHistoryPerChat]
		}

		latestMsg := messages[0]
		if latestMsg != nil && latestMsg.Message != nil {
			if ts := latestMsg.Message.GetMessageTimestamp(); ts != 0 {
				t.messageStore.StoreChat(chatJID, name, time.Unix(int64(ts), 0))
			}
		}

		for _, msg := range messages {
			if msg == nil || msg.Message == nil {
				continue
			}

			var content string
			if msg.Message.Message != nil {
				if conv := msg.Message.Message.GetConversation(); conv != "" {
					content = conv
				} else if ext := msg.Message.Message.GetExtendedTextMessage(); ext != nil {
					content = ext.GetText()
				}
			}

			repliedTo := ""
			if msg.Message.Message != nil {
				repliedTo = extractQuotedText(msg.Message.Message)
			}

			var mediaType, filename, url string
			var mediaKey, fileSHA256, fileEncSHA256 []byte
			var fileLength uint64
			if msg.Message.Message != nil {
				mediaType, filename, url, mediaKey, fileSHA256, fileEncSHA256, fileLength = extractMediaInfo(msg.Message.Message)
			}

			if content == "" && mediaType == "" {
				continue
			}

			var sender string
			isFromMe := false
			if msg.Message.Key != nil {
				if msg.Message.Key.FromMe != nil {
					isFromMe = *msg.Message.Key.FromMe
				}
				if !isFromMe && msg.Message.Key.Participant != nil && *msg.Message.Key.Participant != "" {
					sender = *msg.Message.Key.Participant
				} else if isFromMe {
					if t.client != nil && t.client.Store != nil && t.client.Store.ID != nil {
						sender = t.client.Store.ID.User
					} else {
						sender = "me"
					}
				} else {
					sender = jid.User
				}
			} else {
				sender = jid.User
			}

			msgID := ""
			if msg.Message.Key != nil && msg.Message.Key.ID != nil {
				msgID = *msg.Message.Key.ID
			}

			timestamp := time.Time{}
			if ts := msg.Message.GetMessageTimestamp(); ts != 0 {
				timestamp = time.Unix(int64(ts), 0)
			} else {
				continue
			}

			_ = t.messageStore.StoreMessage(
				msgID,
				chatJID,
				sender,
				content,
				repliedTo,
				timestamp,
				isFromMe,
				mediaType,
				filename,
				url,
				mediaKey,
				fileSHA256,
				fileEncSHA256,
				fileLength,
				"remote",
			)
			syncedMsgs++
		}
		syncedConvs++
		t.logger.Infof("History sync: Stored %d recent messages for targeted recipient %s (%s)", len(messages), name, chatJID)
	}

	t.logger.Infof("History sync completed: %d messages across %d targeted chats (filtered from %d total conversations)", syncedMsgs, syncedConvs, totalConvs)
}

// handleTenantPollVote handles incoming poll votes from the owner and activates takeover grants.
func (t *Tenant) handleTenantPollVote(msg *events.Message) {
	if msg.Message.GetPollUpdateMessage() == nil {
		return
	}
	vote, err := t.client.DecryptPollVote(context.Background(), msg)
	if err != nil {
		t.logger.Warnf("Failed to decrypt poll vote: %v", err)
		return
	}
	pollMsgID := msg.Message.GetPollUpdateMessage().GetPollCreationMessageKey().GetID()
	question, selected := resolvePollOptions(pollMsgID, vote.GetSelectedOptions())
	timestamp := msg.Info.Timestamp.Format("2006-01-02 15:04:05")
	fmt.Printf("[%s] POLL VOTE from %s on %q: %v\n", timestamp, msg.Info.Sender, question, selected)
	joined := strings.Join(selected, ", ")
	_ = t.messageStore.StorePollVote(pollMsgID, msg.Info.Sender.String(), question, joined, msg.Info.Timestamp)

	if len(selected) > 0 {
		choice := selected[0]
		t.mu.Lock()
		targetJID := t.lastTargetJID
		if t.activePollsByRecipient != nil {
			for rk, pid := range t.activePollsByRecipient {
				if pid == pollMsgID {
					delete(t.activePollsByRecipient, rk)
					if t.lastPollTimeByRecipient != nil {
						delete(t.lastPollTimeByRecipient, rk)
					}
					break
				}
			}
		}
		normChoice := strings.TrimSpace(strings.ToLower(choice))
		isOneText := strings.Contains(normChoice, "1") || strings.Contains(normChoice, "1 text") || normChoice == "send 1 text"
		is5Min := strings.Contains(normChoice, "5 min") || strings.Contains(normChoice, "5 minutes")
		is2Hours := strings.Contains(normChoice, "2 hour") || strings.Contains(normChoice, "2 hr") || strings.Contains(normChoice, "2 hours")
		isDeny := strings.Contains(normChoice, "deny")

		now := time.Now()
		if isOneText {
			t.grantKind = "count"
			t.grantRemaining = 1
			t.grantTargetJID = targetJID
			t.grantArmedAt = now
			t.logger.Infof("Takeover granted for %s: 1 text (target %s)", t.Hash, targetJID)
			t.mu.Unlock()
			go t.replyToChat(targetJID)
		} else if is5Min {
			t.grantKind = "duration"
			t.grantExpiresAt = now.Add(5 * time.Minute)
			t.grantTargetJID = targetJID
			t.grantArmedAt = now
			t.logger.Infof("Takeover granted for %s: 5 minutes (until %s, target %s)", t.Hash, t.grantExpiresAt.Format("15:04:05"), targetJID)
			t.mu.Unlock()
			go t.replyToChat(targetJID)
		} else if is2Hours {
			t.grantKind = "duration"
			t.grantExpiresAt = now.Add(2 * time.Hour)
			t.grantTargetJID = targetJID
			t.grantArmedAt = now
			t.logger.Infof("Takeover granted for %s: 2 hours (until %s, target %s)", t.Hash, t.grantExpiresAt.Format("15:04:05"), targetJID)
			t.mu.Unlock()
			go t.replyToChat(targetJID)
		} else if isDeny {
			t.grantKind = "none"
			t.grantRemaining = 0
			t.grantTargetJID = types.EmptyJID
			t.grantArmedAt = time.Time{}
			t.grantExpiresAt = time.Time{}
			t.logger.Infof("Takeover denied for %s", t.Hash)
			t.mu.Unlock()
		} else {
			t.mu.Unlock()
		}
	}
}
