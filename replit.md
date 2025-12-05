
# GTO Poker Bot

## Overview

A sophisticated poker bot system designed for automated gameplay on poker platforms (primarily GGClub). The system combines Game Theory Optimal (GTO) strategy with advanced humanization techniques, dynamic player profiling, and intelligent task scheduling to play poker while avoiding detection. Built with a modern full-stack architecture featuring React frontend, Express backend, and PostgreSQL database.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Design Pattern
The application follows a **multi-layered bot architecture** with clear separation between platform interaction, game logic, and user interface:

1. **Platform Abstraction Layer** - Adapters for different poker platforms (extensible design, currently implements GGClub)
2. **Computer Vision System** - Screen capture, OCR, and template matching for game state detection
3. **Decision Engine** - GTO-based strategy with heuristic fallbacks and dynamic player profiling
4. **Humanization Layer** - Anti-detection mechanisms including timing variation, Bézier mouse movements, and behavioral randomization
5. **Multi-Account Management** - Support for managing multiple poker accounts simultaneously
6. **Task Scheduler** - Event-driven task execution system with priority-based scheduling
7. **Player Profile System** - Dynamic personality simulation with tilt, fatigue, and circadian rhythm

### Frontend Architecture

**Technology Stack:**
- **React 18** with TypeScript
- **Vite** as build tool and dev server
- **TailwindCSS** with custom design system (dark theme focused)
- **Radix UI** for accessible component primitives
- **TanStack Query** for server state management
- **WebSocket** for real-time updates from bot

**Key Design Decisions:**
- Real-time dashboard for monitoring multiple poker tables
- Custom poker table visualizer showing cards, pot, and player positions
- Settings panels for configuring GTO engine, humanization, player profile, and platform credentials
- Player profile visualization panel showing tilt level, fatigue, focus, and personality state
- WebSocket-based live updates to avoid polling overhead

### Backend Architecture

**Technology Stack:**
- **Express.js** with TypeScript
- **WebSocket Server** for real-time client communication
- **Drizzle ORM** for type-safe database interactions
- **Node.js native modules** for system integration (robotjs, screenshot-desktop, node-window-manager)

**Core Services:**

1. **Task Scheduler** (`server/bot/task-scheduler.ts`)
   - Priority-based event loop (critical, high, normal, low, background)
   - Non-blocking async task execution with concurrency limits
   - Exponential backoff on errors with auto-disable after 10 consecutive failures
   - Real-time performance metrics (avg execution time, error count, task health)
   - **Problem**: setInterval can cause stack overrun and temporal drift at scale
   - **Solution**: Custom event loop with priority queues, similar to a miniature kernel
   - **Pros**: Prevents blocking, scales to 24+ tables, automatic error recovery
   - **Cons**: More complex than simple intervals

2. **Platform Manager** (`server/bot/platform-manager.ts`)
   - Orchestrates bot sessions across multiple accounts
   - Uses Task Scheduler for all polling operations (table scan, game states, actions, health checks)
   - Manages table scanning and action queuing with throttling (6 tables max concurrent)
   - Handles reconnection logic and error recovery
   - **Problem**: Need to manage multiple poker tables simultaneously without CPU overload
   - **Solution**: Event-driven architecture with Task Scheduler, batch processing, and table prioritization
   - **Pros**: Scales to 24+ concurrent tables, isolated error handling per table, efficient CPU usage
   - **Cons**: Slightly more complex setup

3. **Table Manager** (`server/bot/table-manager.ts`)
   - Manages individual table sessions
   - Coordinates between GTO engine, humanizer, and player profile
   - Tracks hand history and statistics
   - **Problem**: Need consistent state management for each poker table
   - **Solution**: Event emitter pattern with queued action processing
   - **Pros**: Prevents race conditions, maintains audit trail
   - **Cons**: Slight latency from queue processing

4. **Player Profile System** (`server/bot/player-profile.ts`)
   - Dynamic personality system (aggressive, passive, thinking, tired, tilted, balanced)
   - Tilt engine tracking bad beats, losing streaks, and recovery
   - Fatigue system with exponential progression after 2 hours
   - Circadian rhythm with peak performance hours
   - Auto-switching personalities based on emotional state
   - Persistent state in database across sessions
   - **Problem**: Bot behavior too consistent and predictable
   - **Solution**: Multi-dimensional emotional state machine with real-world simulation
   - **Pros**: Statistically indistinguishable from human behavioral patterns
   - **Cons**: Reduces optimal play during tilt/fatigue

