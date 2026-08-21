package bridge

import (
	"context"
	"fmt"
	"reflect"
	"strings"
	"time"

	"go.mau.fi/whatsmeow"
	waProto "go.mau.fi/whatsmeow/binary/proto"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
)

// extractTextContent extracts text content from a message
func extractTextContent(msg *waProto.Message) string {
	if msg == nil {
		return ""
	}

	// Try to get text content
	if text := msg.GetConversation(); text != "" {
		return text
	} else if extendedText := msg.GetExtendedTextMessage(); extendedText != nil {
		return extendedText.GetText()
	} else if image := msg.GetImageMessage(); image != nil {
		return image.GetCaption()
	} else if video := msg.GetVideoMessage(); video != nil {
		return video.GetCaption()
	} else if document := msg.GetDocumentMessage(); document != nil {
		return document.GetCaption()
	}

	// For now, we're ignoring non-text messages
	return ""
}

// getContextInfo returns the ContextInfo attached to a message, if any.
func getContextInfo(msg *waProto.Message) *waProto.ContextInfo {
	if msg == nil {
		return nil
	}
	if extendedText := msg.GetExtendedTextMessage(); extendedText != nil {
		return extendedText.GetContextInfo()
	} else if image := msg.GetImageMessage(); image != nil {
		return image.GetContextInfo()
	} else if video := msg.GetVideoMessage(); video != nil {
		return video.GetContextInfo()
	} else if audio := msg.GetAudioMessage(); audio != nil {
		return audio.GetContextInfo()
	} else if document := msg.GetDocumentMessage(); document != nil {
		return document.GetContextInfo()
	}
	return nil
}

// extractQuotedText returns the text of the message that a reply quotes, if any.
func extractQuotedText(msg *waProto.Message) string {
	ci := getContextInfo(msg)
	if ci == nil || ci.GetQuotedMessage() == nil {
		return ""
	}
	return extractTextContent(ci.GetQuotedMessage())
}

// handlePollVote decrypts and logs an incoming poll vote (events.Message with a PollUpdateMessage).
func handlePollVote(client *whatsmeow.Client, messageStore *MessageStore, msg *events.Message, logger waLog.Logger) {
	if msg.Message.GetPollUpdateMessage() == nil {
		return
	}
	vote, err := client.DecryptPollVote(context.Background(), msg)
	if err != nil {
		logger.Warnf("Failed to decrypt poll vote: %v", err)
		return
	}
	pollMsgID := msg.Message.GetPollUpdateMessage().GetPollCreationMessageKey().GetID()
	question, selected := resolvePollOptions(pollMsgID, vote.GetSelectedOptions())
	timestamp := msg.Info.Timestamp.Format("2006-01-02 15:04:05")
	fmt.Printf("[%s] POLL VOTE from %s on %q: %v\n", timestamp, msg.Info.Sender, question, selected)
	joined := strings.Join(selected, ", ")
	err = messageStore.StorePollVote(pollMsgID, msg.Info.Sender.String(), question, joined, msg.Info.Timestamp)
	if err != nil {
		logger.Warnf("Failed to store poll vote: %v", err)
	}
}

// handleMessage handles regular incoming messages with media support
func handleMessage(client *whatsmeow.Client, messageStore *MessageStore, msg *events.Message, logger waLog.Logger) {
	// Save message to database
	chatJID := msg.Info.Chat.String()
	sender := msg.Info.Sender.User

	// Get appropriate chat name (pass nil for conversation since we don't have one for regular messages)
	name := GetChatName(context.Background(), client, messageStore, msg.Info.Chat, chatJID, nil, sender, logger)

	// Update chat in database with the message timestamp (keeps last message time updated)
	err := messageStore.StoreChat(chatJID, name, msg.Info.Timestamp)
	if err != nil {
		logger.Warnf("Failed to store chat: %v", err)
	}

	// Extract text content
	content := extractTextContent(msg.Message)

	// Extract quoted (replied-to) message text
	repliedTo := extractQuotedText(msg.Message)

	// Extract media info
	mediaType, filename, url, mediaKey, fileSHA256, fileEncSHA256, fileLength := extractMediaInfo(msg.Message)

	// Skip if there's no content and no media
	if content == "" && mediaType == "" {
		return
	}

	// Store message in database
	// origin distinguishes how the message entered: "phone" = sent from the
	// owner's own phone (IsFromMe), "remote" = sent by the other person.
	origin := "remote"
	if msg.Info.IsFromMe {
		origin = "phone"
		var existingOrigin string
		if err := messageStore.db.QueryRow("SELECT origin FROM messages WHERE id = ?", msg.Info.ID).Scan(&existingOrigin); err == nil && existingOrigin == "api" {
			origin = "api"
		}
	}
	err = messageStore.StoreMessage(
		msg.Info.ID,
		chatJID,
		sender,
		content,
		repliedTo,
		msg.Info.Timestamp,
		msg.Info.IsFromMe,
		mediaType,
		filename,
		url,
		mediaKey,
		fileSHA256,
		fileEncSHA256,
		fileLength,
		origin,
	)

	if err != nil {
		logger.Warnf("Failed to store message: %v", err)
	} else {
		// Log message reception
		timestamp := msg.Info.Timestamp.Format("2006-01-02 15:04:05")
		direction := "←"
		if msg.Info.IsFromMe {
			direction = "→"
		}

		// Only print live messages to console (avoids flooding console during initial history sync)
		if time.Since(msg.Info.Timestamp) < 2*time.Minute {
			if mediaType != "" {
				fmt.Printf("[%s] %s %s: [%s: %s] %s\n", timestamp, direction, sender, mediaType, filename, content)
			} else if content != "" {
				fmt.Printf("[%s] %s %s: %s\n", timestamp, direction, sender, content)
			}
		}
	}
}

