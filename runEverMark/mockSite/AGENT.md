# runEverMark

**runEverMark** is a battleground designed to benchmark and compare the performance of different LLM models in driving the runEver browser engine. It simulates common internet use cases to test an agent's ability to navigate, interact, and complete tasks within a controlled environment.

## Overview

This directory contains a standalone React application built with Vite. It provides a set of isolated "pages" or scenarios that mimic real-world web applications. These scenarios act as test cases for browser agents.

## Getting Started

### Prerequisites
- Node.js (Latest LTS recommended)
- npm

### Installation
Navigate to this directory and install dependencies:
```bash
cd runEverMark/mockSite
npm install
```

### Running the Benchmark
Start the local development server:
```bash
npm run dev
```
The app will typically be available at `http://localhost:5173`.

## Scenarios (Test Cases)

The benchmark includes several simulated flows. You can navigate to them via the Home Page or directly using the URL hash.

### 1. Email Platform
*   **Route**: `#/email`
*   **Goal**: Simulate reading, composing, and managing emails.

### 2. E-commerce Flow
*   **Routes**:
    *   `#/ecomm/products`: Browse products.
    *   `#/ecomm/register`: User registration.
    *   `#/ecomm/login`: User login.
    *   `#/ecomm/checkout`: Checkout process.
    *   `#/ecomm/ordered`: Order confirmation.
*   **Goal**: precise product selection, form filling, and multi-step transaction capability.

### 3. Payment Gateway
*   **Routes**:
    *   `#/gateway/login`: Secure login simulation.
    *   `#/gateway/2fa`: Two-factor authentication challenge.
    *   `#/gateway/cards`: Managing payment methods.
*   **Goal**: Handling security barriers and sensitive data entry.

### 4. Point of Sale (POS)
*   **Routes**:
    *   `#/pos/login`: Staff login.
    *   `#/pos/dashboard`: Main dashboard navigation.
    *   `#/pos/orders`: Order history.
    *   `#/pos/create`: Creating a new order.
    *   `#/pos/preview`: Reviewing an order.
*   **Goal**: Complex data manipulation and dashboard interaction.

### 5. Search Engine
*   **Routes**:
    *   `#/search`: Search query entry.
    *   `#/search/results`: Handling search results and navigation.
*   **Goal**: Information retrieval and query formulation.

## Development

The project is structured as a standard React + Vite app:
- `src/pages`: Contains the React components for each scenario.
- `src/App.tsx`: Handles routing (hash-based) to ensure standard browser history behavior works as expected for agents.

## Usage for Agents

Agents should be directed to the specific hash URLs to begin a task. Success is measured by the agent's ability to reach a defined end state (e.g., "Order Confirmed" text, successfully sending an email) compared against expected outcomes.

## Agent Work Log

We maintain a `AGENT_LOG.md` file to track the work done by agents in this directory.

### Log Format

Every significant task or session should be recorded in `AGENT_LOG.md` using the following format:

```markdown
## [YYYY-MM-DD] Task Name
- **Status**: [Completed/In Progress]
- **Changes**:
    - Modified `file.ext`
    - Created `new_file.ext`
- **Notes**: Any additional context, challenges, or decisions made.
```
