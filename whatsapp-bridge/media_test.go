package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"go.mau.fi/whatsmeow"
	waProto "go.mau.fi/whatsmeow/binary/proto"
	"google.golang.org/protobuf/proto"
)

func TestExtractMediaInfo_AllTypes(t *testing.T) {
	// 1. nil message
	mType, fName, url, key, sha, encSha, lenVal := extractMediaInfo(nil)
	if mType != "" || fName != "" || url != "" || key != nil || sha != nil || encSha != nil || lenVal != 0 {
		t.Errorf("expected all empty/nil/zero for nil message")
	}

	// 2. Plain conversation
	mType, _, _, _, _, _, _ = extractMediaInfo(&waProto.Message{Conversation: proto.String("test")})
	if mType != "" {
		t.Errorf("expected empty for non-media message")
	}

	// 3. Image message
	imgMsg := &waProto.Message{
		ImageMessage: &waProto.ImageMessage{
			URL:           proto.String("https://example.com/img.jpg"),
			MediaKey:      []byte("img_key"),
			FileSHA256:    []byte("img_sha"),
			FileEncSHA256: []byte("img_enc"),
			FileLength:    proto.Uint64(1024),
		},
	}
	mType, fName, url, key, sha, encSha, lenVal = extractMediaInfo(imgMsg)
	if mType != "image" || !strings.HasPrefix(fName, "image_") || !strings.HasSuffix(fName, ".jpg") ||
		url != "https://example.com/img.jpg" || string(key) != "img_key" || string(sha) != "img_sha" ||
		string(encSha) != "img_enc" || lenVal != 1024 {
		t.Errorf("unexpected image info: type=%s, name=%s, url=%s, len=%d", mType, fName, url, lenVal)
	}

	// 4. Video message
	vidMsg := &waProto.Message{
		VideoMessage: &waProto.VideoMessage{
			URL:           proto.String("https://example.com/vid.mp4"),
			MediaKey:      []byte("vid_key"),
			FileSHA256:    []byte("vid_sha"),
			FileEncSHA256: []byte("vid_enc"),
			FileLength:    proto.Uint64(2048),
		},
	}
	mType, fName, url, key, sha, encSha, lenVal = extractMediaInfo(vidMsg)
	if mType != "video" || !strings.HasPrefix(fName, "video_") || !strings.HasSuffix(fName, ".mp4") ||
		url != "https://example.com/vid.mp4" || string(key) != "vid_key" || lenVal != 2048 {
		t.Errorf("unexpected video info: type=%s, name=%s, url=%s, len=%d", mType, fName, url, lenVal)
	}

	// 5. Audio message
	audMsg := &waProto.Message{
		AudioMessage: &waProto.AudioMessage{
			URL:           proto.String("https://example.com/aud.ogg"),
			MediaKey:      []byte("aud_key"),
			FileSHA256:    []byte("aud_sha"),
			FileEncSHA256: []byte("aud_enc"),
			FileLength:    proto.Uint64(512),
		},
	}
	mType, fName, url, key, sha, encSha, lenVal = extractMediaInfo(audMsg)
	if mType != "audio" || !strings.HasPrefix(fName, "audio_") || !strings.HasSuffix(fName, ".ogg") ||
		url != "https://example.com/aud.ogg" || string(key) != "aud_key" || lenVal != 512 {
		t.Errorf("unexpected audio info: type=%s, name=%s, url=%s, len=%d", mType, fName, url, lenVal)
	}

	// 6. Document message with FileName
	docMsgNamed := &waProto.Message{
		DocumentMessage: &waProto.DocumentMessage{
			FileName:      proto.String("invoice.pdf"),
			URL:           proto.String("https://example.com/inv.pdf"),
			MediaKey:      []byte("doc_key"),
			FileSHA256:    []byte("doc_sha"),
			FileEncSHA256: []byte("doc_enc"),
			FileLength:    proto.Uint64(4096),
		},
	}
	mType, fName, url, key, sha, encSha, lenVal = extractMediaInfo(docMsgNamed)
	if mType != "document" || fName != "invoice.pdf" || url != "https://example.com/inv.pdf" || lenVal != 4096 {
		t.Errorf("unexpected doc info: type=%s, name=%s, url=%s, len=%d", mType, fName, url, lenVal)
	}

	// 7. Document message without FileName
	docMsgUnnamed := &waProto.Message{
		DocumentMessage: &waProto.DocumentMessage{
			URL: proto.String("https://example.com/unnamed"),
		},
	}
	mType, fName, _, _, _, _, _ = extractMediaInfo(docMsgUnnamed)
	if mType != "document" || !strings.HasPrefix(fName, "document_") {
		t.Errorf("unexpected unnamed doc info: type=%s, name=%s", mType, fName)
	}
}

func TestMediaDownloader_Methods(t *testing.T) {
	dl := &MediaDownloader{
		URL:           "https://example.com/file",
		DirectPath:    "/v/t62/file.enc",
		MediaKey:      []byte("key123"),
		FileLength:    1024,
		FileSHA256:    []byte("sha123"),
		FileEncSHA256: []byte("encsha123"),
		MediaType:     whatsmeow.MediaImage,
	}

	if dl.GetURL() != "https://example.com/file" {
		t.Errorf("GetURL mismatch")
	}
	if dl.GetDirectPath() != "/v/t62/file.enc" {
		t.Errorf("GetDirectPath mismatch")
	}
	if string(dl.GetMediaKey()) != "key123" {
		t.Errorf("GetMediaKey mismatch")
	}
	if dl.GetFileLength() != 1024 {
		t.Errorf("GetFileLength mismatch")
	}
	if string(dl.GetFileSHA256()) != "sha123" {
		t.Errorf("GetFileSHA256 mismatch")
	}
	if string(dl.GetFileEncSHA256()) != "encsha123" {
		t.Errorf("GetFileEncSHA256 mismatch")
	}
	if dl.GetMediaType() != whatsmeow.MediaImage {
		t.Errorf("GetMediaType mismatch")
	}
}

