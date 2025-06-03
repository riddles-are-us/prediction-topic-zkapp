# AMM Prediction Market Calculation Examples

This document explains how the Automated Market Maker (AMM) calculates prices, shares, and rewards in the prediction market.

## Core AMM Principles

### 1. Two-Layer System
The market uses a two-layer system:
- **Virtual AMM Liquidity**: Used for pricing using constant product formula (x × y = k)
- **Prize Pool**: Real tokens from user bets that form the reward pool

### 2. Constant Product Formula (Pricing Layer)
The pricing uses the constant product formula: **x × y = k**

Where:
- `x` = Virtual YES liquidity  
- `y` = Virtual NO liquidity
- `k` = constant product (remains unchanged during pricing calculations)

### 3. Price Calculation
- **YES price** = Virtual NO liquidity ÷ (Virtual YES liquidity + Virtual NO liquidity)
- **NO price** = Virtual YES liquidity ÷ (Virtual YES liquidity + Virtual NO liquidity)
- Prices are expressed in basis points (1,000,000 = 100%)

### 4. Prize Pool Mechanism
- All user bet amounts (minus fees) go into a shared **Prize Pool**
- Winners share the entire Prize Pool proportionally based on their shares
- Virtual liquidity is only used for pricing, not for holding actual funds

## Example Scenarios

### Initial State
```
Market: "Will Bitcoin reach $100K by 2024?"

Virtual AMM Liquidity (for pricing):
- Virtual YES liquidity: 1,000,000
- Virtual NO liquidity: 1,000,000
- Constant k = 1,000,000 × 1,000,000 = 1,000,000,000,000

Real Money Tracking:
- Prize Pool: 0 (starts empty)
- Total YES shares issued: 0
- Total NO shares issued: 0

Platform fee: 0.25% (25/10000)
```

**Initial Prices:**
- YES price = 1,000,000 ÷ (1,000,000 + 1,000,000) = 0.5 = 50%
- NO price = 1,000,000 ÷ (1,000,000 + 1,000,000) = 0.5 = 50%

### Example 1: User Buys YES Shares

**Alice bets 100,000 on YES**

**Step 1: Calculate fees**
```
Platform fee = 100,000 × 25 ÷ 10,000 = 250
Net amount = 100,000 - 250 = 99,750
```

**Step 2: Calculate new liquidity after bet**
```
New NO liquidity = 1,000,000 + 99,750 = 1,099,750
New YES liquidity = k ÷ New NO liquidity = 1,000,000,000,000 ÷ 1,099,750 = 909,299
```

**Step 3: Calculate shares received**
```
YES shares for Alice = Original YES liquidity - New YES liquidity
                     = 1,000,000 - 909,299 = 90,701 shares
```

**Step 4: Updated market state**
```
Virtual AMM Liquidity (pricing):
- Virtual YES liquidity: 909,299 (-90,701)
- Virtual NO liquidity: 1,099,750 (+99,750)

Real Money:
- Prize Pool: 99,750 (Alice's net contribution)
- Total YES shares issued: 90,701
- Total NO shares issued: 0
- Total volume: 100,000
- Fees collected: 250

New prices:
YES price = 1,099,750 ÷ (909,299 + 1,099,750) = 54.7%
NO price = 909,299 ÷ (909,299 + 1,099,750) = 45.3%
```

### Example 2: Another User Bets on NO

