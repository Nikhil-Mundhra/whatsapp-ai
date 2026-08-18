package main

import (
	"context"
	"os"
	"testing"
	"time"

	waProto "go.mau.fi/whatsmeow/binary/proto"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"
)

func TestExtractTextContent_AllTypes(t *testing.T) {
	if got := extractTextContent(nil); got != "" {
		t.Errorf("expected empty string for nil, got %q", got)
	}

	// Conversation
	msgConv := &waProto.Message{Conversation: proto.String("hello")}
	if got := extractTextContent(msgConv); got != "hello" {
		t.Errorf("expected 'hello', got %q", got)
	}

	// ExtendedTextMessage
	msgExt := &waProto.Message{ExtendedTextMessage: &waProto.ExtendedTextMessage{Text: proto.String("extended")}}
	if got := extractTextContent(msgExt); got != "extended" {
		t.Errorf("expected 'extended', got %q", got)
	}

	// ImageMessage
	msgImg := &waProto.Message{ImageMessage: &waProto.ImageMessage{Caption: proto.String("image caption")}}
	if got := extractTextContent(msgImg); got != "image caption" {
		t.Errorf("expected 'image caption', got %q", got)
	}

	// VideoMessage
	msgVid := &waProto.Message{VideoMessage: &waProto.VideoMessage{Caption: proto.String("video caption")}}
	if got := extractTextContent(msgVid); got != "video caption" {
		t.Errorf("expected 'video caption', got %q", got)
	}

	// DocumentMessage
	msgDoc := &waProto.Message{DocumentMessage: &waProto.DocumentMessage{Caption: proto.String("doc caption")}}
	if got := extractTextContent(msgDoc); got != "doc caption" {
		t.Errorf("expected 'doc caption', got %q", got)
	}

	// AudioMessage (no text)
	msgAud := &waProto.Message{AudioMessage: &waProto.AudioMessage{}}
	if got := extractTextContent(msgAud); got != "" {
		t.Errorf("expected empty string for audio, got %q", got)
	}
}

func TestGetContextInfo_AllTypes(t *testing.T) {
	if got := getContextInfo(nil); got != nil {
		t.Errorf("expected nil for nil message, got %v", got)
	}

	ci := &waProto.ContextInfo{StanzaID: proto.String("test-stanza")}

	// ExtendedTextMessage
	if got := getContextInfo(&waProto.Message{ExtendedTextMessage: &waProto.ExtendedTextMessage{ContextInfo: ci}}); got != ci {
		t.Errorf("expected ci, got %v", got)
	}

	// ImageMessage
	if got := getContextInfo(&waProto.Message{ImageMessage: &waProto.ImageMessage{ContextInfo: ci}}); got != ci {
		t.Errorf("expected ci, got %v", got)
	}

	// VideoMessage
	if got := getContextInfo(&waProto.Message{VideoMessage: &waProto.VideoMessage{ContextInfo: ci}}); got != ci {
		t.Errorf("expected ci, got %v", got)
	}

	// AudioMessage
	if got := getContextInfo(&waProto.Message{AudioMessage: &waProto.AudioMessage{ContextInfo: ci}}); got != ci {
		t.Errorf("expected ci, got %v", got)
	}

	// DocumentMessage
	if got := getContextInfo(&waProto.Message{DocumentMessage: &waProto.DocumentMessage{ContextInfo: ci}}); got != ci {
		t.Errorf("expected ci, got %v", got)
	}

	// Message with no ContextInfo
	if got := getContextInfo(&waProto.Message{Conversation: proto.String("plain")}); got != nil {
		t.Errorf("expected nil for plain message, got %v", got)
	}
}

