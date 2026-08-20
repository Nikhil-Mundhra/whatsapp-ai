package main

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
	// If an active takeover grant was explicitly armed for this contact/chat, allow it!
	t.mu.Lock()
	activeGrant := false
	if t.grantKind == "duration" && time.Now().Before(t.grantExpiresAt) {
		activeGrant = true
	} else if t.grantKind == "count" && t.grantRemaining > 0 {
		activeGrant = true
	}
	grantTarget := t.grantTargetJID
	t.mu.Unlock()

	if activeGrant && !grantTarget.IsEmpty() {
		if chatJID.User == grantTarget.User || senderJID.User == grantTarget.User || chatJID.String() == grantTarget.String() {
			return true
		}
	}

	// If it's a group chat, check group JID and group name
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
	}

	candidates := []string{
		senderJID.User,
		chatJID.User,
	}

	if t.client != nil && t.client.Store != nil {
		if senderJID.Server == "lid" {
			if pn, err := t.client.Store.LIDs.GetPNForLID(context.Background(), senderJID); err == nil && !pn.IsEmpty() {
				candidates = append(candidates, pn.User)
			}
		}
		if chatJID.Server == "lid" {
			if pn, err := t.client.Store.LIDs.GetPNForLID(context.Background(), chatJID); err == nil && !pn.IsEmpty() {
				candidates = append(candidates, pn.User)
			}
		}

		for _, r := range t.recipients {
			normR := normalizePhone(r)
			if normR == "" {
				continue
			}
			pnJID := types.NewJID(normR, types.DefaultUserServer)
			if lid, err := t.client.Store.LIDs.GetLIDForPN(context.Background(), pnJID); err == nil && !lid.IsEmpty() {
				if lid.User == senderJID.User || lid.User == chatJID.User {
					return true
				}
				candidates = append(candidates, lid.User)
			}
		}
	}

	t.logger.Infof("Evaluating allowed recipient for sender %s (chat %s): candidates=%v allowed_recipients=%v", senderJID, chatJID, candidates, t.recipients)

	for _, cand := range candidates {
		normCand := normalizePhone(cand)
		if normCand == "" {
			continue
		}
		for _, r := range t.recipients {
			normR := normalizePhone(r)
			if normR == "" {
				continue
			}
			if normR == normCand || strings.HasSuffix(normCand, normR) || strings.HasSuffix(normR, normCand) {
				return true
			}
		}
	}
	return false
}

