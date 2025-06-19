import { Express } from "express";
import mongoose from 'mongoose';
import { Event, EventModel, Service, TxStateManager, TxWitness } from "zkwasm-ts-server";
import { merkleRootToBeHexString } from "zkwasm-ts-server/src/lib.js";
import { BetEvent, BetModel, MarketEvent, MarketModel, PlayerMarketPositionModel, docToJSON, u64ArrayToString } from "./models.js";

const service = new Service(eventCallback, batchedCallback, extra);
await service.initialize();

let txStateManager = new TxStateManager(merkleRootToBeHexString(service.merkleRoot));

function extra(app: Express) {
  // Get all markets
  app.get("/data/markets", async (req: any, res) => {
    try {
      const doc = await MarketModel.find({}).sort({ marketId: 1 });
      let data = doc.map((d) => {
        const market = docToJSON(d);
        // Convert title from u64 array if needed
        if (market.titleU64) {
          market.title = u64ArrayToString(market.titleU64);
        }
        return market;
      });
      res.status(200).send({
        success: true,
        data: data,
      });
    } catch (e) {
      console.log("Error fetching markets:", e);
      res.status(500).send({
        success: false,
        error: "Failed to fetch markets"
      });
    }
  });

  // Get specific market by ID
  app.get("/data/market/:marketId", async (req: any, res) => {
    try {
      const marketId = BigInt(req.params.marketId);
      const doc = await MarketModel.findOne({ marketId });
      
      if (!doc) {
        res.status(404).send({
          success: false,
          error: "Market not found"
        });
        return;
      }
      
      const market = docToJSON(doc);
      // Convert title from u64 array if needed
      if (market.titleU64) {
        market.title = u64ArrayToString(market.titleU64);
      }
      
      res.status(200).send({
        success: true,
        data: market,
      });
    } catch (e) {
      console.log("Error fetching market:", e);
      res.status(500).send({
        success: false,
        error: "Failed to fetch market"
      });
    }
  });

  // Get recent 20 transactions for specific market
  app.get("/data/market/:marketId/recent", async (req: any, res) => {
    try {
      const marketId = BigInt(req.params.marketId);
      
      const doc = await BetModel.find({ marketId })
        .sort({ counter: -1, index: -1 })
        .limit(20);

      let data = doc.map((d: mongoose.Document) => {
        const transaction = docToJSON(d);
        // Add transaction type
        if (transaction.betType >= 10) {
          transaction.transactionType = transaction.betType === 11 ? 'SELL_YES' : 'SELL_NO';
          transaction.originalBetType = transaction.betType - 10;
        } else {
          transaction.transactionType = transaction.betType === 1 ? 'BET_YES' : 'BET_NO';
          transaction.originalBetType = transaction.betType;
        }
        return transaction;
      });
      
      res.status(200).send({
        success: true,
        data: data,
      });
    } catch (e) {
      console.log("Error fetching market recent transactions:", e);
      res.status(500).send({
        success: false,
        error: "Failed to fetch market recent transactions"
      });
    }
  });

  // Get player's recent 20 transactions across all markets
  app.get("/data/player/:pid1/:pid2/recent", async (req: any, res) => {
    try {
      const pid1 = BigInt(req.params.pid1);
      const pid2 = BigInt(req.params.pid2);
      
      const doc = await BetModel.find({
        pid: [pid1, pid2],
      })
        .sort({ counter: -1, index: -1 })
        .limit(20);

      let data = doc.map((d: mongoose.Document) => {
        const transaction = docToJSON(d);
        // Add transaction type
        if (transaction.betType >= 10) {
          transaction.transactionType = transaction.betType === 11 ? 'SELL_YES' : 'SELL_NO';
          transaction.originalBetType = transaction.betType - 10;
        } else {
          transaction.transactionType = transaction.betType === 1 ? 'BET_YES' : 'BET_NO';
          transaction.originalBetType = transaction.betType;
        }
        return transaction;
      });
      
      res.status(200).send({
        success: true,
        data: data,
      });
    } catch (e) {
      console.log("Error fetching player recent transactions:", e);
      res.status(500).send({
        success: false,
        error: "Failed to fetch player recent transactions"
      });
    }
  });

  // Get player's recent 20 transactions for specific market
  app.get("/data/player/:pid1/:pid2/market/:marketId/recent", async (req: any, res) => {
    try {
      const pid1 = BigInt(req.params.pid1);
      const pid2 = BigInt(req.params.pid2);
      const marketId = BigInt(req.params.marketId);
      
      const doc = await BetModel.find({
        pid: [pid1, pid2],
        marketId: marketId
      })
        .sort({ counter: -1, index: -1 })
        .limit(20);

      let data = doc.map((d: mongoose.Document) => {
        const transaction = docToJSON(d);
        // Add transaction type
        if (transaction.betType >= 10) {
          transaction.transactionType = transaction.betType === 11 ? 'SELL_YES' : 'SELL_NO';
          transaction.originalBetType = transaction.betType - 10;
        } else {
          transaction.transactionType = transaction.betType === 1 ? 'BET_YES' : 'BET_NO';
          transaction.originalBetType = transaction.betType;
        }
        return transaction;
      });
      
      res.status(200).send({
        success: true,
        data: data,
      });
    } catch (e) {
      console.log("Error fetching player market recent transactions:", e);
      res.status(500).send({
        success: false,
        error: "Failed to fetch player market recent transactions"
      });
    }
  });

  // Get player market position
  app.get("/data/player/:pid1/:pid2/market/:marketId", async (req: any, res) => {
    try {
      const pid1 = BigInt(req.params.pid1);
      const pid2 = BigInt(req.params.pid2);
      const marketId = BigInt(req.params.marketId);
      
      const doc = await PlayerMarketPositionModel.findOne({
        pid: [pid1, pid2],
        marketId: marketId
      });
      
      let data;
      if (doc) {
        data = docToJSON(doc);
      } else {
        // Return default position if not found
        data = {
          pid: [pid1.toString(), pid2.toString()],
          marketId: marketId.toString(),
          yesShares: "0",
          noShares: "0",
          claimed: false
        };
      }
      
      res.status(200).send({
        success: true,
        data: data,
      });
    } catch (e) {
      console.log("Error fetching player market position:", e);
      res.status(500).send({
        success: false,
        error: "Failed to fetch player market position"
      });
    }
  });

  // Get all player positions across markets
  app.get("/data/player/:pid1/:pid2/positions", async (req: any, res) => {
    try {
      const pid1 = BigInt(req.params.pid1);
      const pid2 = BigInt(req.params.pid2);
      
      const doc = await PlayerMarketPositionModel.find({
        pid: [pid1, pid2]
      });
      
      let data = doc.map((d) => docToJSON(d));
      
      res.status(200).send({
        success: true,
        data: data,
      });
    } catch (e) {
      console.log("Error fetching player positions:", e);
      res.status(500).send({
        success: false,
        error: "Failed to fetch player positions"
      });
    }
  });

  // Get market liquidity history for recent 100 counters (only liquidity data)
  app.get("/data/market/:marketId/liquidity", async (req: any, res) => {
    try {
      const marketId = BigInt(req.params.marketId);
      
      // Get the latest counter for this market
      const latestMarket = await MarketModel.findOne({ marketId }).sort({ counter: -1 });
      if (!latestMarket) {
        res.status(404).send({
          success: false,
          error: "Market not found"
        });
        return;
      }
      
      const latestCounter = latestMarket.counter;
      const startCounter = latestCounter - 100n < 0n ? 0n : latestCounter - 100n;
      
      // Get market data for recent 100 counters
      const doc = await MarketModel.find({
        marketId: marketId,
        counter: { $gte: startCounter, $lte: latestCounter }
      }).sort({ counter: 1 });
      
      let data = doc.map((d) => {
        const market = docToJSON(d);
        
        return {
          counter: market.counter,
          yesLiquidity: market.yesLiquidity,
          noLiquidity: market.noLiquidity,
          timestamp: market.counter // Using counter as timestamp
        };
      });
      
      res.status(200).send({
        success: true,
        data: data,
      });
    } catch (e) {
      console.log("Error fetching market liquidity history:", e);
      res.status(500).send({
        success: false,
        error: "Failed to fetch market liquidity history"
      });
    }
  });
}

