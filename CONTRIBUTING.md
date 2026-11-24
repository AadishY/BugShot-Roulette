# Contributing to Bugshot Roulette

First off, thank you for considering contributing to **Bugshot Roulette**! Open source projects thrive when developers and gamers share ideas, submit improvements, and help fix bugs.

Please read through these guidelines before submitting a pull request or filing an issue.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Enhancements](#suggesting-enhancements)
  - [Pull Requests](#pull-requests)
- [Local Development Setup](#local-development-setup)
- [Coding Standards & Guidelines](#coding-standards--guidelines)
- [Multiplayer & Server Development](#multiplayer--server-development)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Licensing](#licensing)

---

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior via the channels detailed in the Code of Conduct.

---

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to see if the problem has already been reported.

When filing an issue, please include:
- A clear and descriptive title.
- Steps to reproduce the bug.
- Expected behavior vs. actual behavior.
- Browser name, version, and operating system (and GPU if 3D rendering related).
- Screenshots or video clips, if applicable.
- Console error logs if any are present in DevTools.

### Suggesting Enhancements

Enhancement suggestions are welcome! Whether it is a new item idea, balance adjustment, graphical improvement, or performance optimization:
1. Open an issue with the label `enhancement`.
2. Explain why this feature would be valuable for the game.
3. Provide details on how you envision the mechanics or interface working.

### Pull Requests

1. **Fork** the repository and create your branch from `main`:
   ```bash
   git checkout -b feature/amazing-feature
   ```
2. Make your modifications.
3. Verify that the project builds cleanly without TypeScript or bundler errors:
   ```bash
   npm run build
   ```
4. Commit your changes with a clear, concise commit message.
5. Push to your fork and submit a Pull Request to `main`.
6. Explain what changes were made, why, and how they were tested.

---

## Local Development Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/) (v9 or higher)

### Setup Steps
1. Clone your fork:
   ```bash
   git clone https://github.com/YOUR-USERNAME/BugShot-Roulette.git
   cd BugShot-Roulette
   ```
2. Install client dependencies:
   ```bash
   npm install
   ```
3. Start the client dev server:
   ```bash
   npm run dev
   ```
4. If testing multiplayer features, start the local server in a separate terminal:
   ```bash
   cd server
   npm install
   node index.js
   ```

---

## Coding Standards & Guidelines

- **TypeScript**: Strict typing is enabled. Avoid using `any` unless absolutely necessary with an explanatory comment.
- **Three.js & React Three Fiber**:
  - Always clean up meshes, geometries, and materials when unmounting or reloading 3D components to prevent WebGL context loss or memory leaks.
  - Keep 3D asset file sizes optimized for web delivery.
- **UI & Styling**:
  - Uses Tailwind CSS alongside custom CRT / retro scanline shaders and aesthetic filters.
  - Maintain the dark, suspenseful aesthetic and monospace typography (`JetBrains Mono`).
- **Game State**:
  - Keep game loop transitions deterministic.
  - State changes must sync reliably in multiplayer matches.

---

## Multiplayer & Server Development

- Multiplayer state is managed via Socket.io in `server/index.js` and real-time state hooks.
- All gameplay validation (damage calculations, shell ordering, inventory limits) should be server-authoritative to ensure fair play between participants.

---

## Commit Message Guidelines

We follow standard conventional commit conventions:
- `feat: add adrenaline item steal animation`
- `fix: resolve mobile touch controls overlapping gun aim`
- `perf: optimize three.js texture pooling`
- `docs: update item guide and probabilities`
- `refactor: clean up game loop state transitions`

---

## Licensing

By contributing to Bugshot Roulette, you agree that your contributions will be licensed under its [MIT License](LICENSE).
