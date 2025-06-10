# Prediction Market

A simple zkWasm-based prediction market application focused on single-topic predictions.

## Features

- **Single Prediction Market**: Focused on one prediction topic - "Will Bitcoin reach $100,000 by the end of 2024?"
- **AMM Algorithm**: Uses Automated Market Maker algorithm for price discovery and liquidity management
- **Buy/Sell Operations**: Users can buy and sell Yes/No shares with continuous liquidity
- **Real-time Pricing**: Advanced price calculation functions for buy/sell operations
- **Market Impact Analysis**: Calculate slippage and price impact before trading
- **Fee Management**: Platform collects 1% fee on all transactions, admin can withdraw collected fees
- **Time Management**: Set market start, end, and resolution times
- **Automatic Settlement**: Users can claim rewards after market resolution
- **Deposit/Withdraw**: Admins can deposit funds for players, players can withdraw funds
- **Event System**: Real-time event notifications and state synchronization
- **Robust Error Handling**: Graceful error handling for edge cases like NoWinningPosition

## Technical Architecture

### Rust Backend (src/)
- `lib.rs`: Application entry point, creates zkwasm API
- `config.rs`: Configuration and constant definitions
- `error.rs`: Error code definitions
- `event.rs`: Event system implementation
- `command.rs`: Command structures and processing logic
- `player.rs`: Player data structures and operations
- `market.rs`: Prediction market core logic and AMM algorithm
- `settlement.rs`: Withdrawal settlement system
- `state.rs`: Global state management and transaction processing

### TypeScript Server (ts/)
- `src/service.ts`: Main service file, handles events and API
- `src/models.ts`: Data models and MongoDB integration
- `src/api.ts`: API client and transaction building tools
- `src/test.ts`: Test scripts

## AMM Algorithm

Uses constant product formula (x * y = k) for automated market making:
- Initial liquidity: Yes = 1,000,000, No = 1,000,000
- Price calculation: Yes price = No liquidity / (Yes liquidity + No liquidity)
- Buy/sell operations: Continuous liquidity with automatic price adjustment
- Platform fee: 1% on all transactions

> 📊 For detailed calculation examples with specific numbers, see [AMM_CALCULATION_EXAMPLES.md](AMM_CALCULATION_EXAMPLES.md)
> 
> 🔢 For precision constants and calculation accuracy, see [PRECISION_CONSTANTS.md](PRECISION_CONSTANTS.md)

## API Endpoints

- `GET /data/market` - Get market information
- `GET /data/player/:pid1/:pid2` - Get player information
- `GET /data/bets` - Get all betting records
- `GET /data/bets/:pid1/:pid2` - Get specific player's betting records
- `GET /data/stats` - Get market statistics

## Transaction Commands

| Command ID | Command Name | Parameters | Permission |
|------------|--------------|------------|------------|
| 0 | TICK | None | Admin |
| 1 | INSTALL_PLAYER | None | Any user |
| 2 | WITHDRAW | amount, address_high, address_low | Player |
| 3 | DEPOSIT | target_pid1, target_pid2, token_index, amount | Admin |
| 4 | BET | bet_type (0=NO, 1=YES), amount | Player |
| 5 | SELL | sell_type (0=NO, 1=YES), shares | Player |
| 6 | RESOLVE | outcome (0=NO, 1=YES) | Admin |
| 7 | CLAIM | None | Player |
| 8 | WITHDRAW_FEES | None | Admin |

## Event Types

| Event ID | Event Name | Data |
|----------|------------|------|
| 1 | PLAYER_UPDATE | pid1, pid2, balance, yes_shares, no_shares, claimed |
| 2 | MARKET_UPDATE | yes_liquidity, no_liquidity, total_volume, resolved, outcome, fees |
| 3 | BET_UPDATE | pid1, pid2, bet_type, amount, shares |

## Transaction Building Tools

TypeScript API provides convenient transaction building functions:

