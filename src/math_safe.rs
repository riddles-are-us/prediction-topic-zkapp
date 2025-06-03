use crate::error::*;
use crate::config::{PRICE_PRECISION, FEE_BASIS_POINTS, PLATFORM_FEE_RATE};

// 安全限制常量
pub const MAX_LIQUIDITY: u64 = 1_000_000_000_000;  // 1万亿 - 防止溢出
pub const MAX_BET_AMOUNT: u64 = 100_000_000;       // 1亿 - 合理的最大投注
pub const MIN_LIQUIDITY: u64 = 1000;               // 最小流动性 - 防止除零
pub const MAX_SHARES: u64 = 1_000_000_000;         // 最大份额数

/// 安全的乘法运算，检查溢出
pub fn safe_mul(a: u64, b: u64) -> Result<u64, u32> {
    a.checked_mul(b).ok_or(ERROR_OVERFLOW)
}

/// 安全的除法运算，检查除零
pub fn safe_div(a: u64, b: u64) -> Result<u64, u32> {
    if b == 0 {
        return Err(ERROR_DIVISION_BY_ZERO);
    }
    Ok(a / b)
}

/// 安全的减法运算，检查下溢
pub fn safe_sub(a: u64, b: u64) -> Result<u64, u32> {
    a.checked_sub(b).ok_or(ERROR_UNDERFLOW)
}

/// 安全的加法运算，检查溢出
pub fn safe_add(a: u64, b: u64) -> Result<u64, u32> {
    a.checked_add(b).ok_or(ERROR_OVERFLOW)
}

/// 使用 u128 进行高精度乘法，然后安全转换回 u64
pub fn safe_mul_high_precision(a: u64, b: u64) -> Result<u64, u32> {
    let result = (a as u128).checked_mul(b as u128)
        .ok_or(ERROR_OVERFLOW)?;
    
    if result > u64::MAX as u128 {
        return Err(ERROR_OVERFLOW);
    }
    
    Ok(result as u64)
}

/// 使用 u128 进行高精度除法计算
pub fn safe_div_high_precision(a: u64, b: u64, c: u64) -> Result<u64, u32> {
    if b == 0 || c == 0 {
        return Err(ERROR_DIVISION_BY_ZERO);
    }
    
    let numerator = (a as u128).checked_mul(b as u128)
        .ok_or(ERROR_OVERFLOW)?;
    
    let result = numerator / (c as u128);
    
    if result > u64::MAX as u128 {
        return Err(ERROR_OVERFLOW);
    }
    
    Ok(result as u64)
}

/// 安全计算 AMM 常量乘积 k = x * y
pub fn calculate_k_safe(yes_liquidity: u64, no_liquidity: u64) -> Result<u128, u32> {
    // 输入验证
    if yes_liquidity > MAX_LIQUIDITY || no_liquidity > MAX_LIQUIDITY {
        return Err(ERROR_LIQUIDITY_TOO_HIGH);
    }
    
    if yes_liquidity < MIN_LIQUIDITY || no_liquidity < MIN_LIQUIDITY {
        return Err(ERROR_INVALID_CALCULATION);
    }
    
    // 使用 u128 防止溢出
    let k = (yes_liquidity as u128).checked_mul(no_liquidity as u128)
        .ok_or(ERROR_OVERFLOW)?;
    
    Ok(k)
}

/// 安全计算新的流动性值
pub fn calculate_new_liquidity_safe(k: u128, other_liquidity: u64) -> Result<u64, u32> {
    if other_liquidity == 0 {
        return Err(ERROR_DIVISION_BY_ZERO);
    }
    
    let new_liquidity = k / (other_liquidity as u128);
    
    if new_liquidity > u64::MAX as u128 {
        return Err(ERROR_OVERFLOW);
    }
    
    let result = new_liquidity as u64;
    
    // 确保结果不会太小或太大
    if result < MIN_LIQUIDITY || result > MAX_LIQUIDITY {
        return Err(ERROR_INVALID_CALCULATION);
    }
    
    Ok(result)
}

/// 安全计算平台费用
pub fn calculate_fee_safe(amount: u64) -> Result<u64, u32> {
    if amount > MAX_BET_AMOUNT {
        return Err(ERROR_BET_TOO_LARGE);
    }
    
    safe_div_high_precision(amount, PLATFORM_FEE_RATE, FEE_BASIS_POINTS)
}

/// 安全计算净金额（扣除费用后）
pub fn calculate_net_amount_safe(bet_amount: u64) -> Result<u64, u32> {
    let fee = calculate_fee_safe(bet_amount)?;
    safe_sub(bet_amount, fee)
}

/// 安全计算价格（防止精度丢失）
pub fn calculate_price_safe(numerator: u64, denominator: u64) -> Result<u64, u32> {
    if denominator == 0 {
        return Ok(PRICE_PRECISION / 2); // 50% 默认价格
    }
    
    safe_div_high_precision(numerator, PRICE_PRECISION, denominator)
}

/// 安全计算有效买入价格
pub fn calculate_effective_price_safe(bet_amount: u64, shares: u64) -> Result<u64, u32> {
    if shares == 0 {
        return Ok(0);
    }
    
    safe_div_high_precision(bet_amount, PRICE_PRECISION, shares)
}

/// 验证输入参数的安全性
pub fn validate_bet_amount(bet_amount: u64) -> Result<(), u32> {
    if bet_amount == 0 {
        return Err(ERROR_INVALID_BET_AMOUNT);
    }
    
    if bet_amount > MAX_BET_AMOUNT {
        return Err(ERROR_BET_TOO_LARGE);
    }
    
    Ok(())
}

/// 验证份额数量的安全性
pub fn validate_shares(shares: u64) -> Result<(), u32> {
    if shares == 0 {
        return Err(ERROR_INVALID_BET_AMOUNT);
    }
    
    if shares > MAX_SHARES {
        return Err(ERROR_BET_TOO_LARGE);
    }
    
    Ok(())
}

/// 验证流动性的安全性
pub fn validate_liquidity(liquidity: u64) -> Result<(), u32> {
    if liquidity < MIN_LIQUIDITY {
        return Err(ERROR_INVALID_CALCULATION);
    }
    
    if liquidity > MAX_LIQUIDITY {
        return Err(ERROR_LIQUIDITY_TOO_HIGH);
    }
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_safe_mul_overflow() {
        let result = safe_mul(u64::MAX, 2);
        assert_eq!(result, Err(ERROR_OVERFLOW));
    }

    #[test]
    fn test_safe_div_zero() {
        let result = safe_div(100, 0);
        assert_eq!(result, Err(ERROR_DIVISION_BY_ZERO));
    }

    #[test]
    fn test_safe_sub_underflow() {
        let result = safe_sub(5, 10);
        assert_eq!(result, Err(ERROR_UNDERFLOW));
    }

    #[test]
    fn test_calculate_k_safe_normal() {
        let result = calculate_k_safe(1000000, 1000000);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 1000000000000u128);
    }

    #[test]
    fn test_calculate_k_safe_overflow() {
        let result = calculate_k_safe(MAX_LIQUIDITY + 1, MAX_LIQUIDITY);
        assert_eq!(result, Err(ERROR_LIQUIDITY_TOO_HIGH));
    }

    #[test]
    fn test_validate_bet_amount() {
        assert!(validate_bet_amount(1000).is_ok());
        assert_eq!(validate_bet_amount(0), Err(ERROR_INVALID_BET_AMOUNT));
        assert_eq!(validate_bet_amount(MAX_BET_AMOUNT + 1), Err(ERROR_BET_TOO_LARGE));
    }
} 