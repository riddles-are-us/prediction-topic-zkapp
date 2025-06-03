# 市场配置示例

本文档展示如何在 `src/config.rs` 中自定义不同类型的预测市场。

## 基本配置结构

```rust
pub static ref DEFAULT_MARKET: DefaultMarketConfig = DefaultMarketConfig {
    title: "市场标题",
    description: "市场描述",
    start_time: 开始时间（tick数）,
    end_time: 结束时间（tick数）,
    resolution_time: 解决时间（tick数）,
};
```

## 时间换算参考

- 1 tick = 5 秒
- 1 分钟 = 12 ticks
- 1 小时 = 720 ticks  
- 1 天 = 17280 ticks
- 1 周 = 120960 ticks

## 配置示例

### 1. 短期市场（1小时）

```rust
pub static ref DEFAULT_MARKET: DefaultMarketConfig = DefaultMarketConfig {
    title: "BTC 1小时涨跌",
    description: "Bitcoin价格在接下来1小时内会上涨吗？",
    start_time: 0,
    end_time: TICKS_PER_HOUR,        // 720 ticks
    resolution_time: TICKS_PER_HOUR,
};
```

### 2. 中期市场（1天，默认配置）

```rust
pub static ref DEFAULT_MARKET: DefaultMarketConfig = DefaultMarketConfig {
    title: "Bitcoin $100K by 2024",
    description: "Will Bitcoin reach $100,000 USD by December 31, 2024?",
    start_time: 0,
    end_time: TICKS_PER_DAY,         // 17280 ticks
    resolution_time: TICKS_PER_DAY,
};
```

### 3. 长期市场（1周）

```rust
pub static ref DEFAULT_MARKET: DefaultMarketConfig = DefaultMarketConfig {
    title: "ETH 2.0 完全启动",
    description: "以太坊2.0会在一周内完全启动吗？",
    start_time: 0,
    end_time: TICKS_PER_DAY * 7,     // 120960 ticks
    resolution_time: TICKS_PER_DAY * 7,
};
```

### 4. 延迟解决市场

```rust
pub static ref DEFAULT_MARKET: DefaultMarketConfig = DefaultMarketConfig {
    title: "股市收盘预测",
    description: "今日股市收盘会上涨吗？",
    start_time: 0,
    end_time: TICKS_PER_HOUR * 8,        // 8小时后停止投注
    resolution_time: TICKS_PER_HOUR * 10, // 10小时后才能解决
};
```

### 5. 自定义时间市场

```rust
pub static ref DEFAULT_MARKET: DefaultMarketConfig = DefaultMarketConfig {
    title: "30分钟快速预测",
    description: "接下来30分钟内会发生X事件吗？",
    start_time: 0,
    end_time: DefaultMarketConfig::seconds_to_ticks(1800), // 30分钟 = 1800秒
    resolution_time: DefaultMarketConfig::seconds_to_ticks(1800),
};
```

## 实用工具函数

在 `DefaultMarketConfig` 中提供了时间转换工具：

```rust
// 秒转tick
let ticks = DefaultMarketConfig::seconds_to_ticks(3600); // 1小时

// tick转秒  
let seconds = DefaultMarketConfig::ticks_to_seconds(720); // 720 ticks = 3600秒

// 获取市场持续时间
let duration_ticks = DEFAULT_MARKET.duration_ticks();
let duration_seconds = DEFAULT_MARKET.duration_seconds();
```

## 修改配置步骤

1. 编辑 `src/config.rs` 中的 `DEFAULT_MARKET` 配置
2. 重新编译: `make build`
3. 重启应用 `make run`

## 注意事项

- `start_time` 通常设为 0（系统启动时立即开始）
- `end_time` 必须大于 `start_time`
- `resolution_time` 必须大于等于 `end_time`
- 时间单位统一使用 tick（5秒为1个tick）
- 建议使用预定义的时间常量（`TICKS_PER_HOUR` 等）以提高可读性 