func TestExtractQuotedText_Cases(t *testing.T) {
	if got := extractQuotedText(nil); got != "" {
		t.Errorf("expected empty for nil, got %q", got)
	}

	// Msg without context info
	if got := extractQuotedText(&waProto.Message{Conversation: proto.String("msg")}); got != "" {
		t.Errorf("expected empty for message without ContextInfo, got %q", got)
	}

	// Msg with ContextInfo but nil QuotedMessage
	ciEmpty := &waProto.ContextInfo{}
	if got := extractQuotedText(&waProto.Message{ExtendedTextMessage: &waProto.ExtendedTextMessage{ContextInfo: ciEmpty}}); got != "" {
		t.Errorf("expected empty for nil QuotedMessage, got %q", got)
	}

	// Msg with QuotedMessage
	ciWithQuote := &waProto.ContextInfo{
		QuotedMessage: &waProto.Message{Conversation: proto.String("quoted conversation")},
	}
	msg := &waProto.Message{ExtendedTextMessage: &waProto.ExtendedTextMessage{ContextInfo: ciWithQuote}}
	if got := extractQuotedText(msg); got != "quoted conversation" {
		t.Errorf("expected 'quoted conversation', got %q", got)
	}
}

func TestIsAllDigits_Comprehensive(t *testing.T) {
	cases := []struct {
		input    string
		expected bool
	}{
		{"", true},
		{"   ", true},
		{"1234567890", true},
		{"+1 555-1234", true},
		{"+44 (0) 20 7946 0958", false}, // parentheses are not digits
		{"123a456", false},
		{"Alice", false},
		{"@alice", false},
	}

	for _, c := range cases {
		got := isAllDigits(c.input)
		if got != c.expected {
			t.Errorf("isAllDigits(%q) = %v, want %v", c.input, got, c.expected)
		}
	}
}

