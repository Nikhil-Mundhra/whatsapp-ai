package main

import (
	"fmt"
	"os"
	"path/filepath"
	"syscall"
)

// ProcessLock holds an open file descriptor with an exclusive flock.
type ProcessLock struct {
	file *os.File
	path string
}

// AcquireProcessLock attempts to acquire an exclusive non-blocking file lock.
// If another instance already holds the lock, it returns an error with the PID of the owner.
func AcquireProcessLock(lockPath string) (*ProcessLock, error) {
	if err := os.MkdirAll(filepath.Dir(lockPath), 0755); err != nil {
		return nil, fmt.Errorf("failed to create lock directory: %w", err)
	}

	file, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, fmt.Errorf("failed to open lock file %s: %w", lockPath, err)
	}

	// Try non-blocking exclusive lock
	err = syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
	if err != nil {
		// Another process holds the lock
		existingPID := ""
		buf := make([]byte, 64)
		if n, readErr := file.Read(buf); readErr == nil && n > 0 {
			existingPID = string(buf[:n])
		}
		_ = file.Close()
		if existingPID != "" {
			return nil, fmt.Errorf("another bridge process is already running (PID: %s). Exiting to prevent WhatsApp session conflicts", existingPID)
		}
		return nil, fmt.Errorf("another bridge process is already running. Exiting to prevent WhatsApp session conflicts: %w", err)
	}

	// Truncate and write our PID into the lock file
	_ = file.Truncate(0)
	_, _ = file.Seek(0, 0)
	_, _ = fmt.Fprintf(file, "%d\n", os.Getpid())
	_ = file.Sync()

	return &ProcessLock{
		file: file,
		path: lockPath,
	}, nil
}

// Release releases the flock and closes the file descriptor.
func (l *ProcessLock) Release() {
	if l == nil || l.file == nil {
		return
	}
	_ = syscall.Flock(int(l.file.Fd()), syscall.LOCK_UN)
	_ = l.file.Close()
	_ = os.Remove(l.path)
	l.file = nil
}