```typescript
import { 
    buildBetTransaction,
    buildSellTransaction,
    buildResolveTransaction, 
    buildClaimTransaction,
    buildWithdrawTransaction,
    buildDepositTransaction,
    buildWithdrawFeesTransaction
} from './api.js';

// Bet transaction
const betTx = buildBetTransaction(nonce, 1, 1000n); // YES bet, 1000 units

// Sell transaction
const sellTx = buildSellTransaction(nonce, 1, 500n); // Sell 500 YES shares

// Price calculation examples
const yesLiquidity = BigInt(marketData.yesLiquidity);
const noLiquidity = BigInt(marketData.noLiquidity);

// Get current market prices
const prices = api.calculatePrices(yesLiquidity, noLiquidity);
console.log(`Current prices: YES=${prices.yesPrice}, NO=${prices.noPrice}`);

// Get effective buy/sell prices
const buyPrice = api.getBuyPrice(1, 1000, yesLiquidity, noLiquidity);
const sellPrice = api.getSellPrice(1, 1000, yesLiquidity, noLiquidity);
console.log(`YES buy price: ${buyPrice}, sell price: ${sellPrice}`);

// Analyze market impact
const impact = api.calculateMarketImpact(1, 10000, yesLiquidity, noLiquidity);
const slippage = api.calculateSlippage(1, 10000, yesLiquidity, noLiquidity);

// Resolve market transaction (admin)
const resolveTx = buildResolveTransaction(nonce, true); // YES outcome

// Claim rewards transaction
const claimTx = buildClaimTransaction(nonce);

// Withdraw transaction
const withdrawTx = buildWithdrawTransaction(nonce, 1000n, 0n, 0n);

// Deposit transaction (admin)
const depositTx = buildDepositTransaction(nonce, pid1, pid2, 0n, 1000n);

// Withdraw fees transaction (admin)
const withdrawFeesTx = buildWithdrawFeesTransaction(nonce);
```

## Build and Run

```bash
# Build Rust code
make build

# Run TypeScript service
cd ts
npm install
npm run build
npm start

# Clean
make clean
```

## Project Features

- **Standardized Architecture**: Follows zkwasm project best practices with unified player state structure
- **Simplified Deposit/Withdraw**: Uses standard Withdraw/Deposit command structures with proper token indexing
- **Event-Driven**: Complete event system supports real-time updates
- **Type Safety**: TypeScript interfaces ensure type safety
- **Easy Maintenance**: Modular design with separation of concerns
- **Complete Functionality**: Includes betting, selling, AMM pricing, deposit/withdraw, market resolution, reward claiming, and fee collection
- **Comprehensive Testing**: Multi-player testing with detailed state logging and error handling
- **Fee Management**: Platform fee collection (1%) with admin withdrawal capability

## Market Lifecycle

1. **Initialization**: Automatically create preset market when system starts (counter = 0)
2. **Funding Phase**: Admin deposits funds for players
3. **Active Period**: Users can purchase and sell Yes/No shares
4. **End Period**: Stop accepting new bets
5. **Resolution Period**: Admin sets final result
6. **Claiming Period**: Winning users claim rewards 
7. **Fee Collection**: Admin withdraws collected platform fees
8. **Withdrawal Period**: Users can withdraw remaining funds

## Configuration System

### Market Configuration (src/config.rs)

You can customize default market parameters in `config.rs`:

```rust
pub static ref DEFAULT_MARKET: DefaultMarketConfig = DefaultMarketConfig {
    title: "Bitcoin $100K by 2024",
    description: "Will Bitcoin reach $100,000 USD by December 31, 2024?",
    start_time: 0,      // Start immediately
    end_time: 17280,    // End after 1 day
    resolution_time: 17280, // Resolution time
    initial_yes_liquidity: 1000000, // Initial YES liquidity for AMM
    initial_no_liquidity: 1000000,  // Initial NO liquidity for AMM
};
```

> 📖 For detailed configuration examples, see [config_examples.md](config_examples.md)

### Time System

- **Time Unit**: Based on counter value, each tick = 5 seconds
- **Time Conversion Constants**:
  - `TICKS_PER_MINUTE = 12`
  - `TICKS_PER_HOUR = 720` 
  - `TICKS_PER_DAY = 17280`

### Time Configuration Examples

```rust
// 1-hour market
end_time: TICKS_PER_HOUR,

// 12-hour market  
end_time: TICKS_PER_HOUR * 12,

// 3-day market
end_time: TICKS_PER_DAY * 3,

// Custom time (30 minutes)
end_time: DefaultMarketConfig::seconds_to_ticks(1800),
```

## Error Codes

| Error Code | Error Name | Description |
|------------|------------|-------------|
| ERROR_INVALID_BET_AMOUNT | InvalidBetAmount | Invalid bet amount |
| ERROR_MARKET_NOT_ACTIVE | MarketNotActive | Market is not active |
| ERROR_MARKET_NOT_RESOLVED | MarketNotResolved | Market is not resolved |
| ERROR_INSUFFICIENT_BALANCE | InsufficientBalance | Insufficient balance |
| ERROR_ALREADY_CLAIMED | AlreadyClaimed | Rewards already claimed |
| ERROR_PLAYER_NOT_EXIST | PlayerNotExist | Player does not exist |

After market resolution, the application completes its lifecycle. 