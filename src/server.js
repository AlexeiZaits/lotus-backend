const mongoose = require('mongoose');
const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const Auction = require('./auctionModel');
const {createAuction, getAuctions, deletedAuction} = require('./auctionController')
const cors = require('cors');


const app = express();
const PORT = 3000;
app.use(express.json()); // Обрабатывает JSON-запросы
const auctionConnections = new Map(); // Хранение комнат для разных аукционов
let auctions = []; // Хранение всех аукционов
const auctionTimers = new Map(); // Хранение таймеров для каждого аукциона

app.use(cors({
  origin: '*', // Разрешить запросы с любых источников
  methods: '*', // Разрешить все методы (GET, POST, PUT, DELETE, и т.д.)
  allowedHeaders: '*', // Разрешить любые заголовки
}));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const uri = "mongodb+srv://zaykuh:LCUQ4lDRbylfyGFP@lotus.cack8.mongodb.net/?retryWrites=true&w=majority&appName=lotus"

// Подключение к MongoDB
mongoose.connect(uri)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error(err));


function broadcast(data, auctionId) {
  if (auctionConnections.has(auctionId)) {
    auctionConnections.get(auctionId).forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
      }
    });
  }
}

async function loadActiveAuctions() {
  try {
    const activeAuctions = await Auction.find({ isActive: true });
    auctions = activeAuctions.map(auction => auction.toObject());
    console.log(`${auctions.length} active auctions loaded`);
  } catch (error) {
    console.error('Error loading active auctions:', error);
  }
}

const getAuction = (auctionId) => {
  const auction = auctions.find((item) => item._id.toString() === auctionId)
  if (!auction) {
    console.error('Error: Auction is undefined or not found.');
    return;
  }
  return auction
}

const setAuction = (auction, auctionId) => {
  const auctionIndex = auctions.findIndex((item) => item._id.toString() === auctionId)
  auctions[auctionIndex] = auction
}

const auctionSave = async (auctionInMemory, auctionId) => {
  const auctionFromDb = await Auction.findById(auctionId);
  if (!auctionFromDb) {
    console.error(`Auction with ID ${auctionId} not found in database`);
    return;
  }
  
  Object.assign(auctionFromDb, auctionInMemory);
  
  await auctionFromDb.save();
}

const endAuction = (auctionId) => {
  const auction = getAuction(auctionId)
  const timers = auctionTimers.get(auctionId);

  if (timers) {
    clearInterval(timers.timeTurnInterval);
    clearInterval(timers.auctionInterval);
    auctionTimers.delete(auctionId);
  }
  
  auction.status = "ended";
  auction.isActive = false;
  auctionSave(auction, auctionId)
  setAuction(auction, auctionId)
  broadcast({ type: 'AUCTION_ENDED', auction }, auctionId);
}

const nextTurn = (auctionId) => {
  const auction = getAuction(auctionId)
  if (auction.isActive) {
    const currentIndex = (auction.participants.findIndex(item => item._id.toString() === String(auction.currentBidder.id)) + 1) % auction.participants.length
    auction.currentBidder.index = currentIndex
    auction.currentBidder.id = auction.participants[currentIndex]._id.toString();
    auction.timeTurn = 30;
    broadcast({ type: 'TURN_CHANGED', currentBidder: auction.currentBidder }, auctionId);
  }
}

const placeBid = (data, userId, auctionId) => {
  const auction = getAuction(auctionId)
  if (auction.isActive && auction.currentBidder.id === String(userId) || data.parametr === "name") {
    const sanitizedUserId = userId.trim();

    const currentParticipant = auction.participants.findIndex(item => {
      return item._id.toString() === sanitizedUserId;
    });

    if (currentParticipant !== -1) {
      auction.participants[currentParticipant][data.parametr] = data.bid;
      setAuction(auction, auctionId)
      broadcast({ type: 'BID_PLACED', auction: auction }, auctionId);
    } else {
      console.error("Participant not found for userId:", sanitizedUserId);
    }
  } else {
    console.error("Conditions not met for placing a bid.");
  }
}

