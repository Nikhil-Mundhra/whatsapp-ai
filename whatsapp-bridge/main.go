package main

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/mdp/qrterminal"

	"go.mau.fi/whatsmeow"
	waProto "go.mau.fi/whatsmeow/binary/proto"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"
)

func init() {
	store.DeviceProps.Os = proto.String("Mac OS")
	store.DeviceProps.PlatformType = waProto.DeviceProps_CHROME.Enum()
}

func main() {
	// Set up logger
	logger := waLog.Stdout("Client", "INFO", true)
	logger.Infof("Starting WhatsApp client...")

	serverMode := false
	port := 8080
	for i := 1; i < len(os.Args); i++ {
		switch os.Args[i] {
		case "--server":
			serverMode = true
		case "--port":
			if i+1 < len(os.Args) {
				fmt.Sscanf(os.Args[i+1], "%d", &port)
				i++
			}
		}
	}

	// Acquire process-level single-instance lock to prevent duplicate processes from hijacking WhatsApp sessions
	lockPath := "store/bridge.lock"
	lock, err := AcquireProcessLock(lockPath)
	if err != nil {
		logger.Errorf("Failed to start WhatsApp bridge: %v", err)
		os.Exit(1)
	}
	defer lock.Release()

	if serverMode {
		startMultiTenantServer(port, waLog.Stdout("MultiTenant", "INFO", true))
		return
	}

	// Create database connection for storing session data
	dbLog := waLog.Stdout("Database", "INFO", true)

	// Create directory for database if it doesn't exist
	if err := os.MkdirAll("store", 0755); err != nil {
		logger.Errorf("Failed to create store directory: %v", err)
		return
	}

	container, err := sqlstore.New(context.Background(), "sqlite3", "file:store/whatsapp.db?_foreign_keys=on&_journal_mode=WAL&_busy_timeout=5000", dbLog)
	if err != nil {
		logger.Errorf("Failed to connect to database: %v", err)
		return
	}

	// Get device store - This contains session information
	deviceStore, err := container.GetFirstDevice(context.Background())
	if err != nil {
		if err == sql.ErrNoRows {
			// No device exists, create one
			deviceStore = container.NewDevice()
			logger.Infof("Created new device")
		} else {
			logger.Errorf("Failed to get device: %v", err)
			return
		}
	}

	// Create client instance
	client := whatsmeow.NewClient(deviceStore, logger)
	if client == nil {
		logger.Errorf("Failed to create WhatsApp client")
		return
	}

	// Initialize message store
	messageStore, err := NewMessageStore("store/messages.db")
	if err != nil {
		logger.Errorf("Failed to initialize message store: %v", err)
		return
	}
	defer messageStore.Close()

	// Setup event handling for messages and history sync
	client.AddEventHandler(func(evt interface{}) {
		switch v := evt.(type) {
		case *events.Message:
			// Poll votes come in as messages with a PollUpdateMessage.
			if v.Message.GetPollUpdateMessage() != nil {
				handlePollVote(client, messageStore, v, logger)
			} else {
				handleMessage(client, messageStore, v, logger)
			}

		case *events.HistorySync:
			// Process history sync events
			handleHistorySync(client, messageStore, v, logger)

		case *events.Connected:
			logger.Infof("Connected to WhatsApp")

		case *events.LoggedOut:
			logger.Warnf("Device logged out, please scan QR code to log in again")
		}
	})

	// Connect to WhatsApp
	if client.Store.ID == nil {
		// No ID stored, this is a new client, need to pair with phone.
		// Loop so that when the QR codes expire (whatsmeow emits a timeout after
		// the batch runs out and disconnects), a fresh QR code is requested until
		// the user successfully scans one.
		paired := false
		for !paired {
			qrChan, err := client.GetQRChannel(context.Background())
			if err != nil {
				logger.Errorf("Failed to get QR channel: %v", err)
				time.Sleep(2 * time.Second)
				continue
			}
			if err := client.Connect(); err != nil {
				logger.Errorf("Failed to connect: %v", err)
				return
			}

			// Print QR codes for pairing with phone, refreshing as they expire
			for evt := range qrChan {
				switch evt.Event {
				case whatsmeow.QRChannelEventCode:
					fmt.Println("\nScan this QR code with your WhatsApp app:")
					qrterminal.GenerateHalfBlock(evt.Code, qrterminal.L, os.Stdout)
				case whatsmeow.QRChannelEventError:
					logger.Errorf("Pairing error: %v", evt.Error)
				case whatsmeow.QRChannelSuccess.Event:
					paired = true
				case whatsmeow.QRChannelTimeout.Event:
					logger.Infof("QR code expired, requesting a new one...")
				}
			}

			if !paired {
				// QR codes ran out or pairing failed; ensure the socket is fully
				// disconnected before requesting a fresh set of codes
				client.Disconnect()
			}
		}

		fmt.Println("\nSuccessfully connected and authenticated!")
	} else {
		// Already logged in, just connect
		err = client.Connect()
		if err != nil {
			logger.Errorf("Failed to connect: %v", err)
			return
		}
	}

	// Wait a moment for connection to stabilize
	time.Sleep(2 * time.Second)

	if !client.IsConnected() {
		logger.Errorf("Failed to establish stable connection")
		return
	}

	fmt.Println("\n✓ Connected to WhatsApp! Type 'help' for commands.")

	// Start REST API server
	startRESTServer(client, messageStore, 8080, logger)

	// Create a channel to keep the main goroutine alive
	exitChan := make(chan os.Signal, 1)
	signal.Notify(exitChan, syscall.SIGINT, syscall.SIGTERM)

	fmt.Println("REST server is running. Press Ctrl+C to disconnect and exit.")

	// Wait for termination signal
	<-exitChan

	fmt.Println("Disconnecting...")
	// Disconnect client
	client.Disconnect()
}
