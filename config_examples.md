# Market Configuration Examples

This document shows how to customize different types of prediction markets in `src/config.rs`.

## Basic Configuration Structure

```rust
pub static ref DEFAULT_MARKET: DefaultMarketConfig = DefaultMarketConfig {
    title: "Market Title",
    description: "Market Description",
    start_time: start_time_in_ticks,
    end_time: end_time_in_ticks,
    resolution_time: resolution_time_in_ticks,
    initial_yes_liquidity: 100000,
    initial_no_liquidity: 100000,
};
```

## Time Conversion Reference

- 1 tick = 5 seconds
- 1 minute = 12 ticks
- 1 hour = 720 ticks  
- 1 day = 17280 ticks
- 1 week = 120960 ticks
- 4 months = 2073600 ticks (120 days)

## Liquidity Configuration

Initial liquidity affects market pricing and slippage:

- **Higher liquidity** = Lower price impact per bet, more stable prices
- **Lower liquidity** = Higher price impact per bet, more volatile prices

### Recommended Liquidity Levels

- **Quick markets (< 1 hour)**: 100,000 - 500,000 per side
- **Short markets (1-24 hours)**: 500,000 - 1,000,000 per side  
- **Medium markets (1-7 days)**: 1,000,000 - 2,000,000 per side
- **Long markets (> 1 week)**: 2,000,000+ per side

### Asymmetric Liquidity

You can also set different initial liquidity for YES and NO:

```rust
// Market biased toward NO (cheaper YES bets initially)
initial_yes_liquidity: 800000,
initial_no_liquidity: 1200000,

// Market biased toward YES (cheaper NO bets initially)  
initial_yes_liquidity: 1200000,
initial_no_liquidity: 800000,
```

## Configuration Examples

### 1. Short-term Market (1 hour)

```rust
pub static ref DEFAULT_MARKET: DefaultMarketConfig = DefaultMarketConfig {
    title: "BTC 1-Hour Price Movement",
    description: "Will Bitcoin price go up in the next 1 hour?",
    start_time: 0,
    end_time: TICKS_PER_HOUR,        // 720 ticks
    resolution_time: TICKS_PER_HOUR,
    initial_yes_liquidity: 500000,   // Lower liquidity for shorter market
    initial_no_liquidity: 500000,
};
```

### 2. Medium-term Market (1 day, default configuration)

```rust
pub static ref DEFAULT_MARKET: DefaultMarketConfig = DefaultMarketConfig {
    title: "Bitcoin $100K by 2024",
    description: "Will Bitcoin reach $100,000 USD by December 31, 2024?",
    start_time: 0,
    end_time: TICKS_PER_DAY,         // 17280 ticks
    resolution_time: TICKS_PER_DAY,
    initial_yes_liquidity: 100000,  // Small liquidity for testing
    initial_no_liquidity: 100000,
};
```

### 3. Long-term Market (1 week)

```rust
pub static ref DEFAULT_MARKET: DefaultMarketConfig = DefaultMarketConfig {
    title: "ETH 2.0 Full Launch",
    description: "Will Ethereum 2.0 fully launch within one week?",
    start_time: 0,
    end_time: TICKS_PER_DAY * 7,     // 120960 ticks
    resolution_time: TICKS_PER_DAY * 7,
    initial_yes_liquidity: 2000000,  // Higher liquidity for longer market
    initial_no_liquidity: 2000000,
};
```

### 4. Delayed Resolution Market

```rust
pub static ref DEFAULT_MARKET: DefaultMarketConfig = DefaultMarketConfig {
    title: "Stock Market Close Prediction",
    description: "Will the stock market close higher today?",
    start_time: 0,
    end_time: TICKS_PER_HOUR * 8,        // Stop betting after 8 hours
    resolution_time: TICKS_PER_HOUR * 10, // Can only resolve after 10 hours
    initial_yes_liquidity: 750000,       // Medium liquidity
    initial_no_liquidity: 750000,
};
```

### 5. Custom Time Market

```rust
pub static ref DEFAULT_MARKET: DefaultMarketConfig = DefaultMarketConfig {
    title: "30-Minute Quick Prediction",
    description: "Will event X happen in the next 30 minutes?",
    start_time: 0,
    end_time: DefaultMarketConfig::seconds_to_ticks(1800), // 30 minutes = 1800 seconds
    resolution_time: DefaultMarketConfig::seconds_to_ticks(1800),
    initial_yes_liquidity: 250000,       // Low liquidity for quick market
    initial_no_liquidity: 250000,
};
```

## Utility Functions

Time conversion tools provided in `DefaultMarketConfig`:

```rust
// Convert seconds to ticks
let ticks = DefaultMarketConfig::seconds_to_ticks(3600); // 1 hour

// Convert ticks to seconds  
let seconds = DefaultMarketConfig::ticks_to_seconds(720); // 720 ticks = 3600 seconds

// Get market duration
let duration_ticks = DEFAULT_MARKET.duration_ticks();
let duration_seconds = DEFAULT_MARKET.duration_seconds();
```

## Configuration Modification Steps

1. Edit `DEFAULT_MARKET` configuration in `src/config.rs`
2. Recompile: `make build`
3. Restart application: `make run`

## Important Notes

- `start_time` is usually set to 0 (start immediately when system boots)
- `end_time` must be greater than `start_time`
- `resolution_time` must be greater than or equal to `end_time`
- Time unit consistently uses ticks (5 seconds per tick)
- Recommend using predefined time constants (`TICKS_PER_HOUR` etc.) for better readability 