func TestExtractDirectPathFromURL_Cases(t *testing.T) {
	cases := []struct {
		url      string
		expected string
	}{
		{
			"https://mmg.whatsapp.net/v/t62.7118-24/13812002_698058036224062_3424455886509161511_n.enc?ccb=11-4&oh=123",
			"/v/t62.7118-24/13812002_698058036224062_3424455886509161511_n.enc",
		},
		{
			"https://example.com/file.enc",
			"https://example.com/file.enc",
		},
		{
			"https://mmg.whatsapp.net/simple/path",
			"/simple/path",
		},
		{
			"https://other.domain.net/sub/path?param=1",
			"/sub/path",
		},
	}

	for _, c := range cases {
		got := extractDirectPathFromURL(c.url)
		if got != c.expected {
			t.Errorf("extractDirectPathFromURL(%q) = %q, want %q", c.url, got, c.expected)
		}
	}
}

func TestDownloadMedia_AllBranches(t *testing.T) {
	client, _, tmpDirClient := createTestClient(t)
	defer os.RemoveAll(tmpDirClient)

	store, tmpDirStore := createTestMessageStore(t)
	defer os.RemoveAll(tmpDirStore)
	defer store.Close()

	ctx := context.Background()
	chatJID := "testchat@s.whatsapp.net"
	_ = store.StoreChat(chatJID, "Test Chat", time.Now())

	// 1. Message not found
	ok, _, _, _, err := downloadMedia(ctx, client, store, "non_existent_msg", chatJID)
	if ok || err == nil || !strings.Contains(err.Error(), "failed to find message") {
		t.Errorf("expected failed to find message error, got ok=%v, err=%v", ok, err)
	}

	// 2. Message is not a media message (media_type is empty)
	_ = store.StoreMessage("text_msg", chatJID, "user", "plain text", "", time.Now(), false, "", "", "", nil, nil, nil, 0, "remote")
	ok, _, _, _, err = downloadMedia(ctx, client, store, "text_msg", chatJID)
	if ok || err == nil || !strings.Contains(err.Error(), "not a media message") {
		t.Errorf("expected not a media message error, got ok=%v, err=%v", ok, err)
	}

	// 3. File already exists locally on disk
	chatDir := filepath.Join("store", strings.ReplaceAll(chatJID, ":", "_"))
	_ = os.MkdirAll(chatDir, 0755)
	defer os.RemoveAll("store")

	localFilePath := filepath.Join(chatDir, "existing.jpg")
	_ = os.WriteFile(localFilePath, []byte("fake image data"), 0644)
	_ = store.StoreMessage("existing_img_msg", chatJID, "user", "", "", time.Now(), false, "image", "existing.jpg", "https://example.com/existing.jpg", []byte("key"), []byte("sha"), []byte("enc"), 100, "remote")

	ok, mType, fname, absPath, err := downloadMedia(ctx, client, store, "existing_img_msg", chatJID)
	if !ok || err != nil || mType != "image" || fname != "existing.jpg" || absPath == "" {
		t.Errorf("expected existing file return, got ok=%v, err=%v, path=%s", ok, err, absPath)
	}

	// 4. Incomplete media info in DB (e.g. missing mediaKey or url)
	_ = store.StoreMessage("incomplete_msg", chatJID, "user", "", "", time.Now(), false, "image", "incomplete.jpg", "", nil, nil, nil, 0, "remote")
	ok, _, _, _, err = downloadMedia(ctx, client, store, "incomplete_msg", chatJID)
	if ok || err == nil || !strings.Contains(err.Error(), "incomplete media information") {
		t.Errorf("expected incomplete media information error, got ok=%v, err=%v", ok, err)
	}

	// 5. Unsupported media type
	_ = store.StoreMessage("unsupported_msg", chatJID, "user", "", "", time.Now(), false, "unsupported_type", "file.xyz", "https://example.com/file.xyz", []byte("k"), []byte("s"), []byte("e"), 100, "remote")
	ok, _, _, _, err = downloadMedia(ctx, client, store, "unsupported_msg", chatJID)
	if ok || err == nil || !strings.Contains(err.Error(), "unsupported media type") {
		t.Errorf("expected unsupported media type error, got ok=%v, err=%v", ok, err)
	}

	// 6. Supported media types that attempt download with disconnected client (fail download)
	typesToTest := []struct {
		mType string
		fname string
	}{
		{"image", "new_img.jpg"},
		{"video", "new_vid.mp4"},
		{"audio", "new_aud.ogg"},
		{"document", "new_doc.pdf"},
	}

	for _, tt := range typesToTest {
		msgID := "download_fail_" + tt.mType
		_ = store.StoreMessage(msgID, chatJID, "user", "", "", time.Now(), false, tt.mType, tt.fname, "https://mmg.whatsapp.net/v/t62/"+tt.fname, []byte("key123"), []byte("sha123"), []byte("enc123"), 500, "remote")
		ok, _, _, _, err := downloadMedia(ctx, client, store, msgID, chatJID)
		if ok || err == nil || !strings.Contains(err.Error(), "failed to download media") {
			t.Errorf("expected download failure for %s, got ok=%v, err=%v", tt.mType, ok, err)
		}
	}
}
