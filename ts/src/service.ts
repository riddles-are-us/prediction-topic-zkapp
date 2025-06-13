import { Express } from "express";
import { Event, EventModel, Service, TxStateManager, TxWitness } from "zkwasm-ts-server";
import { merkleRootToBeHexString } from "zkwasm-ts-server/src/lib.js";
import { BetEvent, BetModel, MarketEvent, MarketModel, docToJSON } from "./models.js";
import mongoose from 'mongoose';

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
      console.log("timestamp is", req.params.timestamp);
      console.log("limit is", req.params.timestamp);
      let doc;
      if (forward) {
        doc = await MarketModel.find({ counter: { $gt: BigInt(req.params.timestamp) } }).limit(limit)
      } else {
        doc = await MarketModel.find({ counter: { $lt: BigInt(req.params.timestamp) } }).limit(limit)
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
