import { Express } from "express";
import mongoose from 'mongoose';
import { Event, EventModel, Service, TxStateManager, TxWitness } from "zkwasm-ts-server";
import { merkleRootToBeHexString } from "zkwasm-ts-server/src/lib.js";
import { BetEvent, BetModel, MarketEvent, MarketModel, docToJSON } from "./models.js";

const service = new Service(eventCallback, batchedCallback, extra);
await service.initialize();

let txStateManager = new TxStateManager(merkleRootToBeHexString(service.merkleRoot));

function extra(app: Express) {
  // Fetch the market data event start from [timestamp] with limit
  app.get("/data/market/:timestamp", async (req: any, res) => {
    try {
      let limit = req.query.limit;
      if (!limit) {
          limit = 100;
      }
      let forward = req.query.forward ? true : false;
      // console.log("timestamp is", req.params.timestamp);
      // console.log("limit is", req.params.timestamp);
      let doc;
      if (forward) {
        // 向前查询：获取大于timestamp的数据，按counter升序排列
        doc = await MarketModel.find({ counter: { $gt: BigInt(req.params.timestamp) } })
            .sort({ counter: 1 })
            .limit(limit);
    }
    else {
        // 向后查询：获取小于等于timestamp的数据，按counter降序排列（最近的优先）
        doc = await MarketModel.find({ counter: { $lte: BigInt(req.params.timestamp) } })
            .sort({ counter: -1 })
            .limit(limit);
    }
      //doc = await MarketModel.find();
      let data = doc.map((d) => {
        return docToJSON(d);
      });
      res.status(201).send({
        success: true,
        data: data,
      });
    } catch (e) {
      console.log(e);
      res.status(500).send();
    }
  });

  app.get("/data/history/:pid1/:pid2", async (req: any, res) => {
    try {
      let pid1 = req.params.pid1;
      let pid2 = req.params.pid2;
      const skip = parseInt(req.query.skip) || 0;
      const limit = parseInt(req.query.limit) || 30;
      const [count, doc] = await Promise.all([
        BetModel.countDocuments({
          "pid": [pid1, pid2],
        }),
        BetModel.find({
          "pid": [pid1, pid2],
        })
          .skip(skip)
          .limit(limit),
      ]);

      let data = doc.map((d: mongoose.Document) => {
        return docToJSON(d);
      });
      res.status(201).send({
        success: true,
        data: data,
        count: count,
      });
    } catch (e) {
      console.log(e);
      res.status(500).send();
    }
  });

  // Get recent transactions (bet and sell activities)
  app.get("/data/recent/:count?", async (req: any, res) => {
    try {
      const count = parseInt(req.params.count) || 20; // 默认20笔交易
      const maxCount = 100; // 最大限制100笔
      const limitCount = Math.min(count, maxCount);
      
      // 查询最近的交易，按counter降序排列（最新的在前）
      const doc = await BetModel.find({})
        .sort({ counter: -1, index: -1 }) // 按counter和index降序排列
        .limit(limitCount);

      let data = doc.map((d: mongoose.Document) => {
        const transaction = docToJSON(d);
        // 添加交易类型标识
        if (transaction.betType >= 10) {
          transaction.transactionType = transaction.betType === 11 ? 'SELL_YES' : 'SELL_NO';
          transaction.originalBetType = transaction.betType - 10; // 恢复原始bet类型
        } else {
          transaction.transactionType = transaction.betType === 1 ? 'BET_YES' : 'BET_NO';
          transaction.originalBetType = transaction.betType;
        }
        return transaction;
      });

      res.status(200).send({
        success: true,
        data: data,
        count: data.length,
      });
    } catch (e) {
      console.log("Error fetching recent transactions:", e);
      res.status(500).send({
        success: false,
        error: "Failed to fetch recent transactions"
      });
    }
  });

    // All data is now accessed directly via RPC queries (rpc.queryState())
    // No HTTP API endpoints needed as data is fetched from blockchain state directly
}

service.serve();

const EVENT_MARKET_UPDATE = 2;
const EVENT_BET_UPDATE = 3;

async function batchedCallback(_arg: TxWitness[], _preMerkle: string, postMerkle: string) {
    await txStateManager.moveToCommit(postMerkle);
}

async function eventCallback(arg: TxWitness, data: BigUint64Array) {
    if (data.length == 0) {
        return;
    }

    console.log("eventCallback", arg, data);
    if (data[0] != 0n) {
        console.log("non-zero return, tx failed", data[0]);
        return;
    }
    if (data.length <= 2) {
        console.log("no event data");
        return;
    }

    let event = new Event(data[1], data);
    let doc = new EventModel({
        id: event.id.toString(),
        data: Buffer.from(event.data.buffer)
    });

    try {
        let result = await doc.save();
        if (!result) {
            console.log("failed to save event");
            throw new Error("save event to db failed");
        }
    } catch (e) {
        console.log(e);
        console.log("event ignored");
    }

    let i = 2; // start pos
    while (i < data.length) {
        let eventType = Number(data[i] >> 32n);
        let eventLength = data[i] & ((1n << 32n) - 1n);
        let eventData = data.slice(i + 1, i + 1 + Number(eventLength));
        console.log("event", eventType, eventLength, eventData);

        switch (eventType) {
            case EVENT_MARKET_UPDATE:
                {
                    console.log("market update event");
                    let market = MarketEvent.fromEvent(eventData);
                    let marketInfo = market.toObject();
                    await MarketModel.findOneAndUpdate({counter: marketInfo.counter}, marketInfo, { upsert: true });
                    console.log("saved market update", market);
                }
                break;
            case EVENT_BET_UPDATE:
                {
                    console.log("bet update event");
                    let bet = BetEvent.fromEvent(eventData);
                    let doc = new BetModel(bet.toObject());
                    await doc.save();
                    console.log("saved bet", bet);
                }
                break;
            default:
                console.log("unknown event");
                process.exit(1);
                //break;
        }
        i += 1 + Number(eventLength);
    }
} 