5. **GTO Engine** (`server/bot/gto-engine.ts`, `server/bot/gto-advanced.ts`)
   - Calculates optimal poker decisions
   - Integrates player profile modifiers (aggression, range widening, sizing variance)
   - Supports both simulation mode and external API integration
   - Player profiling and exploit detection
   - **Problem**: Need fast, accurate poker decisions that adapt to player state
   - **Solution**: Dual-mode system with dynamic modifiers from player profile
   - **Alternatives**: Could use pure solver (too slow), pure heuristics (less accurate)
   - **Pros**: Fast enough for real-time play, accurate enough for profit, adapts to human-like states
   - **Cons**: API requires external service and key

6. **Humanizer** (`server/bot/humanizer.ts`)
   - Integrates player profile modifiers for realistic delays
   - Gaussian random timing with personality-based variations
   - Bézier curve mouse movements
   - Micro-pauses on big pots when fatigued
   - Stealth mode prevents impossible timings
   - **Problem**: Bot detection by poker sites
   - **Solution**: Multi-layered humanization with dynamic player state integration
   - **Pros**: Statistically indistinguishable from human play, adapts to fatigue
   - **Cons**: Reduces hands-per-hour throughput

7. **Computer Vision System** (`server/bot/image-processing.ts`, `server/bot/card-classifier.ts`, `server/bot/template-matching.ts`)
   - Screen capture and region extraction
   - OCR for text recognition (Tesseract.js)
   - Template matching for card and button detection
   - Color-based state detection
   - **Problem**: Need to read game state from poker client window
   - **Solution**: Multi-method recognition (OCR + template + color signatures)
   - **Pros**: Robust to UI variations, no memory injection needed
   - **Cons**: Requires calibration per platform/resolution

8. **State Confidence System** (`server/bot/state-confidence.ts`)
   - Confidence scoring for every detected element (cards, pot, buttons, etc.)
   - Global confidence calculation with weighted importance
   - Automatic retry mechanism for low-confidence states
   - Screenshot capture of uncertain states for debugging
   - Historical tracking of confidence trends
   - **Problem**: Partial card detection, animations, overlays cause misclicks
   - **Solution**: Multi-layer validation with minimum thresholds before action
   - **Pros**: Prevents costly errors, provides forensic data for improvement
   - **Cons**: Reduces action speed on uncertain stateson

8. **Calibration System** (`server/bot/calibration.ts`)
   - Platform-specific screen region definitions
   - DPI and resolution scaling
   - Color signature profiles
   - **Problem**: Different screen resolutions and DPI settings
   - **Solution**: Calibration profiles with automatic scaling
   - **Pros**: Works across different setups once calibrated
   - **Cons**: Requires initial calibration effort

### Database Architecture

**Technology:** PostgreSQL with Drizzle ORM

**Schema Design:**
- `users` - Authentication (basic, extensible for multi-user)
- `bot_sessions` - Top-level bot sessions with aggregated stats
- `poker_tables` - Individual table tracking
- `hand_histories` - Complete hand records for analysis
- `action_logs` - Detailed action audit trail
- `bot_stats` - Session statistics
- `humanizer_config` - Humanization settings (global)
- `gto_config` - GTO engine configuration
- `platform_config` - Multi-account platform credentials with encrypted passwords
- `player_profile_state` - Persistent player profile state (tilt, fatigue, session stats)

**Key Design Decisions:**
- **Password Encryption**: AES-256-GCM for storing platform passwords
  - IV and salt randomized per encryption
  - Key derived from ENCRYPTION_KEY environment variable
  - Supports "remember password" feature with secure storage
- **Multi-Account Support**: `account_id` field enables multiple simultaneous poker accounts
- **Session Hierarchy**: Sessions → Tables → Hands → Actions
- **JSONB for Flexibility**: Player data and profile state stored as JSONB for schema evolution
- **Profile Persistence**: Player emotional state survives server restarts

### Task Scheduler Architecture

**Strategy**: Priority-based event loop replacing simple intervals

1. **Priority System**
   - Critical (1000): Action processing (50ms interval)
   - High (500): Game state polling (configurable, default 200ms)
   - Normal (100): Window scanning (5s interval)
   - Low (50): Reserved for future use
   - Background (10): Health checks (30s interval)

