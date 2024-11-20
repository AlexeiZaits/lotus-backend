const Auction = require('./auctionModel');

exports.createAuction = async (req, res, auctions) => {
  console.log(req.body)
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Имя обязательны' });
  }

  try {
    const newAuction = new Auction({ name });
    await newAuction.save();
    res.status(201).json({ message: 'Аукцион создан', auction: newAuction });
    auctions.push(newAuction.toObject())
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({ error: 'Аукцион с таким ID уже существует' });
    } else {
      res.status(500).json({ error: 'Ошибка сервера', details: error.message });
    }
  };
}

exports.getAuctions = async (_, res) => {
  try {
    const auctions = await Auction.find();
    res.status(200).json(auctions);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера', details: error.message });
  }
};

exports.deletedAuction = async (req, res) => {
  const { id } = req.params;

  try {
    const deletedAuction = await Auction.findOneAndDelete({ id });

    if (!deletedAuction) {
      return res.status(404).json({ error: 'Аукцион не найден' });
    }

    res.status(200).json({ message: 'Аукцион удалён', auction: deletedAuction });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера', details: error.message });
  }
};