service.serve();

const EVENT_MARKET_UPDATE = 1;
const EVENT_BET_UPDATE = 2;

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
        console.log("Event save error:", e);
        console.log("event ignored");
    }

    let i = 2; // start pos
    while (i < data.length) {
        let eventType = Number(data[i] >> 32n);
        let eventLength = data[i] & ((1n << 32n) - 1n);
        let eventData = data.slice(i + 1, i + 1 + Number(eventLength));
        console.log("Processing event:", eventType, eventLength, eventData);

        switch (eventType) {
            case EVENT_MARKET_UPDATE:
                {
                    console.log("market update event");
                    let market = MarketEvent.fromEvent(eventData);
                    let marketInfo = market.toObject();
                    
                    // Update market with new liquidity data
                    await MarketModel.findOneAndUpdate(
                        { marketId: marketInfo.marketId }, 
                        { 
                            $set: {
                                counter: marketInfo.counter,
                                yesLiquidity: marketInfo.yesLiquidity,
                                noLiquidity: marketInfo.noLiquidity
                            }
                        }, 
                        { upsert: false } // Don't create new markets via events
                    );
                    console.log("saved market update", market);
                }
                break;
            case EVENT_BET_UPDATE:
                {
                    console.log("bet update event");
                    let bet = BetEvent.fromEvent(eventData);
                    let betData = bet.toObject();
                    
                    // Save bet
                    let doc = new BetModel(betData);
                    await doc.save();
                    
                    // Update or create player market position
                    const positionUpdate = {
                        $inc: betData.betType >= 10 ? 
                            // Selling shares (betType 11=SELL_YES, 12=SELL_NO)
                            (betData.betType === 11 ? { yesShares: -betData.shares } : { noShares: -betData.shares }) :
                            // Buying shares (betType 1=YES, 0=NO)
                            (betData.betType === 1 ? { yesShares: betData.shares } : { noShares: betData.shares })
                    };
                    
                    await PlayerMarketPositionModel.findOneAndUpdate(
                        { 
                            pid: betData.pid,
                            marketId: betData.marketId
                        },
                        positionUpdate,
                        { upsert: true, setDefaultsOnInsert: true }
                    );
                    
                    console.log("saved bet and updated position", bet);
                }
                break;
            default:
                console.log("unknown event type:", eventType);
                // Don't exit on unknown events, just log them
                break;
        }
        i += 1 + Number(eventLength);
    }
} 