func TestGetChatName_AllBranches(t *testing.T) {
	client, dev, tmpDirClient := createTestClient(t)
	defer os.RemoveAll(tmpDirClient)

	store, tmpDirStore := createTestMessageStore(t)
	defer os.RemoveAll(tmpDirStore)
	defer store.Close()

	ctx := context.Background()

	// 1. Existing chat with non-numeric name in store
	_ = store.StoreChat("existing@s.whatsapp.net", "Alice Wonderland", time.Now())
	name := GetChatName(ctx, client, store, types.NewJID("existing", "s.whatsapp.net"), "existing@s.whatsapp.net", nil, "", waLog.Noop)
	if name != "Alice Wonderland" {
		t.Errorf("expected 'Alice Wonderland', got %q", name)
	}

	// 2. Existing chat with all-digits name (should fall through to other resolvers)
	_ = store.StoreChat("numeric@s.whatsapp.net", "1234567890", time.Now())
	name = GetChatName(ctx, client, store, types.NewJID("numeric", "s.whatsapp.net"), "numeric@s.whatsapp.net", nil, "SenderNick", waLog.Noop)
	if name != "SenderNick" {
		t.Errorf("expected 'SenderNick' after skipping numeric DB name, got %q", name)
	}

	// 3. Group chat with DisplayName reflection
	groupJID := types.NewJID("12345-67890", "g.us")
	type MockConvDisplay struct {
		DisplayName *string
	}
	dName := "My Awesome Group"
	name = GetChatName(ctx, client, store, groupJID, groupJID.String(), &MockConvDisplay{DisplayName: &dName}, "", waLog.Noop)
	if name != "My Awesome Group" {
		t.Errorf("expected 'My Awesome Group', got %q", name)
	}

	// 4. Group chat with Name reflection (when DisplayName is nil)
	type MockConvName struct {
		Name *string
	}
	gName := "Project Discussion"
	name = GetChatName(ctx, client, store, groupJID, groupJID.String(), &MockConvName{Name: &gName}, "", waLog.Noop)
	if name != "Project Discussion" {
		t.Errorf("expected 'Project Discussion', got %q", name)
	}

	// 5. Group chat with empty conversation (falls back to client.GetGroupInfo -> fails -> "Group <User>")
	name = GetChatName(ctx, client, store, groupJID, groupJID.String(), nil, "", waLog.Noop)
	if name != "Group 12345-67890" {
		t.Errorf("expected 'Group 12345-67890', got %q", name)
	}

	// 6. Contact chat with FullName in mock ContactStore
	cStore := dev.Contacts.(*mockContactStore)
	contact1JID := types.NewJID("111222333", "s.whatsapp.net")
	cStore.contacts[contact1JID] = types.ContactInfo{FullName: "Bob Builder"}
	name = GetChatName(ctx, client, store, contact1JID, contact1JID.String(), nil, "", waLog.Noop)
	if name != "Bob Builder" {
		t.Errorf("expected 'Bob Builder', got %q", name)
	}

	// 7. Contact chat with BusinessName in mock ContactStore
	contact2JID := types.NewJID("444555666", "s.whatsapp.net")
	cStore.contacts[contact2JID] = types.ContactInfo{BusinessName: "Acme Corp"}
	name = GetChatName(ctx, client, store, contact2JID, contact2JID.String(), nil, "", waLog.Noop)
	if name != "Acme Corp" {
		t.Errorf("expected 'Acme Corp', got %q", name)
	}

	// 8. Contact chat with non-numeric PushName in mock ContactStore
	contact3JID := types.NewJID("777888999", "s.whatsapp.net")
	cStore.contacts[contact3JID] = types.ContactInfo{PushName: "CharliePush"}
	name = GetChatName(ctx, client, store, contact3JID, contact3JID.String(), nil, "", waLog.Noop)
	if name != "CharliePush" {
		t.Errorf("expected 'CharliePush', got %q", name)
	}

	// 9. Contact chat with all-numeric PushName in mock ContactStore (should skip and fall back)
	contact4JID := types.NewJID("888000111", "s.whatsapp.net")
	cStore.contacts[contact4JID] = types.ContactInfo{PushName: "1888000111"}
	name = GetChatName(ctx, client, store, contact4JID, contact4JID.String(), nil, "FallbackSender", waLog.Noop)
	if name != "FallbackSender" {
		t.Errorf("expected 'FallbackSender', got %q", name)
	}

	// 10. LID JID looking up PN in LIDStore and finding Contact FullName
	lidStore := dev.LIDs.(*mockLIDStore)
	lid1JID := types.NewJID("999000111", "lid")
	pn1JID := types.NewJID("1999000111", "s.whatsapp.net")
	lidStore.lidToPN[lid1JID] = pn1JID
	cStore.contacts[pn1JID] = types.ContactInfo{FullName: "Dave LID Full"}
	name = GetChatName(ctx, client, store, lid1JID, lid1JID.String(), nil, "", waLog.Noop)
	if name != "Dave LID Full" {
		t.Errorf("expected 'Dave LID Full', got %q", name)
	}

	// 11. LID JID looking up PN and finding BusinessName
	lid2JID := types.NewJID("999000222", "lid")
	pn2JID := types.NewJID("1999000222", "s.whatsapp.net")
	lidStore.lidToPN[lid2JID] = pn2JID
	cStore.contacts[pn2JID] = types.ContactInfo{BusinessName: "Dave Biz"}
	name = GetChatName(ctx, client, store, lid2JID, lid2JID.String(), nil, "", waLog.Noop)
	if name != "Dave Biz" {
		t.Errorf("expected 'Dave Biz', got %q", name)
	}

	// 12. LID JID looking up PN and finding PushName
	lid3JID := types.NewJID("999000333", "lid")
	pn3JID := types.NewJID("1999000333", "s.whatsapp.net")
	lidStore.lidToPN[lid3JID] = pn3JID
	cStore.contacts[pn3JID] = types.ContactInfo{PushName: "Dave Push"}
	name = GetChatName(ctx, client, store, lid3JID, lid3JID.String(), nil, "", waLog.Noop)
	if name != "Dave Push" {
		t.Errorf("expected 'Dave Push', got %q", name)
	}

	// 13. Fallback to non-numeric sender
	unknownJID := types.NewJID("555000555", "s.whatsapp.net")
	name = GetChatName(ctx, client, store, unknownJID, unknownJID.String(), nil, "EveOnline", waLog.Noop)
	if name != "EveOnline" {
		t.Errorf("expected 'EveOnline', got %q", name)
	}

	// 14. Fallback to JID User when sender is numeric
	name = GetChatName(ctx, client, store, unknownJID, unknownJID.String(), nil, "+1 555 000 555", waLog.Noop)
	if name != "555000555" {
		t.Errorf("expected '555000555', got %q", name)
	}
}

