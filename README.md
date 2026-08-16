# 🚀 Trotter v0.4.0
### The Advanced AI-Powered Technical Analysis & Research Engine

Trotter is a professional-grade trading assistant that combines a deterministic quantitative scoring engine with Multi-Modal AI, Real-time Web Research, and Computer Vision to provide deep, actionable insights into any stock ticker. Designed for the modern trader, Trotter bridges the gap between raw data and high-conviction decision making.

---

## ✨ Key Features

### 🧮 Deterministic Quantitative Scoring
Investment scores (momentum, valuation, volume, sentiment, volatility) are computed directly from market data in code — not guessed by an LLM. Searching the same ticker twice within the cache window returns the exact same score every time; re-scoring later only moves the score when the underlying market data actually changes. Gemini is used only to write the narrative reasoning and estimate target prices on top of the fixed scores.

### 👁️ Computer Vision "Deep Dive"
Harness the power of Gemini 2.5 Flash to "see" your charts.
- **Pattern Recognition**: Automatically identifies technical patterns like Bullish Engulfing, Hammers, and Head & Shoulders.
- **Spatial Awareness**: Highlights detected patterns with accurate bounding boxes directly on the UI.
- **Proportionate Score Overwrites**: Visual findings can adjust the dashboard's scores, verdicts, and price targets, capped to a reasonable delta from the quantitative baseline.

### 🧠 Multi-Horizon Analysis
Why settle for one perspective? Trotter evaluates every stock across three distinct timeframes simultaneously:
- **Weekly**: Optimized for swing trading (1-5 days).
- **Monthly**: Focused on medium-term trends (2-8 weeks).
- **Long-term**: Geared towards fundamental value (6mo+).

### 📰 Deep Sentiment Analysis (FinBERT)
Aggregates news from **Yahoo Finance** and **Google News** for a full 30-day window, deduplicated across sources. Every article is classified as Positive, Negative, or Neutral using the **FinBERT** transformer model (batched for throughput), providing a quantified view of market sentiment that directly feeds the sentiment score.

### 🌐 Live Industry Grounding (Tavily)
Real-time web research to ground AI commentary in current market reality:
- **Industry P/E Comparison**: Uses Tavily Search to retrieve up-to-date average P/E ratios for the stock's sector.
- **Grounded Commentary**: Analyst reasoning and target prices are backed by the latest industry benchmarks.

### ⚡ Response Caching
Completed research is cached per symbol for 10 minutes, so repeat searches are instant and byte-for-byte identical instead of re-running the full pipeline.

### 📊 Professional Technical Charting
- **Standard Aesthetics**: Clean, Red/Green candlestick rendering.
- **Bollinger Bands**: Integrated 20-period bands (SMA + StdDev) for identifying overbought/oversold levels.
- **Volume Pane**: Visualizes buying and selling pressure directly on the chart.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router, Turbopack)
- **Scoring**: Deterministic quantitative engine (`src/lib/scoring.ts`) — momentum, valuation, volume, sentiment, and volatility computed from market data.
- **AI Models**:
  - **Gemini 2.5 Flash**: Multi-modal chart vision and analyst narrative generation.
  - **FinBERT**: Deep learning sentiment analysis for financial text.
- **APIs**:
  - **Tavily Search**: AI-optimized web retrieval for live market grounding.
  - **Yahoo Finance**: Real-time quotes, historical data, and RSS news feeds.
- **Styling**: Minimalist, high-contrast Dark Mode with Vanilla CSS.

Both `GOOGLE_API_KEY` and `TAVILY_API_KEY` are optional — Trotter degrades gracefully to quantitative-only scoring without AI commentary or industry P/E grounding if either is missing.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- A Google AI (Gemini) API Key
- A Tavily API Key

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/anubhav-qt/trotter.git
   cd trotter
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up Environment Variables**:
   Create a `.env.local` file in the root directory:
   ```env
   GOOGLE_API_KEY=your_gemini_key_here
   TAVILY_API_KEY=your_tavily_key_here
   ```

4. **Run the development server**:
   ```bash
   npm run dev
   ```

5. **Open the App**:
   Navigate to [http://localhost:3000](http://localhost:3000).

---

## 📈 Roadmap

- [ ] **Native DL Scoring Model**: Implementing a custom PyTorch/TensorFlow model for native pattern scoring.
- [ ] **Leaderboard**: Background task to track and rank the top "strong buy" opportunities in the Indian and Global markets.
- [ ] **Custom Indicators**: Adding RSI, MACD, and EMA cross-overlays to the vision engine.

---

## ⚖️ Disclaimer
*Trotter is an AI-powered research tool. All information provided is for educational purposes only and does not constitute financial advice. Always perform your own due diligence before making investment decisions.*