const startAuction = (auctionId) => {
  const auction = getAuction(auctionId)
  if (!auction) {
    console.error('Error: Auction is undefined or not found.');
    return;
  }

  auction.endTime = Date.now() + 900000; // 15 минут с текущего момента
  auction.status = "active";
  setAuction(auction, auctionId)
  broadcast({ type: 'AUCTION_STARTED', auction }, auctionId);

  if (!auctionTimers.has(auctionId)) {
    auctionTimers.set(auctionId, { timeTurnInterval: null, auctionInterval: null });
  }

  const timers = auctionTimers.get(auctionId);

  timers.timeTurnInterval = setInterval(() => {
    if (auction.timeTurn === 0){
      nextTurn(auctionId)
      setAuction(auction, auctionId)
      broadcast({ type: 'TIME_TURN', timeTurn: auction.timeTurn }, auctionId);
    } else {
      auction.timeTurn = auction.timeTurn - 1;
      setAuction(auction, auctionId)
      broadcast({ type: 'TIME_TURN', timeTurn: auction.timeTurn }, auctionId);
    }
  }, 1000)

  // Отправка оставшегося времени каждую секунду
  timers.auctionInterval = setInterval(() => {
      const timeRemaining = auction.endTime - Date.now();
      if (timeRemaining <= 0) {
        endAuction();
      } else {
        setAuction(auction, auctionId)
        broadcast({ type: 'TIME_UPDATE', timeRemaining }, auctionId);
      }
  }, 1000);
}

const disconnect = (data, auctionId) => {
  
  const auction = getAuction(auctionId)
  if (auction && auction.participants){
    const indexParticipant = auction.participants.findIndex((item) => String(item._id) === data)
    if (indexParticipant !== -1){
      auction.participants[indexParticipant].online = false;
    }
    setAuction(auction, auctionId)
    broadcast({ type: 'GET_AUCTION_DATA', auction }, auctionId);
  }
}

const getAuctionByID = (userId, auctionId) => {
  if (!auctionId) {
    console.log('NOT_ID');
    return broadcast({ type: 'ERROR', message: 'ID аукциона обязателен' }, auctionId);
  }

  try {
    const auction = getAuction(auctionId);
    if (!auction) {
      console.log('AUCTION_NOT_FOUND');
      return broadcast({ type: 'AUCTION_NOT_FOUND', auctionId }, auctionId);
    }
    

    const sanitizedUserId = userId.trim();
    const currentParticipant = auction.participants.findIndex(item => {
      return item._id.toString() === sanitizedUserId;
    });

    if (currentParticipant !== -1) {
      auction.participants[currentParticipant].online = true;
    } else {
      console.log("неправильный id");
    }

    if (!auction.currentBidder.id) {
      auction.currentBidder.id = auction.participants[0]._id.toString();
      auction.currentBidder.index = 0;
    } else {
      console.log("Текущий участник не существует");
    }

    setAuction(auction, auctionId)
    broadcast({ type: 'AUCTION_DETAILS', auction }, auctionId);

  } catch (error) {
    console.error("Server error:", error);
    broadcast({ type: 'ERROR', message: 'Ошибка сервера', details: error.message }, auctionId);
  }
};

// Функция запуска сервера
async function startServer() {
  await loadActiveAuctions(); // Загрузить активные аукционы

  wss.on('connection', (ws, req) => {
    // Извлекаем уникальные идентификаторы пользователя и аукциона
    const userId = req.url.split("?id=")[1].split("?")[0];
    const auctionId = req.url.split("auctionName=")[1];
  
    // Сохраняем данные в объекте сокета для этого пользователя
    ws.userId = userId;
    ws.auctionId = auctionId;

    if (!auctionConnections.has(auctionId)) {
      auctionConnections.set(auctionId, new Set());
    }
    auctionConnections.get(auctionId).add(ws);
    
    console.log(`User connected: ${userId}, Auction: ${auctionId}`);
    
    ws.on('message', (message) => {
      const data = JSON.parse(message);
      console.log(`Message from ${userId}:`, data);
      
      // Используем данные пользователя и аукциона
      switch (data.type) {
        case "GET_AUCTION_BY_ID":
          getAuctionByID(ws.userId, ws.auctionId);
          break;
      
        case 'START_AUCTION':
          startAuction(ws.auctionId);
          break;
  
        case 'PLACE_BID':
          placeBid(data, ws.userId, ws.auctionId);
          break;
  
        case 'NEXT_TURN':
          nextTurn(ws.auctionId);
          break;
  
        case 'DISCONNECT':
          disconnect(ws.userId, ws.auctionId);
          break;
  
        case 'END_AUCTION':
          endAuction(ws.auctionId);
          break;
  
        default:
          console.log(`Unknown message type from ${userId}:`, data.type);
      }
    });
  
    ws.on('close', () => {
      console.log(`User disconnected: ${ws.userId}, Auction: ${ws.auctionId}`);
      disconnect(ws.userId, ws.auctionId);

      if (auctionConnections.has(ws.auctionId)) {
        auctionConnections.get(ws.auctionId).delete(ws);
        // Удаляем комнату, если она пуста
        if (auctionConnections.get(ws.auctionId).size === 0) {
          auctionConnections.delete(ws.auctionId);
        }
      }
    });
  });

  app.post('/auctions', (req, res) => createAuction(req, res, auctions));
  app.get('/auctions', getAuctions);
  app.delete('/auctions/:id', deletedAuction);

  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

startServer()