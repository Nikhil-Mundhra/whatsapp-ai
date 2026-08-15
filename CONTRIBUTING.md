# Contributing to WhatsApp AI

Thank you for your interest in contributing to WhatsApp AI & TakeOver System!

## Development Guidelines

### 1. WhatsApp Bridge (Go)
* Go 1.21+ is required.
* Ensure CGO is enabled (`CGO_ENABLED=1`) for `go-sqlite3` support.
* Run tests and format code:
  ```bash
  cd whatsapp-bridge
  go fmt ./...
  go vet ./...
  ```

### 2. Controller & MCP Server (Python)
* Use [Astral `uv`](https://docs.astral.sh/uv/) for dependency management:
  ```bash
  cd whatsapp-mcp-server
  uv sync
  ```
* Lint and format using `ruff`:
  ```bash
  uv run ruff check .
  uv run ruff format .
  ```

### 3. Zepp OS Smartwatch App (JavaScript)
* Target runtime: Zepp OS 3.0 / 4.0.
* Format code with Prettier and follow Zepp OS layout guidelines:
  ```bash
  cd zepp
  npm run lint # if configured
  ```

### 4. Web Control Panel (Next.js)
* Next.js App Router with standard React standards.
* Validate build:
  ```bash
  cd web
  npm run build
  ```

---

## Submitting Pull Requests

1. Fork the repository and create a descriptive feature branch (`git checkout -b feature/awesome-feature`).
2. Test your changes locally against an active WhatsApp test session.
3. Keep commits atomic and informative.
4. Open a Pull Request on GitHub.