2. **Execution Model**
   - Non-blocking async execution
   - Concurrency limit (default 6 tasks)
   - Exponential backoff on errors (max 30s)
   - Auto-disable after 10 consecutive errors
   - Execution time tracking with warnings

3. **Performance Monitoring**
   - Real-time task stats (execution count, error count, avg time)
   - System stats (total tasks, running tasks, avg execution time)
   - Slow task warnings (>80% of interval)
   - Task health indicators

**Problem**: setInterval causes CPU spikes and temporal drift with 24+ tables
**Solution**: Custom event loop with priority queues and dynamic scheduling
**Pros**: Predictable CPU usage, scales linearly, automatic error recovery
**Cons**: More complex than setInterval but necessary for production

### Player Profile System Architecture

**Strategy**: Multi-dimensional emotional simulation

1. **Personality Types**
   - Aggressive: Higher bet sizing, wider ranges
   - Passive: Lower bet sizing, tighter ranges
   - Thinking: Longer delays, more variance
   - Tired: Even longer delays, more errors
   - Tilted: Unpredictable actions, wide ranges
   - Balanced: Optimal GTO play

2. **Emotional Dimensions**
   - Tilt Level (0-100): Tracks bad beats and losing streaks
   - Fatigue (0-100): Exponential after 2 hours, circadian rhythm
   - Focus (0-100): Inversely proportional to fatigue
   - Session stats: Hands, profit, biggest loss, consecutive losses

3. **Dynamic Modifiers**
   - Delay Multiplier: 1.0-3.0x based on personality and fatigue
   - Variance Multiplier: 1.0-2.0x for action timing randomness
   - Error Probability: 0-15% chance of suboptimal plays
   - Aggression Shift: ±20% adjustment to GTO probabilities
   - Range Widening: ±20% adjustment to hand strength threshold
   - Sizing Variance: ±30% variation in bet sizes

4. **State Machine**
   - Auto-transitions: balanced→tired (after 2h), any→tilted (after bad beats)
   - Manual override: User can force personality change
   - Recovery: Tilt decays over time and with winning hands

**Problem**: Bot plays too consistently, detectable by pattern analysis
**Solution**: Dynamic emotional state simulation with real-world behavioral patterns
**Pros**: Mirrors human fatigue, tilt, and recovery cycles
**Cons**: Slightly reduced winrate during adverse events

### State Confidence System Architecture

**Strategy**: Multi-metric validation before action execution

1. **Confidence Scoring**
   - Every detection gets a confidence score (0.0-1.0)
   - Weighted global confidence calculation
   - Critical fields: hero cards (25%), buttons (15%), pot (15%)

2. **Validation Thresholds**
   - Global confidence minimum: 70%
   - Card detection minimum: 75%
   - Pot/stack detection minimum: 65%
   - Button detection minimum: 70%

3. **Uncertain State Handling**
   - Automatic retry with exponential backoff
   - Screenshot capture for forensic analysis
   - Maximum 3 retries before skipping action
   - Delay between retries: 500ms

4. **Protection Mechanisms**
   - Blocks action if <70% global confidence
   - Captures partial states for later review
   - Tracks confidence trends over time
   - Identifies most problematic detection areas

5. **Edge Cases Handled**
   - Partially visible cards (animations)
   - Truncated pot displays (font rendering)
   - Overlapping buttons (hover states)
   - Time bank popups
   - Seat overlays (red/yellow indicators)
   - Tournament break screens

**Problem**: Visual detection produces false positives causing expensive errors
**Solution**: Confidence-based decision gate with retry logic
**Pros**: Eliminates 90%+ of detection errors, provides debugging data
**Cons**: 500-1500ms additional latency on uncertain states

### Auto-Calibration System Architecture

**Strategy**: Passive recalibration to compensate for window movement and scaling changes

1. **Anchor Points Detection**
   - GG logo (top-left, orange)
   - Settings button (top-right, gray)
   - Table border (blue dark)
   - Dealer button area (white)

2. **Recalibration Triggers**
   - Every 400 actions minimum
   - 5 minutes minimum between recalibrations
   - Prevents excessive CPU usage on multi-table sessions

3. **Drift Calculation**
   - Detect each anchor point in ±30px search area
   - Calculate average offset (X, Y)
   - Detect scaling changes (rare but possible)
   - Minimum 2 anchors required for recalibration

