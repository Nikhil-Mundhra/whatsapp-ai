package main

import (
	"fmt"
	"os"

	"whatsapp-client/internal/bridge"
)

func main() {
	if err := bridge.Run(os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}