func TestHandlePollVote(t *testing.T) {
	store, tmpDirStore := createTestMessageStore(t)
	defer os.RemoveAll(tmpDirStore)
	defer store.Close()

	// 1. Message without PollUpdateMessage should return immediately
	msgNoPoll := &events.Message{
		Info: types.MessageInfo{
			ID: "msg1",
		},
		Message: &waProto.Message{
			Conversation: proto.String("hello"),
		},
	}
	handlePollVote(nil, store, msgNoPoll, waLog.Noop)

	// 2. Message with PollUpdateMessage but nil client -> will fail DecryptPollVote safely
	msgPoll := &events.Message{
		Info: types.MessageInfo{
			ID:        "poll1",
			Timestamp: time.Now(),
		},
		Message: &waProto.Message{
			PollUpdateMessage: &waProto.PollUpdateMessage{
				PollCreationMessageKey: &waProto.MessageKey{
					ID: proto.String("creation_msg_id"),
				},
			},
		},
	}
	handlePollVote(nil, store, msgPoll, waLog.Noop)
}

func TestHandleMessage_Variants(t *testing.T) {
	client, _, tmpDirClient := createTestClient(t)
	defer os.RemoveAll(tmpDirClient)

	store, tmpDirStore := createTestMessageStore(t)
	defer os.RemoveAll(tmpDirStore)
	defer store.Close()

	// 1. Skip if no content and no media
	msgEmpty := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Chat:   types.NewJID("chat1", "s.whatsapp.net"),
				Sender: types.NewJID("user1", "s.whatsapp.net"),
			},
			ID:        "empty1",
			Timestamp: time.Now(),
		},
		Message: &waProto.Message{},
	}
	handleMessage(client, store, msgEmpty, waLog.Noop)

	// 2. Incoming text message from remote
	msgText := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Chat:     types.NewJID("chat1", "s.whatsapp.net"),
				Sender:   types.NewJID("user1", "s.whatsapp.net"),
				IsFromMe: false,
			},
			ID:        "msg_text_1",
			Timestamp: time.Now(),
		},
		Message: &waProto.Message{
			Conversation: proto.String("Hello there!"),
		},
	}
	handleMessage(client, store, msgText, waLog.Noop)

	msgs, err := store.GetMessages("chat1@s.whatsapp.net", 10)
	if err != nil || len(msgs) != 1 {
		t.Fatalf("expected 1 message stored, got %d (err=%v)", len(msgs), err)
	}
	if msgs[0].Content != "Hello there!" {
		t.Errorf("expected 'Hello there!', got %q", msgs[0].Content)
	}

	// 3. Outbound message (IsFromMe = true)
	msgOut := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Chat:     types.NewJID("chat1", "s.whatsapp.net"),
				Sender:   types.NewJID("owner", "s.whatsapp.net"),
				IsFromMe: true,
			},
			ID:        "msg_out_1",
			Timestamp: time.Now().Add(-5 * time.Minute), // older than 2 min
		},
		Message: &waProto.Message{
			ExtendedTextMessage: &waProto.ExtendedTextMessage{
				Text: proto.String("Outbound reply"),
			},
		},
	}
	handleMessage(client, store, msgOut, waLog.Noop)

	// 4. Outbound message that already exists with origin = "api"
	_ = store.StoreMessage("api_msg_1", "chat1@s.whatsapp.net", "owner", "pre-existing api msg", "", time.Now(), true, "", "", "", nil, nil, nil, 0, "api")
	msgApiEcho := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Chat:     types.NewJID("chat1", "s.whatsapp.net"),
				Sender:   types.NewJID("owner", "s.whatsapp.net"),
				IsFromMe: true,
			},
			ID:        "api_msg_1",
			Timestamp: time.Now(),
		},
		Message: &waProto.Message{
			Conversation: proto.String("pre-existing api msg"),
		},
	}
	handleMessage(client, store, msgApiEcho, waLog.Noop)

	// 5. Incoming media message (image)
	msgImg := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Chat:     types.NewJID("chat1", "s.whatsapp.net"),
				Sender:   types.NewJID("user1", "s.whatsapp.net"),
				IsFromMe: false,
			},
			ID:        "msg_img_1",
			Timestamp: time.Now(),
		},
		Message: &waProto.Message{
			ImageMessage: &waProto.ImageMessage{
				Caption:       proto.String("Check this picture"),
				URL:           proto.String("https://example.com/img.jpg"),
				FileLength:    proto.Uint64(4096),
				FileSHA256:    []byte("sha256"),
				FileEncSHA256: []byte("encsha256"),
				MediaKey:      []byte("mediakey"),
			},
		},
	}
	handleMessage(client, store, msgImg, waLog.Noop)
}

