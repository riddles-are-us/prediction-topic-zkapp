# AMM 和价格计算安全审计报告

## 🚨 严重安全漏洞发现

经过详细审计，发现多个**严重的溢出风险和安全漏洞**，需要立即修复。

## 1. 乘法溢出风险 (CRITICAL)

### 漏洞位置：
```rust
// market.rs:87 - 常量乘积计算
let k = self.yes_liquidity * self.no_liquidity;

// market.rs:175 - 价格计算
(bet_amount * PRICE_PRECISION) / shares

// market.rs:425 - 奖金计算  
(yes_shares * self.prize_pool) / self.total_yes_shares
```

### 风险分析：
- `yes_liquidity` 和 `no_liquidity` 都是 `u64` 类型
- 最大值：18,446,744,073,709,551,615 
- 两个大数相乘可能导致溢出：例如 `10^10 * 10^10 = 10^20` > `u64::MAX`
- **攻击场景**：恶意用户通过大额投注操纵流动性，触发溢出导致程序panic

### 具体示例：
```rust
// 危险情况：
let yes_liquidity = 5_000_000_000_u64;  // 50亿
let no_liquidity = 5_000_000_000_u64;   // 50亿
let k = yes_liquidity * no_liquidity;   // 25 * 10^18 > u64::MAX (溢出!)
```

## 2. 除零错误风险 (HIGH)

### 漏洞位置：
```rust
// market.rs:90 - AMM计算中的除法
self.yes_liquidity = k / self.no_liquidity;

// market.rs:178 - 价格计算
(bet_amount * PRICE_PRECISION) / shares
```

### 风险分析：
- 如果 `no_liquidity` 或 `yes_liquidity` 变为0，会导致除零panic
- 如果 `shares` 计算结果为0，价格计算会panic
- **攻击场景**：通过特殊交易序列使流动性降至0

## 3. 下溢风险 (HIGH)

### 漏洞位置：
```rust
// market.rs:92 - 减法下溢
self.yes_liquidity - new_yes_liquidity

// market.rs:287 - 费用计算下溢
let net_amount = bet_amount - fee;

// market.rs:359 - 奖池减法下溢
self.prize_pool -= payout;
```

### 风险分析：
- 如果 `new_yes_liquidity > self.yes_liquidity`，减法会panic
- 如果 `fee > bet_amount`，会导致下溢
- 虽然有部分检查，但不完整

## 4. 精度丢失风险 (MEDIUM)

### 漏洞位置：
```rust
// market.rs:175 - 整数除法精度丢失
(bet_amount * PRICE_PRECISION) / shares

// market.rs:425 - 奖金分配精度丢失
(yes_shares * self.prize_pool) / self.total_yes_shares
```

### 风险分析：
- 整数除法会丢失小数部分
- 可能导致价值损失，特别是在小额交易中
- 累积效应可能导致资金不平衡

## 5. 重入攻击风险 (MEDIUM)

### 漏洞位置：
```rust
// market.rs:344 - sell_yes函数中的状态更新顺序
let payout = self.calculate_yes_sell_value(shares_to_sell);
// ... 多个检查 ...
// 状态更新分散在多个地方，存在不一致风险
```

### 风险分析：
- 状态更新不是原子性的
- 如果函数执行过程中失败，可能导致状态不一致

## 🛠️ 修复建议

### 1. 使用安全的数学运算

```rust
// 使用 checked_mul 和 checked_div
let k = self.yes_liquidity.checked_mul(self.no_liquidity)
    .ok_or(ERROR_OVERFLOW)?;

let new_yes_liquidity = k.checked_div(new_no_liquidity)
    .ok_or(ERROR_DIVISION_BY_ZERO)?;

// 使用 saturating_sub 防止下溢
let shares = self.yes_liquidity.saturating_sub(new_yes_liquidity);
```

### 2. 添加输入验证

```rust
// 添加最大值检查
const MAX_LIQUIDITY: u64 = 1_000_000_000_000; // 1万亿
const MAX_BET_AMOUNT: u64 = 100_000_000; // 1亿

if bet_amount > MAX_BET_AMOUNT {
    return Err(ERROR_BET_TOO_LARGE);
}
```

### 3. 使用更高精度类型

```rust
// 对于关键计算使用 u128
fn calculate_k_safe(yes_liquidity: u64, no_liquidity: u64) -> Result<u128, u32> {
    let k = (yes_liquidity as u128).checked_mul(no_liquidity as u128)
        .ok_or(ERROR_OVERFLOW)?;
    Ok(k)
}
```

### 4. 改进错误处理

```rust
// 定义更多具体的错误类型
pub const ERROR_OVERFLOW: u32 = 100;
pub const ERROR_DIVISION_BY_ZERO: u32 = 101;
pub const ERROR_UNDERFLOW: u32 = 102;
pub const ERROR_BET_TOO_LARGE: u32 = 103;
```

## 🔍 测试建议

### 边界值测试：
1. 测试最大 `u64` 值输入
2. 测试零值输入
3. 测试接近溢出的值
4. 测试极端的流动性比例

### 模糊测试：
1. 随机输入测试
2. 恶意输入序列测试
3. 状态一致性测试

## ⚠️ 风险等级

- **CRITICAL**: 乘法溢出 - 可能导致整个系统崩溃
- **HIGH**: 除零错误和下溢 - 可能导致交易失败或资金损失
- **MEDIUM**: 精度丢失和重入攻击 - 可能导致资金不平衡

## 📋 修复优先级

1. **立即修复**: 乘法溢出检查
2. **高优先级**: 除零和下溢检查  
3. **中优先级**: 精度改进和状态一致性
4. **后续优化**: 添加全面的测试套件

建议在部署到生产环境之前完成所有 CRITICAL 和 HIGH 等级漏洞的修复。 