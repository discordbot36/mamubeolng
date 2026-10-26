# Windows executable

Run `npm.cmd run build:exe` from the `chamber-farm` project to create `dist/ChamberFarm.exe`.

The build embeds the installed Node.js executable, the application sources and production dependencies in a .NET Framework console launcher. It requires Windows x64 and the system .NET Framework C# compiler. The PowerShell execution policy override applies only to the build process.

The archive uses an explicit source allowlist. `.env`, `state.json`, `diagnostic.json`, `runner.lock`, tests and npm caches are not embedded. The executable extracts its runtime into `%LOCALAPPDATA%\ChamberFarm\runtime-<content hash>` once and reuses it afterwards.

On this computer, it reads `.env` and keeps using the state and lock in the original project directory. The token is read by Node from that file at runtime. If the original project is moved or deleted, place `.env` and the existing `state.json` in a `ChamberFarm-data` folder beside the executable. Preserve the state file to keep the wager progression and unresolved rounds.

Double-click to run the bot. The console stays open if the bot exits, so an error message remains visible. `ChamberFarm.exe --check` validates local settings without logging in; `ChamberFarm.exe --verify` checks the Discord command schemas without placing bets. Do not run both the npm and executable versions at the same time.
