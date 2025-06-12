import dotenv from 'dotenv';
import { PrivateKey, bnToHexLe } from "delphinus-curves/src/altjubjub";
import { PlayerConvention, ZKWasmAppRpc, createCommand } from 'zkwasm-minirollup-rpc';
import { LeHexBN } from "zkwasm-ts-server";

dotenv.config();

// Command constants
const DEPOSIT = 3;
const INSTALL_PLAYER = 1;

class Player extends PlayerConvention {
    constructor(key: string, rpc: ZKWasmAppRpc) {
        super(key, rpc, BigInt(DEPOSIT), BigInt(2)); // WITHDRAW = 2
        this.processingKey = key;
        this.rpc = rpc;
    }

    async sendTransactionWithCommand(cmd: BigUint64Array) {
        try {
            let result = await this.rpc.sendTransaction(cmd, this.processingKey);
            return result;
        } catch (e) {
            if (e instanceof Error) {
                console.log(e.message);
            }
            throw e;
        }
    }

    async installPlayer() {
        try {
            let cmd = createCommand(0n, BigInt(INSTALL_PLAYER), []);
            return await this.sendTransactionWithCommand(cmd);
        } catch (e) {
            if (e instanceof Error && e.message === "PlayerAlreadyExists") {
                console.log("Player already exists, skipping installation");
                return null;
            }
            throw e;
        }
    }

    async depositFunds(amount: bigint, targetPid1: bigint, targetPid2: bigint) {
        let nonce = await this.getNonce();
        let cmd = createCommand(nonce, BigInt(DEPOSIT), [targetPid1, targetPid2, 0n, amount]);
        return await this.sendTransactionWithCommand(cmd);
    }
}

async function adminDeposit() {
    console.log("=== Admin Deposit Script ===");
    
    const rpc = new ZKWasmAppRpc("http://localhost:3000");
    
    // 使用环境变量获取 admin key
    const adminKey = process.env.SERVER_ADMIN_KEY;
    if (!adminKey) {
        throw new Error("SERVER_ADMIN_KEY environment variable is required");
    }
    
    console.log("Admin key from env:", adminKey);
    
    try {
        // 创建 admin 实例
        const admin = new Player(adminKey, rpc);
        
        // 确保 admin 已安装
        await admin.installPlayer();
        console.log("Admin installation checked");
        
        // 目标 PID
        const targetPid1 = 9702256456334647944n;
        const targetPid2 = 5605797091113630749n;
        const depositAmount = 10000n;
        
        console.log(`Depositing ${depositAmount} to PID: ${targetPid1}, ${targetPid2}`);
        
        // 执行充值
        await admin.depositFunds(depositAmount, targetPid1, targetPid2);
        console.log("✅ Deposit successful!");
        
    } catch (error) {
        console.error("❌ Deposit failed:", error);
        if (error instanceof Error) {
            console.error("Error message:", error.message);
        }
    }
}

// 运行脚本
adminDeposit();