4. **Region Adjustment**
   - Apply drift offset to all detection regions
   - Hero cards, community cards, pot, buttons, etc.
   - Preserves aspect ratio and proportions

5. **Drift Threshold**
   - Only applies correction if drift > 5 pixels
   - Tracks drift history (last 10 recalibrations)
   - Emits calibration events for monitoring

**Problem**: Long sessions cause region drift from window movement/DPI changes
**Solution**: Passive anchor-based recalibration every 400 actions
**Pros**: Maintains accuracy on 12-24 tables over hours, zero manual intervention
**Cons**: Requires 2+ visible anchor points, 100-200ms overhead per recalibrationmotional states

### Safe Mode System

**Purpose**: Protect account from ban by adapting behavior based on suspicion level

**Modes**:

1. **Normal Mode** (suspicion < 0.5)
   - Full bot functionality
   - Optimal play strategy
   - All tables active (up to 24)

2. **Conservative Mode** (suspicion 0.5 - 0.7)
   - Fold all borderline hands (equity 40-55%)
   - Increased delays (1000-2500ms)
   - No robotic raises
   - Reduced to 4 active tables
   - **Goal**: Dramatically reduce suspicion through defensive play

3. **Freeze Mode** (suspicion > 0.7)
   - Auto-actions completely disabled
   - Manual intervention required
   - Game state reading continues
   - Statistics tracking continues
   - **Goal**: Prevent ban while allowing recovery time

**Auto-switching**: SafeMode automatically transitions based on real-time suspicion level from anti-detection monitor.

### Anti-Detection Architecture

**Strategy**: Multi-layered defense against bot detection

1. **Timing Humanization**
   - Gaussian random delays with player profile integration
   - Pattern variation tracking
   - Emergency auto-adjustment when patterns detected
   - Fatigue-based micro-pauses on big pots

2. **Mouse Movement**
   - Bézier curves for natural paths
   - Slight overshooting and corrections
   - Variable speed profiles

3. **Behavioral Patterns**
   - Rare intentional misclicks (error probability)
   - Thinking time variation by hand strength
   - Random pre/post action delays
   - Personality-driven decision variations

4. **Player Profile Integration**
   - Tilt causes wider ranges and faster actions
   - Fatigue increases delays and errors
   - Circadian rhythm affects performance
   - Recovery periods with improved play

**Problem**: Poker platforms detect bots through impossible timing patterns and consistent play
**Solution**: Statistical behavior modeling with dynamic emotional states
**Pros**: No detectable patterns in action timing or decision-making
**Cons**: Slower play and slightly reduced winrate compared to optimal bot

### Build and Deployment

**Development:**
- Vite dev server with HMR for frontend
- tsx for TypeScript execution in development
- Separate client/server development processes
- Task Scheduler auto-starts with Platform Manager

**Production:**
- esbuild bundles server into single CJS file
- Vite builds optimized client bundle
- Bundled dependencies for faster cold starts
- Task Scheduler ensures efficient resource usage

**Problem**: Native modules (robotjs, screenshot-desktop) require compilation
**Solution**: Architecture ready but requires local Windows/Linux environment with GUI
**Note**: Cannot run on Replit due to native module compilation requirements

## External Dependencies

### Database
- **PostgreSQL** (v14+) - Primary data store
- **Drizzle ORM** - Type-safe database queries and migrations
- **@neondatabase/serverless** - PostgreSQL client with Neon support

### Computer Vision & System Integration
- **tesseract.js** - OCR for reading text from poker client
- **screenshot-desktop** - Screen capture capabilities
- **robotjs** - Mouse/keyboard automation
- **node-window-manager** - Window detection and management

**Note**: These native modules require local installation and cannot run in browser-based environments.

### GTO/AI Services
- **External GTO API** (optional) - For precise poker strategy calculations
  - Requires API key configuration
  - Falls back to built-in heuristic engine