**Bob bets 50,000 on NO (after Alice's bet)**

**Current state before Bob's bet:**
```
YES liquidity: 909,299
NO liquidity: 1,099,750
k = 909,299 × 1,099,750 = 999,999,975,750
```

**Step 1: Calculate fees**
```
Platform fee = 50,000 × 25 ÷ 10,000 = 125
Net amount = 50,000 - 125 = 49,875
```

**Step 2: Calculate new liquidity**
```
New YES liquidity = 909,299 + 49,875 = 959,174
New NO liquidity = k ÷ New YES liquidity = 999,999,975,750 ÷ 959,174 = 1,042,553
```

**Step 3: Calculate shares received**
```
NO shares for Bob = Original NO liquidity - New NO liquidity
                  = 1,099,750 - 1,042,553 = 57,197 shares
```

**Step 4: Final market state**
```
Virtual AMM Liquidity (pricing):
- Virtual YES liquidity: 959,174
- Virtual NO liquidity: 1,042,553

Real Money:
- Prize Pool: 149,625 (99,750 + 49,875)
- Total YES shares issued: 90,701
- Total NO shares issued: 57,197
- Total volume: 150,000
- Fees collected: 375

Final prices:
YES price = 1,042,553 ÷ (959,174 + 1,042,553) = 52.1%
NO price = 959,174 ÷ (959,174 + 1,042,553) = 47.9%
```

### Example 3: User Sells Shares

**Charlie sells 20,000 YES shares (after Alice and Bob's bets)**

**Current state before Charlie's sell:**
```
Virtual AMM Liquidity: YES = 959,174, NO = 1,042,553
Prize Pool: 149,625
Total YES shares: 90,701
Total NO shares: 57,197
```

**Step 1: Calculate sell value**
```
Charlie wants to sell 20,000 YES shares
k = 959,174 × 1,042,553 = 999,999,975,122
New YES liquidity = 959,174 + 20,000 = 979,174
New NO liquidity = k ÷ 979,174 = 1,021,346

Gross payout = 1,042,553 - 1,021,346 = 21,207
Platform fee = 21,207 × 25 ÷ 10,000 = 53
Net payout to Charlie = 21,207 - 53 = 21,154
```

**Step 2: Updated market state after sell**
```
Virtual AMM Liquidity:
- Virtual YES liquidity: 979,174 (+20,000)
- Virtual NO liquidity: 1,021,346 (-21,207)

Real Money:
- Prize Pool: 128,471 (149,625 - 21,154)
- Total YES shares: 70,701 (90,701 - 20,000)
- Total NO shares: 57,197 (unchanged)
- Total fees collected: 428 (375 + 53)

New prices:
YES price = 1,021,346 ÷ (979,174 + 1,021,346) = 51.1%
NO price = 979,174 ÷ (979,174 + 1,021,346) = 48.9%
```

## Reward Calculation

### Scenario A: YES Wins (Bitcoin reaches $100K)

**Market resolves with outcome = YES (after Charlie's sell)**

**Alice's reward:**
```
Alice has 90,701 YES shares out of 70,701 total YES shares remaining
Total prize pool: 128,471 (after Charlie's sell)
Alice's payout = (90,701 ÷ 70,701) × 128,471 = 164,851
Alice's profit = 164,851 - 100,000 = 64,851
Return rate = 164,851 ÷ 100,000 = 164.9%
```

**Bob's reward:**
```
Bob has 57,197 NO shares
NO shares are worthless when YES wins
Bob's payout = 0
Bob's loss = 50,000 (total loss)
```

**Charlie's result:**
```
Charlie sold 20,000 YES shares for 21,154 tokens
If he had held until YES wins: (20,000 ÷ 70,701) × 128,471 = 36,346
Charlie's opportunity cost = 36,346 - 21,154 = 15,192 (missed profit)
```

### Scenario B: NO Wins (Bitcoin doesn't reach $100K)

**Market resolves with outcome = NO (after Charlie's sell)**

**Alice's reward:**
```
Alice has 90,701 YES shares
YES shares are worthless when NO wins
Alice's payout = 0
Alice's loss = 100,000 (total loss)
```

**Bob's reward:**
```
Bob has 57,197 NO shares out of 57,197 total NO shares
Total prize pool: 128,471 (after Charlie's sell)
Bob's payout = (57,197 ÷ 57,197) × 128,471 = 128,471 (gets entire prize pool)
Bob's profit = 128,471 - 50,000 = 78,471
Return rate = 128,471 ÷ 50,000 = 256.9%
```

**Charlie's result:**
```
Charlie sold 20,000 YES shares for 21,154 tokens
If NO wins, his YES shares would be worthless
Charlie's smart move: avoided 20,000 × (original cost per share) loss
Charlie's gain from selling = 21,154 (vs 0 if held to resolution)
```

## Key Insights

### 1. Price Impact
Larger bets cause bigger price movements:
- Alice's 100,000 bet moved YES price from 50% to 54.7%
- Bob's 50,000 bet moved NO price from 45.3% to 47.9%
- Charlie's 20,000 share sell moved YES price from 52.1% to 51.1%

### 2. Effective Price Paid/Received
```
Alice's effective price = 100,000 ÷ 90,701 = 1.102 per YES share
Bob's effective price = 50,000 ÷ 57,197 = 0.874 per NO share
Charlie's effective sell price = 21,154 ÷ 20,000 = 1.058 per YES share
```

### 3. Sell vs Hold Strategy
```
Charlie's sell analysis:
- Sold 20,000 YES shares for 21,154 tokens (1.058 per share)
- If YES wins: missed 36,346 payout (opportunity cost: 15,192)
- If NO wins: saved from total loss (gain: 21,154 vs 0)
- Break-even: Charlie profits if YES probability < 58.1%
```

### 4. Risk/Reward Analysis (After Charlie's sell)
```
For Alice (YES bettor):
- Risk: 100,000 (100% of bet)
- Max reward: 164,851 (if YES wins, higher due to fewer total shares)
- Actual reward depends on remaining YES shares

For Bob (NO bettor):
- Risk: 50,000 (100% of bet)  
- Max reward: 128,471 (if NO wins, lower due to reduced prize pool)
- Gets entire remaining prize pool if NO wins

For Charlie (seller):
- Guaranteed: 21,154 (locked in profit/loss mitigation)
- No further exposure to market outcome
```

### 5. Prize Pool Distribution (After Sells)
```
Remaining Prize Pool: 128,471 (reduced by sell payouts)
- If YES wins: All 128,471 distributed among remaining 70,701 YES shares
- If NO wins: All 128,471 distributed among 57,197 NO shares
- Selling reduces total prize pool but increases payout per remaining share
```

### 6. Liquidity and Slippage
```
Selling shares provides exit liquidity but affects pricing:
- Large sells move prices against the seller
- Charlie's 20,000 share sell reduced YES price by 1%
- AMM ensures continuous liquidity for both buying and selling
```

## AMM Advantages

1. **Continuous Liquidity**: Always possible to buy/sell shares
2. **Price Discovery**: Prices reflect supply/demand automatically
3. **No Counterparty Risk**: No need to match with other users
4. **Proportional Slippage**: Larger bets pay higher effective prices

## Platform Economics

```
Total bets: 150,000
Platform fees collected: 375 (0.25%)
Prize pool (user funds): 149,625 (99.75% of bets)
Virtual liquidity (protocol): 2,000,000 (not real money, just for pricing)

Total shares issued: 90,701 + 57,197 = 147,898
Prize pool per share: 149,625 ÷ 147,898 ≈ 1.01 average value
```

## Key Advantages of Prize Pool Model

1. **Fair Distribution**: All user funds go to winners, minus small platform fee
2. **No Protocol Risk**: Protocol doesn't need to hold reserves for payouts  
3. **Clear Accounting**: Prize pool = sum of all net bets
4. **Proportional Rewards**: Larger shareholders get proportionally larger rewards
5. **AMM Pricing**: Efficient price discovery without liquidity provision burden

This model ensures that user tokens actually enter the system as a prize pool, making the reward mechanism transparent and fair. 