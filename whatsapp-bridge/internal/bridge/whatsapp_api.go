package bridge

import (
	"bytes"
	"context"
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"go.mau.fi/whatsmeow"
	waProto "go.mau.fi/whatsmeow/binary/proto"
	"go.mau.fi/whatsmeow/types"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"
)

// pollOptionsMu guards pollOptionsByID.
var (
	pollOptionsMu     sync.Mutex
	pollOptionsByID   = make(map[string][]string)
	pollQuestionsByID = make(map[string]string)
)

// registerPollOptions stores the options for a sent poll so incoming votes can be mapped back to option names.
func registerPollOptions(msgID string, question string, options []string) {
	pollOptionsMu.Lock()
	defer pollOptionsMu.Unlock()
	pollOptionsByID[msgID] = options
	pollQuestionsByID[msgID] = question
}

// resolvePollOptions maps selected option hashes back to the option names for a given poll message ID.
func resolvePollOptions(msgID string, selectedHashes [][]byte) (string, []string) {
	pollOptionsMu.Lock()
	question := pollQuestionsByID[msgID]
	options := pollOptionsByID[msgID]
	pollOptionsMu.Unlock()
	if len(options) == 0 {
		return question, nil
	}
	var selected []string
	for _, hash := range selectedHashes {
		for _, opt := range options {
			optHash := sha256.Sum256([]byte(opt))
			if bytes.Equal(optHash[:], hash) {
				selected = append(selected, opt)
			}
		}
	}
	return question, selected
}

var (
	activePollMu            sync.Mutex
	activePollIDByRecipient = make(map[string]string)
)