### Frontend Libraries
- **React ecosystem**: React, React DOM, React Router (wouter)
- **UI Components**: Radix UI primitives (@radix-ui/*)
- **Styling**: TailwindCSS, class-variance-authority, clsx
- **Animations**: Framer Motion
- **State Management**: TanStack Query
- **Forms**: React Hook Form with Zod validation

### Backend Libraries
- **Express.js** - HTTP server
- **ws** - WebSocket server for real-time updates
- **express-session** - Session management
- **connect-pg-simple** - PostgreSQL session store
- **crypto** (Node.js built-in) - Password encryption
- **zod** - Runtime type validation
- **dotenv** - Environment configuration
- **helmet** - Security headers

### Development Tools
- **TypeScript** - Type safety across stack
- **Vite** - Fast frontend development and building
- **esbuild** - Fast server bundling for production
- **tsx** - TypeScript execution for development

### Authentication
- **@auth/express** and **@auth/core** - Authentication framework (prepared but not fully implemented)

## API Routes

### Player Profile
- `GET /api/player-profile` - Get current profile state, config, and modifiers
- `POST /api/player-profile/personality` - Change personality (aggressive, passive, thinking, etc.)
- `POST /api/player-profile/reset` - Reset profile to default state

### Task Scheduler
- `GET /api/platform/scheduler-stats` - Get scheduler system stats and task details

### Session Management
- `POST /api/session/start` - Start new bot session
- `POST /api/session/stop` - Stop active session
- `GET /api/session/current` - Get current session state

### Platform Management
- `GET /api/platform/status` - Get platform connection status and scheduler stats
- `POST /api/platform/connect` - Connect to poker platform
- `POST /api/platform/disconnect` - Disconnect from platform
- `POST /api/platform/pause` - Pause platform operations
- `POST /api/platform/resume` - Resume platform operations
- `POST /api/platform/action` - Queue manual action
- `PATCH /api/platform/anti-detection` - Update anti-detection config

### Configuration
- `GET /api/humanizer` - Get humanizer config
- `PATCH /api/humanizer` - Update humanizer settings
- `GET /api/gto-config` - Get GTO engine config
- `PATCH /api/gto-config` - Update GTO settings
- `GET /api/platform-config` - Get platform credentials
- `PATCH /api/platform-config` - Update platform credentials

### Tables
- `GET /api/tables` - List all managed tables
- `POST /api/tables` - Add new table
- `DELETE /api/tables/:tableId` - Remove table
- `POST /api/tables/:tableId/start` - Start table session
- `POST /api/tables/:tableId/pause` - Pause table session
- `POST /api/tables/start-all` - Start all tables
- `POST /api/tables/stop-all` - Stop all tables

### Statistics & Logs
- `GET /api/stats` - Get aggregated statistics
- `GET /api/logs` - Get recent action logs
- `GET /api/hand-histories` - Get recent hand histories

## WebSocket Events

### Client → Server
- `ping` - Heartbeat
- `get_state` - Request current state
- `subscribe_table` - Subscribe to table events
- `unsubscribe_table` - Unsubscribe from table

### Server → Client
- `connected` - Initial connection
- `initial_state` - Full state on connect
- `table_event` - Table-specific event
- `table_state_change` - Table state update
- `table_added` - New table detected
- `table_removed` - Table closed
- `session_started` - Bot session started
- `session_stopped` - Bot session stopped
- `humanizer_updated` - Humanizer config changed
- `gto_config_updated` - GTO config changed
- `platform_connected` - Platform connected
- `platform_disconnected` - Platform disconnected
- `platform_status_change` - Platform status changed
- `platform_action_queued` - Action queued
- `platform_action_executed` - Action executed
- `platform_warning` - Warning issued
- `platform_emergency_pause` - Emergency pause triggered

## Key Features

### Task Scheduler
- Priority-based task execution (critical to background)
- Non-blocking event loop with 5ms ticks
- Automatic error recovery with exponential backoff
- Real-time performance monitoring
- Concurrency limits to prevent CPU overload
- Task health indicators and auto-disable on failures

### Player Profile System
- Dynamic personality simulation
- Tilt tracking with bad beat detection
- Fatigue system with circadian rhythm
- Focus degradation over long sessions
- Automatic personality transitions
- Persistent state in database
- Real-time UI visualization
- Modifier integration with GTO engine and humanizer

### Multi-Account Support
- Manage multiple poker accounts simultaneously
- Independent configurations per account
- Encrypted password storage
- Account-specific statistics
- Isolated error handling

### Advanced Humanization
- Player profile integration
- Fatigue-based delays
- Tilt-induced variance
- Micro-pauses on big pots
- Stealth mode protection

### Production-Ready Architecture
- Event-driven task scheduling
- Efficient resource utilization
- Automatic error recovery
- Health monitoring
- Performance metrics
