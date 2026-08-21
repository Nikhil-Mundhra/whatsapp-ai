package bridge

import (
	"bytes"
	"encoding/binary"
	"testing"
)

func buildSyntheticOggOpus(sampleRate uint32, preSkip uint16, lastGranule uint64) []byte {
	var buf bytes.Buffer

	// Page 0: OpusHead
	// Header: 27 bytes
	p0Header := make([]byte, 27)
	copy(p0Header[0:4], "OggS")
	p0Header[4] = 0                                      // version
	p0Header[5] = 2                                      // BOS
	binary.LittleEndian.PutUint64(p0Header[6:14], 0)     // granule 0
	binary.LittleEndian.PutUint32(p0Header[14:18], 1001) // serial
	binary.LittleEndian.PutUint32(p0Header[18:22], 0)    // page seq 0
	p0Header[26] = 1                                     // 1 segment

	// Page 0 payload: OpusHead (28 bytes)
	p0Payload := make([]byte, 28)
	copy(p0Payload[0:8], "OpusHead")
	p0Payload[8] = 1 // Version 1
	p0Payload[9] = 2 // Channels 2
	// PreSkip at offset 18 (headPos+10 after headPos+=8)
	binary.LittleEndian.PutUint16(p0Payload[18:20], preSkip)
	// SampleRate at offset 20 (headPos+12 after headPos+=8)
	binary.LittleEndian.PutUint32(p0Payload[20:24], sampleRate)

	p0SegTable := []byte{byte(len(p0Payload))}

	buf.Write(p0Header)
	buf.Write(p0SegTable)
	buf.Write(p0Payload)

	// Page 1: Audio Data with Granule
	p1Header := make([]byte, 27)
	copy(p1Header[0:4], "OggS")
	p1Header[4] = 0
	p1Header[5] = 0
	binary.LittleEndian.PutUint64(p1Header[6:14], lastGranule)
	binary.LittleEndian.PutUint32(p1Header[14:18], 1001)
	binary.LittleEndian.PutUint32(p1Header[18:22], 1) // page seq 1
	p1Header[26] = 1

	p1Payload := []byte("dummy opus audio packet")
	p1SegTable := []byte{byte(len(p1Payload))}

	buf.Write(p1Header)
	buf.Write(p1SegTable)
	buf.Write(p1Payload)

	return buf.Bytes()
}

