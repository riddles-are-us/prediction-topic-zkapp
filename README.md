# Prediction Market

一个基于zkWasm的简单预测市场应用，专注于单个话题的预测。

## 功能特性

- **单一预测市场**: 专注于一个预测话题 - "比特币是否会在2024年底达到$100,000"
- **AMM算法**: 使用自动做市商算法进行价格发现和流动性管理
- **Yes/No投注**: 用户可以购买Yes或No份额
- **时间管理**: 设定市场开始、结束和解决时间
- **自动结算**: 市场解决后用户可以领取奖励
- **充值/提现**: 管理员可为玩家充值，玩家可提现资金
- **事件系统**: 实时事件通知和状态同步

## 技术架构

### Rust后端 (src/)
- `lib.rs`: 应用入口点，创建zkwasm API
- `config.rs`: 配置和常量定义
- `error.rs`: 错误代码定义
- `event.rs`: 事件系统实现
- `command.rs`: 命令结构和处理逻辑
- `player.rs`: 玩家数据结构和操作
- `market.rs`: 预测市场核心逻辑和AMM算法
- `settlement.rs`: 提现结算系统
- `state.rs`: 全局状态管理和交易处理

### TypeScript服务端 (ts/)
- `src/service.ts`: 主服务文件，处理事件和API
- `src/models.ts`: 数据模型和MongoDB集成
- `src/api.ts`: API客户端和交易构建工具
- `src/test.ts`: 测试脚本

## AMM算法

使用恒定乘积公式 (x * y = k) 进行自动做市：
- 初始流动性：Yes = 1,000,000, No = 1,000,000
- 价格计算：Yes价格 = No流动性 / (Yes流动性 + No流动性)
- 平台费用：0.25%

## API端点

- `GET /data/market` - 获取市场信息
- `GET /data/player/:pid1/:pid2` - 获取玩家信息
- `GET /data/bets` - 获取所有投注记录
- `GET /data/bets/:pid1/:pid2` - 获取特定玩家的投注记录
- `GET /data/stats` - 获取市场统计信息

## 交易命令

| 命令ID | 命令名称 | 参数 | 权限 |
|--------|----------|------|------|
| 0 | TICK | 无 | 管理员 |
| 1 | INSTALL_PLAYER | 无 | 任何用户 |
| 2 | WITHDRAW | amount, address_high, address_low | 玩家 |
| 3 | DEPOSIT | target_pid1, target_pid2, amount | 管理员 |
| 4 | BET | bet_type (0=NO, 1=YES), amount | 玩家 |
| 5 | RESOLVE | outcome (0=NO, 1=YES) | 管理员 |
| 6 | CLAIM | 无 | 玩家 |

## 事件类型

| 事件ID | 事件名称 | 数据 |
|--------|----------|------|
| 1 | PLAYER_UPDATE | pid1, pid2, balance, yes_shares, no_shares, claimed |
| 2 | MARKET_UPDATE | yes_liquidity, no_liquidity, total_volume, resolved, outcome, fees |
| 3 | BET_UPDATE | pid1, pid2, bet_type, amount, shares |

## 交易构建工具

TypeScript API提供便捷的交易构建函数：

```typescript
import { 
    buildBetTransaction, 
    buildResolveTransaction, 
    buildClaimTransaction,
    buildWithdrawTransaction,
    buildDepositTransaction 
} from './api.js';

// 下注交易
const betTx = buildBetTransaction(nonce, 1, 1000n); // YES bet, 1000 units

// 解决市场交易 (管理员)
const resolveTx = buildResolveTransaction(nonce, true); // YES outcome

// 领取奖励交易
const claimTx = buildClaimTransaction(nonce);

// 提现交易
const withdrawTx = buildWithdrawTransaction(nonce, 1000n, 0n, 0n);

// 充值交易 (管理员)
const depositTx = buildDepositTransaction(nonce, pid1, pid2, 1000n);
```

## 构建和运行

```bash
# 构建Rust代码
make build

# 运行TypeScript服务
cd ts
npm install
npm run build
npm start

# 清理
make clean
```

## 项目特点

- **标准化架构**: 遵循zkwasm项目最佳实践
- **简化充值/提现**: 使用标准Withdraw/Deposit命令结构
- **事件驱动**: 完整的事件系统支持实时更新
- **类型安全**: TypeScript接口确保类型安全
- **易于维护**: 模块化设计，职责分离
- **完整功能**: 包含投注、AMM定价、充值/提现、市场解决和奖励领取

## 市场生命周期

1. **初始化**: 系统启动时自动创建预设市场（counter = 0）
2. **充值阶段**: 管理员为玩家充值资金
3. **活跃期**: 用户可以购买Yes/No份额
4. **结束期**: 停止接受新投注
5. **解决期**: 管理员设置最终结果
6. **领取期**: 获胜方用户领取奖励
7. **提现期**: 用户可以提现剩余资金

## 配置系统

### 市场配置（src/config.rs）

可以在 `config.rs` 中自定义默认市场参数：

```rust
pub static ref DEFAULT_MARKET: DefaultMarketConfig = DefaultMarketConfig {
    title: "Bitcoin $100K by 2024",
    description: "Will Bitcoin reach $100,000 USD by December 31, 2024?",
    start_time: 0,      // 立即开始
    end_time: 17280,    // 1天后结束
    resolution_time: 17280, // 解决时间
};
```

> 📖 详细的配置示例请参考 [config_examples.md](config_examples.md)

### 时间系统

- **计时单位**: 基于 counter 值，每个 tick = 5 秒
- **时间换算常量**:
  - `TICKS_PER_MINUTE = 12`
  - `TICKS_PER_HOUR = 720` 
  - `TICKS_PER_DAY = 17280`

### 时间配置示例

```rust
// 1小时市场
end_time: TICKS_PER_HOUR,

// 12小时市场  
end_time: TICKS_PER_HOUR * 12,

// 3天市场
end_time: TICKS_PER_DAY * 3,

// 自定义时间（30分钟）
end_time: DefaultMarketConfig::seconds_to_ticks(1800),
```

## 错误代码

| 错误码 | 错误名称 | 描述 |
|--------|----------|------|
| ERROR_INVALID_BET_AMOUNT | InvalidBetAmount | 无效的投注金额 |
| ERROR_MARKET_NOT_ACTIVE | MarketNotActive | 市场未激活 |
| ERROR_MARKET_NOT_RESOLVED | MarketNotResolved | 市场未解决 |
| ERROR_INSUFFICIENT_BALANCE | InsufficientBalance | 余额不足 |
| ERROR_ALREADY_CLAIMED | AlreadyClaimed | 已经领取过奖励 |
| ERROR_PLAYER_NOT_EXIST | PlayerNotExist | 玩家不存在 |

市场解决后，应用完成其生命周期。 