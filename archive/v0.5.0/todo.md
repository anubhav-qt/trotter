# Trotter Future Tasks

- [x] **Chart Deep Dive (Computer Vision)**: Add a "Deep Dive" button in the chart section. When clicked, it should use computer vision to identify and highlight the most prominent candlestick pattern, providing an insightful explanation of the pattern and why it's the most prominent indicator right now.
- [ ] **Custom DL Scoring Model**: Investigate creating a custom deep learning model trained on historical market data, volume, and sentiment to generate the investment score natively, potentially replacing or augmenting the LLM scoring.
- [x] **Instant Goal Switching**: Optimize data fetching by pulling all necessary data (1mo, 3mo, 1yr history) at once. When the user switches between Weekly, Monthly, or Long Term goals, immediately recalculate the score and update the UI locally without any network requests, until a new stock is selected.
- [ ] **Top Scorers Leaderboard**: Implement a background task to continuously analyze and maintain a leaderboard of the week's top-scoring stocks. For now, this should be restricted to Indian stocks only (NSE/nifty 50) but make sure it uses less tokens.
- [x] **Fix Chart Representation**: Ensure that the chart duration and the actual candlestick representations accurately match and align correctly.
- [x] **Fix Bounding Box Accuracy**: Improve the spatial coordinate mapping of the CV-generated bounding box so that the highlight correctly snaps to the actual candlestick pattern on the chart.
after deep dive, update the entire score and also estimated target price at weekly, monthly and yearly.
