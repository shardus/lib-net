# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

lib-net is a hybrid TypeScript/Rust networking library (`@shardus/lib-net`) that provides TCP-based JSON message passing between nodes with request/response patterns. The library uses native Rust code for performance-critical networking operations while exposing a TypeScript API for Node.js applications.

## Development Commands

### Building
```bash
# Full build (Rust + TypeScript)
npm run build

# Build only TypeScript
npm run build-node

# Build only Rust (debug mode)
npm run build-rust-debug

# Build only Rust (release mode)
npm run build-rust-release
```

### Testing
```bash
# Run all tests
npm test

# Run Rust tests
npm run test:cargo
# or
cargo test

# Run specific integration tests
npm run it-test
npm run it-test2
```

### Code Quality
```bash
# Run ESLint
npm run lint

# Check formatting
npm run format-check

# Fix formatting
npm run format-fix
```

### Release Process
```bash
# Patch release (1.6.0 -> 1.6.1)
npm run release:patch

# Minor release (1.6.0 -> 1.7.0)
npm run release:minor

# Major release (1.6.0 -> 2.0.0)
npm run release:major

# Pre-release versions
npm run release:prepatch
npm run release:preminor
npm run release:premajor
npm run release:prerelease
```

## Architecture

### Directory Structure
- `src/`: TypeScript source code - API layer and Node.js bindings
- `shardus_net/`: Main Rust crate implementing core networking functionality
- `crypto/`: Rust crate for cryptographic operations (signing, verification)
- `shardus_utils/`: Shared Rust utilities
- `test/`: Test files (unit tests in `test/unit/`, integration tests in root)
- `build/`: TypeScript compilation output
- `coverage/`: Test coverage reports

### Key Components

1. **TypeScript Layer** (`src/`)
   - `index.ts`: Main entry point, exports the network creation function
   - Handles Node.js integration and provides JavaScript-friendly API
   - Manages correlation of requests/responses using UUIDs

2. **Rust Layer** (`shardus_net/`)
   - `lib.rs`: Main Rust library entry point
   - Compiles to `shardus-net.node` native module
   - Implements high-performance TCP socket handling
   - Features compression (flate2, brotli) and LRU caching
   - Uses Tokio for async runtime

3. **Message Flow**
   - Messages are JSON-serialized with UUID correlation IDs
   - Supports request/response pattern with timeouts
   - Can send to multiple nodes simultaneously
   - Headers support compression options

### Build Process
1. Rust code compiles to a C dynamic library (`cdylib`)
2. `cargo-cp-artifact` copies the compiled artifact to `shardus-net.node`
3. TypeScript compiles to JavaScript in `build/` directory
4. The `postinstall` script automatically builds Rust code when installing

## Important Notes

- **Node.js Version**: Requires exactly Node.js 18.19.1
- **Main Branch**: Development happens on `dev` branch (not `main` or `master`)
- **Native Module**: The Rust code compiles to a native Node.js module - platform-specific builds required
- **Security**: Follow responsible disclosure per SECURITY.md for vulnerabilities
- **Testing**: Always run both TypeScript and Rust tests before submitting changes