func isAllDigits(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" {
		return true
	}
	for _, r := range s {
		if (r < '0' || r > '9') && r != '+' && r != '-' && r != ' ' {
			return false
		}
	}
	return true
}

// GetChatName determines the appropriate name for a chat based on JID and other info
func GetChatName(ctx context.Context, client *whatsmeow.Client, messageStore *MessageStore, jid types.JID, chatJID string, conversation interface{}, sender string, logger waLog.Logger) string {
	// First, check if chat already exists in database with a non-numeric name
	var existingName string
	err := messageStore.db.QueryRow("SELECT name FROM chats WHERE jid = ?", chatJID).Scan(&existingName)
	if err == nil && existingName != "" && !isAllDigits(existingName) {
		logger.Infof("Using existing chat name for %s: %s", chatJID, existingName)
		return existingName
	}

	// Need to determine chat name
	var name string

	if jid.Server == "g.us" {
		// This is a group chat
		logger.Infof("Getting name for group: %s", chatJID)

		if conversation != nil {
			var displayName, convName *string
			v := reflect.ValueOf(conversation)
			if v.Kind() == reflect.Ptr && !v.IsNil() {
				v = v.Elem()
				if displayNameField := v.FieldByName("DisplayName"); displayNameField.IsValid() && displayNameField.Kind() == reflect.Ptr && !displayNameField.IsNil() {
					dn := displayNameField.Elem().String()
					displayName = &dn
				}
				if nameField := v.FieldByName("Name"); nameField.IsValid() && nameField.Kind() == reflect.Ptr && !nameField.IsNil() {
					n := nameField.Elem().String()
					convName = &n
				}
			}

			if displayName != nil && *displayName != "" {
				name = *displayName
			} else if convName != nil && *convName != "" {
				name = *convName
			}
		}

		if name == "" {
			groupInfo, err := client.GetGroupInfo(ctx, jid)
			if err == nil && groupInfo.Name != "" {
				name = groupInfo.Name
			} else {
				name = fmt.Sprintf("Group %s", jid.User)
			}
		}

		logger.Infof("Using group name: %s", name)
	} else {
		// This is an individual contact
		logger.Infof("Getting name for contact: %s", chatJID)

		// 1. Check contact store by JID
		if client != nil && client.Store != nil && client.Store.Contacts != nil {
			if contact, err := client.Store.Contacts.GetContact(ctx, jid); err == nil {
				if contact.FullName != "" {
					name = contact.FullName
				} else if contact.BusinessName != "" {
					name = contact.BusinessName
				} else if contact.PushName != "" && !isAllDigits(contact.PushName) {
					name = contact.PushName
				}
			}

			// 2. If JID is an LID, lookup Phone Number JID and check Contacts
			if name == "" && jid.Server == "lid" && client.Store.LIDs != nil {
				if pn, err := client.Store.LIDs.GetPNForLID(ctx, jid); err == nil && !pn.IsEmpty() {
					if contact, err := client.Store.Contacts.GetContact(ctx, pn); err == nil {
						if contact.FullName != "" {
							name = contact.FullName
						} else if contact.BusinessName != "" {
							name = contact.BusinessName
						} else if contact.PushName != "" && !isAllDigits(contact.PushName) {
							name = contact.PushName
						}
					}
				}
			}
		}

		// 3. Fallback to sender if non-numeric
		if name == "" && sender != "" && !isAllDigits(sender) {
			name = sender
		}

		// 4. Last fallback to JID User
		if name == "" {
			name = jid.User
		}

		logger.Infof("Using contact name: %s", name)
	}

	return name
}

