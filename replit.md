# GTO Poker Bot

## Overview
The GTO Poker Bot is a sophisticated system designed for automated, undetectable poker gameplay on platforms like GGClub. It integrates Game Theory Optimal (GTO) strategies with advanced humanization techniques, dynamic player profiling, and intelligent task scheduling. The project aims to provide a reliable and adaptable solution for automated poker, built with a React frontend, Express backend, and PostgreSQL database.

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
-   **Computer Vision System:** Performs screen capture, OCR (Tesseract.js), template matching, and color-based state detection. Includes an OCR Error Correction System for robust data interpretation.
-   **State Confidence System:** Assigns confidence scores to detected elements, retries uncertain states, and blocks actions below validation thresholds to prevent errors.
-   **Calibration System:** Manages platform-specific screen region definitions, DPI scaling, and passive auto-recalibration to adapt to window movements.
-   **Safe Mode System:** Dynamically adjusts bot behavior (Normal, Conservative, Freeze) based on suspicion level to prevent detection and bans.
-   **Anti-Detection Architecture:** Multi-layered defense including timing humanization, natural mouse movements, behavioral patterns, and player profile integration to mimic human play.

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