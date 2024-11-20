const mongoose = require('mongoose');
const { generateDefaultParticipants } = require('./lib/generateParticipant');

// Схема для участников аукциона
const participantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  online: { type: Boolean, default: false },
  'Наличие комплекса мероприятий, повышающих стандарты качества изготовления': { type: String, default: 'Нет' },
  'Срок изготовления лота, дней': { type: Number, default: 0 },
  'Гарантийные обязательства, мес': { type: Number, default: 0 },
  'Условия оплаты': { type: Number, default: 0 }, // от 0 до 100 %
  'Стоимость изготовления лота, руб (без НДС)': { type: Number, default: 0 },
});

// Схема для аукциона
const auctionSchema = new mongoose.Schema({
  name: {type: String, required: true },
  participants: { type: [participantSchema], default: generateDefaultParticipants(4) },
  currentBidder: { 
    id: { type: String, default: null },
    index: { type: Number, default: null }
  },
  isActive: { type: Boolean, default: true },
  endTime: { type: Number, default: 0 },
  timeTurn: { type: Number, default: 30 },
  status: { type: String, enum: ['idle', 'create', 'active', 'ended'], default: 'create' },
  parameters: {
    type: [String],
    default: [
      'Наличие комплекса мероприятий, повышающих стандарты качества изготовления',
      'Срок изготовления лота, дней',
      'Гарантийные обязательства, мес',
      'Условия оплаты',
      'Стоимость изготовления лота, руб (без НДС)',
    ]
  },
  createdAt: { type: Date, default: Date.now },
});


const Auction = mongoose.model('Auction', auctionSchema);

module.exports = Auction;