func cleanPhoneDigits(p string) string {
	p = strings.TrimPrefix(p, "+")
	var b strings.Builder
	for _, r := range p {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// deleteWhatsAppMessage revokes/deletes a message previously sent by the client.
func deleteWhatsAppMessage(client *whatsmeow.Client, recipient, msgID string) error {
	if client == nil || !client.IsConnected() || msgID == "" {
		return nil
	}
	var recipientJID types.JID
	var err error
	if strings.Contains(recipient, "@") {
		recipientJID, err = types.ParseJID(recipient)
		if err != nil {
			return err
		}
	} else {
		clean := cleanPhoneDigits(recipient)
		if clean == "" {
			return fmt.Errorf("invalid recipient phone: %s", recipient)
		}
		recipientJID = types.JID{User: clean, Server: "s.whatsapp.net"}
	}

	revokeMsg := client.BuildRevoke(recipientJID, types.EmptyJID, types.MessageID(msgID))
	_, err = client.SendMessage(context.Background(), recipientJID, revokeMsg)
	return err
}

// sendWhatsAppPoll sends a real interactive WhatsApp poll to a recipient.
func sendWhatsAppPoll(client *whatsmeow.Client, recipient, question string, options []string, selectableCount int) (bool, string, string) {
	if !client.IsConnected() {
		return false, "Not connected to WhatsApp", ""
	}
	if recipient == "" {
		return false, "Recipient is required", ""
	}
	if question == "" {
		return false, "Question is required", ""
	}
	if len(options) < 2 || len(options) > 12 {
		return false, "Poll needs between 2 and 12 options", ""
	}

	var recipientJID types.JID
	var err error
	if strings.Contains(recipient, "@") {
		recipientJID, err = types.ParseJID(recipient)
		if err != nil {
			return false, fmt.Sprintf("Error parsing JID: %v", err), ""
		}
	} else {
		clean := cleanPhoneDigits(recipient)
		if clean == "" {
			return false, "Invalid recipient phone number", ""
		}
		recipientJID = types.JID{User: clean, Server: "s.whatsapp.net"}
	}

	pollMsg := client.BuildPollCreation(question, options, selectableCount)
	resp, err := client.SendMessage(context.Background(), recipientJID, pollMsg)
	if err != nil {
		return false, fmt.Sprintf("Error sending poll: %v", err), ""
	}
	newID := string(resp.ID)
	registerPollOptions(newID, question, options)

	return true, fmt.Sprintf("Poll sent to %s", recipient), newID
}

// sendWhatsAppMessage sends a regular text or media WhatsApp message
func sendWhatsAppMessage(client *whatsmeow.Client, messageStore *MessageStore, recipient string, message string, mediaPath string, logger waLog.Logger) (bool, string, string) {
	if !client.IsConnected() {
		return false, "Not connected to WhatsApp", ""
	}

	// Create JID for recipient
	var recipientJID types.JID
	var err error

	// Check if recipient is a JID
	isJID := strings.Contains(recipient, "@")

	if isJID {
		// Parse the JID string
		recipientJID, err = types.ParseJID(recipient)
		if err != nil {
			return false, fmt.Sprintf("Error parsing JID: %v", err), ""
		}
	} else {
		// Create JID from phone number (stripping +, spaces, dashes)
		clean := cleanPhoneDigits(recipient)
		if clean == "" {
			return false, fmt.Sprintf("Invalid recipient phone number: %s", recipient), ""
		}
		recipientJID = types.JID{
			User:   clean,
			Server: "s.whatsapp.net", // For personal chats
		}
	}

	msg := &waProto.Message{}

	// Check if we have media to send
	if mediaPath != "" {
		// Read media file
		mediaData, err := os.ReadFile(mediaPath)
		if err != nil {
			return false, fmt.Sprintf("Error reading media file: %v", err), ""
		}

		// Determine media type and mime type based on file extension
		fileExt := strings.ToLower(mediaPath[strings.LastIndex(mediaPath, ".")+1:])
		var mediaType whatsmeow.MediaType
		var mimeType string

		// Handle different media types
		switch fileExt {
		// Image types
		case "jpg", "jpeg":
			mediaType = whatsmeow.MediaImage
			mimeType = "image/jpeg"
		case "png":
			mediaType = whatsmeow.MediaImage
			mimeType = "image/png"
		case "gif":
			mediaType = whatsmeow.MediaImage
			mimeType = "image/gif"
		case "webp":
			mediaType = whatsmeow.MediaImage
			mimeType = "image/webp"

		// Audio types
		case "ogg":
			mediaType = whatsmeow.MediaAudio
			mimeType = "audio/ogg; codecs=opus"

		// Video types
		case "mp4":
			mediaType = whatsmeow.MediaVideo
			mimeType = "video/mp4"
		case "avi":
			mediaType = whatsmeow.MediaVideo
			mimeType = "video/avi"
		case "mov":
			mediaType = whatsmeow.MediaVideo
			mimeType = "video/quicktime"

		// Document types (for any other file type)
		default:
			mediaType = whatsmeow.MediaDocument
			mimeType = "application/octet-stream"
		}

		// Upload media to WhatsApp servers
		resp, err := client.Upload(context.Background(), mediaData, mediaType)
		if err != nil {
			return false, fmt.Sprintf("Error uploading media: %v", err), ""
		}

		fmt.Println("Media uploaded", resp)

		// Create the appropriate message type based on media type
		switch mediaType {
		case whatsmeow.MediaImage:
			msg.ImageMessage = &waProto.ImageMessage{
				Caption:       proto.String(message),
				Mimetype:      proto.String(mimeType),
				URL:           &resp.URL,
				DirectPath:    &resp.DirectPath,
				MediaKey:      resp.MediaKey,
				FileEncSHA256: resp.FileEncSHA256,
				FileSHA256:    resp.FileSHA256,
				FileLength:    &resp.FileLength,
			}
		case whatsmeow.MediaAudio:
			// Handle ogg audio files
			var seconds uint32 = 30 // Default fallback
			var waveform []byte = nil

			// Try to analyze the ogg file
			if strings.Contains(mimeType, "ogg") {
				analyzedSeconds, analyzedWaveform, err := analyzeOggOpus(mediaData)
				if err == nil {
					seconds = analyzedSeconds
					waveform = analyzedWaveform
				} else {
					return false, fmt.Sprintf("Failed to analyze Ogg Opus file: %v", err), ""
				}
			} else {
				fmt.Printf("Not an Ogg Opus file: %s\n", mimeType)
			}

			msg.AudioMessage = &waProto.AudioMessage{
				Mimetype:      proto.String(mimeType),
				URL:           &resp.URL,
				DirectPath:    &resp.DirectPath,
				MediaKey:      resp.MediaKey,
				FileEncSHA256: resp.FileEncSHA256,
				FileSHA256:    resp.FileSHA256,
				FileLength:    &resp.FileLength,
				Seconds:       proto.Uint32(seconds),
				PTT:           proto.Bool(true),
				Waveform:      waveform,
			}
		case whatsmeow.MediaVideo:
			msg.VideoMessage = &waProto.VideoMessage{
				Caption:       proto.String(message),
				Mimetype:      proto.String(mimeType),
				URL:           &resp.URL,
				DirectPath:    &resp.DirectPath,
				MediaKey:      resp.MediaKey,
				FileEncSHA256: resp.FileEncSHA256,
				FileSHA256:    resp.FileSHA256,
				FileLength:    &resp.FileLength,
			}
		case whatsmeow.MediaDocument:
			msg.DocumentMessage = &waProto.DocumentMessage{
				Title:         proto.String(filepath.Base(mediaPath)),
				Caption:       proto.String(message),
				Mimetype:      proto.String(mimeType),
				URL:           &resp.URL,
				DirectPath:    &resp.DirectPath,
				MediaKey:      resp.MediaKey,
				FileEncSHA256: resp.FileEncSHA256,
				FileSHA256:    resp.FileSHA256,
				FileLength:    &resp.FileLength,
			}
		}
	} else {
		msg.Conversation = proto.String(message)
	}

	// Send message
	respID, err := client.SendMessage(context.Background(), recipientJID, msg)

	if err != nil {
		return false, fmt.Sprintf("Error sending message: %v", err), ""
	}

	// Persist the outbound message so the sender can see its own texts.
	// Received messages are stored via the events.Message handler, but
	// whatsmeow only emits events.SentMessage for messages we send.
	// Store under the recipient's LID JID to match where the chat history lives.
	chatJID := recipientJID.String()
	if client.Store != nil {
		if lid, err := client.Store.LIDs.GetLIDForPN(context.Background(), recipientJID); err == nil && !lid.IsEmpty() {
			chatJID = lid.String()
		}
	}
	now := time.Now()
	sender := ""
	if client.Store.ID != nil {
		sender = client.Store.ID.User
	}
	name := GetChatName(context.Background(), client, messageStore, recipientJID, chatJID, nil, sender, logger)
	err = messageStore.StoreChat(chatJID, name, now)
	if err != nil {
		logger.Warnf("Failed to store chat for outbound message: %v", err)
	}
	mediaType, filename, url, mediaKey, fileSHA256, fileEncSHA256, fileLength := extractMediaInfo(msg)
	err = messageStore.StoreMessage(
		respID.ID,
		chatJID,
		sender,
		message,
		"",
		now,
		true,
		mediaType,
		filename,
		url,
		mediaKey,
		fileSHA256,
		fileEncSHA256,
		fileLength,
		"api",
	)
	if err != nil {
		logger.Warnf("Failed to store outbound message: %v", err)
	} else if message != "" {
		fmt.Printf("[%s] → %s: %s\n", now.Format("2006-01-02 15:04:05"), sender, message)
	}

	return true, fmt.Sprintf("Message sent to %s", recipient), string(respID.ID)
}

// Request history sync from the server
func requestHistorySync(client *whatsmeow.Client) {
	if client == nil {
		fmt.Println("Client is not initialized. Cannot request history sync.")
		return
	}

	if !client.IsConnected() {
		fmt.Println("Client is not connected. Please ensure you are connected to WhatsApp first.")
		return
	}

	if client.Store.ID == nil {
		fmt.Println("Client is not logged in. Please scan the QR code first.")
		return
	}

	// Build and send a history sync request
	historyMsg := client.BuildHistorySyncRequest(nil, 100)
	if historyMsg == nil {
		fmt.Println("Failed to build history sync request.")
		return
	}

	_, err := client.SendMessage(context.Background(), types.JID{
		Server: "s.whatsapp.net",
		User:   "status",
	}, historyMsg)

	if err != nil {
		fmt.Printf("Failed to request history sync: %v\n", err)
	} else {
		fmt.Println("History sync requested. Waiting for server response...")
	}
}
