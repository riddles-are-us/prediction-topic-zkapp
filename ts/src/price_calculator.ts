/**
 * AMM价格反推计算器
 * 计算需要多少token投注才能达到目标价格
 */

interface LiquidityState {
    yesLiquidity: bigint;
    noLiquidity: bigint;
}

interface PriceCalculationResult {
    targetPrice: number;
    requiredBetAmount: bigint;
    netBetAmount: bigint;
    fee: bigint;
    newYesLiquidity: bigint;
    newNoLiquidity: bigint;
    actualPrice: number;
}

export class AMMPriceCalculator {
    private static readonly FEE_RATE = 0.01; // 1%
    private static readonly INITIAL_YES_LIQUIDITY = 100000n;
    private static readonly INITIAL_NO_LIQUIDITY = 100000n;

    /**
     * 计算当前价格
     */
    static calculateCurrentPrice(yesLiquidity: bigint, noLiquidity: bigint): number {
        const totalLiquidity = yesLiquidity + noLiquidity;
        if (totalLiquidity === 0n) return 0.5;
        
        return Number(noLiquidity) / Number(totalLiquidity);
    }

    /**
     * 反推计算：需要多少YES投注才能达到目标价格
     * 
     * 公式推导：
     * 目标价格 = 新NO流动性 / (新YES流动性 + 新NO流动性)
     * 设投注净额为 x，则：
     * 新NO流动性 = 原NO流动性 + x
     * 新YES流动性 = k / 新NO流动性 = (原YES * 原NO) / (原NO + x)
     * 
     * target_price = (原NO + x) / ((原YES * 原NO) / (原NO + x) + 原NO + x)
     * 
     * 解这个方程求 x
     */
    static calculateRequiredYesBet(
        currentYesLiquidity: bigint,
        currentNoLiquidity: bigint,
        targetPrice: number
    ): PriceCalculationResult {
        const k = currentYesLiquidity * currentNoLiquidity;
        const currentYes = Number(currentYesLiquidity);
        const currentNo = Number(currentNoLiquidity);
        
        // 根据目标价格反推所需的新流动性分布
        // target_price = newNo / (newYes + newNo)
        // target_price = newNo / total
        // 因为 newYes * newNo = k (常数乘积)
        // 所以 newYes = k / newNo
        // target_price = newNo / (k/newNo + newNo) = newNo^2 / (k + newNo^2)
        // target_price * (k + newNo^2) = newNo^2
        // target_price * k + target_price * newNo^2 = newNo^2
        // target_price * k = newNo^2 * (1 - target_price)
        // newNo^2 = (target_price * k) / (1 - target_price)
        // newNo = sqrt((target_price * k) / (1 - target_price))

        const kNum = Number(k);
        const newNoSquared = (targetPrice * kNum) / (1 - targetPrice);
        const newNo = Math.sqrt(newNoSquared);
        const newYes = kNum / newNo;

        // 计算需要的净投注额
        const netBetAmount = BigInt(Math.round(newNo - currentNo));
        
        // 考虑手续费，反推总投注额
        // net_amount = total_amount * (1 - fee_rate)
        // total_amount = net_amount / (1 - fee_rate)
        const totalBetAmount = BigInt(Math.round(Number(netBetAmount) / (1 - this.FEE_RATE)));
        const fee = totalBetAmount - netBetAmount;

        // 验证计算结果
        const actualNewYes = BigInt(Math.round(newYes));
        const actualNewNo = BigInt(Math.round(newNo));
        const actualPrice = this.calculateCurrentPrice(actualNewYes, actualNewNo);

        return {
            targetPrice,
            requiredBetAmount: totalBetAmount,
            netBetAmount,
            fee,
            newYesLiquidity: actualNewYes,
            newNoLiquidity: actualNewNo,
            actualPrice
        };
    }