func TestAnalyzeOggOpus_Valid(t *testing.T) {
	sampleRate := uint32(48000)
	preSkip := uint16(312)
	// 5 seconds worth of samples
	granule := uint64(5*48000 + 312)

	data := buildSyntheticOggOpus(sampleRate, preSkip, granule)

	duration, waveform, err := analyzeOggOpus(data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if duration != 5 {
		t.Errorf("expected duration 5, got %d", duration)
	}

	if len(waveform) != 64 {
		t.Errorf("expected 64 waveform bytes, got %d", len(waveform))
	}
}

func TestAnalyzeOggOpus_DurationClamping(t *testing.T) {
	// Test duration < 1 clamps to 1
	dataMin := buildSyntheticOggOpus(48000, 312, 312) // 0 duration
	durMin, _, err := analyzeOggOpus(dataMin)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if durMin != 1 {
		t.Errorf("expected clamped duration 1, got %d", durMin)
	}

	// Test duration > 300 clamps to 300
	dataMax := buildSyntheticOggOpus(48000, 0, 500*48000) // 500 sec duration
	durMax, _, err := analyzeOggOpus(dataMax)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if durMax != 300 {
		t.Errorf("expected clamped duration 300, got %d", durMax)
	}
}

func TestAnalyzeOggOpus_NoOpusHeadFallback(t *testing.T) {
	// Create Ogg page without OpusHead
	var buf bytes.Buffer
	pHeader := make([]byte, 27)
	copy(pHeader[0:4], "OggS")
	binary.LittleEndian.PutUint64(pHeader[6:14], 48000*3) // 3 seconds granule
	binary.LittleEndian.PutUint32(pHeader[18:22], 0)
	pHeader[26] = 1

	payload := []byte("non opus head payload")
	buf.Write(pHeader)
	buf.Write([]byte{byte(len(payload))})
	buf.Write(payload)

	dur, _, err := analyzeOggOpus(buf.Bytes())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if dur != 3 {
		t.Errorf("expected duration 3, got %d", dur)
	}
}

func TestAnalyzeOggOpus_NoGranuleFallbackEstimate(t *testing.T) {
	// Create Ogg page with 0 granule
	var buf bytes.Buffer
	pHeader := make([]byte, 27)
	copy(pHeader[0:4], "OggS")
	binary.LittleEndian.PutUint64(pHeader[6:14], 0)
	binary.LittleEndian.PutUint32(pHeader[18:22], 0)
	pHeader[26] = 1

	// Make data size 6000 bytes -> 6000/2000 = 3 seconds estimate
	payload := make([]byte, 200)
	buf.Write(pHeader)
	buf.Write([]byte{byte(len(payload))})
	buf.Write(payload)
	// Pad buffer to 6000 bytes
	pad := make([]byte, 6000-buf.Len())
	buf.Write(pad)

	dur, _, err := analyzeOggOpus(buf.Bytes())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if dur != 3 {
		t.Errorf("expected duration estimate 3, got %d", dur)
	}
}

func TestAnalyzeOggOpus_CorruptedAndEdgeCases(t *testing.T) {
	// Less than 4 bytes
	if _, _, err := analyzeOggOpus([]byte("Og")); err == nil {
		t.Error("expected error for data < 4 bytes")
	}

	// Not starting with OggS
	if _, _, err := analyzeOggOpus([]byte("RIFF1234WAVE")); err == nil {
		t.Error("expected error for non-OggS data")
	}

	// Starts with OggS but truncated before header (len < 27)
	dur, _, err := analyzeOggOpus([]byte("OggS1234567890"))
	if err != nil {
		t.Errorf("expected fallback calculation, got error %v", err)
	}
	if dur != 1 {
		t.Errorf("expected duration 1, got %d", dur)
	}

	// Starts with OggS, header ok, but numSegments exceeds data
	truncSeg := make([]byte, 30)
	copy(truncSeg[0:4], "OggS")
	truncSeg[26] = 100 // claims 100 segments but buffer only 30 bytes
	dur, _, err = analyzeOggOpus(truncSeg)
	if err != nil {
		t.Errorf("expected fallback, got error %v", err)
	}
	if dur != 1 {
		t.Errorf("expected duration 1, got %d", dur)
	}

	// Data with non-Ogg bytes in between pages to hit the i++ branch
	valid := buildSyntheticOggOpus(48000, 0, 48000*2)
	corrupted := append(valid, []byte("garbage")...)
	corrupted = append(corrupted, valid...)
	dur, _, err = analyzeOggOpus(corrupted)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if dur != 2 {
		t.Errorf("expected duration 2, got %d", dur)
	}
}

func TestPlaceholderWaveform_Values(t *testing.T) {
	// Test short, medium, and long durations
	durations := []uint32{0, 1, 30, 60, 120, 240, 300}
	for _, d := range durations {
		wf := placeholderWaveform(d)
		if len(wf) != 64 {
			t.Fatalf("expected 64 bytes for duration %d, got %d", d, len(wf))
		}
		for i, v := range wf {
			if v > 100 {
				t.Errorf("waveform value at index %d exceeds 100: %d for duration %d", i, v, d)
			}
		}
	}
}

func TestMin_Branches(t *testing.T) {
	if got := min(10, 20); got != 10 {
		t.Errorf("min(10, 20) = %d, want 10", got)
	}
	if got := min(30, 20); got != 20 {
		t.Errorf("min(30, 20) = %d, want 20", got)
	}
	if got := min(15, 15); got != 15 {
		t.Errorf("min(15, 15) = %d, want 15", got)
	}
}