// Handle history sync events
func handleHistorySync(client *whatsmeow.Client, messageStore *MessageStore, historySync *events.HistorySync, logger waLog.Logger) {
	fmt.Printf("Received history sync event with %d conversations\n", len(historySync.Data.Conversations))

	syncedCount := 0
	for _, conversation := range historySync.Data.Conversations {
		// Parse JID from the conversation
		if conversation.ID == nil {
			continue
		}

		chatJID := *conversation.ID

		// Try to parse the JID
		jid, err := types.ParseJID(chatJID)
		if err != nil {
			logger.Warnf("Failed to parse JID %s: %v", chatJID, err)
			continue
		}

		// Get appropriate chat name by passing the history sync conversation directly
		name := GetChatName(context.Background(), client, messageStore, jid, chatJID, conversation, "", logger)

		// Process messages
		messages := conversation.Messages
		if len(messages) > 0 {
			// Update chat with latest message timestamp
			latestMsg := messages[0]
			if latestMsg == nil || latestMsg.Message == nil {
				continue
			}

			// Get timestamp from message info
			timestamp := time.Time{}
			if ts := latestMsg.Message.GetMessageTimestamp(); ts != 0 {
				timestamp = time.Unix(int64(ts), 0)
			} else {
				continue
			}

			messageStore.StoreChat(chatJID, name, timestamp)

			// Store messages
			for _, msg := range messages {
				if msg == nil || msg.Message == nil {
					continue
				}

				// Extract text content
				var content string
				if msg.Message.Message != nil {
					if conv := msg.Message.Message.GetConversation(); conv != "" {
						content = conv
					} else if ext := msg.Message.Message.GetExtendedTextMessage(); ext != nil {
						content = ext.GetText()
					}
				}

				// Extract quoted (replied-to) message text
				repliedTo := ""
				if msg.Message.Message != nil {
					repliedTo = extractQuotedText(msg.Message.Message)
				}

				// Extract media info
				var mediaType, filename, url string
				var mediaKey, fileSHA256, fileEncSHA256 []byte
				var fileLength uint64

				if msg.Message.Message != nil {
					mediaType, filename, url, mediaKey, fileSHA256, fileEncSHA256, fileLength = extractMediaInfo(msg.Message.Message)
				}

				// Log the message content for debugging
				logger.Infof("Message content: %v, Media Type: %v", content, mediaType)

				// Skip messages with no content and no media
				if content == "" && mediaType == "" {
					continue
				}

				// Determine sender
				var sender string
				isFromMe := false
				if msg.Message.Key != nil {
					if msg.Message.Key.FromMe != nil {
						isFromMe = *msg.Message.Key.FromMe
					}
					if !isFromMe && msg.Message.Key.Participant != nil && *msg.Message.Key.Participant != "" {
						sender = *msg.Message.Key.Participant
					} else if isFromMe {
						sender = client.Store.ID.User
					} else {
						sender = jid.User
					}
				} else {
					sender = jid.User
				}

				// Store message
				msgID := ""
				if msg.Message.Key != nil && msg.Message.Key.ID != nil {
					msgID = *msg.Message.Key.ID
				}

				// Get message timestamp
				timestamp := time.Time{}
				if ts := msg.Message.GetMessageTimestamp(); ts != 0 {
					timestamp = time.Unix(int64(ts), 0)
				} else {
					continue
				}

				err = messageStore.StoreMessage(
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
				if err != nil {
					logger.Warnf("Failed to store history message: %v", err)
				} else {
					syncedCount++
					// Log successful message storage
					if mediaType != "" {
						logger.Infof("Stored message: [%s] %s -> %s: [%s: %s] %s",
							timestamp.Format("2006-01-02 15:04:05"), sender, chatJID, mediaType, filename, content)
					} else {
						logger.Infof("Stored message: [%s] %s -> %s: %s",
							timestamp.Format("2006-01-02 15:04:05"), sender, chatJID, content)
					}
				}
			}
		}
	}

	fmt.Printf("History sync complete. Stored %d messages.\n", syncedCount)
}