func TestHandleHistorySync_Cases(t *testing.T) {
	client, _, tmpDirClient := createTestClient(t)
	defer os.RemoveAll(tmpDirClient)

	store, tmpDirStore := createTestMessageStore(t)
	defer os.RemoveAll(tmpDirStore)
	defer store.Close()

	// 1. HistorySync with empty / invalid conversations
	invalidJID := "invalid-jid"
	hsEmpty := &events.HistorySync{
		Data: &waProto.HistorySync{
			Conversations: []*waProto.Conversation{
				{}, // nil ID
				{ID: &invalidJID},
			},
		},
	}
	handleHistorySync(client, store, hsEmpty, waLog.Noop)

	// 2. Valid conversation with various messages
	chatJID := "987654321@s.whatsapp.net"
	partJID := "participant_user"
	msgID1 := "hist_msg_1"
	msgID2 := "hist_msg_2"
	msgID3 := "hist_msg_3"
	ts := uint64(time.Now().Unix())
	isFromMeTrue := true
	isFromMeFalse := false

	hsValid := &events.HistorySync{
		Data: &waProto.HistorySync{
			Conversations: []*waProto.Conversation{
				{
					ID: &chatJID,
					Messages: []*waProto.HistorySyncMsg{
						{
							Message: &waProto.WebMessageInfo{
								MessageTimestamp: proto.Uint64(ts),
								Key: &waProto.MessageKey{
									ID:          &msgID1,
									FromMe:      &isFromMeFalse,
									Participant: &partJID,
								},
								Message: &waProto.Message{
									Conversation: proto.String("History conversation text"),
								},
							},
						},
						nil, // nil msg skipped in inner loop
						{
							Message: &waProto.WebMessageInfo{
								MessageTimestamp: proto.Uint64(ts),
								Key: &waProto.MessageKey{
									ID:     &msgID2,
									FromMe: &isFromMeTrue,
								},
								Message: &waProto.Message{
									ExtendedTextMessage: &waProto.ExtendedTextMessage{
										Text: proto.String("History extended text"),
									},
								},
							},
						},
						{
							Message: &waProto.WebMessageInfo{
								MessageTimestamp: proto.Uint64(ts),
								Key: &waProto.MessageKey{
									ID: &msgID3,
								},
								Message: &waProto.Message{
									ImageMessage: &waProto.ImageMessage{
										Caption: proto.String("History image caption"),
									},
								},
							},
						},
						{
							// Message without timestamp or content -> skipped
							Message: &waProto.WebMessageInfo{
								MessageTimestamp: proto.Uint64(0),
								Message:          &waProto.Message{},
							},
						},
					},
				},
			},
		},
	}

	handleHistorySync(client, store, hsValid, waLog.Noop)

	msgs, err := store.GetMessages(chatJID, 10)
	if err != nil {
		t.Fatalf("failed to get messages: %v", err)
	}
	if len(msgs) != 3 {
		t.Errorf("expected 3 history messages stored, got %d", len(msgs))
	}
}
