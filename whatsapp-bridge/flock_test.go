package main

import (
	"path/filepath"
	"testing"
)

func TestProcessLock_AcquisitionAndRelease(t *testing.T) {
	tmpDir := t.TempDir()
	lockPath := filepath.Join(tmpDir, "test.lock")

	// 1. First acquisition should succeed
	lock1, err := AcquireProcessLock(lockPath)
	if err != nil {
		t.Fatalf("expected lock1 acquisition to succeed, got %v", err)
	}
	if lock1 == nil {
		t.Fatalf("expected non-nil lock1")
	}

	// 2. Second concurrent acquisition on same path must fail
	lock2, err := AcquireProcessLock(lockPath)
	if err == nil {
		if lock2 != nil {
			lock2.Release()
		}
		t.Fatalf("expected lock2 acquisition to fail while lock1 is held, but succeeded")
	}

	// 3. Release lock1
	lock1.Release()

	// 4. Now acquisition should succeed again
	lock3, err := AcquireProcessLock(lockPath)
	if err != nil {
		t.Fatalf("expected lock3 acquisition to succeed after release, got %v", err)
	}
	if lock3 != nil {
		lock3.Release()
	}
}
