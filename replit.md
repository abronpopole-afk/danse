# GTO Poker Bot

## Overview
The GTO Poker Bot is a sophisticated system designed for automated, undetectable poker gameplay on platforms like GGClub. It integrates Game Theory Optimal (GTO) strategies with advanced humanization techniques, dynamic player profiling, and intelligent task scheduling. The project aims to provide a reliable and adaptable solution for automated poker, built with a React frontend, Express backend, and PostgreSQL database.

## Recent Updates (2026-01-25)
- ✅ **OCR Service Optimization**: Hardcoded port to 8000 for consistent local/remote access and fixed port conflicts.
- ✅ **Centralized Logging System**: Implemented redirected logs for both Backend (Node.js) and OCR Service (Python).
  - Log Directory: `C:\Users\adria\AppData\Roaming\GTO Poker Bot\logs` (Windows) or `./logs` (Replit/Linux).
  - Log Files: `backend.log` and `ocr_service.log` with automatic rotation.
- ✅ **Windows Automation**: Added `start_ocr_service.bat` for one-click startup of the OCR microservice.
- ✅ **Database Reliability**: Synchronized database schema with `drizzle-kit push` to ensure all tables (action_logs, bot_sessions, etc.) are present.

## Operational Procedures

### OCR Service (PaddleOCR)
The OCR service must be running for the bot to process table images.
- **Windows**: Run `start_ocr_service.bat` from the root directory.
- **Replit**: Run `python server/ocr_service/main.py` in the Shell.
- **Configuration**: Listens on port 8000. Ensure Python 3.8-3.12 is used on Windows for PaddlePaddle compatibility.

### Monitoring & Debugging
All system activities are recorded in the centralized log directory:
- Check `backend.log` for game logic, API requests, and database operations.
- Check `ocr_service.log` for image processing details and OCR detection results.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Design Patterns
The system employs a multi-layered bot architecture, separating platform interaction, game logic, and user interface. Key layers include a Platform Abstraction Layer, Computer Vision System, GTO-based Decision Engine, Humanization Layer, Multi-Account Management, Task Scheduler, and Player Profile System.

### Frontend Architecture
Built with React 18, TypeScript, Vite, TailwindCSS, Radix UI, and TanStack Query. It features a real-time dashboard with a custom poker table visualizer, settings panels for bot configuration, and WebSocket for live updates.

### Backend Architecture
Utilizes Express.js with TypeScript, a WebSocket Server, Drizzle ORM, and Node.js native modules (robotjs, screenshot-desktop, node-window-manager).

**Core Services:**
-   **Task Scheduler:** Priority-based event loop with non-blocking async execution, error handling, and performance monitoring.
-   **Platform Manager:** Orchestrates bot sessions across multiple accounts, manages table scanning, and handles reconnection logic.
-   **Table Manager:** Manages individual table sessions, coordinating GTO engine, humanizer, and player profile.
-   **Player Profile System:** Dynamic personality system (aggressive, passive, tilted, etc.) with tilt, fatigue, and circadian rhythm simulation, persisting state in the database.
-   **GTO Engine:** Calculates optimal poker decisions, integrates player profile modifiers, and supports external API integration.
-   **GTO Cache:** In-memory LRU cache (10,000 entries, 60min TTL) saving 200-400ms per cached query, with warmup capability for common preflop situations.
-   **Event Bus (Redis Streams):** Distributed event system for vision, GTO, and action events, enabling multi-table scalability (200+ tables).
-   **Worker Pool:** Thread-based workers for Vision (OCR/template matching), GTO (Monte Carlo equity), and Humanizer (timing/trajectories) - non-blocking architecture.
-   **Humanizer:** Applies Gaussian random timing, Bézier mouse movements, and micro-pauses based on player profile for anti-detection.
-   **Computer Vision System:** Performs screen capture, OCR (PaddleOCR via Python Service), template matching, and color-based state detection. Includes an OCR Error Correction System for robust data interpretation.
-   **State Confidence System:** Assigns confidence scores to detected elements, retries uncertain states, and blocks actions below validation thresholds to prevent errors.
-   **Calibration System:** Manages platform-specific screen region definitions, DPI scaling, and passive auto-recalibration to adapt to window movements.
-   **Safe Mode System:** Dynamically adjusts bot behavior (Normal, Conservative, Freeze) based on suspicion level to prevent detection and bans.
-   **Anti-Detection Architecture:** Multi-layered defense including timing humanization, natural mouse movements, behavioral patterns, and player profile integration to mimic human play.
-   **ML-Based OCR Engine:** Python-based PaddleOCR service for card/rank/suit/digit recognition with HSV color detection fallback.

### Database Architecture
Uses PostgreSQL with Drizzle ORM. The schema includes tables for users, bot sessions, poker tables, hand histories, action logs, bot stats, and configuration for humanizer, GTO, platform, and player profile state. Key decisions include AES-256-GCM password encryption, JSONB for flexible settings and player profile state, and accountId field for multi-account support in platform_config.

## External Dependencies

### Database & Caching
-   **PostgreSQL** (v14+)
-   **Drizzle ORM**
-   **@neondatabase/serverless**
-   **Redis** (Event Bus via ioredis)

### Computer Vision & System Integration
-   **tesseract.js** (OCR)
-   **screenshot-desktop** (Screen capture)
-   **robotjs** (Mouse/keyboard automation)
-   **node-window-manager** (Window management)

### GTO/AI Services
-   **External GTO API** (optional)

### Frontend Libraries
-   **React ecosystem** (React, React DOM, React Router)
-   **Radix UI**
-   **TailwindCSS**
-   **Framer Motion**
-   **TanStack Query**
-   **React Hook Form** with **Zod**

### Backend Libraries
-   **Express.js**
-   **ws** (WebSocket server)
-   **express-session**, **connect-pg-simple**
-   **crypto** (Node.js built-in)
-   **zod**
-   **dotenv**
-   **helmet**

### Development Tools
-   **TypeScript**
-   **Vite**
-   **esbuild**
-   **tsx**

### Authentication
-   **@auth/express** and **@auth/core** (prepared)