func (t *Tenant) resolveContactName(msg *events.Message) string {
	ctx := context.Background()
	senderJID := msg.Info.Sender
	chatJID := msg.Info.Chat

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

		// Also check chatJID directly in Contacts (for 1-on-1 chats)
		if t.client.Store.Contacts != nil {
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

	// 3. Check SQLite database chats table (only if not purely digits)
	if t.messageStore != nil && t.messageStore.db != nil {
		var name string
		if err := t.messageStore.db.QueryRow("SELECT name FROM chats WHERE jid = ? OR jid = ?", chatJID.String(), senderJID.String()).Scan(&name); err == nil {
			if name != "" && !isAllDigits(name) {
				return name
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

// handleEvent dispatches incoming WhatsApp events for this tenant.
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
				// Only reset takeover if owner manually texted an allowed contact (not self-chat)
				if recipientKey != normalizePhone(t.ownerPhone) {
					t.mu.Lock()
					if t.grantKind != "none" {
						t.grantKind = "none"
						t.grantRemaining = 0
						t.grantTargetJID = types.EmptyJID
						t.logger.Infof("Owner sent manual message -> reset takeover grant for %s", t.Hash)
					}
					var oldPollID string
					if t.activePollsByRecipient != nil {
						oldPollID = t.activePollsByRecipient[recipientKey]
						delete(t.activePollsByRecipient, recipientKey)
					}
					if t.lastPollTimeByRecipient != nil {
						delete(t.lastPollTimeByRecipient, recipientKey)
					}
					t.mu.Unlock()

					if oldPollID != "" {
						_ = deleteWhatsAppMessage(t.client, t.ownerPhone, oldPollID)
						go func(pID string) {
							expireURL := fmt.Sprintf("%s/api/polls/%s/expire?hash=%s", getWebhookBaseURL(), pID, t.Hash)
							req, _ := http.NewRequest(http.MethodPost, expireURL, nil)
							if resp, err := http.DefaultClient.Do(req); err == nil && resp != nil {
								_ = resp.Body.Close()
							}
						}(oldPollID)
					}
				}
				return
			}

			if !v.Info.IsFromMe && isAllowed {
				t.mu.Lock()
				t.lastTargetJID = v.Info.Chat
				activeGrant := false
				if t.grantKind == "duration" && time.Now().Before(t.grantExpiresAt) {
					activeGrant = true
				} else if t.grantKind == "count" && t.grantRemaining > 0 {
					activeGrant = true
				}
				grantTarget := t.grantTargetJID
				t.mu.Unlock()

				// If an active grant was explicitly armed for a specific target JID, check match
				if activeGrant && !grantTarget.IsEmpty() {
					if v.Info.Chat.User != grantTarget.User && v.Info.Sender.User != grantTarget.User && v.Info.Chat.String() != grantTarget.String() {
						activeGrant = false
					}
				}

				if activeGrant {
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

					t.mu.Lock()
					if t.activePollsByRecipient == nil {
						t.activePollsByRecipient = make(map[string]string)
					}
					if t.lastPollTimeByRecipient == nil {
						t.lastPollTimeByRecipient = make(map[string]time.Time)
					}
					oldPollID := t.activePollsByRecipient[recipientKey]
					lastPollTime := t.lastPollTimeByRecipient[recipientKey]
					t.mu.Unlock()

					// Cooldown check (60 seconds) for 1-on-1 and group chats:
					// If a poll is already active and was sent less than 60s ago, keep it alive without revoking/recreating.
					if oldPollID != "" && time.Since(lastPollTime) < 60*time.Second {
						t.logger.Infof("Active poll %s was sent %v ago (< 60s cooldown) for recipient %s. Keeping existing poll alive.", oldPollID, time.Since(lastPollTime).Round(time.Second), recipientKey)
						return
					}

					// In group chats, if any poll is already active, keep it ALIVE (do not spam or revoke rapidly)
					if isGroup && oldPollID != "" {
						t.logger.Infof("Active poll %s is already pending for group %s. Keeping existing poll alive.", oldPollID, recipientKey)
						return
					}

					if oldPollID != "" {
						t.logger.Infof("Revoking previous active poll %s for recipient %s (tenant %s)", oldPollID, recipientKey, t.Hash)
						_ = deleteWhatsAppMessage(t.client, t.ownerPhone, oldPollID)
						go func(pID string) {
							expireURL := fmt.Sprintf("%s/api/polls/%s/expire?hash=%s", getWebhookBaseURL(), pID, t.Hash)
							req, _ := http.NewRequest(http.MethodPost, expireURL, nil)
							if resp, err := http.DefaultClient.Do(req); err == nil && resp != nil {
								_ = resp.Body.Close()
							}
						}(oldPollID)
					}

					ok, status, pollID := sendWhatsAppPoll(t.client, t.ownerPhone, question, options, 1)
					if ok && pollID != "" {
						t.recordApiSent(pollID) // CRITICAL: record poll ID so self-echo doesn't trigger manual message reset!
						t.mu.Lock()
						t.activePollsByRecipient[recipientKey] = pollID
						t.lastPollTimeByRecipient[recipientKey] = time.Now()
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
		t.logger.Infof("Tenant %s connected", t.Hash)
	case *events.LoggedOut:
		t.logger.Warnf("Tenant %s logged out from WhatsApp. Wiping stored session and messages...", t.Hash)
		t.mu.Lock()
		t.paired = false
		t.pairing = false
		t.qrCode = ""
		if t.client != nil {
			t.client.Disconnect()
		}
		t.mu.Unlock()
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

		if isOneText {
			t.grantKind = "count"
			t.grantRemaining = 1
			t.grantTargetJID = targetJID
			t.logger.Infof("Takeover granted for %s: 1 text (target %s)", t.Hash, targetJID)
			t.mu.Unlock()
			go t.replyToChat(targetJID)
		} else if is5Min {
			t.grantKind = "duration"
			t.grantExpiresAt = time.Now().Add(5 * time.Minute)
			t.grantTargetJID = targetJID
			t.logger.Infof("Takeover granted for %s: 5 minutes (until %s, target %s)", t.Hash, t.grantExpiresAt.Format("15:04:05"), targetJID)
			t.mu.Unlock()
			go t.replyToChat(targetJID)
		} else if is2Hours {
			t.grantKind = "duration"
			t.grantExpiresAt = time.Now().Add(2 * time.Hour)
			t.grantTargetJID = targetJID
			t.logger.Infof("Takeover granted for %s: 2 hours (until %s, target %s)", t.Hash, t.grantExpiresAt.Format("15:04:05"), targetJID)
			t.mu.Unlock()
			go t.replyToChat(targetJID)
		} else if isDeny {
			t.grantKind = "none"
			t.grantRemaining = 0
			t.grantTargetJID = types.EmptyJID
			t.logger.Infof("Takeover denied for %s", t.Hash)
			t.mu.Unlock()
		} else {
			t.mu.Unlock()
		}
	}
}