    /**
     * 计算达到多个目标价格所需的投注
     */
    static calculateMultipleTargets(
        currentYesLiquidity: bigint = this.INITIAL_YES_LIQUIDITY,
        currentNoLiquidity: bigint = this.INITIAL_NO_LIQUIDITY,
        targetPrices: number[] = [0.6, 0.7, 0.8, 0.9]
    ): PriceCalculationResult[] {
        return targetPrices.map(price => 
            this.calculateRequiredYesBet(currentYesLiquidity, currentNoLiquidity, price)
        );
    }

    /**
     * 格式化显示结果
     */
    static formatResults(results: PriceCalculationResult[]): string {
        let output = "\n=== AMM价格推动计算结果 ===\n";
        output += "初始状态: YES=1,000,000, NO=1,000,000, 当前价格=50%\n\n";
        
        results.forEach((result, index) => {
            const targetPercent = (result.targetPrice * 100).toFixed(0);
            const actualPercent = (result.actualPrice * 100).toFixed(1);
            
            output += `📊 推动到 ${targetPercent}%:\n`;
            output += `   需要投注: ${result.requiredBetAmount.toLocaleString()} 代币\n`;
            output += `   净投注额: ${result.netBetAmount.toLocaleString()} 代币\n`;
            output += `   手续费: ${result.fee.toLocaleString()} 代币\n`;
            output += `   新流动性: YES=${result.newYesLiquidity.toLocaleString()}, NO=${result.newNoLiquidity.toLocaleString()}\n`;
            output += `   实际价格: ${actualPercent}%\n\n`;
        });

        return output;
    }

    /**
     * 计算累积投注效果（连续投注）
     */
    static calculateCumulativeEffect(targetPrices: number[]): {
        individual: PriceCalculationResult[],
        cumulative: PriceCalculationResult[]
    } {
        // 单独投注效果（从初始状态）
        const individual = this.calculateMultipleTargets();

        // 累积投注效果（连续投注）
        const cumulative: PriceCalculationResult[] = [];
        let currentYes = this.INITIAL_YES_LIQUIDITY;
        let currentNo = this.INITIAL_NO_LIQUIDITY;

        for (const targetPrice of targetPrices) {
            const result = this.calculateRequiredYesBet(currentYes, currentNo, targetPrice);
            cumulative.push(result);
            
            // 更新流动性状态
            currentYes = result.newYesLiquidity;
            currentNo = result.newNoLiquidity;
        }

        return { individual, cumulative };
    }
}

// 执行计算并输出结果
export function calculatePriceTargets() {
    console.log("=== 单独投注效果（从初始状态50%开始） ===");
    const individualResults = AMMPriceCalculator.calculateMultipleTargets();
    console.log(AMMPriceCalculator.formatResults(individualResults));

    console.log("=== 累积投注效果（连续推动价格） ===");
    const { cumulative } = AMMPriceCalculator.calculateCumulativeEffect([0.6, 0.7, 0.8, 0.9]);
    
    let totalInvestment = 0n;
    let currentPrice = 50;
    
    cumulative.forEach((result, index) => {
        const targetPercent = (result.targetPrice * 100).toFixed(0);
        const fromPercent = currentPrice.toFixed(0);
        
        totalInvestment += result.requiredBetAmount;
        
        console.log(`📈 从 ${fromPercent}% 推动到 ${targetPercent}%:`);
        console.log(`   本次投注: ${result.requiredBetAmount.toLocaleString()} 代币`);
        console.log(`   累计投注: ${totalInvestment.toLocaleString()} 代币`);
        console.log(`   新流动性: YES=${result.newYesLiquidity.toLocaleString()}, NO=${result.newNoLiquidity.toLocaleString()}\n`);
        
        currentPrice = result.actualPrice * 100;
    });

    return { individual: individualResults, cumulative };
}

// 如果直接运行这个文件
if (typeof require !== 'undefined' && require.main === module) {
    calculatePriceTargets();
} 